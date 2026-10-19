import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ["tests/int/**/*.test.ts", "tests/contract/**/*.test.ts", "tests/server/**/*.test.ts"], exclude: ['tests/e2e/**'], maxWorkers: 1, fileParallelism: false, environment: 'node' } });
