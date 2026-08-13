export const CURRENT_DISCLOSURE_VERSION = 1;

export const DEFAULT_CONSENT_STATE = Object.freeze({
    disclosureAcceptedVersion: 0,
    disclosureDeclinedVersion: 0,
    pageContentProcessingEnabled: false,
    networkCaptureEnabled: false
});

export function normalizeConsentState(value) {
    const stored = value && typeof value === 'object' ? value : {};
    const acceptedVersion = Number.isInteger(stored.disclosureAcceptedVersion)
        ? Math.max(0, stored.disclosureAcceptedVersion)
        : 0;
    const disclosureIsCurrent = acceptedVersion >= CURRENT_DISCLOSURE_VERSION;
    const declinedVersion = Number.isInteger(stored.disclosureDeclinedVersion)
        ? Math.max(0, stored.disclosureDeclinedVersion)
        : 0;
    const pageContentProcessingEnabled = disclosureIsCurrent &&
        stored.pageContentProcessingEnabled === true;

    return Object.freeze({
        disclosureAcceptedVersion: acceptedVersion,
        disclosureDeclinedVersion: declinedVersion,
        pageContentProcessingEnabled,
        networkCaptureEnabled: pageContentProcessingEnabled &&
            stored.networkCaptureEnabled === true
    });
}

export function acceptPageDisclosure(value = {}) {
    const current = normalizeConsentState(value);
    return Object.freeze({
        ...current,
        disclosureAcceptedVersion: CURRENT_DISCLOSURE_VERSION,
        disclosureDeclinedVersion: 0,
        pageContentProcessingEnabled: true
    });
}

export function declineOrRevokeConsent() {
    return Object.freeze({
        disclosureAcceptedVersion: 0,
        disclosureDeclinedVersion: CURRENT_DISCLOSURE_VERSION,
        pageContentProcessingEnabled: false,
        networkCaptureEnabled: false
    });
}

export function hasAnsweredDisclosure(value) {
    const state = normalizeConsentState(value);
    return state.disclosureAcceptedVersion >= CURRENT_DISCLOSURE_VERSION ||
        state.disclosureDeclinedVersion >= CURRENT_DISCLOSURE_VERSION;
}

export function canProcessPage(value) {
    return normalizeConsentState(value).pageContentProcessingEnabled;
}

export function canCaptureNetwork(value) {
    return normalizeConsentState(value).networkCaptureEnabled;
}

export function setNetworkCaptureConsent(value, enabled) {
    const current = normalizeConsentState(value);
    return Object.freeze({
        ...current,
        networkCaptureEnabled: current.pageContentProcessingEnabled && enabled === true
    });
}
