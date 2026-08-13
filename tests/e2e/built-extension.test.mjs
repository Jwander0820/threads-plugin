import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const extensionRoot = resolve(repositoryRoot, 'dist', 'chrome-extension');

test('built extension fixture references the current packaged content bundle', async () => {
    const [fixture, builtContent, builtManifest] = await Promise.all([
        readFile(resolve(repositoryRoot, 'tests', 'e2e', 'fixture.html'), 'utf8'),
        readFile(resolve(extensionRoot, 'content.js'), 'utf8'),
        readFile(resolve(extensionRoot, 'manifest.json'), 'utf8').then(JSON.parse)
    ]);

    assert.match(fixture, /<script src="\/content\.js"><\/script>/);
    assert.equal(builtManifest.content_scripts[0].js[0], 'content.js');
    assert.match(builtContent, /threads-plugin-capture/);
    assert.match(builtContent, /SYNC_CAPTURE_STATE/);
    assert.match(builtContent, /tm-target-download-button/);
});
