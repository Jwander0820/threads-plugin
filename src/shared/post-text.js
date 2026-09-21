import { parsePostInfoFromUrl } from './post-model.js';

function getRenderedText(element) {
    if (!element) return '';

    return String(element.innerText || '')
        .replace(/\r\n?/g, '\n')
        .replace(/^\n+|\n+$/g, '');
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTrailingInlineUiLabels(element, renderedText = getRenderedText(element)) {
    if (!element || !renderedText) return [];
    const elementRect = element.getBoundingClientRect?.();
    if (!elementRect) return [];

    return Array.from(element.querySelectorAll?.('button,[role="button"]') || [])
        .filter((control) => !control.querySelector?.('svg,img,video,time'))
        .map((control) => ({
            label: getRenderedText(control).trim(),
            rect: control.getBoundingClientRect?.()
        }))
        .filter(({ label, rect }) =>
            label &&
            !label.includes('\n') &&
            label.length <= 64 &&
            rect &&
            rect.width > 0 &&
            rect.width <= 220 &&
            rect.height > 0 &&
            rect.height <= 48 &&
            Math.abs(rect.bottom - elementRect.bottom) <= 6 &&
            new RegExp(`(?:^|\\n)[ \\t\\u00a0]*${escapeRegExp(label)}[ \\t\\u00a0]*$`).test(renderedText)
        )
        .map(({ label }) => label);
}

function stripTrailingCarouselCounter(text) {
    let output = String(text || '');
    const counterPatterns = [
        /\n[ \t\u00a0]*\d+[ \t\u00a0]*\n[ \t\u00a0]*\/[ \t\u00a0]*\n[ \t\u00a0]*\d+[ \t\u00a0]*$/,
        /\n[ \t\u00a0]*\d+[ \t\u00a0]*\/[ \t\u00a0]*\d+[ \t\u00a0]*$/
    ];

    counterPatterns.forEach((pattern) => {
        output = output.replace(pattern, '');
    });

    return output
        .replace(/[ \t\u00a0]+$/g, '')
        .replace(/\n+$/g, '');
}

export function cleanPostTextFragment(text, trailingUiLabels = []) {
    let output = String(text || '').replace(/\r\n?/g, '\n');
    const normalizedUiLabels = Array.from(new Set(
        trailingUiLabels.map((label) => String(label || '').trim()).filter(Boolean)
    )).sort((a, b) => b.length - a.length);

    normalizedUiLabels.forEach((label) => {
        output = output.replace(
            new RegExp(`[ \\t\\u00a0]*(?:\\n[ \\t\\u00a0]*)?${escapeRegExp(label)}[ \\t\\u00a0]*(?:\\n[ \\t\\u00a0]*)*$`),
            ''
        );
    });

    if (normalizedUiLabels.length === 0) {
        output = output
            .replace(/[ \t\u00a0]*(?:\n[ \t\u00a0]*)?(?:翻譯|查看翻譯)[ \t\u00a0]*$/i, '')
            .replace(/[ \t\u00a0]*\n[ \t\u00a0]*(?:Translate|翻訳)[ \t\u00a0]*(?:\n[ \t\u00a0]*)*$/, '');
    }

    output = stripTrailingCarouselCounter(output);

    return output
        .replace(/[ \t\u00a0]+$/g, '')
        .replace(/^\n+|\n+$/g, '');
}

export function getRenderedPostText(element) {
    const renderedText = getRenderedText(element);
    return cleanPostTextFragment(
        renderedText,
        getTrailingInlineUiLabels(element, renderedText)
    );
}

function isThreadsMusicPlaybackControl(element) {
    if (!element?.matches?.('button,[role=button]')) return false;
    const label = String(element.getAttribute?.('aria-label') || '').trim();
    return /^(?:播放|暫停|暂停)音[樂乐]$/.test(label) ||
        /^(?:play|pause)\s+music$/i.test(label) ||
        /^(?:音楽を再生|音楽を一時停止)$/.test(label);
}

function getThreadsMusicAttachmentTop(root) {
    const rootRect = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll('[aria-label]'))
        .filter(isThreadsMusicPlaybackControl)
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => Number.isFinite(rect.top) && rect.bottom > rootRect.top)
        .map((rect) => rect.top)
        .filter((top) => top >= rootRect.top)
        .sort((a, b) => a - b)[0];
}

function isVisibleTextRect(rect) {
    return (
        rect.width > 0 &&
        rect.height > 0
    );
}

/** Extract body text while leaving post ownership and media recognition with the caller. */
export function createPostTextExtractor({
    window,
    minMediaSize,
    injectedUiSelector,
    isDownloadableMedia,
    isInsideNestedPostBlock,
    findBestPostInfoInNode,
    findPostInfoInNode
}) {
    function getPostBlockTextBoundary(root, actionBar) {
        const rootRect = root.getBoundingClientRect();
        const actionTop = actionBar?.getBoundingClientRect?.().top;
        const musicAttachmentTop = getThreadsMusicAttachmentTop(root);
        const mediaTop = Array.from(root.querySelectorAll('img, video'))
            .filter(isDownloadableMedia)
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.width >= minMediaSize && rect.height >= minMediaSize)
            .map((rect) => rect.top)
            .filter((top) => top >= rootRect.top)
            .sort((a, b) => a - b)[0];

        return Math.min(
            Number.isFinite(mediaTop) ? mediaTop : Infinity,
            Number.isFinite(musicAttachmentTop) ? musicAttachmentTop : Infinity,
            Number.isFinite(actionTop) ? actionTop : Infinity,
            rootRect.bottom
        );
    }

    function isPostHeaderMetadataTextElement(element, root) {
        if (!element?.matches?.('[dir="auto"]') || element.closest?.('a[href]')) return false;

        const metadataRow = element.parentElement;
        const headerRow = metadataRow?.previousElementSibling;
        const contentRow = metadataRow?.nextElementSibling;
        if (!metadataRow || !headerRow || !contentRow || !root.contains(metadataRow)) return false;

        const timeElement = headerRow.querySelector?.('time[datetime], time');
        if (!timeElement) return false;

        const metadataColor = String(window.getComputedStyle(element)?.color || '');
        const timeColor = String(window.getComputedStyle(timeElement)?.color || '');
        if (!metadataColor || metadataColor !== timeColor) return false;

        const headerRect = headerRow.getBoundingClientRect?.();
        const metadataRect = metadataRow.getBoundingClientRect?.();
        const contentRect = contentRow.getBoundingClientRect?.();
        return Boolean(
            headerRect && metadataRect && contentRect &&
            metadataRect.top >= headerRect.bottom - 2 &&
            contentRect.top >= metadataRect.bottom - 2
        );
    }

    function isInlinePostHeaderMetadataTextElement(element, root) {
        if (!element?.matches?.('[dir="auto"]')) return false;

        const elementRect = element.getBoundingClientRect?.();
        const elementColor = String(window.getComputedStyle(element)?.color || '');
        if (!elementRect || !elementColor) return false;

        let ancestor = element.parentElement;
        for (let depth = 0; ancestor && ancestor !== root && depth < 6; depth += 1) {
            const ancestorRect = ancestor.getBoundingClientRect?.();
            const timeElement = ancestor.matches?.('time[datetime], time')
                ? ancestor
                : ancestor.querySelector?.('time[datetime], time');
            if (ancestorRect && ancestorRect.height <= 64 && timeElement) {
                const timeRect = timeElement.getBoundingClientRect?.();
                const timeColor = String(window.getComputedStyle(timeElement)?.color || '');
                const overlap = timeRect
                    ? Math.min(elementRect.bottom, timeRect.bottom) - Math.max(elementRect.top, timeRect.top)
                    : 0;
                if (
                    timeColor === elementColor &&
                    overlap >= Math.min(elementRect.height, timeRect?.height || 0) * 0.5
                ) {
                    return true;
                }
            }
            ancestor = ancestor.parentElement;
        }

        return false;
    }

    function isExcludedPostBlockTextElement(element, root, boundaryTop, postInfo) {
        if (!element || !root.contains(element)) return true;
        if (isInsideNestedPostBlock(element, root)) return true;
        if (isPostHeaderMetadataTextElement(element, root)) return true;
        if (isInlinePostHeaderMetadataTextElement(element, root)) return true;
        if (element.closest(injectedUiSelector)) return true;
        const interactiveAncestor = element.closest('button, [role="button"], nav');
        if (interactiveAncestor && interactiveAncestor !== root && root.contains(interactiveAncestor)) return true;

        const enclosingLink = element.closest('a[href]');
        if (enclosingLink && (enclosingLink === element || enclosingLink.contains(element))) {
            const href = enclosingLink.getAttribute('href') || '';
            if (/\/post\//i.test(href)) {
                const linkInfo = parsePostInfoFromUrl(href);
                const belongsToCurrentPost = Boolean(
                    postInfo?.postId &&
                    linkInfo?.postId === postInfo.postId
                );
                if (!belongsToCurrentPost) return true;
            } else if (/\/@[^/]+\/?$|\/search(?:\?|$)/i.test(href)) {
                return true;
            }
        }

        if (element.querySelector('time, video')) return true;
        const containsPostMediaImage = Array.from(element.querySelectorAll('img'))
            .some((image) => {
                const imageRect = image.getBoundingClientRect?.();
                return Boolean(
                    imageRect &&
                    imageRect.width >= minMediaSize &&
                    imageRect.height >= minMediaSize
                );
            });
        if (containsPostMediaImage) return true;

        const rect = element.getBoundingClientRect();
        if (!isVisibleTextRect(rect) || rect.top >= boundaryTop || rect.bottom <= root.getBoundingClientRect().top) return true;

        const text = getRenderedText(element);
        if (!text) return true;
        if (postInfo?.author && text.replace(/^@/, '') === postInfo.author.replace(/^@/, '')) return true;
        if (/^\d[\d,.]*\s*$/.test(text)) return true;
        if (/^\d+\s*(秒|分鐘?|分|小時|天|週|周|個月|月|年)\s*$/.test(text)) return true;

        return false;
    }

    function scorePostBlockTextElement(element, root, boundaryTop) {
        const text = getRenderedText(element);
        const rect = element.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const lineCount = text.split('\n').length;
        const whiteSpace = window.getComputedStyle(element).whiteSpace || '';
        const hasNestedInteractiveContent = Boolean(element.querySelector('button, [role="button"], img, video, time'));
        let score = text.length * 8;

        score += Math.min(lineCount, 20) * 30;
        score += element.matches('[dir="auto"]') ? 420 : 0;
        score += /pre|break-spaces/.test(whiteSpace) ? 220 : 0;
        score += rect.width >= 180 ? 80 : 0;
        score += Math.min(160, Math.max(0, rect.top - rootRect.top) * 0.45);

        if (hasNestedInteractiveContent) score -= 900;
        if (rect.bottom > boundaryTop + 4) score -= 500;
        if (text.length <= 2) score -= 80;

        return score;
    }

    function extractPostBlockText(root, actionBar) {
        if (!root) return '';

        const boundaryTop = getPostBlockTextBoundary(root, actionBar);
        const postInfo = findBestPostInfoInNode(root, actionBar || root, true) ||
            findPostInfoInNode(root);
        const collectCandidates = (elements) => elements
            .filter((element) => !isExcludedPostBlockTextElement(element, root, boundaryTop, postInfo))
            .map((element) => ({
                element,
                text: getRenderedPostText(element),
                rect: element.getBoundingClientRect(),
                score: scorePostBlockTextElement(element, root, boundaryTop)
            }))
            .filter((item) => item.text)
            .sort((a, b) => b.score - a.score);
        let candidates = collectCandidates(Array.from(root.querySelectorAll('[dir="auto"]')));

        if (candidates.length === 0) {
            candidates = collectCandidates(Array.from(root.querySelectorAll('p, div, span')));
        }

        const orderedCandidates = candidates
            .filter((item) => !candidates.some((other) =>
                other !== item &&
                item.element.contains(other.element) &&
                other.text === item.text
            ))
            .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
        const fragments = [];

        orderedCandidates.forEach((item) => {
            const text = item.text;
            if (!text) return;
            if (fragments.some((fragment) => fragment === text || fragment.includes(text))) return;

            for (let index = fragments.length - 1; index >= 0; index -= 1) {
                if (text.includes(fragments[index])) {
                    fragments.splice(index, 1);
                }
            }
            fragments.push(text);
        });

        return stripTrailingCarouselCounter(fragments.join('\n'));
    }

    return { extractPostBlockText, getPostBlockTextBoundary };
}
