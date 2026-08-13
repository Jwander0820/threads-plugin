import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import yauzl from 'yauzl';

import { packageBuiltExtension } from '../scripts/package-extension.mjs';

async function createFixture(root) {
    const files = new Map([
        ['z-last.txt', Buffer.from('last\n')],
        ['manifest.json', Buffer.from('{"manifest_version":3,"version":"1.2.3"}\n')],
        ['icons/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
        ['B-before-lowercase.js', Buffer.from('upper\n')],
        ['a-first.js', Buffer.from('lower\n')]
    ]);
    await mkdir(resolve(root, 'icons'), { recursive: true });
    for (const [name, bytes] of files) {
        await writeFile(resolve(root, ...name.split('/')), bytes);
    }
    return files;
}

async function readEntries(path) {
    return new Promise((resolvePromise, reject) => {
        yauzl.open(path, { lazyEntries: true }, (error, archive) => {
            if (error) { reject(error); return; }
            const entries = [];
            archive.on('entry', (entry) => {
                entries.push({
                    name: entry.fileName,
                    modified: entry.getLastModDate(),
                    extraFieldIds: entry.extraFields.map((field) => field.id)
                });
                archive.readEntry();
            });
            archive.on('end', () => resolvePromise(entries));
            archive.on('error', reject);
            archive.readEntry();
        });
    });
}

test('built output packages deterministically across mtimes and host time zones', async (t) => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), 'threads-plugin-package-test-'));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const extensionOutput = resolve(tempRoot, 'built');
    const files = await createFixture(extensionOutput);

    const first = await packageBuiltExtension({
        extensionOutput,
        artifactsDir: resolve(tempRoot, 'first'),
        version: '1.2.3'
    });
    const changedTime = new Date('2034-05-06T07:08:09.000Z');
    await Promise.all([...files.keys()].map((name) =>
        utimes(resolve(extensionOutput, ...name.split('/')), changedTime, changedTime)
    ));
    const second = await packageBuiltExtension({
        extensionOutput,
        artifactsDir: resolve(tempRoot, 'second'),
        version: '1.2.3'
    });
    const [firstBytes, secondBytes] = await Promise.all([
        readFile(first.zipPath), readFile(second.zipPath)
    ]);
    assert.deepEqual(firstBytes, secondBytes);
    assert.equal(first.checksum, second.checksum);
    assert.equal(first.checksum, createHash('sha256').update(firstBytes).digest('hex'));
    assert.equal(
        await readFile(`${first.zipPath}.sha256`, 'utf8'),
        `${first.checksum}  threads-plugin-chrome-1.2.3.zip\n`
    );

    const entries = await readEntries(first.zipPath);
    assert.deepEqual(entries.map(({ name }) => name), [
        'B-before-lowercase.js', 'a-first.js', 'icons/icon.png', 'manifest.json', 'z-last.txt'
    ]);
    entries.forEach(({ modified, extraFieldIds }) => {
        assert.deepEqual(
            [modified.getFullYear(), modified.getMonth(), modified.getDate(), modified.getHours()],
            [2026, 0, 1, 0]
        );
        assert.equal(extraFieldIds.includes(0x5455), false);
    });
    for (const [name, bytes] of files) {
        assert.deepEqual(await readFile(resolve(extensionOutput, ...name.split('/'))), bytes);
    }

    const moduleUrl = new URL('../scripts/package-extension.mjs', import.meta.url).href;
    const originalTimezone = process.env.TZ;
    try {
        const packageInZone = async (zone, outputName) => {
            process.env.TZ = zone;
            const zoneModule = await import(`${moduleUrl}?zone=${encodeURIComponent(zone)}`);
            const artifactsDir = resolve(tempRoot, outputName);
            await zoneModule.packageBuiltExtension({ extensionOutput, artifactsDir, version: '1.2.3' });
            return readFile(resolve(artifactsDir, 'threads-plugin-chrome-1.2.3.zip'));
        };
        const westBytes = await packageInZone('Etc/GMT+11', 'west');
        const eastBytes = await packageInZone('Pacific/Kiritimati', 'east');
        assert.deepEqual(westBytes, eastBytes);
    } finally {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
    }
});

test('release pipeline keeps safe versions, build-first packaging, and integration coverage', async (t) => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), 'threads-plugin-package-contract-test-'));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    const extensionOutput = resolve(tempRoot, 'built');
    const artifactsDir = resolve(tempRoot, 'artifacts');
    await mkdir(extensionOutput, { recursive: true });
    await writeFile(resolve(extensionOutput, 'manifest.json'), '{}\n');
    await assert.rejects(
        packageBuiltExtension({ extensionOutput, artifactsDir, version: '../escape' }),
        /three-part numeric version/
    );
    await assert.rejects(stat(artifactsDir), { code: 'ENOENT' });

    const repositoryRoot = resolve(import.meta.dirname, '..');
    const [packageData, packageSource] = await Promise.all([
        readFile(resolve(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
        readFile(resolve(repositoryRoot, 'scripts/package-extension.mjs'), 'utf8')
    ]);
    assert.equal(
        packageData.scripts['test:pipeline'],
        'node --test --test-isolation=none tests/package-extension.test.mjs'
    );
    assert.match(
        packageSource,
        /export async function packageExtension[\s\S]*?await buildExtension\(\)[\s\S]*?packageBuiltExtension/
    );
    for (const required of [
        'tests/chrome/main-capture-runtime.test.mjs',
        'tests/chrome/service-worker.test.mjs'
    ]) {
        assert.equal(packageData.scripts['test:e2e'].includes(required), true);
    }
});
