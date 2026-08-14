export const DEFAULT_OPTIONS = Object.freeze({
    enablePostMediaPicker: true,
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

    return Object.freeze({
        enablePostMediaPicker: stored.enablePostMediaPicker !== false,
        hoverScanIntervalMs: normalizeNumber(stored.hoverScanIntervalMs, DEFAULT_OPTIONS.hoverScanIntervalMs, 0, 2000),
        layoutRefreshIntervalMs: normalizeNumber(stored.layoutRefreshIntervalMs, DEFAULT_OPTIONS.layoutRefreshIntervalMs, 0, 5000),
        backgroundScanIntervalMs: normalizeNumber(stored.backgroundScanIntervalMs, DEFAULT_OPTIONS.backgroundScanIntervalMs, 3000, 60000),
        ignoreHorizontalOnlyScroll: stored.ignoreHorizontalOnlyScroll !== false
    });
}
