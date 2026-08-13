import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildMediaFilename,
    MEDIA_URL_MAX_LENGTH,
    validateMediaUrl
} from '../../src/shared/media-policy.js';

function mediaUrlWithLength(length) {
    const prefix = 'https://cdninstagram.com/media/video.mp4?token=';
    assert.ok(length >= prefix.length);
    return `${prefix}${'a'.repeat(length - prefix.length)}`;
}

test('media policy enforces scheme, credentials, port, host, extension and requested type', () => {
    const accepted = validateMediaUrl('https://scontent.cdninstagram.com/media/video.mp4?bytestart=0', 'video');
    assert.equal(accepted.ok, true);
    assert.equal(accepted.type, 'video');

    const rejected = [
        ['http://cdninstagram.com/media/video.mp4', 'https_required'],
        ['https://user:pass@cdninstagram.com/media/video.mp4', 'credentials_not_allowed'],
        ['https://cdninstagram.com:444/media/video.mp4', 'port_not_allowed'],
        ['https://cdninstagram.com.attacker.example/media/video.mp4', 'host_not_allowed'],
        ['https://cdninstagram.com/media/video.mp4.exe', 'extension_not_allowed'],
        ['https://cdninstagram.com/media/video.mp4', null, 'image', 'media_type_mismatch']
    ];

    for (const [url, reason, expectedType, expectedReason] of rejected) {
        assert.equal(validateMediaUrl(url, expectedType).reason, expectedReason || reason);
    }
});

test('media policy accepts the fixed URL-length boundary and rejects one character over it', () => {
    const exact = mediaUrlWithLength(MEDIA_URL_MAX_LENGTH);
    const oversized = mediaUrlWithLength(MEDIA_URL_MAX_LENGTH + 1);

    assert.equal(exact.length, MEDIA_URL_MAX_LENGTH);
    assert.equal(validateMediaUrl(exact, 'video').ok, true);
    assert.deepEqual(validateMediaUrl(oversized, 'video'), {
        ok: false,
        reason: 'invalid_url'
    });
});

test('filename builder is deterministic and normalizes jpeg extension', () => {
    assert.equal(buildMediaFilename({
        type: 'image',
        url: 'https://cdninstagram.com/media/photo.jpeg',
        postInfo: { author: 'jwander', postId: 'POST_A', createdAt: new Date('2026-08-12T01:02:03Z') },
        sequence: '02'
    }), 'jwander_20260812-010203Z_POST_A_photo_02.jpg');

    assert.equal(buildMediaFilename({
        type: 'video',
        url: 'https://cdninstagram.com/media/video.mp4',
        postInfo: { author: '_yunaaa_.07', postId: 'POST_A', createdAt: new Date('2026-08-12T01:02:03Z') },
        sequence: '02'
    }), '_yunaaa_.07_20260812-010203Z_POST_A_video_02.mp4');
});
