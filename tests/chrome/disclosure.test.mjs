import assert from 'node:assert/strict';
import test from 'node:test';

import { showDisclosure } from '../../src/chrome/disclosure.js';

function createFixture() {
    const listeners = new Map();
    const buttons = [{ disabled: false }, { disabled: false }];
    const root = {
        id: '',
        innerHTML: '',
        removed: false,
        setAttribute() {},
        appendChild() {},
        remove() { this.removed = true; },
        querySelector(selector) {
            const button = selector.includes('accept') ? buttons[0] : buttons[1];
            return {
                ...button,
                addEventListener(type, listener) { listeners.set(selector + ':' + type, listener); },
                focus() {}
            };
        },
        querySelectorAll() { return buttons; }
    };
    const document = {
        documentElement: { appendChild() {} },
        getElementById() { return null; },
        createElement(tagName) {
            return tagName === 'div' ? root : { textContent: '' };
        }
    };
    return { buttons, document, listeners, root };
}

test('disclosure ignores synthetic clicks and accepts trusted clicks', async () => {
    const fixture = createFixture();
    let accepted = 0;
    showDisclosure({
        document: fixture.document,
        onAccept: async () => { accepted += 1; },
        onDecline: async () => {}
    });
    const listener = fixture.listeners.get('[data-action="accept"]:click');
    listener({ isTrusted: false });
    await Promise.resolve();
    assert.equal(accepted, 0);
    assert.equal(fixture.root.removed, false);
    listener({ isTrusted: true });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(accepted, 1);
    assert.equal(fixture.root.removed, true);
});
