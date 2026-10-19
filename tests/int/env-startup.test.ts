// F16 process check: integration grant required. No server is started by pure tests.
import { spawn } from 'node:child_process';
import { expect, test } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { parseEnv } from '../../src/server/env.js';
test('F16 live without key exits 2 before binding', async () => {
  const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], { env: { ...process.env, YOUCAM_MODE: 'live', YOUCAM_API_KEY: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('startup did not exit')); }, 5000);
    child.stderr.on('data', b => { stderr += String(b); });
    child.once('error', e => { clearTimeout(timeout); reject(e); });
    child.once('close', code => { clearTimeout(timeout); resolve({ code, stderr }); });
  });
  expect(result).toEqual({ code: 2, stderr: 'YOUCAM_MODE=live but YOUCAM_API_KEY is not set\n' });
});
test('F16 fixture health advertises fixture and disabled buyer upload', async () => {
  const res = await createApp(parseEnv({})).request('/api/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ mode: 'fixture', buyerUpload: 'disabled' });
});
