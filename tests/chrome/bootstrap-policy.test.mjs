import assert from 'node:assert/strict';
import test from 'node:test';

import { decideExtensionBootstrap } from '../../src/chrome/bootstrap-policy.js';
import {
    acceptPageDisclosure,
    declineOrRevokeConsent
} from '../../src/shared/consent-state.js';

test('fresh install shows disclosure without starting page runtime', () => {
    assert.deepEqual(decideExtensionBootstrap(null), {
        showDisclosure: true,
        startRuntime: false,
        sensitiveRoute: false,
        captureSource: null
    });
});

test('accepted disclosure starts isolated runtime without capture source', () => {
    assert.deepEqual(decideExtensionBootstrap(acceptPageDisclosure()), {
        showDisclosure: false,
        startRuntime: true,
        sensitiveRoute: false,
        captureSource: null
    });
});

test('declined disclosure stays dormant and does not nag', () => {
    assert.deepEqual(decideExtensionBootstrap(declineOrRevokeConsent()), {
        showDisclosure: false,
        startRuntime: false,
        sensitiveRoute: false,
        captureSource: null
    });
});

test('sensitive account and message routes stay fully dormant', () => {
    for (const path of ['/login/', '/accounts/edit/', '/messages/', '/settings/privacy/', '/%6dessages/', '/messages%2Fthread/1', '/%256dessages/']) {
        assert.deepEqual(decideExtensionBootstrap(acceptPageDisclosure(), `https://www.threads.com${path}`), {
            showDisclosure: false,
            startRuntime: false,
            sensitiveRoute: true,
            captureSource: null
        });
    }
});
