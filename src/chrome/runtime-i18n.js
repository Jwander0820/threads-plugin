import { DEFAULT_LOCALE, createMessageFormatter } from '../shared/i18n.js';
import { SHARED_UI_MESSAGES } from '../shared/i18n-messages.js';
import { getExtensionMessage } from './i18n.js';

export const CHROME_RUNTIME_LOCALE_MESSAGE_KEY = 'runtimeLocale';

export function resolveChromeRuntimeLocale(chromeApi = globalThis.chrome) {
    const locale = getExtensionMessage(CHROME_RUNTIME_LOCALE_MESSAGE_KEY, undefined, chromeApi);
    return Object.hasOwn(SHARED_UI_MESSAGES, locale) ? locale : DEFAULT_LOCALE;
}

export function createChromeRuntimeMessage(chromeApi = globalThis.chrome) {
    return createMessageFormatter({
        locale: resolveChromeRuntimeLocale(chromeApi),
        catalogs: SHARED_UI_MESSAGES
    });
}
