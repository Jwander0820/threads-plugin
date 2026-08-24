import { localizeDocument } from './i18n.js';
import { localizeStoredDocument } from './package-i18n.js';
import {
    LAST_DOCUMENT_LOCALE_STORAGE_KEY,
    OPTIONS_STORAGE_KEY
} from './storage-keys.js';

localizeDocument(document);
const refreshLocalization = () => void localizeStoredDocument(document).catch(() => {});
refreshLocalization();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes[OPTIONS_STORAGE_KEY] && !changes[LAST_DOCUMENT_LOCALE_STORAGE_KEY]) return;
    refreshLocalization();
});
