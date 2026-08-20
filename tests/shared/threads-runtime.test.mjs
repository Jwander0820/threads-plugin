import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createThreadsRuntime,
    MAX_STRUCTURED_RECORDS_PER_ROUTE
} from '../../src/shared/threads-runtime.js';
import { createUserscriptMessage } from '../../src/userscript/i18n.js';

const THREADS_SHARE_GLYPH_TEST_PATH =
    'M7.2474 1.49853C4.18324 -0.187039 0.600262 2.64309 1.53038 6.01431Z';

function fakePlatform() {
    return {
        async saveOptions() { return true; },
        downloadMedia() {},
        requestMedia() {},
        async writeClipboard() { return true; },
        async installStyles() { return () => {}; },
        async installSettingsUi() { return () => {}; }
    };
}

function createThreadsActionFixture({
    actionLabels = ['いいね', '返信', '再投稿', null],
    actionPaths = [],
    actionBarWidth = 360,
    actionSlotSize = 40,
    actionSlotStep = 64,
    includePostIdentity = true
} = {}) {
    const toolClasses = new Set([
        'tm-target-download-button',
        'tm-post-media-tool-button',
        'tm-post-copy-tool-button',
        'tm-post-link-tool-button'
    ]);
    const rect = (left, top, width, height) => ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
    });
    const selectorContainsClass = (selector, className) =>
        Boolean(className && selector?.includes?.(`.${className}`));
    const isArticleSelector = (selector) =>
        selector?.includes?.('article') || selector?.includes?.('[role="article"]') || selector?.includes?.('[role=article]');
    const isInteractiveSelector = (selector) => String(selector || '')
        .split(',')
        .map((part) => part.trim())
        .some((part) =>
            part === 'button' || part.startsWith('button[') ||
            part === 'a' || part.startsWith('a[') ||
            part.includes('[role="button"]') || part.includes('[role=button]') ||
            part.includes('[tabindex="0"]')
        );
    const isPostLinkSelector = (selector) => selector?.includes?.('a[href*="/post/"]');
    const isShareCandidateSelector = (selector) =>
        selector === 'svg' || selector?.includes?.('svg[aria-label]') || selector?.includes?.('button svg');

    const contains = (container, candidate) => {
        for (let node = candidate; node; node = node.parentElement) {
            if (node === container) return true;
        }
        return false;
    };

    const closestFrom = (node, selector) => {
        for (let current = node; current; current = current.parentElement) {
            if (selectorContainsClass(selector, current.className)) return current;
            if (isArticleSelector(selector) && current.tagName === 'ARTICLE') return current;
            if (isInteractiveSelector(selector) && current.tagName === 'BUTTON') return current;
        }
        return null;
    };

    const makeToolNode = (tagName) => {
        const attributes = new Map();
        const node = {
            tagName: String(tagName).toUpperCase(),
            className: '',
            dataset: {},
            parentElement: null,
            isConnected: false,
            children: [],
            setAttribute(name, value) { attributes.set(name, String(value)); },
            getAttribute(name) { return attributes.get(name) ?? null; },
            addEventListener() {},
            matches(selector) {
                return selectorContainsClass(selector, this.className) ||
                    (this.tagName === 'BUTTON' && isInteractiveSelector(selector));
            },
            closest(selector) { return closestFrom(this, selector); },
            querySelector() { return null; },
            querySelectorAll() { return []; },
            getBoundingClientRect() { return rect(0, 0, 40, 40); },
            after(sibling) { this.parentElement?.insertAfter(this, sibling); },
            appendChild(child) {
                if (child.parentElement) child.remove();
                this.children.push(child);
                child.parentElement = this;
                child.isConnected = this.isConnected;
                return child;
            },
            remove() {
                const siblings = this.parentElement?.children;
                if (siblings) {
                    const index = siblings.indexOf(this);
                    if (index >= 0) siblings.splice(index, 1);
                }
                this.parentElement = null;
                this.isConnected = false;
            }
        };
        Object.defineProperties(node, {
            previousElementSibling: {
                get() {
                    const siblings = this.parentElement?.children || [];
                    const index = siblings.indexOf(this);
                    return index > 0 ? siblings[index - 1] : null;
                }
            },
            childElementCount: { get() { return this.children.length; } },
            classList: {
                get() {
                    return { contains: (className) => this.className.split(/\s+/).includes(className) };
                }
            }
        });
        return node;
    };

    const root = {
        tagName: 'ARTICLE',
        parentElement: null,
        isConnected: true,
        getBoundingClientRect: () => rect(120, 80, 640, 620),
        matches(selector) { return isArticleSelector(selector); },
        closest(selector) { return closestFrom(this, selector); },
        contains(candidate) { return contains(this, candidate); },
        hasAttribute() { return false; },
        querySelector(selector) {
            if (selector === 'time[datetime]' && includePostIdentity) return timeNode;
            return null;
        },
        querySelectorAll(selector) {
            if (isShareCandidateSelector(selector)) return svgs;
            if (isPostLinkSelector(selector)) return includePostIdentity ? [postLink] : [];
            if (selector === 'time[datetime]') return includePostIdentity ? [timeNode] : [];
            if (selector === 'div') return this.actionBars || [actionBar];
            if (selector === 'img, video') return [];
            return [];
        }
    };
    const actionBar = {
        tagName: 'DIV',
        className: '',
        parentElement: root,
        isConnected: true,
        children: [],
        getBoundingClientRect: () => rect(180, 300, actionBarWidth, 48),
        matches() { return false; },
        closest(selector) { return closestFrom(this, selector); },
        contains(candidate) { return contains(this, candidate); },
        querySelector(selector) {
            if (isInteractiveSelector(selector)) return this.children.find((child) => child.tagName === 'BUTTON') || null;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'svg' || isShareCandidateSelector(selector)) return svgs;
            if (isPostLinkSelector(selector) || selector === 'time[datetime]') return [];
            if (selector === 'button,a,[role="button"]') {
                return this.children.filter((child) => child.tagName === 'BUTTON');
            }
            return [];
        },
        insertAfter(anchor, node) {
            if (node.parentElement) node.remove();
            const anchorIndex = this.children.indexOf(anchor);
            this.children.splice(anchorIndex + 1, 0, node);
            node.parentElement = this;
            node.isConnected = true;
        },
        appendChild(node) {
            if (node.parentElement) node.remove();
            this.children.push(node);
            node.parentElement = this;
            node.isConnected = true;
            return node;
        }
    };
    root.actionBars = [actionBar];
    const slots = actionLabels.map((label, index) => ({
        tagName: 'BUTTON',
        className: '',
        parentElement: actionBar,
        isConnected: true,
        ariaLabel: label,
        getBoundingClientRect: () => rect(
            190 + (index * actionSlotStep),
            304,
            actionSlotSize,
            actionSlotSize
        ),
        getAttribute(name) { return name === 'aria-label' ? this.ariaLabel : null; },
        matches(selector) { return isInteractiveSelector(selector); },
        closest(selector) { return closestFrom(this, selector); },
        querySelector(selector) { return selector?.includes?.('svg') ? svgs[index] : null; },
        querySelectorAll(selector) { return isShareCandidateSelector(selector) ? [svgs[index]] : []; },
        after(node) { actionBar.insertAfter(this, node); }
    }));
    const svgs = actionLabels.map((_label, index) => {
        const pathData = actionPaths[index] ?? (index === 3 ? THREADS_SHARE_GLYPH_TEST_PATH : '');
        const path = pathData ? {
            getAttribute(name) { return name === 'd' ? pathData : null; }
        } : null;
        return {
            tagName: 'svg',
            parentElement: slots[index],
            isConnected: true,
            getAttribute(name) { return name === 'viewBox' && path ? '0 0 24 24' : null; },
            matches() { return false; },
            closest(selector) { return closestFrom(this, selector); },
            querySelector() { return null; },
            querySelectorAll(selector) { return selector === 'path' && path ? [path] : []; }
        };
    });
    actionBar.children.push(...slots);

    const postLink = {
        tagName: 'A',
        href: 'https://www.threads.com/@author/post/POST_1',
        parentElement: root,
        matches(selector) { return isPostLinkSelector(selector); },
        closest(selector) { return closestFrom(this, selector); },
        contains(candidate) { return candidate === this; },
        getBoundingClientRect: () => rect(160, 100, 120, 24)
    };
    const timeNode = {
        tagName: 'TIME',
        parentElement: root,
        getAttribute(name) { return name === 'datetime' ? '2026-08-20T00:00:00.000Z' : null; },
        matches(selector) { return selector === 'time[datetime]'; },
        closest(selector) { return closestFrom(this, selector); },
        getBoundingClientRect: () => rect(160, 100, 80, 20)
    };
    const documentElement = {
        tagName: 'HTML',
        parentElement: null,
        isConnected: true,
        getBoundingClientRect: () => rect(0, 0, 1280, 900),
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const body = {
        tagName: 'BODY',
        parentElement: documentElement,
        isConnected: true,
        getBoundingClientRect: () => rect(0, 0, 1280, 900),
        matches() { return false; },
        closest(selector) { return closestFrom(this, selector); },
        contains(candidate) { return contains(this, candidate); },
        querySelector() { return null; },
        querySelectorAll(selector) {
            if (isShareCandidateSelector(selector)) return svgs;
            if (isPostLinkSelector(selector)) return [];
            return [];
        }
    };
    root.parentElement = body;

    const document = {
        body,
        documentElement,
        scripts: [],
        createElement: makeToolNode,
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll(selector) {
            if (isShareCandidateSelector(selector)) return svgs;
            if (selector === 'article,[role="article"]') return [root];
            if (isPostLinkSelector(selector) || selector === 'img, video') return [];
            return [];
        }
    };
    const window = {
        innerWidth: 1280,
        innerHeight: 900,
        getComputedStyle(node) {
            return {
                cursor: node?.tagName === 'BUTTON' ? 'pointer' : 'default',
                display: 'block',
                visibility: 'visible'
            };
        }
    };

    return {
        actionBar,
        document,
        root,
        slots,
        svgs,
        toolCount(className) {
            assert.equal(toolClasses.has(className), true);
            return actionBar.children.filter((node) => node.className === className).length;
        },
        tools() {
            return actionBar.children.filter((node) => toolClasses.has(node.className));
        },
        window
    };
}

test('post text cleaner removes only a trailing standalone English Translate label', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const { cleanPostTextFragment, getRenderedPostText } = runtime.testing;

    assert.equal(cleanPostTextFragment('Hello from Threads\nTranslate'), 'Hello from Threads');
    assert.equal(cleanPostTextFragment('Translate this sentence for me'), 'Translate this sentence for me');
    assert.equal(cleanPostTextFragment('I use Google Translate'), 'I use Google Translate');
    assert.equal(cleanPostTextFragment('Translate'), 'Translate');
    assert.equal(cleanPostTextFragment('繁中貼文\n翻譯'), '繁中貼文');
    assert.equal(cleanPostTextFragment('繁中貼文\n查看翻譯'), '繁中貼文');
    assert.equal(cleanPostTextFragment('繁中貼文 翻譯'), '繁中貼文');
    assert.equal(cleanPostTextFragment('繁中貼文 查看翻譯'), '繁中貼文');
    assert.equal(cleanPostTextFragment('日本語の投稿\n翻訳'), '日本語の投稿');
    assert.equal(cleanPostTextFragment('翻訳してください'), '翻訳してください');
    assert.equal(cleanPostTextFragment('翻訳'), '翻訳');
    assert.equal(cleanPostTextFragment('Hello\r\nTranslate\r\n\t'), 'Hello');
    assert.equal(cleanPostTextFragment('\r\nHello\r\n'), 'Hello');
    assert.equal(cleanPostTextFragment('Hello \t\u00a0'), 'Hello');
    assert.equal(cleanPostTextFragment('Hello\r\nWorld'), 'Hello\nWorld');

    const postRect = { left: 0, top: 0, width: 320, height: 42, right: 320, bottom: 42 };
    const uiRect = { left: 240, top: 21, width: 70, height: 21, right: 310, bottom: 42 };
    const localizedUiControl = {
        innerText: 'Traduire',
        getBoundingClientRect: () => uiRect,
        querySelector: () => null
    };
    const localizedPostElement = {
        innerText: 'Bonjour Threads\nTraduire',
        getBoundingClientRect: () => postRect,
        querySelectorAll(selector) {
            return selector === 'button,[role="button"]' ? [localizedUiControl] : [];
        }
    };
    const bodyOnlyElement = {
        ...localizedPostElement,
        querySelectorAll: () => []
    };
    const chineseUiControl = {
        ...localizedUiControl,
        innerText: '翻譯'
    };
    const sameBodyAndUiLabelElement = {
        ...localizedPostElement,
        innerText: '翻譯\n翻譯',
        querySelectorAll(selector) {
            return selector === 'button,[role="button"]' ? [chineseUiControl] : [];
        }
    };
    assert.equal(getRenderedPostText(localizedPostElement), 'Bonjour Threads');
    assert.equal(getRenderedPostText(bodyOnlyElement), 'Bonjour Threads\nTraduire');
    assert.equal(getRenderedPostText(sameBodyAndUiLabelElement), '翻譯');
});

test('post text extractor keeps every text segment when one contains a small inline image', async () => {
    const makeRect = (left, top, width, height) => ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
    });
    const inlineImage = {
        tagName: 'IMG',
        currentSrc: 'https://media0.giphy.com/inline-sticker.gif',
        getAttribute(name) { return name === 'alt' ? '' : null; },
        getBoundingClientRect: () => makeRect(270, 112, 26, 24)
    };
    const postMediaImage = {
        tagName: 'IMG',
        currentSrc: 'https://scontent.cdninstagram.com/post-media.jpg',
        getAttribute(name) { return name === 'alt' ? '' : null; },
        getBoundingClientRect: () => makeRect(160, 260, 420, 300)
    };
    const makeTextElement = (innerText, top, images = []) => ({
        innerText,
        getBoundingClientRect: () => makeRect(160, top, 420, 66),
        matches: (selector) => selector === '[dir="auto"]',
        contains(candidate) { return candidate === this || images.includes(candidate); },
        closest() { return null; },
        querySelector(selector) {
            if (selector === 'button, [role="button"], img, video, time' ||
                selector === 'button,[role="button"],img,video,time') {
                return images[0] || null;
            }
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'img') return images;
            return [];
        }
    });
    const titleText = '《葬送的芙莉蓮》 芙莉蓮與欣梅爾雕像\n當時不懂的戒指，卻成了最漫長的思念。\n(可惡如果有yes i do的行李吊牌飾品一定很搭🥹';
    const farmText = '這是位在日本千葉縣香取市的農園度假村 THE FARM 的合作活動\n📍35.793238, 140.513407';
    const titleElement = makeTextElement(titleText, 100, [inlineImage]);
    const farmElement = makeTextElement(farmText, 176);
    const mediaWrapper = makeTextElement('post media', 250, [postMediaImage]);
    const actionBar = {
        getBoundingClientRect: () => makeRect(160, 520, 420, 40),
        closest: () => root
    };
    const postLink = {
        href: 'https://www.threads.com/@lacaille_pikmin/post/Db-aDXJkhwc',
        closest: () => root,
        contains: () => false,
        getBoundingClientRect: () => makeRect(160, 70, 120, 20)
    };
    const root = {
        matches: () => false,
        contains(candidate) {
            return [this, titleElement, farmElement, mediaWrapper, actionBar, postLink].includes(candidate);
        },
        getBoundingClientRect: () => makeRect(140, 40, 460, 560),
        querySelector: () => null,
        querySelectorAll(selector) {
            if (selector === '[dir="auto"]') return [titleElement, farmElement, mediaWrapper];
            if (selector === 'img, video') return [inlineImage];
            if (selector === '[aria-label]') return [];
            if (selector.includes('a[href*="/post/"]')) return [postLink];
            return [];
        }
    };
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: { body: root, documentElement: {}, querySelectorAll: () => [] },
        window: {
            innerWidth: 1280,
            innerHeight: 900,
            getComputedStyle: () => ({ whiteSpace: 'pre-wrap' })
        },
        initialOptions: {}
    });

    assert.equal(
        runtime.testing.extractPostBlockText(root, actionBar),
        `${titleText}\n${farmText}`
    );
});

test('real runtime injection supports Japanese structure while English and Traditional Chinese stay intact', async () => {
    const cases = [
        {
            name: 'English',
            labels: ['Like', 'Reply', 'Repost', 'Share'],
            languages: ['en-US'],
            expectedTitles: ['Copy Clean Link', 'Copy Post Text']
        },
        {
            name: 'Traditional Chinese',
            labels: ['讚', '回覆', '轉發', '分享'],
            languages: ['zh-TW'],
            expectedTitles: ['複製這則貼文連結（去追蹤碼）', '複製這則貼文文字']
        },
        {
            name: 'Japanese fallback',
            labels: ['いいね', '返信', '再投稿', null],
            languages: ['ja-JP'],
            expectedTitles: ['Copy Clean Link', 'Copy Post Text']
        }
    ];

    for (const fixtureCase of cases) {
        const fixture = createThreadsActionFixture({ actionLabels: fixtureCase.labels });
        const runtime = await createThreadsRuntime({
            platform: fakePlatform(),
            document: fixture.document,
            window: fixture.window,
            initialOptions: {},
            message: createUserscriptMessage({ languages: fixtureCase.languages })
        });

        fixture.svgs.slice(0, 3).forEach((svg, index) => {
            assert.equal(runtime.testing.isShareSvg(svg), false, `${fixtureCase.name} action ${index + 1}`);
        });
        assert.equal(runtime.testing.isShareSvg(fixture.svgs[3]), true, `${fixtureCase.name} share action`);

        runtime.testing.ensureCopyButtonsForBlocks();
        runtime.testing.ensureCopyButtonsForBlocks();

        assert.equal(fixture.toolCount('tm-post-link-tool-button'), 1, fixtureCase.name);
        assert.equal(fixture.toolCount('tm-post-copy-tool-button'), 1, fixtureCase.name);
        const tools = fixture.tools();
        assert.deepEqual(tools.map((tool) => tool.title), fixtureCase.expectedTitles, fixtureCase.name);
        assert.deepEqual(
            tools.map((tool) => tool.getAttribute('aria-label')),
            fixtureCase.expectedTitles,
            `${fixtureCase.name} aria labels`
        );
    }
});

test('structural share locator rejects incomplete and post-unbound icon rows', async () => {
    const incomplete = createThreadsActionFixture({
        actionLabels: ['いいね', '返信', '再投稿']
    });
    const incompleteRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: incomplete.document,
        window: incomplete.window,
        initialOptions: {}
    });
    incomplete.svgs.forEach((svg) => assert.equal(incompleteRuntime.testing.isShareSvg(svg), false));
    incompleteRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(incomplete.tools().length, 0);

    const wrapped = createThreadsActionFixture();
    const emptyPressableWrapper = {
        tagName: 'DIV',
        parentElement: wrapped.root,
        getBoundingClientRect: () => ({
            left: 160,
            top: 280,
            width: 400,
            height: 90,
            right: 560,
            bottom: 370
        }),
        matches(selector) {
            return selector.includes('[data-pressable-container]');
        },
        querySelectorAll() { return []; },
        closest(selector) {
            return this.matches(selector) ? this : this.parentElement.closest(selector);
        }
    };
    wrapped.actionBar.parentElement = emptyPressableWrapper;
    const wrappedRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: wrapped.document,
        window: wrapped.window,
        initialOptions: {},
        message: createUserscriptMessage({ languages: ['ja-JP'] })
    });
    assert.equal(wrappedRuntime.testing.isShareSvg(wrapped.svgs[3]), true);
    wrappedRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(wrapped.toolCount('tm-post-link-tool-button'), 1);
    assert.equal(wrapped.toolCount('tm-post-copy-tool-button'), 1);

    const unbound = createThreadsActionFixture({ includePostIdentity: false });
    const unboundRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: unbound.document,
        window: unbound.window,
        initialOptions: {}
    });
    unbound.svgs.forEach((svg) => assert.equal(unboundRuntime.testing.isShareSvg(svg), false));
    unboundRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(unbound.tools().length, 0);

    const secondaryToolbar = createThreadsActionFixture({
        actionLabels: ['絞り込み', '並べ替え', '表示切替', '保存']
    });
    const primaryControls = Array.from({ length: 4 }, () => ({
        getBoundingClientRect: () => ({ width: 40, height: 40 })
    }));
    const primaryActionBar = {
        getBoundingClientRect: () => ({
            left: 180,
            top: 420,
            width: 360,
            height: 48,
            right: 540,
            bottom: 468
        }),
        querySelectorAll(selector) {
            return selector === 'button,a,[role="button"]' ? primaryControls : [];
        }
    };
    secondaryToolbar.root.actionBars = [secondaryToolbar.actionBar, primaryActionBar];
    const secondaryRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: secondaryToolbar.document,
        window: secondaryToolbar.window,
        initialOptions: {}
    });
    secondaryToolbar.svgs.forEach((svg) => assert.equal(secondaryRuntime.testing.isShareSvg(svg), false));
    secondaryRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(secondaryToolbar.tools().length, 0);

    const primaryNonShare = createThreadsActionFixture({
        actionLabels: ['Like', 'Reply', 'Repost', 'Bookmark'],
        actionPaths: ['', '', '', 'M4 3H20V22L12 17L4 22Z']
    });
    const primaryNonShareRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: primaryNonShare.document,
        window: primaryNonShare.window,
        initialOptions: {}
    });
    assert.equal(primaryNonShareRuntime.testing.isShareSvg(primaryNonShare.svgs[3]), false);
    primaryNonShareRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(primaryNonShare.tools().length, 0);

    const pathlessNonShare = createThreadsActionFixture({
        actionLabels: ['Like', 'Reply', 'Repost', 'Bookmark'],
        actionPaths: ['', '', '', '']
    });
    const pathlessNonShareRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: pathlessNonShare.document,
        window: pathlessNonShare.window,
        initialOptions: {}
    });
    assert.equal(pathlessNonShareRuntime.testing.isShareSvg(pathlessNonShare.svgs[3]), false);
    pathlessNonShareRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(pathlessNonShare.tools().length, 0);

    const flexibleActionRow = createThreadsActionFixture({
        actionLabels: ['いいね', '返信', '再投稿', '保存', null],
        actionPaths: ['', '', '', 'M4 3H20V22L12 17L4 22Z', THREADS_SHARE_GLYPH_TEST_PATH],
        actionBarWidth: 176,
        actionSlotSize: 28,
        actionSlotStep: 32
    });
    const flexibleActionRowRuntime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: flexibleActionRow.document,
        window: flexibleActionRow.window,
        initialOptions: {},
        message: createUserscriptMessage({ languages: ['ja-JP'] })
    });
    assert.equal(flexibleActionRowRuntime.testing.isShareSvg(flexibleActionRow.svgs[3]), false);
    assert.equal(flexibleActionRowRuntime.testing.isShareSvg(flexibleActionRow.svgs[4]), true);
    flexibleActionRowRuntime.testing.ensureCopyButtonsForBlocks();
    assert.equal(flexibleActionRow.toolCount('tm-post-link-tool-button'), 1);
    assert.equal(flexibleActionRow.toolCount('tm-post-copy-tool-button'), 1);

    const labelledShare = (label) => ({
        tagName: 'svg',
        parentElement: null,
        getAttribute(name) { return name === 'aria-label' ? label : null; },
        querySelector() { return null; }
    });
    assert.equal(unboundRuntime.testing.isShareSvg(labelledShare('Share')), true);
    assert.equal(unboundRuntime.testing.isShareSvg(labelledShare('分享')), true);
    assert.equal(unboundRuntime.testing.isShareSvg(labelledShare('Repost')), false);
    assert.equal(unboundRuntime.testing.isShareSvg({
        ...labelledShare('Share'),
        closest(selector) {
            return selector.includes('.tm-post-copy-tool-button') ? {} : null;
        }
    }), false);
});

test('one native share control with multiple SVGs is counted as one injection point', async () => {
    const fixture = createThreadsActionFixture({
        actionLabels: ['Like', 'Reply', 'Repost', 'Share']
    });
    fixture.svgs.push({
        ...fixture.svgs[3],
        parentElement: fixture.slots[3]
    });
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: fixture.document,
        window: fixture.window,
        initialOptions: {}
    });

    runtime.testing.ensureCopyButtonsForBlocks();
    runtime.testing.ensureCopyButtonsForBlocks();

    assert.equal(fixture.toolCount('tm-post-link-tool-button'), 1);
    assert.equal(fixture.toolCount('tm-post-copy-tool-button'), 1);
});

test('Japanese detail fixture gets all three English fallback tools without duplicates', async (t) => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'https://www.threads.com/@author/post/POST_1' };
    t.after(() => {
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
    });

    const fixture = createThreadsActionFixture();
    const composerControls = Array.from({ length: 4 }, () => ({
        getBoundingClientRect: () => ({ width: 40, height: 40 })
    }));
    const lowerComposerActionBar = {
        parentElement: fixture.root,
        getBoundingClientRect: () => ({
            left: 180,
            top: 500,
            width: 360,
            height: 48,
            right: 540,
            bottom: 548
        }),
        contains: () => false,
        querySelectorAll(selector) {
            return selector === 'button,a,[role="button"]' ? composerControls : [];
        }
    };
    fixture.root.actionBars = [fixture.actionBar, lowerComposerActionBar];
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: fixture.document,
        window: fixture.window,
        initialOptions: {},
        message: createUserscriptMessage({ languages: ['ja-JP'] })
    });

    runtime.testing.ensureCopyButtonsForBlocks();
    runtime.testing.ensureDetailButton();
    runtime.testing.ensureCopyButtonsForBlocks();
    runtime.testing.ensureDetailButton();

    assert.equal(fixture.toolCount('tm-post-link-tool-button'), 1);
    assert.equal(fixture.toolCount('tm-post-copy-tool-button'), 1);
    assert.equal(fixture.toolCount('tm-post-media-tool-button'), 1);
    assert.deepEqual(
        fixture.tools().map((tool) => [tool.className, tool.title, tool.getAttribute('aria-label')]),
        [
            ['tm-post-link-tool-button', 'Copy Clean Link', 'Copy Clean Link'],
            ['tm-post-copy-tool-button', 'Copy Post Text', 'Copy Post Text'],
            ['tm-post-media-tool-button', 'Open Threads Media Downloader', 'Open Threads Media Downloader']
        ]
    );
});

test('Chrome-compatible default messages still inject structurally located tools idempotently', async () => {
    const fixture = createThreadsActionFixture();
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: fixture.document,
        window: fixture.window,
        initialOptions: {}
    });

    runtime.testing.ensureCopyButtonsForBlocks();
    runtime.testing.ensureCopyButtonsForBlocks();

    assert.equal(fixture.toolCount('tm-post-link-tool-button'), 1);
    assert.equal(fixture.toolCount('tm-post-copy-tool-button'), 1);
    assert.deepEqual(
        fixture.tools().map((tool) => tool.title),
        ['複製這則貼文連結（去追蹤碼）', '複製這則貼文文字']
    );
});

test('post text boundary stops before Threads music lyrics', async () => {
    const musicControl = {
        getAttribute(name) {
            if (name === 'aria-label') return '播放音樂';
            if (name === 'role') return 'button';
            return null;
        },
        matches: (selector) => selector === 'button,[role=button]',
        getBoundingClientRect: () => ({ top: 240, bottom: 304 })
    };
    const root = {
        getBoundingClientRect: () => ({ top: 90, bottom: 640 }),
        querySelectorAll(selector) {
            if (selector === 'img, video') return [];
            if (selector === '[aria-label]') return [musicControl];
            return [];
        }
    };
    const actionBar = { getBoundingClientRect: () => ({ top: 520 }) };
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });

    assert.equal(runtime.testing.getPostBlockTextBoundary(root, actionBar), 240);
});

test('media modal traps keyboard focus and Escape closes it', async () => {
    let activeElement = null;
    const focused = [];
    const makeControl = (name) => ({
        dataset: {},
        getAttribute() { return null; },
        focus() { activeElement = this; focused.push(name); }
    });
    const first = makeControl('first');
    const second = makeControl('second');
    const modal = {
        dataset: { tmHidden: '0' },
        querySelectorAll() { return [first, second]; }
    };
    const document = {
        body: null,
        documentElement: {},
        get activeElement() { return activeElement; },
        getElementById(id) { return id === 'tm-post-media-modal' ? modal : null; },
        querySelectorAll() { return []; }
    };
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document,
        window: {},
        initialOptions: {}
    });

    activeElement = first;
    let prevented = 0;
    assert.equal(runtime.testing.handlePostMediaModalKeydown({
        key: 'Tab',
        preventDefault() { prevented += 1; }
    }), true);
    assert.equal(activeElement, second);

    assert.equal(runtime.testing.handlePostMediaModalKeydown({
        key: 'Tab',
        shiftKey: true,
        preventDefault() { prevented += 1; }
    }), true);
    assert.equal(activeElement, first);

    let stopped = 0;
    assert.equal(runtime.testing.handlePostMediaModalKeydown({
        key: 'Escape',
        preventDefault() { prevented += 1; },
        stopPropagation() { stopped += 1; }
    }), true);
    assert.equal(modal.dataset.tmHidden, '1');
    assert.equal(prevented, 3);
    assert.equal(stopped, 1);
    assert.deepEqual(focused, ['second', 'first']);
});

test('queued media refresh cannot be starved by repeated page mutations', async () => {
    let timerId = 0;
    let cancelledTimers = 0;
    const timeouts = new Map();
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: { body: {}, documentElement: {}, scripts: [], querySelectorAll() { return []; } },
        window: {
            setTimeout(callback) { timerId += 1; timeouts.set(timerId, callback); return timerId; },
            clearTimeout(id) {
                if (id && timeouts.delete(id)) cancelledTimers += 1;
            }
        },
        initialOptions: {}
    });

    runtime.testing.scheduleRefresh();
    runtime.testing.scheduleRefresh();
    runtime.testing.scheduleRefresh({ scanNetwork: false });

    assert.equal(timeouts.size, 1);
    assert.equal(cancelledTimers, 0);
});

test('DOM image resolution isolates the URL normalizer from Array.map callback arguments', async () => {
    const imageUrl = 'https://scontent.cdninstagram.com/v/example/photo.jpg?stp=dst-jpg';
    const image = {
        currentSrc: imageUrl,
        src: imageUrl,
        getAttribute(name) {
            if (name === 'src') return imageUrl;
            if (name === 'srcset') return '';
            return null;
        },
        closest() { return null; }
    };
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });

    assert.equal(runtime.testing.resolveImageUrl(image), imageUrl);
});

test('inline media scanner rescans a reused script element only after its content changes', async (t) => {
    const originalLocation = globalThis.location;
    globalThis.location = { href: 'https://www.threads.com/@author/post/POST_1' };
    t.after(() => {
        if (originalLocation === undefined) delete globalThis.location;
        else globalThis.location = originalLocation;
    });

    const script = {
        textContent: JSON.stringify({
            post: {
                code: 'POST_1',
                image_versions2: { candidates: [{ url: 'https://cdninstagram.com/first.jpg' }] }
            }
        })
    };
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        document: { body: null, documentElement: {}, scripts: [script], querySelectorAll() { return []; } },
        window: {},
        initialOptions: {}
    });

    runtime.testing.scanInlineScriptsForVideoUrls();
    runtime.testing.scanInlineScriptsForVideoUrls();
    assert.equal(runtime.testing.getPerformanceSnapshot().networkPayloadParses, 1);

    script.textContent = JSON.stringify({
        post: {
            code: 'POST_1',
            video_versions: [{ url: 'https://cdninstagram.com/late.mp4' }]
        }
    });
    runtime.testing.scanInlineScriptsForVideoUrls();

    assert.equal(runtime.testing.getPerformanceSnapshot().networkPayloadParses, 2);
    assert.equal(runtime.testing.getPerformanceSnapshot().videoRouteCacheEntries, 1);
});

test('media modal intent stays bound to immutable control identity after dataset tampering', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const selectAll = { dataset: { action: 'select-all' } };
    const downloadSelected = { dataset: { action: 'download-selected' } };
    const downloadAll = { dataset: { action: 'download-all' } };
    const controls = Object.freeze({ selectAll, downloadSelected, downloadAll });

    selectAll.dataset.action = 'download-all';
    delete downloadAll.dataset.action;
    assert.equal(runtime.testing.isModalControlIntent(selectAll, controls, 'downloadAll'), false);
    assert.equal(runtime.testing.isModalControlIntent(selectAll, controls, 'selectAll'), true);
    assert.equal(runtime.testing.isModalControlIntent(downloadAll, controls, 'downloadAll'), true);
});

test('detail media ownership reaches a deeply nested carousel item without borrowing another post', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const pageInfo = {
        author: 'hot.elhunter',
        postId: 'Db758PICOVn',
        postUrl: 'https://www.threads.com/@hot.elhunter/post/Db758PICOVn'
    };
    const root = {
        parentElement: null,
        contains(node) {
            let current = node;
            while (current) {
                if (current === this) return true;
                current = current.parentElement;
            }
            return false;
        }
    };
    const nodes = Array.from({ length: 24 }, () => ({
        parentElement: null,
        matches() { return false; },
        closest() { return root; },
        querySelectorAll() { return []; }
    }));
    nodes.forEach((node, index) => {
        node.parentElement = nodes[index + 1] || root;
    });

    assert.equal(runtime.testing.getOwnedDetailPostFallback(nodes[0], root, pageInfo), pageInfo);

    nodes[10].matches = (selector) => selector.includes('[data-pressable-container]');
    nodes[10].hasAttribute = (name) => name === 'data-pressable-container';
    nodes[10].contains = (node) => root.contains(node);
    nodes[10].querySelectorAll = (selector) => selector.includes('a[href^') ? [{}] : [];
    nodes[10].querySelector = (selector) => selector.includes('a[href^') ? {} : null;
    nodes[0].closest = () => nodes[10];
    assert.equal(runtime.testing.getOwnedDetailPostFallback(nodes[0], root, pageInfo), null);
});

test('detail media ownership fails closed for a nested boundary containing multiple post IDs', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const element = { parentElement: null, closest() { return null; } };
    const boundary = {
        parentElement: null,
        matches() { return true; },
        hasAttribute() { return false; },
        querySelectorAll(selector) {
            return selector.includes('/post/') ? [
                { href: 'https://www.threads.com/@outer/post/POST_A' },
                { href: 'https://www.threads.com/@quote/post/POST_B' }
            ] : [];
        },
        querySelector() { return null; }
    };
    const root = {
        contains(node) { return node === element || node === boundary; }
    };
    element.parentElement = boundary;
    boundary.parentElement = root;
    assert.equal(runtime.testing.isMediaOwnedByPost(element, root, 'POST_A'), false);
});

test('post context ignores a geometrically closer permalink from another nested boundary', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const outerBoundary = {};
    const quoteBoundary = {};
    const media = {
        closest() { return outerBoundary; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
    };
    const makeLink = (href, boundary, top) => ({
        href,
        closest() { return boundary; },
        contains() { return false; },
        getBoundingClientRect() { return { left: 0, top, width: 20, height: 20 }; }
    });
    const outerLink = makeLink('https://www.threads.com/@outer/post/POST_A', outerBoundary, 500);
    const quoteLink = makeLink('https://www.threads.com/@quote/post/POST_B', quoteBoundary, 1);
    const root = {
        matches() { return false; },
        contains(node) { return node === outerBoundary || node === quoteBoundary; },
        querySelectorAll() { return [quoteLink, outerLink]; }
    };

    assert.equal(runtime.testing.findBestPostInfoInNode(root, media).postId, 'POST_A');
});

test('clean-link action never borrows the only permalink from a nested quoted post', async (t) => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'https://www.threads.com/' };
    t.after(() => {
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
    });
    const clipboard = [];
    const runtime = await createThreadsRuntime({
        platform: { ...fakePlatform(), async writeClipboard(value) { clipboard.push(value); return true; } }
    });
    const quoteBoundary = {};
    const shareButton = {
        closest() { return root; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 20, height: 20 }; }
    };
    const quoteLink = {
        href: 'https://www.threads.com/@quote/post/QUOTE_1',
        closest() { return quoteBoundary; },
        contains() { return false; },
        getBoundingClientRect() { return { left: 0, top: 1, width: 20, height: 20 }; }
    };
    const root = {
        matches() { return false; },
        contains(node) { return node === root || node === quoteBoundary; },
        querySelectorAll() { return [quoteLink]; }
    };
    const token = runtime.testing.createUserActivationToken({
        isTrusted: true, type: 'click', detail: 1
    }, { isActive: true });

    assert.equal(runtime.testing.copyPostBlockCleanLink(root, shareButton, token), false);
    assert.deepEqual(clipboard, []);
});

test('unanchored post lookup rejects a permalink owned by a nested boundary', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const nestedBoundary = {};
    const element = {
        closest() { return null; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 20, height: 20 }; }
    };
    const link = {
        href: 'https://www.threads.com/@quote/post/QUOTE_1',
        closest() { return nestedBoundary; },
        contains() { return false; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 20, height: 20 }; }
    };
    const root = {
        matches() { return false; },
        contains(node) { return node === nestedBoundary; },
        querySelectorAll() { return [link]; }
    };
    assert.equal(runtime.testing.findBestPostInfoInNode(root, element), null);
});

test('runtime has explicit single-start, idempotent stop and immutable option updates', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform(), initialOptions: {} });
    assert.equal(await runtime.start(), true);
    assert.equal(await runtime.start(), false);
    const next = await runtime.updateOptions({ hoverScanIntervalMs: 9999 });
    assert.equal(next.hoverScanIntervalMs, 2000);
    assert.equal(Object.isFrozen(next), true);
    assert.equal(await runtime.stop(), true);
    assert.equal(await runtime.stop(), false);
});

test('runtime cannot restart after stop', async () => {
    const runtime = await createThreadsRuntime({ platform: fakePlatform(), initialOptions: {} });
    await runtime.stop();
    await assert.rejects(runtime.start(), /runtime_stopped/);
});

test('stop during asynchronous startup prevents late lifecycle installation', async () => {
    let releaseStyles;
    let stylesEntered;
    const entered = new Promise((resolve) => { stylesEntered = resolve; });
    const gate = new Promise((resolve) => { releaseStyles = resolve; });
    let styleDisposals = 0;
    let menuInstalls = 0;
    const platform = {
        ...fakePlatform(),
        async installStyles() {
            stylesEntered();
            await gate;
            return () => { styleDisposals += 1; };
        },
        async installSettingsUi() { menuInstalls += 1; return () => {}; }
    };
    const document = {
        body: null,
        documentElement: {},
        addEventListener() {},
        removeEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        addEventListener() {},
        removeEventListener() {},
        setTimeout() { return 1; },
        setInterval() { return 1; },
        clearTimeout() {},
        clearInterval() {},
        cancelAnimationFrame() {},
        getComputedStyle() { return { display: 'block', visibility: 'visible' }; }
    };
    const runtime = await createThreadsRuntime({ platform, document, window, initialOptions: {} });
    const starting = runtime.start();
    await entered;
    assert.equal(await runtime.stop(), true);
    releaseStyles();
    assert.equal(await starting, false);
    assert.equal(styleDisposals, 1);
    assert.equal(menuInstalls, 0);
});

test('a late blob response cannot save media after runtime stop', async () => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'https://www.threads.com/@author/post/POST_1' };
    let requestDetails;
    let abortCalls = 0;
    let savedBlobs = 0;
    const platform = {
        ...fakePlatform(),
        requestMedia(details) {
            requestDetails = details;
            return { abort() { abortCalls += 1; } };
        }
    };
    const document = {
        body: null,
        documentElement: {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        clearTimeout() {},
        clearInterval() {},
        cancelAnimationFrame() {}
    };
    const runtime = await createThreadsRuntime({ platform, document, window, initialOptions: {} });
    const token = runtime.testing.createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true });
    const completion = runtime.testing.downloadViaBlob({
        type: 'image',
        url: 'https://cdninstagram.com/photo.jpg'
    }, 'safe.jpg', token, {
        saveBlob() { savedBlobs += 1; },
        setTimeoutFn() { return 1; },
        clearTimeoutFn() {}
    });
    await runtime.stop();
    await assert.rejects(completion, /runtime stopped|download aborted/i);
    requestDetails.onload({
        status: 200,
        finalUrl: 'https://cdninstagram.com/photo.jpg',
        response: { type: 'image/jpeg' },
        responseHeaders: 'content-type: image/jpeg'
    });
    assert.equal(abortCalls, 1);
    assert.equal(savedBlobs, 0);
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
});

test('native share deferred close cannot click the page after runtime stop', async (t) => {
    const originalElement = globalThis.Element;
    const originalKeyboardEvent = globalThis.KeyboardEvent;
    globalThis.Element = class {};
    globalThis.KeyboardEvent = class {
        constructor(type, init) { this.type = type; Object.assign(this, init); }
    };
    t.after(() => {
        if (originalElement === undefined) delete globalThis.Element;
        else globalThis.Element = originalElement;
        if (originalKeyboardEvent === undefined) delete globalThis.KeyboardEvent;
        else globalThis.KeyboardEvent = originalKeyboardEvent;
    });

    let deferredClose;
    let clicks = 0;
    const document = {
        activeElement: null,
        body: { dispatchEvent() {} },
        documentElement: {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        setTimeout(callback) { deferredClose = callback; return 7; },
        clearTimeout() {},
        clearInterval() {},
        cancelAnimationFrame() {},
        getComputedStyle() { return { display: 'block', visibility: 'visible' }; }
    };
    const runtime = await createThreadsRuntime({ platform: fakePlatform(), document, window, initialOptions: {} });
    runtime.testing.closeNativeShareMenu({
        shareButton: { isConnected: true, click() { clicks += 1; } }
    }, {
        isConnected: true,
        getBoundingClientRect() { return { width: 50, height: 50 }; }
    });

    await runtime.stop();
    deferredClose();
    assert.equal(clicks, 0);
});

test('performance counters prove filtered mutation refresh, one parse, route cache reset and stop cleanup', async (t) => {
    const originalElement = globalThis.Element;
    const originalNode = globalThis.Node;
    const originalLocation = globalThis.location;
    globalThis.Element = class {};
    globalThis.Node = { ELEMENT_NODE: 1 };
    globalThis.location = { href: 'https://www.threads.com/@author/post/POST_1' };
    t.after(() => {
        if (originalElement === undefined) delete globalThis.Element;
        else globalThis.Element = originalElement;
        if (originalNode === undefined) delete globalThis.Node;
        else globalThis.Node = originalNode;
        if (originalLocation === undefined) delete globalThis.location;
        else globalThis.location = originalLocation;
    });

    let observerCallback;
    let timerId = 0;
    const timeouts = new Map();
    const intervals = new Map();
    const listeners = new Map();
    const body = {
        nodeType: 1,
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        querySelectorAll() { return []; }
    };
    const document = {
        body,
        documentElement: { nodeType: 1, scrollLeft: 0, scrollTop: 0 },
        scripts: [],
        activeElement: null,
        addEventListener(type, handler) { listeners.set(`document:${type}`, handler); },
        removeEventListener(type) { listeners.delete(`document:${type}`); },
        createElement() {
            return {
                className: '',
                style: {},
                dataset: {},
                setAttribute() {},
                addEventListener() {},
                remove() {},
                appendChild() {},
                getBoundingClientRect() { return { width: 0, height: 0 }; }
            };
        },
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        scrollX: 0,
        scrollY: 0,
        navigator: {},
        addEventListener(type, handler) { listeners.set(`window:${type}`, handler); },
        removeEventListener(type) { listeners.delete(`window:${type}`); },
        setTimeout(callback) { timerId += 1; timeouts.set(timerId, callback); return timerId; },
        clearTimeout(id) { timeouts.delete(id); },
        setInterval(callback) { timerId += 1; intervals.set(timerId, callback); return timerId; },
        clearInterval(id) { intervals.delete(id); },
        requestAnimationFrame(callback) { timerId += 1; timeouts.set(timerId, callback); return timerId; },
        cancelAnimationFrame(id) { timeouts.delete(id); },
        getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
        MutationObserver: class {
            constructor(callback) { observerCallback = callback; }
            observe() {}
            disconnect() { observerCallback = null; }
        }
    };
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        captureSource: null,
        document,
        window,
        initialOptions: {}
    });
    assert.equal(await runtime.start(), true);
    let snapshot = runtime.testing.getPerformanceSnapshot();
    assert.equal(snapshot.fullRefreshes, 0);
    assert.equal(snapshot.activeIntervalCount, 2);
    assert.equal(snapshot.observerActive, true);

    const pluginNode = {
        nodeType: 1,
        matches(selector) { return selector.includes('.tm-post-copy-tool-button'); }
    };
    observerCallback([{ type: 'childList', addedNodes: [pluginNode], removedNodes: [] }]);
    snapshot = runtime.testing.getPerformanceSnapshot();
    assert.equal(snapshot.observerCallbacks, 1);
    assert.equal(snapshot.fullRefreshes, 0);

    const pageNode = { nodeType: 1, matches() { return false; } };
    observerCallback([{ type: 'childList', addedNodes: [pageNode], removedNodes: [] }]);
    const queuedRefresh = [...timeouts.values()].find(Boolean);
    queuedRefresh();
    snapshot = runtime.testing.getPerformanceSnapshot();
    assert.equal(snapshot.observerCallbacks, 2);
    assert.equal(snapshot.fullRefreshes, 1);

    runtime.testing.extractVideoUrlsFromText(JSON.stringify({
        post: {
            code: 'POST_1',
            image_versions2: { candidates: [{ url: 'https://cdninstagram.com/photo.jpg' }] }
        }
    }));
    snapshot = runtime.testing.getPerformanceSnapshot();
    assert.equal(snapshot.networkPayloadParses, 1);
    assert.equal(snapshot.imageRouteCacheEntries, 1);

    globalThis.location.href = 'https://www.threads.com/@author/post/POST_2';
    runtime.testing.syncMediaRouteScope();
    snapshot = runtime.testing.getPerformanceSnapshot();
    assert.equal(snapshot.routeTransitions, 1);
    assert.equal(snapshot.imageRouteCacheEntries, 0);

    await runtime.stop();
    snapshot = runtime.testing.getPerformanceSnapshot();
    assert.equal(snapshot.listenerCount, 0);
    assert.equal(snapshot.startupTimerCount, 0);
    assert.equal(snapshot.pendingTimeoutCount, 0);
    assert.equal(snapshot.animationFrameCount, 0);
    assert.equal(snapshot.activeIntervalCount, 0);
    assert.equal(snapshot.observerActive, false);
    assert.equal(intervals.size, 0);
});

test('userscript network hooks reject stale fetch and XHR captures across an A-B-A route cycle', async (t) => {
    const originalLocation = globalThis.location;
    const routeA = 'https://www.threads.com/@author/post/POST_A';
    const routeB = 'https://www.threads.com/@author/post/POST_B';
    globalThis.location = { href: routeA };

    const routeListeners = new Map();
    const navigationListeners = new Map();
    const pendingFetches = [];
    const nativeFetch = () => new Promise((resolve) => pendingFetches.push(resolve));
    const nativePushState = function (_state, _unused, url) {
        globalThis.location.href = new URL(url, globalThis.location.href).href;
    };
    const nativeReplaceState = function (_state, _unused, url) {
        globalThis.location.href = new URL(url, globalThis.location.href).href;
    };

    class FakeXhr {
        constructor() {
            this.listeners = new Map();
            this.status = 200;
            this.responseType = '';
            this.responseText = '{}';
            this.responseURL = 'https://www.threads.com/api/graphql?operationName=BarcelonaFeedQuery';
        }
        open() {}
        send() {}
        setRequestHeader() {}
        addEventListener(type, handler) { this.listeners.set(type, handler); }
        removeEventListener(type, handler) {
            if (this.listeners.get(type) === handler) this.listeners.delete(type);
        }
        getResponseHeader(name) {
            return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
        }
        dispatch(type) {
            const handler = this.listeners.get(type);
            this.listeners.delete(type);
            handler?.call(this);
        }
    }

    const targetWindow = {
        fetch: nativeFetch,
        XMLHttpRequest: FakeXhr,
        history: {
            pushState: nativePushState,
            replaceState: nativeReplaceState
        },
        navigation: {
            addEventListener(type, handler) { navigationListeners.set(type, handler); },
            removeEventListener(type, handler) {
                if (navigationListeners.get(type) === handler) navigationListeners.delete(type);
            }
        },
        addEventListener(type, handler) { routeListeners.set(type, handler); },
        removeEventListener(type, handler) {
            if (routeListeners.get(type) === handler) routeListeners.delete(type);
        }
    };
    const runtime = await createThreadsRuntime({ platform: fakePlatform() });
    const uninstall = runtime.testing.installNetworkHooks(targetWindow);
    t.after(() => {
        uninstall();
        if (originalLocation === undefined) delete globalThis.location;
        else globalThis.location = originalLocation;
    });

    const requestUrl = 'https://www.threads.com/api/graphql?operationName=BarcelonaFeedQuery';
    const staleFetch = targetWindow.fetch(requestUrl);
    const staleXhr = new targetWindow.XMLHttpRequest();
    staleXhr.open('GET', requestUrl);
    staleXhr.send();

    targetWindow.history.pushState({}, '', routeB);
    targetWindow.history.pushState({}, '', routeA);
    assert.equal(globalThis.location.href, routeA);

    pendingFetches.shift()({
        status: 200,
        url: requestUrl,
        headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
        clone() { return { body: null, text: async () => '{}' }; }
    });
    await staleFetch;
    staleXhr.dispatch('load');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.testing.getPerformanceSnapshot().networkPayloadParses, 0);

    const preCommitNavigationFetch = targetWindow.fetch(requestUrl);
    navigationListeners.get('navigate')?.({ destination: { url: `${routeA}#media` } });
    assert.equal(globalThis.location.href, routeA);
    pendingFetches.shift()({
        status: 200,
        url: requestUrl,
        headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
        clone() { return { body: null, text: async () => '{}' }; }
    });
    await preCommitNavigationFetch;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.testing.getPerformanceSnapshot().networkPayloadParses, 0);

    const currentFetch = targetWindow.fetch(requestUrl);
    pendingFetches.shift()({
        status: 200,
        url: requestUrl,
        headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
        clone() { return { body: null, text: async () => '{}' }; }
    });
    await currentFetch;
    const currentXhr = new targetWindow.XMLHttpRequest();
    currentXhr.open('GET', requestUrl);
    currentXhr.send();
    currentXhr.dispatch('load');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.testing.getPerformanceSnapshot().networkPayloadParses, 2);

    uninstall();
    assert.equal(targetWindow.fetch, nativeFetch);
    assert.equal(targetWindow.history.pushState, nativePushState);
    assert.equal(targetWindow.history.replaceState, nativeReplaceState);
    assert.equal(routeListeners.size, 0);
    assert.equal(navigationListeners.size, 0);
});

test('Chrome capture ingestion requires the current route generation before writing media state', async (t) => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'https://www.threads.com/@author/post/POST_1' };
    t.after(() => {
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
    });
    const document = {
        body: null,
        documentElement: {},
        addEventListener() {},
        removeEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        addEventListener() {},
        removeEventListener() {},
        setTimeout() { return 1; },
        setInterval() { return 1; },
        clearTimeout() {},
        clearInterval() {},
        cancelAnimationFrame() {},
        getComputedStyle() { return { display: 'block', visibility: 'visible' }; }
    };
    const runtime = await createThreadsRuntime({
        platform: fakePlatform(),
        captureSource: null,
        document,
        window,
        initialOptions: {}
    });
    assert.equal(await runtime.start(), true);
    const currentGeneration = '0123456789abcdef0123456789abcdef';
    const staleGeneration = '11111111111111111111111111111111';
    assert.equal(runtime.setCaptureRouteGeneration(currentGeneration), true);
    const records = [{
        type: 'video',
        url: 'https://video.cdninstagram.com/media.mp4',
        postId: 'POST_1'
    }];
    assert.equal(runtime.ingestCapturedMedia(records, globalThis.location.href, staleGeneration), false);
    assert.equal(runtime.testing.getPerformanceSnapshot().videoRouteCacheEntries, 0);
    assert.equal(runtime.ingestCapturedMedia(records, globalThis.location.href, currentGeneration), true);
    assert.equal(runtime.testing.getPerformanceSnapshot().videoRouteCacheEntries, 1);
    const exactStructuredRecords = Array.from({ length: MAX_STRUCTURED_RECORDS_PER_ROUTE }, (_, index) => ({
        type: 'video',
        url: `https://video.cdninstagram.com/media-${index}.mp4`,
        postId: 'POST_1'
    }));
    assert.equal(runtime.ingestCapturedMedia(
        exactStructuredRecords, globalThis.location.href, currentGeneration
    ), true);
    assert.equal(
        runtime.testing.getPerformanceSnapshot().structuredRouteRecordCount,
        MAX_STRUCTURED_RECORDS_PER_ROUTE
    );
    const overflowStructuredRecords = [...exactStructuredRecords, {
        type: 'video',
        url: 'https://video.cdninstagram.com/media-overflow.mp4',
        postId: 'POST_1'
    }];
    assert.equal(runtime.ingestCapturedMedia(
        overflowStructuredRecords, globalThis.location.href, currentGeneration
    ), true);
    assert.equal(
        runtime.testing.getPerformanceSnapshot().structuredRouteRecordCount,
        MAX_STRUCTURED_RECORDS_PER_ROUTE
    );
    await runtime.stop();
    assert.equal(runtime.ingestCapturedMedia(records, globalThis.location.href, currentGeneration), false);
});
