(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === '1') localStorage.removeItem('threads-plugin-e2e-storage');
    const initialAccepted = params.get('state') === 'accepted';
    const storageData = JSON.parse(localStorage.getItem('threads-plugin-e2e-storage') || 'null') || (initialAccepted ? {
        consent: {
            disclosureAcceptedVersion: 1,
            disclosureDeclinedVersion: 0,
            pageContentProcessingEnabled: true,
            networkCaptureEnabled: false
        }
    } : {});
    const storageListeners = new Set();
    const storageChannel = new BroadcastChannel('threads-plugin-e2e-storage');
    const messages = [];

    function applyStorageUpdate(update, notify) {
        const changes = {};
        Object.entries(update).forEach(([key, value]) => {
            changes[key] = { oldValue: storageData[key], newValue: value };
            storageData[key] = value;
        });
        localStorage.setItem('threads-plugin-e2e-storage', JSON.stringify(storageData));
        if (notify) storageListeners.forEach((listener) => listener(changes, 'local'));
        return changes;
    }

    storageChannel.addEventListener('message', (event) => {
        applyStorageUpdate(event.data, true);
    });

    const local = {
        async get(keys) {
            if (typeof keys === 'string') return { [keys]: storageData[keys] };
            if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, storageData[key]]));
            return { ...storageData };
        },
        async set(update) {
            const changes = applyStorageUpdate(update, false);
            storageListeners.forEach((listener) => listener(changes, 'local'));
            storageChannel.postMessage(update);
        }
    };

    window.chrome = {
        storage: {
            local,
            onChanged: {
                addListener(listener) { storageListeners.add(listener); },
                removeListener(listener) { storageListeners.delete(listener); }
            }
        },
        runtime: {
            id: 'threads-plugin-e2e',
            async sendMessage(message) {
                messages.push(structuredClone(message));
                if (message.type === 'DOWNLOAD_MEDIA') return { ok: true, downloadId: 99 };
                return { ok: true };
            }
        }
    };
    window.__threadsPluginE2E = {
        messages,
        readStorage() { return structuredClone(storageData); }
    };
})();
