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
            new RegExp(`${escapeRegExp(label)}[ \\t\\u00a0]*$`).test(renderedText)
        )
        .map(({ label }) => label);
}

function isThreadProgressBadge(element, window) {
    const label = getRenderedText(element).trim();
    const numbers = label.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!numbers || Number(numbers[1]) < 1 || Number(numbers[1]) > Number(numbers[2])) return false;

    // Threads appends a static, rounded flex badge to long post text. Its
    // numerator, slash wrapper and denominator are separate DOM children;
    // neither an ordinary body fraction nor a media overlay has this shape.
    const parts = Array.from(element.children || []).map(child => getRenderedText(child).trim());
    if (parts.length !== 3 || parts[0] !== numbers[1] || parts[1] !== '/' || parts[2] !== numbers[2]) return false;
    if (element.querySelector?.('button,[role="button"],a,img,video,svg,time')) return false;

    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.width > 120 || rect.height <= 0 || rect.height > 48) return false;
    const style = window?.getComputedStyle?.(element);
    if (!style || !/^(?:inline-)?flex$/.test(style.display) || style.alignItems !== 'center') return false;
    const background = String(style.backgroundColor || '').trim();
    const transparent = /^(?:transparent|rgba\([^)]*,\s*0(?:\.0+)?\)|rgb\([^)]*\/\s*0(?:\.0+)?\))$/i;
    return Boolean(background && !transparent.test(background) &&
        parseFloat(style.borderRadius) >= rect.height / 4);
}

function isInsideThreadProgressBadge(element, window) {
    // Also exclude independently selected [dir=auto] wrappers or badge parts,
    // so candidate merging cannot add the counter back after body cleanup.
    for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
        if (isThreadProgressBadge(node, window)) return true;
    }
    return false;
}

function getTrailingCounterUiLabels(element, renderedText, window) {
    // Fractions require UI evidence: a thread progress badge or an actual,
    // compact overlay on media. Never remove a plain-text fraction by itself.
    return [element, ...Array.from(element?.querySelectorAll?.('div, span') || [])].filter((counter) => {
        const label = getRenderedText(counter).trim();
        if (!/^\d+\s*\/\s*\d+$/.test(label) || !renderedText.trimEnd().endsWith(label)) return false;
        if (isThreadProgressBadge(counter, window)) return true;
        if (window?.getComputedStyle?.(counter)?.position !== 'absolute') return false;
        const rect = counter.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.width > 120 || rect.height <= 0 || rect.height > 64) return false;
        const media = counter.parentElement?.querySelectorAll?.('img, video') || [];
        return Array.from(media).some((item) => {
            const mediaRect = item.getBoundingClientRect?.();
            return mediaRect && mediaRect.width >= 96 && mediaRect.height >= 96 &&
                rect.left >= mediaRect.left && rect.right <= mediaRect.right &&
                rect.top >= mediaRect.top && rect.bottom <= mediaRect.bottom;
        });
    }).map((counter) => getRenderedText(counter).trim());
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

    return output
        .replace(/[ \t\u00a0]+$/g, '')
        .replace(/^\n+|\n+$/g, '');
}

export function getRenderedPostText(element, window = globalThis.window) {
    if (isInsideThreadProgressBadge(element, window)) return '';
    const renderedText = getRenderedText(element);
    // Either UI can be last: peel a verified trailing counter first when present.
    // Each UI type is removed once, so an identical body label/fraction survives.
    const counterLabels = getTrailingCounterUiLabels(element, renderedText, window);
    if (counterLabels.length > 0) {
        const bodyText = cleanPostTextFragment(renderedText, counterLabels);
        return cleanPostTextFragment(bodyText, getTrailingInlineUiLabels(element, bodyText));
    }
    const bodyText = cleanPostTextFragment(renderedText, getTrailingInlineUiLabels(element, renderedText));
    return cleanPostTextFragment(
        bodyText,
        getTrailingCounterUiLabels(element, bodyText, window)
    );
}

function isThreadsMusicPlaybackControl(element) {
    if (!element?.matches?.('button,[role=button]')) return false;
    const label = String(element.getAttribute?.('aria-label') || '').trim();
    return /^(?:播放|暫停|暂停)音[樂乐]$/.test(label) ||
        /^(?:play|pause)\s+music$/i.test(label) ||
        /^(?:音楽を再生|音楽を一時停止)$/.test(label);
}

function getThreadsMusicAttachmentTop(root, attachments) {
    const rootRect = root.getBoundingClientRect();
    return attachments
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
    function getMusicAttachments(root) {
        return Array.from(root.querySelectorAll('[aria-label]'))
            .filter(isThreadsMusicPlaybackControl)
            .filter((control) => !isInsideNestedPostBlock(control, root))
            .map((control) => {
                // The playback row and the clipped/scrolled lyrics are siblings
                // in one card. Descendant rectangles can extend above that card,
                // so screen position alone cannot identify attachment text.
                for (let parent = control.parentElement; parent && parent !== root; parent = parent.parentElement) {
                    if (!root.contains(parent)) break;
                    const firstChild = parent.children?.[0];
                    // Stop before a wrapper whose earlier branch holds caption
                    // text or post metadata, even if that wrapper also clips.
                    if (firstChild && !firstChild.contains(control)) break;
                    if (Array.from(parent.childNodes || []).some(node => node.nodeType === 3 && node.textContent.trim())) break;
                    const style = window?.getComputedStyle?.(parent);
                    if (!parent.matches?.('button,[role=button]') &&
                        [style?.overflow, style?.overflowX, style?.overflowY]
                            .some(value => /^(?:hidden|clip)$/.test(value))) {
                        return parent;
                    }
                }
                return control;
            });
    }

    function getPostBlockTextBoundary(root, actionBar, musicAttachments = getMusicAttachments(root)) {
        const rootRect = root.getBoundingClientRect();
        const actionTop = actionBar?.getBoundingClientRect?.().top;
        const musicAttachmentTop = getThreadsMusicAttachmentTop(root, musicAttachments);
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

    function isExcludedPostBlockTextElement(element, root, boundaryTop, postInfo, musicAttachments) {
        if (!element || !root.contains(element)) return true;
        if (isInsideNestedPostBlock(element, root)) return true;
        if (musicAttachments.some(attachment => attachment.contains?.(element) ||
            (isThreadsMusicPlaybackControl(attachment) && element.contains(attachment)))) return true;
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

        const isOutsideMusicAttachment = node => !musicAttachments.some(attachment => attachment.contains?.(node));
        // Music cards include an internal (often hidden) video. That media must
        // not reject a shared wrapper before its caption branches are read.
        if (element.querySelector('time, video') &&
            (musicAttachments.length === 0 || Array.from(element.querySelectorAll('time, video')).some(isOutsideMusicAttachment))) return true;
        const containsPostMediaImage = Array.from(element.querySelectorAll('img'))
            .filter(isOutsideMusicAttachment)
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

    function getPostBodyText(element, musicAttachments) {
        if (!musicAttachments.some(attachment => element.contains(attachment))) {
            return getRenderedPostText(element, window);
        }

        // A caption may be a direct text node or inline markup in the same
        // wrapper as the card. Read only its non-attachment branches instead
        // of dropping that whole wrapper or merging its full innerText later.
        function readCaption(node) {
            if (node.nodeType === 3) {
                const text = String(node.textContent || '');
                const whiteSpace = window.getComputedStyle(node.parentElement)?.whiteSpace;
                return /^(?:normal|nowrap)$/.test(whiteSpace) ? text.replace(/\s+/g, ' ') : text;
            }
            if (musicAttachments.some(attachment => attachment.contains?.(node))) return '';
            if (node.matches?.('button,[role=button],nav') || node.closest?.(injectedUiSelector)) return '';
            if (!musicAttachments.some(attachment => node.contains?.(attachment))) {
                return getRenderedPostText(node, window);
            }

            let text = '';
            for (const child of Array.from(node.childNodes || node.children || [])) {
                const fragment = readCaption(child);
                if (!fragment) continue;
                const display = child.nodeType === 1 ? window.getComputedStyle(child)?.display : '';
                const block = /^(?:block|flow-root|flex|grid|list-item|table(?:-.+)?)$/.test(display);
                if (block && text && !text.endsWith('\n')) text += '\n';
                text += fragment;
                if (block && !text.endsWith('\n')) text += '\n';
            }
            return text;
        }

        return cleanPostTextFragment(readCaption(element));
    }

    function scorePostBlockTextElement(element, root, boundaryTop, text) {
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

        const musicAttachments = getMusicAttachments(root);
        const boundaryTop = getPostBlockTextBoundary(root, actionBar, musicAttachments);
        const postInfo = findBestPostInfoInNode(root, actionBar || root, true) ||
            findPostInfoInNode(root);
        const collectCandidates = (elements) => elements
            .filter((element) => !isExcludedPostBlockTextElement(element, root, boundaryTop, postInfo, musicAttachments))
            .map((element) => {
                const text = getPostBodyText(element, musicAttachments);
                return {
                    element,
                    text,
                    rect: element.getBoundingClientRect(),
                    score: scorePostBlockTextElement(element, root, boundaryTop, text)
                };
            })
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

        return fragments.join('\n');
    }

    return { extractPostBlockText, getPostBlockTextBoundary };
}
