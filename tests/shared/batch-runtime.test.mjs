import assert from 'node:assert/strict';
import test from 'node:test';

import { createThreadsRuntime } from '../../src/shared/threads-runtime.js';

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function media(index, overrides = {}) {
    return {
        type: 'image', index, selected: true,
        resolvedUrl: `https://cdninstagram.com/item-${index}.jpg`,
        element: { mediaIndex: index },
        postInfo: { author: 'author', postId: 'POST_BATCH' },
        ...overrides
    };
}

async function setup(t, platformOverrides = {}) {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'https://www.threads.com/@author/post/POST_BATCH' };
    const runtime = await createThreadsRuntime({
        document: undefined,
        window: undefined,
        platform: {
            async saveOptions() {},
            ...platformOverrides
        }
    });
    t.after(async () => {
        await runtime.stop();
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
    });
    const token = () => runtime.testing.createUserActivationToken({
        isTrusted: true, type: 'click', detail: 1
    }, { isActive: true });
    return { runtime, token };
}

test('browser-tracked completion is not cancelled by a manager idle watchdog', async (t) => {
    let details;
    const { runtime, token } = await setup(t, {
        tracksDownloadCompletion: true,
        downloadMedia(value) { details = value; return { abort() { assert.fail('unexpected abort'); } }; }
    });
    const pending = runtime.testing.downloadItem({
        type: 'image', url: 'https://cdninstagram.com/item.jpg',
        postInfo: { author: 'author', postId: 'POST_BATCH' }
    }, token(), {
        setTimeoutFn() { assert.fail('browser downloads must not use manager watchdog timers'); }
    });
    details.onprogress({ loaded: 0 });
    details.onload();
    assert.equal(await pending, true);
});

test('batch returns every outcome and retries only failed or missing items irrespective of selection', async (t) => {
    const { runtime, token } = await setup(t);
    const items = [media(1), media(2), media(3, { resolvedUrl: '' }), media(4)];
    const first = await runtime.testing.downloadModalItems(true, token(), {
        items,
        async resolveItem() { return null; },
        async downloadFn(item) {
            if (item.url.endsWith('item-4.jpg')) throw new Error('offline');
            return item.url.endsWith('item-1.jpg');
        },
        async delayFn() {}
    });
    assert.equal(first.completed, true);
    assert.deepEqual(first.counts, { success: 1, failed: 2, not_found: 1, cancelled: 0 });
    assert.deepEqual(first.results.map(result => result.status), ['success', 'failed', 'not_found', 'failed']);

    const retried = [];
    const second = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true,
        items: items.map(item => ({ ...item, selected: false })),
        async resolveItem(element) {
            assert.equal(element.mediaIndex, 3);
            return { type: 'image', url: 'https://cdninstagram.com/item-3.jpg' };
        },
        async downloadFn(item) { retried.push(item.url); return true; },
        async delayFn() {}
    });
    assert.deepEqual(retried, [2, 3, 4].map(index => `https://cdninstagram.com/item-${index}.jpg`));
    assert.deepEqual(second.counts, { success: 4, failed: 0, not_found: 0, cancelled: 0 });
    assert.equal(second.results.length, 4);
});

test('SPA location change during media resolution prevents download before the refresh observer runs', async (t) => {
    const { runtime, token } = await setup(t);
    const entered = deferred();
    const resolution = deferred();
    let downloads = 0;
    const pending = runtime.testing.downloadModalItems(true, token(), {
        items: [media(1, { resolvedUrl: '' }), media(2)],
        async resolveItem() { entered.resolve(); return resolution.promise; },
        async downloadFn() { downloads += 1; return true; },
        async delayFn() {}
    });
    await entered.promise;
    globalThis.location.href = 'https://www.threads.com/@other/post/POST_OTHER';
    resolution.resolve({ type: 'image', url: 'https://cdninstagram.com/item-1.jpg' });
    const result = await pending;
    assert.equal(downloads, 0);
    assert.equal(result.completed, false);
    assert.equal(result.counts.cancelled, 2);
});

test('disabling then re-enabling while resolving cannot revive an old batch or overwrite a newer result', async (t) => {
    const { runtime, token } = await setup(t);
    const entered = deferred();
    const resolution = deferred();
    let oldDownloads = 0;
    const pending = runtime.testing.downloadModalItems(true, token(), {
        items: [media(1, { resolvedUrl: '' })],
        async resolveItem() { entered.resolve(); return resolution.promise; },
        async downloadFn() { oldDownloads += 1; return true; },
        async delayFn() {}
    });
    await entered.promise;
    await runtime.updateOptions({ enableBatchMediaDownload: false });
    await runtime.updateOptions({ enableBatchMediaDownload: true });
    const newer = await runtime.testing.downloadModalItems(true, token(), {
        items: [media(2)],
        async downloadFn() { return false; },
        async delayFn() {}
    });
    assert.equal(newer.counts.failed, 1);
    resolution.resolve({ type: 'image', url: 'https://cdninstagram.com/item-1.jpg' });
    const old = await pending;
    assert.equal(oldDownloads, 0);
    assert.equal(old.counts.cancelled, 1);
    assert.equal(old.completed, false);

    const retried = [];
    const retry = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true, items: [media(1), media(2)],
        async downloadFn(item) { retried.push(item.url); return true; },
        async delayFn() {}
    });
    assert.deepEqual(retried, ['https://cdninstagram.com/item-2.jpg']);
    assert.deepEqual(retry.counts, { success: 1, failed: 0, not_found: 0, cancelled: 0 });
});

test('stopping runtime aborts an active direct download and cancels queued items', async (t) => {
    const entered = deferred();
    let aborts = 0;
    let starts = 0;
    const { runtime, token } = await setup(t, {
        downloadMedia() {
            starts += 1;
            entered.resolve();
            return { abort() { aborts += 1; } };
        }
    });
    const pending = runtime.testing.downloadModalItems(true, token(), {
        items: [media(1), media(2)],
        async delayFn() {}
    });
    await entered.promise;
    await runtime.stop();
    const result = await pending;
    assert.equal(starts, 1);
    assert.equal(aborts, 1);
    assert.equal(result.completed, false);
    assert.deepEqual(result.counts, { success: 0, failed: 0, not_found: 0, cancelled: 2 });
    assert.equal(await runtime.testing.downloadModalItems(true, token(), { items: [media(1)] }), false);
});

test('a video gaining a poster after failure still retries the same media', async (t) => {
    const { runtime, token } = await setup(t);
    const item = media(1, { type: 'video', resolvedUrl: 'https://cdninstagram.com/video.mp4', previewUrl: '' });
    const first = await runtime.testing.downloadModalItems(true, token(), {
        items: [item], async downloadFn() { return false; }, async delayFn() {}
    });
    assert.equal(first.counts.failed, 1);
    let retries = 0;
    const second = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true,
        items: [{ ...item, previewUrl: 'https://cdninstagram.com/poster.jpg' }],
        async downloadFn() { retries += 1; return true; },
        async delayFn() {}
    });
    assert.equal(retries, 1);
    assert.deepEqual(second.counts, { success: 1, failed: 0, not_found: 0, cancelled: 0 });
});

test('cancelling a direct download cannot launch a blob fallback from a synchronous abort error', async (t) => {
    const entered = deferred();
    let blobRequests = 0;
    t.mock.method(console, 'warn', () => {});
    const { runtime, token } = await setup(t, {
        downloadMedia(details) {
            entered.resolve();
            return { abort() { details.onerror(new Error('network request cancelled')); } };
        },
        requestMedia() {
            blobRequests += 1;
            return { abort() {} };
        }
    });
    const pending = runtime.testing.downloadModalItems(true, token(), {
        items: [media(1)], async delayFn() {}
    });
    await entered.promise;
    await runtime.updateOptions({ enableBatchMediaDownload: false });
    const result = await pending;
    assert.equal(result.counts.cancelled, 1);
    assert.equal(blobRequests, 0);
});

test('retry follows failed media when structured carousel discovery changes its display index', async (t) => {
    const { runtime, token } = await setup(t);
    const original = [media(1), media(2)];
    const first = await runtime.testing.downloadModalItems(true, token(), {
        items: original,
        async downloadFn(item) { return item.url.endsWith('item-1.jpg'); },
        async delayFn() {}
    });
    assert.equal(first.counts.failed, 1);
    const retried = [];
    const result = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true,
        items: [{ ...original[1], index: 1 }, { ...original[0], index: 2 }],
        async downloadFn(item) { retried.push(item.url); return true; },
        async delayFn() {}
    });
    assert.deepEqual(retried, ['https://cdninstagram.com/item-2.jpg']);
    assert.deepEqual(result.counts, { success: 2, failed: 0, not_found: 0, cancelled: 0 });
});

test('duplicate carousel slots stay separate when only the later occurrence failed', async (t) => {
    const { runtime, token } = await setup(t);
    const original = [media(1, { selected: false }), media(2, {
        resolvedUrl: 'https://cdninstagram.com/item-1.jpg'
    })];
    const first = await runtime.testing.downloadModalItems(false, token(), {
        items: original, async downloadFn() { return false; }, async delayFn() {}
    });
    assert.equal(first.counts.failed, 1);
    const retried = [];
    const result = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true,
        items: [media(3), { ...original[0], index: 2 }, { ...original[1], index: 3 }],
        async downloadFn(item) { retried.push(item.element.mediaIndex); return true; },
        async delayFn() {}
    });
    assert.deepEqual(retried, [2]);
    assert.equal(result.results.length, 1);
    assert.deepEqual(result.counts, { success: 1, failed: 0, not_found: 0, cancelled: 0 });
});

test('missing video reconnects by its poster after resolution and carousel reordering', async (t) => {
    const { runtime, token } = await setup(t);
    const missing = media(2, {
        type: 'video', resolvedUrl: '', previewUrl: 'https://cdninstagram.com/poster.jpg'
    });
    const first = await runtime.testing.downloadModalItems(true, token(), {
        items: [media(1), missing],
        async resolveItem() { return null; },
        async downloadFn() { return true; },
        async delayFn() {}
    });
    assert.equal(first.counts.not_found, 1);
    const retried = [];
    const result = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true,
        items: [{ ...missing, index: 1, resolvedUrl: 'https://cdninstagram.com/video.mp4' }, media(1, { index: 2 })],
        async downloadFn(item) { retried.push(item.url); return true; },
        async delayFn() {}
    });
    assert.deepEqual(retried, ['https://cdninstagram.com/video.mp4']);
    assert.deepEqual(result.counts, { success: 2, failed: 0, not_found: 0, cancelled: 0 });
});

test('missing media without a poster reconnects only through its exact IMG or VIDEO element', async (t) => {
    const { runtime, token } = await setup(t);
    const element = { tagName: 'IMG' };
    const missing = media(2, { element, resolvedUrl: '', previewUrl: '' });
    await runtime.testing.downloadModalItems(true, token(), {
        items: [media(1), missing],
        async resolveItem() { return null; }, async downloadFn() { return true; }, async delayFn() {}
    });
    const retried = [];
    const result = await runtime.testing.downloadModalItems(false, token(), {
        retryOnly: true,
        items: [{ ...missing, index: 1, resolvedUrl: 'https://cdninstagram.com/newly-resolved.jpg' }, media(1, { index: 2 })],
        async downloadFn(item) { retried.push(item.url); return true; },
        async delayFn() {}
    });
    assert.deepEqual(retried, ['https://cdninstagram.com/newly-resolved.jpg']);
    assert.deepEqual(result.counts, { success: 2, failed: 0, not_found: 0, cancelled: 0 });
});
