import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Disposable API capability probe only. This does not exercise the product's
// allowlist or establish a download/retry result for Threads.
const repositoryRoot = resolve(import.meta.dirname, '../..');
const extensionRoot = resolve(repositoryRoot, 'dist/chrome-extension');
const outputRoot = resolve(repositoryRoot, 'artifacts/browser');
const downloadsPath = resolve(outputRoot, 'route-probe-downloads');
await mkdir(downloadsPath, { recursive: true });

const requests = [];
const routes = [];
const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    downloadsPath,
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
});
try {
    const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#517fa4' } }).jpeg().toBuffer();
    context.on('request', request => requests.push(request.url()));
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        routes.push(url.href);
        if (url.hostname === 'native-download-probe.invalid') {
            await route.fulfill({
                contentType: url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'text/plain',
                body: url.pathname.endsWith('.jpg') ? photo : 'route-control-ok'
            });
        } else if (url.protocol === 'chrome-extension:') await route.continue();
        else await route.abort();
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const page = await context.newPage();
    await page.goto('https://native-download-probe.invalid/control.txt');
    const controlText = await page.locator('body').innerText();
    const outcome = await worker.evaluate(async () => {
        let id;
        try {
            id = await chrome.downloads.download({
                url: 'https://native-download-probe.invalid/download.jpg',
                filename: 'threads-native-route-probe.jpg', saveAs: false
            });
        } catch (error) {
            return { phase: 'start', error: error.message };
        }
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const [item] = await chrome.downloads.search({ id });
            if (item && item.state !== 'in_progress') return {
                phase: 'terminal', id, state: item.state, error: item.error,
                bytesReceived: item.bytesReceived, mime: item.mime
            };
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        await chrome.downloads.cancel(id);
        return { phase: 'timeout', id };
    });
    const report = { controlText, routes, requests, outcome };
    await writeFile(resolve(outputRoot, 'native-download-route-probe.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
} finally {
    await context.close();
}
