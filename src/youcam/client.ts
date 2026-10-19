import type { GarmentCategory, Mode, PreflightRecord } from '../shared/types.js';
export interface CallOptions { signal: AbortSignal }
export interface UploadInput { contentType: 'image/jpg' | 'image/png'; fileName: string; fileSize: number }
export interface UploadSlot { fileId: string; put: { url: string; headers: Record<string, string>; method: 'PUT' } }
export interface ClothBody { src_file_id: string; ref_file_id: string; garment_category: GarmentCategory; change_shoes: boolean; filter_multi_person: 'strict' }
export interface TaskResult { status: 'running' | 'success' | 'error'; engineError: string | null; errorMessage: string | null; resultUrl: string | null }
export interface YouCamClient {
  readonly mode: Mode;
  createUpload(input: UploadInput, options: CallOptions): Promise<UploadSlot>;
  putBytes(put: Pick<UploadSlot['put'], 'url' | 'headers'>, bytes: Uint8Array, options: CallOptions): Promise<void>;
  createClothTask(body: ClothBody, options: CallOptions): Promise<{ taskId: string }>;
  getClothTask(taskId: string, options: CallOptions): Promise<TaskResult>;
  download(url: string, options: CallOptions): Promise<Uint8Array>;
  featureCost(options: CallOptions): Promise<PreflightRecord['featureCost']['matched']>;
  creditBalance(options: CallOptions): Promise<number>;
}
export type ErrorKind = 'http' | 'transport' | 'timeout' | 'aborted' | 'parse' | 'policy' | 'too_large';
export class YouCamError extends Error {
  readonly kind: ErrorKind; readonly http?: number; readonly errorCode?: string; readonly retryAfterMs?: number;
  constructor(kind: ErrorKind, details: { http?: number; errorCode?: string; retryAfterMs?: number } = {}) {
    super(`youcam_${kind}`); this.name = 'YouCamError'; this.kind = kind;
    this.http = details.http; this.errorCode = details.errorCode; this.retryAfterMs = details.retryAfterMs;
  }
}
