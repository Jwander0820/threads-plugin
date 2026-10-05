import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostTextExtractor } from '../../src/shared/post-text.js';

const rectangle = (top, height, width = 420) => ({
    top, height, width, left: 100, right: 100 + width, bottom: top + height
});

// A small DOM tree, rather than selector-specific result stubs, preserves the
// containment difference between the music control and its sibling lyrics.
function element(tagName, { text = '', attributes = {}, top = 0, height = 24, style = {} } = {}) {
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

function extractor(root) {
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

const captionText = '作者主文\n只想分享這個附件。';
const lyricText = 'Synthetic attachment line one\nSynthetic attachment line two';
const playbackLabels = [
    ['zh play', '播放音樂'], ['zh pause', '暫停音樂'],
    ['en play', 'Play music'], ['en pause', 'Pause music'],
    ['ja play', '音楽を再生'], ['ja pause', '音楽を一時停止']
];

function musicFixture({ label = 'Play music', commonWrapper = false, rootClips = false, fallback = false, shifted = true } = {}) {
    const textAttributes = fallback ? {} : { dir: 'auto' };
    const root = element('article', {
        attributes: { 'data-post-id': 'MAIN_POST' }, top: 40, height: 660,
        style: rootClips ? { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden' } : {}
    });
    const caption = element('span', { text: captionText, attributes: textAttributes, top: 100, height: 64 });
    const card = element('div', {
        top: 190, height: 160,
        style: { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', position: 'relative' }
    });
    const control = element('div', {
        attributes: { role: 'button', 'aria-label': label, tabindex: '0' }, top: 270, height: 48
    });
    control.append(element('span', { text: 'Synthetic song title', attributes: textAttributes, top: 274, height: 20 }));
    control.append(element('span', { text: 'Synthetic artist', attributes: textAttributes, top: 294, height: 20 }));
    const lyricsRegion = element('div', {
        top: shifted ? 90 : 324, height: 96,
        style: shifted ? { transform: 'translateY(-234px)' } : {}
    });
    const lyrics = element('span', {
        text: lyricText, attributes: textAttributes, top: shifted ? 100 : 324, height: 72
    });
    lyricsRegion.append(lyrics);
    card.append(control, lyricsRegion);
    const actionBar = element('div', { top: 600, height: 40 });
    if (commonWrapper) {
        root.append(element('div', { attributes: { dir: 'auto' }, top: 100, height: 250 }).append(caption, card));
    } else {
        root.append(caption, card);
    }
    root.append(actionBar);
    return { root, caption, card, control, lyrics, actionBar };
}

for (const [state, label] of playbackLabels) {
    test(`music sibling lyrics stay excluded after their geometry moves above the control: ${state}`, () => {
        const { root, caption, card, control, lyrics, actionBar } = musicFixture({ label });
        assert.equal(card.contains(control), true);
        assert.equal(card.contains(lyrics), true);
        assert.equal(control.contains(lyrics), false);
        assert.equal(lyrics.closest('[role=button]'), null);
        assert.ok(lyrics.getBoundingClientRect().top < control.getBoundingClientRect().top);
        assert.ok(lyrics.getBoundingClientRect().top < caption.getBoundingClientRect().bottom);
        assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
    });
}

test('a common dir=auto ancestor cannot reintroduce music attachment text', () => {
    const { root, actionBar } = musicFixture({ commonWrapper: true });
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
});

test('fallback text candidates also exclude transformed sibling lyrics', () => {
    const { root, actionBar } = musicFixture({ fallback: true });
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
});

test('clipping on the post root does not turn its whole caption into an attachment', () => {
    const { root, actionBar } = musicFixture({ rootClips: true });
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
});

test('a clipping outer wrapper with an earlier caption is not treated as the music card', () => {
    const { root, caption, card, actionBar } = musicFixture({ commonWrapper: true, shifted: false });
    Object.assign(card.style, { overflow: 'visible', overflowX: 'visible', overflowY: 'visible' });
    Object.assign(card.parentElement.style, { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden' });
    assert.equal(card.parentElement.children[0], caption);
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
});

const clippingStyles = [
    ['both axes clip', { overflow: 'clip', overflowX: 'clip', overflowY: 'clip' }],
    ['only horizontal hidden', { overflow: 'hidden auto', overflowX: 'hidden', overflowY: 'auto' }],
    ['only vertical hidden', { overflow: 'auto hidden', overflowX: 'auto', overflowY: 'hidden' }],
    ['only horizontal clip', { overflow: 'clip visible', overflowX: 'clip', overflowY: 'visible' }],
    ['only vertical clip', { overflow: 'visible clip', overflowX: 'visible', overflowY: 'clip' }]
];

for (const [layout, style] of clippingStyles) {
    test(`music sibling lyrics are excluded with ${layout}`, () => {
        const { root, card, actionBar } = musicFixture();
        Object.assign(card.style, style);
        assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
    });
}

test('the earlier music layout with lyrics below the control still copies only the caption', () => {
    const { root, actionBar } = musicFixture({ shifted: false });
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), captionText);
});

test('song titles, lyric-like prose and Play music in ordinary author text are preserved', () => {
    const text = 'Play music\nSynthetic song title\nSynthetic artist\n這幾句像歌詞，但都是作者寫的本文。\n完成比例\n3/4\n我最喜歡的工作是翻譯';
    const root = element('article', { attributes: { 'data-post-id': 'TEXT_POST' }, top: 40, height: 660 });
    const caption = element('span', { text, attributes: { dir: 'auto' }, top: 100, height: 200 });
    const actionBar = element('div', { top: 600, height: 40 });
    root.append(caption, actionBar);
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), text);
});

test('a nested reply music control cannot truncate its parent caption', () => {
    const { root: reply, card } = musicFixture();
    reply.attributes['data-post-id'] = 'REPLY_POST';
    const root = element('article', { attributes: { 'data-post-id': 'PARENT_POST' }, top: 40, height: 760 });
    const text = 'Parent caption appears below the nested playback control on screen.\nStill parent text.';
    const caption = element('span', { text, attributes: { dir: 'auto' }, top: 320, height: 72 });
    const actionBar = element('div', { top: 700, height: 40 });
    // The synthetic reply owns the control and lyrics, despite their early
    // screen coordinates; parent extraction must use post containment.
    reply.children = [];
    reply.append(card);
    root.append(caption, reply, actionBar);
    assert.equal(extractor(root).extractPostBlockText(root, actionBar), text);
});
