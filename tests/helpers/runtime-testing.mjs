import { createThreadsRuntime } from '../../src/shared/threads-runtime.js';

const platform = {
    async loadOptions() { return null; },
    async saveOptions() { return true; },
    subscribeOptions() { return () => {}; },
    downloadMedia(details) { return globalThis.GM_download(details); },
    requestMedia(details) { return globalThis.GM_xmlhttpRequest(details); },
    async writeClipboard(text) {
        if (typeof globalThis.GM_setClipboard === 'function') globalThis.GM_setClipboard(text);
        return true;
    },
    async installStyles() { return () => {}; },
    async installSettingsUi() { return () => {}; }
};

const runtime = await createThreadsRuntime({ platform, initialOptions: {} });

export const runtimeTesting = runtime.testing;
