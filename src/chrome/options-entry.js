import {
    acceptPageDisclosure,
    canProcessPage,
    declineOrRevokeConsent,
    normalizeConsentState,
    setNetworkCaptureConsent
} from '../shared/consent-state.js';
import { DEFAULT_OPTIONS, normalizeOptions } from '../shared/options.js';
import { getExtensionMessage } from './i18n.js';
import { createChromePlatformAdapter } from './platform-adapter.js';

const IS_NODE_RUNTIME = typeof process !== 'undefined' && process.release?.name === 'node';

export function openNetworkDisclosure(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') {
        throw new TypeError('network disclosure dialog is required');
    }
    // returnValue survives showModal(), and an Escape close request may not replace it.
    // Reset it before every prompt so only this prompt's confirm button can opt in.
    dialog.returnValue = '';
    dialog.showModal();
}

export function isNetworkDisclosureConfirmed(dialog) {
    return dialog?.returnValue === 'confirm';
}

export function consumeNetworkDisclosureConfirmation(dialog) {
    if (!isNetworkDisclosureConfirmed(dialog)) return false;
    dialog.returnValue = '';
    return true;
}


if (!IS_NODE_RUNTIME) {
const platform = createChromePlatformAdapter(globalThis);
const byId = (id) => document.getElementById(id);
const message = (key, substitutions) => getExtensionMessage(key, substitutions);

function readForm() {
    return normalizeOptions({
        enablePostMediaPicker: byId('enable-post-media-picker').checked,
        hoverScanIntervalMs: byId('hover-scan-interval').value,
        layoutRefreshIntervalMs: byId('layout-refresh-interval').value,
        backgroundScanIntervalMs: byId('background-scan-interval').value,
        ignoreHorizontalOnlyScroll: byId('ignore-horizontal-scroll').checked
    });
}

function writeForm(options) {
    const normalized = normalizeOptions(options);
    byId('enable-post-media-picker').checked = normalized.enablePostMediaPicker;
    byId('hover-scan-interval').value = normalized.hoverScanIntervalMs;
    byId('layout-refresh-interval').value = normalized.layoutRefreshIntervalMs;
    byId('background-scan-interval').value = normalized.backgroundScanIntervalMs;
    byId('ignore-horizontal-scroll').checked = normalized.ignoreHorizontalOnlyScroll;
}

async function refreshConsent() {
    const consent = normalizeConsentState(await platform.loadConsent());
    const enabled = canProcessPage(consent);
    const status = byId('consent-status');
    status.textContent = message(enabled ? 'consentStatusEnabled' : 'consentStatusDisabled');
    status.classList.toggle('active', enabled);
    byId('enable-page-processing').disabled = enabled;
    byId('revoke-consent').disabled = !enabled;
    byId('network-capture-enabled').disabled = !enabled;
    byId('network-capture-enabled').checked = consent.networkCaptureEnabled;
}

byId('options-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await platform.saveOptions(readForm());
    const status = byId('save-status');
    status.textContent = message('savedStatus');
    window.setTimeout(() => { status.textContent = ''; }, 1800);
});

byId('reset-options').addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    writeForm(DEFAULT_OPTIONS);
    await platform.saveOptions(DEFAULT_OPTIONS);
    byId('save-status').textContent = message('defaultsRestoredStatus');
});

byId('enable-page-processing').addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    await platform.saveConsent(acceptPageDisclosure());
    await refreshConsent();
});

byId('revoke-consent').addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    await platform.saveConsent(declineOrRevokeConsent());
    await refreshConsent();
});

byId('network-capture-enabled').addEventListener('change', async (event) => {
    if (!event.isTrusted) return;
    if (event.target.checked) {
        event.target.checked = false;
        openNetworkDisclosure(byId('network-disclosure'));
        return;
    }
    const consent = await platform.loadConsent();
    await platform.saveConsent(setNetworkCaptureConsent(consent, false));
    await refreshConsent();
});

byId('network-disclosure').addEventListener('close', async () => {
    const disclosure = byId('network-disclosure');
    if (!consumeNetworkDisclosureConfirmation(disclosure)) return;
    const consent = await platform.loadConsent();
    await platform.saveConsent(setNetworkCaptureConsent(consent, true));
    await refreshConsent();
    byId('save-status').textContent = message('networkCaptureEnabledStatus');
});

async function bootstrapOptionsPage() {
    await Promise.all([
        platform.loadOptions().then(writeForm),
        refreshConsent()
    ]);
}

void bootstrapOptionsPage().catch((error) => {
    byId('save-status').textContent = message('settingsLoadFailedStatus', [error.message]);
});
}
