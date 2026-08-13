import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import yazl from 'yazl';

import { buildExtension, EXTENSION_OUTPUT } from './build-extension.mjs';
import { buildStoreAssets } from './build-store-assets.mjs';
import { buildUserscript, REPOSITORY_ROOT } from './build-userscript.mjs';
import { packageBuiltExtension, ARTIFACTS_DIR } from './package-extension.mjs';

const DETERMINISTIC_MTIME = new Date(2026, 0, 1, 0, 0, 0, 0);
const ROOT_FILES = Object.freeze([
    '.gitignore',
    'CHANGELOG.md',
    'LICENSE',
    'PRIVACY.md',
    'README.md',
    'package.json',
    'package-lock.json',
    'threads-plugin.user.js'
]);
const SOURCE_DIRECTORIES = Object.freeze([
    'config',
    'docs',
    'extension',
    'scripts',
    'src',
    'tests'
]);

function hash(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

async function collectDirectory(directoryName) {
    const directory = resolve(REPOSITORY_ROOT, directoryName);
    return (await readdir(directory, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => ({
            archivePath: relative(REPOSITORY_ROOT, resolve(entry.parentPath, entry.name))
                .split(sep).join('/'),
            diskPath: resolve(entry.parentPath, entry.name)
        }));
}

async function readVersion() {
    const packageData = JSON.parse(await readFile(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(packageData.version || '')) {
        throw new Error('package.json version must use X.Y.Z format');
    }
    return packageData.version;
}

export async function packageProjectHandoff() {
    const version = await readVersion();
    await Promise.all([
        buildUserscript(),
        buildStoreAssets(),
        buildExtension()
    ]);
    const chromePackage = await packageBuiltExtension({
        extensionOutput: EXTENSION_OUTPUT,
        artifactsDir: ARTIFACTS_DIR,
        version
    });

    const sourceEntries = (await Promise.all(SOURCE_DIRECTORIES.map(collectDirectory))).flat();
    const distEntries = await collectDirectory('dist/chrome-extension');
    const chromeChecksumPath = `${chromePackage.zipPath}.sha256`;
    const entries = [
        ...ROOT_FILES.map((archivePath) => ({
            archivePath,
            diskPath: resolve(REPOSITORY_ROOT, archivePath)
        })),
        ...sourceEntries,
        ...distEntries,
        {
            archivePath: `artifacts/${basename(chromePackage.zipPath)}`,
            diskPath: chromePackage.zipPath
        },
        {
            archivePath: `artifacts/${basename(chromeChecksumPath)}`,
            diskPath: chromeChecksumPath
        }
    ].sort((left, right) => left.archivePath < right.archivePath
        ? -1
        : Number(left.archivePath > right.archivePath));

    const duplicate = entries.find((entry, index) =>
        index > 0 && entry.archivePath === entries[index - 1].archivePath
    );
    if (duplicate) throw new Error(`duplicate handoff entry: ${duplicate.archivePath}`);
    if (entries.some((entry) =>
        entry.archivePath.startsWith('/') ||
        entry.archivePath.includes('..') ||
        /^(?:\.git|node_modules|assets)(?:\/|$)/.test(entry.archivePath)
    )) {
        throw new Error('unsafe or excluded handoff entry');
    }

    const snapshots = await Promise.all(entries.map(async (entry) => ({
        ...entry,
        bytes: await readFile(entry.diskPath)
    })));
    const contentsManifest = snapshots
        .map((entry) => `${hash(entry.bytes)}  ${entry.archivePath}`)
        .join('\n') + '\n';

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    const zipPath = resolve(ARTIFACTS_DIR, `threads-plugin-${version}-project-handoff.zip`);
    await rm(zipPath, { force: true });

    const archive = new yazl.ZipFile();
    const archiveBytesPromise = new Promise((resolvePromise, reject) => {
        const chunks = [];
        archive.outputStream.on('data', (chunk) => chunks.push(chunk));
        archive.outputStream.on('end', () => resolvePromise(Buffer.concat(chunks)));
        archive.outputStream.on('error', reject);
        archive.on('error', reject);
    });
    const entryOptions = {
        mtime: DETERMINISTIC_MTIME,
        mode: 0o100644,
        compressionLevel: 9,
        forceDosTimestamp: true
    };
    for (const entry of snapshots) {
        archive.addBuffer(entry.bytes, entry.archivePath, entryOptions);
    }
    archive.addBuffer(Buffer.from(contentsManifest, 'utf8'), 'HANDOFF_CONTENTS.sha256', entryOptions);
    archive.end();

    const bytes = await archiveBytesPromise;
    await writeFile(zipPath, bytes);
    const checksum = hash(bytes);
    await writeFile(`${zipPath}.sha256`, `${checksum}  ${basename(zipPath)}\n`, 'utf8');
    return {
        zipPath,
        checksum,
        entryCount: snapshots.length + 1,
        chromePackage
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await packageProjectHandoff();
    console.log(`Packaged project handoff: ${result.zipPath}`);
    console.log(`Entries: ${result.entryCount}`);
    console.log(`SHA256 ${result.checksum}`);
}
