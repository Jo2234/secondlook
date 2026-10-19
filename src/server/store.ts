import { open, mkdir, lstat, realpath, rename, unlink, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ArtifactRecoverySchema, DeletionReceiptSchema, GeneratedImageSchema, LedgerEntrySchema, ListingSchema, PreflightRecordSchema, QualityReportSchema, StoredPhotoSchema, TryOnJobSchema } from '../shared/schemas.js';
import { assertStoreBounds, emptyState } from '../youcam/workflow-state.js';
import type { WorkflowState } from '../youcam/workflow-state.js';
const stateSchema = z.object({ version: z.literal(1), seq: z.number().int().nonnegative(), observing: z.boolean(), preflight: PreflightRecordSchema.nullable(), photos: z.array(StoredPhotoSchema), qualities: z.array(QualityReportSchema), listings: z.array(ListingSchema), jobs: z.array(TryOnJobSchema), images: z.array(GeneratedImageSchema), ledger: z.array(LedgerEntrySchema), requests: z.array(z.object({ requestId: z.uuidv4(), bodyKey: z.string(), jobIds: z.array(z.string()) })), batches: z.array(z.object({ requestId: z.uuidv4(), jobIds: z.array(z.string()), deadlineAt: z.iso.datetime() })), recoveries: z.array(ArtifactRecoverySchema), buyers: z.array(z.object({ id: z.string(), expiresAt: z.iso.datetime(), photoIds: z.array(z.string()), imageIds: z.array(z.string()), jobIds: z.array(z.string()) })), receipts: z.array(DeletionReceiptSchema) });
export class StoreLocked extends Error { readonly exitCode = 3; constructor() { super('data dir locked. See README Recovering a stale data-dir lock'); } }
export type CommitStage = 'temporary_open' | 'temporary_write' | 'temporary_sync' | 'temporary_close' | 'rename' | 'directory_sync';
export class StoreCommitError extends Error {
  constructor(readonly stage: CommitStage, readonly outcome: 'not_committed' | 'unknown') { super(outcome === 'unknown' ? 'store_commit_unknown' : 'store_commit_failed'); }
}
export interface StateStore { snapshot(): WorkflowState; commit(change: (state: WorkflowState) => WorkflowState): Promise<WorkflowState> }

/** Fixed data only. These are logical Store reservations, NOT native/physical disk or RSS limits. */
export interface CheckpointStorePolicy {
  freshOnly: true; lockBytes: 4096; stateBytes: 2097152; mediaBytes: 2097152;
  totalWriteBytes: 29360128; fileCreations: 16; directories: 8;
}
export const CHECKPOINT_STORE_POLICY: Readonly<CheckpointStorePolicy> = Object.freeze({
  freshOnly: true, lockBytes: 4096, stateBytes: 2097152, mediaBytes: 2097152,
  totalWriteBytes: 29360128, fileCreations: 16, directories: 8,
});
export function captureCheckpointStorePolicy(value: CheckpointStorePolicy): Readonly<CheckpointStorePolicy> {
  const captured = { ...value };
  for (const key of Object.keys(CHECKPOINT_STORE_POLICY) as (keyof CheckpointStorePolicy)[]) {
    if (captured[key] !== CHECKPOINT_STORE_POLICY[key]) throw new Error('store_checkpoint_policy');
  }
  if (Object.keys(captured).length !== Object.keys(CHECKPOINT_STORE_POLICY).length) throw new Error('store_checkpoint_policy');
  return Object.freeze(captured);
}
type WriteRole = 'lock' | 'state' | 'media';
/** One charge per payload-bearing open attempt (including temp rewrites), no refunds ever.
 * One directory charge per mkdir attempt; checkpoint media parents are created once and shared.
 * Ancestors and native/capture writes are outside this counter. Reservations precede open/write.
 */
export class StoreWriteBudget {
  readonly policy: Readonly<CheckpointStorePolicy>;
  private bytes = 0; private files = 0; private directories = 0;
  constructor(policy: CheckpointStorePolicy) { this.policy = captureCheckpointStorePolicy(policy); }
  reserveWrite(role: WriteRole, bytes: number): void {
    const cap = role === 'lock' ? this.policy.lockBytes : role === 'state' ? this.policy.stateBytes : this.policy.mediaBytes;
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > cap
      || this.bytes + bytes > this.policy.totalWriteBytes || this.files + 1 > this.policy.fileCreations) throw new Error('store_write_budget');
    this.bytes += bytes; this.files++;
  }
  reserveDirectory(): void {
    if (this.directories + 1 > this.policy.directories) throw new Error('store_directory_budget');
    this.directories++;
  }
  status() { return { bytes: this.bytes, files: this.files, directories: this.directories }; }
}
export type StoreIOOperation = 'acquire' | 'commit' | 'lock_proof' | 'lock_unlink' | 'read' | 'write_media' | 'remove_media' | 'clean_tmp' | 'directory_sync' | 'close';
export class StoreIOError extends Error {
  constructor(readonly operation: StoreIOOperation) { super('store_io_UNKNOWN'); }
}
interface Closable { close(): Promise<void> }
interface RetainedOperation { task: Promise<unknown>; done: Promise<void>; settled: boolean; error?: unknown }
interface RetainedHandle { closeTask?: Promise<void> }
// Strong module roots also cover default/standalone acquire rejection before Store fulfillment.
// A rejected owner is never removed, retried, or treated as a GC/disappearing-fd proof.
const residentIOOwners = new Set<object>();
export function residentStoreIOOwnerCount(): number { return residentIOOwners.size; }
/** Pure ownership primitive: callbacks are published before invocation; no filesystem overrides. */
export class RetainedStoreIO<H extends Closable> {
  private readonly handles = new Map<H, RetainedHandle>();
  private readonly operations = new Set<RetainedOperation>();
  private readonly faults: { operation: StoreIOOperation; error: unknown }[] = [];
  private released = false;
  constructor() { residentIOOwners.add(this); }
  assertHealthy(): void { if (this.faults.length || this.released) throw new StoreIOError('acquire'); }
  remember(operation: StoreIOOperation, error: unknown): void { this.faults.push({ operation, error }); residentIOOwners.add(this); }
  capture(handle: H): H { if (!this.handles.has(handle)) this.handles.set(handle, {}); return handle; }
  run<T>(operation: StoreIOOperation, work: () => T | PromiseLike<T>): Promise<T> {
    let record!: RetainedOperation;
    const task = Promise.resolve().then(() => {
      if (this.released) throw new StoreIOError(operation);
      return work();
    });
    const observed = task.then(value => value, error => {
      record.error = error; this.remember(operation, error);
      if (error instanceof StoreCommitError || error instanceof StoreLocked || error instanceof StoreIOError) throw error;
      throw new StoreIOError(operation);
    });
    const done = observed.then(() => { record.settled = true; this.operations.delete(record); }, () => { record.settled = true; });
    record = { task, done, settled: false }; this.operations.add(record);
    return observed;
  }
  closeHandle(handle: H): Promise<void> {
    const record = this.handles.get(handle);
    if (!record) return Promise.reject(new StoreIOError('close'));
    if (record.closeTask) return record.closeTask; // return original outcome, never a second actual close
    record.closeTask = this.run('close', () => handle.close()).then(() => { this.handles.delete(handle); });
    record.closeTask.then(() => undefined, () => undefined);
    return record.closeTask;
  }
  async use<T>(handle: H, operation: StoreIOOperation, work: (handle: H) => Promise<T>): Promise<T> {
    const [result] = await Promise.allSettled([this.run(operation, () => work(handle))]);
    const [closed] = await Promise.allSettled([this.closeHandle(handle)]);
    // Both actual outcomes have been captured, even when work AND close reject.
    if (result.status === 'rejected') throw result.reason;
    if (closed.status === 'rejected') throw closed.reason;
    return result.value;
  }
  async join(): Promise<void> {
    for (;;) {
      const pending = [...this.operations].filter(record => !record.settled);
      if (!pending.length) break;
      await Promise.all(pending.map(record => record.done));
    }
    if (this.faults.length || this.handles.size) throw new StoreIOError('close');
  }
  release(): void {
    if (this.faults.length || this.handles.size || this.operations.size) throw new StoreIOError('close');
    this.released = true; residentIOOwners.delete(this);
  }
  status() { return { unknown: this.faults.length > 0, faults: this.faults.length, handles: this.handles.size,
    pending: [...this.operations].filter(record => !record.settled).length, retainedOperations: this.operations.size, released: this.released }; }
}
/** Injected byte/identity primitive; caller owns and independently closes the captured handle. */
export async function readBoundedStoreData(cap: number, actions: {
  size(): Promise<number>; read(bytes: Uint8Array, offset: number, remaining: number): Promise<number>; unchanged(): Promise<boolean>;
}): Promise<Uint8Array> {
  if (!Number.isSafeInteger(cap) || cap < 0 || cap > 32 * 1024 * 1024) throw new Error('store_read_cap');
  const size = await actions.size();
  if (!Number.isSafeInteger(size) || size < 0 || size > cap) throw new Error('store_read_cap');
  const bytes = new Uint8Array(cap + 1); let used = 0, eof = false;
  while (used < bytes.length) {
    const count = await actions.read(bytes, used, bytes.length - used);
    if (!Number.isSafeInteger(count) || count < 0 || count > bytes.length - used) throw new Error('store_read_count');
    if (count === 0) { eof = true; break; }
    used += count;
  }
  if (!eof || used !== size || used > cap) throw new Error('store_read_eof');
  if (!await actions.unchanged()) throw new Error('store_read_identity');
  return bytes.subarray(0, used);
}
export async function closeOwnedStoreLock(actions: {
  prove(): Promise<boolean>; unlink(): Promise<void>; sync(): Promise<void>; join(): Promise<void>;
}): Promise<void> {
  if (!await actions.prove()) throw new Error('store_lock_UNKNOWN');
  await actions.unlink(); await actions.sync(); await actions.join();
}
export function matchesOwnedStoreLock(bytes: Uint8Array, body: string): boolean {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes) === body;
}
/** The callback is a primitive only; production supplies its one actual mkdir, never an option. */
export async function createStoreDirectory(checkpoint: boolean, create: (recursive: boolean) => Promise<unknown>): Promise<void> {
  await create(!checkpoint); // no adoption/fallback on EEXIST
}
function sameIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return (['dev', 'ino', 'size', 'mode', 'uid', 'gid', 'mtimeNs', 'ctimeNs', 'nlink'] as const).every(key => a[key] === b[key]);
}
function regular(s: BigIntStats, cap: number): void {
  if (!s.isFile() || s.nlink !== 1n || s.size < 0n || s.size > BigInt(cap)) throw new Error('store_read_metadata');
}
export class StoreIOOwner extends RetainedStoreIO<FileHandle> {
  readonly budget: StoreWriteBudget | undefined;
  readonly checkpoint: Readonly<CheckpointStorePolicy> | undefined;
  private acquisition: { directory: string; lockBody?: string; lockIdentity?: BigIntStats; store?: Store } | undefined;
  constructor(policy?: CheckpointStorePolicy) {
    super();
    // Factory captures/validates data before construction; standalone invalid construction owns no IO.
    this.budget = policy ? new StoreWriteBudget(policy) : undefined;
    this.checkpoint = this.budget?.policy;
  }
  beginAcquisition(directory: string): void {
    if (this.acquisition) throw new StoreIOError('acquire');
    this.acquisition = { directory };
  }
  retainLock(body: string, identity?: BigIntStats): void {
    this.acquisition!.lockBody = body;
    if (identity) this.acquisition!.lockIdentity = identity;
  }
  retainStore(store: Store): void { this.acquisition!.store = store; }
  async syncDirectory(path: string): Promise<void> {
    await this.run('directory_sync', async () => {
      const file = this.capture(await open(path, 'r'));
      await this.use(file, 'directory_sync', directory => directory.sync());
    });
  }
  async readOwned(path: string, cap: number, expected?: BigIntStats, optional = false): Promise<Uint8Array | undefined> {
    return this.run('read', async () => {
      let pre: BigIntStats;
      try { pre = await lstat(path, { bigint: true }); }
      catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
      regular(pre, cap);
      if (expected && !sameIdentity(expected, pre)) throw new Error('store_read_identity');
      if (await realpath(path) !== resolve(path)) throw new Error('store_read_alias');
      const file = this.capture(await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)));
      // No fallible work between actual open fulfillment and capture.
      const bytes = await this.use(file, 'read', async handle => {
        const before = await handle.stat({ bigint: true }); regular(before, cap);
        if (!sameIdentity(pre, before)) throw new Error('store_read_identity');
        return readBoundedStoreData(cap, {
          size: async () => Number(before.size),
          read: async (target, offset, remaining) => (await handle.read(target, offset, remaining, offset)).bytesRead,
          unchanged: async () => {
            const after = await handle.stat({ bigint: true }), post = await lstat(path, { bigint: true }); regular(post, cap);
            return sameIdentity(before, after) && sameIdentity(before, post) && await realpath(path) === resolve(path);
          },
        });
      });
      return bytes; // usable only AFTER the actual close fulfilled
    });
  }
  async readFixtureScenarios(): Promise<string> {
    const bytes = await this.readOwned(resolve('fixtures/scenarios.json'), 65536);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes!);
  }
}
export class Store implements StateStore {
  private state: WorkflowState; private tail: Promise<unknown> = Promise.resolve(); private closed = false;
  private failure: StoreCommitError | null = null; private closeTask: Promise<void> | undefined;
  private readonly mediaDirectories = new Map<string, Promise<void>>();
  private constructor(private readonly directory: string, private readonly lockBody: string,
    private readonly lockIdentity: BigIntStats, state: WorkflowState, private readonly io: StoreIOOwner) { this.state = state; }
  static acquire(directory: string, io = new StoreIOOwner()): Promise<Store> {
    return io.run('acquire', async () => {
      io.assertHealthy();
      const root = resolve(directory);
      io.beginAcquisition(root); // resident metadata survives even an acquisition rejection
      io.budget?.reserveDirectory();
      await createStoreDirectory(!!io.checkpoint, recursive => mkdir(root, { recursive, ...(io.checkpoint ? { mode: 0o700 } : {}) }));
      const lockBody = JSON.stringify({ lockId: randomUUID(), pid: process.pid, startedAt: new Date().toISOString(), cmd: 'secondlook-server' });
      if (Buffer.byteLength(lockBody) > 4096) throw new Error('store_lock_cap');
      io.budget?.reserveWrite('lock', Buffer.byteLength(lockBody));
      let lock: FileHandle;
      try { lock = io.capture(await open(join(root, '.owner.lock'), 'wx', 0o600)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreLocked(); throw error; }
      io.retainLock(lockBody);
      const lockIdentity = await io.use(lock, 'acquire', async file => { await file.writeFile(lockBody); await file.sync(); return file.stat({ bigint: true }); });
      io.retainLock(lockBody, lockIdentity);
      await io.syncDirectory(root);
      let state = emptyState();
      if (!io.checkpoint) {
        const bytes = await io.readOwned(join(root, 'state.json'), 32 * 1024 * 1024, undefined, true);
        if (bytes) { state = stateSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); assertStoreBounds(state); }
      }
      // Failure retains lock and IO owner for quiescent manual recovery, never steals/removes one.
      const store = new Store(root, lockBody, lockIdentity, state, io);
      io.retainStore(store);
      if (io.checkpoint) store.assertFreshCheckpoint();
      return store;
    });
  }
  assertFreshCheckpoint(): void {
    if (this.io.checkpoint && JSON.stringify(this.state) !== JSON.stringify(emptyState())) throw new Error('store_checkpoint_not_empty');
  }
  snapshot(): WorkflowState { return structuredClone(this.state); }
  assertWritable(): void {
    if (this.failure) throw this.failure;
    if (this.closed) throw new Error('store_closed');
    this.io.assertHealthy();
  }
  commit(change: (state: WorkflowState) => WorkflowState): Promise<WorkflowState> {
    // Publish in IO before invoking work, preserving the original serialized commit tail.
    const previous = this.tail;
    const result = this.io.run('commit', async () => { await previous; return this.commitWork(change); });
    this.tail = result.catch(() => undefined); return result;
  }
  private async commitWork(change: (state: WorkflowState) => WorkflowState): Promise<WorkflowState> {
    this.assertWritable();
    const next = change(this.snapshot()); assertStoreBounds(next);
    if (JSON.stringify(next) === JSON.stringify(this.state)) return this.snapshot();
    next.seq = this.state.seq + 1; stateSchema.parse(next);
    const body = JSON.stringify(next), size = Buffer.byteLength(body);
    if (size > (this.io.checkpoint?.stateBytes ?? 32 * 1024 * 1024)) throw new Error('state_too_large');
    let stage: CommitStage = 'temporary_open'; let temporary: FileHandle | undefined;
    try {
      this.io.budget?.reserveWrite('state', size);
      temporary = this.io.capture(await open(join(this.directory, 'state.json.tmp'), 'w', 0o600));
      stage = 'temporary_write'; await temporary.writeFile(body);
      stage = 'temporary_sync'; await temporary.sync();
      stage = 'temporary_close'; const closing = temporary; temporary = undefined; await this.io.closeHandle(closing);
      stage = 'rename'; await rename(join(this.directory, 'state.json.tmp'), join(this.directory, 'state.json'));
      stage = 'directory_sync'; await this.io.syncDirectory(this.directory);
      this.state = next; return this.snapshot();
    } catch (error) {
      this.io.remember('commit', error);
      this.failure = new StoreCommitError(stage, stage === 'rename' || stage === 'directory_sync' ? 'unknown' : 'not_committed');
      if (temporary) {
        // Attempt once even after write/sync failure; capture close rejection independently.
        const [closed] = await Promise.allSettled([this.io.closeHandle(temporary)]);
        if (closed.status === 'rejected') throw closed.reason;
      }
      throw this.failure;
    }
  }
  path(relative: string): string {
    const target = resolve(this.directory, relative);
    if (target === this.directory || !target.startsWith(this.directory + sep)) throw new Error('invalid_media_path'); return target;
  }
  private mediaPath(relative: string): string {
    if (this.io.checkpoint && !/^(photos|generated)\/[0-9a-f]{20}\.jpg$/.test(relative)) throw new Error('invalid_media_path');
    return this.path(relative);
  }
  private ensureMediaDirectory(path: string): Promise<void> {
    if (!this.io.checkpoint) return mkdir(path, { recursive: true }).then(() => undefined);
    let task = this.mediaDirectories.get(path);
    if (!task) {
      this.io.budget!.reserveDirectory();
      task = Promise.resolve().then(async () => { await mkdir(path, { recursive: false, mode: 0o700 }); });
      this.mediaDirectories.set(path, task);
    }
    return task;
  }
  writeMedia(relative: string, bytes: Uint8Array): Promise<void> {
    return this.io.run('write_media', async () => {
      this.assertWritable(); const path = this.mediaPath(relative);
      this.io.budget?.reserveWrite('media', bytes.byteLength);
      // Copy checkpoint input after its cap/reservation, before await/caller mutation.
      const data = this.io.checkpoint ? new Uint8Array(bytes) : bytes;
      await this.ensureMediaDirectory(dirname(path)); this.assertWritable();
      const file = this.io.capture(await open(path, 'wx', 0o600));
      await this.io.use(file, 'write_media', async handle => { await handle.writeFile(data); await handle.sync(); });
      await this.io.syncDirectory(dirname(path));
    });
  }
  removeMedia(relative: string): Promise<void> {
    return this.io.run('remove_media', async () => { this.assertWritable(); await rm(this.mediaPath(relative), { force: true }); });
  }
  readMedia(relative: string): Promise<Buffer> {
    return this.io.run('read', async () => {
      this.assertWritable(); const path = this.mediaPath(relative);
      if (this.io.checkpoint) return Buffer.from((await this.io.readOwned(path, this.io.checkpoint.mediaBytes))!);
      const file = this.io.capture(await open(path, 'r'));
      return this.io.use(file, 'read', handle => handle.readFile());
    });
  }
  cleanStartupTmp(): Promise<void> {
    return this.io.run('clean_tmp', async () => { this.assertWritable(); await rm(this.path('tmp'), { recursive: true, force: true }); });
  }
  cleanTmp(id: string): Promise<void> {
    return this.io.run('clean_tmp', async () => {
      this.assertWritable(); if (!/^[0-9a-z]{20}$/.test(id)) throw new Error('invalid_id');
      await rm(this.path(`tmp/${id}`), { recursive: true, force: true });
    });
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closed = true;
    // NOT an IO operation: joining that operation from itself would deadlock.
    this.closeTask = Promise.resolve().then(async () => {
      await this.tail; await this.io.join();
      if (this.failure) throw this.failure;
      const path = join(this.directory, '.owner.lock');
      await closeOwnedStoreLock({
        prove: () => this.io.run('lock_proof', async () => {
          const bytes = await this.io.readOwned(path, 4096, this.lockIdentity);
          if (!matchesOwnedStoreLock(bytes!, this.lockBody)) throw new Error('store_lock_UNKNOWN');
          // Require the entire original tiny payload, not merely an adopted lockId.
          return true;
        }),
        unlink: () => this.io.run('lock_unlink', async () => {
          if (!sameIdentity(this.lockIdentity, await lstat(path, { bigint: true }))) throw new Error('store_lock_UNKNOWN');
          await unlink(path);
        }),
        sync: () => this.io.syncDirectory(this.directory), join: () => this.io.join(),
      });
      this.io.release();
    });
    this.closeTask.then(() => undefined, () => undefined); return this.closeTask;
  }
}
