import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import yauzl from 'yauzl';

import { ARTIFACTS_DIR } from './package-extension.mjs';
import { REPOSITORY_ROOT } from './build-userscript.mjs';

function hash(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

async function readArchive(path) {
    return new Promise((resolvePromise, reject) => {
        yauzl.open(path, { lazyEntries: true }, (error, archive) => {
            if (error) {
                reject(error);
                return;
            }
            const entries = new Map();
            archive.on('entry', (entry) => {
                if (/\/$/.test(entry.fileName)) {
                    archive.readEntry();
                    return;
                }
                archive.openReadStream(entry, (streamError, stream) => {
                    if (streamError) {
                        reject(streamError);
                        return;
                    }
                    const chunks = [];
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('end', () => {
                        if (entries.has(entry.fileName)) {
                            reject(new Error(`duplicate handoff entry: ${entry.fileName}`));
                            return;
                        }
                        entries.set(entry.fileName, Buffer.concat(chunks));
                        archive.readEntry();
                    });
                    stream.on('error', reject);
                });
            });
            archive.on('end', () => resolvePromise(entries));
            archive.on('error', reject);
            archive.readEntry();
        });
    });
}

const version = JSON.parse(
    await readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8')
).version;
const zipPath = resolve(ARTIFACTS_DIR, `threads-plugin-${version}-project-handoff.zip`);
const sidecarPath = `${zipPath}.sha256`;
const [zipBytes, sidecar, entries] = await Promise.all([
    readFile(zipPath),
    readFile(sidecarPath, 'utf8'),
    readArchive(zipPath)
]);
const checksum = hash(zipBytes);
if (sidecar !== `${checksum}  ${basename(zipPath)}\n`) {
    throw new Error('project handoff checksum sidecar mismatch');
}

for (const required of [
    'README.md',
    'docs/ARCHITECTURE.md',
    'docs/SECURITY_REVIEW.md',
    'docs/TEST_MATRIX.md',
    'docs/store-listing.md',
    'package.json',
    'package-lock.json',
    'src/shared/threads-runtime.js',
    'src/userscript/entry.js',
    'src/chrome/content-entry.js',
    'scripts/build-all.mjs',
    'scripts/package-handoff.mjs',
    'threads-plugin.user.js',
    'dist/chrome-extension/manifest.json',
    'dist/chrome-extension/content.js',
    `artifacts/threads-plugin-chrome-${version}.zip`,
    `artifacts/threads-plugin-chrome-${version}.zip.sha256`,
    'docs/store-assets/screenshot-01.png',
    'docs/store-assets/small-promo-440x280.png',
    'HANDOFF_CONTENTS.sha256'
]) {
    if (!entries.has(required)) throw new Error(`project handoff missing required entry: ${required}`);
}
for (const name of entries.keys()) {
    if (
        name.startsWith('/') ||
        name.includes('..') ||
        /^(?:\.git|node_modules|assets)(?:\/|$)/.test(name) ||
        /^artifacts\/manual-test-unpacked-/i.test(name)
    ) {
        throw new Error(`project handoff contains unsafe or excluded entry: ${name}`);
    }
}

const expectedHashes = new Map(
    entries.get('HANDOFF_CONTENTS.sha256').toString('utf8').trimEnd()
        .split('\n')
        .map((line) => {
            const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
            if (!match) throw new Error(`invalid handoff contents hash line: ${line}`);
            return [match[2], match[1]];
        })
);
if (expectedHashes.size !== entries.size - 1) {
    throw new Error('project handoff contents hash count mismatch');
}
for (const [name, bytes] of entries) {
    if (name === 'HANDOFF_CONTENTS.sha256') continue;
    if (expectedHashes.get(name) !== hash(bytes)) {
        throw new Error(`project handoff entry hash mismatch: ${name}`);
    }
}

console.log(`Project handoff verified: ${basename(zipPath)}`);
console.log(`Entries: ${entries.size}`);
console.log(`SHA256 ${checksum}`);
