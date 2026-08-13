import assert from 'node:assert/strict';
import test from 'node:test';

import { createUserscriptPlatformAdapter } from '../../src/userscript/platform-adapter.js';

test('userscript adapter presents asynchronous storage and capability interface', async () => {
    const writes = [];
    const environment = {
        GM_getValue: () => '{"enablePostMediaPicker":false}',
        GM_setValue: (key, value) => writes.push([key, value]),
        GM_setClipboard: (text) => writes.push(['clipboard', text]),
        GM_addStyle: () => {},
        GM_registerMenuCommand: () => 1,
        GM_unregisterMenuCommand: () => {}
    };
    const adapter = createUserscriptPlatformAdapter(environment);
    assert.equal(await adapter.loadOptions(), '{"enablePostMediaPicker":false}');
    assert.equal(await adapter.saveOptions({ enablePostMediaPicker: true }), true);
    assert.equal(await adapter.writeClipboard('post text'), true);
    assert.deepEqual(Object.keys(adapter).sort(), [
        'downloadMedia', 'installSettingsUi', 'installStyles', 'loadOptions',
        'requestMedia', 'saveOptions', 'subscribeOptions', 'writeClipboard'
    ]);
    assert.equal(writes.length, 2);
});

test('userscript style disposer removes the GM_addStyle node exactly once', async () => {
    let removeCalls = 0;
    const style = { remove: () => { removeCalls += 1; } };
    const adapter = createUserscriptPlatformAdapter({
        GM_addStyle: (cssText) => {
            assert.equal(cssText, '.threads-plugin { display: block; }');
            return style;
        }
    });

    const dispose = await adapter.installStyles('.threads-plugin { display: block; }');
    dispose();
    dispose();

    assert.equal(removeCalls, 1);
});

test('userscript fallback style disposer is idempotent', async () => {
    let removeCalls = 0;
    const style = {
        dataset: {},
        remove: () => { removeCalls += 1; }
    };
    const adapter = createUserscriptPlatformAdapter({
        document: {
            createElement: (tagName) => {
                assert.equal(tagName, 'style');
                return style;
            },
            documentElement: {
                appendChild: (node) => assert.equal(node, style)
            }
        }
    });

    const dispose = await adapter.installStyles('body { color: black; }');
    assert.equal(style.dataset.threadsPluginStyle, '1');
    assert.equal(style.textContent, 'body { color: black; }');
    dispose();
    dispose();

    assert.equal(removeCalls, 1);
});

test('userscript settings menu unregisters replaced and explicitly disposed commands once', async () => {
    let nextId = 0;
    const registered = [];
    const unregistered = [];
    const environment = {
        GM_registerMenuCommand: (label, run) => {
            const id = ++nextId;
            registered.push({ id, label, run });
            return id;
        },
        GM_unregisterMenuCommand: (id) => unregistered.push(id)
    };
    const adapter = createUserscriptPlatformAdapter(environment);
    const firstRun = () => {};
    const secondRun = () => {};

    const disposeFirst = await adapter.installSettingsUi({
        commands: [{ label: 'First', run: firstRun }]
    });
    const disposeSecond = await adapter.installSettingsUi({
        commands: [{ label: 'Second', run: secondRun }]
    });

    assert.deepEqual(registered, [
        { id: 1, label: 'First', run: firstRun },
        { id: 2, label: 'Second', run: secondRun }
    ]);
    assert.deepEqual(unregistered, [1]);

    disposeFirst();
    disposeSecond();
    disposeSecond();

    assert.deepEqual(unregistered, [1, 2]);
});

test('userscript settings menu cleans up partial registration failures exactly once', async () => {
    const unregistered = [];
    let registrationCalls = 0;
    const adapter = createUserscriptPlatformAdapter({
        GM_registerMenuCommand: () => {
            registrationCalls += 1;
            if (registrationCalls === 2) throw new Error('registration failed');
            return 42;
        },
        GM_unregisterMenuCommand: (id) => unregistered.push(id)
    });

    await assert.rejects(
        adapter.installSettingsUi({
            commands: [
                { label: 'First', run: () => {} },
                { label: 'Second', run: () => {} }
            ]
        }),
        /registration failed/
    );

    assert.deepEqual(unregistered, [42]);
});
