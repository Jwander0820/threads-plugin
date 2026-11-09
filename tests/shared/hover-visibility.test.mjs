import assert from 'node:assert/strict';
import test from 'node:test';
import { createThreadsRuntime } from '../../src/shared/threads-runtime.js';

globalThis.location = { href: 'https://www.threads.com/@author/post/POST_1' };
globalThis.Node = { ELEMENT_NODE: 1 };

function rect(left, top, width, height) {
    return { left, top, width, height, right: left + width, bottom: top + height };
}

async function fixture() {
    const listeners = new Map();
    const button = {
        style: {}, dataset: {}, setAttribute() {}, addEventListener(type, fn) { listeners.set(type, fn); },
        contains(node) { return node === this; }, remove() {}
    };
    const root = { parentElement: null, clientLeft: 0, clientTop: 0,
        clientWidth: 1280, clientHeight: 1000, offsetWidth: 1280, offsetHeight: 5000,
        computedStyle: { display: 'block', overflowX: 'visible', overflowY: 'visible' },
        contains: node => node.isConnected, getBoundingClientRect: () => rect(0, 0, 1280, 5000) };
    const body = { parentElement: root, appendChild() {}, clientLeft: 0, clientTop: 0,
        clientWidth: 1280, clientHeight: 5000, offsetWidth: 1280, offsetHeight: 5000,
        computedStyle: { display: 'block', overflowX: 'visible', overflowY: 'visible' },
        getBoundingClientRect: () => rect(0, 0, 1280, 5000) };
    const container = { parentElement: body, clientLeft: 0, clientTop: 0,
        clientWidth: 600, clientHeight: 600, offsetWidth: 600, offsetHeight: 600,
        scrollWidth: 600, scrollHeight: 1200,
        getBoundingClientRect: () => rect(180, 120, 600, 600) };
    const media = { tagName: 'IMG', parentElement: container, isConnected: true,
        src: 'https://cdninstagram.com/photo.jpg', getAttribute: () => '', closest: () => null,
        getBoundingClientRect: () => media.rect, rect: rect(200, 150, 400, 300) };
    let hit = media;
    const document = {
        body, documentElement: root,
        elementsFromPoint: () => [button, hit], querySelectorAll: () => [], getElementById: () => null
    };
    const window = { innerWidth: 1280, innerHeight: 1000, clearTimeout() {},
        requestAnimationFrame: () => 1,
        getComputedStyle: node => node.computedStyle || ({ overflowX: 'hidden', overflowY: 'auto' }) };
    document.createElement = () => button;
    const runtime = await createThreadsRuntime({ platform: {}, document, window, initialOptions: {} });
    return { runtime, button, media, container, document, window, listeners, setHit(node) { hit = node; } };
}

test('document-root overflow never shrinks the viewport after deep document scrolling', async () => {
    const { runtime, button, media, document } = await fixture();
    document.documentElement.computedStyle = { overflowX: 'hidden', overflowY: 'auto' };
    for (const scrollY of [500, 1200, 4000]) {
        document.documentElement.getBoundingClientRect = () => rect(0, -scrollY, 1280, 5000);
        runtime.testing.showHoverButton(media);
        assert.equal(button.dataset.tmHidden, '0', `root scroll ${scrollY}`);
    }
});

test('body overflow propagated to the viewport does not reject visible media after deep scrolling', async () => {
    const { runtime, button, media, document } = await fixture();
    Object.assign(document.body, {
        clientHeight: 1000, offsetHeight: 1000,
        computedStyle: { overflowX: 'hidden', overflowY: 'auto' },
        getBoundingClientRect: () => rect(0, -2200, 1280, 1000)
    });
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
});

test('ordinary non-scrollable media wrappers do not become extra download eligibility limits', async () => {
    const { runtime, button, media, container } = await fixture();
    media.parentElement = {
        parentElement: container, clientLeft: 0, clientTop: 0,
        clientWidth: 400, clientHeight: 0, offsetWidth: 400, offsetHeight: 0,
        scrollWidth: 400, scrollHeight: 0,
        computedStyle: { display: 'block', position: 'static', overflowX: 'hidden', overflowY: 'hidden' },
        getBoundingClientRect: () => rect(200, 150, 400, 0)
    };
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
});

test('scaled scrollport geometry stays in viewport coordinates', async () => {
    const { runtime, button, media, container } = await fixture();
    container.clientWidth = container.offsetWidth = 300;
    container.clientHeight = container.offsetHeight = 300;
    media.rect = rect(200, 550, 200, 200);
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.top, '560px');
});

test('immediate scroll limiting does not re-run media discovery or classification', async () => {
    const { runtime, button, media } = await fixture();
    runtime.testing.showHoverButton(media);
    let attributeReads = 0;
    media.getAttribute = () => { attributeReads += 1; return ''; };
    runtime.testing.refreshButtonsSoon({ type: 'scroll' });
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(attributeReads, 0);
});

test('an ordinary media overlay does not suppress the floating button or its download', async () => {
    const f = await fixture();
    f.setHit({ tagName: 'DIV', parentElement: f.container });
    f.runtime.testing.showHoverButton(f.media);
    assert.equal(f.button.dataset.tmHidden, '0');
    let downloads = 0;
    const token = f.runtime.testing.createUserActivationToken({ isTrusted: true, type: 'click', detail: 1 }, { isActive: true });
    assert.equal(await f.runtime.testing.activateButton(f.button, token, {
        resolveMediaItem: async () => ({ type: 'image', url: f.media.src }),
        downloadItemFn: async () => { downloads += 1; return true; },
        setTimeoutFn: () => 1
    }), true);
    assert.equal(downloads, 1);
});

test('inline and display-contents wrappers do not count as zero-sized content windows', async () => {
    const { runtime, button, media, container } = await fixture();
    const wrapper = {
        parentElement: container, clientLeft: 0, clientTop: 0, clientWidth: 0, clientHeight: 0,
        computedStyle: { display: 'inline', overflowX: 'hidden', overflowY: 'hidden' },
        getBoundingClientRect: () => rect(200, 150, 400, 300)
    };
    media.parentElement = wrapper;
    for (const display of ['inline', 'contents']) {
        wrapper.computedStyle.display = display;
        runtime.testing.showHoverButton(media);
        assert.equal(button.dataset.tmHidden, '0', display);
    }
});

test('hover button stays inside the content while media is partially visible, then hides', async () => {
    const { runtime, button, media } = await fixture();
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.left, '210px');
    assert.equal(button.style.top, '160px');
    media.rect = rect(200, -50, 400, 300);
    runtime.testing.refreshButtonsSoon({ type: 'scroll' });
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.top, '120px');
    media.rect = rect(200, -180, 400, 300);
    runtime.testing.refreshButtonsSoon({ type: 'scroll' });
    assert.equal(button.dataset.tmHidden, '1');
    assert.equal(button.style.top, '');
});

test('hover button hides only when media leaves the content or is detached', async () => {
    const f = await fixture();
    for (const top of [-500, 720, 1010]) {
        f.media.rect = rect(200, top, 400, 300);
        f.runtime.testing.showHoverButton(f.media);
        assert.equal(f.button.dataset.tmHidden, '1', `media top ${top}`);
    }
    f.media.rect = rect(200, 150, 400, 300);
    f.runtime.testing.showHoverButton(f.media);
    assert.equal(f.button.dataset.tmHidden, '0');
    f.media.isConnected = false;
    f.runtime.testing.refreshHoverButtonLayout();
    assert.equal(f.button.dataset.tmHidden, '1');
});

test('click rechecks visibility before resolving or downloading stale media', async () => {
    const { runtime, button, media } = await fixture();
    runtime.testing.showHoverButton(media);
    media.rect = rect(200, -180, 400, 300);
    let resolutions = 0;
    const token = runtime.testing.createUserActivationToken({ isTrusted: true, type: 'click', detail: 1 }, { isActive: true });
    const result = await runtime.testing.activateButton(button, token, {
        resolveMediaItem: async () => { resolutions += 1; return { type: 'image', url: media.src }; },
        downloadItemFn: async () => true,
        setTimeoutFn: () => 1
    });
    assert.equal(result, false);
    assert.equal(resolutions, 0);
    assert.equal(button.dataset.tmHidden, '1');
});

test('horizontal scrolling bounds the button, then hides it when the media is outside', async () => {
    const { runtime, button, media, container } = await fixture();
    container.computedStyle = { overflowX: 'auto', overflowY: 'auto' };
    container.scrollWidth = 1200;
    container.nodeType = 1;
    container.scrollTop = 0;
    container.scrollLeft = 0;
    runtime.testing.showHoverButton(media);
    runtime.testing.refreshButtonsSoon({ type: 'scroll', target: container });
    media.rect = rect(100, 150, 400, 300);
    container.scrollLeft = 100;
    runtime.testing.refreshButtonsSoon({ type: 'scroll', target: container });
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.left, '180px');
    media.rect = rect(-220, 150, 400, 300);
    container.scrollLeft = 420;
    runtime.testing.refreshButtonsSoon({ type: 'scroll', target: container });
    assert.equal(button.dataset.tmHidden, '1');
});

test('the main content boundary applies even without overflow clipping', async () => {
    const { runtime, button, media, container } = await fixture();
    container.matches = selector => selector.includes('main');
    container.computedStyle = { overflowX: 'visible', overflowY: 'visible' };
    media.rect = rect(200, 80, 400, 300);
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.top, '120px');
    media.rect = rect(200, -180, 400, 300);
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '1');
});

test('document-scrolled Threads content stays below its sticky sibling header', async () => {
    const { runtime, button, media, container } = await fixture();
    // Live Threads structure: a 72px sticky column header is a sibling of
    // the body, whose document-scrolled bounding rect starts above the screen.
    container.getBoundingClientRect = () => rect(180, -228, 600, 4262);
    container.clientHeight = 4262;
    container.previousElementSibling = {
        computedStyle: { position: 'sticky' },
        getBoundingClientRect: () => rect(180, 0, 600, 72)
    };
    media.rect = rect(200, -120, 400, 700);
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.top, '72px');
    media.rect = rect(200, -628, 400, 700);
    runtime.testing.refreshButtonsSoon({ type: 'scroll' });
    assert.equal(button.dataset.tmHidden, '1');
});

test('unrelated sticky sidebars and headers that are not pinned do not hide media controls', async () => {
    const { runtime, button, media, container } = await fixture();
    container.getBoundingClientRect = () => rect(180, -228, 600, 4262);
    container.clientHeight = 4262;
    media.rect = rect(200, -120, 400, 700);
    for (const bounds of [rect(0, 0, 100, 800), rect(180, -100, 600, 72), rect(180, 200, 600, 72)]) {
        container.previousElementSibling = {
            computedStyle: { position: 'sticky' }, getBoundingClientRect: () => bounds
        };
        runtime.testing.showHoverButton(media);
        assert.equal(button.dataset.tmHidden, '0');
        assert.equal(button.style.top, '8px');
    }
});

test('a sticky header inside a nested scrollport is excluded after all content bounds are known', async () => {
    const { runtime, button, media, container } = await fixture();
    media.parentElement = {
        parentElement: container,
        previousElementSibling: {
            computedStyle: { position: 'sticky' }, getBoundingClientRect: () => rect(180, 120, 600, 72)
        },
        computedStyle: { display: 'block', overflowX: 'visible', overflowY: 'visible' }
    };
    media.rect = rect(200, -80, 400, 700);
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.top, '192px');
});

test('an accessible gallery region is not automatically the main content viewport', async () => {
    const { runtime, button, media, container } = await fixture();
    media.parentElement = {
        parentElement: container, clientLeft: 0, clientTop: 0,
        clientWidth: 400, clientHeight: 0, offsetWidth: 400, offsetHeight: 0,
        matches: selector => selector.includes('[role="region"]'),
        computedStyle: { display: 'block', position: 'static', overflowX: 'visible', overflowY: 'visible' },
        getBoundingClientRect: () => rect(200, 150, 400, 0)
    };
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
});

test('expanded media is bounded by its viewer rather than the background column and backdrop', async () => {
    const { runtime, button, media, container } = await fixture();
    container.previousElementSibling = {
        computedStyle: { position: 'fixed' }, getBoundingClientRect: () => rect(0, 0, 1280, 1000)
    };
    const viewer = {
        parentElement: container, clientLeft: 0, clientTop: 0,
        clientWidth: 1280, clientHeight: 1000, offsetWidth: 1280, offsetHeight: 1000,
        scrollWidth: 1280, scrollHeight: 2000,
        computedStyle: { display: 'block', position: 'fixed', overflowX: 'auto', overflowY: 'auto' },
        getBoundingClientRect: () => rect(0, 0, 1280, 1000)
    };
    media.parentElement = viewer;
    media.closest = selector => selector.includes('[role="dialog"]') ? viewer : null;
    media.rect = rect(440, 0, 400, 1000);
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    assert.equal(button.style.left, '450px');
    assert.equal(button.style.top, '10px');
    let downloads = 0;
    const token = runtime.testing.createUserActivationToken({ isTrusted: true, type: 'click', detail: 1 }, { isActive: true });
    assert.equal(await runtime.testing.activateButton(button, token, {
        resolveMediaItem: async () => ({ type: 'image', url: media.src }),
        downloadItemFn: async () => { downloads += 1; return true; }, setTimeoutFn: () => 1
    }), true);
    assert.equal(downloads, 1);
});

test('route transitions clear a visible control even when its old media remains connected', async (t) => {
    const { runtime, button, media } = await fixture();
    const previous = globalThis.location.href;
    t.after(() => { globalThis.location.href = previous; });
    runtime.testing.syncMediaRouteScope();
    runtime.testing.showHoverButton(media);
    assert.equal(button.dataset.tmHidden, '0');
    globalThis.location.href = 'https://www.threads.com/@author/post/POST_2';
    runtime.testing.syncMediaRouteScope();
    assert.equal(button.dataset.tmHidden, '1');
});
