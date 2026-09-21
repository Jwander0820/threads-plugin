import { test as base, chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { fixtureHtml, ORIGIN } from './threads-fixture.mjs';

const extensionRoot = resolve(import.meta.dirname, '../../dist/chrome-extension');

export const test = base.extend({
    context: async ({}, use, testInfo) => {
        // A new disposable profile for every case; never use a person's Chrome profile.
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: !process.env.PW_HEADED,
            viewport: { width: 1280, height: 1000 },
            args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
        });
        const errors = [];
        const blockedRequests = [];
        context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#517fa4' } }).jpeg().toBuffer();
        await context.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (url.origin === ORIGIN && route.request().resourceType() === 'document') {
                await route.fulfill({ contentType: 'text/html', body: fixtureHtml(url.pathname) });
            } else if (url.origin === ORIGIN && url.pathname === '/favicon.ico') {
                await route.fulfill({ status: 204 });
            } else if (url.hostname === 'scontent.cdninstagram.com' && url.pathname.endsWith('.jpg')) {
                await route.fulfill({ contentType: 'image/jpeg', body: photo });
            } else if (url.hostname === 'scontent.cdninstagram.com' && url.pathname.endsWith('.mp4')) {
                // Native video element and poster are sufficient for this discovery
                // fixture. This does not claim playback or real CDN download coverage.
                await route.fulfill({ status: 204 });
            } else if (url.protocol === 'chrome-extension:') {
                await route.continue();
            } else {
                blockedRequests.push(url.href);
                await route.abort();
            }
        });
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
        try {
            await use(context);
            expect(errors, 'No uncaught errors in the extension or fixture pages').toEqual([]);
            expect(blockedRequests, 'Fixture cases must not depend on live services').toEqual([]);
        } finally {
            if (testInfo.status !== testInfo.expectedStatus) {
                await context.tracing.stop({ path: testInfo.outputPath('trace.zip') });
                for (const [index, page] of context.pages().entries()) {
                    if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath(`page-${index}.png`), fullPage: true }).catch(() => {});
                }
            } else {
                await context.tracing.stop();
            }
            await context.close();
        }
    },
    extensionWorker: async ({ context }, use) => {
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        await use(worker);
    },
    optionsPage: async ({ context, extensionWorker }, use) => {
        const extensionId = new URL(extensionWorker.url()).host;
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/options.html`);
        await expect(page.locator('#consent-status')).not.toContainText('讀取中');
        await use(page);
    }
});

export { expect };

export async function acceptDisclosure(page, path) {
    await page.goto(`${ORIGIN}${path}`);
    await expect(page.locator('.tm-post-media-tool-button')).toHaveCount(0);
    await page.locator('#threads-plugin-disclosure-v1 [data-action="accept"]').click();
    await expect(page.locator('#threads-plugin-disclosure-v1')).toHaveCount(0);
    await expect(page.locator('.tm-post-media-tool-button')).toHaveCount(1);
}
