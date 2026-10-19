import { open, mkdir, readFile, rename, unlink, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ArtifactRecoverySchema, DeletionReceiptSchema, GeneratedImageSchema, LedgerEntrySchema, ListingSchema, PreflightRecordSchema, QualityReportSchema, StoredPhotoSchema, TryOnJobSchema } from '../shared/schemas.js';
import { assertStoreBounds, emptyState } from '../youcam/workflow-state.js';
import type { WorkflowState } from '../youcam/workflow-state.js';
const stateSchema = z.object({ version: z.literal(1), seq: z.number().int().nonnegative(), observing: z.boolean(), preflight: PreflightRecordSchema.nullable(), photos: z.array(StoredPhotoSchema), qualities: z.array(QualityReportSchema), listings: z.array(ListingSchema), jobs: z.array(TryOnJobSchema), images: z.array(GeneratedImageSchema), ledger: z.array(LedgerEntrySchema), requests: z.array(z.object({ requestId: z.uuidv4(), bodyKey: z.string(), jobIds: z.array(z.string()) })), batches: z.array(z.object({ requestId: z.uuidv4(), jobIds: z.array(z.string()), deadlineAt: z.iso.datetime() })), recoveries: z.array(ArtifactRecoverySchema), buyers: z.array(z.object({ id: z.string(), expiresAt: z.iso.datetime(), photoIds: z.array(z.string()), imageIds: z.array(z.string()), jobIds: z.array(z.string()) })), receipts: z.array(DeletionReceiptSchema) });
export class StoreLocked extends Error { readonly exitCode = 3; constructor() { super('data dir locked. See README Recovering a stale data-dir lock'); } }
export interface StateStore { snapshot(): WorkflowState; commit(change: (state: WorkflowState) => WorkflowState): Promise<WorkflowState> }
export class Store implements StateStore {
  private readonly directory: string; private readonly lockId: string;
  private state: WorkflowState; private tail: Promise<unknown> = Promise.resolve(); private closed = false; private poisoned = false;
  private constructor(directory: string, lockId: string, state: WorkflowState) { this.directory = directory; this.lockId = lockId; this.state = state; }
  static async acquire(directory: string): Promise<Store> {
    const root = resolve(directory); await mkdir(root, { recursive: true });
    // These are the only two .owner.lock mutations in the application (F40).
    let lock;
    try { lock = await open(join(root, '.owner.lock'), 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreLocked(); throw error; }
    const lockId = randomUUID();
    try { await lock.writeFile(JSON.stringify({ lockId, pid: process.pid, startedAt: new Date().toISOString(), cmd: 'secondlook-server' })); await lock.sync(); }
    finally { await lock.close(); }
    await syncDirectory(root);
    let state = emptyState();
    try {
      const file = await open(join(root, 'state.json'), 'r');
      try { if ((await file.stat()).size > 32 * 1024 * 1024) throw new Error('state_too_large'); state = stateSchema.parse(JSON.parse(await file.readFile('utf8'))); assertStoreBounds(state); }
      finally { await file.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // Startup failure leaves the acquired lock for quiescent manual recovery; never steals/removes one.
    return new Store(root, lockId, state);
  }
  snapshot(): WorkflowState { return structuredClone(this.state); }
  commit(change: (state: WorkflowState) => WorkflowState): Promise<WorkflowState> {
    const result = this.tail.then(async () => {
      if (this.closed || this.poisoned) throw new Error('store_closed');
      const next = change(this.snapshot()); assertStoreBounds(next);
      if (JSON.stringify(next) === JSON.stringify(this.state)) return this.snapshot();
      next.seq = this.state.seq + 1;
      stateSchema.parse(next);
      const body = JSON.stringify(next); if (Buffer.byteLength(body) > 32 * 1024 * 1024) throw new Error('state_too_large');
      // Admission rejection throws before this point: no write, seq or partial batch.
      const temporary = await open(join(this.directory, 'state.json.tmp'), 'w', 0o600);
      try {
        await temporary.writeFile(body); await temporary.sync(); await temporary.close();
        await rename(join(this.directory, 'state.json.tmp'), join(this.directory, 'state.json')); await syncDirectory(this.directory);
        this.state = next; return this.snapshot();
      } catch (error) { this.poisoned = true; await temporary.close().catch(() => undefined); throw error; }
    });
    this.tail = result.catch(() => undefined); return result;
  }
  path(relative: string): string {
    const target = resolve(this.directory, relative);
    if (target === this.directory || !target.startsWith(this.directory + sep)) throw new Error('invalid_media_path'); return target;
  }
  async writeMedia(relative: string, bytes: Uint8Array): Promise<void> {
    const path = this.path(relative); await mkdir(dirname(path), { recursive: true }); const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await syncDirectory(dirname(path));
  }
  async removeMedia(relative: string): Promise<void> { await rm(this.path(relative), { force: true }); }
  async readMedia(relative: string): Promise<Buffer> { return readFile(this.path(relative)); }
  async cleanTmp(id: string): Promise<void> { if (!/^[0-9a-z]{20}$/.test(id)) throw new Error('invalid_id'); await rm(this.path(`tmp/${id}`), { recursive: true, force: true }); }
  async close(): Promise<void> {
    this.closed = true; await this.tail;
    if (this.poisoned) return; // Uncertain durability keeps the lock; no new owner while work is unresolved.
    const path = join(this.directory, '.owner.lock');
    let own = false;
    try { own = JSON.parse(await readFile(path, 'utf8')).lockId === this.lockId; } catch { /* preserve mismatching/partial/missing lock */ }
    if (own) { await unlink(path); await syncDirectory(this.directory); }
    else console.error('lock_mismatch_on_shutdown');
  }
}
async function syncDirectory(path: string): Promise<void> { const directory = await open(path, 'r'); try { await directory.sync(); } finally { await directory.close(); } }
