import { normalizeOptions } from '../shared/options.js';
import { canCaptureNetwork } from '../shared/consent-state.js';
import { createCaptureBridgeState, validateCaptureBridgeEvent } from '../shared/capture-bridge.js';
import { createThreadsRuntime } from '../shared/threads-runtime.js';
import { decideExtensionBootstrap } from './bootstrap-policy.js';
import { showDisclosure } from './disclosure.js';
import { createLatestLifecycleQueue } from './latest-lifecycle-queue.js';
import { createChromePlatformAdapter } from './platform-adapter.js';
import { buildMediaRouteKey } from '../shared/route-media-state.js';

const IS_NODE_RUNTIME = typeof process !== 'undefined' && process.release?.name === 'node';
const CAPTURE_MARKER = 'threads-plugin-capture';
const CAPTURE_VERSION = 1;
let fallbackRouteGeneration = 0;

export function isExtensionContextInvalidatedError(error) {
    const message = typeof error === 'string' ? error : error?.message;
    return typeof message === 'string' && /^Extension context invalidated\.?$/i.test(message.trim());
}

export function reportContentError(label, error, logger = console) {
    if (isExtensionContextInvalidatedError(error)) return false;
    logger.error('[Threads Plugin]', label, error);
    return true;
}

function createRouteGeneration(environment) {
    try {
        const bytes = new Uint8Array(16);
        environment.crypto?.getRandomValues(bytes);
        if (bytes.some((value) => value !== 0)) {
            return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
        }
    } catch {}
    fallbackRouteGeneration = (fallbackRouteGeneration + 1) % Number.MAX_SAFE_INTEGER;
    return fallbackRouteGeneration.toString(16).padStart(32, '0');
}

function isCaptureReadyEvent(event, environmentWindow) {
    const data = event?.data;
    return event?.source === environmentWindow &&
        event?.origin === environmentWindow.location.origin &&
        data?.marker === CAPTURE_MARKER &&
        data?.version === CAPTURE_VERSION &&
        data?.type === 'CAPTURE_READY' &&
        Object.keys(data).length === 3;
}

export async function bootstrapChromeContent(environment = globalThis, dependencies = {}) {
    const createPlatform = dependencies.createPlatformAdapter || createChromePlatformAdapter;
    const createRuntime = dependencies.createRuntime || createThreadsRuntime;
    const renderDisclosure = dependencies.showDisclosure || showDisclosure;
    const decideBootstrap = dependencies.decideBootstrap || decideExtensionBootstrap;
    const platform = createPlatform(environment);
    let runtime = null;
    let unsubscribeOptions = () => {};
    let disposeDisclosure = () => {};
    let disclosureVisible = false;
    let bridgeEnabled = false;
    let disposed = false;
    let currentPageUrl = environment.window.location.href;
    let currentRouteGeneration = '';
    let captureBridgeState = null;

    const postRouteState = (rotate = false) => {
        if (!bridgeEnabled || !runtime) return false;
        if (rotate || !currentRouteGeneration) {
            currentRouteGeneration = createRouteGeneration(environment.window);
        }
        runtime.setCaptureRouteGeneration?.(currentRouteGeneration);
        environment.window.postMessage({
            marker: CAPTURE_MARKER,
            version: CAPTURE_VERSION,
            type: 'ROUTE_STATE',
            sourceRouteKey: buildMediaRouteKey(environment.window.location.href),
            sourceRouteGeneration: currentRouteGeneration
        }, environment.window.location.origin);
        return true;
    };

    const onCaptureMessage = (event) => {
        if (!bridgeEnabled || !runtime) return;
        if (isCaptureReadyEvent(event, environment.window)) {
            postRouteState(true);
            return;
        }
        const validated = validateCaptureBridgeEvent(
            event,
            environment.window.location.href,
            captureBridgeState,
            environment.window,
            currentRouteGeneration
        );
        if (validated.ok) {
            runtime.ingestCapturedMedia(
                validated.records,
                validated.sourceRouteKey,
                validated.sourceRouteGeneration
            );
        }
    };

    const syncCapture = async (nextConsent) => {
        const enabled = Boolean(runtime) && canCaptureNetwork(nextConsent);
        if (enabled && !bridgeEnabled) {
            bridgeEnabled = true;
            captureBridgeState = createCaptureBridgeState();
            currentRouteGeneration = createRouteGeneration(environment.window);
            environment.window.addEventListener('message', onCaptureMessage);
        } else if (!enabled && bridgeEnabled) {
            bridgeEnabled = false;
            captureBridgeState = null;
            currentRouteGeneration = '';
            runtime?.setCaptureRouteGeneration?.('');
            environment.window.removeEventListener('message', onCaptureMessage);
        }
        if (!enabled) {
            environment.window.postMessage({
                marker: CAPTURE_MARKER,
                version: CAPTURE_VERSION,
                type: 'STOP_CAPTURE'
            }, environment.window.location.origin);
        }
        const response = await environment.chrome.runtime.sendMessage({ type: 'SYNC_CAPTURE_STATE' });
        if (response?.ok !== true) {
            forceCaptureDormant();
            throw new Error('capture_sync_failed:' + (response?.error || 'invalid_response'));
        }
        if (enabled && bridgeEnabled) postRouteState(false);
    };

    const forceCaptureDormant = () => {
        if (bridgeEnabled) {
            bridgeEnabled = false;
            captureBridgeState = null;
            currentRouteGeneration = '';
            runtime?.setCaptureRouteGeneration?.('');
            environment.window.removeEventListener('message', onCaptureMessage);
        }
        environment.window.postMessage({
            marker: CAPTURE_MARKER,
            version: CAPTURE_VERSION,
            type: 'STOP_CAPTURE'
        }, environment.window.location.origin);
    };

    const startRuntime = async () => {
        if (runtime) return runtime;
        const requestedUrl = environment.window.location.href;
        const instance = await createRuntime({
            platform,
            captureSource: null,
            document: environment.document,
            window: environment.window,
            initialOptions: normalizeOptions(await platform.loadOptions()),
            clock: environment
        });
        if (lifecycle.latestValue !== undefined &&
            !decideBootstrap(lifecycle.latestValue, environment.window.location.href).startRuntime) {
            await instance.stop();
            return runtime;
        }
        if (disposed || environment.window.location.href !== requestedUrl ||
            !decideBootstrap(lifecycle.latestValue, environment.window.location.href).startRuntime) {
            await instance.stop();
            return runtime;
        }
        runtime = instance;
        const started = await instance.start();
        if (!started || runtime !== instance || disposed ||
            !decideBootstrap(lifecycle.latestValue, environment.window.location.href).startRuntime) {
            if (runtime === instance) runtime = null;
            await instance.stop();
            return runtime;
        }
        unsubscribeOptions = platform.subscribeOptions((options) => void instance.updateOptions(options));
        return instance;
    };

    const stopRuntime = async () => {
        unsubscribeOptions();
        unsubscribeOptions = () => {};
        if (!runtime) return false;
        const previous = runtime;
        runtime = null;
        return previous.stop();
    };

    const emergencyStopRuntime = () => {
        unsubscribeOptions();
        unsubscribeOptions = () => {};
        if (!runtime) return Promise.resolve(false);
        const previous = runtime;
        runtime = null;
        return Promise.resolve(previous.stop());
    };

    const applyConsent = async (nextConsent) => {
        if (disposed) return;
        const decision = decideBootstrap(nextConsent, environment.window.location.href);
        if (decision.showDisclosure) {
            if (!disclosureVisible) {
                disclosureVisible = true;
                const removeDisclosure = renderDisclosure({
                    document: environment.document,
                    onAccept: async (acceptedConsent) => {
                        await platform.saveConsent(acceptedConsent);
                        await lifecycle.update(acceptedConsent);
                    },
                    onDecline: async (declinedConsent) => {
                        await platform.saveConsent(declinedConsent);
                        await lifecycle.update(declinedConsent);
                    }
                });
                disposeDisclosure = () => {
                    removeDisclosure();
                    disclosureVisible = false;
                };
            }
            await stopRuntime();
        } else if (decision.startRuntime) {
            disposeDisclosure();
            disposeDisclosure = () => {};
            await startRuntime();
        } else {
            disposeDisclosure();
            disposeDisclosure = () => {};
            await stopRuntime();
        }
        if (disposed || lifecycle.latestValue !== nextConsent) return;
        const currentDecision = decideBootstrap(nextConsent, environment.window.location.href);
        if (currentDecision.startRuntime !== decision.startRuntime ||
            currentDecision.showDisclosure !== decision.showDisclosure) return;
        await syncCapture(nextConsent);
    };

    const lifecycle = createLatestLifecycleQueue(applyConsent);

    const requestReconcile = (nextConsent) => {
        const decision = decideBootstrap(nextConsent, environment.window.location.href);
        if (!canCaptureNetwork(nextConsent) || !decision.startRuntime) forceCaptureDormant();
        if (!decision.startRuntime) {
            if (runtime) void emergencyStopRuntime().catch((error) => {
                reportContentError('immediate stop failed', error);
            });
        }
        return lifecycle.update(nextConsent);
    };

    let receivedConsentChange = false;
    const unsubscribeConsent = platform.subscribeConsent((nextConsent) => {
        receivedConsentChange = true;
        void requestReconcile(nextConsent).catch((error) => {
            reportContentError('consent sync failed', error);
        });
    });

    const reconcileRoute = () => {
        const nextPageUrl = environment.window.location.href;
        if (nextPageUrl === currentPageUrl) return;
        currentPageUrl = nextPageUrl;
        if (bridgeEnabled) postRouteState(true);
        const currentConsent = lifecycle.latestValue;
        const decision = decideBootstrap(currentConsent, nextPageUrl);
        if (!decision.startRuntime) {
            forceCaptureDormant();
            if (runtime) void emergencyStopRuntime().catch((error) => {
                reportContentError('route stop failed', error);
            });
        }
        void lifecycle.refresh().catch((error) => {
            reportContentError('route sync failed', error);
        });
    };
    const routeTimer = environment.window.setInterval(reconcileRoute, 50);
    environment.window.addEventListener('popstate', reconcileRoute);
    environment.window.addEventListener('hashchange', reconcileRoute);
    const onNavigate = (event) => {
        const destinationUrl = event?.destination?.url;
        if (!destinationUrl) return;
        const decision = decideBootstrap(lifecycle.latestValue, destinationUrl);
        if (!decision.startRuntime) {
            forceCaptureDormant();
            if (runtime) void emergencyStopRuntime().catch((error) => {
                reportContentError('navigation stop failed', error);
            });
        } else if (bridgeEnabled) {
            // Invalidate in-flight captures before a safe SPA navigation commits.
            postRouteState(true);
        }
    };
    environment.window.navigation?.addEventListener?.('navigate', onNavigate);
    environment.window.navigation?.addEventListener?.('currententrychange', reconcileRoute);
    const routeObserver = typeof environment.window.MutationObserver === 'function'
        ? new environment.window.MutationObserver(reconcileRoute)
        : null;
    routeObserver?.observe(environment.document.documentElement || environment.document, {
        childList: true,
        subtree: true
    });

    const consent = await platform.loadConsent();
    if (receivedConsentChange) await lifecycle.refresh();
    else await requestReconcile(consent);

    return Object.freeze({
        get runtime() { return runtime; },
        async stop() {
            disposed = true;
            environment.window.clearInterval(routeTimer);
            environment.window.removeEventListener('popstate', reconcileRoute);
            environment.window.removeEventListener('hashchange', reconcileRoute);
            environment.window.navigation?.removeEventListener?.('navigate', onNavigate);
            environment.window.navigation?.removeEventListener?.('currententrychange', reconcileRoute);
            routeObserver?.disconnect();
            disposeDisclosure();
            unsubscribeConsent();
            forceCaptureDormant();
            return lifecycle.close(async () => {
                try {
                    await environment.chrome.runtime.sendMessage({ type: 'SYNC_CAPTURE_STATE' });
                } finally {
                    await stopRuntime();
                }
            });
        }
    });
}

if (!IS_NODE_RUNTIME) {
    bootstrapChromeContent().catch((error) => {
        reportContentError('content bootstrap failed', error);
    });
}
