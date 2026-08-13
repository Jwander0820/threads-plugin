import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import yauzl from 'yauzl';

import { ARTIFACTS_DIR } from './package-extension.mjs';
import { REPOSITORY_ROOT } from './build-extension.mjs';

const version = JSON.parse(await readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8')).version;
const zipPath = resolve(ARTIFACTS_DIR, `threads-plugin-chrome-${version}.zip`);
const checksumPath = `${zipPath}.sha256`;
const expectedFiles = new Set([
    'manifest.json', 'content.js', 'main-world-capture.js', 'service-worker.js',
    'options.html', 'options.css', 'options.js', 'privacy.html',
    'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png'
]);
async function readZipEntries(path) {
    return new Promise((resolvePromise, reject) => {
        yauzl.open(path, { lazyEntries: true }, (openError, archive) => {
            if (openError) { reject(openError); return; }
            const entries = new Map();
            archive.on('entry', (entry) => {
                if (/\/$/.test(entry.fileName)) { archive.readEntry(); return; }
                const normalizedName = String(entry.fileName).replace(/\\/g, '/');
                if (normalizedName.startsWith('/') || /^[A-Za-z]:/.test(normalizedName) ||
                    normalizedName.split('/').includes('..') || entries.has(normalizedName)) {
                    reject(new Error(`unsafe or duplicate ZIP entry: ${entry.fileName}`));
                    archive.close();
                    return;
                }
                archive.openReadStream(entry, (streamError, stream) => {
                    if (streamError) { reject(streamError); return; }
                    const chunks = [];
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('end', () => {
                        entries.set(normalizedName, Buffer.concat(chunks));
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

{
    const bytes = await readFile(zipPath);
    const actualChecksum = createHash('sha256').update(bytes).digest('hex');
    const checksumText = await readFile(checksumPath, 'utf8');
    if (checksumText.trim() !== `${actualChecksum}  ${basename(zipPath)}`) {
        throw new Error('package checksum mismatch');
    }
    const entries = await readZipEntries(zipPath);
    const actualFiles = new Set(entries.keys());
    if (actualFiles.size !== expectedFiles.size ||
        [...expectedFiles].some((path) => !actualFiles.has(path))) {
        throw new Error(`unexpected package entries: ${[...actualFiles].sort().join(', ')}`);
    }
    const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') || 'null');
    if (manifest.manifest_version !== 3 || manifest.version !== version) {
        throw new Error('packaged manifest version mismatch');
    }
    for (const requiredFile of expectedFiles) {
        if (!entries.get(requiredFile)?.length) throw new Error(`missing packaged file: ${requiredFile}`);
    }
    for (const [entryName, bytes] of entries) {
        const builtBytes = await readFile(resolve(REPOSITORY_ROOT, 'dist', 'chrome-extension', ...entryName.split('/')));
        if (!bytes.equals(builtBytes)) throw new Error(`packaged bytes differ from dist: ${entryName}`);
    }
    console.log(`Production package verified: ${basename(zipPath)}`);
    console.log(`SHA256 ${actualChecksum}`);
}
