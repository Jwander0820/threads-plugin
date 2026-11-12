import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStructuredMediaUrls, mergeStructuredMediaRecords, normalizePostIdentity, parsePostInfoFromUrl } from '../../src/shared/post-model.js';

test('carousel child codes retain parent ownership and all four videos before DOM playback', () => {
    const carousel = ['image', 'video', 'video', 'video', 'video', 'image'].map((type, index) => ({
        code: `CHILD_${index}`, image_versions2: { candidates: [{ url: `https://cdninstagram.com/${index}.jpg` }] },
        ...(type === 'video' ? { video_versions: [{ url: `https://cdninstagram.com/${index}.mp4` }] } : {})
    }));
    const records = collectStructuredMediaUrls({ code: 'PARENT_1', carousel_media: carousel });
    assert.deepEqual(records.map(x => x.type), ['image', 'video', 'video', 'video', 'video', 'image']);
    assert.ok(records.every(x => x.postId === 'PARENT_1'));
    assert.equal(records[3].previewUrl, 'https://cdninstagram.com/3.jpg');
    const posters = records.map((x, index) => ({ type: 'image', url: `https://cdninstagram.com/${index}.jpg` }));
    const front = records.map((x, index) => index > 2 ? posters[index] : x);
    const back = records.map((x, index) => index < 3 ? posters[index] : x);
    const merged = mergeStructuredMediaRecords(front, back);
    assert.deepEqual(merged.map(x => x.type), records.map(x => x.type));
    assert.deepEqual(mergeStructuredMediaRecords(merged, front).map(x => x.type), records.map(x => x.type));
    assert.equal(mergeStructuredMediaRecords(merged, [{type:'image',url:'https://cdninstagram.com/unrelated.jpg'}]).length, 6);
});

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

test('post refetch helpers build a canonical same-origin permalink and read only inert JSON scripts', async () => {
    const { buildPostRefetchUrl, extractInlineJsonScriptTexts } = await import('../../src/shared/post-model.js');
    const page = 'https://www.threads.com/?xmt=tracking#top';
    assert.equal(
        buildPostRefetchUrl({ author: 'some.user_1', postId: 'DfjT1cFj15c', postUrl: 'https://evil.example/x' }, page),
        'https://www.threads.com/@some.user_1/post/DfjT1cFj15c'
    );
    for (const postInfo of [
        { author: 'unknown/../x', postId: 'DfjT1cFj15c' },
        { author: 'user', postId: 'unknown?x=1' },
        { author: 'user', postId: 'abc' },
        { author: '', postId: 'DfjT1cFj15c' },
        null
    ]) {
        assert.equal(buildPostRefetchUrl(postInfo, page), null);
    }
    assert.equal(buildPostRefetchUrl({ author: 'user', postId: 'DfjT1cFj15c' }, 'https://attacker.example/'), null);

    const html = '<html><script>alert(1)</script>' +
        '<script type="application/json" data-sjs>{"a":1}</script>' +
        '<script type="text/javascript">{"b":2}</script>' +
        "<script data-x type='application/json'>{\"c\":3}</script>" +
        '<script type="application/json">' + 'x'.repeat(50) + '</script></html>';
    assert.deepEqual(extractInlineJsonScriptTexts(html, { maxScriptLength: 20 }), ['{"a":1}', '{"c":3}']);
    assert.deepEqual(extractInlineJsonScriptTexts(null), []);
});

test('an embedded Instagram reel is owned by the Threads post that links it', () => {
    const records = collectStructuredMediaUrls({
        media: {
            code: 'THREADS_POST',
            media_type: 19,
            video_versions: null,
            text_post_app_info: {
                share_info: { quoted_post: {
                    code: 'QUOTED_POST',
                    video_versions: [{ url: 'https://cdninstagram.com/quoted.mp4' }]
                } },
                linked_inline_media: {
                    code: 'IG_SHORTCODE',
                    permalink: 'https://www.instagram.com/reel/IG_SHORTCODE/',
                    media_type: 2,
                    image_versions2: { candidates: [{ url: 'https://cdninstagram.com/reel-poster.jpg' }] },
                    video_versions: [
                        { type: 101, url: 'https://instagram.ftpe8-4.fna.fbcdn.net/o1/v/reel.mp4' },
                        { type: 102, url: 'https://instagram.ftpe8-4.fna.fbcdn.net/o1/v/reel.mp4' }
                    ]
                }
            }
        }
    });
    assert.deepEqual(records.filter((record) => record.postId === 'THREADS_POST'), [{
        type: 'video',
        url: 'https://instagram.ftpe8-4.fna.fbcdn.net/o1/v/reel.mp4',
        postId: 'THREADS_POST',
        previewUrl: 'https://cdninstagram.com/reel-poster.jpg'
    }]);
    assert.equal(records.some((record) => record.postId === 'IG_SHORTCODE'), false);
    assert.deepEqual(records.filter((record) => record.postId === 'QUOTED_POST').map((record) => record.type), ['video']);
});

test('media viewer route names its post without being treated as a detail page', async () => {
    const { parseMediaViewerPostInfo } = await import('../../src/shared/post-model.js');
    const base = 'https://www.threads.com/';
    assert.deepEqual(parseMediaViewerPostInfo('https://www.threads.com/@some.user/post/DfmYYdZjKb9/media?xmt=1', base), {
        author: 'some.user',
        postId: 'DfmYYdZjKb9',
        postUrl: 'https://www.threads.com/@some.user/post/DfmYYdZjKb9'
    });
    assert.equal(parsePostInfoFromUrl('https://www.threads.com/@some.user/post/DfmYYdZjKb9/media', base), null);
    for (const url of [
        'https://www.threads.com/@some.user/post/DfmYYdZjKb9',
        'https://www.threads.com/@some.user/post/DfmYYdZjKb9/media/extra',
        'https://attacker.example/@some.user/post/DfmYYdZjKb9/media',
        'https://www.threads.com/settings/media'
    ]) {
        assert.equal(parseMediaViewerPostInfo(url, base), null, url);
    }
});
