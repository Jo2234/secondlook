import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], exclude: ['tests/e2e/**', 'tests/int/**', 'tests/server/**'], maxWorkers: 1, fileParallelism: false, environment: 'node' } });
