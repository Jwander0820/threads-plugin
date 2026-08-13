const OPTIONS_KEY = 'threads-media-downloader-options-v1';

export function createUserscriptPlatformAdapter(environment = globalThis) {
    let disposeSettings = () => {};

    return {
        async loadOptions() {
            try {
                return typeof environment.GM_getValue === 'function'
                    ? environment.GM_getValue(OPTIONS_KEY, null)
                    : null;
            } catch {
                return null;
            }
        },
        async saveOptions(options) {
            if (typeof environment.GM_setValue !== 'function') return false;
            environment.GM_setValue(OPTIONS_KEY, JSON.stringify(options));
            return true;
        },
        subscribeOptions() {
            return () => {};
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
                environment.GM_setClipboard(text);
                return true;
            }
            await environment.navigator?.clipboard?.writeText(text);
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
