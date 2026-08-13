import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { renderUserscript, USERSCRIPT_OUTPUT } from './build-userscript.mjs';
import { mkdtemp, readFile as readFileAgain, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { build } from 'esbuild';

async function collectJavaScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptFiles(path);
        return entry.isFile() && /\.[cm]?js$/i.test(entry.name) ? [path] : [];
    }));
    return nested.flat();
}

const [userscriptEntry, chromeEntry, buildAllSource, sharedSourcePaths] = await Promise.all([
    readFile(resolve(REPOSITORY_ROOT, 'src', 'userscript', 'entry.js'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'src', 'chrome', 'content-entry.js'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'scripts', 'build-all.mjs'), 'utf8'),
    collectJavaScriptFiles(resolve(REPOSITORY_ROOT, 'src', 'shared'))
]);

const architectureFailures = [];
for (const [label, source] of [
    ['userscript entry', userscriptEntry],
    ['Chrome content entry', chromeEntry]
]) {
    if (!source.includes("from '../shared/threads-runtime.js'")) {
        architectureFailures.push(`${label} does not import the shared runtime`);
    }
    if (!/\b(?:createThreadsRuntime|createRuntime)\s*\(/.test(source)) {
        architectureFailures.push(`${label} does not create the shared runtime`);
    }
}
for (const required of ['buildUserscript()', 'buildExtension()']) {
    if (!buildAllSource.includes(required)) {
        architectureFailures.push(`build-all does not invoke ${required}`);
    }
}
for (const path of sharedSourcePaths) {
    const source = await readFile(path, 'utf8');
    if (/\bGM_[A-Za-z0-9_]+\b|\bchrome\s*\./.test(source)) {
        architectureFailures.push(`platform API leaked into shared source: ${path}`);
    }
}
if (architectureFailures.length > 0) {
    architectureFailures.forEach((failure) => console.error(`Generated architecture contract failed: ${failure}`));
    process.exitCode = 1;
} else {
    console.log('Dual-platform architecture contract is current.');
}
import { createExtensionManifest, EXTENSION_OUTPUT, REPOSITORY_ROOT } from './build-extension.mjs';

const [actual, expected] = await Promise.all([
    readFile(USERSCRIPT_OUTPUT, 'utf8'),
    renderUserscript()
]);

const [actualManifest, expectedManifest] = await Promise.all([
    readFile(resolve(EXTENSION_OUTPUT, 'manifest.json'), 'utf8'),
    createExtensionManifest().then((manifest) => `${JSON.stringify(manifest, null, 2)}\n`)
]);

if (actual !== expected) {
    console.error('Generated userscript is stale. Run npm.cmd run build:userscript.');
    process.exitCode = 1;
} else {
    console.log('Generated userscript is current.');
}

if (actualManifest !== expectedManifest) {
    console.error('Generated extension manifest is stale. Run npm.cmd run build:extension.');
    process.exitCode = 1;
} else {
    console.log('Generated extension manifest is current.');
}

async function renderBundle(entryPoint) {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'threads-plugin-generated-'));
    const outputPath = resolve(tempDir, 'bundle.js');
    try {
        await build({
            entryPoints: [resolve(REPOSITORY_ROOT, entryPoint)],
            outfile: outputPath,
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
        return readFileAgain(outputPath, 'utf8');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

for (const [entryPoint, outputName] of [
    ['src/chrome/content-entry.js', 'content.js'],
    ['src/chrome/service-worker.js', 'service-worker.js'],
    ['src/chrome/main-world-capture.js', 'main-world-capture.js'],
    ['src/chrome/options-entry.js', 'options.js']
]) {
    const [actualBundle, expectedBundle] = await Promise.all([
        readFile(resolve(EXTENSION_OUTPUT, outputName), 'utf8'),
        renderBundle(entryPoint)
    ]);
    if (actualBundle !== expectedBundle) {
        console.error(`Generated extension bundle ${outputName} is stale. Run npm.cmd run build:extension.`);
        process.exitCode = 1;
    } else {
        console.log(`Generated extension bundle ${outputName} is current.`);
    }
}

for (const staticPath of ['options.html', 'options.css', 'privacy.html']) {
    const [sourceBytes, builtBytes] = await Promise.all([
        readFile(resolve(REPOSITORY_ROOT, 'extension', staticPath)),
        readFile(resolve(EXTENSION_OUTPUT, staticPath))
    ]);
    if (!sourceBytes.equals(builtBytes)) {
        console.error(`Generated extension static file ${staticPath} is stale. Run npm.cmd run build:extension.`);
        process.exitCode = 1;
    } else {
        console.log(`Generated extension static file ${staticPath} is current.`);
    }
}

const iconNames = (await readdir(resolve(REPOSITORY_ROOT, 'extension', 'icons'))).sort();
for (const iconName of iconNames) {
    const [sourceBytes, builtBytes] = await Promise.all([
        readFile(resolve(REPOSITORY_ROOT, 'extension', 'icons', iconName)),
        readFile(resolve(EXTENSION_OUTPUT, 'icons', iconName))
    ]);
    if (!sourceBytes.equals(builtBytes)) {
        console.error(`Generated extension icon ${iconName} is stale. Run npm.cmd run build:extension.`);
        process.exitCode = 1;
    } else {
        console.log(`Generated extension icon ${iconName} is current.`);
    }
}
