import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createCatalogMessage,
    createStoredExtensionMessage,
    resolveStoredExtensionLocale
} from '../../src/chrome/package-i18n.js';

function environmentFixture({ options, lastDocumentLocale, chromeLocale = 'zh-TW' } = {}) {
    const requested = [];
    const catalogs = {
        en: {
            htmlLang: { message: 'en' },
            optionsHeading: { message: 'Features & Privacy Settings' },
            settingsLoadFailedStatus: {
                message: 'Failed to load settings: $ERROR$',
                placeholders: { error: { content: '$1' } }
            }
        },
        'zh-TW': {
            htmlLang: { message: 'zh-Hant' },
            optionsHeading: { message: '功能與隱私設定' }
        }
    };
    return {
        requested,
        chrome: {
            i18n: {
                getMessage(key) { return key === 'runtimeLocale' ? chromeLocale : ''; }
            },
            runtime: {
                getURL(path) { requested.push(path); return `chrome-extension://test/${path}`; }
            },
            storage: {
                local: {
                    async get() { return { options, lastDocumentLocale }; }
                }
            }
        },
        async fetch(url) {
            const locale = url.includes('/zh-TW/') ? 'zh-TW' : 'en';
            return { ok: true, async json() { return catalogs[locale]; } };
        }
    };
}

test('stored extension locale uses recent Threads language before Chrome UI language', async () => {
    const environment = environmentFixture({
        options: { languagePreference: 'auto' },
        lastDocumentLocale: 'en',
        chromeLocale: 'zh-TW'
    });
    assert.deepEqual(await resolveStoredExtensionLocale(environment), {
        preference: 'auto',
        locale: 'en'
    });
    const localized = await createStoredExtensionMessage(environment);
    assert.equal(localized.message('optionsHeading'), 'Features & Privacy Settings');
    assert.deepEqual(environment.requested, ['_locales/en/messages.json']);
});

test('manual extension locale overrides recent Threads language', async () => {
    const environment = environmentFixture({
        options: { languagePreference: 'zh-TW' },
        lastDocumentLocale: 'en',
        chromeLocale: 'en'
    });
    const localized = await createStoredExtensionMessage(environment);
    assert.equal(localized.locale, 'zh-TW');
    assert.equal(localized.message('optionsHeading'), '功能與隱私設定');
});

test('catalog messages support Chrome placeholder substitutions', () => {
    const message = createCatalogMessage({
        failure: {
            message: 'Failed: $ERROR$',
            placeholders: { error: { content: '$1' } }
        }
    });
    assert.equal(message('failure', ['boom']), 'Failed: boom');
});
