import assert from 'node:assert/strict';
import test from 'node:test';

import { createChromePlatformAdapter } from '../../src/chrome/platform-adapter.js';

test('Chrome adapter stores normalized options and bridges downloads', async () => {
    const writes = [];
    let changeListener;
    const chrome = {
        storage: {
            local: {
                async get() { return { options: { hoverScanIntervalMs: 9000 } }; },
                async set(value) { writes.push(value); }
            },
            onChanged: {
                addListener(listener) { changeListener = listener; },
                removeListener() {}
            }
        },
        runtime: {
            async sendMessage(message) {
                return message.type === 'DOWNLOAD_MEDIA'
                    ? { ok: true, downloadId: 7 }
                    : { ok: true, state: 'complete' };
            }
        }
    };
    const adapter = createChromePlatformAdapter({ chrome, navigator: { clipboard: { async writeText() {} } } });
    assert.equal(adapter.tracksDownloadCompletion, true);
    assert.equal(Object.getOwnPropertyDescriptor(adapter, 'tracksDownloadCompletion').set, undefined);
    assert.equal((await adapter.loadOptions()).hoverScanIntervalMs, 2000);
    assert.equal((await adapter.saveOptions({ backgroundScanIntervalMs: 1 })).backgroundScanIntervalMs, 3000);

    let loaded;
    adapter.downloadMedia({ url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg', onload: (value) => { loaded = value; } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(loaded, { downloadId: 7 });

    let updated;
    adapter.subscribeOptions((value) => { updated = value; });
    changeListener({ options: { newValue: { hoverScanIntervalMs: -1 } } }, 'local');
    assert.equal(updated.hoverScanIntervalMs, 0);
    assert.equal(writes.length, 1);
    assert.equal(typeof adapter.subscribeConsent, 'function');
});

function downloadFixture({ start, statuses = [] } = {}) {
    const messages = [];
    const timers = new Map();
    let timerId = 0;
    const chrome = {
        storage: { local: {} },
        runtime: {
            async sendMessage(message) {
                messages.push(message);
                if (message.type === 'DOWNLOAD_MEDIA') return start ? start() : { ok: true, downloadId: 19 };
                if (message.type === 'DOWNLOAD_STATUS') return statuses.shift();
                return { ok: true };
            }
        }
    };
    const adapter = createChromePlatformAdapter({
        chrome,
        setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
        clearTimeout(id) { timers.delete(id); }
    });
    const nextPoll = async () => {
        const [id, callback] = timers.entries().next().value;
        timers.delete(id);
        await callback();
    };
    return { adapter, messages, timers, nextPoll };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Chrome adapter waits for complete and sends progress only when bytes advance', async () => {
    const f = downloadFixture({ statuses: [
        { ok: true, state: 'in_progress', bytesReceived: 5, totalBytes: 10 },
        { ok: true, state: 'in_progress', bytesReceived: 5, totalBytes: 10 },
        { ok: true, state: 'in_progress', bytesReceived: 9, totalBytes: 10 },
        { ok: true, state: 'complete' }
    ] });
    const progress = [];
    const loaded = [];
    f.adapter.downloadMedia({
        url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg',
        onload: (event) => loaded.push(event), onprogress: (event) => progress.push(event)
    });
    await flush();
    assert.deepEqual(loaded, []);
    await f.nextPoll();
    await f.nextPoll();
    await f.nextPoll();
    assert.deepEqual(loaded, [{ downloadId: 19 }]);
    assert.deepEqual(progress.map((event) => event.loaded), [5, 9]);
    assert.equal(f.timers.size, 0);
});

test('Chrome adapter reports an interrupted transfer as failure, not success', async () => {
    const f = downloadFixture({ statuses: [{ ok: true, state: 'interrupted', interruptReason: 'USER_CANCELED' }] });
    const errors = [];
    let loaded = false;
    f.adapter.downloadMedia({
        url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg',
        onload() { loaded = true; }, onerror(error) { errors.push(error); }
    });
    await flush();
    assert.equal(loaded, false);
    assert.equal(errors[0].code, 'download_interrupted');
    assert.equal(errors[0].interruptReason, 'USER_CANCELED');
    assert.equal(f.timers.size, 0);
});

test('abort cancels only the initiated download, including when initiation acknowledgement is pending', async () => {
    let release;
    const f = downloadFixture({ start: () => new Promise((resolve) => { release = resolve; }) });
    let callbackCount = 0;
    const handle = f.adapter.downloadMedia({
        url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg',
        onload() { callbackCount += 1; }, onerror() { callbackCount += 1; }
    });
    handle.abort();
    release({ ok: true, downloadId: 19 });
    await flush();
    assert.equal(callbackCount, 0);
    assert.deepEqual(f.messages.map((message) => message.type), ['DOWNLOAD_MEDIA', 'CANCEL_DOWNLOAD']);
    assert.equal(f.messages[1].downloadId, 19);
    assert.equal(f.timers.size, 0);
});

test('abort clears polling and ignores a status request already in flight', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const f = downloadFixture({ statuses: [
        { ok: true, state: 'in_progress', bytesReceived: 0 }, pending
    ] });
    let callbackCount = 0;
    const handle = f.adapter.downloadMedia({
        url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg',
        onload() { callbackCount += 1; }, onerror() { callbackCount += 1; }
    });
    await flush();
    const inFlight = f.nextPoll();
    handle.abort();
    release({ ok: true, state: 'complete' });
    await inFlight;
    assert.equal(callbackCount, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.messages.at(-1).type, 'CANCEL_DOWNLOAD');
});

test('status failures fail once and release the owned transfer', async () => {
    const f = downloadFixture({ statuses: [{ ok: false, error: 'permission_revoked' }] });
    const errors = [];
    f.adapter.downloadMedia({
        url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg', onerror: (error) => errors.push(error)
    });
    await flush();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'permission_revoked');
    assert.equal(f.timers.size, 0);
    assert.equal(f.messages.at(-1).type, 'CANCEL_DOWNLOAD');
});

test('Chrome adapter stores the resolved Threads document locale only when it changes', async () => {
    const writes = [];
    let storedLocale = '';
    const chrome = {
        storage: {
            local: {
                async get() { return { lastDocumentLocale: storedLocale }; },
                async set(value) {
                    writes.push(value);
                    storedLocale = value.lastDocumentLocale;
                }
            },
            onChanged: { addListener() {}, removeListener() {} }
        },
        runtime: {}
    };
    const adapter = createChromePlatformAdapter({ chrome });

    assert.equal(await adapter.saveDocumentLocale('zh-Hant-TW'), 'zh-TW');
    assert.equal(await adapter.saveDocumentLocale('zh-TW'), 'zh-TW');
    assert.equal(await adapter.saveDocumentLocale('not a locale'), '');
    assert.equal(await adapter.saveDocumentLocale('ja'), 'en');
    assert.equal(await adapter.loadDocumentLocale(), 'en');
    assert.deepEqual(writes, [
        { lastDocumentLocale: 'zh-TW' },
        { lastDocumentLocale: 'en' }
    ]);
});
