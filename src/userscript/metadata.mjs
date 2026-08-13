import {
    THREADS_MATCHES,
    USERSCRIPT_CONNECTS,
    USERSCRIPT_GRANTS
} from '../../config/targets.mjs';

const STATIC_DIRECTIVES = Object.freeze([
    ['name', 'Threads Plugin'],
    ['name:zh-TW', 'Threads Plugin'],
    ['name:en', 'Threads Plugin'],
    ['namespace', 'https://github.com/Jwander0820'],
    ['description', '為 Threads 貼文提供圖片與影片下載、批次資源選擇、貼文文字複製，以及去除追蹤碼的連結複製功能。'],
    ['description:zh-TW', '為 Threads 貼文提供圖片與影片下載、批次資源選擇、貼文文字複製，以及去除追蹤碼的連結複製功能。'],
    ['description:en', 'Download images and videos from Threads posts, select media in batches, copy post text, and copy links with tracking parameters removed.'],
    ['author', 'Jwander'],
    ['license', 'MIT'],
    ['homepageURL', 'https://github.com/Jwander0820/threads-plugin'],
    ['supportURL', 'https://github.com/Jwander0820/threads-plugin/issues'],
    ['updateURL', 'https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js'],
    ['downloadURL', 'https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js']
]);

function directive(name, value) {
    return `// @${name.padEnd(12)} ${value}`;
}

export function createUserscriptMetadata(version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`Invalid userscript version: ${version}`);
    }

    return [
        '// ==UserScript==',
        ...STATIC_DIRECTIVES.slice(0, 4).map(([name, value]) => directive(name, value)),
        directive('version', version),
        ...STATIC_DIRECTIVES.slice(4).map(([name, value]) => directive(name, value)),
        ...THREADS_MATCHES.map((value) => directive('match', value)),
        ...USERSCRIPT_GRANTS.map((value) => directive('grant', value)),
        ...USERSCRIPT_CONNECTS.map((value) => directive('connect', value)),
        directive('run-at', 'document-start'),
        '// ==/UserScript=='
    ].join('\n');
}
