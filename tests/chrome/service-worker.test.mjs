import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CAPTURE_SCRIPT_ID,
    isExpectedCaptureScript
} from '../../src/chrome/capture-registration.js';
import { bootstrapServiceWorker } from '../../src/chrome/service-worker.js';
import { installMainCapture } from '../../src/chrome/main-capture-runtime.js';
import {
    acceptPageDisclosure,
    setNetworkCaptureConsent
} from '../../src/shared/consent-state.js';
import { CONSENT_STORAGE_KEY } from '../../src/chrome/storage-keys.js';

function createEvent() {
    const listeners = [];
    return {
        listeners,
        addListener(listener) {
            listeners.push(listener);
        },
        fire(...args) {
            return listeners.map((listener) => listener(...args));
        }
    };
}

function createPersistentState(consent) {
    return {
        consent,
        registered: [],
        registrationReadFailures: 0,
        mainWorld: null
    };
}

function createWorkerEnvironment(persistentState) {
    const calls = [];
    const onMessage = createEvent();
    const onInstalled = createEvent();
    const onStartup = createEvent();
    const onChanged = createEvent();
    const onClicked = createEvent();
    const extensionApi = {
        runtime: {
            id: 'extension-id',
            onMessage,
            onInstalled,
            onStartup,
            async openOptionsPage() {
                calls.push(['open-options']);
            }
        },
        storage: {
            local: {
                async get(key) {
                    assert.equal(key, CONSENT_STORAGE_KEY);
                    return { [CONSENT_STORAGE_KEY]: persistentState.consent };
                }
            },
            onChanged
        },
        scripting: {
            async getRegisteredContentScripts({ ids }) {
                assert.deepEqual(ids, [CAPTURE_SCRIPT_ID]);
                if (persistentState.registrationReadFailures > 0) {
                    persistentState.registrationReadFailures -= 1;
                    throw new Error('simulated registration read failure');
                }
                return persistentState.registered.map((script) => ({ ...script }));
            },
            async registerContentScripts(scripts) {
                calls.push(['register', scripts]);
                persistentState.registered = scripts.map((script) => ({ ...script }));
            },
            async unregisterContentScripts(filter) {
                calls.push(['unregister', filter]);
                persistentState.registered = persistentState.registered
                    .filter((script) => !filter.ids.includes(script.id));
            },
            async executeScript(details) {
                calls.push(['execute', details]);
                if (details.func && persistentState.mainWorld) {
                    return [{ result: details.func(persistentState.mainWorld) }];
                }
                return [];
            }
        },
        downloads: {
            async download(details) {
                calls.push(['download', details]);
                return 73;
            }
        },
        action: { onClicked }
    };
    return {
        calls,
        extensionApi,
        onChanged,
        onMessage,
        onInstalled,
        onStartup,
        onClicked
    };
}

function validSender(overrides = {}) {
    return {
        id: 'extension-id',
        frameId: 0,
        tab: { id: 9 },
        url: 'https://www.threads.com/@author/post/post-id',
        ...overrides
    };
}

function dispatchMessage(environment, message, sender = validSender()) {
    assert.equal(environment.onMessage.listeners.length, 1);
    return new Promise((resolve) => {
        const keepsChannelOpen = environment.onMessage.listeners[0](message, sender, resolve);
        assert.equal(keepsChannelOpen, true);
    });
}

test('a fresh worker instance restores and repairs capture registration from persistent storage', async () => {
    const persistentState = createPersistentState(
        setNetworkCaptureConsent(acceptPageDisclosure(), true)
    );
    const firstEnvironment = createWorkerEnvironment(persistentState);
    const firstWorker = bootstrapServiceWorker(firstEnvironment.extensionApi);

    assert.equal(await firstWorker.ready, 'registered');
    assert.equal(isExpectedCaptureScript(persistentState.registered[0]), true);

    // Chrome retains dynamic registrations while an MV3 worker instance is terminated.
    // Drift simulates stale state that the newly constructed worker must not trust.
    persistentState.registered[0] = {
        ...persistentState.registered[0],
        world: 'ISOLATED'
    };

    const restartedEnvironment = createWorkerEnvironment(persistentState);
    const restartedWorker = bootstrapServiceWorker(restartedEnvironment.extensionApi);

    assert.equal(await restartedWorker.ready, 'repaired');
    assert.deepEqual(
        restartedEnvironment.calls.slice(0, 2).map(([kind]) => kind),
        ['unregister', 'register']
    );
    assert.equal(isExpectedCaptureScript(persistentState.registered[0]), true);

    const downloadResult = await dispatchMessage(restartedEnvironment, {
        type: 'DOWNLOAD_MEDIA',
        url: 'https://scontent.cdninstagram.com/photo.jpg?x=1',
        filename: 'author_20260812-post_photo_1.jpg',
        expectedType: 'image'
    });
    assert.deepEqual(downloadResult, { ok: true, downloadId: 73 });
    assert.equal(
        restartedEnvironment.calls.filter(([kind]) => kind === 'download').length,
        1
    );
});

test('the restarted worker revalidates sender and current consent before sync or download', async () => {
    const persistentState = createPersistentState(acceptPageDisclosure());
    const environment = createWorkerEnvironment(persistentState);
    const worker = bootstrapServiceWorker(environment.extensionApi);
    assert.equal(await worker.ready, 'unchanged_unregistered');

    assert.deepEqual(
        await dispatchMessage(environment, { type: 'SYNC_CAPTURE_STATE' }, validSender({ id: 'forged' })),
        { ok: false, error: 'invalid_sender' }
    );
    assert.equal(environment.calls.some(([kind]) => kind === 'execute'), false);

    assert.deepEqual(
        await dispatchMessage(environment, { type: 'SYNC_CAPTURE_STATE' }),
        { ok: true }
    );
    assert.equal(
        environment.calls.filter(([kind, details]) => kind === 'execute' && typeof details.func === 'function').length,
        1
    );

    persistentState.consent = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    environment.onChanged.fire({
        [CONSENT_STORAGE_KEY]: { newValue: persistentState.consent }
    }, 'local');
    assert.deepEqual(
        await dispatchMessage(environment, { type: 'SYNC_CAPTURE_STATE' }),
        { ok: true }
    );
    assert.equal(isExpectedCaptureScript(persistentState.registered[0]), true);
    assert.equal(
        environment.calls.filter(([kind, details]) => kind === 'execute' && Array.isArray(details.files)).length,
        1
    );

    persistentState.consent = null;
    const result = await dispatchMessage(environment, {
        type: 'DOWNLOAD_MEDIA',
        url: 'https://scontent.cdninstagram.com/photo.jpg?x=1',
        filename: 'author_20260812-post_photo_1.jpg',
        expectedType: 'image'
    });
    assert.deepEqual(result, { ok: false, error: 'consent_required' });
    assert.equal(environment.calls.some(([kind]) => kind === 'download'), false);
});

test('bootstrap is idempotent within one worker and its reconcile queue recovers after failure', async () => {
    const persistentState = createPersistentState(
        setNetworkCaptureConsent(acceptPageDisclosure(), true)
    );
    persistentState.registrationReadFailures = 1;
    const environment = createWorkerEnvironment(persistentState);

    const worker = bootstrapServiceWorker(environment.extensionApi);
    const duplicateBootstrap = bootstrapServiceWorker(environment.extensionApi);
    assert.equal(duplicateBootstrap, worker);
    assert.equal(environment.onMessage.listeners.length, 1);
    assert.equal(environment.onInstalled.listeners.length, 1);
    assert.equal(environment.onStartup.listeners.length, 1);
    assert.equal(environment.onChanged.listeners.length, 1);
    assert.equal(environment.onClicked.listeners.length, 1);
    await assert.rejects(worker.ready, /simulated registration read failure/);

    assert.deepEqual(
        await dispatchMessage(environment, { type: 'SYNC_CAPTURE_STATE' }),
        { ok: true }
    );
    assert.equal(isExpectedCaptureScript(persistentState.registered[0]), true);
    assert.equal(environment.calls.filter(([kind]) => kind === 'register').length, 1);
    assert.equal(environment.calls.filter(([kind]) => kind === 'execute').length, 1);
});

test('consent revoked during enable reconciliation cannot inject stale MAIN capture', async () => {
    const persistentState = createPersistentState(
        setNetworkCaptureConsent(acceptPageDisclosure(), true)
    );
    const environment = createWorkerEnvironment(persistentState);
    const worker = bootstrapServiceWorker(environment.extensionApi);
    await worker.ready;
    let releaseRegistrationRead;
    let registrationReadEntered;
    const entered = new Promise((resolve) => { registrationReadEntered = resolve; });
    const gate = new Promise((resolve) => { releaseRegistrationRead = resolve; });
    const originalRead = environment.extensionApi.scripting.getRegisteredContentScripts;
    environment.extensionApi.scripting.getRegisteredContentScripts = async (...args) => {
        registrationReadEntered();
        await gate;
        return originalRead.apply(environment.extensionApi.scripting, args);
    };

    const sync = dispatchMessage(environment, { type: 'SYNC_CAPTURE_STATE' });
    await entered;
    persistentState.consent = acceptPageDisclosure();
    releaseRegistrationRead();
    assert.deepEqual(await sync, { ok: true });
    assert.equal(environment.calls.some(([kind, details]) => kind === 'execute' && Array.isArray(details.files)), false);
    assert.equal(environment.calls.some(([kind, details]) => kind === 'execute' && typeof details.func === 'function'), true);
    assert.deepEqual(persistentState.registered, []);
});

test('authoritative MAIN stop bypasses a page listener that suppresses the auxiliary STOP message', async () => {
    const persistentState = createPersistentState(
        setNetworkCaptureConsent(acceptPageDisclosure(), true)
    );
    const listeners = new Map();
    const mainWorld = {
        location: { href: 'https://www.threads.com/', origin: 'https://www.threads.com' },
        crypto: globalThis.crypto,
        fetch: async () => ({ clone() { return this; } }),
        XMLHttpRequest: class {
            open() {}
            send() {}
            setRequestHeader() {}
        },
        history: { pushState() {}, replaceState() {} },
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(listener);
        },
        removeEventListener(type, listener) {
            const current = listeners.get(type) || [];
            listeners.set(type, current.filter((candidate) => candidate !== listener));
        },
        dispatchMessage(data) {
            let stopped = false;
            const event = {
                data,
                origin: this.location.origin,
                source: this,
                stopImmediatePropagation() { stopped = true; }
            };
            for (const listener of [...(listeners.get('message') || [])]) {
                listener(event);
                if (stopped) break;
            }
        },
        postMessage() {}
    };
    mainWorld.addEventListener('message', (event) => {
        if (event.data?.type === 'STOP_CAPTURE') event.stopImmediatePropagation();
    });
    const capture = installMainCapture(mainWorld);
    const auxiliaryStop = (event) => {
        if (event.data?.type === 'STOP_CAPTURE') capture.stop();
    };
    assert.equal(capture.claimControlMessageListener(auxiliaryStop), true);
    mainWorld.addEventListener('message', auxiliaryStop);
    persistentState.mainWorld = mainWorld;

    mainWorld.dispatchMessage({
        marker: 'threads-plugin-capture',
        version: 1,
        type: 'STOP_CAPTURE'
    });
    assert.equal(capture.active, true);

    const environment = createWorkerEnvironment(persistentState);
    const worker = bootstrapServiceWorker(environment.extensionApi);
    assert.equal(await worker.ready, 'registered');
    persistentState.consent = acceptPageDisclosure();
    assert.deepEqual(
        await dispatchMessage(environment, { type: 'SYNC_CAPTURE_STATE' }),
        { ok: true }
    );
    assert.equal(capture.active, false);
    assert.equal(capture.revoked, true);
    assert.equal(capture.install(), false);
    assert.deepEqual(persistentState.registered, []);
    const stopExecution = environment.calls.find(([, details]) => typeof details?.func === 'function');
    assert.ok(stopExecution);
    assert.equal(stopExecution[1].world, 'MAIN');
    assert.deepEqual(stopExecution[1].target, { tabId: 9, frameIds: [0] });
});
