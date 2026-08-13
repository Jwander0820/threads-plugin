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

function validMessageShape(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    const keys = Object.keys(message).sort();
    return keys.length === MESSAGE_KEYS.length && keys.every((key, index) => key === MESSAGE_KEYS[index]);
}

export function createDownloadMessageHandler({ runtimeId, storage, downloads }) {
    return async function handleDownloadMessage(message, sender) {
        if (!validMessageShape(message) || message.type !== 'DOWNLOAD_MEDIA') {
            return { ok: false, error: 'invalid_message' };
        }
        if (!validateExtensionSender(sender, runtimeId)) return { ok: false, error: 'invalid_sender' };
        if (isSensitiveThreadsRoute(sender.url)) return { ok: false, error: 'sensitive_route' };
        if (message.expectedType !== 'image' && message.expectedType !== 'video') {
            return { ok: false, error: 'invalid_media_type' };
        }
        const stored = await storage.get(CONSENT_STORAGE_KEY);
        if (!canProcessPage(stored[CONSENT_STORAGE_KEY])) {
            return { ok: false, error: 'consent_required' };
        }
        const media = validateMediaUrl(message.url, message.expectedType);
        if (!media.ok) return { ok: false, error: 'unsafe_media_url' };
        if (!validateDownloadFilename(message.filename)) {
            return { ok: false, error: 'unsafe_filename' };
        }

        try {
            const downloadId = await downloads.download({
                url: media.url,
                filename: message.filename,
                saveAs: false,
                conflictAction: 'uniquify'
            });
            return { ok: true, downloadId };
        } catch {
            return { ok: false, error: 'download_failed' };
        }
    };
}
