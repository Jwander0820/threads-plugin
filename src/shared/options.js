import { normalizeLocalePreference } from './i18n.js';

export const DEFAULT_OPTIONS = Object.freeze({
    enableCopyOriginalLink: true,
    enableCopyPostText: true,
    enableBatchMediaDownload: true,
    enablePerMediaDownload: true,
    languagePreference: 'auto',
    hoverScanIntervalMs: 160,
    layoutRefreshIntervalMs: 260,
    backgroundScanIntervalMs: 5000,
    ignoreHorizontalOnlyScroll: true
});

function normalizeNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeOptions(value) {
    let stored = value;
    if (typeof stored === 'string') {
        try { stored = JSON.parse(stored); } catch { stored = {}; }
    }
    if (!stored || typeof stored !== 'object') stored = {};

    const enableBatchMediaDownload = typeof stored.enableBatchMediaDownload === 'boolean'
        ? stored.enableBatchMediaDownload
        : stored.enablePostMediaPicker !== false;

    return Object.freeze({
        enableCopyOriginalLink: stored.enableCopyOriginalLink !== false,
        enableCopyPostText: stored.enableCopyPostText !== false,
        enableBatchMediaDownload,
        enablePerMediaDownload: stored.enablePerMediaDownload !== false,
        languagePreference: normalizeLocalePreference(stored.languagePreference),
        hoverScanIntervalMs: normalizeNumber(stored.hoverScanIntervalMs, DEFAULT_OPTIONS.hoverScanIntervalMs, 0, 2000),
        layoutRefreshIntervalMs: normalizeNumber(stored.layoutRefreshIntervalMs, DEFAULT_OPTIONS.layoutRefreshIntervalMs, 0, 5000),
        backgroundScanIntervalMs: normalizeNumber(stored.backgroundScanIntervalMs, DEFAULT_OPTIONS.backgroundScanIntervalMs, 3000, 60000),
        ignoreHorizontalOnlyScroll: stored.ignoreHorizontalOnlyScroll !== false
    });
}
