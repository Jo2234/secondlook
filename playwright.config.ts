import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Share the one owned root with worker config loads; never use a local ./data.
const tempRoot = process.env.SECONDLOOK_E2E_TEMP_ROOT ?? fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'secondlook-e2e-'));
process.env.SECONDLOOK_E2E_TEMP_ROOT = tempRoot;
export default defineConfig({
  testDir: './tests/e2e', workers: 1, fullyParallel: false,
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: { actionTimeout: 10_000, baseURL: 'http://127.0.0.1:5195', viewport: { width: 1440, height: 1000 } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm dev:fixture', stdout: 'pipe', env: { DATA_DIR: path.join(tempRoot, 'data') },
    url: 'http://127.0.0.1:5195', timeout: 60_000, reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
