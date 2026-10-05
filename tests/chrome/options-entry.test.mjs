import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_OPTIONS } from '../../src/shared/options.js';
import { acceptPageDisclosure } from '../../src/shared/consent-state.js';

import {
    consumeNetworkDisclosureConfirmation,
    bootstrapOptionsPage,
    isNetworkDisclosureConfirmed,
    openNetworkDisclosure
} from '../../src/chrome/options-entry.js';

test('every advanced-capture prompt clears a previous confirmation', () => {
    let opens = 0;
    const dialog = {
        returnValue: 'confirm',
        showModal() { opens += 1; }
    };

    openNetworkDisclosure(dialog);
    assert.equal(opens, 1);
    assert.equal(dialog.returnValue, '');
    assert.equal(isNetworkDisclosureConfirmed(dialog), false);
});

function settingsFixture() {
    let release;
    let requested;
    const optionsRequested = new Promise((resolve) => { requested = resolve; });
    const delayedOptions = new Promise((resolve) => { release = resolve; });
    const stored = { options: { ...DEFAULT_OPTIONS, enableBatchMediaDownload: false, hoverScanIntervalMs: 220 }, consent: acceptPageDisclosure() };
    const nodes = new Map();
    const writes = [];
    const getNode = (id) => {
        if (!nodes.has(id)) nodes.set(id, {
            checked: false, value: '', disabled: false, textContent: '',
            listeners: new Map(), classList: { toggle() {} },
            addEventListener(type, handler) { this.listeners.set(type, handler); }
        });
        return nodes.get(id);
    };
    const environment = {
        document: { getElementById: getNode, querySelectorAll: () => [], documentElement: {} },
        window: { setTimeout() {} },
        chrome: {
            runtime: { getURL: (path) => `chrome-extension://test/${path}` },
            i18n: { getMessage: (key, substitutions = []) => key === 'runtimeLocale' ? 'en' : [key, ...substitutions].join(':') },
            storage: { local: {
                async get(key) {
                    if (key === 'options') { requested(); await delayedOptions; }
                    return stored;
                },
                async set(value) { writes.push(value); Object.assign(stored, value); }
            } }
        },
        async fetch() { return { ok: true, async json() { return {}; } }; }
    };
    return { environment, getNode, stored, writes, release, optionsRequested };
}

test('settings loading blocks submission and reset until stored values are rendered', async () => {
    const f = settingsFixture();
    const startup = bootstrapOptionsPage(f.environment);
    await f.optionsRequested;
    const submit = f.getNode('options-form').listeners.get('submit');
    const event = { preventDefault() {}, isTrusted: true };
    assert.equal(f.getNode('options-controls').disabled, true);
    await submit(event);
    await f.getNode('reset-options').listeners.get('click')(event);
    await f.getNode('enable-page-processing').listeners.get('click')(event);
    assert.deepEqual(f.writes, []);
    assert.equal(f.stored.options.hoverScanIntervalMs, 220);
    f.release();
    await startup;
    assert.equal(f.getNode('options-controls').disabled, false);
    assert.equal(f.getNode('hover-scan-interval').value, 220);
    assert.equal(f.getNode('enable-batch-media-download').checked, false);
    f.getNode('enable-copy-post-text').checked = false;
    await submit(event);
    assert.equal(f.writes.length, 1);
    assert.equal(f.stored.options.enableCopyPostText, false);
    assert.equal(f.stored.options.enableBatchMediaDownload, false);
    assert.equal(f.stored.options.hoverScanIntervalMs, 220);
});

test('failed settings reads leave the form locked and never save its empty fields', async () => {
    const f = settingsFixture();
    const originalGet = f.environment.chrome.storage.local.get;
    f.environment.chrome.storage.local.get = async (key) => {
        if (key === 'options') throw new Error('storage_unavailable');
        return originalGet(key);
    };
    await assert.rejects(bootstrapOptionsPage(f.environment), /storage_unavailable/);
    await f.getNode('options-form').listeners.get('submit')({ preventDefault() {} });
    assert.equal(f.getNode('options-controls').disabled, true);
    assert.match(f.getNode('save-status').textContent, /storage_unavailable/);
    assert.deepEqual(f.writes, []);
});

test('Escape-style close cannot reuse a previous confirmation', () => {
    const dialog = {
        returnValue: 'confirm',
        showModal() {}
    };

    openNetworkDisclosure(dialog);
    // An Escape close request supplies no new result, so returnValue remains unchanged.
    assert.equal(dialog.returnValue, '');
    assert.equal(isNetworkDisclosureConfirmed(dialog), false);
    assert.equal(consumeNetworkDisclosureConfirmation(dialog), false);

    dialog.returnValue = 'confirm';
    assert.equal(isNetworkDisclosureConfirmed(dialog), true);
    assert.equal(consumeNetworkDisclosureConfirmation(dialog), true);
    assert.equal(dialog.returnValue, '');
});
