import { validateMediaUrl } from './media-policy.js';

const NON_SEMANTIC_ROUTE_QUERY_KEYS = new Set(['fbclid', 'igsh', 'igshid', 'share', 'xmt']);
const VOLATILE_MEDIA_QUERY_KEYS = new Set(['bytestart', 'byteend', 'ccb', 'edm', 'efg', 'oh', 'oe', 'stp']);

export function buildMediaRouteKey(urlLike, fallbackBase = globalThis.location?.href || 'https://www.threads.com/') {
    let parsed;
    try {
        parsed = new URL(String(urlLike || fallbackBase), fallbackBase);
    } catch {
        return '';
    }

    const semanticParams = Array.from(parsed.searchParams.entries())
        .filter(([key]) => {
            const normalizedKey = key.toLowerCase();
            return !normalizedKey.startsWith('utm_') && !NON_SEMANTIC_ROUTE_QUERY_KEYS.has(normalizedKey);
        })
        .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
    const query = new URLSearchParams(semanticParams).toString();
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`;
}

export function transitionMediaRouteScope(currentScope, nextRouteKey) {
    if (!currentScope.routeKey) return { ...currentScope, routeKey: nextRouteKey, changed: false };
    if (currentScope.routeKey === nextRouteKey) return { ...currentScope, changed: false };
    return { routeKey: nextRouteKey, changed: true };
}

export function getMediaUrlIdentityAliases(url) {
    const validated = validateMediaUrl(url);
    if (!validated.ok) return [];

    try {
        const parsed = new URL(validated.url);
        const aliases = [];
        const cacheKey = parsed.searchParams.get('ig_cache_key');
        if (cacheKey) aliases.push(`ig:${cacheKey}`);
        const stableParams = Array.from(parsed.searchParams.entries())
            .filter(([key]) => key.toLowerCase() !== 'ig_cache_key')
            .filter(([key]) => !VOLATILE_MEDIA_QUERY_KEYS.has(key.toLowerCase()))
            .filter(([key]) => !key.toLowerCase().startsWith('_nc_'))
            .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
        const canonicalQuery = new URLSearchParams(stableParams).toString();
        const canonicalUrl = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}`;
        aliases.push(`url:${canonicalUrl}${canonicalQuery ? `?${canonicalQuery}` : ''}`);
        return aliases;
    } catch {
        return [];
    }
}

export function getMediaUrlIdentity(url) {
    return getMediaUrlIdentityAliases(url)[0] || '';
}

export function areMediaUrlsEquivalent(firstUrl, secondUrl) {
    const firstAliases = new Set(getMediaUrlIdentityAliases(firstUrl));
    return firstAliases.size > 0 && getMediaUrlIdentityAliases(secondUrl).some((alias) => firstAliases.has(alias));
}

export function mergeMediaUrlCache(currentUrls, nextUrl, limit = 32) {
    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
    const validated = validateMediaUrl(nextUrl);
    if (!validated.ok) return Array.from(currentUrls || []).slice(0, safeLimit);
    return [
        validated.url,
        ...Array.from(currentUrls || []).filter((currentUrl) => !areMediaUrlsEquivalent(currentUrl, validated.url))
    ].slice(0, safeLimit);
}
