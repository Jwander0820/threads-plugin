import assert from 'node:assert/strict';
import test from 'node:test';

import {
    consumeNetworkDisclosureConfirmation,
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
