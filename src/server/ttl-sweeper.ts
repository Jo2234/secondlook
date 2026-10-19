import type { DeletionReceipt } from '../shared/types.js';
import { COPY } from '../shared/copy.js';
import type { Store } from './store.js';
export const RETENTION_SOURCE = 'https://docs.perfectcorp.com/develop/file_retention_period';
/** Finite explicit sweep; caller owns scheduling and awaits completion (no detached timer). */
export async function deleteBuyer(store: Store, sessionId: string, at: string): Promise<DeletionReceipt> {
  const existing = store.snapshot().receipts.find(r => r.sessionId === sessionId); if (existing) return existing;
  const state = store.snapshot(), buyer = state.buyers.find(b => b.id === sessionId);
  const photos = state.photos.filter(p => p.role === 'buyer' && buyer?.photoIds.includes(p.id));
  const images = state.images.filter(i => i.buyerSessionId === sessionId);
  const jobs = state.jobs.filter(j => j.buyerSessionId === sessionId);
  const receipt: DeletionReceipt = { sessionId, deletedAt: at, deletedLocal: [...photos.map(p => ({ kind: 'buyer_photo' as const, id: p.id, sha256: p.normalized.sha256 })), ...images.map(i => ({ kind: 'generated_image' as const, id: i.id, sha256: i.sha256 }))], retainedByVendor: { fileIds: [...new Set(jobs.flatMap(j => j.attempts.flatMap(a => [a.srcFileId, a.refFileId].filter((v): v is string => v !== null))))], taskIds: [...new Set(jobs.flatMap(j => j.attempts.flatMap(a => a.taskId ? [a.taskId] : [])))], statement: COPY.retention.vendor, source: RETENTION_SOURCE } };
  // Idempotent unlink first; startup/request sweep completes a crash-interrupted deletion.
  for (const photo of photos) await store.removeMedia(photo.normalized.path);
  for (const image of images) await store.removeMedia(image.disclosedPath);
  await store.commit(next => {
    if (next.receipts.some(r => r.sessionId === sessionId)) return next;
    next.photos = next.photos.filter(p => !photos.some(deleted => deleted.id === p.id));
    next.images = next.images.filter(i => i.buyerSessionId !== sessionId); next.buyers = next.buyers.filter(b => b.id !== sessionId);
    next.receipts.push(receipt); return next;
  }); return receipt;
}
export async function sweepExpired(store: Store, now: number): Promise<void> {
  for (const buyer of store.snapshot().buyers.filter(b => Date.parse(b.expiresAt) <= now)) await deleteBuyer(store, buyer.id, new Date(now).toISOString());
}
