import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import yazl from 'yazl';

import { buildExtension, EXTENSION_OUTPUT, REPOSITORY_ROOT } from './build-extension.mjs';

export const ARTIFACTS_DIR = resolve(REPOSITORY_ROOT, 'artifacts');
// ZIP stores DOS timestamps in local calendar fields. Constructing local midnight
// makes those bytes identical even when the build host uses another time zone.
const DETERMINISTIC_MTIME = new Date(2026, 0, 1, 0, 0, 0, 0);

async function readVersion() {
    return JSON.parse(await readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8')).version;
}

export async function packageBuiltExtension({
    extensionOutput = EXTENSION_OUTPUT,
    artifactsDir = ARTIFACTS_DIR,
    version
} = {}) {
    if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
        throw new Error('package version must be a three-part numeric version');
    }
    const resolvedExtensionOutput = resolve(extensionOutput);
    const resolvedArtifactsDir = resolve(artifactsDir);
    const entries = (await readdir(resolvedExtensionOutput, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => ({
            archivePath: relative(resolvedExtensionOutput, resolve(entry.parentPath, entry.name))
                .split(sep).join('/'),
            diskPath: resolve(entry.parentPath, entry.name)
        }))
        .sort((left, right) => left.archivePath < right.archivePath
            ? -1
            : Number(left.archivePath > right.archivePath));
    if (!entries.length) throw new Error('cannot package an empty extension output');

    // Snapshot every input before writing the archive so a concurrent filesystem
    // change cannot produce an internally inconsistent package.
    const snapshots = await Promise.all(entries.map(async (entry) => ({
        ...entry,
        bytes: await readFile(entry.diskPath)
    })));
    await mkdir(resolvedArtifactsDir, { recursive: true });
    const zipPath = resolve(resolvedArtifactsDir, `threads-plugin-chrome-${version}.zip`);
    await rm(zipPath, { force: true });
    const archive = new yazl.ZipFile();
    const archiveBytesPromise = new Promise((resolvePromise, reject) => {
        const chunks = [];
        archive.outputStream.on('data', (chunk) => chunks.push(chunk));
        archive.outputStream.on('end', () => resolvePromise(Buffer.concat(chunks)));
        archive.outputStream.on('error', reject);
        archive.on('error', reject);
    });
    for (const entry of snapshots) {
        archive.addBuffer(entry.bytes, entry.archivePath, {
            mtime: DETERMINISTIC_MTIME,
            mode: 0o100644,
            compressionLevel: 9,
            forceDosTimestamp: true
        });
    }
    archive.end();
    const bytes = await archiveBytesPromise;
    await writeFile(zipPath, bytes);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await writeFile(`${zipPath}.sha256`, `${checksum}  ${basename(zipPath)}\n`, 'utf8');
    return { zipPath, checksum };
}

export async function packageExtension() {
    await buildExtension();
    return packageBuiltExtension({ version: await readVersion() });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await packageExtension();
    console.log(`Packaged ${result.zipPath}`);
    console.log(`SHA256 ${result.checksum}`);
}
