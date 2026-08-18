import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import {
    CHROME_EXTENSION_PERMISSIONS,
    THREADS_MATCHES
} from '../config/targets.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..');
export const EXTENSION_OUTPUT = resolve(REPOSITORY_ROOT, 'dist', 'chrome-extension');

async function readProductVersion() {
    const packageData = JSON.parse(await readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'));
    if (typeof packageData.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageData.version)) {
        throw new Error('package.json version must use X.Y.Z format');
    }
    return packageData.version;
}

export async function createExtensionManifest() {
    const [baseManifest, version] = await Promise.all([
        readFile(resolve(REPOSITORY_ROOT, 'extension', 'manifest.base.json'), 'utf8').then(JSON.parse),
        readProductVersion()
    ]);
    return {
        ...baseManifest,
        version,
        permissions: [...CHROME_EXTENSION_PERMISSIONS],
        host_permissions: [...THREADS_MATCHES],
        content_scripts: [{
            matches: [...THREADS_MATCHES],
            js: ['content.js'],
            run_at: 'document_start',
            all_frames: false
        }]
    };
}

async function bundle(entryPoint, outfile) {
    await build({
        entryPoints: [resolve(REPOSITORY_ROOT, entryPoint)],
        outfile: resolve(EXTENSION_OUTPUT, outfile),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome111'],
        charset: 'utf8',
        legalComments: 'none',
        sourcemap: false,
        minify: false,
        logLevel: 'silent'
    });
}

export async function buildExtension() {
    await rm(EXTENSION_OUTPUT, { recursive: true, force: true });
    await mkdir(EXTENSION_OUTPUT, { recursive: true });
    const manifest = await createExtensionManifest();
    await Promise.all([
        bundle('src/chrome/content-entry.js', 'content.js'),
        bundle('src/chrome/service-worker.js', 'service-worker.js'),
        bundle('src/chrome/main-world-capture.js', 'main-world-capture.js'),
        bundle('src/chrome/options-entry.js', 'options.js'),
        bundle('src/chrome/static-localization-entry.js', 'static-localization.js'),
        writeFile(resolve(EXTENSION_OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
        copyFile(resolve(REPOSITORY_ROOT, 'extension', 'options.html'), resolve(EXTENSION_OUTPUT, 'options.html')),
        copyFile(resolve(REPOSITORY_ROOT, 'extension', 'options.css'), resolve(EXTENSION_OUTPUT, 'options.css')),
        copyFile(resolve(REPOSITORY_ROOT, 'extension', 'privacy.html'), resolve(EXTENSION_OUTPUT, 'privacy.html')),
        cp(resolve(REPOSITORY_ROOT, 'extension', 'icons'), resolve(EXTENSION_OUTPUT, 'icons'), { recursive: true }),
        cp(resolve(REPOSITORY_ROOT, 'extension', '_locales'), resolve(EXTENSION_OUTPUT, '_locales'), { recursive: true })
    ]);
    return EXTENSION_OUTPUT;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildExtension();
    console.log(`Built ${EXTENSION_OUTPUT}`);
}
