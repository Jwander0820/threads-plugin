import assert from 'node:assert/strict';
import test from 'node:test';

import { getExtensionMessage, localizeDocument } from '../../src/chrome/i18n.js';

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
