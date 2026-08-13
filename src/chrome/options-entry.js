import {
    acceptPageDisclosure,
    canProcessPage,
    declineOrRevokeConsent,
    normalizeConsentState,
    setNetworkCaptureConsent
} from '../shared/consent-state.js';
import { DEFAULT_OPTIONS, normalizeOptions } from '../shared/options.js';
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
    status.textContent = enabled ? '已同意，頁面功能會啟動' : '尚未同意，擴充功能保持休眠';
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
    status.textContent = '已儲存';
    window.setTimeout(() => { status.textContent = ''; }, 1800);
});

byId('reset-options').addEventListener('click', async (event) => {
    if (!event.isTrusted) return;
    writeForm(DEFAULT_OPTIONS);
    await platform.saveOptions(DEFAULT_OPTIONS);
    byId('save-status').textContent = '已還原預設值';
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
    byId('save-status').textContent = '進階擷取已啟用；若目前 Threads 分頁曾停用或撤銷過進階擷取，請重新載入該分頁。';
});

async function bootstrapOptionsPage() {
    await Promise.all([
        platform.loadOptions().then(writeForm),
        refreshConsent()
    ]);
}

void bootstrapOptionsPage().catch((error) => {
    byId('save-status').textContent = `設定載入失敗：${error.message}`;
});
}
