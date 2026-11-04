import assert from 'node:assert/strict';
import test from 'node:test';
import { element, extractor } from './post-text-dom-fixture.mjs';

const metadataColor = { color: 'rgb(119, 119, 119)' };
const bodyColor = { color: 'rgb(243, 245, 247)' };
const translatedBody = '這是組織失敗 快逃';

// Mirrors the signed-in automatic translation layout observed on Threads:
// the attribution row is the last child of the author block, so the body is
// the next sibling of that block rather than of the attribution row.
function translatedPostFixture({ attribution, separator = '·', toggle, metadataStyle = metadataColor } = {}) {
    const root = element('article', { attributes: { 'data-post-id': 'MAIN_POST' }, top: 40, height: 400 });
    const authorBlock = element('div', { top: 92, height: 44 });
    const authorRow = element('div', { top: 92, height: 21 });
    authorRow.append(
        element('a', { attributes: { href: '/@fixture_author' }, top: 92, height: 21 })
            .append(element('span', { text: 'fixture_author', attributes: { dir: 'auto' }, top: 92, height: 21 })),
        element('span', { attributes: { dir: 'auto' }, top: 96, height: 14, style: metadataColor })
            .append(element('a', { attributes: { href: '/@fixture_author/post/MAIN_POST' }, top: 93, height: 19 })
                .append(element('time', { text: '12小時', top: 96, height: 14, style: metadataColor })))
    );
    const attributionRow = element('div', { top: 117, height: 17, style: { display: 'flex' } });
    attributionRow.append(
        element('span', { text: attribution, attributes: { dir: 'auto' }, top: 117, height: 17, style: metadataStyle }),
        element('span', { text: separator, attributes: { dir: 'auto' }, top: 117, height: 17, style: metadataStyle }),
        element('div', { attributes: { role: 'button', tabindex: '0' }, top: 117, height: 17 })
            .append(element('span', { text: toggle, attributes: { dir: 'auto' }, top: 117, height: 17, style: metadataStyle })),
        element('a', { attributes: { href: '/settings/translation', 'aria-label': 'translation settings' }, top: 114, height: 24 })
    );
    authorBlock.append(authorRow, attributionRow);
    const body = element('div', { top: 140, height: 40 })
        .append(element('span', { text: translatedBody, attributes: { dir: 'auto' }, top: 140, height: 21, style: bodyColor }));
    const actionBar = element('div', { top: 360, height: 40 });
    root.append(authorBlock, body, actionBar);
    return { root, actionBar };
}

const attributionLabels = [
    ['Traditional Chinese', '原文：英文', '查看原文'],
    ['English', 'Translated from Chinese', 'See original'],
    ['Japanese', '翻訳元：英語', '原文を表示']
];

for (const [locale, attribution, toggle] of attributionLabels) {
    test(`copy excludes the automatic translation attribution row nested in the author block: ${locale}`, () => {
        const { root, actionBar } = translatedPostFixture({ attribution, toggle });
        assert.equal(extractor(root).extractPostBlockText(root, actionBar), translatedBody);
    });
}

test('a body-colored line at the end of the author block is not treated as metadata', () => {
    const { root, actionBar } = translatedPostFixture({
        attribution: '原文：英文',
        toggle: '查看原文',
        metadataStyle: bodyColor
    });
    assert.equal(
        extractor(root).extractPostBlockText(root, actionBar),
        `原文：英文\n·\n${translatedBody}`
    );
});
