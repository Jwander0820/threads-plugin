import { normalizeConsentState } from '../shared/consent-state.js';
import { getFirstValidLanguageTag, resolveInterfaceLocale } from '../shared/i18n.js';
import { normalizeOptions } from '../shared/options.js';
import {
    CONSENT_STORAGE_KEY,
    LAST_DOCUMENT_LOCALE_STORAGE_KEY,
    OPTIONS_STORAGE_KEY
} from './storage-keys.js';

function runtimeError(response) {
    const code = response?.error || 'download_failed';
    const error = new Error(code);
    error.code = code;
    return error;
}

export function createChromePlatformAdapter(environment = globalThis) {
    const chromeApi = environment.chrome;
    if (!chromeApi?.storage?.local || !chromeApi?.runtime) {
        throw new Error('chrome_extension_api_unavailable');
    }

    return {
        // Chrome owns transfer timeouts and pause/resume. Content-script timers
        // can be throttled in background tabs and must not abort its downloads.
        get tracksDownloadCompletion() { return true; },
        async loadOptions() {
            const stored = await chromeApi.storage.local.get(OPTIONS_STORAGE_KEY);
            return normalizeOptions(stored[OPTIONS_STORAGE_KEY]);
        },
        async saveOptions(options) {
            const normalized = normalizeOptions(options);
            await chromeApi.storage.local.set({ [OPTIONS_STORAGE_KEY]: normalized });
            return normalized;
        },
        subscribeOptions(listener) {
            const onChanged = (changes, areaName) => {
                if (areaName !== 'local' || !changes[OPTIONS_STORAGE_KEY]) return;
                listener(normalizeOptions(changes[OPTIONS_STORAGE_KEY].newValue));
            };
            chromeApi.storage.onChanged.addListener(onChanged);
            return () => chromeApi.storage.onChanged.removeListener(onChanged);
        },
        async loadDocumentLocale() {
            const stored = await chromeApi.storage.local.get(LAST_DOCUMENT_LOCALE_STORAGE_KEY);
            return typeof stored[LAST_DOCUMENT_LOCALE_STORAGE_KEY] === 'string'
                ? stored[LAST_DOCUMENT_LOCALE_STORAGE_KEY]
                : '';
        },
        async saveDocumentLocale(documentLanguage) {
            const validLanguage = getFirstValidLanguageTag(documentLanguage);
            if (!validLanguage) return '';
            const locale = resolveInterfaceLocale({ documentLanguage: validLanguage });
            const stored = await chromeApi.storage.local.get(LAST_DOCUMENT_LOCALE_STORAGE_KEY);
            if (stored[LAST_DOCUMENT_LOCALE_STORAGE_KEY] === locale) return locale;
            await chromeApi.storage.local.set({ [LAST_DOCUMENT_LOCALE_STORAGE_KEY]: locale });
            return locale;
        },
        async loadConsent() {
            const stored = await chromeApi.storage.local.get(CONSENT_STORAGE_KEY);
            return normalizeConsentState(stored[CONSENT_STORAGE_KEY]);
        },
        async saveConsent(consent) {
            const normalized = normalizeConsentState(consent);
            await chromeApi.storage.local.set({ [CONSENT_STORAGE_KEY]: normalized });
            return normalized;
        },
        subscribeConsent(listener) {
            const onChanged = (changes, areaName) => {
                if (areaName !== 'local' || !changes[CONSENT_STORAGE_KEY]) return;
                listener(normalizeConsentState(changes[CONSENT_STORAGE_KEY].newValue));
            };
            chromeApi.storage.onChanged.addListener(onChanged);
            return () => chromeApi.storage.onChanged.removeListener(onChanged);
        },
        downloadMedia(details) {
            let aborted = false;
            let settled = false;
            let downloadId;
            let pollTimer;
            let receivedBytes = -1;
            const setTimer = environment.setTimeout?.bind(environment) || globalThis.setTimeout;
            const clearTimer = environment.clearTimeout?.bind(environment) || globalThis.clearTimeout;
            const cleanup = () => {
                if (pollTimer !== undefined) clearTimer(pollTimer);
                pollTimer = undefined;
            };
            const cancel = () => {
                if (!Number.isInteger(downloadId)) return;
                void chromeApi.runtime.sendMessage({ type: 'CANCEL_DOWNLOAD', downloadId }).catch(() => {});
            };
            const fail = (error) => {
                if (aborted || settled) return;
                settled = true;
                cleanup();
                cancel();
                details.onerror?.(error);
            };
            const poll = async () => {
                if (aborted || settled) return;
                try {
                    const response = await chromeApi.runtime.sendMessage({ type: 'DOWNLOAD_STATUS', downloadId });
                    if (aborted || settled) return;
                    if (!response?.ok) {
                        fail(runtimeError(response));
                    } else if (response.state === 'complete') {
                        settled = true;
                        cleanup();
                        details.onload?.({ downloadId });
                    } else if (response.state === 'interrupted') {
                        const error = runtimeError({ error: 'download_interrupted' });
                        error.interruptReason = response.interruptReason;
                        fail(error);
                    } else if (response.state === 'in_progress') {
                        if (response.bytesReceived > receivedBytes) {
                            receivedBytes = response.bytesReceived;
                            details.onprogress?.({ loaded: receivedBytes, total: response.totalBytes });
                        }
                        if (!aborted && !settled) pollTimer = setTimer(poll, 500);
                    } else {
                        fail(runtimeError({ error: 'download_status_unavailable' }));
                    }
                } catch (error) {
                    fail(error);
                }
            };
            chromeApi.runtime.sendMessage({
                type: 'DOWNLOAD_MEDIA',
                url: details.url,
                filename: details.name,
                expectedType: /\.(?:mp4|m4v|mov|webm)$/i.test(details.name) ? 'video' : 'image'
            }).then((response) => {
                if (!response?.ok || !Number.isInteger(response.downloadId)) {
                    fail(runtimeError(response));
                    return;
                }
                downloadId = response.downloadId;
                if (aborted) {
                    cancel();
                    return;
                }
                void poll();
            }).catch((error) => {
                fail(error);
            });
            return { abort() {
                if (settled || aborted) return;
                aborted = true;
                cleanup();
                cancel();
            } };
        },
        async writeClipboard(text) {
            await environment.navigator.clipboard.writeText(text);
            return true;
        },
        async installStyles(cssText) {
            const style = environment.document.createElement('style');
            style.dataset.threadsPluginStyle = '1';
            style.textContent = cssText;
            (environment.document.head || environment.document.documentElement).appendChild(style);
            return () => style.remove();
        },
        async installSettingsUi() {
            return () => {};
        }
    };
}
