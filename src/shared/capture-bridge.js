import { validateMediaUrl } from './media-policy.js';
import { normalizePostIdentity } from './post-model.js';
import { buildMediaRouteKey } from './route-media-state.js';
import { CAPTURE_OPERATION_ALLOWLIST } from './network-policy.js';

export const CAPTURE_BRIDGE_MARKER = 'threads-plugin-capture';
export const CAPTURE_BRIDGE_VERSION = 1;
export const CAPTURE_BRIDGE_MAX_BYTES = 64 * 1024;
export const CAPTURE_BRIDGE_MAX_RECORDS = 128;
export const CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW = 256;
export const CAPTURE_BRIDGE_MESSAGE_WINDOW_MS = 60_000;
export const CAPTURE_BRIDGE_MAX_REPLAY_IDS = 256;

const ALLOWED_OPERATIONS = new Set(CAPTURE_OPERATION_ALLOWLIST);
const PAYLOAD_KEYS = Object.freeze([
    'marker', 'messageId', 'operationId', 'records', 'sourceRouteGeneration',
    'sourceRouteKey', 'type', 'version'
]);
const RECORD_KEYS = Object.freeze(['postId', 'type', 'url']);

function sameExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function jsonByteLength(value) {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}

function isThreadsRouteKey(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' && [
            'www.threads.com', 'threads.com', 'www.threads.net', 'threads.net'
        ].includes(parsed.hostname) && !parsed.hash;
    } catch {
        return false;
    }
}

function normalizeRecord(record) {
    if (!sameExactKeys(record, RECORD_KEYS)) return null;
    if (record.type !== 'image' && record.type !== 'video') return null;
    const postId = normalizePostIdentity(record.postId);
    if (!postId) return null;
    const media = validateMediaUrl(record.url, record.type);
    if (!media.ok) return null;
    return Object.freeze({ type: record.type, url: media.url, postId });
}

function isRouteGeneration(value) {
    return typeof value === 'string' && /^[a-f0-9]{16,64}$/.test(value);
}

export function createCaptureBridgeState({ now = () => Date.now() } = {}) {
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    const replayMessageIds = new Map();
    let windowStartedAt = null;
    let acceptedMessages = 0;

    const readNow = () => {
        try {
            const timestamp = Number(now());
            return Number.isFinite(timestamp) ? timestamp : Date.now();
        } catch {
            return Date.now();
        }
    };
    const refreshWindow = () => {
        const timestamp = readNow();
        if (windowStartedAt === null ||
            timestamp < windowStartedAt ||
            timestamp - windowStartedAt >= CAPTURE_BRIDGE_MESSAGE_WINDOW_MS) {
            windowStartedAt = timestamp;
            acceptedMessages = 0;
        }
    };

    return Object.freeze({
        acceptMessageId(messageId) {
            if (replayMessageIds.has(messageId)) return 'replay';
            refreshWindow();
            if (acceptedMessages >= CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW) return 'message_limit';
            acceptedMessages += 1;
            replayMessageIds.set(messageId, true);
            while (replayMessageIds.size > CAPTURE_BRIDGE_MAX_REPLAY_IDS) {
                replayMessageIds.delete(replayMessageIds.keys().next().value);
            }
            return '';
        }
    });
}

export function createCaptureBridgePayload({
    records,
    sourceRouteKey,
    sourceRouteGeneration,
    operationId,
    messageId
}) {
    const normalizedRecords = Array.from(records || [])
        .slice(0, CAPTURE_BRIDGE_MAX_RECORDS)
        .map(normalizeRecord)
        .filter(Boolean);
    if (!normalizedRecords.length || !ALLOWED_OPERATIONS.has(operationId)) return null;
    if (typeof sourceRouteKey !== 'string' || !isThreadsRouteKey(sourceRouteKey)) return null;
    if (!isRouteGeneration(sourceRouteGeneration)) return null;
    const safeMessageId = typeof messageId === 'string' && /^[a-f0-9]{16,64}$/.test(messageId)
        ? messageId
        : null;
    if (!safeMessageId) return null;
    const payload = Object.freeze({
        marker: CAPTURE_BRIDGE_MARKER,
        version: CAPTURE_BRIDGE_VERSION,
        type: 'MEDIA_RECORDS',
        messageId: safeMessageId,
        sourceRouteKey,
        sourceRouteGeneration,
        operationId,
        records: Object.freeze(normalizedRecords)
    });
    return jsonByteLength(payload) <= CAPTURE_BRIDGE_MAX_BYTES ? payload : null;
}

export function validateCaptureBridgeEvent(
    event,
    pageUrl,
    bridgeState,
    expectedSource = globalThis.window,
    expectedSourceRouteGeneration = ''
) {
    let page;
    try { page = new URL(pageUrl); } catch { return { ok: false, reason: 'invalid_page' }; }
    if (!expectedSource || event?.source !== expectedSource) {
        return { ok: false, reason: 'invalid_source' };
    }
    if (event?.origin !== page.origin) return { ok: false, reason: 'invalid_origin' };
    const payload = event?.data;
    if (!sameExactKeys(payload, PAYLOAD_KEYS)) return { ok: false, reason: 'invalid_schema' };
    if (payload.marker !== CAPTURE_BRIDGE_MARKER ||
        payload.version !== CAPTURE_BRIDGE_VERSION ||
        payload.type !== 'MEDIA_RECORDS') {
        return { ok: false, reason: 'invalid_protocol' };
    }
    if (!/^[a-f0-9]{16,64}$/.test(payload.messageId || '')) return { ok: false, reason: 'invalid_message_id' };
    if (!ALLOWED_OPERATIONS.has(payload.operationId)) return { ok: false, reason: 'invalid_operation' };
    if (payload.sourceRouteKey !== buildMediaRouteKey(page.href)) return { ok: false, reason: 'stale_route' };
    if (!isRouteGeneration(payload.sourceRouteGeneration) ||
        payload.sourceRouteGeneration !== expectedSourceRouteGeneration) {
        return { ok: false, reason: 'stale_generation' };
    }
    if (!Array.isArray(payload.records) ||
        payload.records.length < 1 ||
        payload.records.length > CAPTURE_BRIDGE_MAX_RECORDS ||
        jsonByteLength(payload) > CAPTURE_BRIDGE_MAX_BYTES) {
        return { ok: false, reason: 'invalid_size' };
    }
    const records = payload.records.map(normalizeRecord);
    if (records.some((record) => !record)) return { ok: false, reason: 'invalid_record' };
    if (typeof bridgeState?.acceptMessageId !== 'function') return { ok: false, reason: 'invalid_bridge_state' };
    const bridgeStateRejection = bridgeState.acceptMessageId(payload.messageId);
    if (bridgeStateRejection) return { ok: false, reason: bridgeStateRejection };

    return {
        ok: true,
        records: Object.freeze(records),
        sourceRouteKey: payload.sourceRouteKey,
        sourceRouteGeneration: payload.sourceRouteGeneration,
        operationId: payload.operationId
    };
}
