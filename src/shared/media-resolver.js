import { isImageUrl, normalizeUrl, validateMediaUrl } from './media-policy.js';
import { normalizePostIdentity } from './post-model.js';
import { areMediaUrlsEquivalent, getMediaUrlIdentity } from './route-media-state.js';

// Parsing and selection operate only on the supplied DOM elements and post-bound records.
function pickBestFromSrcset(srcset) {
    if (!srcset) return null;

    const candidates = srcset
        .split(',')
        .map((item) => item.trim())
        .map((item) => {
            const parts = item.split(/\s+/);
            const url = normalizeUrl(parts[0]);
            const descriptor = parts[1] || '';
            let weight = 0;

            if (descriptor.endsWith('w')) {
                weight = parseInt(descriptor, 10);
            } else if (descriptor.endsWith('x')) {
                weight = Math.round(parseFloat(descriptor) * 1000);
            }

            return { url, weight: Number.isFinite(weight) ? weight : 0 };
        })
        .filter((item) => item.url);

    candidates.sort((a, b) => b.weight - a.weight);
    return candidates[0]?.url || null;
}

export function resolveImageUrl(img) {
    const urls = [
        pickBestFromSrcset(img.getAttribute('srcset') || img.srcset),
        img.currentSrc,
        img.src,
        img.getAttribute('src')
    ];

    const picture = img.closest('picture');
    if (picture) {
        picture.querySelectorAll('source[srcset]').forEach((source) => {
            urls.push(pickBestFromSrcset(source.getAttribute('srcset') || source.srcset));
        });
    }

    return urls.map((url) => normalizeUrl(url)).find(isImageUrl) || null;
}

export function selectPostBoundVideoUrl({ directUrls = [], postId, videoUrlsByPostId }) {
    const directUrl = directUrls
        .map((url) => validateMediaUrl(url, 'video'))
        .find((result) => result.ok)?.url;
    if (directUrl) return directUrl;

    if (!postId || postId === 'unknown' || !(videoUrlsByPostId instanceof Map)) return null;
    const identity = normalizePostIdentity(postId);
    if (!identity) return null;
    const validatedCachedUrls = (videoUrlsByPostId.get(identity) || [])
        .map((url) => validateMediaUrl(url, 'video'))
        .filter((result) => result.ok)
        .map((result) => result.url);
    const distinctUrls = new Map();
    validatedCachedUrls.forEach((url) => {
        distinctUrls.set(getMediaUrlIdentity(url) || url, url);
    });
    return distinctUrls.size === 1 ? distinctUrls.values().next().value : null;
}

export function rectsOverlap(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    const overlapArea = width * height;
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);

    return smallerArea > 0 && overlapArea / smallerArea > 0.45;
}

function getModalItemIdentity(item, rectKey) {
    const resolvedKey = getMediaUrlIdentity(item.resolvedUrl);
    if (resolvedKey) return `${item.type}:${resolvedKey}`;

    const previewKey = getMediaUrlIdentity(item.previewUrl);
    if (previewKey) return `${item.type}:${previewKey}`;

    return `${item.type}:rect:${rectKey}`;
}

function dedupeModalItems(items) {
    const structuredSlots = [];
    const itemByKey = new Map();

    items.forEach((item) => {
        if (!item.resolvedUrl) return;

        if (Number.isInteger(item.structuredSlotIndex)) {
            structuredSlots.push(item);
            return;
        }

        const rect = item.element?.getBoundingClientRect?.() || { left: item.indexHint || 0, top: item.indexHint || 0, width: 0, height: 0 };
        const rectKey = [
            Math.round(rect.left / 12),
            Math.round(rect.top / 12),
            Math.round(rect.width / 12),
            Math.round(rect.height / 12)
        ].join(':');
        const key = getModalItemIdentity(item, rectKey);
        const existing = itemByKey.get(key);

        if (!existing || (!existing.previewUrl && item.previewUrl)) {
            itemByKey.set(key, item);
        }
    });

    return [...structuredSlots, ...itemByKey.values()].map((item, index) => {
        const { structuredSlotIndex, ...publicItem } = item;
        return { ...publicItem, index: index + 1, selected: false };
    });
}

function orderModalItemsFromStructuredMedia(structuredItems, fallbackItems) {
    const orderedStructuredItems = Array.from(structuredItems || []);
    const availableItems = Array.from(fallbackItems || []).filter((item) => item?.resolvedUrl);
    const usedItems = new Set();
    const exactMatches = new Map();

    orderedStructuredItems.forEach((structuredItem, structuredSlotIndex) => {
        const exactMatch = availableItems.find((item) =>
            !usedItems.has(item) &&
            item.type === structuredItem.type &&
            areMediaUrlsEquivalent(item.resolvedUrl, structuredItem?.resolvedUrl)
        );
        if (!exactMatch) return;
        usedItems.add(exactMatch);
        exactMatches.set(structuredSlotIndex, exactMatch);
    });

    orderedStructuredItems.forEach((structuredItem, index) => {
        if (exactMatches.has(index) || structuredItem.type !== 'video') return;
        const poster = availableItems.find(item => !usedItems.has(item) && item.type === 'image' &&
            areMediaUrlsEquivalent(item.resolvedUrl, structuredItem.previewUrl));
        if (!poster) return;
        usedItems.add(poster);
        exactMatches.set(index, poster);
    });

    const orderedItems = orderedStructuredItems.map((structuredItem, structuredSlotIndex) => {
        const exactMatch = exactMatches.get(structuredSlotIndex);
        if (!exactMatch) return { ...structuredItem, structuredSlotIndex };
        return {
            ...exactMatch,
            ...structuredItem,
            element: exactMatch.element || structuredItem.element,
            previewUrl: exactMatch.previewUrl || structuredItem.previewUrl || '',
            structuredSlotIndex
        };
    });

    return [
        ...orderedItems,
        ...availableItems.filter((item) => !usedItems.has(item))
    ];
}

export function finalizeModalItems({ rawItems, cachedImageItems, cachedVideoItems, structuredItems = [] }) {
    // An IG embed can expose only its poster in structured data while the
    // native player already has the MP4. Prefer that confirmed association.
    structuredItems = structuredItems.map(item => {
        if (item.type !== 'image') return item;
        const video = rawItems.find(candidate => candidate.type === 'video' &&
            validateMediaUrl(candidate.resolvedUrl, 'video').ok &&
            areMediaUrlsEquivalent(candidate.previewUrl, item.resolvedUrl));
        return video ? { ...item, ...video } : item;
    });
    const fallbackItems = [
        ...rawItems,
        ...cachedImageItems,
        ...cachedVideoItems
    ];
    // Once the API supplied carousel slots, cache entries are alternate URLs for
    // those slots rather than additional media.  Keep DOM-only leftovers as a
    // compatibility fallback, but do not append cache variants after the
    // authoritative structured sequence.
    const items = structuredItems.length > 0
        ? orderModalItemsFromStructuredMedia(structuredItems, rawItems)
        : fallbackItems;
    return dedupeModalItems(items);
}

export function uniqueElements(elements) {
    const seen = new Set();
    return elements.filter((element) => {
        if (!element || seen.has(element)) return false;
        seen.add(element);
        return true;
    });
}

export function orderMediaElementsByVisualPosition(elements) {
    return Array.from(elements || [])
        .map((element, originalIndex) => {
            const rect = element?.getBoundingClientRect?.() || {};
            const top = Number(rect.top);
            const left = Number(rect.left);
            return {
                element,
                originalIndex,
                top: Number.isFinite(top) ? top : Infinity,
                left: Number.isFinite(left) ? left : Infinity
            };
        })
        .sort((a, b) => {
            const aRow = Number.isFinite(a.top) ? Math.round(a.top / 12) : Infinity;
            const bRow = Number.isFinite(b.top) ? Math.round(b.top / 12) : Infinity;
            return (aRow - bRow) ||
                (a.left - b.left) ||
                (a.top - b.top) ||
                (a.originalIndex - b.originalIndex);
        })
        .map(({ element }) => element);
}

export function findVideoPreviewImage(video, images) {
    if (!video) return null;

    const videoRect = video.getBoundingClientRect();
    const cover = images.find((img) => rectsOverlap(img.getBoundingClientRect(), videoRect));
    return cover ? resolveImageUrl(cover) : null;
}

export function selectDetailMediaElements(images, videos, pageMedia) {
    const allVideos = uniqueElements([...videos, ...pageMedia.filter(element => element.tagName === 'VIDEO')]);
    // The page-band scan may omit an embedded player. Never discard the
    // owned player together with its overlapping poster.
    return orderMediaElementsByVisualPosition(uniqueElements([...images, ...allVideos, ...pageMedia])
        .filter(element => element.tagName !== 'IMG' ||
            !allVideos.some(video => rectsOverlap(element.getBoundingClientRect(), video.getBoundingClientRect()))));
}
