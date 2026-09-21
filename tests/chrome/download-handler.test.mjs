import assert from 'node:assert/strict';
import test from 'node:test';

import { createDownloadMessageHandler, validateDownloadFilename } from '../../src/chrome/download-handler.js';
import { acceptPageDisclosure } from '../../src/shared/consent-state.js';

function fixture(consent = acceptPageDisclosure()) {
    const downloads = [];
    const sessions = {};
    const sessionStore = {
        async get(key) { return key === null ? { ...sessions } : { [key]: sessions[key] }; },
        async set(values) { Object.assign(sessions, values); },
        async remove(key) { for (const entry of Array.isArray(key) ? key : [key]) delete sessions[entry]; }
    };
    const cancelled = [];
    const searches = [];
    const downloadState = { state: 'in_progress', bytesReceived: 10, totalBytes: 100 };
    const downloadApi = {
        async download(details) { downloads.push(details); return 42; },
        async cancel(id) { cancelled.push(id); },
        async search(query) { searches.push(query); return [{ id: 42, ...downloadState }]; }
    };
    const storage = { async get() { return { consent }; } };
    const handler = createDownloadMessageHandler({
        runtimeId: 'extension-id',
        storage,
        sessionStore,
        downloads: downloadApi
    });
    const message = {
        type: 'DOWNLOAD_MEDIA',
        url: 'https://scontent.cdninstagram.com/photo.jpg?x=1',
        filename: 'author_20260812-post_photo_1.jpg',
        expectedType: 'image'
    };
    const sender = {
        id: 'extension-id',
        frameId: 0,
        documentId: 'document-1',
        tab: { id: 7 },
        url: 'https://www.threads.com/@author/post/post'
    };
    return { downloads, handler, message, sender, sessions, sessionStore, downloadApi, downloadState, storage, cancelled, searches };
}

test('service worker accepts one exact, consented, top-frame media request', async () => {
    const { downloads, handler, message, sender } = fixture();
    assert.deepEqual(await handler(message, sender), { ok: true, downloadId: 42 });
    assert.deepEqual(downloads, [{
        url: 'https://scontent.cdninstagram.com/photo.jpg?x=1',
        filename: 'author_20260812-post_photo_1.jpg',
        saveAs: false,
        conflictAction: 'uniquify'
    }]);
});

test('service worker rejects unconsented, forged, nested and schema-expanded requests', async () => {
    const dormant = fixture(null);
    assert.equal((await dormant.handler(dormant.message, dormant.sender)).error, 'consent_required');

    const forged = fixture();
    assert.equal((await forged.handler(forged.message, { ...forged.sender, id: 'forged' })).error, 'invalid_sender');
    assert.equal((await forged.handler(forged.message, { ...forged.sender, frameId: 2 })).error, 'invalid_sender');
    assert.equal((await forged.handler(forged.message, { ...forged.sender, tab: undefined })).error, 'invalid_sender');
    assert.equal((await forged.handler(forged.message, { ...forged.sender, tab: { id: -1 } })).error, 'invalid_sender');
    assert.equal((await forged.handler({ ...forged.message, extra: true }, forged.sender)).error, 'invalid_message');
});

test('service worker rejects downloads from sensitive Threads routes', async () => {
    for (const path of [
        '/login/', '/messages/thread/1', '/settings/privacy/', '/accounts/edit/',
        '/%6dessages/', '/messages%2Fthread/1', '/%256dessages/'
    ]) {
        const { downloads, handler, message, sender } = fixture();
        const result = await handler(message, {
            ...sender,
            url: 'https://www.threads.com' + path
        });
        assert.deepEqual(result, { ok: false, error: 'sensitive_route' });
        assert.deepEqual(downloads, []);
    }
});

test('service worker rejects unsafe media URLs and filenames', async () => {
    const { handler, message, sender } = fixture();
    assert.equal((await handler({ ...message, url: 'https://attacker.example/photo.jpg' }, sender)).error, 'unsafe_media_url');
    assert.equal((await handler({ ...message, filename: '../escape.jpg' }, sender)).error, 'unsafe_filename');
    assert.equal(validateDownloadFilename('CON.jpg'), false);
    assert.equal(validateDownloadFilename('safe_video_1.mp4'), true);
});

test('status reads survive a worker restart and expose only the owned transfer outcome', async () => {
    const f = fixture();
    await f.handler(f.message, f.sender);
    const [owner] = Object.values(f.sessions);
    assert.equal(typeof owner.createdAt, 'number');
    assert.deepEqual(Object.keys(owner).sort(), ['createdAt', 'documentId', 'origin', 'tabId']);
    const restarted = createDownloadMessageHandler({
        runtimeId: 'extension-id', storage: f.storage, sessionStore: f.sessionStore, downloads: f.downloadApi
    });
    assert.deepEqual(await restarted({ type: 'DOWNLOAD_STATUS', downloadId: 42 }, f.sender), {
        ok: true, state: 'in_progress', bytesReceived: 10, totalBytes: 100
    });
    f.downloadState.state = 'complete';
    assert.equal((await restarted({ type: 'DOWNLOAD_STATUS', downloadId: 42 }, f.sender)).state, 'complete');
    assert.deepEqual(f.searches, [{ id: 42 }, { id: 42 }]);
    assert.deepEqual(f.sessions, {});
});

test('status and cancel cannot access downloads belonging to another tab, document, or origin', async () => {
    const f = fixture();
    await f.handler(f.message, f.sender);
    for (const type of ['DOWNLOAD_STATUS', 'CANCEL_DOWNLOAD']) {
        for (const sender of [
            { ...f.sender, tab: { id: 8 } },
            { ...f.sender, documentId: 'document-2' },
            { ...f.sender, url: 'https://threads.net/@author/post/post' }
        ]) {
            assert.equal((await f.handler({ type, downloadId: 42 }, sender)).error, 'download_not_owned');
        }
        assert.equal((await f.handler({ type, downloadId: 999 }, f.sender)).error, 'download_not_owned');
        assert.equal((await f.handler({ type, downloadId: 42, extra: true }, f.sender)).error, 'invalid_message');
    }
    assert.deepEqual(f.searches, []);
    assert.deepEqual(f.cancelled, []);
});

test('cleanup cancels an owned transfer after consent revocation or navigation to a sensitive route', async () => {
    for (const type of ['DOWNLOAD_STATUS', 'CANCEL_DOWNLOAD']) {
        const f = fixture();
        await f.handler(f.message, f.sender);
        f.storage.get = async () => ({ consent: null });
        const result = await f.handler({ type, downloadId: 42 }, {
            ...f.sender, url: 'https://www.threads.com/messages/'
        });
        assert.equal(result.ok, type === 'CANCEL_DOWNLOAD');
        assert.deepEqual(f.cancelled, [42]);
        assert.deepEqual(f.sessions, {});
        assert.deepEqual(f.searches, []);
    }
});

test('revocation while download starts cancels the new transfer and does not report initiation success', async () => {
    const f = fixture();
    f.downloadApi.download = async () => {
        f.storage.get = async () => ({ consent: null });
        return 42;
    };
    assert.deepEqual(await f.handler(f.message, f.sender), { ok: false, error: 'permission_revoked' });
    assert.deepEqual(f.cancelled, [42]);
    assert.deepEqual(f.sessions, {});
});

test('interruption reports a failure state and removes temporary ownership metadata', async () => {
    const f = fixture();
    await f.handler(f.message, f.sender);
    Object.assign(f.downloadState, { state: 'interrupted', error: 'NETWORK_FAILED' });
    assert.deepEqual(await f.handler({ type: 'DOWNLOAD_STATUS', downloadId: 42 }, f.sender), {
        ok: true, state: 'interrupted', bytesReceived: 10, totalBytes: 100, interruptReason: 'NETWORK_FAILED'
    });
    assert.deepEqual(f.sessions, {});
});

test('closing or navigating a tab cancels only its owned transfers and clears their metadata', async () => {
    const f = fixture();
    await f.handler(f.message, f.sender);
    f.sessions['threadsDownload:99'] = { tabId: 99, createdAt: Date.now() };
    await f.handler.cancelTabDownloads(7);
    assert.deepEqual(f.cancelled, [42]);
    assert.deepEqual(Object.keys(f.sessions), ['threadsDownload:99']);
});

test('tab navigation while the download API is pending cancels it as soon as the ID arrives', async () => {
    const f = fixture();
    let entered;
    let release;
    const started = new Promise((resolve) => { entered = resolve; });
    f.downloadApi.download = async () => {
        entered();
        return new Promise((resolve) => { release = resolve; });
    };
    const pending = f.handler(f.message, f.sender);
    await started;
    await f.handler.cancelTabDownloads(7);
    release(42);
    assert.deepEqual(await pending, { ok: false, error: 'permission_revoked' });
    assert.deepEqual(f.cancelled, [42]);
    assert.deepEqual(f.sessions, {});
});

test('navigation during the initial consent read prevents the transfer from starting', async () => {
    const f = fixture();
    let release;
    f.storage.get = async () => new Promise((resolve) => { release = resolve; });
    const pending = f.handler(f.message, f.sender);
    await f.handler.cancelTabDownloads(7);
    release({ consent: acceptPageDisclosure() });
    assert.deepEqual(await pending, { ok: false, error: 'permission_revoked' });
    assert.deepEqual(f.downloads, []);
});

test('tracking refuses new work at the bounded limit and prunes stale metadata before admission', async () => {
    const f = fixture();
    for (let id = 100; id < 228; id += 1) {
        f.sessions['threadsDownload:' + id] = { tabId: id, createdAt: Date.now() };
    }
    assert.deepEqual(await f.handler(f.message, f.sender), { ok: false, error: 'download_tracking_capacity' });
    assert.equal(f.downloads.length, 0);
    f.sessions['threadsDownload:100'].createdAt = Date.now() - 25 * 60 * 60 * 1000;
    assert.deepEqual(await f.handler(f.message, f.sender), { ok: true, downloadId: 42 });
    assert.equal(Object.keys(f.sessions).length, 128);
    assert.equal(f.sessions['threadsDownload:100'], undefined);
});

test('failed ownership persistence cancels the started transfer', async () => {
    const f = fixture();
    f.sessionStore.set = async () => { throw new Error('storage unavailable'); };
    assert.deepEqual(await f.handler(f.message, f.sender), { ok: false, error: 'download_failed' });
    assert.deepEqual(f.cancelled, [42]);
});
