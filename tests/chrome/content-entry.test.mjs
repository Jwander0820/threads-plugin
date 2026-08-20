import assert from 'node:assert/strict';
import test from 'node:test';

import {
    bootstrapChromeContent,
    isExtensionContextInvalidatedError,
    reportContentError
} from '../../src/chrome/content-entry.js';
import {
    acceptPageDisclosure,
    declineOrRevokeConsent,
    setNetworkCaptureConsent
} from '../../src/shared/consent-state.js';

class EventTargetStub {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatch(type, event = {}) { this.listeners.get(type)?.forEach((listener) => listener(event)); }
}

function fixture(initialConsent = acceptPageDisclosure()) {
    const windowTarget = new EventTargetStub();
    const navigation = new EventTargetStub();
    const runtimeMessages = [];
    const postedMessages = [];
    let storageListener = () => {};
    let intervalCallback = () => {};
    let mutationCallback = () => {};
    let randomByte = 8;
    const window = Object.assign(windowTarget, {
        location: { href: 'https://www.threads.com/', origin: 'https://www.threads.com' },
        navigation,
        setInterval(callback) { intervalCallback = callback; return 1; },
        clearInterval() {},
        crypto: { getRandomValues(bytes) { randomByte = (randomByte % 254) + 1; bytes.fill(randomByte); return bytes; } },
        postMessage(message) { postedMessages.push(message); },
        MutationObserver: class {
            constructor(callback) { mutationCallback = callback; }
            observe() {}
            disconnect() {}
        }
    });
    const platform = {
        async loadConsent() { return initialConsent; },
        saveConsent: async () => true,
        subscribeConsent(listener) { storageListener = listener; return () => {}; },
        async loadOptions() { return null; },
        subscribeOptions() { return () => {}; }
    };
    const environment = {
        window,
        document: { documentElement: {} },
        chrome: { runtime: { async sendMessage(message) { runtimeMessages.push(message); return { ok: true }; } } }
    };
    return {
        environment,
        platform,
        emitConsent(value) { storageListener(value); },
        navigate(url) {
            navigation.dispatch('navigate', { destination: { url } });
            window.location.href = url;
            navigation.dispatch('currententrychange');
            mutationCallback();
            intervalCallback();
        },
        runtimeMessages
        ,postedMessages
    };
}

test('extension reload invalidation is silent while unrelated content errors remain visible', () => {
    const logged = [];
    const logger = { error(...args) { logged.push(args); } };

    assert.equal(isExtensionContextInvalidatedError(new Error('Extension context invalidated.')), true);
    assert.equal(isExtensionContextInvalidatedError('Extension context invalidated'), true);
    assert.equal(reportContentError('route sync failed', new Error('Extension context invalidated.'), logger), false);
    assert.equal(logged.length, 0);

    const unexpected = new Error('capture_sync_failed:internal_error');
    assert.equal(reportContentError('route sync failed', unexpected, logger), true);
    assert.deepEqual(logged, [[
        '[Threads Plugin]',
        'route sync failed',
        unexpected
    ]]);
});

test('content bootstrap injects the active chrome.i18n runtime translator', async () => {
    const setup = fixture();
    setup.environment.chrome.i18n = {
        getMessage(key) { return key === 'runtimeLocale' ? 'zh-TW' : ''; }
    };
    let runtimeOptions;
    const controller = await bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async (options) => {
            runtimeOptions = options;
            return {
                async start() { return true; },
                async stop() { return true; },
                async updateOptions() {},
                ingestCapturedMedia() {}
            };
        }
    });

    assert.equal(runtimeOptions.message('copyCleanLink'), '複製這則貼文連結（去追蹤碼）');
    assert.equal(
        runtimeOptions.message('downloadRequested', { filename: 'photo.jpg' }),
        '已提出下載要求：photo.jpg'
    );
    await controller.stop();
});

test('disabling only advanced capture posts STOP immediately while lifecycle work is blocked', async () => {
    const acceptedCapture = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const setup = fixture(acceptedCapture);
    const posted = [];
    setup.environment.window.postMessage = (message) => posted.push(message);
    let releaseSync;
    let syncEntered;
    const entered = new Promise((resolve) => { syncEntered = resolve; });
    const gate = new Promise((resolve) => { releaseSync = resolve; });
    setup.environment.chrome.runtime.sendMessage = async () => {
        syncEntered();
        await gate;
        return { ok: true };
    };
    const bootstrap = bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { return true; },
            async updateOptions() {},
            ingestCapturedMedia() {}
        })
    });
    await entered;
    setup.emitConsent(setNetworkCaptureConsent(acceptedCapture, false));
    assert.ok(posted.some((message) => message.type === 'STOP_CAPTURE'));
    releaseSync();
    const controller = await bootstrap;
    await controller.stop();
});

test('capture sync failure removes the bridge and rejects lifecycle reconciliation', async () => {
    const acceptedCapture = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const setup = fixture(acceptedCapture);
    setup.environment.chrome.runtime.sendMessage = async () => ({ ok: false, error: 'internal_error' });
    const generations = [];
    await assert.rejects(bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { return true; },
            async updateOptions() {},
            setCaptureRouteGeneration(value) { generations.push(value); },
            ingestCapturedMedia() { throw new Error('bridge must be dormant'); }
        })
    }), /capture_sync_failed:internal_error/);
    assert.equal(generations.at(-1), '');
    assert.ok(setup.postedMessages.some((message) => message.type === 'STOP_CAPTURE'));
    assert.equal(setup.environment.window.listeners.get('message')?.size || 0, 0);
});

test('capture listener is ready before MAIN injection sync and route generation rejects stale bridge data', async () => {
    const acceptedCapture = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const setup = fixture(acceptedCapture);
    const calls = [];
    const generations = [];
    const ingested = [];
    setup.environment.window.addEventListener = function (type, listener) {
        EventTargetStub.prototype.addEventListener.call(this, type, listener);
        if (type === 'message') calls.push('listener');
    };
    setup.environment.chrome.runtime.sendMessage = async () => {
        calls.push('sync');
        return { ok: true };
    };
    const controller = await bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { return true; },
            async updateOptions() {},
            setCaptureRouteGeneration(value) { generations.push(value); },
            ingestCapturedMedia(...args) { ingested.push(args); }
        })
    });
    assert.ok(calls.indexOf('listener') < calls.indexOf('sync'));
    const routeState = setup.postedMessages.find((message) => message.type === 'ROUTE_STATE');
    assert.ok(routeState);
    assert.equal(generations.at(-1), routeState.sourceRouteGeneration);

    const record = {
        type: 'video',
        url: 'https://video.cdninstagram.com/media.mp4',
        postId: 'POST_1'
    };
    const basePayload = {
        marker: 'threads-plugin-capture',
        version: 1,
        type: 'MEDIA_RECORDS',
        messageId: '0123456789abcdef0123456789abcdef',
        sourceRouteKey: 'https://www.threads.com/',
        operationId: 'BarcelonaFeedQuery',
        records: [record]
    };
    setup.environment.window.dispatch('message', {
        source: setup.environment.window,
        origin: setup.environment.window.location.origin,
        data: {
            ...basePayload,
            sourceRouteGeneration: '11111111111111111111111111111111'
        }
    });
    assert.equal(ingested.length, 0);

    setup.environment.window.dispatch('message', {
        source: setup.environment.window,
        origin: setup.environment.window.location.origin,
        data: {
            ...basePayload,
            sourceRouteGeneration: routeState.sourceRouteGeneration
        }
    });
    assert.equal(ingested.length, 1);
    assert.equal(ingested[0][2], routeState.sourceRouteGeneration);
    await controller.stop();
});

test('capture READY and route rotation do not reset the document-lifetime bridge rate state', async () => {
    const acceptedCapture = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const setup = fixture(acceptedCapture);
    const ingested = [];
    const controller = await bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { return true; },
            async updateOptions() {},
            setCaptureRouteGeneration() {},
            ingestCapturedMedia(...args) { ingested.push(args); }
        })
    });
    const dispatchCapture = (index, routeState) => setup.environment.window.dispatch('message', {
        source: setup.environment.window,
        origin: setup.environment.window.location.origin,
        data: {
            marker: 'threads-plugin-capture',
            version: 1,
            type: 'MEDIA_RECORDS',
            messageId: index.toString(16).padStart(32, '0'),
            sourceRouteKey: routeState.sourceRouteKey,
            sourceRouteGeneration: routeState.sourceRouteGeneration,
            operationId: 'BarcelonaFeedQuery',
            records: [{
                type: 'video',
                url: `https://video.cdninstagram.com/media-${index}.mp4`,
                postId: `POST_${index}`
            }]
        }
    });
    let routeState = setup.postedMessages.filter((message) => message.type === 'ROUTE_STATE').at(-1);
    for (let index = 0; index < 256; index += 1) dispatchCapture(index, routeState);
    assert.equal(ingested.length, 256);

    setup.environment.window.dispatch('message', {
        source: setup.environment.window,
        origin: setup.environment.window.location.origin,
        data: { marker: 'threads-plugin-capture', version: 1, type: 'CAPTURE_READY' }
    });
    routeState = setup.postedMessages.filter((message) => message.type === 'ROUTE_STATE').at(-1);
    dispatchCapture(256, routeState);
    assert.equal(ingested.length, 256);

    setup.navigate('https://www.threads.com/search?q=bridge-rate');
    routeState = setup.postedMessages.filter((message) => message.type === 'ROUTE_STATE').at(-1);
    dispatchCapture(257, routeState);
    assert.equal(ingested.length, 256);
    await controller.stop();
});

test('a pending safe navigation rotates capture generation before the route commits', async () => {
    const acceptedCapture = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const setup = fixture(acceptedCapture);
    const controller = await bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { return true; },
            async updateOptions() {},
            setCaptureRouteGeneration() {},
            ingestCapturedMedia() {}
        })
    });
    const before = setup.postedMessages.filter((message) => message.type === 'ROUTE_STATE').at(-1);
    setup.environment.window.navigation.dispatch('navigate', {
        destination: { url: 'https://www.threads.com/search?q=pending' }
    });
    const after = setup.postedMessages.filter((message) => message.type === 'ROUTE_STATE').at(-1);
    assert.notEqual(after.sourceRouteGeneration, before.sourceRouteGeneration);
    assert.equal(after.sourceRouteKey, before.sourceRouteKey);
    await controller.stop();
});

test('sensitive-route reconciliation posts STOP immediately even while capture sync is blocked', async () => {
    const acceptedCapture = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const setup = fixture(acceptedCapture);
    const posted = [];
    setup.environment.window.postMessage = (message) => posted.push(message);
    let releaseSync;
    let syncEntered;
    const entered = new Promise((resolve) => { syncEntered = resolve; });
    const gate = new Promise((resolve) => { releaseSync = resolve; });
    setup.environment.chrome.runtime.sendMessage = async () => {
        syncEntered();
        await gate;
        return { ok: true };
    };
    const bootstrap = bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { return true; },
            async updateOptions() {},
            ingestCapturedMedia() {}
        })
    });
    await entered;
    setup.environment.window.location.href = 'https://www.threads.com/messages/';
    setup.emitConsent(acceptedCapture);
    assert.ok(posted.some((message) => message.type === 'STOP_CAPTURE'));
    releaseSync();
    const controller = await bootstrap;
    await controller.stop();
});

test('content lifecycle cannot revive stale accepted consent after a queued revoke', async () => {
    const setup = fixture();
    let releaseStart;
    let startEntered;
    const entered = new Promise((resolve) => { startEntered = resolve; });
    const gate = new Promise((resolve) => { releaseStart = resolve; });
    let starts = 0;
    let stops = 0;
    const bootstrap = bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { starts += 1; startEntered(); await gate; return true; },
            async stop() { stops += 1; return true; },
            async updateOptions() {},
            ingestCapturedMedia() {}
        })
    });
    await entered;
    setup.emitConsent(declineOrRevokeConsent());
    releaseStart();
    const controller = await bootstrap;
    await Promise.resolve();
    assert.equal(starts, 1);
    assert.ok(stops >= 1);
    assert.equal(controller.runtime, null);
    await controller.stop();
});

test('navigation signal stops an accepted runtime before sensitive DOM mutation processing', async () => {
    const setup = fixture();
    let stops = 0;
    const controller = await bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => ({
            async start() { return true; },
            async stop() { stops += 1; return true; },
            async updateOptions() {},
            ingestCapturedMedia() {}
        })
    });
    assert.ok(controller.runtime);
    setup.navigate('https://www.threads.com/messages/');
    await Promise.resolve();
    assert.equal(controller.runtime, null);
    assert.equal(stops, 1);
    await controller.stop();
});

test('runtime creation finishing after sensitive navigation never starts page processing', async () => {
    const setup = fixture();
    let releaseCreation;
    let creationEntered;
    const entered = new Promise((resolve) => { creationEntered = resolve; });
    const gate = new Promise((resolve) => { releaseCreation = resolve; });
    let starts = 0;
    let stops = 0;
    const bootstrap = bootstrapChromeContent(setup.environment, {
        createPlatformAdapter: () => setup.platform,
        createRuntime: async () => {
            creationEntered();
            await gate;
            return {
                async start() { starts += 1; return true; },
                async stop() { stops += 1; return true; },
                async updateOptions() {},
                ingestCapturedMedia() {}
            };
        }
    });
    await entered;
    setup.navigate('https://www.threads.com/messages/');
    releaseCreation();
    const controller = await bootstrap;
    assert.equal(starts, 0);
    assert.equal(stops, 1);
    assert.equal(controller.runtime, null);
    await controller.stop();
});
