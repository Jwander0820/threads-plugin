import {
    acceptPageDisclosure,
    canProcessPage,
    declineOrRevokeConsent,
    normalizeConsentState,
    setNetworkCaptureConsent
} from '../shared/consent-state.js';
import { DEFAULT_OPTIONS, normalizeOptions } from '../shared/options.js';
import { getExtensionMessage } from './i18n.js';
import { localizeStoredDocument } from './package-i18n.js';
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


export async function bootstrapOptionsPage(environment = globalThis) {
const { document, window } = environment;
const platform = createChromePlatformAdapter(environment);
const byId = (id) => document.getElementById(id);
let message = (key, substitutions) => getExtensionMessage(key, substitutions, environment.chrome);
let optionsReady = false;
byId('options-controls').disabled = true;

async function applyLocalization(languagePreference) {
    const localized = await localizeStoredDocument(
        document,
        environment,
        languagePreference ? { languagePreference } : {}
    );
    message = localized.message;
    return localized;
}

function readForm() {
    return normalizeOptions({
        enableCopyOriginalLink: byId('enable-copy-original-link').checked,
        enableCopyPostText: byId('enable-copy-post-text').checked,
        enableBatchMediaDownload: byId('enable-batch-media-download').checked,
        enablePerMediaDownload: byId('enable-per-media-download').checked,
        languagePreference: byId('language-preference').value,
        hoverScanIntervalMs: byId('hover-scan-interval').value,
        layoutRefreshIntervalMs: byId('layout-refresh-interval').value,
        backgroundScanIntervalMs: byId('background-scan-interval').value,
        ignoreHorizontalOnlyScroll: byId('ignore-horizontal-scroll').checked
    });
}

function writeForm(options) {
    const normalized = normalizeOptions(options);
    byId('enable-copy-original-link').checked = normalized.enableCopyOriginalLink;
    byId('enable-copy-post-text').checked = normalized.enableCopyPostText;
    byId('enable-batch-media-download').checked = normalized.enableBatchMediaDownload;
    byId('enable-per-media-download').checked = normalized.enablePerMediaDownload;
    byId('language-preference').value = normalized.languagePreference;
    byId('hover-scan-interval').value = normalized.hoverScanIntervalMs;
    byId('layout-refresh-interval').value = normalized.layoutRefreshIntervalMs;
    byId('background-scan-interval').value = normalized.backgroundScanIntervalMs;
    byId('ignore-horizontal-scroll').checked = normalized.ignoreHorizontalOnlyScroll;
}

function renderConsent(value) {
    const consent = normalizeConsentState(value);
    const enabled = canProcessPage(consent);
    const status = byId('consent-status');
    status.textContent = message(enabled ? 'consentStatusEnabled' : 'consentStatusDisabled');
    status.classList.toggle('active', enabled);
    byId('enable-page-processing').disabled = !optionsReady || enabled;
    byId('revoke-consent').disabled = !optionsReady || !enabled;
    byId('network-capture-enabled').disabled = !optionsReady || !enabled;
    byId('network-capture-enabled').checked = consent.networkCaptureEnabled;
}

async function refreshConsent() {
    renderConsent(await platform.loadConsent());
}

byId('options-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!optionsReady) return;
    const options = await platform.saveOptions(readForm());
    await applyLocalization(options.languagePreference);
    const status = byId('save-status');
    status.textContent = message('savedStatus');
    window.setTimeout(() => { status.textContent = ''; }, 1800);
});

byId('reset-options').addEventListener('click', async (event) => {
    if (!optionsReady || !event.isTrusted) return;
    writeForm(DEFAULT_OPTIONS);
    await platform.saveOptions(DEFAULT_OPTIONS);
    await applyLocalization(DEFAULT_OPTIONS.languagePreference);
    byId('save-status').textContent = message('defaultsRestoredStatus');
});

byId('language-preference').addEventListener('change', async (event) => {
    if (!optionsReady || !event.isTrusted) return;
    await applyLocalization(event.target.value);
});

byId('enable-page-processing').addEventListener('click', async (event) => {
    if (!optionsReady || !event.isTrusted) return;
    await platform.saveConsent(acceptPageDisclosure());
    await refreshConsent();
});

byId('revoke-consent').addEventListener('click', async (event) => {
    if (!optionsReady || !event.isTrusted) return;
    await platform.saveConsent(declineOrRevokeConsent());
    await refreshConsent();
});

byId('network-capture-enabled').addEventListener('change', async (event) => {
    if (!optionsReady || !event.isTrusted) return;
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
    if (!optionsReady) return;
    const disclosure = byId('network-disclosure');
    if (!consumeNetworkDisclosureConfirmation(disclosure)) return;
    const consent = await platform.loadConsent();
    await platform.saveConsent(setNetworkCaptureConsent(consent, true));
    await refreshConsent();
    byId('save-status').textContent = message('networkCaptureEnabledStatus');
});

try {
    await applyLocalization();
    const [options, consent] = await Promise.all([
        platform.loadOptions(),
        platform.loadConsent()
    ]);
    writeForm(options);
    optionsReady = true;
    renderConsent(consent);
    byId('options-controls').disabled = false;
} catch (error) {
    byId('save-status').textContent = message('settingsLoadFailedStatus', [error.message]);
    throw error;
}
}

if (!IS_NODE_RUNTIME) {
    void bootstrapOptionsPage().catch((error) => console.error('[Threads Plugin] Loading settings failed', error));
}
