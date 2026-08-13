import assert from 'node:assert/strict';
import test from 'node:test';

import {
    installMainCapture,
    MAIN_CAPTURE_MAX_ACTIVE_INSPECTIONS,
    stopMainCaptureInPage
} from '../../src/chrome/main-capture-runtime.js';

const feedUrl = 'https://www.threads.com/api/graphql?operationName=BarcelonaFeedQuery';

class FakeXhr {
    constructor() { this.listeners = new Map(); this.status = 200; this.responseType = 'text'; this.responseText = '{}'; this.responseURL = feedUrl; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send() {}
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
    getResponseHeader(name) { return name === 'content-type' ? 'application/json' : ''; }
    dispatch(type) { this.listeners.get(type)?.call(this); }
}

function fixture() {
    const messages = [];
    const routeListeners = new Map();
    const environment = {
        location: { href: 'https://www.threads.com/', origin: 'https://www.threads.com' },
        crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
        fetch: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
        XMLHttpRequest: FakeXhr,
        history: {
            pushState(_state, _unused, url) { environment.location.href = new URL(url, environment.location.href).href; },
            replaceState(_state, _unused, url) { environment.location.href = new URL(url, environment.location.href).href; }
        },
        addEventListener(type, listener) {
            if (!routeListeners.has(type)) routeListeners.set(type, new Set());
            routeListeners.get(type).add(listener);
        },
        removeEventListener(type, listener) { routeListeners.get(type)?.delete(listener); },
        postMessage(message) { messages.push(message); }
    };
    return { environment, messages, routeListeners };
}

const initialRouteState = Object.freeze({
    sourceRouteKey: 'https://www.threads.com/',
    sourceRouteGeneration: '0123456789abcdef0123456789abcdef'
});

test('MAIN capture refuses encoded sensitive-route aliases', () => {
    for (const href of [
        'https://www.threads.com/%6dessages/',
        'https://www.threads.com/messages%2Fthread/1',
        'https://www.threads.com/%256dessages/'
    ]) {
        const { environment } = fixture();
        environment.location.href = href;
        assert.equal(installMainCapture(environment), null, href);
    }
});

test('MAIN capture removes stale XHR listeners when the object is reused', async () => {
    const { environment, messages } = fixture();
    const capture = installMainCapture(environment);
    capture.setRouteState(initialRouteState);
    const xhr = new environment.XMLHttpRequest();
    xhr.open('POST', feedUrl);
    xhr.send('operationName=BarcelonaFeedQuery');
    xhr.open('POST', 'https://www.threads.com/api/graphql?operationName=AccountSettingsQuery');
    xhr.send('operationName=AccountSettingsQuery');
    xhr.dispatch('load');
    await Promise.resolve();
    assert.deepEqual(messages, []);
    assert.equal(capture.stop(), true);
    assert.equal(capture.stop(), false);
});

test('MAIN capture treats repeated operation headers as conflicts', async () => {
    const { environment, messages } = fixture();
    installMainCapture(environment).setRouteState(initialRouteState);
    const xhr = new environment.XMLHttpRequest();
    xhr.open('POST', feedUrl);
    xhr.setRequestHeader('x-fb-friendly-name', 'AccountSettingsQuery');
    xhr.setRequestHeader('x-fb-friendly-name', 'BarcelonaFeedQuery');
    xhr.send();
    xhr.dispatch('load');
    await Promise.resolve();
    assert.deepEqual(messages, []);
});

test('MAIN capture stop restores wrappers and suppresses deferred extraction', async () => {
    const { environment, messages } = fixture();
    let release;
    const nativeFetch = environment.fetch = () => new Promise((resolve) => { release = resolve; });
    const capture = installMainCapture(environment);
    capture.setRouteState(initialRouteState);
    const pending = environment.fetch(feedUrl);
    capture.stop();
    release(new Response(JSON.stringify({ code: 'POST_1', video_versions: [{ url: 'https://cdninstagram.com/video.mp4' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    }));
    await pending;
    await Promise.resolve();
    assert.equal(environment.fetch, nativeFetch);
    assert.deepEqual(messages, []);
});

test('MAIN capture rejects an in-flight response after an A to B to A route generation change', async () => {
    const { environment, messages, routeListeners } = fixture();
    let release;
    environment.fetch = () => new Promise((resolve) => { release = resolve; });
    const nativePushState = environment.history.pushState;
    const capture = installMainCapture(environment);
    assert.equal(capture.setRouteState(initialRouteState), true);

    const pending = environment.fetch(feedUrl);
    environment.history.pushState({}, '', '/search?q=b');
    environment.history.pushState({}, '', '/');
    release(new Response(JSON.stringify({
        code: 'POST_1',
        video_versions: [{ url: 'https://video.cdninstagram.com/video.mp4' }]
    }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    }));
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(messages, []);

    capture.stop();
    assert.equal(environment.history.pushState, nativePushState);
    assert.equal(routeListeners.get('popstate')?.size || 0, 0);
    assert.equal(routeListeners.get('hashchange')?.size || 0, 0);
});

test('MAIN capture remains installable and stoppable with hostile history and listener hooks', () => {
    const { environment } = fixture();
    const nativePushState = environment.history.pushState;
    Object.defineProperty(environment.history, 'pushState', {
        configurable: true,
        get() { return nativePushState; },
        set() { throw new Error('page blocked history patch'); }
    });
    environment.navigation = { addEventListener() { throw new Error('page blocked listener'); } };
    environment.removeEventListener = () => { throw new Error('page blocked cleanup'); };

    const capture = installMainCapture(environment, {
        onRouteInvalidated() { throw new Error('page blocked ready message'); }
    });
    assert.equal(capture.active, true);
    assert.equal(capture.setRouteState(initialRouteState), true);
    environment.history.replaceState({}, '', '/search?q=hostile');
    assert.equal(capture.stop(), true);
    assert.equal(capture.stop(), false);
});

test('MAIN capture transaction rolls back earlier hooks when the final XHR hook is rejected', () => {
    const { environment, routeListeners } = fixture();
    class HostileXhr extends FakeXhr {}
    const nativeFetch = environment.fetch;
    const nativeOpen = HostileXhr.prototype.open;
    const nativeSetRequestHeader = HostileXhr.prototype.setRequestHeader;
    const nativeSend = HostileXhr.prototype.send;
    const nativePushState = environment.history.pushState;
    const nativeReplaceState = environment.history.replaceState;
    Object.defineProperties(HostileXhr.prototype, {
        open: {
            configurable: true,
            writable: true,
            value: nativeOpen
        },
        setRequestHeader: {
            configurable: true,
            writable: true,
            value: nativeSetRequestHeader
        },
        send: {
            configurable: false,
            writable: false,
            value: nativeSend
        }
    });
    environment.XMLHttpRequest = HostileXhr;

    assert.doesNotThrow(() => assert.equal(installMainCapture(environment), null));
    const controller = environment.__threadsPluginMainCaptureV1__;
    assert.equal(controller.active, false);
    assert.equal(environment.fetch, nativeFetch);
    assert.equal(HostileXhr.prototype.open, nativeOpen);
    assert.equal(HostileXhr.prototype.setRequestHeader, nativeSetRequestHeader);
    assert.equal(HostileXhr.prototype.send, nativeSend);
    assert.equal(environment.history.pushState, nativePushState);
    assert.equal(environment.history.replaceState, nativeReplaceState);
    assert.equal(routeListeners.get('popstate')?.size || 0, 0);
    assert.equal(routeListeners.get('hashchange')?.size || 0, 0);
    assert.equal(stopMainCaptureInPage(environment), false);
    assert.equal(controller.revoked, true);
    assert.equal(controller.install(), false);
});

test('MAIN capture transaction restores route hooks when a hostile fetch setter rejects installation', () => {
    const { environment, routeListeners } = fixture();
    const nativeFetch = environment.fetch;
    const nativePushState = environment.history.pushState;
    const nativeReplaceState = environment.history.replaceState;
    Object.defineProperty(environment, 'fetch', {
        configurable: true,
        get: () => nativeFetch,
        set() { throw new Error('page blocked fetch patch'); }
    });

    assert.doesNotThrow(() => assert.equal(installMainCapture(environment), null));
    const controller = environment.__threadsPluginMainCaptureV1__;
    assert.equal(controller.active, false);
    assert.equal(environment.fetch, nativeFetch);
    assert.equal(environment.history.pushState, nativePushState);
    assert.equal(environment.history.replaceState, nativeReplaceState);
    assert.equal(routeListeners.get('popstate')?.size || 0, 0);
    assert.equal(routeListeners.get('hashchange')?.size || 0, 0);
    assert.equal(stopMainCaptureInPage(environment), false);
    assert.equal(controller.revoked, true);
    assert.equal(controller.install(), false);
});

test('MAIN capture installation cannot reenter through a hostile fetch getter', () => {
    const { environment, routeListeners } = fixture();
    const nativeFetch = environment.fetch;
    const nativePushState = environment.history.pushState;
    const nativeReplaceState = environment.history.replaceState;
    let currentFetch = nativeFetch;
    let getterCalls = 0;
    let reentrantResult;
    Object.defineProperty(environment, 'fetch', {
        configurable: true,
        get() {
            getterCalls += 1;
            if (getterCalls === 1) reentrantResult = installMainCapture(environment);
            return currentFetch;
        },
        set(value) { currentFetch = value; }
    });

    const controller = installMainCapture(environment);
    assert.equal(reentrantResult, null);
    assert.equal(controller.active, true);
    assert.notEqual(currentFetch, nativeFetch);
    assert.equal(stopMainCaptureInPage(environment), true);
    assert.equal(controller.active, false);
    assert.equal(controller.revoked, true);
    assert.equal(currentFetch, nativeFetch);
    assert.equal(environment.history.pushState, nativePushState);
    assert.equal(environment.history.replaceState, nativeReplaceState);
    assert.equal(routeListeners.get('popstate')?.size || 0, 0);
    assert.equal(routeListeners.get('hashchange')?.size || 0, 0);
    assert.equal(controller.install(), false);
});

test('MAIN capture installation rolls back when a hostile fetch getter revokes during setup', () => {
    const { environment, messages, routeListeners } = fixture();
    const nativeFetch = environment.fetch;
    const nativePushState = environment.history.pushState;
    const nativeReplaceState = environment.history.replaceState;
    let currentFetch = nativeFetch;
    let getterCalls = 0;
    let revokeResult;
    Object.defineProperty(environment, 'fetch', {
        configurable: true,
        get() {
            getterCalls += 1;
            if (getterCalls === 1) revokeResult = stopMainCaptureInPage(environment);
            return currentFetch;
        },
        set(value) { currentFetch = value; }
    });

    assert.equal(installMainCapture(environment), null);
    const controller = environment.__threadsPluginMainCaptureV1__;
    assert.equal(revokeResult, false);
    assert.equal(controller.active, false);
    assert.equal(controller.revoked, true);
    assert.equal(currentFetch, nativeFetch);
    assert.equal(environment.history.pushState, nativePushState);
    assert.equal(environment.history.replaceState, nativeReplaceState);
    assert.equal(routeListeners.get('popstate')?.size || 0, 0);
    assert.equal(routeListeners.get('hashchange')?.size || 0, 0);
    assert.deepEqual(messages, []);
    assert.equal(controller.install(), false);
});
test('MAIN capture bounds concurrent response inspections', async () => {
    const { environment } = fixture();
    let cloneCalls = 0;
    environment.fetch = async () => ({
        status: 200,
        url: feedUrl,
        headers: { get(name) { return name === 'content-type' ? 'application/json' : null; } },
        clone() {
            cloneCalls += 1;
            return {
                body: {
                    getReader() {
                        return {
                            read() { return new Promise(() => {}); },
                            cancel() { return Promise.resolve(); }
                        };
                    }
                }
            };
        }
    });
    const capture = installMainCapture(environment);
    capture.setRouteState(initialRouteState);
    await Promise.all(Array.from(
        { length: MAIN_CAPTURE_MAX_ACTIVE_INSPECTIONS + 1 },
        () => environment.fetch(feedUrl)
    ));
    assert.equal(cloneCalls, MAIN_CAPTURE_MAX_ACTIVE_INSPECTIONS);
    capture.stop();
    await new Promise((resolve) => setImmediate(resolve));
});

test('MAIN capture controller ownership survives page key tampering and reuses one frozen controller', () => {
    const { environment } = fixture();
    const controller = installMainCapture(environment);
    const descriptor = Object.getOwnPropertyDescriptor(environment, '__threadsPluginMainCaptureV1__');
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.value, controller);
    assert.equal(Object.isFrozen(controller), true);
    assert.equal(Reflect.set(environment, '__threadsPluginMainCaptureV1__', { active: false }), false);
    assert.throws(() => Object.defineProperty(environment, '__threadsPluginMainCaptureV1__', {
        value: { active: false }
    }), TypeError);
    assert.equal(environment.__threadsPluginMainCaptureV1__, controller);

    assert.equal(stopMainCaptureInPage(environment), true);
    assert.equal(controller.active, false);
    assert.equal(controller.revoked, true);
    assert.equal(installMainCapture(environment), null);
    assert.equal(controller.install(), false);
});
