import { DEFAULT_OPTIONS, normalizeOptions } from '../shared/options.js';

const OPTIONS_KEY = 'threads-media-downloader-options-v1';
const OPTION_VALUE_PREFIX = 'threads-media-downloader-option-v2:';
const OPTION_KEYS = Object.keys(DEFAULT_OPTIONS);

export function createUserscriptPlatformAdapter(environment = globalThis) {
    let disposeSettings = () => {};
    let lastOptions;

    function readOptions() {
        if (typeof environment.GM_getValue !== 'function') return null;
        const options = { ...normalizeOptions(environment.GM_getValue(OPTIONS_KEY, null)) };
        for (const key of OPTION_KEYS) {
            const value = environment.GM_getValue(OPTION_VALUE_PREFIX + key, undefined);
            if (value !== undefined) options[key] = value;
        }
        return normalizeOptions(options);
    }

    return {
        async loadOptions() {
            try {
                lastOptions = readOptions();
                return lastOptions;
            } catch {
                return null;
            }
        },
        async saveOptions(options, { changedKeys } = {}) {
            if (typeof environment.GM_setValue !== 'function') return false;
            const normalized = normalizeOptions(options);
            // Separate keys prevent different tabs' edits from overwriting each
            // other, including concurrent edits. The old snapshot is read-only
            // migration input until each option has its own stored value.
            const keys = changedKeys || OPTION_KEYS;
            for (const key of keys) {
                if (Object.hasOwn(DEFAULT_OPTIONS, key)) {
                    environment.GM_setValue(OPTION_VALUE_PREFIX + key, normalized[key]);
                }
            }
            return true;
        },
        subscribeOptions(listener) {
            const window = environment.window || environment;
            const document = environment.document;
            let disposed = false;
            const refresh = () => {
                if (disposed || document?.visibilityState === 'hidden') return;
                try {
                    const next = readOptions();
                    if (!next || JSON.stringify(next) === JSON.stringify(lastOptions)) return;
                    lastOptions = next;
                    Promise.resolve(listener(next)).catch((error) => {
                        environment.console?.warn?.('[Threads Plugin] Updating settings failed', error);
                    });
                } catch (error) {
                    environment.console?.warn?.('[Threads Plugin] Reading settings failed', error);
                }
            };
            window.addEventListener?.('focus', refresh);
            document?.addEventListener?.('visibilitychange', refresh);
            return () => {
                if (disposed) return;
                disposed = true;
                window.removeEventListener?.('focus', refresh);
                document?.removeEventListener?.('visibilitychange', refresh);
            };
        },
        downloadMedia(details) {
            if (typeof environment.GM_download !== 'function') throw new Error('unsupported');
            return environment.GM_download(details);
        },
        requestMedia(details) {
            if (typeof environment.GM_xmlhttpRequest !== 'function') throw new Error('unsupported');
            return environment.GM_xmlhttpRequest(details);
        },
        async writeClipboard(text) {
            if (typeof environment.GM_setClipboard === 'function') {
                await environment.GM_setClipboard(text);
                return true;
            }
            if (typeof environment.navigator?.clipboard?.writeText !== 'function') {
                throw new Error('clipboard_unavailable');
            }
            await environment.navigator.clipboard.writeText(text);
            return true;
        },
        async installStyles(cssText) {
            if (typeof environment.GM_addStyle === 'function') {
                const style = environment.GM_addStyle(cssText);
                let disposed = false;
                return () => {
                    if (disposed) return;
                    disposed = true;
                    style?.remove?.();
                };
            }
            const style = environment.document.createElement('style');
            style.dataset.threadsPluginStyle = '1';
            style.textContent = cssText;
            environment.document.documentElement.appendChild(style);
            let disposed = false;
            return () => {
                if (disposed) return;
                disposed = true;
                style.remove();
            };
        },
        async installSettingsUi(model) {
            const disposePreviousSettings = disposeSettings;
            disposeSettings = () => {};
            disposePreviousSettings();
            const commandIds = [];
            if (typeof environment.GM_registerMenuCommand !== 'function') return () => {};
            let disposed = false;
            const disposeCurrentSettings = () => {
                if (disposed) return;
                disposed = true;
                if (disposeSettings === disposeCurrentSettings) disposeSettings = () => {};
                if (typeof environment.GM_unregisterMenuCommand !== 'function') return;
                commandIds.forEach((id) => environment.GM_unregisterMenuCommand(id));
            };
            disposeSettings = disposeCurrentSettings;

            try {
                for (const command of model.commands) {
                    commandIds.push(environment.GM_registerMenuCommand(command.label, command.run));
                }
            } catch (error) {
                disposeCurrentSettings();
                throw error;
            }

            return disposeCurrentSettings;
        }
    };
}
