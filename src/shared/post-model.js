import { validateMediaUrl } from './media-policy.js';
import { getMediaUrlIdentity } from './route-media-state.js';

export function sanitizeFilenamePart(value) {
    const cleaned = String(value || 'unknown')
        .replace(/^@/, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || 'unknown';
}

export function normalizePostIdentity(value) {
    const identity = String(value || '');
    return /^[A-Za-z0-9_-]{1,80}$/.test(identity) ? identity : null;
}

export function parsePostInfoFromUrl(url, baseUrl = globalThis.location?.href || 'https://www.threads.com/') {
    if (typeof url !== 'string' || !url.trim()) return null;
    try {
        const parsed = new URL(url, baseUrl);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
            return null;
        }
        const match = parsed.pathname.match(/^\/@([^/]+)\/post\/([^/?#]+)\/?$/);
        if (!match) return null;
        if (!['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(parsed.hostname.toLowerCase())) {
            return null;
        }
        const author = decodeURIComponent(match[1]);
        const postId = decodeURIComponent(match[2]);
        if (!/^[A-Za-z0-9._]{1,30}$/.test(author) || !normalizePostIdentity(postId) || postId.length < 5) {
            return null;
        }
        return {
            author,
            postId,
            postUrl: parsed.href
        };
    } catch {
        return null;
    }
}

function isLikelyPostCode(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{5,32}$/.test(value) && !/^\d+$/.test(value);
}

function getPostCodeFromObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    for (const key of ['permalink', 'url', 'share_url', 'post_url']) {
        const parsed = parsePostInfoFromUrl(value[key]);
        if (parsed?.postId) return parsed.postId;
    }

    const typeName = String(value.__typename || value.typename || value.type || '');
    const hasMediaShape = [
        'carousel_media', 'image_versions', 'image_versions2', 'media',
        'playable_url', 'video_url', 'video_versions'
    ].some((key) => key in value);
    if (!hasMediaShape && !/(?:post|thread|media)/i.test(typeName)) return null;

    for (const key of ['code', 'shortcode', 'media_code', 'post_code', 'thread_code', 'permalink_code']) {
        if (isLikelyPostCode(value[key])) return value[key];
    }
    return null;
}

function pickBestStructuredMediaUrl(candidates, expectedType) {
    return Array.from(candidates || [])
        .map((candidate) => {
            const rawUrl = typeof candidate === 'string'
                ? candidate
                : (candidate?.url || candidate?.src || candidate?.playable_url || '');
            return {
                validated: validateMediaUrl(rawUrl, expectedType),
                score: (Number(candidate?.width) || 0) * (Number(candidate?.height) || 0) * 1000 +
                    (Number(candidate?.bandwidth || candidate?.bitrate) || 0)
            };
        })
        .filter((candidate) => candidate.validated.ok)
        .sort((a, b) => b.score - a.score)[0]?.validated.url || null;
}

export function collectStructuredMediaUrls(value, inheritedPostCode = null) {
    const records = [];
    const recordKeys = new Set();
    const visited = new WeakSet();

    const addRecord = (type, rawUrl, postId, preserveDuplicateSlot = false) => {
        if (!postId) return;
        const validated = validateMediaUrl(rawUrl, type);
        if (!validated.ok) return;
        const identity = getMediaUrlIdentity(validated.url);
        const key = `${postId}:${type}:${identity || validated.url}`;
        if (!preserveDuplicateSlot && recordKeys.has(key)) return;
        recordKeys.add(key);
        records.push({ type, url: validated.url, postId });
    };

    const visit = (node, postCode, depth, preserveDuplicateSlots = false) => {
        if (!node || depth > 40) return;
        if (Array.isArray(node)) {
            node.forEach((child) => visit(child, postCode, depth + 1, preserveDuplicateSlots));
            return;
        }
        if (typeof node !== 'object' || visited.has(node)) return;
        visited.add(node);

        const nextPostCode = getPostCodeFromObject(node) || postCode;
        const hasCarouselMedia = Array.isArray(node.carousel_media) && node.carousel_media.length > 0;
        // Threads also exposes the first carousel item as a post-level cover.
        // carousel_media is authoritative, so recording the wrapper would
        // prepend that first item a second time.
        if (!hasCarouselMedia) {
            const renditionVideoUrl = pickBestStructuredMediaUrl(node.video_versions, 'video');
            const directVideoUrl = ['playable_url', 'video_url']
                .map((key) => validateMediaUrl(node[key], 'video'))
                .find((result) => result.ok)?.url || null;
            const videoUrl = renditionVideoUrl || directVideoUrl;
            if (videoUrl) addRecord('video', videoUrl, nextPostCode, preserveDuplicateSlots);

            const imageCandidates = node.image_versions2?.candidates || node.image_versions?.candidates;
            const imageUrl = pickBestStructuredMediaUrl(imageCandidates, 'image');
            if (!videoUrl && imageUrl) addRecord('image', imageUrl, nextPostCode, preserveDuplicateSlots);
            if (!videoUrl && !imageUrl) {
                ['display_url', 'image_url', 'thumbnail_src', 'thumbnail_url'].forEach((key) => {
                    if (typeof node[key] === 'string') addRecord('image', node[key], nextPostCode, preserveDuplicateSlots);
                });
            }
        }

        Object.entries(node).forEach(([key, child]) => {
            if ([
                'display_url', 'image_url', 'image_versions', 'image_versions2', 'playable_url',
                'thumbnail_src', 'thumbnail_url', 'video_url', 'video_versions'
            ].includes(key)) return;
            if (['author', 'owner', 'profile', 'user'].includes(key)) return;
            const crossesPostBoundary = /(?:parent_post|quoted|reply_to|repost)/i.test(key);
            const childPostCode = crossesPostBoundary ? null : nextPostCode;
            const childPreservesDuplicateSlots = !crossesPostBoundary &&
                (preserveDuplicateSlots || key === 'carousel_media');
            visit(child, childPostCode, depth + 1, childPreservesDuplicateSlots);
        });
    };

    visit(value, inheritedPostCode, 0);
    return records;
}
