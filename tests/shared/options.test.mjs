import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_OPTIONS, normalizeOptions } from '../../src/shared/options.js';

test('options normalization is immutable, bounded and shared across adapters', () => {
    const normalized = normalizeOptions({
        enableCopyOriginalLink: false,
        enableCopyPostText: false,
        enableBatchMediaDownload: false,
        enablePerMediaDownload: false,
        languagePreference: 'en',
        hoverScanIntervalMs: -2,
        layoutRefreshIntervalMs: 9000,
        backgroundScanIntervalMs: '6000',
        ignoreHorizontalOnlyScroll: false
    });
    assert.deepEqual(normalized, {
        enableCopyOriginalLink: false,
        enableCopyPostText: false,
        enableBatchMediaDownload: false,
        enablePerMediaDownload: false,
        languagePreference: 'en',
        hoverScanIntervalMs: 0,
        layoutRefreshIntervalMs: 5000,
        backgroundScanIntervalMs: 6000,
        ignoreHorizontalOnlyScroll: false
    });
    assert.equal(Object.isFrozen(normalized), true);
    assert.deepEqual(normalizeOptions(null), DEFAULT_OPTIONS);
    assert.equal(DEFAULT_OPTIONS.backgroundScanIntervalMs, 5000);
    assert.equal(DEFAULT_OPTIONS.languagePreference, 'auto');
    assert.equal(normalizeOptions({ languagePreference: 'ja' }).languagePreference, 'auto');
});

test('legacy batch-picker preference migrates without changing the other feature defaults', () => {
    const migrated = normalizeOptions('{"enablePostMediaPicker":false}');
    assert.equal(migrated.enableBatchMediaDownload, false);
    assert.equal(migrated.enableCopyOriginalLink, true);
    assert.equal(migrated.enableCopyPostText, true);
    assert.equal(migrated.enablePerMediaDownload, true);

    assert.equal(normalizeOptions({
        enablePostMediaPicker: false,
        enableBatchMediaDownload: true
    }).enableBatchMediaDownload, true);
});
