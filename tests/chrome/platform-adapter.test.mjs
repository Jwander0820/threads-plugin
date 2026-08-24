import assert from 'node:assert/strict';
import test from 'node:test';

import { createChromePlatformAdapter } from '../../src/chrome/platform-adapter.js';

test('Chrome adapter stores normalized options and bridges downloads', async () => {
    const writes = [];
    let changeListener;
    const chrome = {
        storage: {
            local: {
                async get() { return { options: { hoverScanIntervalMs: 9000 } }; },
                async set(value) { writes.push(value); }
            },
            onChanged: {
                addListener(listener) { changeListener = listener; },
                removeListener() {}
            }
        },
        runtime: {
            async sendMessage() { return { ok: true, downloadId: 7 }; }
        }
    };
    const adapter = createChromePlatformAdapter({ chrome, navigator: { clipboard: { async writeText() {} } } });
    assert.equal((await adapter.loadOptions()).hoverScanIntervalMs, 2000);
    assert.equal((await adapter.saveOptions({ backgroundScanIntervalMs: 1 })).backgroundScanIntervalMs, 3000);

    let loaded;
    adapter.downloadMedia({ url: 'https://cdninstagram.com/a.jpg', name: 'a.jpg', onload: (value) => { loaded = value; } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(loaded, { downloadId: 7 });

    let updated;
    adapter.subscribeOptions((value) => { updated = value; });
    changeListener({ options: { newValue: { hoverScanIntervalMs: -1 } } }, 'local');
    assert.equal(updated.hoverScanIntervalMs, 0);
    assert.equal(writes.length, 1);
    assert.equal(typeof adapter.subscribeConsent, 'function');
});

test('Chrome adapter stores the resolved Threads document locale only when it changes', async () => {
    const writes = [];
    let storedLocale = '';
    const chrome = {
        storage: {
            local: {
                async get() { return { lastDocumentLocale: storedLocale }; },
                async set(value) {
                    writes.push(value);
                    storedLocale = value.lastDocumentLocale;
                }
            },
            onChanged: { addListener() {}, removeListener() {} }
        },
        runtime: {}
    };
    const adapter = createChromePlatformAdapter({ chrome });

    assert.equal(await adapter.saveDocumentLocale('zh-Hant-TW'), 'zh-TW');
    assert.equal(await adapter.saveDocumentLocale('zh-TW'), 'zh-TW');
    assert.equal(await adapter.saveDocumentLocale('not a locale'), '');
    assert.equal(await adapter.saveDocumentLocale('ja'), 'en');
    assert.equal(await adapter.loadDocumentLocale(), 'en');
    assert.deepEqual(writes, [
        { lastDocumentLocale: 'zh-TW' },
        { lastDocumentLocale: 'en' }
    ]);
});
