import { YouCamError } from './client.js';
import { ENGINE_ERRORS, HTTP_ERRORS } from '../domain/errors.js';
export function safeUrl(value: string): string {
  try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return '[invalid URL]'; }
}
export function safeHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !/^(authorization|proxy-authorization|cookie|set-cookie)$/i.test(key)).map(([key, value]) => [key, /signature|token|secret|key/i.test(key) ? '[redacted]' : value]));
}
export const shortId = (id: string): string => `${id.slice(0, 8)}…`;
// Never forward upstream messages, stack traces, raw bodies, headers or presigned URLs.
export function safeError(error: unknown): { kind: string; http?: number; errorCode?: string } {
  if (!(error instanceof YouCamError)) return { kind: 'internal' };
  return { kind: error.kind, ...(error.http === undefined ? {} : { http: error.http }),
    ...(error.errorCode && (Object.hasOwn(ENGINE_ERRORS, error.errorCode) || Object.hasOwn(HTTP_ERRORS, error.errorCode)) ? { errorCode: error.errorCode } : {}) };
}
