import assert from 'node:assert/strict';
import test from 'node:test';
import { getRenderedPostText } from '../../src/shared/post-text.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const body = (innerText, controls = [], counters = []) => ({
    innerText,
    getBoundingClientRect: () => rect(0, 0, 320, 64),
    querySelectorAll: (selector) => selector === 'button,[role="button"]' ? controls : counters
});
const control = (innerText) => ({
    innerText,
    getBoundingClientRect: () => rect(240, 40, 80, 24),
    querySelector: () => null
});

test('copy preserves Chinese translation words and fractions in ordinary body text', () => {
    for (const text of [
        '我最喜歡的工作是翻譯', '翻譯', '我想查看翻譯',
        '繁中貼文\n翻譯', 'A word to learn:\nTranslate', '日本語の投稿\n翻訳',
        '今年目標完成比例\n3/4', '我的拍號\n3\n/\n4'
    ]) assert.equal(getRenderedPostText(body(text)), text);
});

test('copy removes actual inline translation controls while retaining identical body words', () => {
    for (const label of ['翻譯', 'Translate', '翻訳', 'Traduire']) {
        assert.equal(getRenderedPostText(body(`本文 ${label}`, [control(label)])), '本文');
        assert.equal(getRenderedPostText(body(`${label}\n${label}`, [control(label)])), label);
    }
    assert.equal(getRenderedPostText(body('我最喜歡的工作是翻譯\n翻譯', [control('翻譯')])), '我最喜歡的工作是翻譯');
});

test('copy removes a verified carousel overlay but preserves an ordinary fraction near media', () => {
    const counter = {
        innerText: '3/4',
        getBoundingClientRect: () => rect(240, 10, 60, 24),
        parentElement: {
            querySelectorAll: () => [{ getBoundingClientRect: () => rect(0, 0, 320, 240) }]
        }
    };
    const element = body('本文\n3/4', [], [counter]);
    assert.equal(getRenderedPostText(element, { getComputedStyle: () => ({ position: 'static' }) }), '本文\n3/4');
    assert.equal(getRenderedPostText(element, { getComputedStyle: () => ({ position: 'absolute' }) }), '本文');
    counter.getBoundingClientRect = () => rect(240, 300, 60, 24);
    assert.equal(getRenderedPostText(element, { getComputedStyle: () => ({ position: 'absolute' }) }), '本文\n3/4');
});

const progressCounts = [
    [1, 2], [2, 2], [1, 12], [12, 12],
    [1, 14], [7, 14], [14, 14],
    [1, 20], [10, 20], [20, 20],
    [1, 31], [15, 31], [31, 31],
    [1, 100], [100, 100]
];

function progressBadge(current, total) {
    const part = (innerText, index) => ({
        tagName: 'SPAN', innerText, children: [], parentElement: null,
        getBoundingClientRect: () => rect(12 + index * 12, 40, innerText.length * 7, 18)
    });
    const slash = part('/', 1);
    const slashWrapper = {
        tagName: 'DIV', innerText: '/', children: [slash], parentElement: null,
        getBoundingClientRect: slash.getBoundingClientRect
    };
    slash.parentElement = slashWrapper;
    const children = [part(String(current), 0), slashWrapper, part(String(total), 2)];
    const badge = {
        tagName: 'DIV',
        innerText: children.map(child => child.innerText).join('\n'),
        children,
        parentElement: null,
        getBoundingClientRect: () => rect(10, 36, Math.max(33.8, (String(current).length + String(total).length + 1) * 7 + 12), 23.8),
        querySelector: () => null,
        querySelectorAll: selector => selector === 'div, span' ? [...children, slash] : []
    };
    children.forEach(child => { child.parentElement = badge; });
    const wrapper = {
        tagName: 'DIV', innerText: badge.innerText, children: [badge], parentElement: null,
        getBoundingClientRect: () => rect(0, 36, 320, 23.8),
        querySelectorAll: selector => selector === 'div, span' ? [badge, ...children, slash] : []
    };
    badge.parentElement = wrapper;
    const window = { getComputedStyle: element => element === badge ? {
        position: 'static', display: 'flex', alignItems: 'center',
        backgroundColor: 'rgb(30, 30, 30)', borderRadius: '12px'
    } : { position: 'relative' } };
    return { badge, wrapper, slash, window };
}

test('copy excludes static split thread progress badges without requiring media', () => {
    for (const [current, total] of progressCounts) {
        const { badge, wrapper, slash, window } = progressBadge(current, total);
        const text = '長篇正文\n我最喜歡的工作是翻譯\n完成比例\n3/4';
        const element = body(`${text}\n${badge.innerText}`, [], [wrapper, badge]);
        wrapper.parentElement = element;
        assert.equal(getRenderedPostText(element, window), text, `${current}/${total}`);
        for (const candidate of [wrapper, badge, ...badge.children, slash]) {
            assert.equal(getRenderedPostText(candidate, window), '', `${current}/${total} ${candidate.tagName}`);
        }
    }
});

test('copy preserves every matching fraction in ordinary body text without badge UI', () => {
    for (const [current, total] of progressCounts) {
        for (const text of [
            `${current}/${total}`,
            `我最喜歡的工作是翻譯\n正文比例\n${current}/${total}`,
            `分行分數也是正文\n${current}\n/\n${total}`
        ]) assert.equal(getRenderedPostText(body(text)), text, `${current}/${total}`);
    }
});

test('copy keeps body fractions when a matching real progress badge follows', () => {
    for (const [current, total] of [[3, 4], ...progressCounts]) {
        const { badge, wrapper, window } = progressBadge(current, total);
        const text = `我最喜歡的工作是翻譯\n正文分數\n${current}\n/\n${total}`;
        const element = body(`${text}\n${badge.innerText}`, [], [wrapper, badge]);
        wrapper.parentElement = element;
        assert.equal(getRenderedPostText(element, window), text, `${current}/${total}`);
    }
});

test('copy excludes a progress badge followed by a real translation control', () => {
    for (const label of ['翻譯', 'Translate', '翻訳']) {
        const { badge, wrapper, window } = progressBadge(1, 2);
        const text = '我最喜歡的工作是翻譯\n正文比例\n3/4';
        const element = body(`${text}\n${badge.innerText}\n${label}`, [control(label)], [wrapper, badge]);
        wrapper.parentElement = element;
        assert.equal(getRenderedPostText(element, window), text);
    }
});

test('copy excludes a real translation control before the progress badge', () => {
    for (const label of ['翻譯', 'Translate', '翻訳', 'Traduire']) {
        const { badge, wrapper, window } = progressBadge(1, 3);
        const text = 'Google Japan Gboard鍵盤新作品XD\nGboard くるくるバージョン';
        const element = body(`${text}\u00a0\u00a0\n${label}\n\u00a0\n${badge.innerText}`, [control(label)], [wrapper, badge]);
        wrapper.parentElement = element;
        assert.equal(getRenderedPostText(element, window), text, label);
    }
});

test('copy cleans both trailing UI orders once while preserving identical body labels and fractions', () => {
    for (const label of ['翻譯', 'Translate', '翻訳', 'Traduire']) {
        for (const order of ['control-first', 'badge-first']) {
            const { badge, wrapper, window } = progressBadge(1, 20);
            for (const text of [`正文比例\n1/20\n3/4\n${label}`, '正文比例\n1\n/\n20']) {
                const suffix = order === 'control-first' ? `${label}\n${badge.innerText}` : `${badge.innerText}\n${label}`;
                const element = body(`${text}\n${suffix}\u00a0 \n`, [control(label)], [wrapper, badge]);
                wrapper.parentElement = element;
                assert.equal(getRenderedPostText(element, window), text, `${order} ${label}`);
            }
        }
    }
});

test('split numbers alone and rounded styling alone do not identify body text as UI', () => {
    const { badge, wrapper } = progressBadge(3, 4);
    const element = body(`正文\n${badge.innerText}`, [], [wrapper, badge]);
    wrapper.parentElement = element;
    assert.equal(getRenderedPostText(element, { getComputedStyle: () => ({ display: 'flex', alignItems: 'center' }) }), element.innerText);
    badge.children = [];
    assert.equal(getRenderedPostText(element, { getComputedStyle: () => ({
        display: 'flex', alignItems: 'center', backgroundColor: 'rgb(30,30,30)', borderRadius: '12px'
    }) }), element.innerText);
});
