import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
    downloadItem,
    filterRoutePerformanceEntries,
    finalizeModalItems,
    findShareSvgFromEvent,
    getModalDownloadItems,
    isNativeCopyLinkActionRect,
    transitionMediaRouteScope,
    updateRouteScopedRecentVideoUrls
} = require('../threads-plugin.user.js');

globalThis.location = {
    href: 'https://www.threads.com/@current/post/POST_B'
};

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

test('changing Threads routes excludes video fallbacks captured on the previous route', () => {
    const nextScope = transitionMediaRouteScope({
        routeKey: '/@author/post/POST_A',
        performanceEntryStart: 0,
        performanceStartedAt: 0,
        performanceEntryCursor: 1,
        recentVideoUrls: ['https://cdninstagram.com/post-a.mp4']
    }, '/@author/post/POST_B', 1, 1000);

    assert.deepEqual(nextScope, {
        routeKey: '/@author/post/POST_B',
        performanceEntryStart: 1,
        performanceStartedAt: 1000,
        performanceEntryCursor: 1,
        recentVideoUrls: [],
        changed: true
    });

    const resourceEntries = [
        { name: 'https://cdninstagram.com/post-a.mp4', startTime: 100 },
        { name: 'https://cdninstagram.com/post-a-late.mp4', startTime: 900 },
        { name: 'https://cdninstagram.com/post-b.mp4', startTime: 1100 }
    ];
    assert.deepEqual(
        filterRoutePerformanceEntries(
            resourceEntries,
            nextScope.performanceEntryStart,
            nextScope.performanceStartedAt
        ).map((entry) => entry.name),
        ['https://cdninstagram.com/post-b.mp4']
    );

    assert.deepEqual(updateRouteScopedRecentVideoUrls({
        recentVideoUrls: nextScope.recentVideoUrls,
        url: 'https://cdninstagram.com/post-a-late.mp4',
        sourceRouteKey: '/@author/post/POST_A',
        currentRouteKey: nextScope.routeKey
    }), []);
    assert.deepEqual(updateRouteScopedRecentVideoUrls({
        recentVideoUrls: nextScope.recentVideoUrls,
        url: 'https://cdninstagram.com/post-b.mp4',
        sourceRouteKey: '/@author/post/POST_B',
        currentRouteKey: nextScope.routeKey
    }), ['https://cdninstagram.com/post-b.mp4']);
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
    });

    assert.equal(typeof downloadDetails.ontimeout, 'function');
    downloadDetails.ontimeout(new Error('download timed out'));

    await Promise.race([
        completion,
        new Promise((_, reject) => setTimeout(() => reject(new Error('download did not settle')), 100))
    ]);
    assert.equal(clipboardWrites, 0);
});
