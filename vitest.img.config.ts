import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ["tests/img/**/*.test.ts"], exclude: ['tests/e2e/**'], maxWorkers: 1, fileParallelism: false, environment: 'node' } });
