import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

import { renderSmallPromo } from './build-store-assets.mjs';
import { REPOSITORY_ROOT } from './build-userscript.mjs';

const RELEASE_MODE = process.argv.includes('--release');
const STORE_ASSET_DIR = resolve(REPOSITORY_ROOT, 'docs', 'store-assets');

const required = [
    ['README.md', ['Threads Plugin 是一套 Threads 貼文內容工具', 'Tampermonkey', 'Chrome Extension', 'npm.cmd run verify', 'PRIVACY.md']],
    ['docs/ARCHITECTURE.md', ['Scope and source-of-truth rule', 'Chrome execution worlds', 'Consent and data lifecycle', 'Build, test, and release flow', 'Security and maintenance invariants']],
    ['docs/TEST_MATRIX.md', ['Automated evidence', 'Security invariant evidence (S1–S18)', 'Local browser fixture evidence', 'Cross-platform functional matrix', 'Chrome privacy and lifecycle matrix', 'Store and production matrix', 'Completion boundary']],
    ['PRIVACY.md', ['Data handled', 'Necessary destinations and sharing', 'operating-system clipboard', 'User control', 'Chrome Web Store Limited Use', 'Limited Use requirements']],
    ['docs/SECURITY_REVIEW.md', ['Decision rule', 'Current decision:', 'Critical and High findings', 'Store policy alignment', 'Final Go checklist', 'NO-GO']],
    ['docs/permissions-justification.md', ['Single purpose', '`downloads`', '`storage`', '`scripting`', 'Host permissions']],
    ['docs/store-listing.md', ['簡短說明（zh-TW）', '詳細說明（zh-TW）', 'Privacy policy URL', 'Data usage mapping', 'Remote code', 'Reviewer test instructions', '440×280 small promotional tile', 'External submission preconditions']],
    ['docs/manual-test-checklist.md', ['Clean-profile install', 'Disclosure and revocation', 'Functional parity matrix', 'Userscript regression']],
    ['CHANGELOG.md', ['[5.1.0]', '2026-08-13', 'Manifest V3', 'Real clean-profile unpacked installation']]
];

const securityInvariantPhrases = [
    'S1 — No dynamic code',
    'S2 — No remote hosted executable code',
    'S3 — No broad host permission',
    'S4 — Minimum permissions',
    'S5 — No cookie access',
    'S6 — No tracking',
    'S7 — Bounded network inspection',
    'S8 — Response limit',
    'S9 — Media URL policy',
    'S10 — Trusted activation',
    'S11 — MAIN is untrusted',
    'S12 — Service Worker revalidation',
    'S13 — No content persistence',
    'S14 — Consent before processing',
    'S15 — Bounded bridge',
    'S16 — Route isolation',
    'S17 — Service Worker restart safety',
    'S18 — Generated/package artifact integrity'
];

const packagedPrivacyPhrases = [
    '處理的資料',
    '資料使用與分享',
    '儲存與保留',
    '作業系統剪貼簿',
    '控制與撤銷',
    '敏感路徑與安全限制',
    'Chrome Web Store Limited Use',
    'Limited Use 要求',
    '聯絡方式'
];

function getStatus(source, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^- ' + escaped + ': `([^`]+)`$', 'm').exec(source)?.[1] || '';
}

function getSignoff(source, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^- ${escaped}:[ \\t]*(\\S[^\\r\\n]*)$`, 'm').exec(source)?.[1]?.trim() || '';
}

function isRealSignoff(value) {
    return Boolean(value) && !/^(?:tbd|todo|pending|n\/a|na|none|unknown|-)$/i.test(value.trim());
}

let failed = 0;
let checked = 0;
for (const [path, phrases] of required) {
    const source = await readFile(resolve(REPOSITORY_ROOT, path), 'utf8');
    const passed = phrases.every((phrase) => source.includes(phrase)) &&
        !source.includes('\uFFFD') &&
        !source.includes('TO' + 'DO');
    checked += 1;
    if (passed) console.log(`PASS documented ${path}`);
    else { failed += 1; console.error(`FAIL documented ${path}`); }
}

const testMatrixSource = await readFile(resolve(REPOSITORY_ROOT, 'docs', 'TEST_MATRIX.md'), 'utf8');
const securityLedgerComplete = securityInvariantPhrases.every((phrase) => testMatrixSource.includes(phrase));
checked += 1;
if (securityLedgerComplete) console.log('PASS documented security invariant ledger S1-S18');
else { failed += 1; console.error('FAIL documented security invariant ledger S1-S18'); }

for (const size of [16, 32, 48, 128]) {
    const path = resolve(REPOSITORY_ROOT, 'extension', 'icons', `icon-${size}.png`);
    const [info, metadata] = await Promise.all([stat(path), sharp(path).metadata()]);
    const passed = info.isFile() && info.size > 0 && metadata.format === 'png' &&
        metadata.width === size && metadata.height === size;
    checked += 1;
    if (passed) console.log(`PASS source icon ${size}`);
    else { failed += 1; console.error(`FAIL source icon ${size}`); }
}

const privacyHtml = await readFile(resolve(REPOSITORY_ROOT, 'extension', 'privacy.html'), 'utf8');
for (const phrase of packagedPrivacyPhrases) {
    checked += 1;
    if (!privacyHtml.includes(phrase)) {
        failed += 1;
        console.error(`FAIL packaged privacy phrase ${phrase}`);
    } else {
        console.log(`PASS packaged privacy phrase ${phrase}`);
    }
}

const [storeSource, manualSource] = await Promise.all([
    readFile(resolve(REPOSITORY_ROOT, 'docs', 'store-listing.md'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'docs', 'manual-test-checklist.md'), 'utf8')
]);

let storeAssetNames = [];
try {
    storeAssetNames = await readdir(STORE_ASSET_DIR);
} catch (error) {
    if (error?.code !== 'ENOENT') throw error;
}

async function hasImageDimensions(name, allowedDimensions) {
    if (!storeAssetNames.includes(name)) return false;
    try {
        const metadata = await sharp(resolve(STORE_ASSET_DIR, name)).metadata();
        return ['png', 'jpeg'].includes(metadata.format) &&
            allowedDimensions.some(([width, height]) => metadata.width === width && metadata.height === height);
    } catch {
        return false;
    }
}

const screenshotNames = storeAssetNames
    .filter((name) => /^screenshot-[^.]+\.(?:png|jpe?g)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
const screenshotValidity = await Promise.all(screenshotNames.map((name) =>
    hasImageDimensions(name, [[1280, 800], [640, 400]])
));
const screenshotsReady = screenshotNames.length >= 1 && screenshotNames.length <= 5 &&
    screenshotValidity.every(Boolean);
const smallPromoReady = await hasImageDimensions('small-promo-440x280.png', [[440, 280]]) ||
    await hasImageDimensions('small-promo-440x280.jpg', [[440, 280]]) ||
    await hasImageDimensions('small-promo-440x280.jpeg', [[440, 280]]);

let smallPromoCurrent = false;
if (storeAssetNames.includes('small-promo-440x280.png')) {
    const [actualPromo, expectedPromo] = await Promise.all([
        readFile(resolve(STORE_ASSET_DIR, 'small-promo-440x280.png')),
        renderSmallPromo()
    ]);
    smallPromoCurrent = actualPromo.equals(expectedPromo);
}
checked += 1;
if (smallPromoCurrent) console.log('PASS deterministic Store promotional tile current');
else { failed += 1; console.error('FAIL deterministic Store promotional tile stale or missing'); }

const releaseFailures = [];
const pending = [];
function releaseGate(label, passed) {
    if (passed) {
        console.log(`PASS release gate ${label}`);
        return;
    }
    if (RELEASE_MODE) releaseFailures.push(label);
    else pending.push(label);
}

releaseGate(
    'public privacy policy URL confirmed',
    getStatus(storeSource, 'Privacy policy public URL status') === 'READY' &&
        /^https:\/\/(?!example\.(?:com|org|net)\b)(?!localhost\b)(?!127\.0\.0\.1\b)\S+$/m.test(
            /## Privacy policy URL\s+[\s\S]*?\n(https:\/\/\S+)/m.exec(storeSource)?.[1] || ''
        )
);
releaseGate(
    'manual browser metadata ready',
    getStatus(storeSource, 'Manual browser sign-off status') === 'READY'
);
releaseGate(
    'required Store asset metadata ready',
    getStatus(storeSource, 'Required store assets status') === 'READY'
);
releaseGate('no pending release metadata remains', !storeSource.includes('PENDING_'));
releaseGate('one to five valid Store screenshots', screenshotsReady);
releaseGate('valid mandatory 440x280 small promotional tile', smallPromoReady);

const manualItems = manualSource.match(/^- \[[ xX]\]/gm) || [];
const uncheckedManualItems = (manualSource.match(/^- \[ \]/gm) || []).length;
releaseGate('manual checklist retains all 31 required items', manualItems.length === 31);
releaseGate('all manual checklist items checked', uncheckedManualItems === 0);
for (const field of [
    'Tester',
    'Date/time (Asia/Taipei)',
    'Chrome version',
    'Tampermonkey version',
    'Chrome Extension result',
    'Userscript result',
    'Known limitations accepted'
]) {
    releaseGate(`manual sign-off field ${field}`, isRealSignoff(getSignoff(manualSource, field)));
}

if (failed || (RELEASE_MODE && releaseFailures.length > 0)) {
    if (failed) console.error(`${failed} core documentation check(s) failed.`);
    releaseFailures.forEach((label) => console.error(`FAIL release gate ${label}`));
    if (releaseFailures.length > 0) {
        console.error(`${releaseFailures.length} release documentation gate(s) failed.`);
    }
    process.exitCode = 1;
} else {
    console.log(`${checked} core documentation checks passed.`);
    if (pending.length > 0) {
        pending.forEach((label) => console.log(`PENDING external release gate ${label}`));
        console.log(`${pending.length} external release gate(s) remain; run verify:docs:release for the blocking gate.`);
    } else {
        console.log('All documentation release gates passed.');
    }
}
