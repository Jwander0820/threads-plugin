import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyNetworkCaptureRequest,
    inspectResponse,
    inspectXhrResponse,
    isSensitiveThreadsRoute,
    NETWORK_RESPONSE_MAX_BYTES
} from '../../src/shared/network-policy.js';

const feedRequest = 'https://www.threads.com/api/graphql?operationName=BarcelonaFeedQuery';

test('network policy accepts one known operation and rejects conflicts, unknown operations and sensitive routes', () => {
    assert.equal(classifyNetworkCaptureRequest({
        url: feedRequest,
        routeUrl: 'https://www.threads.com/'
    }).allowed, true);
    assert.equal(classifyNetworkCaptureRequest({
        url: `${feedRequest}&operation_name=BarcelonaSearchQuery`,
        routeUrl: 'https://www.threads.com/'
    }).reason, 'operation_conflict');
    assert.equal(classifyNetworkCaptureRequest({
        url: 'https://www.threads.com/api/graphql?operationName=AccountSettingsQuery',
        routeUrl: 'https://www.threads.com/'
    }).reason, 'unknown_operation');
    assert.equal(classifyNetworkCaptureRequest({
        url: feedRequest,
        routeUrl: 'https://www.threads.com/messages/'
    }).reason, 'sensitive_route');
});

test('sensitive route policy fails closed for encoded and malformed aliases', () => {
    for (const url of [
        'https://www.threads.com/%6dessages/',
        'https://www.threads.com/messages%2Fthread/1',
        'https://www.threads.com/%256dessages/',
        'https://www.threads.com/safe/..%2Fmessages/thread/1',
        'https://www.threads.com/messages%ZZ/thread/1'
    ]) {
        assert.equal(isSensitiveThreadsRoute(url), true, url);
        assert.equal(classifyNetworkCaptureRequest({ url: feedRequest, routeUrl: url }).reason, 'sensitive_route');
    }
});

test('network response policy rejects MIME and declared-size violations before extraction', async () => {
    const context = classifyNetworkCaptureRequest({ url: feedRequest, routeUrl: 'https://www.threads.com/' });
    let extractions = 0;
    assert.equal(await inspectResponse(new Response('{}', {
        status: 200,
        headers: { 'content-type': 'text/html' }
    }), context, { extractor: () => { extractions += 1; } }), false);
    assert.equal(await inspectResponse(new Response('{}', {
        status: 200,
        headers: {
            'content-type': 'application/json',
            'content-length': String(NETWORK_RESPONSE_MAX_BYTES + 1)
        }
    }), context, { extractor: () => { extractions += 1; } }), false);
    assert.equal(extractions, 0);
});

test('response hard ceiling cannot be raised by fetch or XHR options', async () => {
    const context = classifyNetworkCaptureRequest({ url: feedRequest, routeUrl: 'https://www.threads.com/' });
    let extractions = 0;
    const oversizedStream = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(NETWORK_RESPONSE_MAX_BYTES + 1));
            controller.close();
        }
    });
    assert.equal(await inspectResponse(new Response(oversizedStream, {
        status: 200,
        headers: { 'content-type': 'application/json' }
    }), context, {
        maxBytes: NETWORK_RESPONSE_MAX_BYTES + 1,
        extractor: () => { extractions += 1; }
    }), false);

    const oversizedXhr = {
        responseType: 'text',
        responseText: 'a'.repeat(NETWORK_RESPONSE_MAX_BYTES + 1),
        responseURL: feedRequest,
        status: 200,
        getResponseHeader(name) { return name === 'content-type' ? 'text/plain' : ''; }
    };
    assert.equal(await inspectXhrResponse(oversizedXhr, context, {
        maxBytes: NETWORK_RESPONSE_MAX_BYTES + 1,
        extractor: () => { extractions += 1; }
    }), false);
    assert.equal(extractions, 0);
});

test('response inspection still honors a smaller caller-provided ceiling', async () => {
    const context = classifyNetworkCaptureRequest({ url: feedRequest, routeUrl: 'https://www.threads.com/' });
    let extractions = 0;
    assert.equal(await inspectResponse(new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
    }), context, {
        maxBytes: 2,
        extractor: () => { extractions += 1; }
    }), true);
    const xhr = {
        responseType: 'text',
        responseText: '{}',
        responseURL: feedRequest,
        status: 200,
        getResponseHeader(name) { return name === 'content-type' ? 'text/plain' : ''; }
    };
    assert.equal(await inspectXhrResponse(xhr, context, {
        maxBytes: 2,
        extractor: () => { extractions += 1; }
    }), true);
    assert.equal(extractions, 2);
});

test('response inspection stops before extraction when consent or route becomes inactive', async () => {
    const context = classifyNetworkCaptureRequest({ url: feedRequest, routeUrl: 'https://www.threads.com/' });
    let active = true;
    let extractions = 0;
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('{'));
            queueMicrotask(() => {
                active = false;
                controller.enqueue(new TextEncoder().encode('}'));
                controller.close();
            });
        }
    });
    const response = new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    assert.equal(await inspectResponse(response, context, {
        shouldContinue: () => active,
        extractor: () => { extractions += 1; }
    }), false);
    assert.equal(extractions, 0);

    const xhr = {
        responseType: 'text',
        responseText: '{}',
        responseURL: feedRequest,
        status: 200,
        getResponseHeader(name) { return name === 'content-type' ? 'application/json' : ''; }
    };
    assert.equal(await inspectXhrResponse(xhr, context, {
        shouldContinue: () => false,
        extractor: () => { extractions += 1; }
    }), false);
    assert.equal(extractions, 0);
});

test('response inspection abort signal cancels a pending stream reader', async () => {
    const context = classifyNetworkCaptureRequest({ url: feedRequest, routeUrl: 'https://www.threads.com/' });
    const controller = new AbortController();
    let extractions = 0;
    let cancelReason = '';
    const reader = {
        read: () => new Promise(() => {}),
        cancel(reason) { cancelReason = reason; return new Promise(() => {}); }
    };
    const inspection = inspectResponse({
        status: 200,
        url: feedRequest,
        headers: { get: (name) => name === 'content-type' ? 'application/json' : '' },
        clone: () => ({ body: { getReader: () => reader } })
    }, context, {
        signal: controller.signal,
        extractor: () => { extractions += 1; }
    });
    await Promise.resolve();
    controller.abort();
    assert.equal(await Promise.race([
        inspection,
        new Promise((_, reject) => setTimeout(() => reject(new Error('inspection_timeout')), 250))
    ]), false);
    assert.equal(cancelReason, 'capture_stopped');
    assert.equal(extractions, 0);
});
