export const THREADS_MATCHES = Object.freeze([
    'https://www.threads.com/*',
    'https://threads.com/*',
    'https://www.threads.net/*',
    'https://threads.net/*'
]);

export const USERSCRIPT_GRANTS = Object.freeze([
    'GM_addStyle',
    'GM_download',
    'GM_xmlhttpRequest',
    'GM_getValue',
    'GM_setValue',
    'GM_registerMenuCommand',
    'GM_unregisterMenuCommand',
    'GM_setClipboard',
    'unsafeWindow'
]);

export const USERSCRIPT_CONNECTS = Object.freeze([
    'threads.com',
    'www.threads.com',
    'threads.net',
    'www.threads.net',
    'instagram.com',
    '*.instagram.com',
    'cdninstagram.com',
    '*.cdninstagram.com',
    'fbcdn.net',
    '*.fbcdn.net'
]);

export const CHROME_EXTENSION_PERMISSIONS = Object.freeze([
    'downloads',
    'scripting',
    'storage'
]);

export const CHROME_FORBIDDEN_PERMISSIONS = Object.freeze([
    'activeTab',
    'tabs',
    'webRequest',
    'webRequestBlocking',
    'cookies',
    'nativeMessaging'
]);
