// Shared small DOM tree for post-text extractor tests. Real containment and
// sibling relationships matter more here than selector-specific stubs.
import { createPostTextExtractor } from '../../src/shared/post-text.js';

export const rectangle = (top, height, width = 420) => ({
    top, height, width, left: 100, right: 100 + width, bottom: top + height
});

// A small DOM tree, rather than selector-specific result stubs, preserves the
// containment difference between the music control and its sibling lyrics.
export function element(tagName, { text = '', attributes = {}, top = 0, height = 24, style = {} } = {}) {
    const node = {
        nodeType: 1,
        tagName: tagName.toUpperCase(),
        attributes,
        style,
        children: [],
        parentElement: null,
        get innerText() { return [text, ...this.children.map(child => child.innerText)].filter(Boolean).join('\n'); },
        get textContent() { return this.innerText; },
        get previousElementSibling() {
            const siblings = this.parentElement?.children || [];
            return siblings[siblings.indexOf(this) - 1] || null;
        },
        get nextElementSibling() {
            const siblings = this.parentElement?.children || [];
            return siblings[siblings.indexOf(this) + 1] || null;
        },
        getAttribute(name) { return attributes[name] ?? null; },
        hasAttribute(name) { return Object.hasOwn(attributes, name); },
        getBoundingClientRect() { return rectangle(top, height); },
        append(...children) {
            children.forEach(child => { child.parentElement = this; this.children.push(child); });
            return this;
        },
        contains(candidate) {
            return this === candidate || this.children.some(child => child.contains(candidate));
        },
        matches(selector) {
            return selector.split(',').some(part => {
                const match = part.trim().match(/^([a-z]+)?(?:\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\])?$/i);
                if (!match || (!match[1] && !match[2])) return false;
                return (!match[1] || this.tagName === match[1].toUpperCase()) &&
                    (!match[2] || (this.hasAttribute(match[2]) &&
                        (match[3] === undefined || this.getAttribute(match[2]) === match[3])));
            });
        },
        closest(selector) {
            for (let current = this; current; current = current.parentElement) {
                if (current.matches(selector)) return current;
            }
            return null;
        },
        querySelectorAll(selector) {
            const descendants = [];
            const visit = parent => parent.children.forEach(child => {
                if (child.matches(selector)) descendants.push(child);
                visit(child);
            });
            visit(this);
            return descendants;
        },
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    };
    return node;
}

export function extractor(root) {
    const postInfo = { author: 'fixture_author', postId: root.getAttribute('data-post-id') };
    return createPostTextExtractor({
        window: {
            getComputedStyle: node => ({
                whiteSpace: 'pre-wrap', display: 'block', position: 'static',
                overflow: 'visible', overflowX: 'visible', overflowY: 'visible',
                color: 'rgb(20, 20, 20)', ...node.style
            })
        },
        minMediaSize: 96,
        injectedUiSelector: '[data-injected-ui]',
        isDownloadableMedia: () => false,
        isInsideNestedPostBlock: node => {
            const owner = node.closest('[data-post-id]');
            return Boolean(owner && owner !== root);
        },
        findBestPostInfoInNode: () => postInfo,
        findPostInfoInNode: () => postInfo
    });
}
