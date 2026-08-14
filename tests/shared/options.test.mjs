import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_OPTIONS, normalizeOptions } from '../../src/shared/options.js';

test('options normalization is immutable, bounded and shared across adapters', () => {
    const normalized = normalizeOptions({
        enablePostMediaPicker: false,
        hoverScanIntervalMs: -2,
        layoutRefreshIntervalMs: 9000,
        backgroundScanIntervalMs: '6000',
        ignoreHorizontalOnlyScroll: false
    });
    assert.deepEqual(normalized, {
        enablePostMediaPicker: false,
        hoverScanIntervalMs: 0,
        layoutRefreshIntervalMs: 5000,
        backgroundScanIntervalMs: 6000,
        ignoreHorizontalOnlyScroll: false
    });
    assert.equal(Object.isFrozen(normalized), true);
    assert.deepEqual(normalizeOptions(null), DEFAULT_OPTIONS);
    assert.equal(DEFAULT_OPTIONS.backgroundScanIntervalMs, 5000);
});
