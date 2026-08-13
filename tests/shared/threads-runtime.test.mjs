import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createThreadsRuntime,
    MAX_STRUCTURED_RECORDS_PER_ROUTE
} from '../../src/shared/threads-runtime.js';

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
