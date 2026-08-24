import {
    DEFAULT_LOCALE,
    createMessageFormatter,
    resolveInterfaceLocale
} from '../shared/i18n.js';
import { SHARED_UI_MESSAGES } from '../shared/i18n-messages.js';
import { getExtensionMessage } from './i18n.js';

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
