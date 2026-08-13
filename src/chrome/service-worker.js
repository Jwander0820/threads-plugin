import { createDownloadMessageHandler } from './download-handler.js';
import { validateExtensionSender } from './download-handler.js';
import { reconcileCaptureRegistration } from './capture-registration.js';
import { canCaptureNetwork } from '../shared/consent-state.js';
import { isSensitiveThreadsRoute } from '../shared/network-policy.js';
import { CONSENT_STORAGE_KEY } from './storage-keys.js';
import { stopMainCaptureInPage } from './main-capture-runtime.js';

const INSTALLED_WORKERS = new WeakMap();

async function stopCaptureInSenderTab(extensionApi, sender) {
    return extensionApi.scripting.executeScript({
        target: { tabId: sender.tab.id, frameIds: [0] },
        world: 'MAIN',
        func: stopMainCaptureInPage,
        injectImmediately: true
    });
}

export function bootstrapServiceWorker(extensionApi = globalThis.chrome) {
    const installed = INSTALLED_WORKERS.get(extensionApi);
    if (installed) return installed;

    const handleDownloadMessage = createDownloadMessageHandler({
        runtimeId: extensionApi.runtime.id,
        storage: extensionApi.storage.local,
        downloads: extensionApi.downloads
    });

    let reconciliationQueue = Promise.resolve();
    const reconcile = () => {
        reconciliationQueue = reconciliationQueue
            .catch(() => {})
            .then(() => reconcileCaptureRegistration({
                scripting: extensionApi.scripting,
                storage: extensionApi.storage.local
            }));
        return reconciliationQueue;
    };
    const requestReconcile = () => {
        void reconcile().catch(() => {});
    };

    extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const handle = async () => {
            if (message?.type !== 'SYNC_CAPTURE_STATE') return handleDownloadMessage(message, sender);
            if (Object.keys(message).length !== 1 ||
                !validateExtensionSender(sender, extensionApi.runtime.id)) {
                return { ok: false, error: 'invalid_sender' };
            }
            const stored = await extensionApi.storage.local.get(CONSENT_STORAGE_KEY);
            const shouldEnableCapture = canCaptureNetwork(stored[CONSENT_STORAGE_KEY]) &&
                !isSensitiveThreadsRoute(sender.url);
            if (!shouldEnableCapture) {
                let stopError = null;
                try {
                    await stopCaptureInSenderTab(extensionApi, sender);
                } catch (error) {
                    stopError = error;
                }
                await reconcile();
                if (stopError) throw stopError;
            } else {
                await reconcile();
                const latestStored = await extensionApi.storage.local.get(CONSENT_STORAGE_KEY);
                const stillEnabled = canCaptureNetwork(latestStored[CONSENT_STORAGE_KEY]) &&
                    !isSensitiveThreadsRoute(sender.url);
                if (!stillEnabled) {
                    let stopError = null;
                    try {
                        await stopCaptureInSenderTab(extensionApi, sender);
                    } catch (error) {
                        stopError = error;
                    }
                    await reconcile();
                    if (stopError) throw stopError;
                } else {
                    await extensionApi.scripting.executeScript({
                        target: { tabId: sender.tab.id, frameIds: [0] },
                        world: 'MAIN',
                        files: ['main-world-capture.js'],
                        injectImmediately: true
                    });
                }
            }
            return { ok: true };
        };
        void handle().then(sendResponse, () => {
            sendResponse({ ok: false, error: 'internal_error' });
        });
        return true;
    });

    extensionApi.runtime.onInstalled.addListener(requestReconcile);
    extensionApi.runtime.onStartup.addListener(requestReconcile);
    extensionApi.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[CONSENT_STORAGE_KEY]) requestReconcile();
    });

    extensionApi.action.onClicked.addListener(() => {
        void extensionApi.runtime.openOptionsPage();
    });

    const ready = reconcile();
    void ready.catch(() => {});
    const controller = Object.freeze({ ready, reconcile });
    INSTALLED_WORKERS.set(extensionApi, controller);
    return controller;
}

if (globalThis.chrome?.runtime?.onMessage) {
    bootstrapServiceWorker(globalThis.chrome);
}
