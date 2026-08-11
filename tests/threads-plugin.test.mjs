import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
    activateButton,
    buildModalItemPreviewMarkup,
    buildMediaRouteKey,
    classifyNetworkCaptureRequest,
    collectStructuredMediaUrls,
    copyText,
    createUserActivationToken,
    downloadItem,
    downloadModalItems,
    downloadViaBlob,
    finalizeModalItems,
    findPostContext,
    findShareSvgFromEvent,
    getModalDownloadItems,
    getVideoThumbnailLayout,
    inspectResponse,
    isNativeCopyLinkActionRect,
    orderMediaElementsByVisualPosition,
    selectPostBoundVideoUrl,
    transitionMediaRouteScope,
    validateMediaUrl
} = require('../threads-plugin.user.js');

globalThis.location = {
    href: 'https://www.threads.com/@current/post/POST_B'
};

test('hover download resolves a feed carousel post beyond fourteen DOM ancestors', (t) => {
    const originalLocationHref = globalThis.location.href;
    t.after(() => {
        globalThis.location.href = originalLocationHref;
    });
    globalThis.location.href = 'https://www.threads.com/';

    const postLink = {
        href: 'https://www.threads.com/@jwander87/post/Db3BFmnAVmL',
        contains: () => false,
        getBoundingClientRect: () => ({ left: 650, top: 1100, width: 80, height: 20 })
    };
    const ancestors = Array.from({ length: 18 }, (_, depth) => ({
        parentElement: null,
        matches: () => false,
        querySelectorAll: (selector) => (
            depth === 16 && selector === 'a[href*="/post/"]' ? [postLink] : []
        ),
        getBoundingClientRect: () => ({ left: 599, top: 1000, width: 245, height: 184 })
    }));
    ancestors.forEach((node, index) => {
        node.parentElement = ancestors[index + 1] || null;
    });

    assert.deepEqual(findPostContext(ancestors[0]), {
        author: 'jwander87',
        postId: 'Db3BFmnAVmL',
        postUrl: postLink.href,
        createdAt: null
    });
});

test('one click on each idle media button starts both downloads', async () => {
    const firstButton = { dataset: { tmBusy: '0' } };
    const secondButton = { dataset: { tmBusy: '0' } };
    const mediaElement = {};
    const mediaItem = {
        type: 'image',
        url: 'https://cdninstagram.com/media/photo.jpg'
    };
    let downloadStarts = 0;
    const runActivation = (button) => {
        const token = createUserActivationToken({
            isTrusted: true,
            type: 'click',
            detail: 1
        }, { isActive: true });
        return activateButton(button, token, {
            element: mediaElement,
            resolveMediaItem: async () => mediaItem,
            downloadItemFn: async () => {
                downloadStarts += 1;
                return true;
            },
            setTimeoutFn: (callback) => {
                callback();
                return 1;
            }
        });
    };

    assert.deepEqual(
        await Promise.all([runActivation(firstButton), runActivation(secondButton)]),
        [true, true]
    );
    assert.equal(downloadStarts, 2);
});

test('duplicate events on one busy media button start only one download', async () => {
    const button = { dataset: { tmBusy: '0' } };
    const mediaElement = {};
    const mediaItem = {
        type: 'image',
        url: 'https://cdninstagram.com/media/photo.jpg'
    };
    let downloadStarts = 0;
    const runActivation = () => {
        const token = createUserActivationToken({
            isTrusted: true,
            type: 'click',
            detail: 1
        }, { isActive: true });
        return activateButton(button, token, {
            element: mediaElement,
            resolveMediaItem: async () => mediaItem,
            downloadItemFn: async () => {
                downloadStarts += 1;
                return true;
            },
            setTimeoutFn: (callback) => {
                callback();
                return 1;
            }
        });
    };

    assert.deepEqual(await Promise.all([runActivation(), runActivation()]), [true, false]);
    assert.equal(downloadStarts, 1);
});

function createManualClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();

    return {
        setTimeoutFn(callback, delayMs) {
            const id = nextId++;
            timers.set(id, { callback, dueAt: now + delayMs });
            return id;
        },
        clearTimeoutFn(id) {
            timers.delete(id);
        },
        advanceBy(delayMs) {
            const target = now + delayMs;
            while (true) {
                const nextTimer = [...timers]
                    .filter(([, timer]) => timer.dueAt <= target)
                    .sort((a, b) => a[1].dueAt - b[1].dueAt || a[0] - b[0])[0];
                if (!nextTimer) break;
                const [id, timer] = nextTimer;
                timers.delete(id);
                now = timer.dueAt;
                timer.callback();
            }
            now = target;
        }
    };
}

test('media URL validation rejects extension smuggling and unapproved hosts', () => {
    assert.deepEqual(
        validateMediaUrl('https://cdninstagram.com/payload.exe?bytestart=0', 'video'),
        { ok: false, reason: 'extension_not_allowed' }
    );
    assert.deepEqual(
        validateMediaUrl('https://attacker.example/video.mp4', 'video'),
        { ok: false, reason: 'host_not_allowed' }
    );
    assert.equal(
        validateMediaUrl('https://cdninstagram.com/media/video.mp4?bytestart=0', 'video').ok,
        true
    );
});

test('synthetic events cannot invoke privileged clipboard access', (t) => {
    let clipboardWrites = 0;
    globalThis.GM_setClipboard = () => {
        clipboardWrites += 1;
    };
    t.after(() => {
        delete globalThis.GM_setClipboard;
    });

    const syntheticToken = createUserActivationToken({
        isTrusted: false,
        type: 'click',
        detail: 1
    }, { isActive: true });
    assert.equal(syntheticToken, null);
    assert.equal(copyText('secret text', syntheticToken), false);
    assert.equal(clipboardWrites, 0);

    const trustedKeyboardToken = createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 0
    }, { isActive: false });
    assert.notEqual(trustedKeyboardToken, null);
    assert.equal(copyText('public post text', trustedKeyboardToken), true);
    assert.equal(clipboardWrites, 1);
});

test('media route scope separates semantic queries but ignores tracking parameters', () => {
    assert.notEqual(
        buildMediaRouteKey('https://www.threads.com/search?q=alpha'),
        buildMediaRouteKey('https://www.threads.com/search?q=beta')
    );
    assert.equal(
        buildMediaRouteKey('https://www.threads.com/search?q=alpha&utm_source=test'),
        buildMediaRouteKey('https://www.threads.com/search?utm_medium=social&q=alpha')
    );
});

test('network capture is limited to known operations outside sensitive routes', () => {
    const requestUrl = 'https://www.threads.com/api/graphql?operationName=BarcelonaFeedQuery';
    assert.equal(classifyNetworkCaptureRequest({
        url: requestUrl,
        routeUrl: 'https://www.threads.com/'
    }).allowed, true);
    assert.deepEqual(classifyNetworkCaptureRequest({
        url: requestUrl,
        routeUrl: 'https://www.threads.com/messages/'
    }), { allowed: false, reason: 'sensitive_route' });
    assert.deepEqual(classifyNetworkCaptureRequest({
        url: 'https://www.threads.com/api/graphql?operationName=AccountSettingsQuery',
        routeUrl: 'https://www.threads.com/'
    }), {
        allowed: false,
        reason: 'unknown_operation',
        operation: 'AccountSettingsQuery'
    });
    assert.deepEqual(classifyNetworkCaptureRequest({
        url: 'https://attacker.example/api/graphql?operationName=BarcelonaFeedQuery',
        routeUrl: 'https://www.threads.com/'
    }), { allowed: false, reason: 'unknown_endpoint' });
});

test('network response inspection enforces MIME and byte limits', async () => {
    const captureContext = classifyNetworkCaptureRequest({
        url: 'https://www.threads.com/api/graphql?operationName=BarcelonaFeedQuery',
        routeUrl: 'https://www.threads.com/'
    });
    const extracted = [];
    assert.equal(await inspectResponse(new Response('{"media":1}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
    }), captureContext, {
        maxBytes: 32,
        extractor(text) {
            extracted.push(text);
        }
    }), true);
    assert.deepEqual(extracted, ['{"media":1}']);

    assert.equal(await inspectResponse(new Response('<html>private</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
    }), captureContext, { maxBytes: 32 }), false);
    assert.equal(await inspectResponse(new Response('{"media":"oversized"}', {
        status: 200,
        headers: {
            'content-type': 'application/json',
            'content-length': '4096'
        }
    }), captureContext, { maxBytes: 32 }), false);
});

test('post-bound video lookup never borrows media from another feed post', () => {
    const videosByPost = new Map([
        ['POST_A', ['https://cdninstagram.com/post-a.mp4']],
        ['POST_B', ['https://cdninstagram.com/post-b.mp4']]
    ]);

    assert.equal(selectPostBoundVideoUrl({
        postId: 'POST_A',
        videoUrlsByPostId: videosByPost
    }), 'https://cdninstagram.com/post-a.mp4');
    assert.equal(selectPostBoundVideoUrl({
        postId: 'POST_C',
        videoUrlsByPostId: videosByPost
    }), null);
});

test('structured quoted media is isolated from the parent post identity', () => {
    const records = collectStructuredMediaUrls({
        code: 'PARENT_POST',
        video_versions: [
            { url: 'https://cdninstagram.com/parent.mp4', width: 100, height: 100 }
        ],
        quoted_post: {
            code: 'QUOTED_POST',
            video_versions: [
                { url: 'https://cdninstagram.com/quoted.mp4', width: 100, height: 100 }
            ]
        },
        reply_to: {
            video_versions: [
                { url: 'https://cdninstagram.com/unidentified-reply.mp4', width: 100, height: 100 }
            ]
        }
    });

    assert.deepEqual(records, [
        {
            type: 'video',
            url: 'https://cdninstagram.com/parent.mp4',
            postId: 'PARENT_POST'
        },
        {
            type: 'video',
            url: 'https://cdninstagram.com/quoted.mp4',
            postId: 'QUOTED_POST'
        }
    ]);
});

test('structured media extraction preserves mixed carousel order', () => {
    const records = collectStructuredMediaUrls({
        code: 'MIXED_POST',
        carousel_media: [
            {
                image_versions2: {
                    candidates: [{ url: 'https://cdninstagram.com/photo-1.jpg', width: 100, height: 100 }]
                }
            },
            {
                video_versions: [
                    { url: 'https://cdninstagram.com/video-2.mp4', width: 100, height: 100 }
                ]
            },
            {
                image_versions2: {
                    candidates: [{ url: 'https://cdninstagram.com/photo-3.jpg', width: 100, height: 100 }]
                }
            }
        ]
    });

    assert.deepEqual(
        records.map((record) => [record.type, record.url]),
        [
            ['image', 'https://cdninstagram.com/photo-1.jpg'],
            ['video', 'https://cdninstagram.com/video-2.mp4'],
            ['image', 'https://cdninstagram.com/photo-3.jpg']
        ]
    );
});

test('structured media extraction preserves repeated carousel slots with the same URL', () => {
    const repeatedPhoto = 'https://cdninstagram.com/media/repeated.jpg?ig_cache_key=REPEATED.3-ccb7-5';
    const records = collectStructuredMediaUrls({
        code: 'REPEATED_POST',
        carousel_media: [
            {
                image_versions2: {
                    candidates: [{ url: repeatedPhoto, width: 100, height: 100 }]
                }
            },
            {
                image_versions2: {
                    candidates: [{ url: repeatedPhoto, width: 100, height: 100 }]
                }
            }
        ]
    });

    assert.deepEqual(
        records.map((record) => [record.type, record.url, record.postId]),
        [
            ['image', repeatedPhoto, 'REPEATED_POST'],
            ['image', repeatedPhoto, 'REPEATED_POST']
        ]
    );
});

test('new share sheet accepts the 80px-wide native copy-link action', () => {
    assert.equal(isNativeCopyLinkActionRect({
        width: 80,
        height: 110,
        top: 556,
        right: 790,
        bottom: 666,
        left: 710
    }, 950, 1064), true);

    assert.equal(isNativeCopyLinkActionRect({
        width: 48,
        height: 17,
        top: 622,
        right: 774,
        bottom: 639,
        left: 726
    }, 950, 1064), false);
});

test('share context is detected when the click lands on the outer button', () => {
    const shareSvg = {
        tagName: 'svg',
        getAttribute: (name) => name === 'aria-label' ? '分享' : null,
        querySelector: () => null
    };
    const outerButton = {
        tagName: 'DIV',
        matches: (selector) => selector.includes('[role="button"]'),
        querySelectorAll: () => [shareSvg],
        closest: () => outerButton
    };

    assert.equal(findShareSvgFromEvent({
        target: outerButton,
        composedPath: () => [outerButton]
    }), shareSvg);
});

test('media picker includes a cached video beside resolved images', () => {
    const items = finalizeModalItems({
        rawItems: [
            {
                type: 'image',
                resolvedUrl: 'https://cdninstagram.com/photo.jpg',
                previewUrl: 'https://cdninstagram.com/photo.jpg'
            },
            {
                type: 'video',
                resolvedUrl: null,
                previewUrl: 'https://cdninstagram.com/video-cover.jpg'
            }
        ],
        cachedImageItems: [],
        cachedVideoItems: [
            {
                type: 'video',
                resolvedUrl: 'https://cdninstagram.com/video.mp4',
                previewUrl: ''
            }
        ]
    });

    assert.deepEqual(
        items.map((item) => [item.type, item.resolvedUrl]),
        [
            ['image', 'https://cdninstagram.com/photo.jpg'],
            ['video', 'https://cdninstagram.com/video.mp4']
        ]
    );
    assert.deepEqual(
        items.map((item) => item.selected),
        [false, false]
    );
});

test('batch download distinguishes all media from manually selected media', () => {
    const items = [
        { id: 'photo', selected: false },
        { id: 'video', selected: false }
    ];

    assert.deepEqual(getModalDownloadItems(items, false), []);
    assert.deepEqual(
        getModalDownloadItems(items, true).map((item) => item.id),
        ['photo', 'video']
    );

    items[1].selected = true;
    assert.deepEqual(
        getModalDownloadItems(items, false).map((item) => item.id),
        ['video']
    );
});

test('changing Threads routes reports a route-scope transition', () => {
    const nextScope = transitionMediaRouteScope({
        routeKey: '/@author/post/POST_A'
    }, '/@author/post/POST_B');

    assert.deepEqual(nextScope, {
        routeKey: '/@author/post/POST_B',
        changed: true
    });
});

test('a timed-out download settles without overwriting the clipboard', async (t) => {
    let downloadDetails;
    let clipboardWrites = 0;
    const originalWarn = console.warn;
    console.warn = () => {};
    globalThis.document = { body: null };
    globalThis.GM_download = (details) => {
        downloadDetails = details;
    };
    globalThis.GM_xmlhttpRequest = ({ onerror }) => {
        queueMicrotask(() => onerror(new Error('blob fallback failed')));
    };
    globalThis.GM_setClipboard = () => {
        clipboardWrites += 1;
    };
    t.after(() => {
        console.warn = originalWarn;
        delete globalThis.document;
        delete globalThis.GM_download;
        delete globalThis.GM_xmlhttpRequest;
        delete globalThis.GM_setClipboard;
    });

    const completion = downloadItem({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4',
        postInfo: {
            author: 'author',
            postId: 'POST_B',
            postUrl: 'https://www.threads.com/@author/post/POST_B',
            createdAt: new Date('2026-07-16T00:00:00Z')
        }
    }, createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }));

    assert.equal(typeof downloadDetails.ontimeout, 'function');
    downloadDetails.ontimeout(new Error('download timed out'));

    await Promise.race([
        completion,
        new Promise((_, reject) => setTimeout(() => reject(new Error('download did not settle')), 100))
    ]);
    assert.equal(clipboardWrites, 0);
});

test('mixed-media picker preserves the post carousel order', () => {
    const mediaElement = (id, left) => ({
        id,
        getBoundingClientRect: () => ({ top: 63, left, width: 210, height: 280 })
    });
    const photo1 = mediaElement('photo-1', 551);
    const photo6 = mediaElement('photo-6', 1631);
    const video2 = mediaElement('video-2', 767);
    const video3 = mediaElement('video-3', 983);
    const video4 = mediaElement('video-4', 1199);
    const video5 = mediaElement('video-5', 1415);

    assert.deepEqual(
        orderMediaElementsByVisualPosition([
            photo1,
            photo6,
            video2,
            video3,
            video4,
            video5
        ]).map((element) => element.id),
        ['photo-1', 'video-2', 'video-3', 'video-4', 'video-5', 'photo-6']
    );
});

test('structured carousel order positions cache-only media in their original slots', () => {
    const photo1 = 'https://cdninstagram.com/photo-1.jpg';
    const photo6 = 'https://cdninstagram.com/photo-6.jpg';
    const video2 = 'https://cdninstagram.com/video-2.mp4';
    const video3 = 'https://cdninstagram.com/video-3.mp4';
    const video4 = 'https://cdninstagram.com/video-4.mp4';
    const video5 = 'https://cdninstagram.com/video-5.mp4';

    const items = finalizeModalItems({
        rawItems: [
            { type: 'image', previewUrl: photo1, resolvedUrl: photo1 },
            { type: 'image', previewUrl: photo6, resolvedUrl: photo6 }
        ],
        cachedImageItems: [],
        cachedVideoItems: [video5, video4, video3, video2].map((resolvedUrl) => ({
            type: 'video',
            previewUrl: '',
            resolvedUrl
        })),
        structuredItems: [
            { type: 'image', resolvedUrl: photo1 },
            { type: 'video', resolvedUrl: video2 },
            { type: 'video', resolvedUrl: video3 },
            { type: 'video', resolvedUrl: video4 },
            { type: 'video', resolvedUrl: video5 },
            { type: 'image', resolvedUrl: photo6 }
        ]
    });

    assert.deepEqual(
        items.map((item) => [item.type, item.resolvedUrl]),
        [
            ['image', photo1],
            ['video', video2],
            ['video', video3],
            ['video', video4],
            ['video', video5],
            ['image', photo6]
        ]
    );
});

test('structured carousel does not append the first image again when only the cache key differs', () => {
    const firstStructured = 'https://cdninstagram.com/media/first.jpg?stp=dst-jpg';
    const firstDom = 'https://cdninstagram.com/media/first.jpg?ig_cache_key=FIRST.3-ccb7-5&stp=dst-jpg';
    const second = 'https://cdninstagram.com/media/second.jpg?ig_cache_key=SECOND.3-ccb7-5';

    const items = finalizeModalItems({
        rawItems: [
            { type: 'image', previewUrl: firstDom, resolvedUrl: firstDom },
            { type: 'image', previewUrl: second, resolvedUrl: second }
        ],
        cachedImageItems: [
            { type: 'image', previewUrl: firstDom, resolvedUrl: firstDom },
            { type: 'image', previewUrl: second, resolvedUrl: second }
        ],
        cachedVideoItems: [],
        structuredItems: [
            { type: 'image', resolvedUrl: firstStructured },
            { type: 'image', resolvedUrl: second }
        ]
    });

    assert.deepEqual(
        items.map((item) => item.resolvedUrl),
        [firstStructured, second]
    );
});

test('structured carousel preserves two real slots that share the same media URL', () => {
    const repeatedPhoto = 'https://cdninstagram.com/media/repeated.jpg?ig_cache_key=REPEATED.3-ccb7-5';

    const items = finalizeModalItems({
        rawItems: [],
        cachedImageItems: [],
        cachedVideoItems: [],
        structuredItems: [
            { type: 'image', resolvedUrl: repeatedPhoto },
            { type: 'image', resolvedUrl: repeatedPhoto }
        ]
    });

    assert.deepEqual(
        items.map((item) => [item.index, item.resolvedUrl]),
        [
            [1, repeatedPhoto],
            [2, repeatedPhoto]
        ]
    );
});

test('structured carousel reserves an exact DOM preview for its own later slot', () => {
    const firstVideo = 'https://cdninstagram.com/media/first.mp4';
    const secondVideo = 'https://cdninstagram.com/media/second.mp4';
    const secondPoster = 'https://cdninstagram.com/media/second-poster.jpg';

    const items = finalizeModalItems({
        rawItems: [
            { type: 'video', previewUrl: secondPoster, resolvedUrl: secondVideo }
        ],
        cachedImageItems: [],
        cachedVideoItems: [],
        structuredItems: [
            { type: 'video', previewUrl: '', resolvedUrl: firstVideo },
            { type: 'video', previewUrl: '', resolvedUrl: secondVideo }
        ]
    });

    assert.deepEqual(
        items.map((item) => [item.resolvedUrl, item.previewUrl]),
        [
            [firstVideo, ''],
            [secondVideo, secondPoster]
        ]
    );
});

test('structured carousel keeps a genuinely different DOM-only media item', () => {
    const structuredPhoto = 'https://cdninstagram.com/media/structured.jpg';
    const domOnlyPhoto = 'https://cdninstagram.com/media/dom-only.jpg';

    const items = finalizeModalItems({
        rawItems: [
            { type: 'image', previewUrl: domOnlyPhoto, resolvedUrl: domOnlyPhoto }
        ],
        cachedImageItems: [],
        cachedVideoItems: [],
        structuredItems: [
            { type: 'image', previewUrl: structuredPhoto, resolvedUrl: structuredPhoto }
        ]
    });

    assert.deepEqual(
        items.map((item) => item.resolvedUrl),
        [structuredPhoto, domOnlyPhoto]
    );
});

test('video modal items render a first-frame thumbnail when no poster is available', () => {
    const markup = buildModalItemPreviewMarkup({
        type: 'video',
        previewUrl: '',
        resolvedUrl: 'https://cdninstagram.com/media/concert.mp4?bytestart=0'
    });

    assert.match(markup, /<video\b/);
    assert.match(markup, /preload="metadata"/);
    assert.match(markup, /src="https:\/\/cdninstagram\.com\/media\/concert\.mp4\?bytestart=0#t=0\.1"/);
    assert.match(markup, /tm-video-play-badge/);
    assert.doesNotMatch(markup, />影片<\/div>/);
});

test('video thumbnails preserve portrait, landscape, and square source orientation', () => {
    assert.deepEqual(getVideoThumbnailLayout(720, 1280), {
        orientation: 'portrait',
        aspectRatio: '720 / 1280'
    });
    assert.deepEqual(getVideoThumbnailLayout(1920, 1080), {
        orientation: 'landscape',
        aspectRatio: '1920 / 1080'
    });
    assert.deepEqual(getVideoThumbnailLayout(1080, 1080), {
        orientation: 'square',
        aspectRatio: '1080 / 1080'
    });
    assert.deepEqual(getVideoThumbnailLayout(0, 0), {
        orientation: 'landscape',
        aspectRatio: '16 / 9'
    });
});

test('download permission errors do not bypass policy through blob fallback', async (t) => {
    let fallbackRequests = 0;
    const originalWarn = console.warn;
    console.warn = () => {};
    globalThis.document = { body: null };
    globalThis.GM_download = (details) => {
        details.onerror({ error: 'not_whitelisted' });
        return { abort() {} };
    };
    globalThis.GM_xmlhttpRequest = () => {
        fallbackRequests += 1;
        return { abort() {} };
    };
    t.after(() => {
        console.warn = originalWarn;
        delete globalThis.document;
        delete globalThis.GM_download;
        delete globalThis.GM_xmlhttpRequest;
    });

    const result = await downloadItem({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4',
        postInfo: {
            author: 'author',
            postId: 'POST_PERMISSION',
            postUrl: 'https://www.threads.com/@author/post/POST_PERMISSION',
            createdAt: new Date('2026-08-11T00:00:00Z')
        }
    }, createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }));

    assert.equal(result, false);
    assert.equal(fallbackRequests, 0);
});

test('an active GM_download is not aborted while progress continues', async (t) => {
    const clock = createManualClock();
    let downloadDetails;
    let aborts = 0;
    const originalWarn = console.warn;
    console.warn = () => {};
    globalThis.document = { body: null };
    globalThis.GM_download = (details) => {
        downloadDetails = details;
        return {
            abort() {
                aborts += 1;
            }
        };
    };
    globalThis.GM_xmlhttpRequest = () => {
        throw new Error('blob fallback must not start for a progressing download');
    };
    t.after(() => {
        console.warn = originalWarn;
        delete globalThis.document;
        delete globalThis.GM_download;
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadItem({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4',
        postInfo: {
            author: 'author',
            postId: 'POST_PROGRESS',
            postUrl: 'https://www.threads.com/@author/post/POST_PROGRESS',
            createdAt: new Date('2026-08-11T00:00:00Z')
        }
    }, createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        timeoutMs: 30,
        watchdogMs: 30,
        overallWatchdogMs: 200,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn
    });

    assert.equal(Object.hasOwn(downloadDetails, 'timeout'), false);
    clock.advanceBy(20);
    downloadDetails.onprogress({ loaded: 1, total: 10 });
    clock.advanceBy(20);
    assert.equal(aborts, 0);

    downloadDetails.onload();
    assert.equal(await completion, true);
});

test('blob fallback rejects a response whose media MIME cannot be verified', async (t) => {
    let requestDetails;
    let saved = false;
    globalThis.GM_xmlhttpRequest = (details) => {
        requestDetails = details;
        return { abort() {} };
    };
    t.after(() => {
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadViaBlob({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4'
    }, 'video.mp4', createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        saveBlob() {
            saved = true;
        }
    });

    assert.equal(requestDetails.anonymous, true);
    assert.equal(requestDetails.responseType, 'blob');
    requestDetails.onload({
        status: 200,
        finalUrl: 'https://cdninstagram.com/video.mp4',
        responseHeaders: '',
        response: new Blob(['not verified'])
    });

    await assert.rejects(completion, /unexpected_media_mime:missing/);
    assert.equal(saved, false);
});

test('blob fallback accepts a media MIME supplied by response headers', async (t) => {
    let requestDetails;
    let saved = false;
    globalThis.GM_xmlhttpRequest = (details) => {
        requestDetails = details;
        return { abort() {} };
    };
    t.after(() => {
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadViaBlob({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4'
    }, 'video.mp4', createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        saveBlob() {
            saved = true;
        }
    });

    requestDetails.onload({
        status: 200,
        finalUrl: 'https://cdninstagram.com/video.mp4',
        responseHeaders: 'Content-Type: video/mp4; charset=binary',
        response: new Blob(['video bytes'])
    });

    assert.equal(await completion, 'video.mp4');
    assert.equal(saved, true);
});

test('blob fallback rejects a conflicting non-media response header', async (t) => {
    let requestDetails;
    globalThis.GM_xmlhttpRequest = (details) => {
        requestDetails = details;
        return { abort() {} };
    };
    t.after(() => {
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadViaBlob({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4'
    }, 'video.mp4', createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        saveBlob() {
            assert.fail('non-media response must not be saved');
        }
    });

    requestDetails.onload({
        status: 200,
        finalUrl: 'https://cdninstagram.com/video.mp4',
        responseHeaders: 'Content-Type: text/html',
        response: new Blob(['<html>error</html>'], { type: 'video/mp4' })
    });

    await assert.rejects(completion, /unexpected_media_mime:text\/html/);
});

test('an active blob fallback is not aborted while progress continues', async (t) => {
    const clock = createManualClock();
    let requestDetails;
    let aborts = 0;
    globalThis.GM_xmlhttpRequest = (details) => {
        requestDetails = details;
        return {
            abort() {
                aborts += 1;
            }
        };
    };
    t.after(() => {
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadViaBlob({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4'
    }, 'video.mp4', createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        timeoutMs: 30,
        watchdogMs: 30,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
        saveBlob() {}
    });

    clock.advanceBy(20);
    requestDetails.onprogress({ loaded: 1, total: 10 });
    clock.advanceBy(20);
    assert.equal(aborts, 0);

    requestDetails.onload({
        status: 200,
        finalUrl: 'https://cdninstagram.com/video.mp4',
        responseHeaders: 'Content-Type: video/mp4',
        response: new Blob(['video bytes'], { type: 'video/mp4' })
    });
    assert.equal(await completion, 'video.mp4');
});

test('blob fallback receives its own deadline after GM_download fails', async (t) => {
    const clock = createManualClock();
    let blobDetails;
    let blobAborts = 0;
    const originalWarn = console.warn;
    console.warn = () => {};
    globalThis.document = { body: null };
    globalThis.GM_download = (details) => {
        details.onerror(new Error('network download failed'));
        return { abort() {} };
    };
    globalThis.GM_xmlhttpRequest = (details) => {
        blobDetails = details;
        return {
            abort() {
                blobAborts += 1;
            }
        };
    };
    t.after(() => {
        console.warn = originalWarn;
        delete globalThis.document;
        delete globalThis.GM_download;
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadItem({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4',
        postInfo: {
            author: 'author',
            postId: 'POST_FALLBACK',
            postUrl: 'https://www.threads.com/@author/post/POST_FALLBACK',
            createdAt: new Date('2026-08-11T00:00:00Z')
        }
    }, createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        timeoutMs: 30,
        watchdogMs: 30,
        blobWatchdogMs: 100,
        overallWatchdogMs: 60,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
        saveBlob() {}
    });

    clock.advanceBy(70);
    assert.equal(blobAborts, 0);

    blobDetails.onload({
        status: 200,
        finalUrl: 'https://cdninstagram.com/video.mp4',
        responseHeaders: 'Content-Type: video/mp4',
        response: new Blob(['video bytes'], { type: 'video/mp4' })
    });
    assert.equal(await completion, true);
});

test('a download whose managers never callback is aborted and settles', async (t) => {
    const clock = createManualClock();
    let gmAborts = 0;
    let blobAborts = 0;
    const originalWarn = console.warn;
    console.warn = () => {};
    globalThis.document = { body: null };
    globalThis.GM_download = () => ({
        abort() {
            gmAborts += 1;
        }
    });
    globalThis.GM_xmlhttpRequest = () => ({
        abort() {
            blobAborts += 1;
        }
    });
    t.after(() => {
        console.warn = originalWarn;
        delete globalThis.document;
        delete globalThis.GM_download;
        delete globalThis.GM_xmlhttpRequest;
    });

    const completion = downloadItem({
        type: 'video',
        url: 'https://cdninstagram.com/video.mp4',
        postInfo: {
            author: 'author',
            postId: 'POST_NEVER_CALLBACK',
            postUrl: 'https://www.threads.com/@author/post/POST_NEVER_CALLBACK',
            createdAt: new Date('2026-08-11T00:00:00Z')
        }
    }, createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true }), {
        timeoutMs: 30,
        watchdogMs: 30,
        blobWatchdogMs: 40,
        overallWatchdogMs: 60,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
        saveBlob() {}
    });

    clock.advanceBy(70);
    assert.equal(await completion, false);
    assert.equal(gmAborts, 1);
    assert.equal(blobAborts, 1);
});

test('batch download rejects a second click while the first batch is active', async (t) => {
    globalThis.document = { body: null };
    t.after(() => {
        delete globalThis.document;
    });
    let releaseDownload;
    let downloadCalls = 0;
    const downloadGate = new Promise((resolve) => {
        releaseDownload = resolve;
    });
    const activationToken = createUserActivationToken({
        isTrusted: true,
        type: 'click',
        detail: 1
    }, { isActive: true });
    const options = {
        items: [{
            type: 'video',
            resolvedUrl: 'https://cdninstagram.com/video.mp4',
            selected: true,
            postInfo: {
                author: 'author',
                postId: 'POST_BATCH'
            }
        }],
        downloadFn: async () => {
            downloadCalls += 1;
            return downloadGate;
        },
        delayFn: async () => {}
    };

    const firstBatch = downloadModalItems(false, activationToken, options);
    assert.equal(await downloadModalItems(false, activationToken, options), false);
    assert.equal(downloadCalls, 1);

    releaseDownload(true);
    assert.equal(await firstBatch, true);
});
