import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createMessageFormatter,
    getFirstValidLanguageTag,
    resolvePreferredLocale
} from '../../src/shared/i18n.js';
import { SHARED_UI_MESSAGES } from '../../src/shared/i18n-messages.js';
import { createUserscriptMessage, resolveUserscriptLocale } from '../../src/userscript/i18n.js';

for (const [languages, expected] of [
    [['zh-TW'], 'zh-TW'],
    [['zh-Hant-TW'], 'zh-TW'],
    [['zh-HK'], 'zh-TW'],
    [['zh-MO'], 'zh-TW'],
    [['en-US'], 'en'],
    [['ja-JP'], 'en'],
    [['zh-CN'], 'en'],
    [['zh-Hans'], 'en'],
    [['zh'], 'en'],
    [['en-US', 'zh-TW'], 'en'],
    [[], 'en'],
    [undefined, 'en'],
    [[null, '  ', 'ZH-hant'], 'zh-TW'],
    [['zh-TW-'], 'en'],
    [['zh-Hant--TW'], 'en'],
    [['zh-Hant-!'], 'en'],
    [['zh-TW-', 'zh-HK'], 'zh-TW']
]) {
    test(`locale resolver maps ${JSON.stringify(languages)} to ${expected}`, () => {
        assert.equal(resolvePreferredLocale(languages), expected);
    });
}

test('userscript resolver safely reads navigator preferences and falls back to English', () => {
    assert.equal(resolveUserscriptLocale({ languages: ['zh-TW'], language: 'en-US' }), 'zh-TW');
    assert.equal(resolveUserscriptLocale({ languages: [], language: 'zh-HK' }), 'zh-TW');
    assert.equal(resolveUserscriptLocale(undefined), 'en');
    assert.equal(resolveUserscriptLocale({ get languages() { throw new Error('blocked'); } }), 'en');
});

test('userscript resolver falls back to navigator.language only when languages has no valid tag', () => {
    assert.equal(resolveUserscriptLocale({ languages: [''], language: 'zh-TW' }), 'zh-TW');
    assert.equal(resolveUserscriptLocale({ languages: [null, '  '], language: 'zh-HK' }), 'zh-TW');
    assert.equal(resolveUserscriptLocale({
        get languages() { throw new Error('blocked'); },
        language: 'zh-MO'
    }), 'zh-TW');
    assert.equal(resolveUserscriptLocale({ languages: ['en-US'], language: 'zh-TW' }), 'en');
});

test('language preference scanning skips malformed and hostile entries without throwing', () => {
    const preferences = ['invalid'];
    Object.defineProperty(preferences, 0, { get() { throw new Error('blocked'); } });
    preferences.push('zh-Hant-TW');
    assert.equal(getFirstValidLanguageTag(preferences), 'zh-Hant-TW');
    assert.equal(resolvePreferredLocale(preferences), 'zh-TW');
});

test('catalogs are complete, aligned, non-empty, and immutable', () => {
    const enKeys = Object.keys(SHARED_UI_MESSAGES.en).sort();
    assert.deepEqual(Object.keys(SHARED_UI_MESSAGES['zh-TW']).sort(), enKeys);
    for (const catalog of Object.values(SHARED_UI_MESSAGES)) {
        assert.equal(Object.isFrozen(catalog), true);
        for (const value of Object.values(catalog)) assert.ok(typeof value === 'string' && value.trim());
    }
    assert.equal(Object.isFrozen(SHARED_UI_MESSAGES), true);
    assert.throws(() => { SHARED_UI_MESSAGES.en.enabled = 'changed'; }, TypeError);
});

test('formatter substitutes named values, falls back to English, and marks missing keys', () => {
    const catalogs = Object.freeze({
        en: Object.freeze({ sample: '{filename}:{count}:{index}:{milliseconds}:{state}' }),
        'zh-TW': Object.freeze({})
    });
    const message = createMessageFormatter({ locale: 'zh-TW', catalogs });
    assert.equal(message('sample', {
        filename: 'a.jpg', count: 2, index: 1, milliseconds: 400, state: 'on'
    }), 'a.jpg:2:1:400:on');
    assert.equal(message('absent'), '[missing:absent]');
    assert.equal(Object.isFrozen(message), true);
});

test('userscript message factory produces complete English and Traditional Chinese UI', () => {
    const english = createUserscriptMessage({ languages: ['ja-JP'] });
    const chinese = createUserscriptMessage({ languages: ['zh-TW'] });
    assert.equal(english('copyPostText'), 'Copy Post Text');
    assert.equal(english('preparingDownloads', { count: 3 }), 'Preparing 3 media download(s)...');
    assert.equal(chinese('copyPostText'), '複製這則貼文文字');
    assert.equal(chinese('preparingDownloads', { count: 3 }), '正在準備 3 個媒體下載…');
});
