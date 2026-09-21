import { test, expect, acceptDisclosure } from './extension-fixtures.mjs';
import { MIXED_PATH, REPLY_PATH, NEXT_PATH, EMPTY_PATH, UNRESOLVED_PATH, ORIGIN, REPLY_TEXT } from './threads-fixture.mjs';

const modalSelector = '#tm-post-media-modal';

const featureControls = [
    { option: 'enableCopyOriginalLink', id: 'enable-copy-original-link', tool: '.tm-post-link-tool-button' },
    { option: 'enableCopyPostText', id: 'enable-copy-post-text', tool: '.tm-post-copy-tool-button' },
    { option: 'enableBatchMediaDownload', id: 'enable-batch-media-download', tool: '.tm-post-media-tool-button' },
    { option: 'enablePerMediaDownload', id: 'enable-per-media-download', tool: '.tm-target-download-button' }
];

async function saveFeatureSettings(optionsPage, extensionWorker, enabled) {
    for (const [index, feature] of featureControls.entries()) {
        await optionsPage.locator(`#${feature.id}`).setChecked(enabled[index]);
    }
    await optionsPage.locator('#options-form button[type="submit"]').click();
    await expect.poll(() => extensionWorker.evaluate(async (names) => {
        const { options } = await chrome.storage.local.get('options');
        return names.map(name => options?.[name]);
    }, featureControls.map(feature => feature.option))).toEqual(enabled);
}

async function expectFeatureTools(page, enabled) {
    // Moving away before hovering ensures a real pointer event after every hot update.
    await page.locator('nav').hover();
    await page.locator('article img').first().hover();
    for (const [index, feature] of featureControls.entries()) {
        await expect(page.locator(feature.tool), feature.option).toHaveCount(enabled[index] ? 1 : 0);
    }
    if (enabled[3]) await expect(page.locator('.tm-target-download-button')).toBeVisible();
}

test('real extension merges a mixed carousel in order and preserves selection and keyboard focus', async ({ page, extensionWorker }, testInfo) => {
    const manifest = await extensionWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts[0].js).toContain('content.js');
    await acceptDisclosure(page, MIXED_PATH);
    const tool = page.locator('.tm-post-media-tool-button');
    await tool.click();
    const modal = page.locator(modalSelector);
    const rows = modal.locator('.tm-item');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Photo 1');
    await expect(rows.nth(1)).toContainText('Video 2');
    await expect(rows.nth(2)).toContainText('Photo 3');
    await expect(rows.nth(0).locator('img')).toHaveAttribute('src', /mixed-first\.jpg/);
    await expect(rows.nth(1).locator('.tm-video-thumbnail img')).toHaveAttribute('src', /mixed-poster\.jpg/);
    await expect(rows.nth(2).locator('img')).toHaveAttribute('src', /mixed-last\.jpg/);
    await expect(modal.locator('[data-action="retry-failed"]')).toBeDisabled();
    await expect(modal.locator('.tm-batch-summary')).toBeEmpty();
    await expect(modal.locator('.tm-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(rows.nth(2).locator('.tm-open')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(modal.locator('.tm-close')).toBeFocused();
    const selectAll = modal.locator('[data-action="select-all"]');
    await selectAll.check();
    await rows.nth(1).locator('input[type="checkbox"]').uncheck();
    await expect(selectAll).toHaveJSProperty('indeterminate', true);
    await expect(rows.nth(0).locator('input')).toBeChecked();
    await expect(rows.nth(2).locator('input')).toBeChecked();
    await testInfo.attach('media-dialog', {
        body: await modal.screenshot({ path: testInfo.outputPath('media-dialog.png') }),
        contentType: 'image/png'
    });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(tool).toBeFocused();
});

test('reply detail tools copy only the addressed reply and exclude parent media', async ({ page }) => {
    await acceptDisclosure(page, REPLY_PATH);
    await expect(page.locator('#parent-post .tm-post-media-tool-button')).toHaveCount(0);
    const reply = page.locator('#reply-post');
    await expect(reply.locator('.tm-post-media-tool-button')).toHaveCount(1);
    expect((await reply.locator('.tm-post-media-tool-button').boundingBox()).y).toBeGreaterThan(page.viewportSize().height);
    await reply.locator('.tm-post-copy-tool-button').click();
    // Windows native clipboard stores line endings as CRLF.
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(REPLY_TEXT);
    await reply.locator('.tm-post-link-tool-button').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${ORIGIN}${REPLY_PATH}`);
    await reply.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(1);
    await expect(page.locator(`${modalSelector} .tm-item img`)).toHaveAttribute('src', /reply-only\.jpg/);
    await expect(page.locator(`${modalSelector} .tm-modal-subtitle`)).toContainText('REPLY456');
});

test('SPA transitions clear stale media, stop on sensitive routes, and resume with one tool per action', async ({ page }) => {
    await acceptDisclosure(page, MIXED_PATH);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(3);
    await page.keyboard.press('Escape');
    await page.locator('#go-sensitive').click();
    await expect(page).toHaveURL(`${ORIGIN}/settings/privacy`);
    await expect(page.locator('.tm-post-media-tool-button, .tm-post-copy-tool-button, .tm-post-link-tool-button, #tm-target-downloader-style')).toHaveCount(0);
    await expect(page.locator(modalSelector)).toHaveCount(0);
    await page.locator('#go-next').click();
    await expect(page).toHaveURL(`${ORIGIN}${NEXT_PATH}`);
    await expect(page.locator('.tm-post-media-tool-button')).toHaveCount(1);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(1);
    await expect(page.locator(`${modalSelector} .tm-item img`)).toHaveAttribute('src', /next-only\.jpg/);
    await page.keyboard.press('Escape');
    await page.locator('#go-mixed').click();
    await expect(page.locator('.tm-post-media-tool-button')).toHaveCount(1);
    await expect(page.locator('.tm-post-copy-tool-button')).toHaveCount(1);
    await expect(page.locator('.tm-post-link-tool-button')).toHaveCount(1);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(3);
});

test('page language, saved language override, and live theme changes reach extension controls', async ({ page, optionsPage }) => {
    await acceptDisclosure(page, MIXED_PATH);
    const tool = page.locator('.tm-post-media-tool-button');
    await expect(tool).toHaveAttribute('aria-label', 'Open Threads Media Downloader');
    await expect(tool).toHaveCSS('color', 'rgb(18, 18, 18)');
    await page.locator('#switch-language').click();
    await expect(tool).toHaveAttribute('aria-label', '開啟 Threads 媒體下載器');
    await page.locator('#switch-theme').click();
    for (const selector of ['.tm-post-media-tool-button', '.tm-post-copy-tool-button', '.tm-post-link-tool-button']) {
        await expect(page.locator(selector)).toHaveCSS('color', 'rgb(245, 245, 245)');
    }
    await tool.click();
    await expect(page.locator('#tm-post-media-modal-title')).toHaveText('Threads 媒體下載器');
    await expect(page.locator(`${modalSelector} [data-action="retry-failed"]`)).toHaveText('只重試失敗項目');
    await optionsPage.locator('#language-preference').selectOption('en');
    await optionsPage.locator('#options-form button[type="submit"]').click();
    await expect(tool).toHaveAttribute('aria-label', 'Open Threads Media Downloader');
    // Existing locale changes recreate the tools and dismiss the previous modal.
    await expect(page.locator(modalSelector)).toHaveCount(0);
    await tool.click();
    await expect(page.locator('#tm-post-media-modal-title')).toHaveText('Threads Media Downloader');
    await expect(page.locator(`${modalSelector} [data-action="download-all"]`)).toHaveText('Download All');
    await expect(page.locator(`${modalSelector} [data-action="retry-failed"]`)).toHaveText('Retry Failed Items');
    await page.keyboard.press('Escape');
    await page.locator('#switch-theme').click();
    await expect(tool).toHaveCSS('color', 'rgb(18, 18, 18)');
});

test('revoking consent in the real options page removes active UI and stays disabled across SPA and reload', async ({ page, optionsPage, extensionWorker }) => {
    await acceptDisclosure(page, MIXED_PATH);
    // Both consent transitions use the packaged options UI and real Chrome storage.
    await optionsPage.reload();
    await optionsPage.locator('#network-capture-enabled').click();
    await optionsPage.locator('#confirm-network-capture').click();
    await expect.poll(() => extensionWorker.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).length
    )).toBe(1);
    await page.reload();
    await expect(page.locator('.tm-post-media-tool-button')).toHaveCount(1);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(modalSelector)).toBeVisible();
    await optionsPage.locator('#revoke-consent').click();
    await expect(page.locator('.tm-post-media-tool-button, .tm-post-copy-tool-button, .tm-post-link-tool-button, #tm-post-media-modal, #tm-target-downloader-style')).toHaveCount(0);
    const consent = await extensionWorker.evaluate(async () => (await chrome.storage.local.get('consent')).consent);
    expect(consent.pageContentProcessingEnabled).toBe(false);
    expect(consent.networkCaptureEnabled).toBe(false);
    await expect.poll(() => extensionWorker.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).length
    )).toBe(0);
    await page.locator('#go-next').click();
    await expect(page).toHaveURL(`${ORIGIN}${NEXT_PATH}`);
    await page.reload();
    await expect(page.locator('#threads-plugin-disclosure-v1, .tm-post-media-tool-button, .tm-post-copy-tool-button, .tm-post-link-tool-button')).toHaveCount(0);
    await optionsPage.locator('#enable-page-processing').click();
    await expect(page.locator('.tm-post-media-tool-button')).toHaveCount(1);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(1);
    await expect(page.locator(`${modalSelector} .tm-item img`)).toHaveAttribute('src', /next-only\.jpg/);
});

test('all 16 feature combinations hot-update independently through the real options page', async ({ page, optionsPage, extensionWorker }) => {
    test.setTimeout(90000);
    await acceptDisclosure(page, MIXED_PATH);
    for (let mask = 0; mask < 16; mask += 1) {
        const enabled = featureControls.map((_, index) => Boolean(mask & (1 << index)));
        await test.step(featureControls.map((feature, index) => `${feature.option}=${enabled[index]}`).join(', '), async () => {
            await saveFeatureSettings(optionsPage, extensionWorker, enabled);
            await expectFeatureTools(page, enabled);
            if (enabled[0]) {
                await page.locator('.tm-post-link-tool-button').click();
                await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${ORIGIN}${MIXED_PATH}`);
            }
            if (enabled[1]) {
                await page.locator('.tm-post-copy-tool-button').click();
                await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Mixed photo and video carousel.');
            }
            if (enabled[2]) {
                await page.locator('.tm-post-media-tool-button').click();
                await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(3);
                await page.keyboard.press('Escape');
            }
        });
    }
});

test('disabling an open picker removes it while independent settings survive SPA and reload', async ({ page, optionsPage, extensionWorker }) => {
    await acceptDisclosure(page, MIXED_PATH);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(modalSelector)).toBeVisible();
    const enabled = [true, false, false, true];
    await saveFeatureSettings(optionsPage, extensionWorker, enabled);
    await expect(page.locator(modalSelector)).toHaveCount(0);
    await expectFeatureTools(page, enabled);
    await page.locator('#go-next').click();
    await expect(page).toHaveURL(`${ORIGIN}${NEXT_PATH}`);
    await expectFeatureTools(page, enabled);
    await page.reload();
    await expectFeatureTools(page, enabled);
    await optionsPage.reload();
    for (const [index, feature] of featureControls.entries()) {
        await expect(optionsPage.locator(`#${feature.id}`)).toBeChecked({ checked: enabled[index] });
    }
    await optionsPage.locator('#reset-options').click();
    await expectFeatureTools(page, [true, true, true, true]);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(1);
    await expect(page.locator(`${modalSelector} .tm-item img`)).toHaveAttribute('src', /next-only\.jpg/);
});

test('text-only and unresolved-video routes show an empty picker without stale media or downloads', async ({ page, extensionWorker }) => {
    await acceptDisclosure(page, MIXED_PATH);
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(3);
    await page.keyboard.press('Escape');
    for (const [navigation, path] of [['#go-empty', EMPTY_PATH], ['#go-unresolved', UNRESOLVED_PATH]]) {
        await page.locator(navigation).click();
        await expect(page).toHaveURL(`${ORIGIN}${path}`);
        await expect(page.locator('.tm-post-copy-tool-button')).toHaveCount(1);
        await expect(page.locator('.tm-post-link-tool-button')).toHaveCount(1);
        await page.locator('.tm-post-media-tool-button').click();
        const modal = page.locator(modalSelector);
        await expect(modal.locator('.tm-item')).toHaveCount(0);
        await expect(modal.locator('.tm-empty')).toHaveText('No downloadable images or videos were found in the main post.');
        await expect(modal.locator('[data-action="retry-failed"]')).toBeDisabled();
        await expect(modal.locator('.tm-batch-summary')).toBeEmpty();
        await modal.locator('[data-action="download-all"]').click();
        await expect(page.locator('#tm-target-downloader-toast')).toHaveText('No media selected.');
        expect(await extensionWorker.evaluate(() => chrome.downloads.search({}))).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(page.locator('.tm-post-media-tool-button')).toBeFocused();
    }
    await page.locator('#go-next').click();
    await page.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(1);
    await expect(page.locator(`${modalSelector} [data-action="retry-failed"]`)).toBeDisabled();
});

test('unselected media does not download and repeated dialog opens preserve a single accessible dialog', async ({ page, extensionWorker }) => {
    await acceptDisclosure(page, MIXED_PATH);
    const tool = page.locator('.tm-post-media-tool-button');
    for (let index = 0; index < 3; index += 1) {
        await tool.click();
        const modal = page.locator(modalSelector);
        await expect(page.getByRole('dialog', { name: 'Threads Media Downloader' })).toHaveCount(1);
        await expect(modal.locator('.tm-close')).toBeFocused();
        await expect(modal.locator('.tm-item input:checked')).toHaveCount(0);
        await modal.locator('[data-action="download-selected"]').click();
        await expect(page.locator('#tm-target-downloader-toast')).toHaveText('No media selected.');
        await expect(modal.locator('[data-action="retry-failed"]')).toBeDisabled();
        await expect(modal.locator('.tm-batch-summary')).toBeEmpty();
        expect(await extensionWorker.evaluate(() => chrome.downloads.search({}))).toEqual([]);
        if (index % 2) await modal.locator('.tm-close').click();
        else await page.keyboard.press('Escape');
        await expect(modal).toBeHidden();
        await expect(tool).toBeFocused();
    }
});
