import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
    CHROME_FORBIDDEN_PERMISSIONS,
    CHROME_EXTENSION_PERMISSIONS,
    THREADS_MATCHES
} from '../config/targets.mjs';
import { EXTENSION_OUTPUT, REPOSITORY_ROOT } from './build-extension.mjs';

function sameValues(actual, expected) {
    return Array.isArray(actual) &&
        actual.length === expected.length &&
        [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

const [
    manifestText,
    packageText,
    contentSource,
    contentEntrySource,
    runtimeI18nSource,
    workerSource,
    mainSource,
    optionsHtml,
    privacyHtml,
    optionsSource,
    disclosureSource,
    staticLocalizationSource,
    zhMessagesText,
    enMessagesText
] = await Promise.all([
    readFile(resolve(EXTENSION_OUTPUT, 'manifest.json'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'content.js'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'src', 'chrome', 'content-entry.js'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'src', 'chrome', 'runtime-i18n.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'service-worker.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'main-world-capture.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'options.html'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'privacy.html'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'src', 'chrome', 'options-entry.js'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'src', 'chrome', 'disclosure.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'static-localization.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, '_locales', 'zh_TW', 'messages.json'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, '_locales', 'en', 'messages.json'), 'utf8')
]);
const manifest = JSON.parse(manifestText);
const packageData = JSON.parse(packageText);
const zhMessages = JSON.parse(zhMessagesText);
const enMessages = JSON.parse(enMessagesText);
const permissions = manifest.permissions || [];
const uiMessageKeys = new Set();
for (const key of ['htmlLang', 'runtimeLocale', 'consentStatusEnabled', 'consentStatusDisabled']) uiMessageKeys.add(key);
for (const source of [optionsHtml, privacyHtml]) {
    for (const match of source.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)) uiMessageKeys.add(match[1]);
}
for (const source of [optionsSource, disclosureSource]) {
    for (const match of source.matchAll(/message\(['"]([A-Za-z0-9_]+)['"]/g)) uiMessageKeys.add(match[1]);
}
const hasCompleteMessages = (messages) => [...uiMessageKeys].every((key) =>
    typeof messages[key]?.message === 'string' && messages[key].message.length > 0
);
const checks = [
    ['manifest v3', manifest.manifest_version === 3],
    ['manifest/package version', manifest.version === packageData.version],
    ['English is fallback locale', manifest.default_locale === 'en'],
    ['localized manifest placeholders', manifest.name === '__MSG_extensionName__' &&
        manifest.description === '__MSG_extensionDescription__' &&
        manifest.action?.default_title === '__MSG_actionTitle__'],
    ['Traditional Chinese Store metadata',
        zhMessages.extensionName?.message === 'Threads Plugin - 去除追蹤連結與圖文保存工具' &&
        zhMessages.extensionDescription?.message === '下載 Threads 貼文圖片與影片、複製貼文文字或移除追蹤參數的乾淨連結' &&
        zhMessages.actionTitle?.message === 'Threads Plugin 設定'],
    ['English Store metadata',
        enMessages.extensionName?.message === 'Threads Plugin - Clean Links & Media Saver' &&
        enMessages.extensionDescription?.message === 'Download images and videos from Threads posts, copy post text, or copy clean links with tracking parameters removed.' &&
        enMessages.actionTitle?.message === 'Threads Plugin Settings'],
    ['Traditional Chinese UI messages complete', hasCompleteMessages(zhMessages)],
    ['English UI messages complete', hasCompleteMessages(enMessages)],
    ['locale message keys stay aligned', sameValues(Object.keys(zhMessages), Object.keys(enMessages))],
    ['runtime locale follows Chrome i18n with English fallback',
        zhMessages.runtimeLocale?.message === 'zh-TW' &&
        enMessages.runtimeLocale?.message === 'en' &&
        /getExtensionMessage\(CHROME_RUNTIME_LOCALE_MESSAGE_KEY/.test(runtimeI18nSource) &&
        /DEFAULT_LOCALE/.test(runtimeI18nSource)],
    ['minimum Chrome version', manifest.minimum_chrome_version === '111'],
    ['exact extension permissions', sameValues(permissions, CHROME_EXTENSION_PERMISSIONS)],
    ['forbidden permissions absent', CHROME_FORBIDDEN_PERMISSIONS.every((permission) => !permissions.includes(permission))],
    ['scripting is present for opt-in dynamic MAIN registration', permissions.includes('scripting')],
    ['exact host permissions', sameValues(manifest.host_permissions, THREADS_MATCHES)],
    ['exact content-script matches', manifest.content_scripts?.length === 1 && sameValues(manifest.content_scripts[0].matches, THREADS_MATCHES)],
    ['content script is isolated document_start', manifest.content_scripts?.[0]?.run_at === 'document_start' && manifest.content_scripts[0].world !== 'MAIN'],
    ['content bundle includes disclosure gate', /showDisclosure/.test(contentSource) && /decideExtensionBootstrap/.test(contentSource)],
    ['content runtime receives Chrome i18n translator',
        /createChromeRuntimeMessage/.test(contentEntrySource) &&
        /message:\s*createChromeRuntimeMessage\(environment\.chrome\)/.test(contentEntrySource) &&
        /SHARED_UI_MESSAGES/.test(runtimeI18nSource)],
    ['content runtime never hooks isolated-world network APIs', /captureSource:\s*null/.test(contentSource) && !/unsafeWindow/.test(contentSource)],
    ['bridge uses bounded validated records', /validateCaptureBridgeEvent/.test(contentEntrySource) && !/(?:responseText|rawResponse|bodyText)/.test(contentEntrySource)],
    ['MAIN capture posts extracted records only', /MEDIA_RECORDS/.test(mainSource) && /collectStructuredMediaUrls/.test(mainSource) && !/chrome\.runtime\.sendMessage/.test(mainSource)],
    ['dynamic MAIN registration is opt-in', /registerContentScripts/.test(workerSource) && /networkCaptureEnabled/.test(workerSource) && /world:\s*["']MAIN["']/.test(workerSource)],
    ['service worker validates download messages', /invalid_sender/.test(workerSource) && /unsafe_media_url/.test(workerSource) && /unsafe_filename/.test(workerSource) && /consent_required/.test(workerSource)],
    ['service worker has no remote code import', !/importScripts\s*\(\s*["']https?:/i.test(workerSource)],
    ['static pages load packaged localization',
        /src="static-localization\.js"/.test(optionsHtml) &&
        /src="static-localization\.js"/.test(privacyHtml) &&
        /localizeDocument/.test(staticLocalizationSource)],
    ['static pages have no inline script',
        !/<script(?![^>]*\bsrc=)[^>]*>/i.test(optionsHtml + privacyHtml)],
    ['extension CSP has no unsafe eval', !/unsafe-eval/i.test(manifestText + contentSource + workerSource)]
];

let failed = 0;
for (const [label, passed] of checks) {
    if (passed) console.log(`PASS ${label}`);
    else {
        failed += 1;
        console.error(`FAIL ${label}`);
    }
}

const requiredFiles = [
    'manifest.json', 'content.js', 'main-world-capture.js', 'service-worker.js',
    'options.html', 'options.css', 'options.js', 'privacy.html', 'static-localization.js',
    '_locales/zh_TW/messages.json', '_locales/en/messages.json'
];
for (const requiredFile of requiredFiles) {
    const info = await stat(resolve(EXTENSION_OUTPUT, requiredFile));
    const passed = info.isFile() && info.size > 0;
    if (passed) console.log(`PASS packaged ${requiredFile}`);
    else {
        failed += 1;
        console.error(`FAIL packaged ${requiredFile}`);
    }
}

for (const size of [16, 32, 48, 128]) {
    const info = await stat(resolve(EXTENSION_OUTPUT, 'icons', `icon-${size}.png`));
    const passed = info.isFile() && info.size > 0;
    if (passed) console.log(`PASS packaged icon-${size}.png`);
    else { failed += 1; console.error(`FAIL packaged icon-${size}.png`); }
}

if (failed) {
    console.error(`${failed} extension check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log(`${checks.length + requiredFiles.length + 4} extension checks passed.`);
}
