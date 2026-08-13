import { buildMediaRouteKey } from './route-media-state.js';

export const NETWORK_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

export const CAPTURE_OPERATION_ALLOWLIST = Object.freeze([
    'BarcelonaFeedQuery',
    'BarcelonaFollowingFeedQuery',
    'BarcelonaForYouFeedQuery',
    'BarcelonaPostPageCommentsQuery',
    'BarcelonaPostPageQuery',
    'BarcelonaProfileRepliesTabQuery',
    'BarcelonaProfileThreadsTabQuery',
    'BarcelonaSearchQuery',
    'BarcelonaThreadQuery',
    'BarcelonaTimelineQuery'
]);
const INSPECTABLE_NETWORK_OPERATIONS = new Set(CAPTURE_OPERATION_ALLOWLIST);
const CAPTURE_HOSTS = new Set([
    'threads.com', 'www.threads.com', 'threads.net', 'www.threads.net',
    'instagram.com', 'www.instagram.com'
]);

function defaultPageUrl() {
    return globalThis.location?.href || 'https://www.threads.com/';
}

export function isSensitiveThreadsRoute(urlLike, baseUrl = defaultPageUrl()) {
    try {
        const parsed = new URL(String(urlLike || baseUrl), baseUrl);
        let pathname = parsed.pathname;
        for (let pass = 0; pass < 8; pass += 1) {
            const decoded = decodeURIComponent(pathname);
            if (decoded === pathname) break;
            pathname = decoded;
        }
        if (/%[0-9a-f]{2}/i.test(pathname)) return true;

        const canonicalSegments = [];
        pathname.replace(/\\/g, '/').split('/').forEach((segment) => {
            if (!segment || segment === '.') return;
            if (segment === '..') {
                canonicalSegments.pop();
                return;
            }
            canonicalSegments.push(segment);
        });
        const canonicalPathname = '/' + canonicalSegments.join('/');
        return /^\/(?:accounts?|challenge|direct|inbox|login|messages?|oauth|privacy|security|settings|two_factor)(?:\/|$)/i
            .test(canonicalPathname);
    } catch {
        return true;
    }
}

export function isKnownCaptureEndpoint(urlLike, baseUrl = defaultPageUrl()) {
    try {
        const parsed = new URL(String(urlLike || ''), baseUrl);
        return parsed.protocol === 'https:' &&
            (!parsed.port || parsed.port === '443') &&
            CAPTURE_HOSTS.has(parsed.hostname.toLowerCase()) &&
            ['/api/graphql', '/graphql/query'].includes(parsed.pathname.replace(/\/$/, ''));
    } catch {
        return false;
    }
}

export function getHeaderValue(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    if (typeof headers === 'string') {
        const normalizedName = String(name || '').toLowerCase();
        const headerLine = headers.split(/\r?\n/).find((line) => {
            const separatorIndex = line.indexOf(':');
            return separatorIndex > 0 && line.slice(0, separatorIndex).trim().toLowerCase() === normalizedName;
        });
        return headerLine ? headerLine.slice(headerLine.indexOf(':') + 1).trim() : '';
    }
    if (Array.isArray(headers)) {
        return headers.find(([key]) => String(key).toLowerCase() === name.toLowerCase())?.[1] || '';
    }
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : '';
}

function getOperationsFromBody(body) {
    if (!body) return [];
    const operations = new Set();
    const addOperations = (getValues) => {
        ['fb_api_req_friendly_name', 'operationName', 'operation_name'].forEach((key) => {
            const rawValues = getValues(key);
            const values = Array.isArray(rawValues) ? rawValues : [rawValues];
            values.filter(Boolean).forEach((value) => operations.add(String(value)));
        });
    };
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        addOperations((key) => body.getAll(key));
        return Array.from(operations);
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
        addOperations((key) => body.getAll(key));
        return Array.from(operations);
    }
    if (typeof body === 'object' &&
        !(typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) &&
        !(typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body))) {
        addOperations((key) => body[key]);
        return Array.from(operations);
    }
    if (typeof body !== 'string') return [];
    try {
        const params = new URLSearchParams(body);
        addOperations((key) => params.getAll(key));
    } catch { /* JSON is attempted below. */ }
    try {
        const parsed = JSON.parse(body);
        addOperations((key) => parsed?.[key]);
    } catch { /* URL-encoded bodies were attempted above. */ }
    return Array.from(operations);
}

export function classifyNetworkCaptureRequest({ url, method = 'GET', headers, body, routeUrl }) {
    const pageUrl = routeUrl || defaultPageUrl();
    if (isSensitiveThreadsRoute(pageUrl)) return { allowed: false, reason: 'sensitive_route' };
    if (!isKnownCaptureEndpoint(url, pageUrl)) return { allowed: false, reason: 'unknown_endpoint' };
    if (!['GET', 'POST'].includes(String(method || 'GET').toUpperCase())) {
        return { allowed: false, reason: 'method_not_allowed' };
    }

    let parsed;
    try {
        parsed = new URL(String(url), pageUrl);
    } catch {
        return { allowed: false, reason: 'invalid_url' };
    }
    const declaredOperations = new Set();
    const addDeclaredOperation = (value) => {
        const values = Array.isArray(value) ? value : [value];
        values.filter(Boolean).forEach((item) => {
            String(item).split(',').map((part) => part.trim()).filter(Boolean)
                .forEach((part) => declaredOperations.add(part));
        });
    };
    ['fb_api_req_friendly_name', 'operationName', 'operation_name'].forEach((key) =>
        addDeclaredOperation(parsed.searchParams.getAll(key))
    );
    addDeclaredOperation(getHeaderValue(headers, 'x-fb-friendly-name'));
    addDeclaredOperation(getOperationsFromBody(body));
    if (declaredOperations.size !== 1) {
        return {
            allowed: false,
            reason: declaredOperations.size === 0 ? 'unknown_operation' : 'operation_conflict',
            operation: Array.from(declaredOperations).join(',')
        };
    }
    const [operation] = declaredOperations;
    if (!INSPECTABLE_NETWORK_OPERATIONS.has(operation)) {
        return { allowed: false, reason: 'unknown_operation', operation };
    }
    return {
        allowed: true,
        reason: '',
        operation: String(operation),
        requestUrl: parsed.href,
        sourceRouteKey: buildMediaRouteKey(pageUrl)
    };
}

export function isInspectableResponseMime(contentType) {
    const baseType = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
    return baseType === 'application/json' || baseType.endsWith('+json') || baseType === 'text/plain';
}

function getContentLength(headers) {
    const value = Number(getHeaderValue(headers, 'content-length'));
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function getBoundedResponseMaxBytes(configuredMaxBytes) {
    // Callers can choose a stricter local ceiling, but never weaken the
    // security-reviewed 2 MiB response limit.
    return Math.min(
        NETWORK_RESPONSE_MAX_BYTES,
        Math.max(1, Number(configuredMaxBytes) || NETWORK_RESPONSE_MAX_BYTES)
    );
}

export function utf8ByteLength(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(String(text || '')).byteLength;
    return unescape(encodeURIComponent(String(text || ''))).length;
}

function getJsonStringByteLength(value, limit = Number.MAX_SAFE_INTEGER) {
    const text = String(value);
    let bytes = 2;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code === 0x22 || code === 0x5c) bytes += 2;
        else if (code <= 0x1f) bytes += 6;
        else if (code <= 0x7f) bytes += 1;
        else if (code <= 0x7ff) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
            const nextCode = text.charCodeAt(index + 1);
            if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
                bytes += 4;
                index += 1;
            } else bytes += 6;
        } else if (code >= 0xdc00 && code <= 0xdfff) bytes += 6;
        else bytes += 3;
        if (bytes > limit) return bytes;
    }
    return bytes;
}

function isJsonValueWithinByteLimit(rootValue, maxBytes) {
    let remaining = maxBytes;
    let nodeCount = 0;
    const visited = new WeakSet();
    const stack = [rootValue];
    const consume = (bytes) => ((remaining -= bytes) >= 0);
    while (stack.length > 0) {
        const value = stack.pop();
        if (value === null) { if (!consume(4)) return false; continue; }
        const valueType = typeof value;
        if (valueType === 'string') { if (!consume(getJsonStringByteLength(value, remaining))) return false; continue; }
        if (valueType === 'number') { if (!consume(Number.isFinite(value) ? String(value).length : 4)) return false; continue; }
        if (valueType === 'boolean') { if (!consume(value ? 4 : 5)) return false; continue; }
        if (valueType !== 'object' || visited.has(value) || typeof value.toJSON === 'function') return false;
        visited.add(value);
        if (++nodeCount > 50000) return false;
        if (Array.isArray(value)) {
            if (!consume(2 + Math.max(0, value.length - 1))) return false;
            for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index]);
            continue;
        }
        let keys;
        try { keys = Object.keys(value); } catch { return false; }
        if (!consume(2 + Math.max(0, keys.length - 1))) return false;
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            const key = keys[index];
            if (!consume(getJsonStringByteLength(key, remaining) + 1)) return false;
            try { stack.push(value[key]); } catch { return false; }
        }
    }
    return true;
}

function captureMayContinue(options) {
    if (options?.signal?.aborted) return false;
    return typeof options?.shouldContinue !== 'function' || options.shouldContinue() === true;
}

function cancelWithoutWaiting(target, reason) {
    try {
        Promise.resolve(target?.cancel?.(reason)).catch(() => {});
    } catch { /* Cancellation is best effort. */ }
}

function createAbortRace(signal, onAbort) {
    if (!signal) return null;
    let abort;
    const promise = new Promise((_, reject) => {
        abort = () => {
            onAbort?.();
            reject(new Error('capture_stopped'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    });
    return {
        promise,
        dispose() { signal.removeEventListener?.('abort', abort); }
    };
}

async function readFetchResponseTextLimited(response, maxBytes, options) {
    if (!captureMayContinue(options)) throw new Error('capture_stopped');
    const clone = response.clone();
    const reader = clone.body?.getReader?.();
    if (!reader) {
        const textPromise = clone.text();
        const abortRace = createAbortRace(options?.signal, () => cancelWithoutWaiting(clone.body, 'capture_stopped'));
        try {
            const text = abortRace ? await Promise.race([textPromise, abortRace.promise]) : await textPromise;
            if (!captureMayContinue(options)) throw new Error('capture_stopped');
            if (utf8ByteLength(text) > maxBytes) throw new Error('response_too_large');
            return text;
        } finally {
            abortRace?.dispose();
        }
    }
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let output = '';
    const abortRace = createAbortRace(options?.signal, () => cancelWithoutWaiting(reader, 'capture_stopped'));
    try {
        while (true) {
            if (!captureMayContinue(options)) {
                cancelWithoutWaiting(reader, 'capture_stopped');
                throw new Error('capture_stopped');
            }
            const readResult = reader.read();
            const { done, value } = abortRace
                ? await Promise.race([readResult, abortRace.promise])
                : await readResult;
            if (!captureMayContinue(options)) {
                cancelWithoutWaiting(reader, 'capture_stopped');
                throw new Error('capture_stopped');
            }
            if (done) break;
            totalBytes += value?.byteLength || 0;
            if (totalBytes > maxBytes) {
                cancelWithoutWaiting(reader, 'response_too_large');
                throw new Error('response_too_large');
            }
            output += decoder.decode(value, { stream: true });
        }
        return output + decoder.decode();
    } finally {
        abortRace?.dispose();
    }
}

export async function inspectResponse(response, captureContext, options = {}) {
    if (!captureMayContinue(options)) return false;
    if (!captureContext?.allowed || !response || typeof response.clone !== 'function') return false;
    if (response.url && !isKnownCaptureEndpoint(response.url)) return false;
    if (response.status < 200 || response.status >= 300) return false;
    if (!isInspectableResponseMime(response.headers?.get?.('content-type') || '')) return false;
    const maxBytes = getBoundedResponseMaxBytes(options.maxBytes);
    const contentLength = getContentLength(response.headers);
    if (contentLength !== null && contentLength > maxBytes) return false;
    try {
        const text = await readFetchResponseTextLimited(response, maxBytes, options);
        if (!captureMayContinue(options)) return false;
        options.extractor?.(text, captureContext.sourceRouteKey);
        return true;
    } catch {
        return false;
    }
}

async function readXhrResponseText(xhr, maxBytes, options) {
    if (!captureMayContinue(options)) return null;
    const responseType = String(xhr.responseType || '').toLowerCase();
    let text;
    if (responseType === '' || responseType === 'text') {
        try { text = xhr.responseText; } catch { return null; }
    } else if (responseType === 'json') {
        if (!isJsonValueWithinByteLimit(xhr.response, maxBytes)) return null;
        try { text = JSON.stringify(xhr.response); } catch { return null; }
    } else if (responseType === 'blob') {
        const blob = xhr.response;
        if (!blob || blob.size > maxBytes || typeof blob.text !== 'function') return null;
        text = await blob.text();
    } else if (responseType === 'arraybuffer') {
        const buffer = xhr.response;
        if (!buffer || typeof buffer.byteLength !== 'number' || buffer.byteLength > maxBytes) return null;
        text = new TextDecoder().decode(buffer);
    } else return null;
    if (!captureMayContinue(options)) return null;
    return typeof text === 'string' && text.length <= maxBytes && utf8ByteLength(text) <= maxBytes ? text : null;
}

export async function inspectXhrResponse(xhr, captureContext, options = {}) {
    if (!captureMayContinue(options)) return false;
    if (!captureContext?.allowed) return false;
    if (xhr.responseURL && !isKnownCaptureEndpoint(xhr.responseURL)) return false;
    if (Number(xhr.status) < 200 || Number(xhr.status) >= 300) return false;
    if (!isInspectableResponseMime(xhr.getResponseHeader?.('content-type') || '')) return false;
    const maxBytes = getBoundedResponseMaxBytes(options.maxBytes);
    const declaredLength = Number(xhr.getResponseHeader?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return false;
    try {
        const text = await readXhrResponseText(xhr, maxBytes, options);
        if (text === null || !captureMayContinue(options)) return false;
        options.extractor?.(text, captureContext.sourceRouteKey);
        return true;
    } catch {
        return false;
    }
}
