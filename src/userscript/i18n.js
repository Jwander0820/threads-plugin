import {
    createMessageFormatter,
    getFirstValidLanguageTag,
    resolvePreferredLocale
} from '../shared/i18n.js';
import { SHARED_UI_MESSAGES } from '../shared/i18n-messages.js';

export function resolveUserscriptLocale(navigatorLike) {
    let preferredLanguage = '';
    try {
        preferredLanguage = getFirstValidLanguageTag(navigatorLike?.languages);
    } catch {}
    if (!preferredLanguage) {
        try {
            preferredLanguage = getFirstValidLanguageTag(navigatorLike?.language);
        } catch {}
    }
    return resolvePreferredLocale(preferredLanguage);
}

export function createUserscriptMessage(navigatorLike) {
    return createMessageFormatter({
        locale: resolveUserscriptLocale(navigatorLike),
        catalogs: SHARED_UI_MESSAGES
    });
}
