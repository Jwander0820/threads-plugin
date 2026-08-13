import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyRepository } from '../scripts/verify-threads-plugin.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, '..');
const BASE_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, 'threads-plugin.user.js'), 'utf8');
const BASE_PACKAGE = readFileSync(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8');

function verifyFixture(t, mutateSource) {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'threads-plugin-verifier-'));
    t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
    writeFileSync(resolve(fixtureRoot, 'threads-plugin.user.js'), mutateSource(BASE_SOURCE), 'utf8');
    writeFileSync(resolve(fixtureRoot, 'package.json'), BASE_PACKAGE, 'utf8');
    cpSync(
        resolve(REPOSITORY_ROOT, 'src', 'shared'),
        resolve(fixtureRoot, 'src', 'shared'),
        { recursive: true }
    );
    const errors = [];
    const result = verifyRepository(fixtureRoot, {
        log() {},
        error(message) {
            errors.push(message);
        }
    });
    return { result, errors };
}

test('verifier rejects every extra privileged metadata directive', async (t) => {
    const cases = [
        {
            name: 'extra grant',
            anchor: '// @grant        unsafeWindow',
            injected: '// @grant        unsafeWindow\n// @grant        GM_openInTab',
            expectedLabel: 'metadata @grant allowlist'
        },
        {
            name: 'extra connect host',
            anchor: '// @connect      *.fbcdn.net',
            injected: '// @connect      *.fbcdn.net\n// @connect      attacker.example',
            expectedLabel: 'metadata @connect allowlist'
        },
        {
            name: 'extra match origin',
            anchor: '// @match        https://threads.net/*',
            injected: '// @match        https://threads.net/*\n// @match        https://attacker.example/*',
            expectedLabel: 'metadata @match allowlist'
        }
    ];

    for (const fixture of cases) {
        await t.test(fixture.name, (subtest) => {
            const { result, errors } = verifyFixture(subtest, (source) => {
                assert.equal(source.includes(fixture.anchor), true);
                return source.replace(fixture.anchor, fixture.injected);
            });
            assert.equal(result.passed, false);
            assert.equal(errors.some((message) => message.includes(fixture.expectedLabel)), true);
        });
    }
});

test('verifier rejects userscript and runtime versions that drift from package.json', (t) => {
    const { result, errors } = verifyFixture(t, (source) => source
        .replace(/^\/\/ @version\s+\S+/m, '// @version      0.0.0')
        .replace(/(["'])v[^"']+ loaded\1/, "'v0.0.0 loaded'"));

    assert.equal(result.passed, false);
    assert.equal(errors.some((message) => message.includes('metadata/package version')), true);
    assert.equal(errors.some((message) => message.includes('runtime loaded-log/package version')), true);
});
