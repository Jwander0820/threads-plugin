import assert from 'node:assert/strict';
import test from 'node:test';

import {
    acceptPageDisclosure,
    canCaptureNetwork,
    canProcessPage,
    declineOrRevokeConsent,
    hasAnsweredDisclosure,
    normalizeConsentState,
    setNetworkCaptureConsent
} from '../../src/shared/consent-state.js';

test('fresh consent is dormant and unanswered', () => {
    const state = normalizeConsentState(null);
    assert.equal(canProcessPage(state), false);
    assert.equal(canCaptureNetwork(state), false);
    assert.equal(hasAnsweredDisclosure(state), false);
});

test('page disclosure enables only DOM processing', () => {
    const state = acceptPageDisclosure({ networkCaptureEnabled: true });
    assert.equal(canProcessPage(state), true);
    assert.equal(canCaptureNetwork(state), false);
    assert.equal(hasAnsweredDisclosure(state), true);
});

test('decline and revoke remain dormant without repeating disclosure', () => {
    const state = declineOrRevokeConsent();
    assert.equal(canProcessPage(state), false);
    assert.equal(canCaptureNetwork(state), false);
    assert.equal(hasAnsweredDisclosure(state), true);
});

test('network capture requires accepted page processing and a separate opt in', () => {
    assert.equal(canCaptureNetwork(setNetworkCaptureConsent(null, true)), false);
    const enabled = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    assert.equal(canCaptureNetwork(enabled), true);
    assert.equal(canCaptureNetwork(setNetworkCaptureConsent(enabled, false)), false);
    assert.equal(canCaptureNetwork(declineOrRevokeConsent()), false);
});
