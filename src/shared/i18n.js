export const DEFAULT_LOCALE = 'en';
export const TRADITIONAL_CHINESE_LOCALE = 'zh-TW';

const TRADITIONAL_CHINESE_TAG = /^zh-(?:tw|hant|hk|mo)(?:-|$)/i;
const WELL_FORMED_LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

export function getFirstValidLanguageTag(languagePreferences) {
    const preferences = Array.isArray(languagePreferences)
        ? languagePreferences
        : [languagePreferences];
    let length;
    try {
        length = preferences.length;
    } catch {
        return '';
    }

    for (let index = 0; index < length; index += 1) {
        let tag;
        try {
            tag = String(preferences[index] ?? '').trim();
        } catch {
            continue;
        }
        if (WELL_FORMED_LANGUAGE_TAG.test(tag)) return tag;
    }
    return '';
}

export function resolvePreferredLocale(languagePreferences) {
    const first = getFirstValidLanguageTag(languagePreferences);

    return first && TRADITIONAL_CHINESE_TAG.test(first)
        ? TRADITIONAL_CHINESE_LOCALE
        : DEFAULT_LOCALE;
}

export function createMessageFormatter({ locale = DEFAULT_LOCALE, catalogs }) {
    if (!catalogs || typeof catalogs !== 'object') {
        throw new TypeError('message catalogs are required');
    }

    const selected = catalogs[locale] || catalogs[DEFAULT_LOCALE] || Object.freeze({});
    const fallback = catalogs[DEFAULT_LOCALE] || Object.freeze({});
    return Object.freeze(function message(key, substitutions = {}) {
        const template = selected[key] || fallback[key];
        if (typeof template !== 'string' || !template) return `[missing:${key}]`;
        return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name) =>
            Object.prototype.hasOwnProperty.call(substitutions, name)
                ? String(substitutions[name])
                : match
        );
    });
}
