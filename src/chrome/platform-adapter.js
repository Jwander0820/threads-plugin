import { normalizeConsentState } from '../shared/consent-state.js';
import { normalizeOptions } from '../shared/options.js';
import { CONSENT_STORAGE_KEY, OPTIONS_STORAGE_KEY } from './storage-keys.js';

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
            chromeApi.runtime.sendMessage({
                type: 'DOWNLOAD_MEDIA',
                url: details.url,
                filename: details.name,
                expectedType: /\.(?:mp4|m4v|mov|webm)$/i.test(details.name) ? 'video' : 'image'
            }).then((response) => {
                if (aborted) return;
                if (response?.ok) details.onload?.({ downloadId: response.downloadId });
                else details.onerror?.(runtimeError(response));
            }).catch((error) => {
                if (!aborted) details.onerror?.(error);
            });
            return { abort() { aborted = true; } };
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
