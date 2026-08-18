import { acceptPageDisclosure, declineOrRevokeConsent } from '../shared/consent-state.js';
import { getExtensionMessage } from './i18n.js';

const DISCLOSURE_ID = 'threads-plugin-disclosure-v1';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

export function showDisclosure({ document, onAccept, onDecline, getMessage = getExtensionMessage }) {
    const message = (key) => escapeHtml(getMessage(key));
    document.getElementById(DISCLOSURE_ID)?.remove();
    const root = document.createElement('div');
    root.id = DISCLOSURE_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', `${DISCLOSURE_ID}-title`);
    root.innerHTML = `
      <div class="tp-disclosure-card">
        <p class="tp-disclosure-kicker">THREADS PLUGIN</p>
        <h2 id="${DISCLOSURE_ID}-title">${message('disclosureHeading')}</h2>
        <p>${message('disclosureIntro')}</p>
        <p><strong>${message('disclosureAdvancedStrong')}</strong>${message('disclosureAdvancedBody')}</p>
        <div class="tp-disclosure-actions">
          <button type="button" data-action="accept">${message('disclosureAccept')}</button>
          <button type="button" data-action="decline">${message('disclosureDecline')}</button>
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #${DISCLOSURE_ID}{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.7);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#181818}
      #${DISCLOSURE_ID} .tp-disclosure-card{width:min(520px,100%);padding:30px;border:1px solid rgba(255,255,255,.2);border-radius:22px;background:#f7f3ed;box-shadow:0 28px 90px rgba(0,0,0,.42)}
      #${DISCLOSURE_ID} h2{margin:7px 0 16px;font-size:28px;line-height:1.08;letter-spacing:-.035em}
      #${DISCLOSURE_ID} p{line-height:1.6;margin:11px 0;color:#4e4a44}
      #${DISCLOSURE_ID} .tp-disclosure-kicker{font-size:11px;font-weight:800;letter-spacing:.17em;color:#8b5e34}
      #${DISCLOSURE_ID} .tp-disclosure-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
      #${DISCLOSURE_ID} button{border:0;border-radius:999px;padding:11px 17px;font:inherit;font-weight:750;cursor:pointer;background:#181818;color:#fff}
      #${DISCLOSURE_ID} button[data-action="decline"]{border:1px solid #c8c0b5;background:transparent;color:#333}
      #${DISCLOSURE_ID} button:focus-visible{outline:3px solid #b97b43;outline-offset:3px}`;
    root.appendChild(style);

    const settle = async (accepted) => {
        root.querySelectorAll('button').forEach((button) => { button.disabled = true; });
        try {
            if (accepted) await onAccept(acceptPageDisclosure());
            else await onDecline(declineOrRevokeConsent());
            root.remove();
        } catch (error) {
            root.querySelectorAll('button').forEach((button) => { button.disabled = false; });
            throw error;
        }
    };
    root.querySelector('[data-action="accept"]').addEventListener('click', (event) => {
        if (event.isTrusted) void settle(true);
    });
    root.querySelector('[data-action="decline"]').addEventListener('click', (event) => {
        if (event.isTrusted) void settle(false);
    });
    (document.documentElement || document).appendChild(root);
    root.querySelector('[data-action="accept"]').focus();
    return () => root.remove();
}
