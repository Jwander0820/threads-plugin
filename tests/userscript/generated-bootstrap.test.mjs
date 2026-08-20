import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const GREASY_FORK_UPDATE_URL = 'https://update.greasyfork.org/scripts/584182/Threads%20Plugin.user.js';

test('generated userscript preserves the Greasy Fork update endpoint', async () => {
    const source = await readFile(new URL('../../threads-plugin.user.js', import.meta.url), 'utf8');

    assert.match(source, new RegExp(`^// @updateURL\\s+${GREASY_FORK_UPDATE_URL.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'));
    assert.match(source, new RegExp(`^// @downloadURL\\s+${GREASY_FORK_UPDATE_URL.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'));
});

test('generated userscript IIFE executes its real bootstrap and installs runtime capabilities', async () => {
    const [source, packageData] = await Promise.all([
        readFile(new URL('../../threads-plugin.user.js', import.meta.url), 'utf8'),
        readFile(new URL('../../package.json', import.meta.url), 'utf8').then(JSON.parse)
    ]);
    const logs = [];
    const errors = [];
    let styles = 0;
    let menus = 0;
    const menuLabels = [];
    let timerId = 0;
    const eventTarget = { addEventListener() {}, removeEventListener() {} };
    const document = {
        ...eventTarget,
        body: null,
        documentElement: {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const context = {
        ...eventTarget,
        document,
        location: { href: 'https://www.threads.com/', origin: 'https://www.threads.com' },
        navigator: { languages: ['en-US'] },
        console: {
            log(...args) { logs.push(args.join(' ')); },
            warn() {},
            error(...args) { errors.push(args.join(' ')); }
        },
        GM_getValue: () => null,
        GM_setValue() {},
        GM_addStyle() { styles += 1; return { remove() {} }; },
        GM_registerMenuCommand(label) { menus += 1; menuLabels.push(label); return menus; },
        GM_unregisterMenuCommand() {},
        GM_download() {},
        GM_xmlhttpRequest() {},
        GM_setClipboard() {},
        unsafeWindow: {},
        setTimeout() { timerId += 1; return timerId; },
        clearTimeout() {},
        setInterval() { timerId += 1; return timerId; },
        clearInterval() {},
        requestAnimationFrame() { timerId += 1; return timerId; },
        cancelAnimationFrame() {},
        AbortController,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        crypto,
        structuredClone
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'threads-plugin.user.js' });
    for (let index = 0; index < 4; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(styles, 1);
    assert.equal(menus, 6);
    assert.ok(menuLabels.some((label) => label.includes('Batch Download Picker')));
    assert.ok(menuLabels.some((label) => label.includes('Hover Scan Interval')));
    assert.ok(menuLabels.every((label) => !/[\u3400-\u9fff]/.test(label)));
    assert.equal(errors.length, 0);
    assert.ok(logs.some((line) => line.includes(`v${packageData.version} loaded`)));
});
