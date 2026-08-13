import assert from 'node:assert/strict';
import test from 'node:test';

import { createDownloadMessageHandler, validateDownloadFilename } from '../../src/chrome/download-handler.js';
import { acceptPageDisclosure } from '../../src/shared/consent-state.js';

function fixture(consent = acceptPageDisclosure()) {
    const downloads = [];
    const handler = createDownloadMessageHandler({
        runtimeId: 'extension-id',
        storage: { async get() { return { consent }; } },
        downloads: { async download(details) { downloads.push(details); return 42; } }
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
        tab: { id: 7 },
        url: 'https://www.threads.com/@author/post/post'
    };
    return { downloads, handler, message, sender };
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
