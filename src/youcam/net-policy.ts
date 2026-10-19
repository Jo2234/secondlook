// Pure classification only. DNS/socket policy is implemented later in transport.ts.
export const API_HOSTS: readonly string[] = ['yce-api-01.makeupar.com'];
export const MEDIA_HOSTS: readonly string[] = ['yce-us.s3-accelerate.amazonaws.com'];
export type Destination = 'api' | 'media';
export function classifyUrl(text: string, destination: Destination): { allowed: true; url: URL } | { allowed: false; reason: string } {
  let url: URL;
  try { url = new URL(text); } catch { return { allowed: false, reason: 'invalid_url' }; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hostname.endsWith('.') || url.hostname.startsWith('[') || /^[\d.]+$/.test(url.hostname)) return { allowed: false, reason: 'policy' };
  if (!(destination === 'api' ? API_HOSTS : MEDIA_HOSTS).includes(url.hostname)) return { allowed: false, reason: destination === 'media' ? 'untrusted_media_host' : 'untrusted_api_host' };
  return { allowed: true, url };
}
function v4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4 || parts.some(p => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255)) return null;
  return parts.map(Number);
}
function v4Refused(parts: readonly number[]): boolean {
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224;
}
function v6(text: string): number[] | null {
  let normalized = text.toLowerCase();
  if (normalized.includes('.')) {
    const index = normalized.lastIndexOf(':');
    const tail = v4(normalized.slice(index + 1)); if (!tail) return null;
    normalized = normalized.slice(0, index + 1) + ((tail[0]! << 8) | tail[1]!).toString(16) + ':' + ((tail[2]! << 8) | tail[3]!).toString(16);
  }
  const halves = normalized.split('::'); if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
  if ([...left, ...right].some(p => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0 || halves.length === 2 && missing < 1) return null;
  return [...left.map(p => parseInt(p, 16)), ...Array<number>(missing).fill(0), ...right.map(p => parseInt(p, 16))];
}
export function isRefusedIp(address: string): boolean {
  const ipv4 = v4(address); if (ipv4) return v4Refused(ipv4);
  const p = v6(address); if (!p || p.length !== 8) return true;
  if (p.slice(0, 5).every(n => n === 0) && p[5] === 0xffff) return v4Refused([p[6]! >>> 8, p[6]! & 255, p[7]! >>> 8, p[7]! & 255]);
  return p.every(n => n === 0) || p.slice(0, 7).every(n => n === 0) && p[7] === 1 || (p[0]! & 0xfe00) === 0xfc00 || (p[0]! & 0xffc0) === 0xfe80 || (p[0]! & 0xff00) === 0xff00;
}
export const allAddressesAllowed = (addresses: readonly string[]): boolean => addresses.length > 0 && addresses.every(a => !isRefusedIp(a));
export const isRedirect = (status: number): boolean => status >= 300 && status < 400;
export const authorizationAllowed = (destination: Destination, hasAuthorization: boolean): boolean => destination === 'api' || !hasAuthorization;
