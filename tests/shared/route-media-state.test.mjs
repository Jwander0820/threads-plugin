import assert from 'node:assert/strict';
import test from 'node:test';

import {
    areMediaUrlsEquivalent,
    buildMediaRouteKey,
    mergeMediaUrlCache,
    transitionMediaRouteScope
} from '../../src/shared/route-media-state.js';

test('route identity ignores tracking but preserves semantic query parameters', () => {
    assert.equal(
        buildMediaRouteKey('https://www.threads.com/search?utm_source=x&q=alpha'),
        'https://www.threads.com/search?q=alpha'
    );
    assert.notEqual(
        buildMediaRouteKey('https://www.threads.com/search?q=alpha'),
        buildMediaRouteKey('https://www.threads.com/search?q=beta')
    );
});

test('route transition treats initial scope as initialization and later changes as isolation boundaries', () => {
    assert.deepEqual(transitionMediaRouteScope({ routeKey: '' }, '/first'), {
        routeKey: '/first',
        changed: false
    });
    assert.deepEqual(transitionMediaRouteScope({ routeKey: '/first' }, '/second'), {
        routeKey: '/second',
        changed: true
    });
});

test('media identity ignores volatile CDN query fields and cache remains bounded', () => {
    const first = 'https://cdninstagram.com/media/photo.jpg?ig_cache_key=KEY&bytestart=0';
    const second = 'https://cdninstagram.com/media/photo.jpg?ig_cache_key=KEY&bytestart=100';
    assert.equal(areMediaUrlsEquivalent(first, second), true);
    assert.deepEqual(mergeMediaUrlCache([first], second, 1), [second]);
});

test('the default per-post media URL cache keeps only the newest 32 identities', () => {
    let cache = [];
    for (let index = 0; index <= 32; index += 1) {
        const url = `https://cdninstagram.com/media/photo.jpg?slot=${index}`;
        cache = mergeMediaUrlCache(cache, url);
    }
    assert.equal(cache.length, 32);
    assert.match(cache[0], /slot=32$/);
    assert.equal(cache.some((url) => /slot=0$/.test(url)), false);
});
