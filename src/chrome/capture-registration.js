import { canCaptureNetwork } from '../shared/consent-state.js';
import { THREADS_MATCHES } from '../../config/targets.mjs';
import { CONSENT_STORAGE_KEY } from './storage-keys.js';

export const CAPTURE_SCRIPT_ID = 'threads-plugin-main-capture-v1';

export function createCaptureScriptDescriptor() {
    return Object.freeze({
        id: CAPTURE_SCRIPT_ID,
        matches: Object.freeze([...THREADS_MATCHES]),
        js: Object.freeze(['main-world-capture.js']),
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: false,
        persistAcrossSessions: true
    });
}

function sameStringSet(actual, expected) {
    return Array.isArray(actual) && actual.length === expected.length &&
        [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function sameStringList(actual, expected) {
    return Array.isArray(actual) && actual.length === expected.length &&
        actual.every((value, index) => value === expected[index]);
}

export function isExpectedCaptureScript(script) {
    const expected = createCaptureScriptDescriptor();
    return Boolean(script) &&
        script.id === expected.id &&
        sameStringSet(script.matches, expected.matches) &&
        sameStringList(script.js, expected.js) &&
        (script.css === undefined || sameStringList(script.css, [])) &&
        (script.excludeMatches === undefined || sameStringSet(script.excludeMatches, [])) &&
        (script.includeGlobs === undefined || sameStringSet(script.includeGlobs, [])) &&
        (script.excludeGlobs === undefined || sameStringSet(script.excludeGlobs, [])) &&
        script.runAt === expected.runAt &&
        script.world === expected.world &&
        script.allFrames === expected.allFrames &&
        script.persistAcrossSessions === expected.persistAcrossSessions &&
        (script.matchOriginAsFallback === undefined || script.matchOriginAsFallback === false);
}

export async function reconcileCaptureRegistration({ scripting, storage }) {
    const [stored, registered] = await Promise.all([
        storage.get(CONSENT_STORAGE_KEY),
        scripting.getRegisteredContentScripts({ ids: [CAPTURE_SCRIPT_ID] })
    ]);
    const shouldRegister = canCaptureNetwork(stored[CONSENT_STORAGE_KEY]);
    const current = registered.find((script) => script.id === CAPTURE_SCRIPT_ID);
    if (!shouldRegister && !current) return 'unchanged_unregistered';
    if (shouldRegister && isExpectedCaptureScript(current)) return 'unchanged_registered';

    if (current) {
        await scripting.unregisterContentScripts({ ids: [CAPTURE_SCRIPT_ID] });
    }
    if (!shouldRegister) return 'unregistered';

    await scripting.registerContentScripts([{ ...createCaptureScriptDescriptor() }]);
    return current ? 'repaired' : 'registered';
}
