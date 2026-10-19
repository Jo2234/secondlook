import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { getRequestListener } from '@hono/node-server';
import type { HttpListener } from './http-lifetime.js';

function completion() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
interface OwnedTask { task: Promise<unknown>; done: Promise<void> }
interface NativeRequest {
  incoming: IncomingMessage; outgoing: ServerResponse; request?: Request; response?: Response; delivery?: Response;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  operations: Set<OwnedTask>; bodyCallbacks: Set<OwnedTask>;
  input: ReturnType<typeof completion>; output: ReturnType<typeof completion>;
  body: ReturnType<typeof completion>; cancelBody?: (reason: unknown) => Promise<void>;
  adapter?: Promise<void>; cancellation?: Promise<void>; done?: Promise<void>; finished: boolean;
}
/** HTTP/1 only. Own the native server BEFORE listen and the adapter task BEFORE invocation.
 * Reviewed adapter: getRequestListener's returned promise is necessary, never sufficient.
 * No adapter-private symbols, monkey patches, fire-and-forget body cancellation or new grace.
 */
export function createNativeHttpOwner(options: {
  fetch(request: Request): Promise<Response>;
  fail(error: unknown): void;
  ready(): void;
  checkpoint?: { requests: 32 | 128; sockets: 8 };
}) {
  const records = new Set<NativeRequest>(), sockets = new Map<Socket, Promise<void>>();
  let failed = false, closing = false, closed = false, listened = false, count = 0, releaseProved = false;
  let events: Parameters<HttpListener['subscribe']>[0] | undefined;
  let closeTask: Promise<void> | undefined;
  const fail = (error: unknown) => { failed = true; options.fail(error); };
  const track = <T>(record: NativeRequest, task: Promise<T>): Promise<T> => {
    let operation!: OwnedTask;
    const done = task.then(() => { record.operations.delete(operation); }, error => {
      fail(error); record.operations.delete(operation);
    });
    operation = { task, done }; record.operations.add(operation); return task;
  };
  const joinOperations = async (record: NativeRequest) => {
    while (record.operations.size) await Promise.all([...record.operations].map(operation => operation.done));
  };
  const ownBody = (record: NativeRequest, response: Response): Response => {
    record.response = response;
    if (!response.body) { record.body.resolve(); return response; }
    const reader = response.body.getReader(); record.reader = reader;
    track(record, reader.closed);
    let controller!: ReadableStreamDefaultController<Uint8Array>, ended = false;
    let cancelTask: Promise<void> | undefined;
    const release = () => {
      try { reader.releaseLock(); } catch (error) { fail(error); }
      record.body.resolve();
    };
    record.cancelBody = (reason: unknown): Promise<void> => {
      if (cancelTask) return cancelTask;
      if (ended) return Promise.resolve();
      ended = true;
      // Publish before invoking cancel. Retain its ACTUAL promise even if the adapter drops it.
      cancelTask = Promise.resolve().then(async () => {
        try { await track(record, reader.cancel(reason)); }
        finally { await joinOperations(record); release(); }
      });
      record.cancellation = cancelTask;
      // Independent observation does not replace the actual rejection returned to the adapter.
      cancelTask.then(() => undefined, fail);
      return cancelTask;
    };
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
      pull(value) {
        const task = Promise.resolve().then(async () => {
          try {
            const result = await track(record, reader.read());
            if (ended) return;
            if (result.done) { ended = true; value.close(); release(); }
            else value.enqueue(result.value);
          } catch (error) {
            fail(error); value.error(error);
            await record.cancelBody!(error);
          }
        });
        let operation!: OwnedTask;
        const done = task.then(() => { record.bodyCallbacks.delete(operation); }, error => {
          fail(error); record.bodyCallbacks.delete(operation);
        });
        operation = { task, done }; record.bodyCallbacks.add(operation); return task;
      },
      cancel(reason) { return record.cancelBody!(reason); },
    }, { highWaterMark: 0 });
    // A native close must wake a locked adapter reader as well as cancel the original reader.
    const cancelOriginal = record.cancelBody;
    record.cancelBody = reason => {
      try { controller.error(reason); } catch (error) { fail(error); }
      return cancelOriginal(reason);
    };
    const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    record.delivery = wrapped;
    if (record.outgoing.destroyed) record.cancelBody(new Error('native_response_already_closed'));
    return wrapped;
  };
  const adapter = getRequestListener(async (request, bindings) => {
    const record = [...records].find(item => item.incoming === bindings.incoming);
    if (!record) throw new Error('native_request_not_owned');
    record.request = request;
    try {
      if (options.checkpoint && (request.url !== 'http://127.0.0.1:5194' + record.incoming.url
        || request.headers.get('host') !== '127.0.0.1:5194'
        || request.headers.get('origin') !== null && request.headers.get('origin') !== 'http://127.0.0.1:5194')) {
        throw new Error('fixture_origin_refused');
      }
      return ownBody(record, await options.fetch(request));
    } catch (error) {
      fail(error);
      if (record.cancelBody) await record.cancelBody(error);
      else if (!record.reader) record.body.resolve();
      throw error;
    }
  }, {
    hostname: '127.0.0.1', overrideGlobalObjects: false, autoCleanupIncoming: false,
    errorHandler: error => { fail(error); throw error; },
  });
  const server = createServer((incoming, outgoing) => {
    const record: NativeRequest = { incoming, outgoing, operations: new Set(), bodyCallbacks: new Set(), input: completion(), output: completion(), body: completion(), finished: false };
    records.add(record); const ordinal = ++count;
    incoming.on('end', () => { if (!incoming.complete) fail(new Error('native_input_incomplete')); record.input.resolve(); });
    incoming.on('aborted', () => { fail(new Error('native_input_aborted')); });
    incoming.on('error', fail);
    incoming.on('close', () => {
      if (!incoming.complete || incoming.aborted) fail(new Error('native_input_premature_close'));
      record.input.resolve();
    });
    outgoing.on('error', fail);
    outgoing.on('finish', () => {
      record.finished = outgoing.writableFinished;
      if (!record.finished) fail(new Error('native_finish_unproved'));
      record.output.resolve();
      // Explicitly own the unread native input; disable the adapter's detached drain timers.
      if (!incoming.readableEnded && !incoming.destroyed) incoming.resume();
    });
    outgoing.on('close', () => {
      if (!record.finished || !outgoing.writableFinished) {
        const error = new Error('native_response_premature_close'); fail(error);
        record.cancelBody?.(error); // actual operation has its own retained observation
        if (!incoming.destroyed) incoming.destroy();
      }
      record.output.resolve();
    });
    record.adapter = Promise.resolve().then(async () => {
      if (options.checkpoint && ordinal > options.checkpoint.requests) throw new Error('fixture_request_cap');
      await adapter(incoming, outgoing);
    });
    const adapterDone = record.adapter.then(() => undefined, error => {
      fail(error); if (!record.reader) record.body.resolve(); outgoing.destroy(); incoming.destroy();
    });
    record.done = Promise.all([adapterDone, record.input.promise, record.output.promise, record.body.promise])
      .then(async () => {
        await joinOperations(record);
        while (record.bodyCallbacks.size) await Promise.all([...record.bodyCallbacks].map(operation => operation.done));
        // Await the real cancel settlement, not merely its reader.closed/body observation.
        if (record.cancellation) await record.cancellation.catch(fail);
        records.delete(record);
      });
    // done remains retained even if a callback throws; no unhandled rejection releases it.
    record.done.then(() => undefined, fail);
  });
  server.on('connection', socket => {
    const done = completion(); sockets.set(socket, done.promise);
    socket.on('error', fail);
    socket.once('close', () => { sockets.delete(socket); done.resolve(); });
    if (options.checkpoint && sockets.size > options.checkpoint.sockets) {
      fail(new Error('fixture_socket_cap')); socket.destroy();
    }
  });
  server.on('clientError', (error, socket) => { fail(error); socket.destroy(); });
  server.on('error', error => { events?.error(error); fail(error); });
  server.on('listening', () => { listened = true; events?.ready(); options.ready(); });
  server.on('close', () => {
    closed = true;
    // HttpLifetime's listenerClosed means the whole native bridge joined, not this event alone.
    if (!closing) { const error = new Error('native_listener_unexpected_close'); events?.error(error); fail(error); }
  });
  const joinRecords = async () => { while (records.size) await Promise.all([...records].map(record => record.done!)); };
  const joinSockets = async () => { while (sockets.size) await Promise.all([...sockets.values()]); };
  const listener: HttpListener = {
    subscribe(value) { events = value; if (listened) value.ready(); return () => { events = undefined; }; },
    close() {
      if (closeTask) return closeTask;
      closing = true;
      closeTask = Promise.resolve().then(async () => {
        const nativeClose = new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
            else { closed = true; resolve(); }
          });
          server.closeIdleConnections();
        });
        // All joins start independently. No failure skips actual native close or body/socket joins.
        const results = await Promise.allSettled([nativeClose, joinRecords(), joinSockets()]);
        for (const result of results) if (result.status === 'rejected') fail(result.reason);
        // A request arriving during close is also retained; native close is now settled.
        const finalJoins = await Promise.allSettled([joinRecords(), joinSockets()]);
        for (const result of finalJoins) if (result.status === 'rejected') fail(result.reason);
        if (failed || !closed || records.size || sockets.size) throw new Error('native_release_unknown');
        releaseProved = true;
      });
      closeTask.then(() => undefined, fail); return closeTask;
    },
  };
  return {
    server, listener,
    listen(port: number) {
      try { server.listen(port, '127.0.0.1'); }
      catch (error) { events?.error(error); fail(error); throw error; }
    },
    cancel(error: unknown) {
      // Used only for failure/deadline; cancellation never converts UNKNOWN into clean release.
      fail(error);
      for (const record of records) { record.cancelBody?.(error); record.incoming.destroy(); record.outgoing.destroy(); }
      for (const socket of sockets.keys()) socket.destroy();
    },
    status: () => ({ failed, closed, requests: records.size, sockets: sockets.size,
      released: releaseProved && !failed && closed && records.size === 0 && sockets.size === 0 }),
  };
}
