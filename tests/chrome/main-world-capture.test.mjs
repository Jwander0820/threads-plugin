import assert from 'node:assert/strict';
import test from 'node:test';

import { MAIN_CAPTURE_INSTALL_KEY } from '../../src/chrome/main-capture-runtime.js';

class WindowStub {
    constructor() {
        this.listeners = new Map();
        this.location = {
            href: 'https://www.threads.com/',
            origin: 'https://www.threads.com'
        };
        this.crypto = globalThis.crypto;
        this.fetch = async () => ({ clone() { return this; } });
        this.XMLHttpRequest = class {
            open() {}
            send() {}
            setRequestHeader() {}
        };
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
    }

    listenerCount(type) {
        return this.listeners.get(type)?.size || 0;
    }

    dispatchMessage(data) {
        const event = { data, origin: this.location.origin, source: this };
        Array.from(this.listeners.get('message') || []).forEach((listener) => listener(event));
    }

    postMessage() {}
}

test('repeated MAIN-world execution owns one STOP listener and can reinstall after stop', async (t) => {
    const previousWindow = globalThis.window;
    const environment = new WindowStub();
    globalThis.window = environment;
    t.after(() => {
        environment.dispatchMessage({
            marker: 'threads-plugin-capture',
            version: 1,
            type: 'STOP_CAPTURE'
        });
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    });

    const moduleUrl = new URL('../../src/chrome/main-world-capture.js', import.meta.url);
    await import(`${moduleUrl.href}?injection=1`);
    await import(`${moduleUrl.href}?injection=2`);

    assert.equal(environment[MAIN_CAPTURE_INSTALL_KEY].active, true);
    assert.equal(environment.listenerCount('message'), 1);

    environment.dispatchMessage({
        marker: 'threads-plugin-capture',
        version: 1,
        type: 'STOP_CAPTURE'
    });
    assert.equal(environment[MAIN_CAPTURE_INSTALL_KEY].active, false);
    assert.equal(environment.listenerCount('message'), 0);

    await import(`${moduleUrl.href}?injection=3`);
    assert.equal(environment[MAIN_CAPTURE_INSTALL_KEY].active, true);
    assert.equal(environment.listenerCount('message'), 1);
});
