import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ resolve: { preserveSymlinks: true, alias: { '@': resolve(process.cwd()) } }, test: { pool: 'threads', environment: 'node', include: ['test/integration/manualOrder.postgres.ts'], maxWorkers: 1, testTimeout: 20000, hookTimeout: 20000 } });
