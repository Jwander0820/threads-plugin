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

const [manifestText, packageText, contentSource, contentEntrySource, workerSource, mainSource, optionsHtml] = await Promise.all([
    readFile(resolve(EXTENSION_OUTPUT, 'manifest.json'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'content.js'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'src', 'chrome', 'content-entry.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'service-worker.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'main-world-capture.js'), 'utf8'),
    readFile(resolve(EXTENSION_OUTPUT, 'options.html'), 'utf8')
]);
const manifest = JSON.parse(manifestText);
const packageData = JSON.parse(packageText);
const permissions = manifest.permissions || [];
const checks = [
    ['manifest v3', manifest.manifest_version === 3],
    ['manifest/package version', manifest.version === packageData.version],
    ['minimum Chrome version', manifest.minimum_chrome_version === '111'],
    ['exact extension permissions', sameValues(permissions, CHROME_EXTENSION_PERMISSIONS)],
    ['forbidden permissions absent', CHROME_FORBIDDEN_PERMISSIONS.every((permission) => !permissions.includes(permission))],
    ['scripting is present for opt-in dynamic MAIN registration', permissions.includes('scripting')],
    ['exact host permissions', sameValues(manifest.host_permissions, THREADS_MATCHES)],
    ['exact content-script matches', manifest.content_scripts?.length === 1 && sameValues(manifest.content_scripts[0].matches, THREADS_MATCHES)],
    ['content script is isolated document_start', manifest.content_scripts?.[0]?.run_at === 'document_start' && manifest.content_scripts[0].world !== 'MAIN'],
    ['content bundle includes disclosure gate', /showDisclosure/.test(contentSource) && /decideExtensionBootstrap/.test(contentSource)],
    ['content runtime never hooks isolated-world network APIs', /captureSource:\s*null/.test(contentSource) && !/unsafeWindow/.test(contentSource)],
    ['bridge uses bounded validated records', /validateCaptureBridgeEvent/.test(contentEntrySource) && !/(?:responseText|rawResponse|bodyText)/.test(contentEntrySource)],
    ['MAIN capture posts extracted records only', /MEDIA_RECORDS/.test(mainSource) && /collectStructuredMediaUrls/.test(mainSource) && !/chrome\.runtime\.sendMessage/.test(mainSource)],
    ['dynamic MAIN registration is opt-in', /registerContentScripts/.test(workerSource) && /networkCaptureEnabled/.test(workerSource) && /world:\s*["']MAIN["']/.test(workerSource)],
    ['service worker validates download messages', /invalid_sender/.test(workerSource) && /unsafe_media_url/.test(workerSource) && /unsafe_filename/.test(workerSource) && /consent_required/.test(workerSource)],
    ['service worker has no remote code import', !/importScripts\s*\(\s*["']https?:/i.test(workerSource)],
    ['options page has no inline script', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(optionsHtml)],
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

for (const requiredFile of ['manifest.json', 'content.js', 'main-world-capture.js', 'service-worker.js', 'options.html', 'options.css', 'options.js', 'privacy.html']) {
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
    console.log(`${checks.length + 12} extension checks passed.`);
}
