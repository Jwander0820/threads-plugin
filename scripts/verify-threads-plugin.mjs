import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    THREADS_MATCHES,
    USERSCRIPT_CONNECTS,
    USERSCRIPT_GRANTS
} from '../config/targets.mjs';

const MODULE_FILENAME = fileURLToPath(import.meta.url);
const DEFAULT_ROOT_DIR = resolve(dirname(MODULE_FILENAME), '..');

const EXPECTED_ALLOWLISTS = Object.freeze({
    grant: USERSCRIPT_GRANTS,
    connect: USERSCRIPT_CONNECTS,
    match: THREADS_MATCHES
});

function getRootDir(argv) {
    if (argv.length === 0) return DEFAULT_ROOT_DIR;
    if (argv.length === 2 && argv[0] === '--root' && argv[1]) return resolve(argv[1]);
    throw new Error('usage: node scripts/verify-threads-plugin.mjs [--root <repository>]');
}

function parseMetadata(source) {
    const blockPattern = /^[ \t]*\/\/ ==UserScript==[ \t]*\r?\n([\s\S]*?)^[ \t]*\/\/ ==\/UserScript==[ \t]*(?:\r?\n|$)/m;
    const blockMatch = blockPattern.exec(source);
    if (!blockMatch) throw new Error('userscript metadata block is missing or malformed');

    const directives = new Map();
    for (const line of blockMatch[1].split(/\r?\n/)) {
        const directiveMatch = /^\s*\/\/\s*@([^\s]+)(?:\s+(.*?))?\s*$/.exec(line);
        if (!directiveMatch) continue;
        const [, key, rawValue = ''] = directiveMatch;
        const values = directives.get(key) || [];
        values.push(rawValue.trim());
        directives.set(key, values);
    }

    return {
        directives,
        runtimeSource: source.slice(blockMatch.index + blockMatch[0].length)
    };
}

function hasSingleValue(directives, key, expected) {
    const values = directives.get(key) || [];
    return values.length === 1 && values[0] === expected;
}

function hasSingleValueMatching(directives, key, predicate) {
    const values = directives.get(key) || [];
    return values.length === 1 && predicate(values[0]);
}

function validateAllowlist(actual, expected) {
    const counts = new Map();
    for (const value of actual) counts.set(value, (counts.get(value) || 0) + 1);

    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const extra = [...actualSet].filter((value) => !expectedSet.has(value));
    const missing = expected.filter((value) => !actualSet.has(value));
    const duplicate = [...counts]
        .filter(([, count]) => count > 1)
        .map(([value, count]) => `${value} x${count}`);
    const problems = [];
    if (extra.length) problems.push(`extra: ${extra.join(', ')}`);
    if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
    if (duplicate.length) problems.push(`duplicate: ${duplicate.join(', ')}`);

    return {
        passed: problems.length === 0 && actual.length === expected.length,
        detail: problems.join('; ')
    };
}

function validateVersion(directives, packageVersion) {
    const versions = directives.get('version') || [];
    return {
        passed: versions.length === 1 && versions[0] === packageVersion,
        detail: `expected one ${packageVersion}; received ${versions.length ? versions.join(', ') : 'none'}`
    };
}

function validateLoadedLog(runtimeSource, packageVersion) {
    const loadedVersions = [];
    const loadedLogPattern = /(?:\blog|console\.log)\([^\r\n]*?(['"`])v([^'"`\r\n]+) loaded\1[^\r\n]*?\);/g;
    for (const match of runtimeSource.matchAll(loadedLogPattern)) loadedVersions.push(match[2]);

    return {
        passed: loadedVersions.length === 1 && loadedVersions[0] === packageVersion,
        detail: `expected one v${packageVersion} loaded log; received ${loadedVersions.length ? loadedVersions.map((version) => `v${version}`).join(', ') : 'none'}`
    };
}

function readSharedSource(repositoryRoot) {
    const sharedRoot = resolve(repositoryRoot, 'src', 'shared');
    return readdirSync(sharedRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => readFileSync(resolve(sharedRoot, entry.name), 'utf8'))
        .join('\n');
}

function buildChecks(source, packageVersion, metadata, repositoryRoot) {
    const { directives, runtimeSource } = metadata;
    const grantAllowlist = validateAllowlist(directives.get('grant') || [], EXPECTED_ALLOWLISTS.grant);
    const connectAllowlist = validateAllowlist(directives.get('connect') || [], EXPECTED_ALLOWLISTS.connect);
    const matchAllowlist = validateAllowlist(directives.get('match') || [], EXPECTED_ALLOWLISTS.match);
    const metadataVersion = validateVersion(directives, packageVersion);
    const loadedLogVersion = validateLoadedLog(runtimeSource, packageVersion);

    return [
        ['metadata name', hasSingleValue(directives, 'name', 'Threads Plugin')],
        ['metadata/package version', metadataVersion.passed, metadataVersion.detail],
        ['runtime loaded-log/package version', loadedLogVersion.passed, loadedLogVersion.detail],
        ['localized zh-TW metadata', hasSingleValue(directives, 'name:zh-TW', 'Threads Plugin') && hasSingleValueMatching(directives, 'description:zh-TW', (value) => value.startsWith('為 Threads'))],
        ['localized en metadata', hasSingleValue(directives, 'name:en', 'Threads Plugin') && hasSingleValueMatching(directives, 'description:en', (value) => value.startsWith('Download images'))],
        ['metadata license', hasSingleValue(directives, 'license', 'MIT')],
        ['metadata homepageURL', hasSingleValue(directives, 'homepageURL', 'https://github.com/Jwander0820/threads-plugin')],
        ['metadata supportURL', hasSingleValue(directives, 'supportURL', 'https://github.com/Jwander0820/threads-plugin/issues')],
        ['metadata icon', hasSingleValue(directives, 'icon', 'https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/extension/icons/icon-128.png')],
        ['metadata icon64', hasSingleValue(directives, 'icon64', 'https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/extension/icons/icon-128.png')],
        ['metadata updateURL', hasSingleValue(directives, 'updateURL', 'https://update.greasyfork.org/scripts/584182/Threads%20Plugin.user.js')],
        ['metadata downloadURL', hasSingleValue(directives, 'downloadURL', 'https://update.greasyfork.org/scripts/584182/Threads%20Plugin.user.js')],
        ['metadata @grant allowlist', grantAllowlist.passed, grantAllowlist.detail],
        ['metadata @connect allowlist', connectAllowlist.passed, connectAllowlist.detail],
        ['metadata @match allowlist', matchAllowlist.passed, matchAllowlist.detail],
        ['metadata has no @require', !(directives.get('require') || []).length],
        ['generated warning follows metadata', runtimeSource.trimStart().startsWith('// GENERATED FILE. DO NOT EDIT DIRECTLY.\n// Source files are under /src.')],
        ['strict-mode runtime', /\/\/ Source files are under \/src\.\r?\n'use strict';/.test(runtimeSource)],
        ['single media download support', /GM_download/.test(source) && /downloadItem/.test(source)],
        ['batch media modal support', /ensurePostMediaModal/.test(source) && /downloadModalItems/.test(source)],
        ['copy post text support', /copyPostBlockText/.test(source) && /GM_setClipboard/.test(source)],
        ['direct clean-link support', /copyPostBlockCleanLink/.test(source) && /buildCleanThreadsPostUrl/.test(source)],
        ['native share clean-link support', /CLEAN_LINK_MENU_CLASS/.test(source) && /closeNativeShareMenu/.test(source)],
        ['shared clean-link icon path', /CLEAN_LINK_ICON_PATH/.test(source) && /M245\.14 352\.14/.test(source) && /createLinkToolButton[\s\S]*CLEAN_LINK_ICON_PATH/.test(source) && /replaceCleanLinkMenuIcon[\s\S]*CLEAN_LINK_ICON_PATH/.test(source)],
        ['native share icon style isolation', /path\.style\.setProperty\(["']fill["'],\s*["']currentColor["'],\s*["']important["']\)/.test(source) && /path\.style\.setProperty\(["']stroke["'],\s*["']none["'],\s*["']important["']\)/.test(source)],
        ['native share concise clean-link label', /labelNode\.nodeValue = ["']原始連結["']/.test(source) && /複製去除追蹤碼的連結/.test(source)],
        ['native share outer-control targeting', /findShareSvgInControl/.test(source) && /pathControlSvg/.test(source)],
        ['quoted-post targeting support', /findBestPostInfoInNode/.test(source) && /findPostBlockRootFromShareButton/.test(source)],
        ['post text cleanup support', /cleanPostTextFragment/.test(source)],
        ['inline script scan guarded by content-aware WeakMap', /scannedScriptContents:\s*(?:\/\*[^*]*\*\/\s*)?new WeakMap/.test(source) && /scanInlineScriptsForVideoUrls/.test(source)],
        ['plugin DOM mutation ignored', /new (?:window\.)?MutationObserver/.test(source) && /POST_TOOL_CLASS/.test(source) && /COPY_TOOL_CLASS/.test(source) && /LINK_TOOL_CLASS/.test(source)],
        ['async runtime lifecycle', /createThreadsRuntime/.test(source) && /async function start/.test(source) && /async function stop/.test(source) && /async function updateOptions/.test(source)],
        ['shared code excludes privileged namespaces', !/(?:\bGM_|\bunsafeWindow\b|\bchrome\.)/.test(readSharedSource(repositoryRoot))],
        ['no obvious tracking or dynamic code', !/(sendBeacon|document\.cookie|localStorage|sessionStorage|analytics|tracking|eval\(|new Function)/.test(runtimeSource)]
    ];
}

export function verifyRepository(repositoryRoot, output = {}) {
    const log = output.log || console.log;
    const error = output.error || console.error;
    let source;
    let packageVersion;
    let metadata;

    try {
        source = readFileSync(resolve(repositoryRoot, 'threads-plugin.user.js'), 'utf8');
        const packageData = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
        if (typeof packageData.version !== 'string' || packageData.version.trim() === '') {
            throw new Error('package.json version must be a non-empty string');
        }
        packageVersion = packageData.version;
        metadata = parseMetadata(source);
    } catch (setupError) {
        error(`Verifier setup failed: ${setupError.message}`);
        return { passed: false, failed: 1, total: 0 };
    }

    const checks = buildChecks(source, packageVersion, metadata, repositoryRoot);
    let failed = 0;

    for (const [label, passed, detail] of checks) {
        if (passed) {
            log(`PASS ${label}`);
        } else {
            failed += 1;
            error(`FAIL ${label}${detail ? ` (${detail})` : ''}`);
        }
    }

    if (failed > 0) {
        error(`${failed} check(s) failed.`);
        return { passed: false, failed, total: checks.length };
    }

    log(`${checks.length} checks passed.`);
    return { passed: true, failed: 0, total: checks.length };
}

function runCli() {
    try {
        const result = verifyRepository(getRootDir(process.argv.slice(2)));
        if (!result.passed) process.exitCode = 1;
    } catch (error) {
        console.error(`Verifier setup failed: ${error.message}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(MODULE_FILENAME)) runCli();
