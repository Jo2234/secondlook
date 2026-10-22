import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Mirrors vitest.int.config.ts: each integration file gets a new store root.
function discover(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? discover(file) : entry.name.endsWith('.test.ts') ? [file] : [];
  });
}
const available = ['tests/int', 'tests/server', 'tests/contract'].flatMap(discover).sort();
const requested = process.argv.slice(2).map(file => path.normalize(file));
if (requested.some(file => !available.includes(file))) {
  console.error('Unknown integration test file:', requested.filter(file => !available.includes(file)).join(', '));
  process.exit(1);
}
const files = requested.length ? available.filter(file => requested.includes(file)) : available;
const results = [];
for (const file of files) {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'secondlook-int-'));
  try {
    const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.int.config.ts', file], {
      env: { ...process.env, YOUCAM_INT_DATA_DIR: path.join(tmp, 'data') },
      timeout: 180_000, stdio: 'inherit',
    });
    results.push({ file, 'exit status': result.status, 'signal/timeout': result.error?.code ?? result.signal ?? '—' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
console.table(results);
process.exitCode = !files.length || results.some(result => result['exit status'] !== 0) ? 1 : 0;
