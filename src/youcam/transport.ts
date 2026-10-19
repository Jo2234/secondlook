import { Agent, request } from 'node:https';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { allAddressesAllowed, authorizationAllowed, classifyUrl, isRedirect } from './net-policy.js';
import type { Destination } from './net-policy.js';
import { YouCamError } from './client.js';
import { bounded, checkSignal } from './operations.js';
import { NORMALIZED_MAX_BYTES } from './limits.js';
export interface TransportRequest { url: string; destination: Destination; method: 'GET' | 'POST' | 'PUT'; headers: Record<string, string>; body?: Uint8Array; signal: AbortSignal; timeoutMs: number; maxBytes: number }
export interface TransportResponse { status: number; headers: Readonly<Record<string, string | string[] | undefined>>; bytes: Uint8Array }
export interface Transport { send(input: TransportRequest): Promise<TransportResponse>; close(): void }
const policyLookup: LookupFunction = (host, options, callback) => {
  lookup(host, { all: true }).then(addresses => {
    if (!allAddressesAllowed(addresses.map(a => a.address))) { callback(new YouCamError('policy'), []); return; }
    if (options.all) callback(null, addresses);
    else { const address = addresses.find(a => !options.family || a.family === options.family); if (!address) callback(new YouCamError('policy'), []); else callback(null, address.address, address.family); }
  }, () => callback(new YouCamError('transport'), []));
};
export function createHttpsTransport(): Transport {
  // Transport socket concurrency 2; runner attempt concurrency 1 is a distinct limit.
  const agent = new Agent({ keepAlive: true, maxSockets: 2 });
  return {
    close: () => agent.destroy(),
    async send(input) {
      const classified = classifyUrl(input.url, input.destination);
      if (!classified.allowed || !authorizationAllowed(input.destination, Object.keys(input.headers).some(k => k.toLowerCase() === 'authorization'))) throw new YouCamError('policy');
      if (input.body && input.body.byteLength >= NORMALIZED_MAX_BYTES) throw new YouCamError('too_large');
      checkSignal(input.signal);
      return bounded(input.signal, input.timeoutMs, signal => new Promise<TransportResponse>((resolve, reject) => {
        let settled = false, status: number | undefined;
        const fail = (error: unknown) => {
          if (settled) return; settled = true;
          reject(error instanceof YouCamError ? error : new YouCamError(signal.aborted ? 'aborted' : 'transport', status === undefined ? {} : { http: status }));
        };
        const req = request(classified.url, { method: input.method, headers: input.headers, agent, lookup: policyLookup, signal }, response => {
          status = response.statusCode;
          if (status === undefined) { fail(new YouCamError('transport')); response.destroy(); return; }
          if (isRedirect(status)) { fail(new YouCamError('policy', { errorCode: 'redirect_refused' })); response.destroy(); req.destroy(); return; }
          const parts: Buffer[] = []; let size = 0;
          response.on('data', (part: Buffer) => {
            size += part.length;
            if (size > input.maxBytes) { fail(new YouCamError('too_large', { http: status })); response.destroy(); req.destroy(); return; }
            parts.push(part);
          });
          response.once('error', fail); response.once('aborted', () => fail(new YouCamError('transport')));
          response.once('end', () => {
            if (settled) return;
            if (!response.complete) { fail(new YouCamError('transport')); return; }
            settled = true; resolve({ status: status!, headers: response.headers, bytes: Buffer.concat(parts, size) });
          });
        });
        req.once('error', fail);
        if (input.body) req.end(input.body); else req.end();
      }));
    },
  };
}
