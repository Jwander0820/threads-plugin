import { validateMediaUrl } from './media-policy.js';

// UI and keyboard behavior live here; discovery and task execution stay injected.
export function createMediaDialog({
    document, window, state, message, modalId: MODAL_ID,
    getCurrentDetailPostInfo, getMediaUrlIdentity, collectDetailPostMediaItems,
    scanInlineScriptsForVideoUrls, isBatchMediaDownloadEnabled, cleanupDetailButton,
    toast, createUserActivationToken, isModalControlIntent, downloadModalItems,
    getDownloadTaskKey
}) {
    function ensurePostMediaModal() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.dataset.tmHidden = '1';
        modal.innerHTML = `
            <div class="tm-modal" role="dialog" aria-modal="true" aria-labelledby="tm-post-media-modal-title">
                <div class="tm-modal-head">
                    <div class="tm-modal-title" id="tm-post-media-modal-title">${escapeHtml(message('modalTitle'))}</div>
                    <div class="tm-modal-subtitle"></div>
                    <button type="button" class="tm-close" aria-label="${escapeHtml(message('close'))}" title="${escapeHtml(message('close'))}">×</button>
                </div>
                <div class="tm-actions">
                    <button type="button" data-action="download-selected">${escapeHtml(message('downloadSelected'))}</button>
                    <button type="button" data-action="download-all">${escapeHtml(message('downloadAll'))}</button>
                    <button type="button" data-action="retry-failed" disabled>${escapeHtml(message('retryFailed'))}</button>
                </div>
                <div class="tm-batch-summary" role="status" aria-live="polite"></div>
                <label class="tm-select-row">
                    <input type="checkbox" data-action="select-all">
                    <span>${escapeHtml(message('selectAll'))}</span>
                </label>
                <div class="tm-list"></div>
            </div>
        `;
        const modalControls = Object.freeze({
            selectAll: modal.querySelector('[data-action=select-all]'),
            downloadSelected: modal.querySelector('[data-action=download-selected]'),
            downloadAll: modal.querySelector('[data-action=download-all]'),
            retryFailed: modal.querySelector('[data-action=retry-failed]')
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target?.classList?.contains('tm-close')) {
                closePostMediaModal();
                return;
            }

            if (isModalControlIntent(event.target, modalControls, 'selectAll')) {
                setModalSelection(event.target.checked);
                return;
            }

            if (isModalControlIntent(event.target, modalControls, 'downloadSelected')) {
                const activationToken = createUserActivationToken(event);
                if (activationToken) downloadModalItems(false, activationToken);
                return;
            }

            if (isModalControlIntent(event.target, modalControls, 'downloadAll')) {
                const activationToken = createUserActivationToken(event);
                if (activationToken) downloadModalItems(true, activationToken);
                return;
            }

            if (isModalControlIntent(event.target, modalControls, 'retryFailed')) {
                const activationToken = createUserActivationToken(event);
                if (activationToken) downloadModalItems(false, activationToken, { retryOnly: true });
                return;
            }

            const previewButton = event.target?.closest?.('button.tm-open');
            if (previewButton && modal.contains(previewButton)) {
                const item = state.modalItems[Number(previewButton.dataset.index)];
                if (item?.previewUrl) window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
            }
        }, true);

        modal.addEventListener('change', (event) => {
            if (event.target?.dataset?.index == null) return;

            const item = state.modalItems[Number(event.target.dataset.index)];
            if (item) item.selected = event.target.checked;
            syncSelectAllState();
        });
        modal.addEventListener('keydown', handlePostMediaModalKeydown, true);

        document.body.appendChild(modal);
        return modal;
    }

    function renderPostMediaModal() {
        const modal = ensurePostMediaModal();
        const postInfo = getCurrentDetailPostInfo() || { postId: 'unknown' };
        const subtitle = modal.querySelector('.tm-modal-subtitle');
        const list = modal.querySelector('.tm-list');

        subtitle.textContent = `${message('postIdLabel')}: ${postInfo.postId}`;
        modal.querySelector('#tm-post-media-modal-title').textContent = message('modalTitle');
        for (const [action, key] of [
            ['download-selected', 'downloadSelected'], ['download-all', 'downloadAll'],
            ['retry-failed', 'retryFailed']
        ]) modal.querySelector(`[data-action="${action}"]`).textContent = message(key);
        const close = modal.querySelector('.tm-close');
        close.title = message('close');
        close.setAttribute('aria-label', message('close'));
        modal.querySelector('.tm-select-row span').textContent = message('selectAll');
        list.innerHTML = '';

        if (state.modalItems.length === 0) {
            list.innerHTML = `<div class="tm-empty">${escapeHtml(message('noMedia'))}</div>`;
            updateDownloadResults();
            return;
        }

        state.modalItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'tm-item';

            const mediaLabel = message('mediaLabel', {
                type: message(item.type === 'video' ? 'video' : 'photo'),
                index: index + 1
            });
            const preview = buildModalItemPreviewMarkup(item);

            row.innerHTML = `
                <div class="tm-check-cell">
                    <input type="checkbox" data-index="${index}" ${item.selected ? 'checked' : ''}>
                </div>
                <div class="tm-preview">
                    ${preview}
                    <div>- ${escapeHtml(mediaLabel)} -</div>
                    <div class="tm-download-status" data-download-index="${index}"></div>
                </div>
                <div class="tm-open-cell">
                    <button type="button" class="tm-open" data-action="open-preview" data-index="${index}" title="${escapeHtml(message('openPreview'))}" aria-label="${escapeHtml(message('openPreview'))}">↗</button>
                </div>
            `;
            const videoThumbnail = row.querySelector('.tm-video-thumbnail');
            if (videoThumbnail) applyVideoThumbnailLayout(videoThumbnail, item);
            list.appendChild(row);
        });

        syncSelectAllState();
        updateDownloadResults();
    }

    function getModalItemsSnapshot(items) {
        return (items || []).map((item) => [
            item.type,
            getMediaUrlIdentity(item.previewUrl),
            getMediaUrlIdentity(item.resolvedUrl)
        ].join(':')).join('|');
    }

    function refreshOpenPostMediaModal() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal || modal.dataset.tmHidden === '1') return false;

        const previousItems = state.modalItems;
        const nextItems = collectDetailPostMediaItems();
        if (getModalItemsSnapshot(previousItems) === getModalItemsSnapshot(nextItems)) return false;

        const selectionByMedia = new Map(previousItems.map((item) => [
            `${item.type}:${getMediaUrlIdentity(item.resolvedUrl || item.previewUrl)}`,
            item.selected
        ]));
        nextItems.forEach((item) => {
            const key = `${item.type}:${getMediaUrlIdentity(item.resolvedUrl || item.previewUrl)}`;
            if (selectionByMedia.has(key)) item.selected = selectionByMedia.get(key);
        });
        state.modalItems = nextItems;
        renderPostMediaModal();
        return true;
    }

    function buildModalItemPreviewMarkup(item) {
        if (item?.type === 'video') {
            const poster = validateMediaUrl(item.previewUrl, 'image');
            const video = validateMediaUrl(item.resolvedUrl, 'video');
            let media = '';

            if (poster.ok) {
                media = `<img src="${escapeHtml(poster.url)}" alt="">`;
            } else if (video.ok) {
                const previewUrl = new URL(video.url);
                previewUrl.hash = 't=0.1';
                media = `<video src="${escapeHtml(previewUrl.href)}" muted playsinline preload="metadata" aria-hidden="true"></video>`;
            }

            return `
                <div class="tm-video-thumbnail" data-orientation="landscape">
                    <span class="tm-video-thumbnail-fallback">${escapeHtml(message('video'))}</span>
                    ${media}
                    <span class="tm-video-play-badge" aria-hidden="true">▶</span>
                </div>
            `;
        }

        const image = validateMediaUrl(item?.previewUrl || item?.resolvedUrl, 'image');
        return image.ok
            ? `<img src="${escapeHtml(image.url)}" alt="">`
            : `<div>${escapeHtml(message('photo'))}</div>`;
    }

    function getVideoThumbnailLayout(videoWidth, videoHeight) {
        const width = Number(videoWidth);
        const height = Number(videoHeight);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return { orientation: 'landscape', aspectRatio: '16 / 9' };
        }

        return {
            orientation: width === height ? 'square' : (width < height ? 'portrait' : 'landscape'),
            aspectRatio: `${width} / ${height}`
        };
    }

    function applyVideoThumbnailLayout(thumbnail, item) {
        const apply = (width, height) => {
            const layout = getVideoThumbnailLayout(width, height);
            thumbnail.dataset.orientation = layout.orientation;
            thumbnail.style.setProperty('--tm-video-aspect-ratio', layout.aspectRatio);
        };
        const sourceVideo = item?.element?.tagName === 'VIDEO' ? item.element : null;
        const previewVideo = thumbnail.querySelector('video');

        if (sourceVideo?.videoWidth > 0 && sourceVideo?.videoHeight > 0) {
            apply(sourceVideo.videoWidth, sourceVideo.videoHeight);
        }

        if (!previewVideo) return;
        const applyPreviewMetadata = () => apply(previewVideo.videoWidth, previewVideo.videoHeight);
        if (previewVideo.videoWidth > 0 && previewVideo.videoHeight > 0) {
            applyPreviewMetadata();
        } else {
            previewVideo.addEventListener('loadedmetadata', applyPreviewMetadata, { once: true });
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getPostMediaModalFocusableControls(modal) {
        return Array.from(modal?.querySelectorAll?.(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) || []).filter((control) =>
            control?.dataset?.tmHidden !== '1' &&
            control?.getAttribute?.('aria-hidden') !== 'true'
        );
    }

    function handlePostMediaModalKeydown(event) {
        const modal = document.getElementById(MODAL_ID);
        if (!modal || modal.dataset.tmHidden === '1') return false;
        if (event?.key === 'Escape') {
            event.preventDefault?.();
            event.stopPropagation?.();
            closePostMediaModal();
            return true;
        }
        if (event?.key !== 'Tab') return false;
        const controls = getPostMediaModalFocusableControls(modal);
        if (!controls.length) {
            event.preventDefault?.();
            return true;
        }
        const activeIndex = controls.indexOf(document.activeElement);
        const nextIndex = event.shiftKey
            ? (activeIndex <= 0 ? controls.length - 1 : activeIndex - 1)
            : (activeIndex < 0 || activeIndex === controls.length - 1 ? 0 : activeIndex + 1);
        event.preventDefault?.();
        controls[nextIndex]?.focus?.();
        return true;
    }

    function openPostMediaModal() {
        if (!isBatchMediaDownloadEnabled()) {
            cleanupDetailButton();
            toast(message('pickerDisabled'));
            return;
        }

        state.modalReturnFocus = document.activeElement?.isConnected
            ? document.activeElement
            : state.detailButton;
        scanInlineScriptsForVideoUrls();
        state.modalItems = collectDetailPostMediaItems();
        const modal = ensurePostMediaModal();
        renderPostMediaModal();
        modal.dataset.tmHidden = '0';
        modal.querySelector('.tm-close')?.focus?.();
    }

    function closePostMediaModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.dataset.tmHidden = '1';
        const returnFocus = state.modalReturnFocus;
        state.modalReturnFocus = null;
        if (returnFocus?.isConnected) returnFocus.focus?.();
    }

    function setModalSelection(checked) {
        state.modalItems.forEach((item) => {
            item.selected = checked;
        });
        renderPostMediaModal();
    }

    function syncSelectAllState() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;

        const checkbox = modal.querySelector('input[data-action="select-all"]');
        if (!checkbox) return;

        const total = state.modalItems.length;
        const selected = state.modalItems.filter((item) => item.selected).length;
        checkbox.checked = total > 0 && selected === total;
        checkbox.indeterminate = selected > 0 && selected < total;
    }

    function getModalDownloadItems(items, downloadAll) {
        return items.filter((item) => downloadAll || item.selected);
    }

    function setBatchDownloadButtonsDisabled(disabled) {
        const modal = typeof document !== 'undefined' ? document.getElementById?.(MODAL_ID) : null;
        modal?.querySelectorAll?.('[data-action="download-selected"], [data-action="download-all"]')
            .forEach((button) => {
                button.disabled = disabled;
            });
        const retry = modal?.querySelector?.('[data-action="retry-failed"]');
        if (retry) retry.disabled = disabled || !(state.batchResults || []).some(result =>
            result.status === 'failed' || result.status === 'not_found'
        );
    }

    function updateDownloadResults() {
        const modal = document?.getElementById?.(MODAL_ID);
        if (!modal) return;
        const results = state.batchResults || [];
        const labels = {
            success: 'downloadResultSuccess', failed: 'downloadResultFailed',
            not_found: 'downloadResultNotFound', cancelled: 'downloadResultCancelled'
        };
        modal.querySelectorAll?.('[data-download-index]').forEach(node => {
            const index = Number(node.dataset.downloadIndex);
            const item = state.modalItems[index];
            const result = item && results.find(entry => entry.key === getDownloadTaskKey(item, index));
            const label = result?.status === 'success' && result.completion
                ? (result.completion === 'completed' ? 'downloadResultCompleted' : 'downloadResultStarted')
                : labels[result?.status];
            const text = result ? message(label) : '';
            if (node.textContent !== text) node.textContent = text;
            node.dataset.status = result?.status || '';
        });
        const summary = modal.querySelector?.('.tm-batch-summary');
        if (summary) {
            const counts = { success: 0, failed: 0, not_found: 0, cancelled: 0 };
            for (const result of results) counts[result.status] += 1;
            const text = results.length ? message('downloadResultSummary', counts) : '';
            if (summary.textContent !== text) summary.textContent = text;
        }
        setBatchDownloadButtonsDisabled(state.batchDownloadInProgress);
    }


    return { ensurePostMediaModal, renderPostMediaModal, getModalItemsSnapshot, refreshOpenPostMediaModal, buildModalItemPreviewMarkup, getVideoThumbnailLayout, applyVideoThumbnailLayout, escapeHtml, getPostMediaModalFocusableControls, handlePostMediaModalKeydown, openPostMediaModal, closePostMediaModal, setModalSelection, syncSelectAllState, getModalDownloadItems, setBatchDownloadButtonsDisabled, updateDownloadResults };
}
