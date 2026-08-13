import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStructuredMediaUrls, normalizePostIdentity, parsePostInfoFromUrl } from '../../src/shared/post-model.js';

test('post URL model extracts and sanitizes author and post identity', () => {
    assert.deepEqual(parsePostInfoFromUrl('https://www.threads.com/@author/post/POST_A?x=1'), {
        author: 'author',
        postId: 'POST_A',
        postUrl: 'https://www.threads.com/@author/post/POST_A?x=1'
    });
    assert.equal(parsePostInfoFromUrl('https://www.threads.com/@author/profile'), null);
    assert.deepEqual(parsePostInfoFromUrl('https://www.threads.com/@_yunaaa_.07/post/Db6FwLxEouh?x=1'), {
        author: '_yunaaa_.07',
        postId: 'Db6FwLxEouh',
        postUrl: 'https://www.threads.com/@_yunaaa_.07/post/Db6FwLxEouh?x=1'
    });
    assert.equal(parsePostInfoFromUrl('https://attacker.example/@author/post/POST_A'), null);
    assert.equal(parsePostInfoFromUrl('https://www.threads.com/@bad%2Fauthor/post/POST_A'), null);
    assert.equal(parsePostInfoFromUrl('http://www.threads.com/@author/post/POST_A'), null);
    assert.equal(parsePostInfoFromUrl('https://user:pass@www.threads.com/@author/post/POST_A'), null);
    assert.equal(parsePostInfoFromUrl('https://www.threads.com:444/@author/post/POST_A'), null);
    assert.equal(parsePostInfoFromUrl('https://www.threads.com/prefix/@author/post/POST_A'), null);
    assert.equal(parsePostInfoFromUrl('https://www.threads.com/@author/post/POST_A/replies'), null);
});

test('post identity normalization preserves edge underscores without collisions', () => {
    assert.equal(normalizePostIdentity('_ABCDE'), '_ABCDE');
    assert.equal(normalizePostIdentity('ABCDE'), 'ABCDE');
    assert.equal(normalizePostIdentity('ABCDE_'), 'ABCDE_');
    assert.equal(normalizePostIdentity('bad/id'), null);
    assert.equal(normalizePostIdentity('x'.repeat(81)), null);
});

test('structured model preserves carousel slots while isolating quoted posts', () => {
    const repeated = 'https://cdninstagram.com/repeated.jpg';
    const records = collectStructuredMediaUrls({
        code: 'PARENT_POST',
        carousel_media: [
            { image_versions2: { candidates: [{ url: repeated, width: 100, height: 100 }] } },
            { image_versions2: { candidates: [{ url: repeated, width: 100, height: 100 }] } }
        ],
        quoted_post: {
            code: 'QUOTED_POST',
            video_versions: [{ url: 'https://cdninstagram.com/quoted.mp4', width: 100, height: 100 }]
        },
        reply_to: {
            video_versions: [{ url: 'https://cdninstagram.com/unowned.mp4', width: 100, height: 100 }]
        }
    });

    assert.deepEqual(records.map(({ type, postId }) => [type, postId]), [
        ['image', 'PARENT_POST'],
        ['image', 'PARENT_POST'],
        ['video', 'QUOTED_POST']
    ]);
});

test('structured model ignores a post-level cover duplicated by carousel_media', () => {
    const firstPhoto = 'https://cdninstagram.com/media/first.jpg?ig_cache_key=FIRST.3-ccb7-5';
    const secondPhoto = 'https://cdninstagram.com/media/second.jpg?ig_cache_key=SECOND.3-ccb7-5';
    const records = collectStructuredMediaUrls({
        code: 'Db5Yl8zEVFh',
        image_versions2: {
            candidates: [{ url: firstPhoto, width: 100, height: 100 }]
        },
        carousel_media: [
            {
                image_versions2: {
                    candidates: [{ url: firstPhoto, width: 100, height: 100 }]
                }
            },
            {
                image_versions2: {
                    candidates: [{ url: secondPhoto, width: 100, height: 100 }]
                }
            }
        ]
    });

    assert.deepEqual(records.map((record) => [record.type, record.url, record.postId]), [
        ['image', firstPhoto, 'Db5Yl8zEVFh'],
        ['image', secondPhoto, 'Db5Yl8zEVFh']
    ]);
});
