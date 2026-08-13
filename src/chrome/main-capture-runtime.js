import { createCaptureBridgePayload } from '../shared/capture-bridge.js';
import {
    classifyNetworkCaptureRequest,
    inspectResponse,
    inspectXhrResponse,
    isSensitiveThreadsRoute
} from '../shared/network-policy.js';
import { collectStructuredMediaUrls } from '../shared/post-model.js';
import { buildMediaRouteKey } from '../shared/route-media-state.js';

export const MAIN_CAPTURE_INSTALL_KEY = '__threadsPluginMainCaptureV1__';
export const MAIN_CAPTURE_MAX_ACTIVE_INSPECTIONS = 16;

function randomMessageId(environment) {
    const bytes = new Uint8Array(16);
    environment.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function postRecords(environment, text, context, shouldContinue) {
    if (!text || !context?.allowed || !shouldContinue()) return;
    let parsed;
    try { parsed = JSON.parse(String(text).replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;/, '')); } catch { return; }
    if (!shouldContinue()) return;
    const payload = createCaptureBridgePayload({
        records: collectStructuredMediaUrls(parsed),
        sourceRouteKey: context.sourceRouteKey,
        sourceRouteGeneration: context.sourceRouteGeneration,
        operationId: context.operation,
        messageId: randomMessageId(environment)
    });
    if (payload && shouldContinue()) environment.postMessage(payload, environment.location.origin);
}

function isRouteGeneration(value) {
    return typeof value === 'string' && /^[a-f0-9]{16,64}$/.test(value);
}

function installRouteInvalidationWatcher(environment, invalidate) {
    const cleanups = [];
    let history;
    try { history = environment.history; } catch { history = null; }
    for (const methodName of ['pushState', 'replaceState']) {
        let nativeMethod;
        try { nativeMethod = history?.[methodName]; } catch { continue; }
        if (typeof nativeMethod !== 'function') continue;
        const wrappedMethod = function () {
            const result = nativeMethod.apply(this, arguments);
            invalidate(true);
            return result;
        };
        try {
            history[methodName] = wrappedMethod;
            if (history[methodName] !== wrappedMethod) continue;
        } catch {
            continue;
        }
        cleanups.push(() => {
            try {
                if (history[methodName] === wrappedMethod) history[methodName] = nativeMethod;
            } catch {}
        });
    }

    const addListener = (target, type, listener) => {
        let addEventListener;
        try { addEventListener = target?.addEventListener; } catch { return; }
        if (typeof addEventListener !== 'function') return;
        try {
            addEventListener.call(target, type, listener);
            cleanups.push(() => {
                try { target.removeEventListener?.(type, listener); } catch {}
            });
        } catch {}
    };
    const onCommittedRoute = () => invalidate(true);
    const onPendingNavigation = () => invalidate(true);
    addListener(environment, 'popstate', onCommittedRoute);
    addListener(environment, 'hashchange', onCommittedRoute);
    let navigation;
    try { navigation = environment.navigation; } catch { navigation = null; }
    addListener(navigation, 'navigate', onPendingNavigation);
    addListener(navigation, 'currententrychange', onCommittedRoute);

    return () => {
        while (cleanups.length) {
            try { cleanups.pop()(); } catch {}
        }
    };
}

function createMainCaptureInstallation(environment, options = {}) {
    if (!environment || isSensitiveThreadsRoute(environment.location.href)) return null;
    let nativeFetch, xhrPrototype, nativeOpen, nativeSend, nativeSetRequestHeader;
    try {
        nativeFetch = environment.fetch;
        xhrPrototype = environment.XMLHttpRequest?.prototype;
        nativeOpen = xhrPrototype?.open;
        nativeSend = xhrPrototype?.send;
        nativeSetRequestHeader = xhrPrototype?.setRequestHeader;
    } catch { return null; }
    let stopped = false;
    let routeState = null;
    const activeInspections = new Set();
    const requestState = new WeakMap();

    const shouldContinue = (context) => !stopped &&
        routeState?.sourceRouteGeneration === context.sourceRouteGeneration &&
        !isSensitiveThreadsRoute(environment.location.href) &&
        buildMediaRouteKey(environment.location.href) === context.sourceRouteKey;
    const abortInspections = () => {
        activeInspections.forEach((controller) => controller.abort());
        activeInspections.clear();
    };
    const invalidateRouteState = (requestNextState = true) => {
        routeState = null;
        abortInspections();
        if (requestNextState) {
            try { options.onRouteInvalidated?.(); } catch {}
        }
    };
    let restoreRouteWatcher = () => {};
    const setRouteState = (nextState) => {
        if (stopped || isSensitiveThreadsRoute(environment.location.href) ||
            nextState?.sourceRouteKey !== buildMediaRouteKey(environment.location.href) ||
            !isRouteGeneration(nextState?.sourceRouteGeneration)) {
            return false;
        }
        routeState = Object.freeze({
            sourceRouteKey: nextState.sourceRouteKey,
            sourceRouteGeneration: nextState.sourceRouteGeneration
        });
        return true;
    };
    const classify = (details) => {
        if (!routeState) return { allowed: false, reason: 'route_state_required' };
        try {
            const classified = classifyNetworkCaptureRequest({ ...details, routeUrl: environment.location.href });
            return classified.allowed
                ? { ...classified, sourceRouteGeneration: routeState.sourceRouteGeneration }
                : classified;
        }
        catch { return { allowed: false, reason: 'classification_failed' }; }
    };
    const inspectWithCancellation = (context, inspect) => {
        if (activeInspections.size >= MAIN_CAPTURE_MAX_ACTIVE_INSPECTIONS) {
            return Promise.resolve(false);
        }
        const controller = new AbortController();
        activeInspections.add(controller);
        return inspect({
            signal: controller.signal,
            shouldContinue: () => shouldContinue(context),
            extractor: (text) => postRecords(environment, text, context, () => shouldContinue(context))
        }).finally(() => activeInspections.delete(controller));
    };

    function wrappedFetch(input, init = {}) {
        const inputIsUrl = typeof input === 'string' || input instanceof URL;
        const context = stopped || (!inputIsUrl && init.body === undefined && input?.body != null)
            ? { allowed: false, reason: 'capture_disabled' }
            : classify({
                url: inputIsUrl ? input : input?.url,
                method: init.method || input?.method || 'GET',
                headers: init.headers || input?.headers,
                body: init.body
            });
        return nativeFetch.apply(this, arguments).then((response) => {
            if (context.allowed && shouldContinue(context)) {
                void inspectWithCancellation(context, (options) => inspectResponse(response, context, options));
            }
            return response;
        });
    }

    const wrappedOpen = function (method, url) {
        const previous = requestState.get(this);
        if (previous?.loadHandler) this.removeEventListener?.('load', previous.loadHandler);
        requestState.set(this, { method, url, headers: {} });
        return nativeOpen.apply(this, arguments);
    };
    const wrappedSetRequestHeader = function (name, value) {
        const request = requestState.get(this);
        if (request) {
            const key = String(name).toLowerCase();
            request.headers[key] = request.headers[key] ? `${request.headers[key]},${value}` : value;
        }
        return nativeSetRequestHeader.apply(this, arguments);
    };
    const wrappedSend = function (body) {
        const request = requestState.get(this) || {};
        const context = stopped ? { allowed: false, reason: 'capture_disabled' } : classify({ ...request, body });
        if (context.allowed) {
            const xhr = this;
            const onLoad = function () {
                const latest = requestState.get(xhr);
                if (latest?.loadHandler !== onLoad) return;
                latest.loadHandler = null;
                if (shouldContinue(context)) {
                    void inspectWithCancellation(context, (options) => inspectXhrResponse(xhr, context, options));
                }
            };
            request.loadHandler = onLoad;
            this.addEventListener('load', onLoad, { once: true });
        }
        return nativeSend.apply(this, arguments);
    };
    const restoreOwnedProperty = (target, key, installed, original) => {
        try {
            if (target?.[key] === installed) target[key] = original;
        } catch {}
    };
    const restoreInstalledHooks = () => {
        restoreOwnedProperty(xhrPrototype, 'send', wrappedSend, nativeSend);
        if (typeof nativeSetRequestHeader === 'function') {
            restoreOwnedProperty(xhrPrototype, 'setRequestHeader', wrappedSetRequestHeader, nativeSetRequestHeader);
        }
        restoreOwnedProperty(xhrPrototype, 'open', wrappedOpen, nativeOpen);
        restoreOwnedProperty(environment, 'fetch', wrappedFetch, nativeFetch);
        try { restoreRouteWatcher(); } catch {}
    };

    try {
        restoreRouteWatcher = installRouteInvalidationWatcher(environment, invalidateRouteState);
        if (typeof nativeFetch === 'function') {
            environment.fetch = wrappedFetch;
            if (environment.fetch !== wrappedFetch) throw new Error('fetch_hook_rejected');
        }
        if (xhrPrototype && typeof nativeOpen === 'function' && typeof nativeSend === 'function') {
            xhrPrototype.open = wrappedOpen;
            if (xhrPrototype.open !== wrappedOpen) throw new Error('xhr_open_hook_rejected');
            if (typeof nativeSetRequestHeader === 'function') {
                xhrPrototype.setRequestHeader = wrappedSetRequestHeader;
                if (xhrPrototype.setRequestHeader !== wrappedSetRequestHeader) {
                    throw new Error('xhr_header_hook_rejected');
                }
            }
            xhrPrototype.send = wrappedSend;
            if (xhrPrototype.send !== wrappedSend) throw new Error('xhr_send_hook_rejected');
        }
    } catch {
        stopped = true;
        routeState = null;
        abortInspections();
        restoreInstalledHooks();
        return null;
    }

    const stop = () => {
        if (stopped) return false;
        stopped = true;
        routeState = null;
        abortInspections();
        restoreInstalledHooks();
        return true;
    };
    return Object.freeze({ stop, setRouteState });
}

function isOwnedCaptureController(value) {
    return Boolean(value) && Object.isFrozen(value) &&
        typeof value.install === 'function' &&
        typeof value.stop === 'function' &&
        typeof value.revoke === 'function' &&
        typeof value.setRouteState === 'function' &&
        typeof value.claimControlMessageListener === 'function' &&
        typeof value.releaseControlMessageListener === 'function';
}

export function installMainCapture(environment = globalThis.window, options = {}) {
    if (!environment || isSensitiveThreadsRoute(environment.location.href)) return null;

    let existing;
    try { existing = environment[MAIN_CAPTURE_INSTALL_KEY]; } catch { return null; }
    if (existing !== undefined) {
        if (!isOwnedCaptureController(existing)) return null;
        if (existing.active) return existing;
        return existing.install(options) ? existing : null;
    }

    let installation = null;
    let controlMessageListener = null;
    let revoked = false;
    let installing = false;
    const controller = {};
    Object.defineProperties(controller, {
        active: {
            enumerable: true,
            get: () => Boolean(installation)
        },
        revoked: {
            enumerable: true,
            get: () => revoked
        },
        install: {
            value(nextOptions = {}) {
                if (revoked || installing) return false;
                if (installation) return true;
                let nextInstallation;
                installing = true;
                try {
                    nextInstallation = createMainCaptureInstallation(environment, nextOptions);
                } catch {
                    return false;
                } finally {
                    installing = false;
                }
                if (!nextInstallation) return false;
                if (revoked) {
                    try { nextInstallation.stop(); } catch {}
                    return false;
                }
                installation = nextInstallation;
                return true;
            }
        },
        stop: {
            value() {
                if (!installation) return false;
                const current = installation;
                installation = null;
                let stopped = false;
                try {
                    stopped = current.stop();
                } finally {
                    if (controlMessageListener) {
                        try { environment.removeEventListener?.('message', controlMessageListener); } catch {}
                        controlMessageListener = null;
                    }
                }
                return stopped;
            }
        },
        revoke: {
            value() {
                revoked = true;
                if (!installation) return false;
                return controller.stop();
            }
        },
        setRouteState: {
            value(nextState) {
                return installation?.setRouteState(nextState) || false;
            }
        },
        claimControlMessageListener: {
            value(listener) {
                if (!installation || controlMessageListener || typeof listener !== 'function') return false;
                controlMessageListener = listener;
                return true;
            }
        },
        releaseControlMessageListener: {
            value(listener) {
                if (controlMessageListener !== listener) return false;
                controlMessageListener = null;
                return true;
            }
        }
    });
    Object.freeze(controller);
    try {
        Object.defineProperty(environment, MAIN_CAPTURE_INSTALL_KEY, {
            configurable: false,
            enumerable: false,
            writable: false,
            value: controller
        });
    } catch {
        return null;
    }
    if (environment[MAIN_CAPTURE_INSTALL_KEY] !== controller || !controller.install(options)) return null;
    return controller;
}

export function stopMainCaptureInPage(environment = globalThis) {
    try {
        const controller = environment?.['__threadsPluginMainCaptureV1__'];
        if (typeof controller?.revoke === 'function') return controller.revoke();
        return typeof controller?.stop === 'function' ? controller.stop() : false;
    } catch {
        return false;
    }
}
