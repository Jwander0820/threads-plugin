import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CAPTURE_SCRIPT_ID,
    createCaptureScriptDescriptor,
    isExpectedCaptureScript,
    reconcileCaptureRegistration
} from '../../src/chrome/capture-registration.js';
import {
    acceptPageDisclosure,
    setNetworkCaptureConsent
} from '../../src/shared/consent-state.js';

function fixture({ consent, registered = [] }) {
    const calls = [];
    return {
        calls,
        dependencies: {
            storage: { async get() { return { consent }; } },
            scripting: {
                async getRegisteredContentScripts() { return registered; },
                async registerContentScripts(scripts) { calls.push(['register', scripts]); },
                async unregisterContentScripts(filter) { calls.push(['unregister', filter]); }
            }
        }
    };
}

test('capture registration remains absent by default', async () => {
    const { calls, dependencies } = fixture({ consent: acceptPageDisclosure() });
    assert.equal(await reconcileCaptureRegistration(dependencies), 'unchanged_unregistered');
    assert.deepEqual(calls, []);
});

test('separate opt in registers a persistent top-frame MAIN script', async () => {
    const consent = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const { calls, dependencies } = fixture({ consent });
    assert.equal(await reconcileCaptureRegistration(dependencies), 'registered');
    const script = calls[0][1][0];
    assert.equal(script.id, CAPTURE_SCRIPT_ID);
    assert.equal(script.world, 'MAIN');
    assert.equal(script.runAt, 'document_start');
    assert.equal(script.allFrames, false);
    assert.equal(script.persistAcrossSessions, true);
    assert.equal(isExpectedCaptureScript(script), true);
});

test('an exact registered descriptor remains unchanged', async () => {
    const consent = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const { calls, dependencies } = fixture({
        consent,
        registered: [{ ...createCaptureScriptDescriptor() }]
    });
    assert.equal(await reconcileCaptureRegistration(dependencies), 'unchanged_registered');
    assert.deepEqual(calls, []);
});

test('descriptor drift is unregistered and replaced before capture continues', async () => {
    const consent = setNetworkCaptureConsent(acceptPageDisclosure(), true);
    const drifted = {
        ...createCaptureScriptDescriptor(),
        matches: ['https://www.threads.com/*'],
        world: 'ISOLATED'
    };
    const { calls, dependencies } = fixture({ consent, registered: [drifted] });

    assert.equal(await reconcileCaptureRegistration(dependencies), 'repaired');
    assert.deepEqual(calls[0], ['unregister', { ids: [CAPTURE_SCRIPT_ID] }]);
    assert.equal(calls[1][0], 'register');
    assert.equal(isExpectedCaptureScript(calls[1][1][0]), true);
});

test('unexpected optional execution fields count as descriptor drift', () => {
    const exact = { ...createCaptureScriptDescriptor() };
    assert.equal(isExpectedCaptureScript({ ...exact, css: ['unexpected.css'] }), false);
    assert.equal(isExpectedCaptureScript({ ...exact, excludeMatches: ['https://www.threads.com/messages/*'] }), false);
    assert.equal(isExpectedCaptureScript({ ...exact, matchOriginAsFallback: true }), false);
});

test('turning capture off unregisters the dynamic script', async () => {
    const { calls, dependencies } = fixture({
        consent: acceptPageDisclosure(),
        registered: [{ id: CAPTURE_SCRIPT_ID }]
    });
    assert.equal(await reconcileCaptureRegistration(dependencies), 'unregistered');
    assert.deepEqual(calls, [['unregister', { ids: [CAPTURE_SCRIPT_ID] }]]);
});
