export function getExtensionMessage(key, substitutions, chromeApi = globalThis.chrome) {
    const getMessage = chromeApi?.i18n?.getMessage;
    if (typeof getMessage !== 'function') return '';
    return getMessage.call(chromeApi.i18n, key, substitutions) || '';
}

export function localizeDocument(document, getMessage = getExtensionMessage) {
    if (!document?.querySelectorAll) throw new TypeError('document with querySelectorAll is required');
    const language = getMessage('htmlLang');
    if (language && document.documentElement) document.documentElement.lang = language;
    for (const element of document.querySelectorAll('[data-i18n]')) {
        const value = getMessage(element.getAttribute('data-i18n'));
        if (value) element.textContent = value;
    }
}
