import { test, expect, acceptDisclosure } from './extension-fixtures.mjs';
import { MIXED_PATH, REPLY_PATH, NEXT_PATH, EMPTY_PATH, UNRESOLVED_PATH, JAPANESE_PATH, JAPANESE_TEXT, MUSIC_PATH, MUSIC_TEXT, ORIGIN, REPLY_TEXT } from './threads-fixture.mjs';

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

test('Japanese native rounded share icon supports unique copy, link and media tools', async ({ page }) => {
    await acceptDisclosure(page, JAPANESE_PATH);
    await expect(page.getByRole('button', { name: 'シェアする', exact: true })).toBeVisible();
    const post = page.locator('#japanese-post');
    for (const tool of ['.tm-post-copy-tool-button', '.tm-post-link-tool-button', '.tm-post-media-tool-button']) {
        await expect(post.locator(tool)).toHaveCount(1);
    }
    await post.locator('.tm-post-copy-tool-button').click();
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(JAPANESE_TEXT);
    await post.locator('.tm-post-link-tool-button').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${ORIGIN}${JAPANESE_PATH}`);
    await post.locator('.tm-post-media-tool-button').click();
    await expect(page.locator(`${modalSelector} .tm-item`)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(post.locator('.tm-post-copy-tool-button')).toHaveCount(1);
});

test('copy excludes scrolled music attachment lyrics and mixed ancestors in every supported page language', async ({ page }) => {
    await acceptDisclosure(page, MUSIC_PATH);
    const post = page.locator('#music-post');
    const control = post.locator('.music-control');
    const firstLyric = post.locator('.music-lyrics [dir="auto"]').first();
    expect((await firstLyric.boundingBox()).y).toBeLessThan((await control.boundingBox()).y);
    for (const [lang, label] of [
        ['zh-Hant', '播放音樂'], ['zh-Hant', '暫停音樂'],
        ['en', 'Play music'], ['en', 'Pause music'],
        ['ja', '音楽を再生'], ['ja', '音楽を一時停止']
    ]) {
        await page.evaluate(({ lang, label }) => {
            document.documentElement.lang = lang;
            document.querySelector('.music-control').setAttribute('aria-label', label);
        }, { lang, label });
        for (const ancestorHasDir of [false, true]) {
            await post.locator('.music-post-content').evaluate((node, enabled) => {
                if (enabled) node.setAttribute('dir', 'auto');
                else node.removeAttribute('dir');
            }, ancestorHasDir);
            await page.evaluate(() => navigator.clipboard.writeText('copy-music-sentinel'));
            await expect(post.locator('.tm-post-copy-tool-button')).toHaveCount(1);
            await post.locator('.tm-post-copy-tool-button').click();
            await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(MUSIC_TEXT);
        }
    }
});

test('a shared music wrapper retains direct caption text and inline author markup', async ({ page }) => {
    await acceptDisclosure(page, MUSIC_PATH);
    const post = page.locator('#music-post');
    for (const inlineMarkup of [false, true]) {
        await post.locator('.music-post-content').evaluate((node, { text, inlineMarkup }) => {
            const card = node.querySelector('.music-card');
            node.setAttribute('dir', 'auto');
            node.style.whiteSpace = 'pre-wrap';
            const captionNodes = [];
            if (inlineMarkup) {
                const [before, after] = text.split('Play music');
                const link = document.createElement('a');
                link.href = 'https://example.com/artist';
                link.textContent = 'Play music';
                captionNodes.push(document.createTextNode(before), link, document.createTextNode(after));
            } else {
                captionNodes.push(document.createTextNode(text));
            }
            node.replaceChildren(...captionNodes, card);
        }, { text: MUSIC_TEXT, inlineMarkup });
        await page.evaluate(() => navigator.clipboard.writeText('direct-caption-sentinel'));
        await post.locator('.tm-post-copy-tool-button').click();
        await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(MUSIC_TEXT);
    }
});

test('copy preserves body words and fractions while removing actual translation controls', async ({ page }) => {
    await acceptDisclosure(page, MIXED_PATH);
    const body = '我最喜歡的工作是翻譯\n今年目標完成比例\n3/4';
    await page.locator('#mixed-post p[dir="auto"]').evaluate((element, text) => {
        element.textContent = text;
        const translate = document.createElement('button');
        translate.type = 'button';
        translate.textContent = '翻譯';
        // Threads can place its control inline with the last body line.
        element.append(' ', translate);
    }, body);
    await page.locator('#mixed-post .tm-post-copy-tool-button').click();
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(body);
    await page.locator('#mixed-post p[dir="auto"] button').evaluate((element) => element.remove());
    await page.locator('#mixed-post .tm-post-copy-tool-button').click();
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(body);
});

test('long post and reply copy exclude the split static page badge while preserving body fractions', async ({ page }) => {
    test.setTimeout(120000);
    await acceptDisclosure(page, MIXED_PATH);
    for (const fixture of [
        { path: MIXED_PATH, root: '#mixed-post', current: 1, total: 2, title: '主貼文' },
        { path: REPLY_PATH, root: '#reply-post', current: 2, total: 2, title: '回覆' },
        { path: MIXED_PATH, root: '#mixed-post', current: 1, total: 3, title: '主貼文' },
        { path: MIXED_PATH, root: '#mixed-post', current: 1, total: 14, title: '主貼文' },
        { path: REPLY_PATH, root: '#reply-post', current: 14, total: 14, title: '續篇' },
        { path: MIXED_PATH, root: '#mixed-post', current: 1, total: 20, title: '主貼文' },
        { path: REPLY_PATH, root: '#reply-post', current: 10, total: 20, title: '續篇' },
        { path: REPLY_PATH, root: '#reply-post', current: 20, total: 20, title: '續篇' },
        { path: MIXED_PATH, root: '#mixed-post', current: 1, total: 31, title: '主貼文' },
        { path: REPLY_PATH, root: '#reply-post', current: 15, total: 31, title: '續篇' },
        { path: REPLY_PATH, root: '#reply-post', current: 31, total: 31, title: '續篇' }
    ]) {
        await test.step(`${fixture.title} ${fixture.current}/${fixture.total}`, async () => {
            // Each case needs the original body element, which the previous case replaced.
            await page.goto(`${ORIGIN}${fixture.path}`);
            const body = [
                `${fixture.title}第一段：保留完整正文。`,
                ...Array.from({ length: 12 }, (_, index) => `長篇第 ${index + 1} 段：保留原有段落與換行。`),
                '我最喜歡的工作是翻譯',
                '今年目標完成比例',
                '3/4',
                '分行分數也屬於正文',
                '3',
                '/',
                '4'
            ].join('\n');
            const post = page.locator(fixture.root);
            const expectCopiedBody = async (expected) => {
                // Equal body text across UI variants must still require a new clipboard write.
                await page.evaluate(() => navigator.clipboard.writeText('clipboard fixture reset'));
                await post.locator('.tm-post-copy-tool-button').click();
                await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(expected);
            };
            await post.locator('p[dir="auto"]').evaluate((element, { body, current, total }) => {
                // The live long-text badge has no media dependency or absolute positioning.
                element.closest('article').querySelectorAll('.carousel, img, video').forEach(node => node.remove());
                const parent = document.createElement('div');
                parent.style.position = 'relative';
                const text = document.createElement('span');
                text.dir = 'auto';
                text.dataset.fixtureLongBody = '1';
                Object.assign(text.style, { display: 'block', whiteSpace: 'pre-wrap' });
                text.textContent = body;
                const wrapper = document.createElement('div');
                wrapper.dataset.fixturePageBadge = '1';
                wrapper.style.display = 'inline-block';
                const badge = document.createElement('div');
                Object.assign(badge.style, {
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgb(30, 30, 30)', color: 'white', borderRadius: '12px',
                    width: 'max-content', height: '23.8px', padding: '0 6px', position: 'static', fontSize: '12px'
                });
                const pageNumber = document.createElement('span');
                pageNumber.textContent = String(current);
                const slashContainer = document.createElement('div');
                const slash = document.createElement('span');
                slash.textContent = '/';
                slashContainer.appendChild(slash);
                const totalNumber = document.createElement('span');
                totalNumber.textContent = String(total);
                badge.append(pageNumber, slashContainer, totalNumber);
                wrapper.appendChild(badge);
                text.appendChild(wrapper);
                parent.appendChild(text);
                element.replaceWith(parent);
            }, { body, current: fixture.current, total: fixture.total });
            await expect(post.locator('[data-fixture-page-badge] > div')).toHaveCSS('position', 'static');
            await expect(post.locator('[data-fixture-page-badge]')).toHaveCSS('display', 'inline-block');
            await expect(post.locator('[data-fixture-page-badge]')).toHaveText(`${fixture.current}/${fixture.total}`);
            await expect(post.locator('.tm-post-copy-tool-button')).toHaveCount(1);
            await expectCopiedBody(body);

            for (const label of ['翻譯', 'Translate', '翻訳']) {
                await post.locator('[data-fixture-long-body]').evaluate((element, label) => {
                    const button = document.createElement('button');
                    button.dataset.fixtureTranslation = '1';
                    button.textContent = label;
                    Object.assign(button.style, { display: 'block', height: '24px' });
                    element.appendChild(button);
                }, label);
                await expectCopiedBody(body);
                await post.locator('[data-fixture-translation]').evaluate(element => element.remove());
            }

            for (const label of ['翻譯', 'Translate', '翻訳']) {
                await test.step(`inline translation before badge: ${label}`, async () => {
                    await post.locator('[data-fixture-long-body]').evaluate((element, label) => {
                        // Match live Threads: body -> inline wrapper/button/span -> NBSP -> page badge.
                        const wrapper = document.createElement('div');
                        wrapper.dataset.fixtureInlineTranslation = '1';
                        wrapper.style.display = 'inline-block';
                        const control = document.createElement('div');
                        control.setAttribute('role', 'button');
                        control.tabIndex = 0;
                        control.style.display = 'inline-flex';
                        const text = document.createElement('span');
                        text.textContent = label;
                        control.appendChild(text);
                        wrapper.appendChild(control);
                        const badge = element.querySelector('[data-fixture-page-badge]');
                        element.insertBefore(wrapper, badge);
                        element.insertBefore(document.createTextNode('\u00a0'), badge);
                    }, label);
                    const wrapper = post.locator('[data-fixture-inline-translation]');
                    await expect(wrapper).toHaveCSS('display', 'inline-block');
                    await expect(wrapper.locator('[role="button"][tabindex="0"]')).toHaveCSS('display', 'inline-flex');
                    await expect(wrapper.locator('[role="button"] > span')).toHaveText(label);
                    expect(await wrapper.evaluate(element => element.nextSibling.textContent)).toBe('\u00a0');
                    const bottomGap = await wrapper.locator('[role="button"]').evaluate((control) => Math.abs(
                        control.getBoundingClientRect().bottom -
                        control.closest('[data-fixture-long-body]').getBoundingClientRect().bottom
                    ));
                    expect(bottomGap, 'Translation control remains at the body bottom beside the badge').toBeLessThanOrEqual(6);
                    await expectCopiedBody(body);
                    await wrapper.evaluate((element) => {
                        element.nextSibling.remove();
                        element.remove();
                    });
                    await expectCopiedBody(body);
                });
            }

            await post.locator('[data-fixture-page-badge]').evaluate(element => element.remove());
            await expectCopiedBody(body);

            // Identical fraction text at the body end remains content when no UI badge exists.
            const bodyWithoutUi = `${body}\n${fixture.current}/${fixture.total}`;
            await post.locator('[data-fixture-long-body]').evaluate((element, text) => { element.textContent = text; }, bodyWithoutUi);
            await expectCopiedBody(bodyWithoutUi);
        });
    }
});

test('options stay locked during delayed real storage reads and preserve the stored settings', async ({ context, extensionWorker }) => {
    const initialOptions = {
        enableCopyOriginalLink: true, enableCopyPostText: true,
        enableBatchMediaDownload: false, enablePerMediaDownload: true,
        hoverScanIntervalMs: 220, layoutRefreshIntervalMs: 350, backgroundScanIntervalMs: 8000,
        ignoreHorizontalOnlyScroll: true, languagePreference: 'en'
    };
    await extensionWorker.evaluate(async (options) => chrome.storage.local.set({ options }), initialOptions);
    const settings = await context.newPage();
    await settings.addInitScript(() => {
        const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
        const ready = new Promise((resolve) => { globalThis.releaseSettingsRead = resolve; });
        // Delay only; all returned data still comes from Chrome's actual storage.
        chrome.storage.local.get = async (...args) => { await ready; return originalGet(...args); };
    });
    const extensionId = new URL(extensionWorker.url()).host;
    await settings.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(settings.locator('#options-form button[type="submit"]')).toBeDisabled();
    await expect(settings.locator('#enable-copy-post-text')).toBeDisabled();
    await expect(settings.locator('#enable-page-processing')).toBeDisabled();
    await settings.evaluate(() => document.getElementById('options-form').dispatchEvent(new Event('submit', { cancelable: true })));
    expect(await extensionWorker.evaluate(async () => (await chrome.storage.local.get('options')).options)).toEqual(initialOptions);
    await settings.evaluate(() => globalThis.releaseSettingsRead());
    await expect(settings.locator('#options-form button[type="submit"]')).toBeEnabled();
    await expect(settings.locator('#hover-scan-interval')).toHaveValue('220');
    await expect(settings.locator('#enable-batch-media-download')).not.toBeChecked();
    await settings.locator('#enable-copy-post-text').uncheck();
    await settings.locator('#options-form button[type="submit"]').click();
    await expect.poll(() => extensionWorker.evaluate(async () => (await chrome.storage.local.get('options')).options.enableCopyPostText)).toBe(false);
    expect(await extensionWorker.evaluate(async () => (await chrome.storage.local.get('options')).options.hoverScanIntervalMs)).toBe(220);
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
