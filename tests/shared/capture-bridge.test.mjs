import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CAPTURE_BRIDGE_MAX_BYTES,
    CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW,
    CAPTURE_BRIDGE_MAX_RECORDS,
    CAPTURE_BRIDGE_MESSAGE_WINDOW_MS,
    createCaptureBridgeState,
    createCaptureBridgePayload,
    validateCaptureBridgeEvent
} from '../../src/shared/capture-bridge.js';
import { MEDIA_URL_MAX_LENGTH } from '../../src/shared/media-policy.js';
import { buildMediaRouteKey } from '../../src/shared/route-media-state.js';

const pageUrl = 'https://www.threads.com/@author/post/ABC123';
const source = {};
const routeGeneration = 'abcdef0123456789abcdef0123456789';
const validRecord = {
    type: 'video',
    url: 'https://video.cdninstagram.com/media.mp4?token=1',
    postId: 'ABC123'
};

function payload(overrides = {}) {
    return createCaptureBridgePayload({
        records: [validRecord],
        sourceRouteKey: buildMediaRouteKey(pageUrl),
        sourceRouteGeneration: routeGeneration,
        operationId: 'BarcelonaPostPageQuery',
        messageId: '0123456789abcdef0123456789abcdef',
        ...overrides
    });
}

function event(data = payload(), overrides = {}) {
    return {
        source,
        origin: 'https://www.threads.com',
        data,
        ...overrides
    };
}

function mediaUrlWithLength(length) {
    const prefix = 'https://cdninstagram.com/media/video.mp4?token=';
    assert.ok(length >= prefix.length);
    return `${prefix}${'a'.repeat(length - prefix.length)}`;
}

function jsonByteLength(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function messageId(index) {
    return index.toString(16).padStart(32, '0');
}

function bridgeState(options) {
    return createCaptureBridgeState(options);
}

test('bridge accepts exact current-route records once', () => {
    const state = bridgeState();
    const accepted = validateCaptureBridgeEvent(event(), pageUrl, state, source, routeGeneration);
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.records, [validRecord]);
    assert.equal(validateCaptureBridgeEvent(event(), pageUrl, state, source, routeGeneration).reason, 'replay');
});

test('bridge rejects forged source, origin, operation, route and extra schema fields', () => {
    assert.equal(validateCaptureBridgeEvent(event(), pageUrl, bridgeState(), {}, routeGeneration).reason, 'invalid_source');
    assert.equal(validateCaptureBridgeEvent(event(payload(), { origin: 'https://attacker.example' }), pageUrl, bridgeState(), source, routeGeneration).reason, 'invalid_origin');
    assert.equal(payload({ operationId: 'AccountSettingsQuery' }), null);
    assert.equal(validateCaptureBridgeEvent(event({ ...payload(), sourceRouteKey: buildMediaRouteKey('https://www.threads.com/search?q=x') }), pageUrl, bridgeState(), source, routeGeneration).reason, 'stale_route');
    assert.equal(validateCaptureBridgeEvent(event({ ...payload(), sourceRouteGeneration: '1111111111111111' }), pageUrl, bridgeState(), source, routeGeneration).reason, 'stale_generation');
    assert.equal(validateCaptureBridgeEvent(event({ ...payload(), extra: true }), pageUrl, bridgeState(), source, routeGeneration).reason, 'invalid_schema');
});

test('bridge bounds records and rejects invalid media record shapes', () => {
    const bounded = payload({ records: Array.from({ length: CAPTURE_BRIDGE_MAX_RECORDS + 20 }, () => validRecord) });
    assert.equal(bounded.records.length, CAPTURE_BRIDGE_MAX_RECORDS);
    assert.equal(createCaptureBridgePayload({
        records: [{ ...validRecord, url: 'https://attacker.example/media.mp4' }],
        sourceRouteKey: buildMediaRouteKey(pageUrl),
        sourceRouteGeneration: routeGeneration,
        operationId: 'BarcelonaPostPageQuery',
        messageId: '0123456789abcdef'
    }), null);
    assert.equal(validateCaptureBridgeEvent(event({
        ...payload(),
        records: [{ ...validRecord, extra: true }]
    }), pageUrl, bridgeState(), source, routeGeneration).reason, 'invalid_record');
});

test('bridge enforces the fixed media URL-length boundary on send and receive', () => {
    const exact = mediaUrlWithLength(MEDIA_URL_MAX_LENGTH);
    const oversized = mediaUrlWithLength(MEDIA_URL_MAX_LENGTH + 1);
    const acceptedPayload = payload({ records: [{ ...validRecord, url: exact }] });
    assert.notEqual(acceptedPayload, null);
    assert.equal(payload({ records: [{ ...validRecord, url: oversized }] }), null);
    const forged = { ...acceptedPayload, records: [{ ...validRecord, url: oversized }] };
    assert.equal(validateCaptureBridgeEvent(event(forged), pageUrl, bridgeState(), source, routeGeneration).reason, 'invalid_record');
});

test('bridge accepts an exact 64 KiB message and rejects one byte over', () => {
    const maximumUrls = Array.from({ length: 7 }, () => ({ ...validRecord, url: mediaUrlWithLength(MEDIA_URL_MAX_LENGTH) }));
    const shortUrl = mediaUrlWithLength(64);
    const baseRecords = [...maximumUrls, { ...validRecord, url: shortUrl }];
    const basePayload = payload({ records: baseRecords });
    assert.notEqual(basePayload, null);
    const remainingBytes = CAPTURE_BRIDGE_MAX_BYTES - jsonByteLength(basePayload);
    const exactLastUrl = mediaUrlWithLength(shortUrl.length + remainingBytes);
    assert.ok(exactLastUrl.length <= MEDIA_URL_MAX_LENGTH);
    const exactRecords = [...maximumUrls, { ...validRecord, url: exactLastUrl }];
    const exactPayload = payload({ records: exactRecords });
    assert.notEqual(exactPayload, null);
    assert.equal(jsonByteLength(exactPayload), CAPTURE_BRIDGE_MAX_BYTES);
    const oversizedRecords = [...maximumUrls, { ...validRecord, url: mediaUrlWithLength(exactLastUrl.length + 1) }];
    assert.equal(payload({ records: oversizedRecords }), null);
});

test('bridge receiver enforces exact record and post-id boundaries', () => {
    const exactRecords = Array.from({ length: CAPTURE_BRIDGE_MAX_RECORDS }, () => validRecord);
    const acceptedPayload = payload({ records: exactRecords });
    assert.equal(acceptedPayload.records.length, CAPTURE_BRIDGE_MAX_RECORDS);
    assert.equal(validateCaptureBridgeEvent(event(acceptedPayload), pageUrl, bridgeState(), source, routeGeneration).ok, true);
    const oversizedPayload = { ...acceptedPayload, records: [...acceptedPayload.records, validRecord] };
    assert.equal(validateCaptureBridgeEvent(event(oversizedPayload), pageUrl, bridgeState(), source, routeGeneration).reason, 'invalid_size');
    const exactPostId = 'p'.repeat(80);
    assert.notEqual(payload({ records: [{ ...validRecord, postId: exactPostId }] }), null);
    assert.equal(payload({ records: [{ ...validRecord, postId: `${exactPostId}p` }] }), null);
    for (const postId of ['_ABCDE', 'ABCDE', 'ABCDE_']) {
        assert.notEqual(payload({ records: [{ ...validRecord, postId }] }), null);
    }
});

test('bridge fixed window accepts 256 valid messages, rejects the 257th, and reopens at 60 seconds', () => {
    let now = 1_000;
    const state = bridgeState({ now: () => now });
    for (let index = 0; index < CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW; index += 1) {
        const candidate = payload({ messageId: messageId(index) });
        assert.equal(validateCaptureBridgeEvent(event(candidate), pageUrl, state, source, routeGeneration).ok, true, `message ${index}`);
    }
    const firstReplay = payload({ messageId: messageId(0) });
    assert.equal(validateCaptureBridgeEvent(event(firstReplay), pageUrl, state, source, routeGeneration).reason, 'replay');
    const overflow = payload({ messageId: messageId(CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW) });
    assert.equal(validateCaptureBridgeEvent(event(overflow), pageUrl, state, source, routeGeneration).reason, 'message_limit');
    now += CAPTURE_BRIDGE_MESSAGE_WINDOW_MS - 1;
    assert.equal(validateCaptureBridgeEvent(event(overflow), pageUrl, state, source, routeGeneration).reason, 'message_limit');
    now += 1;
    assert.equal(validateCaptureBridgeEvent(event(overflow), pageUrl, state, source, routeGeneration).ok, true);
});

test('invalid bridge messages do not consume the accepted-message quota', () => {
    const state = bridgeState();
    for (let index = 0; index <= CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW; index += 1) {
        const forged = { ...payload({ messageId: messageId(index) }), operationId: 'AccountSettingsQuery' };
        assert.equal(validateCaptureBridgeEvent(event(forged), pageUrl, state, source, routeGeneration).reason, 'invalid_operation');
    }
    const accepted = payload({ messageId: messageId(CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW + 1) });
    assert.equal(validateCaptureBridgeEvent(event(accepted), pageUrl, state, source, routeGeneration).ok, true);
});

test('bounded replay LRU cannot bypass a full rate window and permits an evicted id next window', () => {
    let now = 5_000;
    const state = bridgeState({ now: () => now });
    for (let index = 0; index < CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW; index += 1) {
        assert.equal(validateCaptureBridgeEvent(
            event(payload({ messageId: messageId(index) })), pageUrl, state, source, routeGeneration
        ).ok, true);
    }
    now += CAPTURE_BRIDGE_MESSAGE_WINDOW_MS;
    for (let index = CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW;
        index < CAPTURE_BRIDGE_MAX_MESSAGES_PER_WINDOW * 2;
        index += 1) {
        assert.equal(validateCaptureBridgeEvent(
            event(payload({ messageId: messageId(index) })), pageUrl, state, source, routeGeneration
        ).ok, true);
    }
    assert.equal(validateCaptureBridgeEvent(
        event(payload({ messageId: messageId(0) })), pageUrl, state, source, routeGeneration
    ).reason, 'message_limit');
    now += CAPTURE_BRIDGE_MESSAGE_WINDOW_MS;
    assert.equal(validateCaptureBridgeEvent(
        event(payload({ messageId: messageId(0) })), pageUrl, state, source, routeGeneration
    ).ok, true);
});
