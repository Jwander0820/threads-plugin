import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const scriptPath = resolve(rootDir, 'threads-plugin.user.js');
const source = readFileSync(scriptPath, 'utf8');
const runtimeSource = source.slice(source.indexOf('// ==/UserScript=='));

const checks = [
    ['metadata name', /\/\/ @name\s+Threads Plugin/.test(source)],
    ['metadata version', /\/\/ @version\s+4\.8\.7/.test(source)],
    ['localized zh-TW metadata', /\/\/ @name:zh-TW\s+Threads Plugin/.test(source) && /\/\/ @description:zh-TW\s+為 Threads/.test(source)],
    ['localized en metadata', /\/\/ @name:en\s+Threads Plugin/.test(source) && /\/\/ @description:en\s+Download images/.test(source)],
    ['metadata license', /\/\/ @license\s+MIT/.test(source)],
    ['metadata homepageURL', /\/\/ @homepageURL\s+https:\/\/github\.com\/Jwander0820\/threads-plugin/.test(source)],
    ['metadata supportURL', /\/\/ @supportURL\s+https:\/\/github\.com\/Jwander0820\/threads-plugin\/issues/.test(source)],
    ['metadata update URLs', [
        '@updateURL    https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js',
        '@downloadURL  https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js'
    ].every((entry) => source.includes(`// ${entry}`))],
    ['Threads matches', [
        'https://www.threads.com/*',
        'https://threads.com/*',
        'https://www.threads.net/*',
        'https://threads.net/*'
    ].every((match) => source.includes(`// @match        ${match}`))],
    ['scoped connect domains', [
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
    ].every((domain) => source.includes(`// @connect      ${domain}`))],
    ['no broad connect wildcard', !/^\/\/ @connect\s+\*$/m.test(source)],
    ['single media download support', /GM_download/.test(source) && /downloadItem/.test(source)],
    ['batch media modal support', /ensurePostMediaModal/.test(source) && /downloadModalItems/.test(source)],
    ['copy post text support', /copyPostBlockText/.test(source) && /GM_setClipboard/.test(source)],
    ['direct clean-link support', /copyPostBlockCleanLink/.test(source) && /buildCleanThreadsPostUrl/.test(source)],
    ['native share clean-link support', /CLEAN_LINK_MENU_CLASS/.test(source) && /closeNativeShareMenu/.test(source)],
    ['native share broken-link icon', /replaceCleanLinkMenuIcon/.test(source) && /M15 8\.5l1\.5-1\.5/.test(source) && /M8 1\.5v2\.5/.test(source)],
    ['native share icon style isolation', /path\.style\.setProperty\('fill', 'none', 'important'\)/.test(source)],
    ['native share concise clean-link label', /labelNode\.nodeValue = '原始連結'/.test(source) && /複製去除追蹤碼的連結/.test(source)],
    ['native share outer-control targeting', /findShareSvgInControl/.test(source) && /pathControlSvg/.test(source)],
    ['quoted-post targeting support', /findBestPostInfoInNode/.test(source) && /findPostBlockRootFromShareButton/.test(source)],
    ['post text cleanup support', /cleanPostTextFragment/.test(source)],
    ['inline script scan guarded by WeakSet', /scannedScripts:\s*new WeakSet/.test(source) && /scanInlineScriptsForVideoUrls/.test(source)],
    ['plugin DOM mutation ignored', /new MutationObserver/.test(source) && /POST_TOOL_CLASS/.test(source) && /COPY_TOOL_CLASS/.test(source) && /LINK_TOOL_CLASS/.test(source)],
    ['no obvious tracking or dynamic code', !/(sendBeacon|document\.cookie|localStorage|sessionStorage|analytics|tracking|eval\(|new Function)/.test(runtimeSource)]
];

let failed = 0;

for (const [label, passed] of checks) {
    if (passed) {
        console.log(`PASS ${label}`);
    } else {
        failed += 1;
        console.error(`FAIL ${label}`);
    }
}

if (failed > 0) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
}

console.log(`${checks.length} checks passed.`);
