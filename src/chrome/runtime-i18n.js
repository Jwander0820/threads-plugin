import {
    DEFAULT_LOCALE,
    createMessageFormatter,
    resolveInterfaceLocale
} from '../shared/i18n.js';
import { SHARED_UI_MESSAGES } from '../shared/i18n-messages.js';
import { getExtensionMessage } from './i18n.js';
import en from '../../extension/_locales/en/messages.json' with { type: 'json' };
import zhTW from '../../extension/_locales/zh_TW/messages.json' with { type: 'json' };

const disclosureCatalog = (catalog) => Object.fromEntries(Object.entries(catalog)
    .filter(([key]) => key.startsWith('disclosure'))
    .map(([key, entry]) => [key, entry.message]));
const DISCLOSURE_MESSAGES = { en: disclosureCatalog(en), 'zh-TW': disclosureCatalog(zhTW) };

export function createChromeDisclosureMessage(chromeApi = globalThis.chrome, context = {}) {
    return createMessageFormatter({
        locale: resolveChromeRuntimeLocale(chromeApi, context),
        catalogs: DISCLOSURE_MESSAGES
    });
}

export const CHROME_RUNTIME_LOCALE_MESSAGE_KEY = 'runtimeLocale';

export function resolveChromeRuntimeLocale(chromeApi = globalThis.chrome, context = {}) {
    const chromeLocale = getExtensionMessage(
        CHROME_RUNTIME_LOCALE_MESSAGE_KEY,
        undefined,
        chromeApi
    );
    const locale = resolveInterfaceLocale({
        preference: context.languagePreference,
        documentLanguage: context.documentLanguage,
        fallbackLanguage: chromeLocale
    });
    return Object.hasOwn(SHARED_UI_MESSAGES, locale) ? locale : DEFAULT_LOCALE;
}

export function createChromeRuntimeMessage(chromeApi = globalThis.chrome, context = {}) {
    return createMessageFormatter({
        locale: resolveChromeRuntimeLocale(chromeApi, context),
        catalogs: SHARED_UI_MESSAGES
    });
}
