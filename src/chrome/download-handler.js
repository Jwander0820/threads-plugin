import { canProcessPage } from '../shared/consent-state.js';
import { validateMediaUrl } from '../shared/media-policy.js';
import { isSensitiveThreadsRoute } from '../shared/network-policy.js';
import { CONSENT_STORAGE_KEY } from './storage-keys.js';

const THREADS_ORIGINS = new Set([
    'https://www.threads.com',
    'https://threads.com',
    'https://www.threads.net',
    'https://threads.net'
]);
const MESSAGE_KEYS = Object.freeze(['expectedType', 'filename', 'type', 'url']);
const CONTROL_KEYS = Object.freeze(['downloadId', 'type']);
const DOWNLOAD_SESSION_PREFIX = 'threadsDownload:';
const MAX_TRACKED_DOWNLOADS = 128;
const MAX_OWNERSHIP_AGE_MS = 24 * 60 * 60 * 1000;

export function validateDownloadFilename(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 180) return false;
    if (value !== value.trim() || /[\\/:*?"<>|\u0000-\u001f]/.test(value)) return false;
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) return false;
    return /\.(?:jpe?g|png|webp|avif|gif|mp4|m4v|mov|webm)$/i.test(value);
}

export function validateExtensionSender(sender, runtimeId) {
    if (!sender || sender.id !== runtimeId || sender.frameId !== 0) return false;
    if (!Number.isInteger(sender.tab?.id) || sender.tab.id < 0) return false;
    try {
        return THREADS_ORIGINS.has(new URL(sender.url).origin);
    } catch {
        return false;
    }
}

function validMessageShape(message, expectedKeys = MESSAGE_KEYS) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    const keys = Object.keys(message).sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

export function createDownloadMessageHandler({ runtimeId, storage, sessionStore, downloads }) {
    const pendingStarts = new Set();
    const ownerKey = (downloadId) => DOWNLOAD_SESSION_PREFIX + downloadId;
    const cancelOwned = async (downloadId) => {
        try {
            await downloads.cancel(downloadId);
        } finally {
            await sessionStore.remove(ownerKey(downloadId));
        }
    };

    const readOwners = async () => Object.entries(await sessionStore.get(null))
        .filter(([key]) => key.startsWith(DOWNLOAD_SESSION_PREFIX));
    const pruneOwners = async () => {
        const entries = await readOwners();
        const cutoff = Date.now() - MAX_OWNERSHIP_AGE_MS;
        const expired = entries.filter(([, owner]) => !owner || !(owner.createdAt > cutoff));
        if (expired.length) await sessionStore.remove(expired.map(([key]) => key));
        return entries.length - expired.length;
    };

    const handleDownloadMessage = async (message, sender) => {
        const isControl = message?.type === 'DOWNLOAD_STATUS' || message?.type === 'CANCEL_DOWNLOAD';
        if (!(isControl ? validMessageShape(message, CONTROL_KEYS) :
            validMessageShape(message) && message.type === 'DOWNLOAD_MEDIA')) {
            return { ok: false, error: 'invalid_message' };
        }
        if (!validateExtensionSender(sender, runtimeId)) return { ok: false, error: 'invalid_sender' };

        if (isControl) {
            if (!Number.isInteger(message.downloadId) || message.downloadId < 0) {
                return { ok: false, error: 'invalid_message' };
            }
            const key = ownerKey(message.downloadId);
            const owner = (await sessionStore.get(key))[key];
            if (!owner || owner.tabId !== sender.tab.id ||
                owner.documentId !== (sender.documentId || '') ||
                owner.origin !== new URL(sender.url).origin) {
                return { ok: false, error: 'download_not_owned' };
            }
            // Cleanup remains allowed after consent revocation or a route change,
            // but can affect only this document's extension-created download.
            if (message.type === 'CANCEL_DOWNLOAD') {
                try {
                    await cancelOwned(message.downloadId);
                    return { ok: true };
                } catch {
                    return { ok: false, error: 'download_cancel_failed' };
                }
            }
            const stored = await storage.get(CONSENT_STORAGE_KEY);
            if (!canProcessPage(stored[CONSENT_STORAGE_KEY]) || isSensitiveThreadsRoute(sender.url)) {
                try { await cancelOwned(message.downloadId); } catch { /* best-effort cleanup */ }
                return { ok: false, error: 'permission_revoked' };
            }
            try {
                // Query one owned ID only; never expose Chrome's download history.
                const [download] = await downloads.search({ id: message.downloadId });
                if (!download) {
                    await sessionStore.remove(key);
                    return { ok: false, error: 'download_missing' };
                }
                if (download.state !== 'in_progress') await sessionStore.remove(key);
                return {
                    ok: true,
                    state: download.state,
                    bytesReceived: download.bytesReceived,
                    totalBytes: download.totalBytes,
                    ...(download.error ? { interruptReason: download.error } : {})
                };
            } catch {
                return { ok: false, error: 'download_status_unavailable' };
            }
        }

        if (isSensitiveThreadsRoute(sender.url)) return { ok: false, error: 'sensitive_route' };
        if (message.expectedType !== 'image' && message.expectedType !== 'video') {
            return { ok: false, error: 'invalid_media_type' };
        }
        let downloadId;
        const pending = { tabId: sender.tab.id, cancelled: false };
        pendingStarts.add(pending);
        try {
            const stored = await storage.get(CONSENT_STORAGE_KEY);
            if (!canProcessPage(stored[CONSENT_STORAGE_KEY])) {
                return { ok: false, error: 'consent_required' };
            }
            const media = validateMediaUrl(message.url, message.expectedType);
            if (!media.ok) return { ok: false, error: 'unsafe_media_url' };
            if (!validateDownloadFilename(message.filename)) {
                return { ok: false, error: 'unsafe_filename' };
            }
            // Abandoned result records are bounded even if a tab disappears before
            // its last poll. Active ownership is never evicted to admit new work.
            if (await pruneOwners() + pendingStarts.size > MAX_TRACKED_DOWNLOADS) {
                return { ok: false, error: 'download_tracking_capacity' };
            }
            if (pending.cancelled) return { ok: false, error: 'permission_revoked' };
            downloadId = await downloads.download({
                url: media.url,
                filename: message.filename,
                saveAs: false,
                conflictAction: 'uniquify'
            });
            // Session storage survives MV3 worker suspension without persisting
            // media URLs, filenames, or a history across browser sessions.
            await sessionStore.set({ [ownerKey(downloadId)]: {
                tabId: sender.tab.id,
                documentId: sender.documentId || '',
                origin: new URL(sender.url).origin,
                createdAt: Date.now()
            } });
            const latestStored = await storage.get(CONSENT_STORAGE_KEY);
            if (pending.cancelled || !canProcessPage(latestStored[CONSENT_STORAGE_KEY])) {
                await cancelOwned(downloadId);
                return { ok: false, error: 'permission_revoked' };
            }
            return { ok: true, downloadId };
        } catch {
            if (Number.isInteger(downloadId)) {
                try { await downloads.cancel(downloadId); } catch { /* best-effort cleanup */ }
                try { await sessionStore.remove(ownerKey(downloadId)); } catch { /* storage unavailable */ }
            }
            return { ok: false, error: 'download_failed' };
        } finally {
            pendingStarts.delete(pending);
        }
    };

    handleDownloadMessage.cancelTabDownloads = async (tabId) => {
        for (const pending of pendingStarts) {
            if (pending.tabId === tabId) pending.cancelled = true;
        }
        for (const [key, owner] of await readOwners()) {
            if (owner.tabId !== tabId) continue;
            const id = Number(key.slice(DOWNLOAD_SESSION_PREFIX.length));
            try { await cancelOwned(id); } catch { /* the tab is already gone */ }
        }
    };
    return handleDownloadMessage;
}
