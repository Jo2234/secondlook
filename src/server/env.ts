import { readFileSync } from 'node:fs';
import { parseEnv } from '../shared/env.js';
export { EnvError, parseEnv } from '../shared/env.js';
export type { AppEnv } from '../shared/env.js';
export function loadEnv(raw: Readonly<Record<string, string | undefined>> = process.env) {
  let disposition = '';
  try { disposition = readFileSync('docs/decisions/PC-1-disposition.md', 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return parseEnv(raw, disposition);
}
