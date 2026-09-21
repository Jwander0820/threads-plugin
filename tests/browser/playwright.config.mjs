import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
    testDir: '.',
    testMatch: '**/*.spec.mjs',
    timeout: 30000,
    expect: { timeout: 8000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [
        ['list'],
        ['json', { outputFile: resolve(import.meta.dirname, '../../artifacts/browser/report.json') }]
    ],
    outputDir: '../../artifacts/browser/results',
    use: { viewport: { width: 1280, height: 1000 } }
});
