import assert from 'node:assert/strict';
import test from 'node:test';

import { getExtensionMessage, localizeDocument } from '../../src/chrome/i18n.js';
import {
    CHROME_RUNTIME_LOCALE_MESSAGE_KEY,
    createChromeRuntimeMessage,
    resolveChromeRuntimeLocale
} from '../../src/chrome/runtime-i18n.js';

test('extension messages use the active Chrome locale and substitutions', () => {
    const calls = [];
    const chromeApi = {
        i18n: {
            getMessage(key, substitutions) {
                calls.push([key, substitutions]);
                return key === 'settingsLoadFailedStatus' ? `Failed: ${substitutions[0]}` : '';
            }
        }
    };
    assert.equal(
        getExtensionMessage('settingsLoadFailedStatus', ['boom'], chromeApi),
        'Failed: boom'
    );
    assert.deepEqual(calls, [['settingsLoadFailedStatus', ['boom']]]);
    assert.equal(getExtensionMessage('missing', undefined, {}), '');
});

test('static pages localize marked text and document language without changing structure', () => {
    const elements = [
        {
            key: 'optionsHeading',
            textContent: '功能與隱私設定',
            getAttribute(name) { return name === 'data-i18n' ? this.key : null; }
        },
        {
            key: 'privacyPolicyLink',
            textContent: '隱私權政策',
            getAttribute(name) { return name === 'data-i18n' ? this.key : null; }
        }
    ];
    const document = {
        documentElement: { lang: 'zh-Hant' },
        querySelectorAll(selector) {
            assert.equal(selector, '[data-i18n]');
            return elements;
        }
    };
    const messages = {
        htmlLang: 'en',
        optionsHeading: 'Features & Privacy Settings',
        privacyPolicyLink: 'Privacy Policy'
    };
    localizeDocument(document, (key) => messages[key] || '');
    assert.equal(document.documentElement.lang, 'en');
    assert.deepEqual(elements.map((element) => element.textContent), [
        'Features & Privacy Settings',
        'Privacy Policy'
    ]);
});

test('Chrome runtime locale is selected through chrome.i18n with English fallback', () => {
    const calls = [];
    const chromeApi = {
        i18n: {
            getMessage(key, substitutions) {
                calls.push([key, substitutions]);
                return 'zh-TW';
            }
        }
    };

    assert.equal(resolveChromeRuntimeLocale(chromeApi), 'zh-TW');
    assert.deepEqual(calls, [[CHROME_RUNTIME_LOCALE_MESSAGE_KEY, undefined]]);
    assert.equal(resolveChromeRuntimeLocale({}), 'en');
    assert.equal(resolveChromeRuntimeLocale({ i18n: { getMessage: () => 'ja' } }), 'en');
    assert.equal(resolveChromeRuntimeLocale({ i18n: { getMessage: () => '__proto__' } }), 'en');
});

test('Chrome runtime translator reuses complete shared English and Traditional Chinese catalogs', () => {
    const chromeApi = (locale) => ({
        i18n: { getMessage: (key) => key === CHROME_RUNTIME_LOCALE_MESSAGE_KEY ? locale : '' }
    });
    const english = createChromeRuntimeMessage(chromeApi('en'));
    const chinese = createChromeRuntimeMessage(chromeApi('zh-TW'));
    const unsupported = createChromeRuntimeMessage(chromeApi('ja'));

    assert.equal(english('copyPostText'), 'Copy Post Text');
    assert.equal(english('downloadStarted', { filename: 'clip.mp4' }), 'Download started: clip.mp4');
    assert.equal(chinese('copyPostText'), '複製這則貼文文字');
    assert.equal(chinese('downloadStarted', { filename: 'clip.mp4' }), '已開始下載：clip.mp4');
    assert.equal(unsupported('openMediaDownloader'), 'Open Threads Media Downloader');
    assert.equal(english('unknownRuntimeKey'), '[missing:unknownRuntimeKey]');
});
