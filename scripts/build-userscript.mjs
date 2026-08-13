import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { createUserscriptMetadata } from '../src/userscript/metadata.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..');
export const USERSCRIPT_OUTPUT = resolve(REPOSITORY_ROOT, 'threads-plugin.user.js');
const VERSION_TOKEN = '__THREADS_PLUGIN_VERSION__';

async function readProductVersion() {
    const packageData = JSON.parse(await readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'));
    if (typeof packageData.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageData.version)) {
        throw new Error('package.json version must use X.Y.Z format');
    }
    return packageData.version;
}

export async function renderUserscript() {
    const version = await readProductVersion();
    const result = await build({
        entryPoints: [resolve(REPOSITORY_ROOT, 'src/userscript/entry.js')],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: ['chrome111'],
        charset: 'utf8',
        banner: { js: `'use strict';` },
        legalComments: 'none',
        sourcemap: false,
        logLevel: 'silent'
    });
    const runtime = result.outputFiles[0].text.replaceAll(VERSION_TOKEN, version).trimStart();
    if (runtime.includes(VERSION_TOKEN)) throw new Error('userscript version token was not fully replaced');

    return [
        createUserscriptMetadata(version),
        '',
        '// GENERATED FILE. DO NOT EDIT DIRECTLY.',
        '// Source files are under /src.',
        runtime
    ].join('\n');
}

export async function buildUserscript() {
    const output = await renderUserscript();
    await writeFile(USERSCRIPT_OUTPUT, output, 'utf8');
    return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildUserscript();
    console.log(`Built ${USERSCRIPT_OUTPUT}`);
}
