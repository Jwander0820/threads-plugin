const MEDIA_HOST_EXACT_ALLOWLIST = new Set([
    'threads.com',
    'www.threads.com',
    'threads.net',
    'www.threads.net'
]);
const MEDIA_HOST_SUFFIX_ALLOWLIST = Object.freeze([
    'instagram.com',
    'cdninstagram.com',
    'fbcdn.net'
]);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);

export const MEDIA_URL_MAX_LENGTH = 8192;

function sanitizeMediaFilenamePart(value) {
    const cleaned = String(value || 'unknown')
        .replace(/^@/, '')
        .replace(/[\\/:*?\x22<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
    return cleaned || 'unknown';
}

function defaultBaseUrl() {
    return globalThis.location?.href || 'https://www.threads.com/';
}

export function normalizeUrl(rawUrl, baseUrl = defaultBaseUrl()) {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > MEDIA_URL_MAX_LENGTH) return null;

    let url = rawUrl
        .trim()
        .replace(/\\u0026/gi, '&')
        .replace(/\\\//g, '/')
        .replace(/&amp;/gi, '&')
        .replace(/[),.;\]}]+$/g, '');

    if (url.length > MEDIA_URL_MAX_LENGTH || !/^https?:\/\//i.test(url)) return null;

    try {
        const normalized = new URL(url, baseUrl).href;
        return normalized.length <= MEDIA_URL_MAX_LENGTH ? normalized : null;
    } catch {
        return null;
    }
}

function hostnameMatchesSuffix(hostname, suffix) {
    const normalizedHostname = String(hostname || '').toLowerCase().replace(/\.$/, '');
    const normalizedSuffix = String(suffix || '').toLowerCase().replace(/\.$/, '');
    return normalizedHostname === normalizedSuffix ||
        normalizedHostname.endsWith(`.${normalizedSuffix}`);
}

function isAllowedMediaHostname(hostname) {
    const normalizedHostname = String(hostname || '').toLowerCase();
    if (!normalizedHostname || normalizedHostname.endsWith('.')) return false;
    if (MEDIA_HOST_EXACT_ALLOWLIST.has(normalizedHostname)) return true;
    return MEDIA_HOST_SUFFIX_ALLOWLIST.some((suffix) =>
        hostnameMatchesSuffix(normalizedHostname, suffix)
    );
}

function getMediaPathExtension(pathname) {
    let decodedPath = String(pathname || '');
    try {
        decodedPath = decodeURIComponent(decodedPath);
    } catch {
        return '';
    }

    const match = decodedPath.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
}

export function validateMediaUrl(rawUrl, expectedType = null) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return { ok: false, reason: 'invalid_url' };

    let parsed;
    try {
        parsed = new URL(normalized);
    } catch {
        return { ok: false, reason: 'invalid_url' };
    }

    if (parsed.protocol !== 'https:') return { ok: false, reason: 'https_required' };
    if (parsed.username || parsed.password) return { ok: false, reason: 'credentials_not_allowed' };
    if (parsed.port && parsed.port !== '443') return { ok: false, reason: 'port_not_allowed' };
    if (!isAllowedMediaHostname(parsed.hostname)) return { ok: false, reason: 'host_not_allowed' };

    const extension = getMediaPathExtension(parsed.pathname);
    const type = VIDEO_EXTENSIONS.has(extension)
        ? 'video'
        : (IMAGE_EXTENSIONS.has(extension) ? 'image' : null);
    if (!type) return { ok: false, reason: 'extension_not_allowed' };
    if (expectedType && type !== expectedType) return { ok: false, reason: 'media_type_mismatch' };

    return {
        ok: true,
        url: parsed.href,
        type,
        extension,
        hostname: parsed.hostname.toLowerCase()
    };
}

export function isVideoUrl(url) {
    return validateMediaUrl(url, 'video').ok;
}

export function isImageUrl(url) {
    return validateMediaUrl(url, 'image').ok;
}

function formatUtcTimestamp(dateLike, now = () => new Date()) {
    const date = dateLike instanceof Date && !Number.isNaN(dateLike.getTime())
        ? dateLike
        : now();
    const pad = (num) => String(num).padStart(2, '0');

    return (
        `${date.getUTCFullYear()}` +
        `${pad(date.getUTCMonth() + 1)}` +
        `${pad(date.getUTCDate())}-` +
        `${pad(date.getUTCHours())}` +
        `${pad(date.getUTCMinutes())}` +
        `${pad(date.getUTCSeconds())}Z`
    );
}

function guessExtension(type, url, contentType) {
    const validated = validateMediaUrl(url, type);
    if (validated.ok) return validated.extension === 'jpeg' ? 'jpg' : validated.extension;

    if (/mp4/i.test(contentType || '')) return 'mp4';
    if (/webm/i.test(contentType || '')) return 'webm';
    if (/png/i.test(contentType || '')) return 'png';
    if (/webp/i.test(contentType || '')) return 'webp';
    if (/avif/i.test(contentType || '')) return 'avif';
    return type === 'video' ? 'mp4' : 'jpg';
}

export function buildMediaFilename({ type, url, contentType, postInfo, sequence, now }) {
    const safePostInfo = postInfo || {};
    const extension = guessExtension(type, url, contentType);
    const kind = type === 'video' ? 'video' : 'photo';
    const timestamp = formatUtcTimestamp(safePostInfo.createdAt, now);
    const author = sanitizeMediaFilenamePart(safePostInfo.author);
    const postId = sanitizeMediaFilenamePart(safePostInfo.postId);
    const safeSequence = sanitizeMediaFilenamePart(sequence);

    return `${author}_${timestamp}_${postId}_${kind}_${safeSequence}.${extension}`;
}
