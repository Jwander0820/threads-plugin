import {
    DEFAULT_LOCALE,
    resolveInterfaceLocale
} from '../shared/i18n.js';
import { normalizeOptions } from '../shared/options.js';
import { getExtensionMessage, localizeDocument } from './i18n.js';
import {
    LAST_DOCUMENT_LOCALE_STORAGE_KEY,
    OPTIONS_STORAGE_KEY
} from './storage-keys.js';

function substituteCatalogMessage(entry, substitutions) {
    let value = entry?.message;
    if (typeof value !== 'string') return '';
    const values = Array.isArray(substitutions)
        ? substitutions
        : substitutions === undefined
            ? []
            : [substitutions];
    for (const [name, placeholder] of Object.entries(entry.placeholders || {})) {
        const match = /^\$(\d+)$/.exec(placeholder?.content || '');
        if (!match) continue;
        const replacement = values[Number(match[1]) - 1];
        if (replacement === undefined) continue;
        value = value.replace(new RegExp(`\\$${name}\\$`, 'gi'), String(replacement));
    }
    return value;
}

export function createCatalogMessage(catalog, fallbackMessage = () => '') {
    return (key, substitutions) => {
        const value = substituteCatalogMessage(catalog?.[key], substitutions);
        return value || fallbackMessage(key, substitutions) || '';
    };
}

async function loadCatalog(locale, environment) {
    const response = await environment.fetch(
        environment.chrome.runtime.getURL(`_locales/${locale}/messages.json`)
    );
    if (!response?.ok) throw new Error(`locale_catalog_load_failed:${locale}`);
    return response.json();
}

export async function resolveStoredExtensionLocale(environment = globalThis, override = {}) {
    const stored = await environment.chrome.storage.local.get([
        OPTIONS_STORAGE_KEY,
        LAST_DOCUMENT_LOCALE_STORAGE_KEY
    ]);
    const options = normalizeOptions(stored[OPTIONS_STORAGE_KEY]);
    return Object.freeze({
        preference: override.languagePreference ?? options.languagePreference,
        locale: resolveInterfaceLocale({
            preference: override.languagePreference ?? options.languagePreference,
            documentLanguage: override.documentLanguage ?? stored[LAST_DOCUMENT_LOCALE_STORAGE_KEY],
            fallbackLanguage: getExtensionMessage('runtimeLocale', undefined, environment.chrome)
        })
    });
}

export async function createStoredExtensionMessage(environment = globalThis, override = {}) {
    const resolved = await resolveStoredExtensionLocale(environment, override);
    const fallback = (key, substitutions) => getExtensionMessage(
        key,
        substitutions,
        environment.chrome
    );
    try {
        const catalog = await loadCatalog(resolved.locale, environment);
        return Object.freeze({
            ...resolved,
            message: createCatalogMessage(catalog, fallback)
        });
    } catch {
        return Object.freeze({
            preference: resolved.preference,
            locale: DEFAULT_LOCALE,
            message: fallback
        });
    }
}

export async function localizeStoredDocument(document, environment = globalThis, override = {}) {
    const localized = await createStoredExtensionMessage(environment, override);
    localizeDocument(document, localized.message);
    return localized;
}
