import {
    buildMediaFilename,
    isImageUrl,
    isVideoUrl,
    normalizeUrl,
    validateMediaUrl
} from './media-policy.js';
import {
    classifyNetworkCaptureRequest,
    getHeaderValue,
    inspectResponse,
    inspectXhrResponse,
    isInspectableResponseMime,
    isSensitiveThreadsRoute,
    NETWORK_RESPONSE_MAX_BYTES,
    utf8ByteLength
} from './network-policy.js';
import { DEFAULT_OPTIONS, normalizeOptions } from './options.js';
import { createMessageFormatter } from './i18n.js';
import { SHARED_UI_MESSAGES } from './i18n-messages.js';
import {
    collectStructuredMediaUrls,
    normalizePostIdentity,
    parsePostInfoFromUrl,
    sanitizeFilenamePart
} from './post-model.js';
import {
    areMediaUrlsEquivalent,
    buildMediaRouteKey,
    getMediaUrlIdentity,
    mergeMediaUrlCache,
    transitionMediaRouteScope
} from './route-media-state.js';

export const MAX_STRUCTURED_RECORDS_PER_ROUTE = 512;
export const MAX_POST_COUNTERS_PER_ROUTE = 160;

export async function createThreadsRuntime({
    platform,
    captureSource = globalThis.window,
    document = globalThis.document,
    window = globalThis.window,
    initialOptions,
    clock = globalThis,
    message = createMessageFormatter({ locale: 'zh-TW', catalogs: SHARED_UI_MESSAGES })
}) {
    if (!platform) throw new TypeError('platform adapter is required');
    const IS_NODE_RUNTIME = !document || !window;

    const STYLE_ID = 'tm-target-downloader-style';
    const TOAST_ID = 'tm-target-downloader-toast';
    const BUTTON_CLASS = 'tm-target-download-button';
    const POST_TOOL_CLASS = 'tm-post-media-tool-button';
    const COPY_TOOL_CLASS = 'tm-post-copy-tool-button';
    const LINK_TOOL_CLASS = 'tm-post-link-tool-button';
    const CLEAN_LINK_MENU_CLASS = 'tm-clean-link-menu-item';
    const POST_BOUNDARY_SELECTOR = 'article,[role="article"],[data-pressable-container]';
    const SHARE_SVG_CANDIDATE_SELECTOR = 'svg[aria-label],button svg,[role="button"] svg,a svg,[tabindex="0"] svg';
    const THREADS_SHARE_GLYPH_PATH_PREFIX = 'M7.2474 1.49853C4.18324 -0.187039 0.600262 2.64309 1.53038 6.01431';
    const CLEAN_LINK_ICON_PATH = 'M245.14 352.14c8.49-8.49 22.27-8.49 30.76 0 8.5 8.5 8.5 22.27 0 30.76l-58.53 58.54c-20.35 20.34-47.15 30.51-73.94 30.51s-53.6-10.17-73.94-30.51c-20.34-20.35-30.52-47.15-30.52-73.94 0-26.78 10.18-53.6 30.52-73.94l58.53-58.53c8.5-8.5 22.27-8.5 30.77 0 8.49 8.49 8.49 22.27 0 30.76l-58.54 58.53c-11.84 11.85-17.77 27.51-17.77 43.18 0 15.67 5.93 31.33 17.77 43.17 11.85 11.85 27.51 17.78 43.18 17.78 15.67 0 31.33-5.93 43.17-17.77l58.54-58.54zm46.1-92.68c8.47 8.48 8.47 22.24 0 30.71-8.48 8.47-22.23 8.47-30.71 0l-39.78-39.78c-8.47-8.48-8.47-22.23 0-30.71 8.48-8.47 22.23-8.47 30.71 0l39.78 39.78zm45.28 245.07-25.07 5.19c-3.24.66-6.43-1.44-7.09-4.68l-16.18-78.09a6.006 6.006 0 0 1 4.66-7.11l25.05-5.29c3.27-.65 6.45 1.44 7.11 4.69l16.21 78.2c.66 3.25-1.44 6.43-4.69 7.09zM178.82 6.26 203.39.18c3.22-.8 6.48 1.17 7.28 4.38l19.46 77.29c.8 3.23-1.16 6.5-4.39 7.31l-24.8 6.28c-3.23.8-6.5-1.16-7.31-4.38l-19.46-77.43c-.81-3.23 1.16-6.5 4.38-7.31l.27-.06zm264.17 419.63-17.86 18.43a6.03 6.03 0 0 1-8.52 0l-57.22-55.51a6.015 6.015 0 0 1-.11-8.5l17.8-18.39c2.32-2.38 6.13-2.44 8.51-.12l57.28 55.58a6.027 6.027 0 0 1 .12 8.51zm68.81-112.11-6.62 24.69c-.85 3.21-4.15 5.12-7.37 4.26l-77.08-20.62c-3.22-.86-5.12-4.16-4.27-7.38l6.64-24.72c.86-3.21 4.16-5.12 7.38-4.27l77.05 20.67c3.21.85 5.12 4.16 4.27 7.37zM.38 201.65l6.97-24.15a6.025 6.025 0 0 1 7.42-4.11l76.66 21.79c3.2.91 5.05 4.25 4.15 7.45l-6.96 24.61a6.034 6.034 0 0 1-7.42 4.17L4.38 209.55a6.035 6.035 0 0 1-4.15-7.45l.15-.45zM65.14 87.17l17.84-17.81c2.35-2.34 6.17-2.33 8.51.02l56.38 56.41c2.33 2.35 2.33 6.15 0 8.49l-18.06 18.11a6.014 6.014 0 0 1-8.5.02L64.85 95.97a6.03 6.03 0 0 1 0-8.52l.29-.28zm200.98 71.28c-8.49 8.5-22.27 8.5-30.76 0-8.5-8.49-8.5-22.26 0-30.76l59.26-59.26 1.38-1.27c20.23-19.51 46.43-29.26 72.56-29.26 26.78 0 53.58 10.18 73.93 30.53 20.35 20.35 30.53 47.16 30.53 73.94 0 26.79-10.18 53.59-30.52 73.94l-59.26 59.26c-8.5 8.49-22.27 8.49-30.77 0-8.49-8.49-8.49-22.27 0-30.76l59.27-59.27c11.84-11.84 17.77-27.5 17.77-43.17 0-15.67-5.93-31.33-17.77-43.17-11.86-11.86-27.52-17.79-43.18-17.79-15.3 0-30.55 5.59-42.22 16.76l-60.22 60.28z';
    const MODAL_ID = 'tm-post-media-modal';
    const LOG_PREFIX = '[Threads Target Downloader]';
    const SCAN_DEBOUNCE_MS = 400;
    const MIN_MEDIA_SIZE = 96;
    const MAX_POST_CONTEXT_ANCESTORS = 24;
    const DOWNLOAD_TIMEOUT_MS = 30000;
    const DOWNLOAD_WATCHDOG_MS = 35000;
    const BLOB_DOWNLOAD_WATCHDOG_MS = 15 * 60 * 1000;
    const SHARE_CONTEXT_TIMEOUT_MS = 12000;
    const USER_ACTIVATION_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;
    const trustedActivationTokens = new WeakSet();

    const USER_OPTIONS = { ...normalizeOptions(initialOptions || DEFAULT_OPTIONS) };
    let started = false;
    let stopped = false;

    const state = {
        buttonByElement: new WeakMap(),
        elementByButton: new WeakMap(),
        liveButtons: new Set(),
        postCounters: new Map(),
        videoUrlsByPostId: new Map(),
        imageUrlsByPostId: new Map(),
        structuredMediaItemsByPostId: new Map(),
        captureRouteGeneration: '',
        scannedScriptContents: new WeakMap(),
        mediaRouteKey: '',
        hoverButton: null,
        hoverElement: null,
        hoverMoveRaf: 0,
        hoverScanTimer: 0,
        lastHoverScanAt: 0,
        pendingHoverPoint: null,
        pointerDragActive: false,
        hideTimer: 0,
        detailButton: null,
        detailUiCache: null,
        modalReturnFocus: null,
        copyButtonByRoot: new WeakMap(),
        copyButtonByShare: new WeakMap(),
        copyContextByButton: new WeakMap(),
        liveCopyButtons: new Set(),
        linkButtonByRoot: new WeakMap(),
        linkButtonByShare: new WeakMap(),
        linkContextByButton: new WeakMap(),
        liveLinkButtons: new Set(),
        detailRoute: '',
        modalItems: [],
        scanTimer: 0,
        pendingScanNetworkRefresh: false,
        rafRefresh: 0,
        layoutRefreshTimer: 0,
        lastLayoutRefreshAt: 0,
        backgroundScanIntervalId: 0,
        uiRefreshIntervalId: 0,
        pendingLayoutFullRefresh: false,
        scrollPositions: new WeakMap(),
        disposeSettingsUi: null,
        disposeStyles: null,
        pendingShareContext: null,
        cleanLinkMenuTimer: 0,
        nativeShareCloseTimer: 0,
        suppressNativeShareContextUntil: 0,
        batchDownloadInProgress: false,
        listenerDisposers: [],
        observer: null,
        initObserverTimer: 0,
        startupTimers: [],
        uninstallNetworkCapture: null,
        lifecycleController: new AbortController(),
        diagnostics: {
            observerCallbacks: 0,
            fullRefreshes: 0,
            networkPayloadParses: 0,
            routeTransitions: 0
        }
    };

    function listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        state.listenerDisposers.push(() => target.removeEventListener(type, handler, options));
    }

    function saveUserOptions() {
        Promise.resolve(platform.saveOptions(normalizeOptions(USER_OPTIONS))).catch((error) => {
            warn('Saving options failed', error);
        });
    }

    function setUserOption(key, value) {
        if (!(key in DEFAULT_OPTIONS)) return;
        Object.assign(USER_OPTIONS, normalizeOptions({ ...USER_OPTIONS, [key]: value }));
        saveUserOptions();
        applyUserOptions();
        void registerUserOptionMenu();
    }

    function resetUserOptions() {
        Object.assign(USER_OPTIONS, DEFAULT_OPTIONS);
        saveUserOptions();
        applyUserOptions();
        void registerUserOptionMenu();
        toast(message('settingsReset'));
    }

    function promptNumberOption(key, label, min, max) {
        const currentValue = USER_OPTIONS[key];
        const input = window.prompt(message('optionPrompt', { label, milliseconds: currentValue, min, max }), String(currentValue));
        if (input == null) return;

        const normalized = normalizeOptions({ ...USER_OPTIONS, [key]: input })[key];
        setUserOption(key, normalized);
        toast(message('optionUpdated', { label, milliseconds: normalized }));
    }

    function applyUserOptions() {
        clearHoverScanQueue();
        window.clearTimeout(state.layoutRefreshTimer);
        state.layoutRefreshTimer = 0;
        state.scrollPositions = new WeakMap();
        startBackgroundScanInterval();

        if (!isPostMediaPickerEnabled()) {
            cleanupDetailButton();
        }

        refreshButtons({ scanNetwork: false });
    }

    async function registerUserOptionMenu() {
        state.disposeSettingsUi?.();
        state.disposeSettingsUi = await platform.installSettingsUi({
            commands: [
                {
                    label: message('mediaPickerMenu', { mark: USER_OPTIONS.enablePostMediaPicker ? '✓' : '□', state: message(USER_OPTIONS.enablePostMediaPicker ? 'enabled' : 'disabled') }),
                    run: () => {
                setUserOption('enablePostMediaPicker', !USER_OPTIONS.enablePostMediaPicker);
                toast(message('mediaPickerToggled', { state: message(USER_OPTIONS.enablePostMediaPicker ? 'enabled' : 'disabled') }));
                    }
                },
                { label: message('intervalMenu', { label: message('hoverScanInterval'), milliseconds: USER_OPTIONS.hoverScanIntervalMs }), run: () => promptNumberOption('hoverScanIntervalMs', message('hoverScanInterval'), 0, 2000) },
                { label: message('intervalMenu', { label: message('layoutRefreshInterval'), milliseconds: USER_OPTIONS.layoutRefreshIntervalMs }), run: () => promptNumberOption('layoutRefreshIntervalMs', message('layoutRefreshInterval'), 0, 5000) },
                { label: message('intervalMenu', { label: message('backgroundScanInterval'), milliseconds: USER_OPTIONS.backgroundScanIntervalMs }), run: () => promptNumberOption('backgroundScanIntervalMs', message('backgroundScanInterval'), 3000, 60000) },
                {
                    label: message('ignoreHorizontalScrollMenu', { mark: USER_OPTIONS.ignoreHorizontalOnlyScroll ? '✓' : '□', state: message(USER_OPTIONS.ignoreHorizontalOnlyScroll ? 'enabled' : 'disabled') }),
                    run: () => {
                setUserOption('ignoreHorizontalOnlyScroll', !USER_OPTIONS.ignoreHorizontalOnlyScroll);
                toast(message('ignoreHorizontalScrollToggled', { state: message(USER_OPTIONS.ignoreHorizontalOnlyScroll ? 'enabled' : 'disabled') }));
                    }
                },
                { label: message('resetSettings'), run: resetUserOptions }
            ]
        });
    }

    const PLUGIN_CSS = `
        .${BUTTON_CLASS} {
            position: fixed !important;
            z-index: 2147483647 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 34px !important;
            min-width: 34px !important;
            height: 34px !important;
            border: 1px solid rgba(255, 255, 255, 0.45) !important;
            border-radius: 999px !important;
            padding: 0 !important;
            color: #fff !important;
            background: rgba(0, 0, 0, 0.72) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.26) !important;
            font: 800 18px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            letter-spacing: 0 !important;
            text-align: center !important;
            white-space: nowrap !important;
            cursor: pointer !important;
            user-select: none !important;
            pointer-events: auto !important;
            backdrop-filter: blur(6px) !important;
            opacity: 1 !important;
        }

        .${BUTTON_CLASS} svg {
            width: 20px !important;
            height: 20px !important;
            display: block !important;
            fill: none !important;
            stroke: currentColor !important;
            stroke-width: 1.75 !important;
            stroke-linecap: round !important;
            stroke-linejoin: round !important;
            pointer-events: none !important;
            flex: 0 0 auto !important;
        }

        .${BUTTON_CLASS}:hover {
            background: rgba(0, 0, 0, 0.9) !important;
        }

        .${BUTTON_CLASS}[data-tm-busy="1"] {
            opacity: 0.68 !important;
            cursor: wait !important;
        }

        .${BUTTON_CLASS}[data-tm-hidden="1"] {
            display: none !important;
        }

        .${POST_TOOL_CLASS},
        .${COPY_TOOL_CLASS},
        .${LINK_TOOL_CLASS} {
            width: 40px !important;
            height: 36px !important;
            min-width: 40px !important;
            flex: 0 0 40px !important;
            border: 0 !important;
            border-radius: 999px !important;
            padding: 0 !important;
            color: rgb(228, 230, 235) !important;
            background: transparent !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            align-self: center !important;
            cursor: pointer !important;
            pointer-events: auto !important;
            vertical-align: middle !important;
            margin: 0 !important;
            line-height: 1 !important;
        }

        .tm-post-media-tool-slot {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 40px !important;
            height: 36px !important;
            min-width: 40px !important;
            flex: 0 0 40px !important;
            vertical-align: middle !important;
        }

        .${POST_TOOL_CLASS}:hover,
        .${COPY_TOOL_CLASS}:hover,
        .${LINK_TOOL_CLASS}:hover {
            background: rgba(255, 255, 255, 0.08) !important;
        }

        .tm-post-media-tool-fallback {
            display: flex !important;
            justify-content: flex-start !important;
            align-items: center !important;
            min-height: 38px !important;
            margin-top: 8px !important;
        }

        .${POST_TOOL_CLASS} svg,
        .${COPY_TOOL_CLASS} svg,
        .${LINK_TOOL_CLASS} svg {
            width: 20px !important;
            height: 20px !important;
            display: block !important;
            fill: none !important;
            stroke: currentColor !important;
            stroke-width: 1.75 !important;
            stroke-linecap: round !important;
            stroke-linejoin: round !important;
            transform: translateY(0.5px) !important;
            pointer-events: none !important;
        }

        #${MODAL_ID} {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483647 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: rgba(0, 0, 0, 0.46) !important;
            color: #111 !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }

        #${MODAL_ID}[data-tm-hidden="1"] {
            display: none !important;
        }

        #${MODAL_ID} .tm-modal {
            width: min(640px, calc(100vw - 24px)) !important;
            max-height: min(720px, calc(100vh - 24px)) !important;
            background: #f4f5f7 !important;
            border-radius: 8px !important;
            box-shadow: 0 18px 70px rgba(0, 0, 0, 0.45) !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
        }

        #${MODAL_ID} .tm-modal-head {
            position: relative !important;
            padding: 12px 58px 10px !important;
            text-align: center !important;
            border-bottom: 1px solid rgba(0, 0, 0, 0.12) !important;
        }

        #${MODAL_ID} .tm-modal-title {
            font-size: 18px !important;
            font-weight: 760 !important;
            line-height: 1.25 !important;
        }

        #${MODAL_ID} .tm-modal-subtitle {
            margin-top: 2px !important;
            color: #3454d1 !important;
            font-size: 14px !important;
            user-select: text !important;
        }

        #${MODAL_ID} .tm-close {
            position: absolute !important;
            top: 8px !important;
            right: 12px !important;
            width: 34px !important;
            height: 34px !important;
            border: 0 !important;
            background: transparent !important;
            color: #111 !important;
            font-size: 32px !important;
            line-height: 1 !important;
            cursor: pointer !important;
        }

        #${MODAL_ID} .tm-actions {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 14px !important;
            padding: 10px 16px !important;
            flex-wrap: wrap !important;
        }

        #${MODAL_ID} .tm-actions button {
            min-height: 34px !important;
            border: 1px solid rgba(0, 0, 0, 0.28) !important;
            border-radius: 4px !important;
            padding: 6px 14px !important;
            background: #fff !important;
            color: #111 !important;
            font-size: 15px !important;
            cursor: pointer !important;
        }

        #${MODAL_ID} .tm-select-row {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 0 22px 10px !important;
            font-size: 22px !important;
            font-weight: 760 !important;
        }

        #${MODAL_ID} input[type="checkbox"] {
            width: 28px !important;
            height: 28px !important;
            cursor: pointer !important;
        }

        #${MODAL_ID} .tm-list {
            overflow: auto !important;
            padding: 0 20px 20px !important;
        }

        #${MODAL_ID} .tm-item {
            min-height: 118px !important;
            display: grid !important;
            grid-template-columns: 58px 1fr 38px !important;
            gap: 0 !important;
            border: 1px solid rgba(0, 0, 0, 0.32) !important;
            border-radius: 8px !important;
            overflow: hidden !important;
            background: #f8f9fb !important;
            margin-bottom: 8px !important;
        }

        #${MODAL_ID} .tm-check-cell {
            background: #ddd !important;
            border-right: 1px solid rgba(0, 0, 0, 0.28) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        #${MODAL_ID} .tm-preview {
            min-height: 118px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-direction: column !important;
            gap: 8px !important;
            padding: 8px !important;
            font-size: 18px !important;
        }

        #${MODAL_ID} .tm-preview > img {
            max-width: 140px !important;
            max-height: 86px !important;
            object-fit: contain !important;
        }

        #${MODAL_ID} .tm-video-thumbnail {
            position: relative !important;
            width: min(var(--tm-video-thumbnail-width, 168px), 100%) !important;
            aspect-ratio: var(--tm-video-aspect-ratio, 16 / 9) !important;
            overflow: hidden !important;
            border-radius: 7px !important;
            background: #202124 !important;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12) !important;
        }

        #${MODAL_ID} .tm-video-thumbnail[data-orientation="portrait"] {
            --tm-video-thumbnail-width: 80px;
        }

        #${MODAL_ID} .tm-video-thumbnail[data-orientation="square"] {
            --tm-video-thumbnail-width: 118px;
        }

        #${MODAL_ID} .tm-video-thumbnail img,
        #${MODAL_ID} .tm-video-thumbnail video {
            position: relative !important;
            z-index: 1 !important;
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            background: transparent !important;
        }

        #${MODAL_ID} .tm-video-thumbnail-fallback {
            position: absolute !important;
            inset: 0 !important;
            display: grid !important;
            place-items: center !important;
            color: rgba(255, 255, 255, 0.74) !important;
            font-size: 13px !important;
            letter-spacing: 0.08em !important;
        }

        #${MODAL_ID} .tm-video-play-badge {
            position: absolute !important;
            z-index: 2 !important;
            left: 50% !important;
            top: 50% !important;
            width: 34px !important;
            height: 34px !important;
            display: grid !important;
            place-items: center !important;
            border: 1px solid rgba(255, 255, 255, 0.82) !important;
            border-radius: 999px !important;
            background: rgba(0, 0, 0, 0.58) !important;
            color: #fff !important;
            font-size: 15px !important;
            line-height: 1 !important;
            transform: translate(-50%, -50%) !important;
            pointer-events: none !important;
        }

        #${MODAL_ID} .tm-open-cell {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: center !important;
            padding-top: 12px !important;
        }

        #${MODAL_ID} .tm-open {
            border: 0 !important;
            background: transparent !important;
            font-size: 24px !important;
            cursor: pointer !important;
        }

        #${MODAL_ID} .tm-empty {
            padding: 36px 24px !important;
            text-align: center !important;
            color: #333 !important;
            font-size: 16px !important;
        }

        #${TOAST_ID} {
            position: fixed !important;
            right: 18px !important;
            bottom: 22px !important;
            z-index: 2147483647 !important;
            max-width: min(420px, calc(100vw - 28px)) !important;
            padding: 10px 12px !important;
            border-radius: 10px !important;
            color: #fff !important;
            background: rgba(24, 24, 26, 0.95) !important;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28) !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            font-size: 13px !important;
            line-height: 1.35 !important;
            opacity: 0 !important;
            transform: translateY(8px) !important;
            transition: opacity 160ms ease, transform 160ms ease !important;
            pointer-events: none !important;
        }

        #${TOAST_ID}.tm-show {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function warn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }

    function toast(message) {
        if (!document?.body) return;

        let toastNode = document.getElementById(TOAST_ID);
        if (!toastNode) {
            toastNode = document.createElement('div');
            toastNode.id = TOAST_ID;
            document.body.appendChild(toastNode);
        }

        toastNode.textContent = message;
        toastNode.classList.add('tm-show');
        window.clearTimeout(toastNode.__tmTimer);
        toastNode.__tmTimer = window.setTimeout(() => {
            toastNode.classList.remove('tm-show');
        }, 2800);
    }

    function pickBestFromSrcset(srcset) {
        if (!srcset) return null;

        const candidates = srcset
            .split(',')
            .map((item) => item.trim())
            .map((item) => {
                const parts = item.split(/\s+/);
                const url = normalizeUrl(parts[0]);
                const descriptor = parts[1] || '';
                let weight = 0;

                if (descriptor.endsWith('w')) {
                    weight = parseInt(descriptor, 10);
                } else if (descriptor.endsWith('x')) {
                    weight = Math.round(parseFloat(descriptor) * 1000);
                }

                return { url, weight: Number.isFinite(weight) ? weight : 0 };
            })
            .filter((item) => item.url);

        candidates.sort((a, b) => b.weight - a.weight);
        return candidates[0]?.url || null;
    }

    function isVisibleRect(rect) {
        return (
            rect.width >= MIN_MEDIA_SIZE &&
            rect.height >= MIN_MEDIA_SIZE &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth
        );
    }

    function isVisibleTextRect(rect) {
        return (
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function getCssBackgroundImageUrl(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

        const bg = window.getComputedStyle(element).backgroundImage || '';
        const match = bg.match(/url\((["']?)(.*?)\1\)/i);
        return match ? normalizeUrl(match[2]) : null;
    }

    function visibleMediaCount(node) {
        return Array.from(node.querySelectorAll?.('img, video') || [])
            .filter((media) => isVisibleRect(media.getBoundingClientRect()))
            .length;
    }

    function isLikelyPostImage(img) {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        const alt = img.getAttribute('alt') || '';

        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
        if (!isVisibleRect(rect)) return false;
        if (/profile_pic|s150x150|s320x320|emoji|sprite|static|favicon/i.test(src)) return false;
        if (/avatar|profile picture/i.test(alt)) return false;

        return Boolean(resolveImageUrl(img));
    }

    function isLikelyDetailPostImage(img) {
        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        const width = Number(img.getAttribute('width')) || img.naturalWidth || img.getBoundingClientRect().width;
        const height = Number(img.getAttribute('height')) || img.naturalHeight || img.getBoundingClientRect().height;

        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
        if (/profile_pic|s150x150|emoji|sprite|static|favicon/i.test(src)) return false;
        if (/avatar|profile picture|大頭貼/i.test(alt)) return false;
        if (width < MIN_MEDIA_SIZE || height < MIN_MEDIA_SIZE) return false;

        return Boolean(resolveImageUrl(img));
    }

    function isLikelyPostVideo(video) {
        return isVisibleRect(video.getBoundingClientRect());
    }

    function resolveImageUrl(img) {
        const urls = [
            pickBestFromSrcset(img.getAttribute('srcset') || img.srcset),
            img.currentSrc,
            img.src,
            img.getAttribute('src')
        ];

        const picture = img.closest('picture');
        if (picture) {
            picture.querySelectorAll('source[srcset]').forEach((source) => {
                urls.push(pickBestFromSrcset(source.getAttribute('srcset') || source.srcset));
            });
        }

        return urls.map((url) => normalizeUrl(url)).find(isImageUrl) || null;
    }

    function resolveVideoUrl(video, contextElement) {
        syncMediaRouteScope();
        scanInlineScriptsForVideoUrls();

        const urls = [
            video.currentSrc,
            video.src,
            video.getAttribute('src')
        ];

        video.querySelectorAll('source[src]').forEach((source) => {
            urls.push(source.src, source.getAttribute('src'));
        });

        const postContext = findPostContext(contextElement || video);
        return selectPostBoundVideoUrl({
            directUrls: urls,
            postId: postContext?.postId,
            videoUrlsByPostId: state.videoUrlsByPostId
        });
    }

    function selectPostBoundVideoUrl({ directUrls = [], postId, videoUrlsByPostId }) {
        const directUrl = directUrls
            .map((url) => validateMediaUrl(url, 'video'))
            .find((result) => result.ok)?.url;
        if (directUrl) return directUrl;

        if (!postId || postId === 'unknown' || !(videoUrlsByPostId instanceof Map)) return null;
        const identity = normalizePostIdentity(postId);
        if (!identity) return null;
        const validatedCachedUrls = (videoUrlsByPostId.get(identity) || [])
            .map((url) => validateMediaUrl(url, 'video'))
            .filter((result) => result.ok)
            .map((result) => result.url);
        const distinctUrls = new Map();
        validatedCachedUrls.forEach((url) => {
            distinctUrls.set(getMediaUrlIdentity(url) || url, url);
        });
        return distinctUrls.size === 1 ? distinctUrls.values().next().value : null;
    }

    function findPostInfoInNode(node) {
        if (node.matches?.('a[href*="/post/"]')) {
            const ownMatch = parsePostInfoFromUrl(node.href);
            if (ownMatch) return ownMatch;
        }

        const links = Array.from(node.querySelectorAll?.('a[href*="/post/"]') || []);
        return links.map((link) => parsePostInfoFromUrl(link.href)).find(Boolean) || null;
    }

    function rectCenterDistanceScore(sourceRect, candidateRect) {
        if (!candidateRect || candidateRect.width === 0 || candidateRect.height === 0) {
            return Number.MAX_SAFE_INTEGER;
        }

        const sourceX = sourceRect.left + sourceRect.width / 2;
        const sourceY = sourceRect.top + sourceRect.height / 2;
        const candidateX = candidateRect.left + candidateRect.width / 2;
        const candidateY = candidateRect.top + candidateRect.height / 2;

        return Math.abs(sourceY - candidateY) * 3 + Math.abs(sourceX - candidateX);
    }

    function isInsideNestedPostBlock(element, root) {
        const pressableRoot = element?.closest?.('[data-pressable-container]');
        return Boolean(
            pressableRoot &&
            pressableRoot !== root &&
            root?.contains?.(pressableRoot) &&
            hasPostBoundaryCues(pressableRoot)
        );
    }

    function findBestPostInfoInNode(node, element, excludeNestedPostBlocks = false) {
        if (node.matches?.('a[href*="/post/"]')) {
            const ownMatch = parsePostInfoFromUrl(node.href);
            if (ownMatch) return ownMatch;
        }

        const links = Array.from(node.querySelectorAll?.('a[href*="/post/"]') || [])
            .filter((link) => !excludeNestedPostBlocks || !isInsideNestedPostBlock(link, node))
            .filter((link) => {
                const boundarySelector = 'article,[role=article],[data-pressable-container]';
                const elementBoundary = element?.closest?.(boundarySelector) || null;
                const linkBoundary = link.closest?.(boundarySelector) || null;
                if (!elementBoundary || !node.contains?.(elementBoundary)) {
                    return !linkBoundary || linkBoundary === node;
                }
                return !linkBoundary || linkBoundary === elementBoundary;
            });
        const sourceRect = element.getBoundingClientRect();
        const candidates = links
            .map((link) => ({ link, info: parsePostInfoFromUrl(link.href) }))
            .filter((item) => item.info)
            .map((item) => ({
                ...item,
                score: item.link.contains(element)
                    ? -1
                    : rectCenterDistanceScore(sourceRect, item.link.getBoundingClientRect())
            }))
            .sort((a, b) => a.score - b.score);

        return candidates[0]?.info || null;
    }

    function isModalControlIntent(eventTarget, modalControls, intent) {
        return eventTarget === modalControls?.[intent];
    }

    function findPostTimeInNode(node) {
        const timeNode = node.matches?.('time[datetime]')
            ? node
            : node.querySelector?.('time[datetime]');

        const datetime = timeNode?.getAttribute?.('datetime');
        if (!datetime) return null;

        const date = new Date(datetime);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function findBestPostTimeInNode(node, element) {
        const timeNodes = [
            ...(node.matches?.('time[datetime]') ? [node] : []),
            ...Array.from(node.querySelectorAll?.('time[datetime]') || [])
        ];

        const sourceRect = element.getBoundingClientRect();
        const best = timeNodes
            .map((timeNode) => {
                const datetime = timeNode.getAttribute('datetime');
                const date = datetime ? new Date(datetime) : null;

                return {
                    date,
                    score: rectCenterDistanceScore(sourceRect, timeNode.getBoundingClientRect())
                };
            })
            .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
            .sort((a, b) => a.score - b.score)[0];

        return best?.date || null;
    }

    function getOwnedDetailPostFallback(element, detailRoot, pageInfo) {
        if (!pageInfo?.postId || !detailRoot) return null;
        return isMediaOwnedByPost(element, detailRoot, pageInfo.postId) ? pageInfo : null;
    }

    function acceptPostContextCandidate(
        info,
        pageInfo,
        element,
        detailRoot,
        crossedUnresolvedPostBoundary = false
    ) {
        if (!info) return null;
        if (crossedUnresolvedPostBoundary) return null;
        if (
            pageInfo?.postId &&
            info.postId === pageInfo.postId &&
            !getOwnedDetailPostFallback(element, detailRoot, pageInfo)
        ) return null;
        return info;
    }

    function findPostContext(element) {
        let nearestTime = null;
        let node = element;
        const pageInfo = parsePostInfoFromUrl(location.href);
        let detailRoot = null;
        let crossedUnresolvedPostBoundary = false;

        for (let depth = 0; node && depth < MAX_POST_CONTEXT_ANCESTORS; depth += 1) {
            nearestTime = nearestTime || findBestPostTimeInNode(node, element);

            const info = findBestPostInfoInNode(node, element);
            if (info) {
                if (pageInfo?.postId && info.postId === pageInfo.postId) {
                    detailRoot = detailRoot || findDetailPostRoot();
                }
                const acceptedInfo = acceptPostContextCandidate(
                    info,
                    pageInfo,
                    element,
                    detailRoot,
                    crossedUnresolvedPostBoundary
                );
                if (acceptedInfo) return { ...acceptedInfo, createdAt: nearestTime };
                break;
            }

            if (isPostBoundaryNode(node) && hasPostBoundaryCues(node)) {
                crossedUnresolvedPostBoundary = true;
            }

            node = node.parentElement;
        }

        if (pageInfo) {
            detailRoot = detailRoot || findDetailPostRoot();
            const ownedPageInfo = getOwnedDetailPostFallback(element, detailRoot, pageInfo);
            if (ownedPageInfo) {
                return {
                    ...ownedPageInfo,
                    createdAt: nearestTime || findPostTimeInNode(detailRoot)
                };
            }
        }

        return {
            author: 'unknown',
            postId: 'unknown',
            postUrl: location.href,
            createdAt: nearestTime || null
        };
    }

    function nextPostSequence(postInfo) {
        const key = `${postInfo.author}_${postInfo.postId}`;
        const next = (state.postCounters.get(key) || 0) + 1;
        state.postCounters.delete(key);
        state.postCounters.set(key, next);
        trimMapToSize(state.postCounters, MAX_POST_COUNTERS_PER_ROUTE);
        return String(next).padStart(2, '0');
    }

    function buildFilename(item, contentType) {
        const postInfo = item.postInfo || (item.element ? findPostContext(item.element) : (getCurrentDetailPostInfo() || { author: 'unknown', postId: 'unknown', createdAt: null }));
        const sequence = item.sequence || nextPostSequence(postInfo);
        return buildMediaFilename({
            type: item.type,
            url: item.url,
            contentType,
            postInfo,
            sequence
        });
    }

    function isTrustedUserActivation(event, userActivation) {
        if (event?.isTrusted !== true) return false;

        const activationState = userActivation === undefined
            ? (typeof navigator !== 'undefined' ? navigator.userActivation : null)
            : userActivation;
        if (!activationState || activationState.isActive === true) return true;

        return event.type === 'click' && Number(event.detail) === 0;
    }

    function createUserActivationToken(event, userActivation) {
        if (!isTrustedUserActivation(event, userActivation)) return null;

        const token = Object.freeze({
            createdAt: Date.now(),
            routeKey: getMediaRouteKey()
        });
        trustedActivationTokens.add(token);
        return token;
    }

    function isValidUserActivationToken(token, now = Date.now()) {
        if (!token || typeof token !== 'object' || !trustedActivationTokens.has(token)) return false;
        if (now - token.createdAt > USER_ACTIVATION_TOKEN_MAX_AGE_MS) return false;
        return token.routeKey === getMediaRouteKey();
    }

    function copyText(text, activationToken) {
        if (!isValidUserActivationToken(activationToken)) return false;

        Promise.resolve(platform.writeClipboard(text)).catch(() => { });
        return true;
    }

    function buildCleanThreadsPostUrl(postInfo) {
        if (!postInfo?.author || !postInfo?.postId) return '';

        return `https://www.threads.com/@${postInfo.author}/post/${postInfo.postId}`;
    }

    function getRenderedText(element) {
        if (!element) return '';

        return String(element.innerText || '')
            .replace(/\r\n?/g, '\n')
            .replace(/^\n+|\n+$/g, '');
    }

    function escapeRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getTrailingInlineUiLabels(element, renderedText = getRenderedText(element)) {
        if (!element || !renderedText) return [];
        const elementRect = element.getBoundingClientRect?.();
        if (!elementRect) return [];

        return Array.from(element.querySelectorAll?.('button,[role="button"]') || [])
            .filter((control) => !control.querySelector?.('svg,img,video,time'))
            .map((control) => ({
                label: getRenderedText(control).trim(),
                rect: control.getBoundingClientRect?.()
            }))
            .filter(({ label, rect }) =>
                label &&
                !label.includes('\n') &&
                label.length <= 64 &&
                rect &&
                rect.width > 0 &&
                rect.width <= 220 &&
                rect.height > 0 &&
                rect.height <= 48 &&
                Math.abs(rect.bottom - elementRect.bottom) <= 6 &&
                new RegExp(`(?:^|\\n)[ \\t\\u00a0]*${escapeRegExp(label)}[ \\t\\u00a0]*$`).test(renderedText)
            )
            .map(({ label }) => label);
    }

    function stripTrailingCarouselCounter(text) {
        let output = String(text || '');
        const counterPatterns = [
            /\n[ \t\u00a0]*\d+[ \t\u00a0]*\n[ \t\u00a0]*\/[ \t\u00a0]*\n[ \t\u00a0]*\d+[ \t\u00a0]*$/,
            /\n[ \t\u00a0]*\d+[ \t\u00a0]*\/[ \t\u00a0]*\d+[ \t\u00a0]*$/
        ];

        counterPatterns.forEach((pattern) => {
            output = output.replace(pattern, '');
        });

        return output
            .replace(/[ \t\u00a0]+$/g, '')
            .replace(/\n+$/g, '');
    }

    function cleanPostTextFragment(text, trailingUiLabels = []) {
        let output = String(text || '').replace(/\r\n?/g, '\n');
        const normalizedUiLabels = Array.from(new Set(
            trailingUiLabels.map((label) => String(label || '').trim()).filter(Boolean)
        )).sort((a, b) => b.length - a.length);

        normalizedUiLabels.forEach((label) => {
            output = output.replace(
                new RegExp(`[ \\t\\u00a0]*(?:\\n[ \\t\\u00a0]*)?${escapeRegExp(label)}[ \\t\\u00a0]*(?:\\n[ \\t\\u00a0]*)*$`),
                ''
            );
        });

        if (normalizedUiLabels.length === 0) {
            output = output
                .replace(/[ \t\u00a0]*(?:\n[ \t\u00a0]*)?(?:翻譯|查看翻譯)[ \t\u00a0]*$/i, '')
                .replace(/[ \t\u00a0]*\n[ \t\u00a0]*(?:Translate|翻訳)[ \t\u00a0]*(?:\n[ \t\u00a0]*)*$/, '');
        }

        return output
            .replace(/[ \t\u00a0]+$/g, '')
            .replace(/^\n+|\n+$/g, '');
    }

    function getRenderedPostText(element) {
        const renderedText = getRenderedText(element);
        return cleanPostTextFragment(
            renderedText,
            getTrailingInlineUiLabels(element, renderedText)
        );
    }

    function isThreadsMusicPlaybackControl(element) {
        if (!element?.matches?.('button,[role=button]')) return false;
        const label = String(element.getAttribute?.('aria-label') || '').trim();
        return /^(?:播放|暫停|暂停)音[樂乐]$/.test(label) ||
            /^(?:play|pause)\s+music$/i.test(label) ||
            /^(?:音楽を再生|音楽を一時停止)$/.test(label);
    }

    function getThreadsMusicAttachmentTop(root) {
        const rootRect = root.getBoundingClientRect();
        return Array.from(root.querySelectorAll('[aria-label]'))
            .filter(isThreadsMusicPlaybackControl)
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => Number.isFinite(rect.top) && rect.bottom > rootRect.top)
            .map((rect) => rect.top)
            .filter((top) => top >= rootRect.top)
            .sort((a, b) => a - b)[0];
    }

    function getPostBlockTextBoundary(root, actionBar) {
        const rootRect = root.getBoundingClientRect();
        const actionTop = actionBar?.getBoundingClientRect?.().top;
        const musicAttachmentTop = getThreadsMusicAttachmentTop(root);
        const mediaTop = Array.from(root.querySelectorAll('img, video'))
            .filter(isDownloadableHoverMedia)
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.width >= MIN_MEDIA_SIZE && rect.height >= MIN_MEDIA_SIZE)
            .map((rect) => rect.top)
            .filter((top) => top >= rootRect.top)
            .sort((a, b) => a - b)[0];

        return Math.min(
            Number.isFinite(mediaTop) ? mediaTop : Infinity,
            Number.isFinite(musicAttachmentTop) ? musicAttachmentTop : Infinity,
            Number.isFinite(actionTop) ? actionTop : Infinity,
            rootRect.bottom
        );
    }

    function isExcludedPostBlockTextElement(element, root, boundaryTop, postInfo) {
        if (!element || !root.contains(element)) return true;
        if (element.closest(`.${POST_TOOL_CLASS}, .${COPY_TOOL_CLASS}, .${LINK_TOOL_CLASS}, .${BUTTON_CLASS}, #${MODAL_ID}`)) return true;
        const interactiveAncestor = element.closest('button, [role="button"], nav');
        if (interactiveAncestor && interactiveAncestor !== root && root.contains(interactiveAncestor)) return true;

        const enclosingLink = element.closest('a[href]');
        if (enclosingLink && (enclosingLink === element || enclosingLink.contains(element))) {
            const href = enclosingLink.getAttribute('href') || '';
            if (/\/post\//i.test(href)) {
                const linkInfo = parsePostInfoFromUrl(href);
                const belongsToCurrentPost = Boolean(
                    postInfo?.postId &&
                    linkInfo?.postId === postInfo.postId
                );
                if (!belongsToCurrentPost) return true;
            } else if (/\/@[^/]+\/?$|\/search(?:\?|$)/i.test(href)) {
                return true;
            }
        }

        if (element.querySelector('time, video')) return true;
        const containsPostMediaImage = Array.from(element.querySelectorAll('img'))
            .some((image) => {
                const imageRect = image.getBoundingClientRect?.();
                return Boolean(
                    imageRect &&
                    imageRect.width >= MIN_MEDIA_SIZE &&
                    imageRect.height >= MIN_MEDIA_SIZE
                );
            });
        if (containsPostMediaImage) return true;

        const rect = element.getBoundingClientRect();
        if (!isVisibleTextRect(rect) || rect.top >= boundaryTop || rect.bottom <= root.getBoundingClientRect().top) return true;

        const text = getRenderedText(element);
        if (!text) return true;
        if (postInfo?.author && text.replace(/^@/, '') === postInfo.author.replace(/^@/, '')) return true;
        if (/^\d[\d,.]*\s*$/.test(text)) return true;
        if (/^\d+\s*(秒|分鐘?|分|小時|天|週|周|個月|月|年)\s*$/.test(text)) return true;

        return false;
    }

    function scorePostBlockTextElement(element, root, boundaryTop) {
        const text = getRenderedText(element);
        const rect = element.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const lineCount = text.split('\n').length;
        const whiteSpace = window.getComputedStyle(element).whiteSpace || '';
        const hasNestedInteractiveContent = Boolean(element.querySelector('button, [role="button"], img, video, time'));
        let score = text.length * 8;

        score += Math.min(lineCount, 20) * 30;
        score += element.matches('[dir="auto"]') ? 420 : 0;
        score += /pre|break-spaces/.test(whiteSpace) ? 220 : 0;
        score += rect.width >= 180 ? 80 : 0;
        score += Math.min(160, Math.max(0, rect.top - rootRect.top) * 0.45);

        if (hasNestedInteractiveContent) score -= 900;
        if (rect.bottom > boundaryTop + 4) score -= 500;
        if (text.length <= 2) score -= 80;

        return score;
    }

    function extractPostBlockText(root, actionBar) {
        if (!root) return '';

        const boundaryTop = getPostBlockTextBoundary(root, actionBar);
        const postInfo = findBestPostInfoInNode(root, actionBar || root, true) ||
            findPostInfoInNode(root);
        const collectCandidates = (elements) => elements
            .filter((element) => !isExcludedPostBlockTextElement(element, root, boundaryTop, postInfo))
            .map((element) => ({
                element,
                text: getRenderedPostText(element),
                rect: element.getBoundingClientRect(),
                score: scorePostBlockTextElement(element, root, boundaryTop)
            }))
            .filter((item) => item.text)
            .sort((a, b) => b.score - a.score);
        let candidates = collectCandidates(Array.from(root.querySelectorAll('[dir="auto"]')));

        if (candidates.length === 0) {
            candidates = collectCandidates(Array.from(root.querySelectorAll('p, div, span')));
        }

        const orderedCandidates = candidates
            .filter((item) => !candidates.some((other) =>
                other !== item &&
                item.element.contains(other.element) &&
                other.text === item.text
            ))
            .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
        const fragments = [];

        orderedCandidates.forEach((item) => {
            const text = item.text;
            if (!text) return;
            if (fragments.some((fragment) => fragment === text || fragment.includes(text))) return;

            for (let index = fragments.length - 1; index >= 0; index -= 1) {
                if (text.includes(fragments[index])) {
                    fragments.splice(index, 1);
                }
            }
            fragments.push(text);
        });

        return stripTrailingCarouselCounter(fragments.join('\n'));
    }

    function copyPostBlockText(root, actionBar, activationToken) {
        if (!isValidUserActivationToken(activationToken)) return false;
        const text = extractPostBlockText(root, actionBar);
        if (!text) {
            toast(message('postTextNotFound'));
            return false;
        }

        copyText(text, activationToken);
        toast(message('postTextCopied'));
        return true;
    }

    function copyPostBlockCleanLink(root, shareButton, activationToken) {
        if (!isValidUserActivationToken(activationToken)) return false;
        const postInfo = root
            ? findBestPostInfoInNode(root, shareButton || root, true)
            : parsePostInfoFromUrl(location.href);
        const cleanUrl = buildCleanThreadsPostUrl(postInfo || parsePostInfoFromUrl(location.href));
        if (!cleanUrl) {
            toast(message('postLinkNotFound'));
            return false;
        }

        copyText(cleanUrl, activationToken);
        toast(message('cleanLinkCopied'));
        return true;
    }

    function getDownloadErrorText(error) {
        if (typeof error === 'string') return error.toLowerCase();
        return [error?.error, error?.code, error?.name, error?.message, error?.details]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    function isSecurityDownloadError(error) {
        return /(?:not[_\s-]?whitelisted|not[_\s-]?permitted|forbidden|unauthori[sz]ed|permission|security|whitelist)/i
            .test(getDownloadErrorText(error));
    }

    function isTransientDownloadError(error) {
        if (isSecurityDownloadError(error)) return false;
        return /(?:timeout|network|connection|not[_\s-]?succeeded|server|temporar|download[_\s-]?failed)/i
            .test(getDownloadErrorText(error));
    }

    function triggerBlobDownload(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
    }

    function downloadViaBlob(item, filename, activationToken, options = {}) {
        if (stopped || state.lifecycleController.signal.aborted) {
            return Promise.reject(new Error('runtime_stopped'));
        }
        if (!isValidUserActivationToken(activationToken)) {
            return Promise.reject(new Error('trusted_user_activation_required'));
        }

        const expectedType = item?.type === 'image' || item?.type === 'video' ? item.type : null;
        const validated = validateMediaUrl(item?.url, expectedType);
        if (!validated.ok) return Promise.reject(new Error(`unsafe_media_url:${validated.reason}`));
        if (typeof platform.requestMedia !== 'function') {
            return Promise.reject(new Error('media_request_unsupported'));
        }

        const watchdogMs = Math.max(1, Number(options.watchdogMs) || BLOB_DOWNLOAD_WATCHDOG_MS);
        const timeoutMs = Math.max(watchdogMs, Number(options.timeoutMs) || DOWNLOAD_TIMEOUT_MS);
        const saveBlob = typeof options.saveBlob === 'function' ? options.saveBlob : triggerBlobDownload;
        const setTimer = options.setTimeoutFn || setTimeout;
        const clearTimer = options.clearTimeoutFn || clearTimeout;

        return new Promise((resolve, reject) => {
            let settled = false;
            let requestHandle = null;
            let watchdogTimer = null;
            let signalAbortHandler = null;
            let lifecycleAbortHandler = null;

            const settle = (error, value) => {
                if (settled) return;
                settled = true;
                if (watchdogTimer) clearTimer(watchdogTimer);
                if (options.signal && signalAbortHandler) {
                    options.signal.removeEventListener?.('abort', signalAbortHandler);
                }
                if (lifecycleAbortHandler) {
                    state.lifecycleController.signal.removeEventListener?.('abort', lifecycleAbortHandler);
                }
                if (error) reject(error);
                else resolve(value);
            };

            const abortRequest = (reason) => {
                try {
                    requestHandle?.abort?.();
                } catch (error) {
                    warn('Media request abort failed', error);
                }
                settle(reason instanceof Error ? reason : new Error(String(reason || 'download aborted')));
            };

            const armWatchdog = () => {
                if (settled) return;
                if (watchdogTimer) clearTimer(watchdogTimer);
                watchdogTimer = setTimer(() => {
                    abortRequest(new Error('XHR download watchdog timeout'));
                }, watchdogMs);
            };

            signalAbortHandler = () => abortRequest(new Error('download aborted'));
            lifecycleAbortHandler = () => abortRequest(new Error('runtime stopped'));
            if (options.signal?.aborted || state.lifecycleController.signal.aborted) {
                settle(new Error('download aborted'));
                return;
            }
            options.signal?.addEventListener?.('abort', signalAbortHandler, { once: true });
            state.lifecycleController.signal.addEventListener?.('abort', lifecycleAbortHandler, { once: true });

            const requestDetails = {
                method: 'GET',
                url: validated.url,
                responseType: 'blob',
                anonymous: true,
                timeout: timeoutMs,
                onload: (response) => {
                    if (settled || stopped || state.lifecycleController.signal.aborted) return;
                    if (response.status < 200 || response.status >= 300) {
                        settle(new Error(`HTTP ${response.status}`));
                        return;
                    }

                    const finalUrl = response.finalUrl || response.responseURL || validated.url;
                    const finalValidation = validateMediaUrl(finalUrl, validated.type);
                    if (!finalValidation.ok) {
                        settle(new Error(`unsafe_final_media_url:${finalValidation.reason}`));
                        return;
                    }

                    const declaredMediaMimes = [
                        response.response?.type,
                        getHeaderValue(response.responseHeaders, 'content-type')
                    ]
                        .map((value) => String(value || '').split(';', 1)[0].trim().toLowerCase())
                        .filter(Boolean);
                    if (declaredMediaMimes.length === 0) {
                        settle(new Error('unexpected_media_mime:missing'));
                        return;
                    }
                    const unexpectedMime = declaredMediaMimes.find((mime) =>
                        mime !== 'application/octet-stream' && !mime.startsWith(`${validated.type}/`)
                    );
                    if (unexpectedMime) {
                        settle(new Error(`unexpected_media_mime:${unexpectedMime}`));
                        return;
                    }
                    const blobType = declaredMediaMimes.find((mime) => mime.startsWith(`${validated.type}/`)) ||
                        declaredMediaMimes[0];

                    const finalName = filename || buildFilename({ ...item, url: finalValidation.url }, blobType);
                    if (settled || stopped || state.lifecycleController.signal.aborted) return;
                    try {
                        saveBlob(response.response, finalName);
                        settle(null, finalName);
                    } catch (error) {
                        settle(error);
                    }
                },
                onerror: (error) => settle(error instanceof Error ? error : new Error(getDownloadErrorText(error) || 'XHR download failed')),
                ontimeout: () => settle(new Error('XHR download timeout')),
                onprogress: () => armWatchdog(),
                onabort: () => settle(new Error('XHR download aborted'))
            };

            try {
                requestHandle = platform.requestMedia(requestDetails);
            } catch (error) {
                settle(error);
                return;
            }

            if (!settled) {
                armWatchdog();
            }
        });
    }

    function downloadItem(item, activationToken, options = {}) {
        if (stopped || !isValidUserActivationToken(activationToken)) return Promise.resolve(false);

        const expectedType = item?.type === 'image' || item?.type === 'video' ? item.type : null;
        const validated = validateMediaUrl(item?.url, expectedType);
        if (!validated.ok) {
            warn('unsafe media URL rejected', validated.reason);
            return Promise.resolve(false);
        }

        const safeItem = { ...item, type: validated.type, url: validated.url };
        const postInfo = safeItem.postInfo || ((safeItem.contextElement || safeItem.element)
            ? findPostContext(safeItem.contextElement || safeItem.element)
            : (getCurrentDetailPostInfo() || { author: 'unknown', postId: 'unknown', postUrl: location.href, createdAt: null }));
        const sequence = nextPostSequence(postInfo);
        const filename = buildFilename({ ...safeItem, postInfo, sequence });
        const timeoutMs = Math.max(1, Number(options.timeoutMs) || DOWNLOAD_TIMEOUT_MS);
        const watchdogMs = Math.max(timeoutMs, Number(options.watchdogMs) || DOWNLOAD_WATCHDOG_MS);
        const blobWatchdogMs = Math.max(watchdogMs, Number(options.blobWatchdogMs) || BLOB_DOWNLOAD_WATCHDOG_MS);
        const overallWatchdogMs = Math.max(watchdogMs, Number(options.overallWatchdogMs) || (watchdogMs * 2 + 5000));
        const fallbackOverallWatchdogMs = Math.max(overallWatchdogMs, blobWatchdogMs + 5000);
        const setTimer = options.setTimeoutFn || setTimeout;
        const clearTimer = options.clearTimeoutFn || clearTimeout;
        const fallbackController = typeof AbortController === 'function' ? new AbortController() : null;

        toast(message('downloadRequested', { filename }));

        return new Promise((resolve) => {
            let settled = false;
            let fallbackStarted = false;
            let downloadHandle = null;
            let watchdogTriggered = false;
            let gmWatchdogTimer = null;
            let overallWatchdogTimer = null;
            const stopDownload = () => {
                try { downloadHandle?.abort?.(); } catch { /* Best-effort cancellation. */ }
                fallbackController?.abort();
                finish(false);
            };

            const finish = (success) => {
                if (settled) return;
                settled = true;
                if (gmWatchdogTimer) clearTimer(gmWatchdogTimer);
                if (overallWatchdogTimer) clearTimer(overallWatchdogTimer);
                if (!success) fallbackController?.abort();
                state.lifecycleController.signal.removeEventListener?.('abort', stopDownload);
                resolve(Boolean(success));
            };

            state.lifecycleController.signal.addEventListener?.('abort', stopDownload, { once: true });

            const failWithoutFallback = (error) => {
                warn('download rejected without blob fallback', error);
                toast(message('downloadFailed'));
                finish(false);
            };

            const tryBlobFallback = (error, force = false) => {
                if (settled || fallbackStarted) return;
                if (isSecurityDownloadError(error)) {
                    failWithoutFallback(error);
                    return;
                }
                if (!force && !isTransientDownloadError(error)) {
                    failWithoutFallback(error);
                    return;
                }

                fallbackStarted = true;
                if (gmWatchdogTimer) clearTimer(gmWatchdogTimer);
                if (overallWatchdogTimer) clearTimer(overallWatchdogTimer);
                overallWatchdogTimer = setTimer(() => {
                    fallbackController?.abort();
                    finish(false);
                }, fallbackOverallWatchdogMs);
                warn('Direct download failed, trying anonymous blob fallback', error);
                downloadViaBlob(safeItem, filename, activationToken, {
                    ...options,
                    timeoutMs,
                    watchdogMs: blobWatchdogMs,
                    signal: fallbackController?.signal
                }).then((finalName) => {
                    toast(message('downloadStarted', { filename: finalName }));
                    finish(true);
                }).catch((blobError) => {
                    warn('fallback download failed', blobError);
                    toast(message('downloadFailed'));
                    finish(false);
                });
            };

            const armGmIdleWatchdog = () => {
                if (settled || fallbackStarted) return;
                if (gmWatchdogTimer) clearTimer(gmWatchdogTimer);
                if (overallWatchdogTimer) clearTimer(overallWatchdogTimer);
                overallWatchdogTimer = setTimer(() => {
                    watchdogTriggered = true;
                    try {
                        downloadHandle?.abort?.();
                    } catch (error) {
                        warn('Direct download abort failed', error);
                    }
                    fallbackController?.abort();
                    finish(false);
                }, overallWatchdogMs);
                gmWatchdogTimer = setTimer(() => {
                    watchdogTriggered = true;
                    try {
                        downloadHandle?.abort?.();
                    } catch (error) {
                        warn('Direct download abort failed', error);
                    }
                    tryBlobFallback(new Error('direct_download_watchdog_timeout'), true);
                }, watchdogMs);
            };

            if (typeof platform.downloadMedia !== 'function') {
                tryBlobFallback(new Error('direct_download_unsupported'), true);
                return;
            }

            const details = {
                url: safeItem.url,
                name: filename,
                saveAs: false,
                onload: () => {
                    if (fallbackStarted || settled) return;
                    toast(message('downloadStarted', { filename }));
                    finish(true);
                },
                onerror: (error) => {
                    if (fallbackStarted || settled) return;
                    if (isSecurityDownloadError(error)) {
                        failWithoutFallback(error);
                        return;
                    }
                    tryBlobFallback(error);
                },
                ontimeout: (error) => {
                    if (fallbackStarted || settled) return;
                    tryBlobFallback(error || new Error('direct_download_timeout'), true);
                },
                onprogress: () => {
                    armGmIdleWatchdog();
                },
                onabort: (error) => {
                    if (!watchdogTriggered && !fallbackStarted && !settled) {
                        failWithoutFallback(error || new Error('direct_download_aborted'));
                    }
                }
            };

            try {
                downloadHandle = platform.downloadMedia(details);
            } catch (error) {
                if (isSecurityDownloadError(error)) failWithoutFallback(error);
                else tryBlobFallback(error);
                return;
            }

            if (!settled && !fallbackStarted) {
                armGmIdleWatchdog();
            }
        });
    }

    function mediaItemFromElement(element) {
        scanInlineScriptsForVideoUrls();

        if (element?.tagName === 'IMG') {
            const video = findAssociatedVideoForImage(element);
            if (video) {
                const videoUrl = resolveVideoUrl(video, element);
                return videoUrl ? { type: 'video', url: videoUrl, element: video, contextElement: element } : null;
            }

            if (isLikelyVideoThumbnail(element)) {
                const postContext = findPostContext(element);
                const mappedPostUrl = pickMappedVideoUrlForThumbnail(element, postContext);
                return mappedPostUrl ? { type: 'video', url: mappedPostUrl, element, contextElement: element } : null;
            }

            const url = resolveImageUrl(element);
            return url ? { type: 'image', url, element } : null;
        }

        if (element?.tagName === 'VIDEO') {
            const url = resolveVideoUrl(element);
            return url ? { type: 'video', url, element } : null;
        }

        const containedMedia = Array.from(element?.querySelectorAll?.('img, video') || [])
            .filter(isDownloadableHoverMedia)
            .map((media) => ({ media, rect: media.getBoundingClientRect() }))
            .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0]?.media;
        if (containedMedia) return mediaItemFromElement(containedMedia);

        const postContext = element ? findPostContext(element) : null;
        const mappedVideoUrl = postContext ? pickMappedVideoUrlForSurface(element, postContext) : null;
        if (mappedVideoUrl) {
            return { type: 'video', url: mappedVideoUrl, element, contextElement: element };
        }

        const bgUrl = getCssBackgroundImageUrl(element);
        if (bgUrl && isImageUrl(bgUrl) && !isLikelyVideoSurface(element)) {
            return { type: 'image', url: bgUrl, element };
        }

        return null;
    }

    function getAssociatedVideoElement(element) {
        if (element?.tagName === 'VIDEO') return element;
        if (element?.tagName !== 'IMG') return null;

        const directVideo = findAssociatedVideoForImage(element);
        if (directVideo) return directVideo;

        const postRoot = findPostRoot(element);
        const imgRect = element.getBoundingClientRect();
        return Array.from(postRoot.querySelectorAll?.('video') || [])
            .filter(isLikelyPostVideo)
            .find((video) => rectsOverlap(imgRect, video.getBoundingClientRect())) || null;
    }

    async function nudgeVideoLoading(element) {
        if (stopped) return;
        const video = getAssociatedVideoElement(element);
        if (!video) return;

        try {
            video.preload = 'auto';
            video.load?.();
        } catch (error) {
            // Ignore media state errors from Threads' player.
        }

        try {
            const playPromise = video.play?.();
            if (playPromise?.catch) {
                await playPromise.catch(() => { });
            }
        } catch (error) {
            // Autoplay can be blocked; network hooks may still capture URLs.
        }
    }

    async function mediaItemFromElementWithRetry(element) {
        if (stopped) return null;
        let item = mediaItemFromElement(element);
        if (item) return item;

        const mayBeVideo =
            element?.tagName === 'VIDEO' ||
            (element?.tagName === 'IMG' && isLikelyVideoThumbnail(element));

        if (!mayBeVideo) return null;

        toast(message('resolvingVideoUrl'));
        await nudgeVideoLoading(element);

        for (let attempt = 0; attempt < 10; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            if (stopped) return null;
            scanInlineScriptsForVideoUrls();

            item = mediaItemFromElement(element);
            if (item) return item;
        }

        return null;
    }

    function blockEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
    }

    async function activateButton(button, activationToken, options = {}) {
        if (stopped || !isValidUserActivationToken(activationToken)) return false;
        if (button.dataset.tmBusy === '1') return false;

        const element = options.element || state.elementByButton.get(button);
        const resolveMediaItem = options.resolveMediaItem || mediaItemFromElementWithRetry;
        const startDownload = options.downloadItemFn || downloadItem;
        const setTimer = options.setTimeoutFn || ((callback, delayMs) => window.setTimeout(callback, delayMs));
        button.dataset.tmBusy = '1';

        const item = element ? await resolveMediaItem(element) : null;
        if (stopped) {
            button.dataset.tmBusy = '0';
            return false;
        }

        if (!item) {
            toast(message('videoUrlNotFound'));
            setTimer(() => {
                button.dataset.tmBusy = '0';
            }, 700);
            return false;
        }

        return Promise.resolve(startDownload(item, activationToken)).finally(() => {
            setTimer(() => {
                button.dataset.tmBusy = '0';
            }, 700);
        });
    }

    function handleButtonClick(event) {
        blockEvent(event);
        const activationToken = createUserActivationToken(event);
        if (activationToken) activateButton(event.currentTarget, activationToken);
    }

    function stopButtonEvent(event) {
        blockEvent(event);
    }

    function findButtonFromEvent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const pathButton = path.find((node) => node?.classList?.contains?.(BUTTON_CLASS));
        if (pathButton) return pathButton;

        return event.target?.closest?.(`.${BUTTON_CLASS}`) || null;
    }

    function handleGlobalButtonEvent(event) {
        const button = findButtonFromEvent(event);
        if (!button) return;

        blockEvent(event);

        if (event.type === 'click') {
            const activationToken = createUserActivationToken(event);
            if (activationToken) activateButton(button, activationToken);
        }
    }

    function bindGlobalButtonEvents() {
        [
            'pointerdown',
            'pointerup',
            'mousedown',
            'mouseup',
            'touchstart',
            'touchend',
            'click',
            'dblclick'
        ].forEach((eventName) => {
            listen(window, eventName, handleGlobalButtonEvent, true);
            listen(document, eventName, handleGlobalButtonEvent, true);
        });
    }

    function findMediaContainer(element) {
        const base = element.closest?.('picture') || element;
        const mediaRect = element.getBoundingClientRect();
        let best = base.parentElement || base;
        let node = best;

        for (let depth = 0; node && depth < 6; depth += 1) {
            const rect = node.getBoundingClientRect();
            const closeWidth = rect.width <= mediaRect.width + 96;
            const closeHeight = rect.height <= mediaRect.height + 96;
            const containsOnlyThisMedia = visibleMediaCount(node) <= 1;

            if (rect.width >= mediaRect.width * 0.85 && rect.height >= mediaRect.height * 0.85 && closeWidth && closeHeight && containsOnlyThisMedia) {
                best = node;
                node = node.parentElement;
                continue;
            }

            break;
        }

        return best;
    }

    function prepareContainer(container) {
        const computedPosition = window.getComputedStyle(container).position;
        if (computedPosition === 'static') {
            container.style.position = 'relative';
        }
    }

    function isVideoTargetElement(element) {
        if (element?.tagName === 'VIDEO') return true;
        if (element?.tagName === 'IMG') {
            return Boolean(findAssociatedVideoForImage(element)) || isLikelyVideoThumbnail(element);
        }

        return false;
    }

    function ensureHoverButton() {
        if (state.hoverButton) return state.hoverButton;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.innerHTML = `
            <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 4v12M8 12l4 4 4-4M4 20h16" />
            </svg>
        `;
        button.title = message('downloadMedia');
        button.setAttribute('aria-label', message('downloadMedia'));
        button.dataset.tmHidden = '1';
        button.addEventListener('click', handleButtonClick, true);
        button.addEventListener('mousedown', stopButtonEvent, true);
        button.addEventListener('pointerdown', stopButtonEvent, true);
        button.addEventListener('mouseenter', () => window.clearTimeout(state.hideTimer), true);
        button.addEventListener('mouseleave', scheduleHideHoverButton, true);

        document.body.appendChild(button);
        state.hoverButton = button;
        state.elementByButton.set(button, null);
        state.liveButtons.add(button);
        return button;
    }

    function showHoverButton(element) {
        if (!element || !document.documentElement.contains(element)) return;

        const button = ensureHoverButton();
        state.hoverElement = element;
        state.elementByButton.set(button, element);
        button.dataset.tmHidden = '0';
        button.dataset.tmKind = isVideoTargetElement(element) ? 'video' : 'photo';
        positionFloatingButton(button, element);
    }

    function hideHoverButton() {
        const button = state.hoverButton;
        if (!button) {
            state.hoverElement = null;
            return;
        }

        if (button.dataset.tmHidden === '1' && !state.hoverElement) return;

        state.hoverElement = null;
        button.dataset.tmHidden = '1';
        button.style.left = '';
        button.style.top = '';
        state.elementByButton.set(button, null);
    }

    function scheduleHideHoverButton() {
        window.clearTimeout(state.hideTimer);
        state.hideTimer = window.setTimeout(() => {
            if (document.querySelector(`.${BUTTON_CLASS}:hover`)) return;
            hideHoverButton();
        }, 140);
    }

    function positionFloatingButton(button, element) {
        const rect = element.getBoundingClientRect();
        button.style.left = `${Math.max(8, Math.round(rect.left + 10))}px`;
        button.style.top = `${Math.max(8, Math.round(rect.top + 10))}px`;
    }

    function isPlausibleStandaloneVideoAnchor(video) {
        const rect = video.getBoundingClientRect();
        if (!isVisibleRect(rect)) return false;

        const desktopLayout = window.innerWidth >= 760;
        const looksLikeChromeOrHiddenPlayer = desktopLayout && rect.left < 120 && rect.top < 120;
        if (looksLikeChromeOrHiddenPlayer) return false;

        return true;
    }

    function isDownloadableHoverMedia(element) {
        if (!element) return false;
        if (element.tagName === 'IMG') return isLikelyPostImage(element);
        if (element.tagName === 'VIDEO') return isLikelyPostVideo(element) && isPlausibleStandaloneVideoAnchor(element);
        return false;
    }

    function isPlausibleHoverRect(rect) {
        if (!isVisibleRect(rect)) return false;

        const desktopLayout = window.innerWidth >= 760;
        if (desktopLayout && rect.left < 120 && rect.top < 120) return false;

        return true;
    }

    function isLikelyVideoSurface(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        const rect = element.getBoundingClientRect();
        if (!isVisibleRect(rect)) return false;

        return hasOverlappingVideoControl(rect, element) ||
            Array.from(element.querySelectorAll?.('video') || []).some(isLikelyPostVideo);
    }

    function isLikelyMediaSurface(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        if (element === document.body || element === document.documentElement) return false;
        if (element.classList?.contains?.(BUTTON_CLASS) ||
            element.classList?.contains?.(POST_TOOL_CLASS) ||
            element.classList?.contains?.(COPY_TOOL_CLASS) ||
            element.classList?.contains?.(LINK_TOOL_CLASS)) return false;

        const rect = element.getBoundingClientRect();
        if (!isPlausibleHoverRect(rect)) return false;
        if (rect.width > Math.min(window.innerWidth - 24, 820)) return false;
        if (rect.height > Math.min(window.innerHeight - 24, 820)) return false;

        const bgUrl = getCssBackgroundImageUrl(element);
        if (bgUrl && isImageUrl(bgUrl)) return true;
        if (isLikelyVideoSurface(element)) return true;

        return false;
    }

    function rectContainsPoint(rect, x, y) {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function isPlausiblePointSearchScope(element, x, y) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        if (element === document.body || element === document.documentElement) return false;

        const rect = element.getBoundingClientRect();
        if (!isPlausibleHoverRect(rect) || !rectContainsPoint(rect, x, y)) return false;

        return rect.width <= Math.min(window.innerWidth, 920) &&
            rect.height <= Math.min(window.innerHeight, 920);
    }

    function collectPointMediaCandidates(scope, x, y, candidates, seen) {
        if (!scope || scope.nodeType !== Node.ELEMENT_NODE) return;

        const addMedia = (element) => {
            if (!element || seen.has(element) || !isDownloadableHoverMedia(element)) return;

            const rect = element.getBoundingClientRect();
            if (!isPlausibleHoverRect(rect) || !rectContainsPoint(rect, x, y)) return;

            seen.add(element);
            candidates.push({ element, rect });
        };

        addMedia(scope);

        if (!isPlausiblePointSearchScope(scope, x, y)) return;

        Array.from(scope.querySelectorAll?.('img, video') || []).forEach(addMedia);
    }

    function findMediaFromPoint(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

        if (typeof document.elementsFromPoint !== 'function') {
            const fallbackCandidates = Array.from(document.querySelectorAll('img, video'))
                .filter(isDownloadableHoverMedia)
                .map((element) => ({ element, rect: element.getBoundingClientRect() }))
                .filter((item) => isPlausibleHoverRect(item.rect))
                .filter((item) => rectContainsPoint(item.rect, x, y))
                .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));

            return fallbackCandidates[0]?.element || null;
        }

        const candidates = [];
        const seen = new Set();
        const pointElements = document.elementsFromPoint(x, y)
            .filter((element) => !element?.classList?.contains?.(BUTTON_CLASS))
            .filter((element) => !element?.classList?.contains?.(POST_TOOL_CLASS))
            .filter((element) => !element?.classList?.contains?.(COPY_TOOL_CLASS))
            .filter((element) => !element?.classList?.contains?.(LINK_TOOL_CLASS))
            .slice(0, 12);

        pointElements.forEach((element) => {
            collectPointMediaCandidates(element, x, y, candidates, seen);

            let node = element.parentElement;
            for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
                collectPointMediaCandidates(node, x, y, candidates, seen);
            }
        });

        candidates.sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));

        return candidates[0]?.element || null;
    }

    function findMediaFromEvent(event) {
        return findMediaFromPoint(event.clientX, event.clientY);
    }

    function findMediaSurfaceFromEvent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const candidates = path
            .filter((node) => node?.nodeType === Node.ELEMENT_NODE)
            .filter(isLikelyMediaSurface)
            .map((element) => ({ element, rect: element.getBoundingClientRect() }))
            .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));

        return candidates[0]?.element || null;
    }

    function isPrimaryPointerDown(event) {
        return Boolean(event?.buttons && (event.buttons & 1));
    }

    function getHoverScanIntervalMs() {
        const value = Number(USER_OPTIONS.hoverScanIntervalMs);
        return Number.isFinite(value) ? Math.max(0, value) : 160;
    }

    function clearHoverScanQueue() {
        window.clearTimeout(state.hoverScanTimer);
        state.hoverScanTimer = 0;
        if (state.hoverMoveRaf) {
            window.cancelAnimationFrame(state.hoverMoveRaf);
            state.hoverMoveRaf = 0;
        }
    }

    function setPointerDragActive(event) {
        if (findButtonFromEvent(event)) return;
        state.pointerDragActive = true;
        state.pendingHoverPoint = null;
        clearHoverScanQueue();
        hideHoverButton();
    }

    function clearPointerDragActive() {
        state.pointerDragActive = false;
    }

    function processMediaPointerMove(point) {
        const button = state.hoverButton;
        if (button && (point.target === button || button.contains(point.target))) {
            return;
        }

        const media = findMediaFromPoint(point.clientX, point.clientY);
        if (!media) {
            scheduleHideHoverButton();
            return;
        }

        window.clearTimeout(state.hideTimer);
        showHoverButton(media);
    }

    function runQueuedHoverScan() {
        if (state.hoverMoveRaf) return;
        state.hoverMoveRaf = window.requestAnimationFrame(() => {
            state.hoverMoveRaf = 0;
            state.lastHoverScanAt = Date.now();
            const point = state.pendingHoverPoint;
            state.pendingHoverPoint = null;
            if (point) processMediaPointerMove(point);
        });
    }

    function scheduleHoverScan() {
        const interval = getHoverScanIntervalMs();
        const elapsed = Date.now() - state.lastHoverScanAt;

        if (elapsed >= interval) {
            window.clearTimeout(state.hoverScanTimer);
            state.hoverScanTimer = 0;
            runQueuedHoverScan();
            return;
        }

        if (state.hoverScanTimer) return;
        state.hoverScanTimer = window.setTimeout(() => {
            state.hoverScanTimer = 0;
            runQueuedHoverScan();
        }, interval - elapsed);
    }

    function handleMediaPointerMove(event) {
        if (state.pointerDragActive || isPrimaryPointerDown(event)) {
            state.pendingHoverPoint = null;
            clearHoverScanQueue();
            hideHoverButton();
            return;
        }

        state.pendingHoverPoint = {
            clientX: event.clientX,
            clientY: event.clientY,
            target: event.target
        };

        scheduleHoverScan();
    }

    function bindHoverEvents() {
        if (window.PointerEvent) {
            listen(document, 'pointermove', handleMediaPointerMove, true);
            listen(document, 'pointerdown', setPointerDragActive, true);
            listen(document, 'pointerup', clearPointerDragActive, true);
            listen(document, 'pointercancel', clearPointerDragActive, true);
        } else {
            listen(document, 'mousemove', handleMediaPointerMove, true);
            listen(document, 'mousedown', setPointerDragActive, true);
            listen(document, 'mouseup', clearPointerDragActive, true);
        }
        listen(document, 'scroll', refreshButtonsSoon, true);
        listen(window, 'resize', refreshButtonsSoon, true);
    }

    function rectsOverlap(a, b) {
        const left = Math.max(a.left, b.left);
        const top = Math.max(a.top, b.top);
        const right = Math.min(a.right, b.right);
        const bottom = Math.min(a.bottom, b.bottom);
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        const overlapArea = width * height;
        const smallerArea = Math.min(a.width * a.height, b.width * b.height);

        return smallerArea > 0 && overlapArea / smallerArea > 0.45;
    }

    function findAssociatedVideoForImage(img, knownVideos) {
        const postRoot = findPostRoot(img);
        const videos = (knownVideos || Array.from(postRoot?.querySelectorAll?.('video') || []))
            .filter(isLikelyPostVideo)
            .filter((video) => !postRoot || findPostRoot(video) === postRoot);
        const imgRect = img.getBoundingClientRect();

        let node = img;
        for (let depth = 0; node && depth < 7; depth += 1) {
            const containedVideo = Array.from(node.querySelectorAll?.('video') || [])
                .find((video) => isLikelyPostVideo(video) && rectsOverlap(imgRect, video.getBoundingClientRect()));
            if (containedVideo) return containedVideo;

            const hasVideoUi = hasOverlappingVideoControl(imgRect, node);
            if (hasVideoUi && videos.length === 1) return videos[0];

            node = node.parentElement;
        }

        return videos.find((video) => rectsOverlap(imgRect, video.getBoundingClientRect())) || null;
    }

    function findPostRoot(element) {
        const nearestBoundary = element.closest?.('article,[role="article"],[data-pressable-container]');
        if (nearestBoundary && findBestPostInfoInNode(nearestBoundary, element, true)) {
            return nearestBoundary;
        }

        let node = element;
        for (let depth = 0; node && depth < 14; depth += 1) {
            if (findBestPostInfoInNode(node, element, true)) return node;
            node = node.parentElement;
        }

        return element.parentElement || element;
    }

    function pickMappedVideoUrlForThumbnail(img, postContext) {
        const urls = state.videoUrlsByPostId.get(postContext.postId) || [];
        if (urls.length === 0) return null;

        const root = findPostRoot(img);
        const thumbnails = Array.from(root.querySelectorAll?.('img') || [])
            .filter(isLikelyPostImage)
            .filter(isLikelyVideoThumbnail);
        if (urls.length === 1 && thumbnails.length <= 1 && thumbnails.includes(img)) {
            return urls[0];
        }

        return null;
    }

    function pickMappedVideoUrlForSurface(surface, postContext) {
        const urls = state.videoUrlsByPostId.get(postContext.postId) || [];
        if (urls.length === 0) return null;

        const root = findPostRoot(surface);
        const surfaceRect = surface.getBoundingClientRect();
        const surfaces = [
            ...Array.from(root.querySelectorAll?.('img') || []).filter(isLikelyPostImage).filter(isLikelyVideoThumbnail),
            ...Array.from(root.querySelectorAll?.('div, a, [role="button"]') || []).filter(isLikelyMediaSurface).filter(isLikelyVideoSurface)
        ];
        const uniqueSurfaces = surfaces
            .filter((item, index) => surfaces.indexOf(item) === index)
            .map((item) => ({ item, rect: item.getBoundingClientRect() }))
            .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
        const matchingSurfaces = uniqueSurfaces.filter(({ rect }) => rectsOverlap(surfaceRect, rect));
        if (urls.length === 1 && uniqueSurfaces.length <= 1 && matchingSurfaces.length === 1) {
            return urls[0];
        }

        return null;
    }

    function isLikelyVideoThumbnail(img) {
        const imgRect = img.getBoundingClientRect();

        let node = img;
        for (let depth = 0; node && depth < 7; depth += 1) {
            const hasVideo = Array.from(node.querySelectorAll?.('video') || [])
                .some((video) => isLikelyPostVideo(video) && rectsOverlap(imgRect, video.getBoundingClientRect()));
            if (hasVideo) return true;

            if (hasOverlappingVideoControl(imgRect, node)) return true;
            node = node.parentElement;
        }

        return false;
    }

    function hasOverlappingVideoControl(mediaRect, root) {
        const labelledControls = Array.from(root.querySelectorAll?.('[aria-label], [role="button"]') || []);

        return labelledControls.some((uiNode) => {
            const label = uiNode.getAttribute('aria-label') || uiNode.textContent || '';
            if (!/play|pause|mute|unmute|audio|sound/i.test(label)) return false;

            const controlRect = uiNode.getBoundingClientRect();
            return rectsOverlap(mediaRect, controlRect);
        });
    }

    function getCurrentDetailPostInfo() {
        return parsePostInfoFromUrl(location.href);
    }

    function isDetailPostPage() {
        return Boolean(getCurrentDetailPostInfo());
    }

    function getVisibleRectScore(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return Number.MAX_SAFE_INTEGER;
        return Math.abs(rect.top - 80) + Math.max(0, rect.left);
    }

    function scoreDetailPostRootCandidate(node, link) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 260 || rect.height < 140) return Number.NEGATIVE_INFINITY;
        if (node === document.body || node === document.documentElement) return Number.NEGATIVE_INFINITY;

        const mediaCount = node.querySelectorAll?.('img, video')?.length || 0;
        if (mediaCount === 0) return Number.NEGATIVE_INFINITY;

        let score = 0;
        if (node.hasAttribute?.('data-pressable-container')) score += 20000;
        if (node.querySelector?.('time[datetime]')) score += 3000;
        if (findDetailActionBar(node)) score += 2500;
        const actionBarCache = new WeakMap();
        if (Array.from(node.querySelectorAll?.(SHARE_SVG_CANDIDATE_SELECTOR) || [])
            .some((svg) => isShareSvg(svg, actionBarCache))) score += 1200;
        if (link && node.contains(link)) score += 1000;
        score += Math.min(mediaCount, 12) * 120;
        score += Math.min(rect.height, 1200);
        score -= Math.abs(rect.top - 80) * 0.5;

        if (rect.height > window.innerHeight * 3) score -= 6000;
        return score;
    }

    function findDetailPostRootByPermalink() {
        const info = getCurrentDetailPostInfo();
        if (!info?.postId) return null;

        const candidates = [];
        Array.from(document.querySelectorAll('a[href*="/post/"]')).forEach((link) => {
            const linkInfo = parsePostInfoFromUrl(link.href);
            if (linkInfo?.postId !== info.postId) return;

            let node = link;
            for (let depth = 0; node && depth < 16; depth += 1) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const score = scoreDetailPostRootCandidate(node, link);
                    if (Number.isFinite(score)) {
                        candidates.push({ node, score });
                    }
                }
                node = node.parentElement;
            }
        });

        return candidates
            .sort((a, b) => b.score - a.score)[0]?.node || null;
    }

    function findDetailPostRoot() {
        if (!isDetailPostPage()) return null;

        const permalinkRoot = findDetailPostRootByPermalink();
        if (permalinkRoot) return permalinkRoot;

        const articleCandidates = Array.from(document.querySelectorAll('article,[role="article"]'))
            .filter((node) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 260 && rect.height > 140 && rect.bottom > 0 && rect.top < window.innerHeight;
            })
            .sort((a, b) => getVisibleRectScore(a) - getVisibleRectScore(b));

        if (articleCandidates[0]) return articleCandidates[0];

        const media = Array.from(document.querySelectorAll('img, video'))
            .filter(isDownloadableHoverMedia)
            .sort((a, b) => getVisibleRectScore(a) - getVisibleRectScore(b))[0];

        return media ? findPostRoot(media) : null;
    }

    function findDetailActionBar(root) {
        if (!root) return null;

        const candidates = Array.from(root.querySelectorAll('div'))
            .map((node) => {
                const rect = node.getBoundingClientRect();
                const controls = Array.from(node.querySelectorAll('button,a,[role="button"]'))
                    .filter((control) => {
                        const controlRect = control.getBoundingClientRect();
                        return controlRect.width >= 20 && controlRect.height >= 20;
                    });

                return { node, rect, controls };
            })
            .filter((item) => item.rect.width > 180 && item.rect.height >= 28 && item.rect.height <= 80 && item.controls.length >= 3)
            .sort((a, b) => b.rect.top - a.rect.top);

        return candidates[0]?.node || null;
    }

    function isInjectedPostToolNode(node) {
        return Boolean(node?.closest?.(
            `.${BUTTON_CLASS},.${POST_TOOL_CLASS},.${COPY_TOOL_CLASS},.${LINK_TOOL_CLASS}`
        ));
    }

    function getShareCompatibilityLabel(svg) {
        const labelledControl = svg?.closest?.(
            '[role="button"][aria-label],button[aria-label],a[aria-label],[tabindex="0"][aria-label]'
        );
        return svg?.getAttribute?.('aria-label') ||
            svg?.querySelector?.('title')?.textContent ||
            labelledControl?.getAttribute?.('aria-label') ||
            '';
    }

    function isClickableActionSlot(slot) {
        if (slot?.matches?.('[role="button"],button,a,[tabindex="0"]')) return true;
        if (slot?.querySelector?.('[role="button"],button,a,[tabindex="0"]')) return true;
        return window?.getComputedStyle?.(slot)?.cursor === 'pointer';
    }

    function getLocalPostTimeNodes(root) {
        return [
            ...(root?.matches?.('time[datetime]') ? [root] : []),
            ...Array.from(root?.querySelectorAll?.('time[datetime]') || [])
        ].filter((timeNode) => {
            const boundary = timeNode.closest?.(POST_BOUNDARY_SELECTOR);
            return !boundary || boundary === root;
        });
    }

    function findPostIdentityRootForActionBar(actionBar) {
        let node = actionBar?.parentElement;

        for (let depth = 0; node && depth < 16; depth += 1, node = node.parentElement) {
            if (node === document?.body || node === document?.documentElement) return null;

            if (node.matches?.(POST_BOUNDARY_SELECTOR)) {
                const postInfo = findBestPostInfoInNode(node, actionBar, true);
                const localTimeCount = getLocalPostTimeNodes(node).length;
                if (postInfo || localTimeCount === 1) return node;
                if (node.matches?.('article,[role="article"]') || localTimeCount > 1) return null;
                continue;
            }

            const postIds = getPostIdsInNode(node);
            const timeCount = getLocalPostTimeNodes(node).length;
            if (postIds.size === 1 || timeCount === 1) return node;
            if (postIds.size > 1 || timeCount > 1) return null;
        }

        return null;
    }

    function getSvgPathData(svg) {
        return Array.from(svg?.querySelectorAll?.('path') || [])
            .map((path) => String(path.getAttribute?.('d') || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean);
    }

    function isStableThreadsShareGlyph(svg, pathData = getSvgPathData(svg)) {
        const viewBox = String(svg?.getAttribute?.('viewBox') || '').trim().replace(/\s+/g, ' ');
        return viewBox === '0 0 24 24' &&
            pathData.length === 1 &&
            pathData[0].startsWith(THREADS_SHARE_GLYPH_PATH_PREFIX);
    }

    function collectCompactActionIconEntries(actionBar) {
        const actionRect = actionBar?.getBoundingClientRect?.();
        if (
            !actionRect ||
            actionRect.height < 28 ||
            actionRect.height > 80
        ) return [];

        const entriesBySlot = new Map();
        Array.from(actionBar.querySelectorAll?.('svg') || []).forEach((candidate) => {
            if (isInjectedPostToolNode(candidate)) return;
            const slot = findShareIconSlot(candidate, actionBar);
            const rect = slot?.getBoundingClientRect?.();
            if (
                !slot ||
                slot.parentElement !== actionBar ||
                isInjectedPostToolNode(slot) ||
                !isClickableActionSlot(slot) ||
                !isCompactIconRect(rect)
            ) return;

            const entry = entriesBySlot.get(slot);
            if (entry) {
                entry.svgs.push(candidate);
            } else {
                entriesBySlot.set(slot, { slot, rect, svgs: [candidate] });
            }
        });

        const entries = Array.from(entriesBySlot.values());
        if (entries.length < 4 || entries.length > 8) return [];

        const centerYs = entries.map(({ rect }) => rect.top + (rect.height / 2));
        if (Math.max(...centerYs) - Math.min(...centerYs) > 12) return [];

        const horizontalSteps = entries.slice(1).map((entry, index) =>
            entry.rect.left - entries[index].rect.left
        );
        const isForwardRow = horizontalSteps.every((step) => step >= 12);
        const isReverseRow = horizontalSteps.every((step) => step <= -12);
        return isForwardRow || isReverseRow ? entries : [];
    }

    function collectNativeActionIconEntries(actionBar) {
        const actionRect = actionBar?.getBoundingClientRect?.();
        if (!actionRect) return [];
        const postRoot = findPostIdentityRootForActionBar(actionBar);
        if (!postRoot) return [];
        const primaryActionBar = findDetailActionBar(postRoot);
        if (primaryActionBar && primaryActionBar !== actionBar) {
            const primaryRect = primaryActionBar.getBoundingClientRect?.();
            const sameRowWrapper = Boolean(
                primaryRect &&
                (
                    primaryActionBar.contains?.(actionBar) ||
                    actionBar.contains?.(primaryActionBar)
                ) &&
                Math.abs(
                    (primaryRect.top + (primaryRect.height / 2)) -
                    (actionRect.top + (actionRect.height / 2))
                ) <= 12
            );
            if (!sameRowWrapper) return [];
        }

        return collectCompactActionIconEntries(actionBar);
    }

    function actionBarBelongsToDetailPost(actionBar, postId) {
        let node = actionBar?.parentElement;

        for (let depth = 0; node && depth < 16; depth += 1, node = node.parentElement) {
            if (node === document?.body || node === document?.documentElement) return false;
            const postIds = getPostIdsInNode(node);
            if (postIds.size > 1) return false;
            if (postIds.size === 1) return postIds.has(postId);
        }

        return false;
    }

    function isDetailRouteBoundShareSvg(svg) {
        if (typeof location === 'undefined') return false;
        const detailPostInfo = getCurrentDetailPostInfo();
        if (!detailPostInfo?.postId || !isStableThreadsShareGlyph(svg)) return false;

        const slot = findShareIconSlot(svg, document?.body || null);
        const actionBar = slot?.parentElement;
        const entry = collectCompactActionIconEntries(actionBar)
            .find((candidate) => candidate.slot === slot && candidate.svgs.includes(svg));
        if (!entry) return false;

        return actionBarBelongsToDetailPost(actionBar, detailPostInfo.postId);
    }

    function isStructurallyLocatedShareSvg(svg, actionBarCache) {
        if (!svg || isInjectedPostToolNode(svg)) return false;
        const boundary = document?.body || null;
        const slot = findShareIconSlot(svg, boundary);
        const actionBar = slot?.parentElement;
        let entries = actionBar && actionBarCache?.get(actionBar);
        if (!entries) {
            entries = collectNativeActionIconEntries(actionBar);
            if (actionBar) actionBarCache?.set(actionBar, entries);
        }
        const structuralEntry = entries.find((entry) =>
            entry.slot === slot && entry.svgs.includes(svg)
        );
        return Boolean(structuralEntry && isStableThreadsShareGlyph(svg));
    }

    function isShareSvg(svg, actionBarCache) {
        if (!svg || isInjectedPostToolNode(svg)) return false;
        const label = getShareCompatibilityLabel(svg);
        const matchesCompatibilityLabel = /分享|share/i.test(label);
        if (isStructurallyLocatedShareSvg(svg, actionBarCache)) return true;
        if (isDetailRouteBoundShareSvg(svg)) return true;
        return matchesCompatibilityLabel;
    }

    function findShareSvgInControl(control) {
        if (!control) return null;
        if (control.tagName?.toLowerCase?.() === 'svg' && isShareSvg(control)) {
            return control;
        }

        const actionBarCache = new WeakMap();
        return Array.from(control.querySelectorAll?.(SHARE_SVG_CANDIDATE_SELECTOR) || [])
            .find((svg) => isShareSvg(svg, actionBarCache)) || null;
    }

    function findShareSvgFromEvent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const pathSvg = path.find((node) => node?.tagName?.toLowerCase?.() === 'svg' && isShareSvg(node));
        if (pathSvg) return pathSvg;

        const pathControl = path.find((node) =>
            node?.matches?.('[role="button"], button, a, [tabindex="0"]')
        );
        const pathControlSvg = findShareSvgInControl(pathControl);
        if (pathControlSvg) return pathControlSvg;

        const targetControl = event.target?.closest?.(
            'svg[aria-label], [role="button"], button, a, [tabindex="0"]'
        );
        return findShareSvgInControl(targetControl);
    }

    function removeInjectedCleanLinkMenuItems() {
        document.querySelectorAll(`.${CLEAN_LINK_MENU_CLASS}`).forEach((item) => item.remove());
    }

    function clearNativeShareContext(reason = 'cleared') {
        const context = state.pendingShareContext;
        if (state.nativeShareCloseTimer) {
            const clearTimer = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearTimer(state.nativeShareCloseTimer);
            state.nativeShareCloseTimer = 0;
        }
        if (state.cleanLinkMenuTimer) {
            const clearTimer = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearTimer(state.cleanLinkMenuTimer);
            state.cleanLinkMenuTimer = 0;
        }
        if (context?.expiryTimer) {
            const clearTimer = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearTimer(context.expiryTimer);
        }
        if (context?.routeTimer) {
            const clearIntervalFn = typeof window !== 'undefined' ? window.clearInterval : clearInterval;
            clearIntervalFn(context.routeTimer);
        }
        context?.cleanItem?.remove?.();
        state.pendingShareContext = null;
        return reason;
    }

    function getShareContextInvalidReason(context, currentRouteKey = getMediaRouteKey(), now = Date.now()) {
        if (!context?.cleanUrl) return 'missing_context';
        if (context.routeKey !== currentRouteKey) return 'route_change';
        if (now >= context.expiresAt) return 'expired';
        if (context.menuContainer && !context.menuContainer.isConnected) return 'menu_closed';
        if (context.menuContainer && context.nativeItem && (
            !context.nativeItem.isConnected ||
            !context.menuContainer.contains?.(context.nativeItem)
        )) return 'native_item_removed';
        if (context.menuContainer && context.cleanItem && (
            !context.cleanItem.isConnected ||
            context.cleanItem.parentElement !== context.menuItemParent ||
            !context.menuContainer.contains?.(context.cleanItem)
        )) return 'clean_item_removed';
        return '';
    }

    function pruneNativeShareContext() {
        const context = state.pendingShareContext;
        const invalidReason = getShareContextInvalidReason(context);
        if (invalidReason) {
            clearNativeShareContext(invalidReason);
            return false;
        }
        if (context.menuContainer && !isVisibleMenuItem(context.menuContainer)) {
            clearNativeShareContext('menu_hidden');
            return false;
        }
        return true;
    }

    function rememberNativeShareContext(event) {
        if (Date.now() < state.suppressNativeShareContextUntil) return;
        if (!isTrustedUserActivation(event)) return;

        const shareSvg = findShareSvgFromEvent(event);
        if (!shareSvg) return;

        const shareButton = findShareIconSlot(shareSvg, document.body) ||
            findClickableAncestor(shareSvg, document.body);
        if (!shareButton) return;

        const root = findPostBlockRootFromShareButton(shareButton) || findPostRoot(shareButton);
        const postInfo = root
            ? findBestPostInfoInNode(root, shareButton, true)
            : parsePostInfoFromUrl(location.href);
        const cleanUrl = buildCleanThreadsPostUrl(postInfo || parsePostInfoFromUrl(location.href));
        if (!cleanUrl) return;

        const routeKey = getMediaRouteKey();
        const currentContext = state.pendingShareContext;
        if (
            currentContext?.shareButton === shareButton &&
            currentContext.routeKey === routeKey &&
            Date.now() - currentContext.createdAt < 1500
        ) {
            scheduleCleanLinkMenuInjection(0);
            return;
        }

        clearNativeShareContext('replaced');
        removeInjectedCleanLinkMenuItems();
        const createdAt = Date.now();
        const baselineMenuContainers = new Set(
            findNativeCopyLinkMenuItems()
                .map(findNativeShareMenuContainer)
                .filter(Boolean)
        );
        const context = {
            cleanUrl,
            shareButton,
            createdAt,
            expiresAt: createdAt + SHARE_CONTEXT_TIMEOUT_MS,
            routeKey,
            baselineMenuContainers,
            menuContainer: null,
            nativeItem: null,
            cleanItem: null,
            expiryTimer: window.setTimeout(() => {
                if (state.pendingShareContext?.createdAt === createdAt) {
                    clearNativeShareContext('expired');
                }
            }, SHARE_CONTEXT_TIMEOUT_MS),
            routeTimer: 0
        };
        state.pendingShareContext = context;
        context.routeTimer = window.setInterval(() => {
            if (state.pendingShareContext === context && context.routeKey !== getMediaRouteKey()) {
                clearNativeShareContext('route_change');
            }
        }, 200);
        scheduleCleanLinkMenuInjection(0);
    }

    function normalizeMenuItemText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function isNativeCopyLinkActionRect(rect, viewportWidth, viewportHeight) {
        return rect.width > 24 &&
            rect.height > 24 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < viewportHeight &&
            rect.left < viewportWidth;
    }

    function findNativeCopyLinkMenuItems(container = document) {
        return Array.from(container.querySelectorAll(
            '[role="menuitem"], [role="button"], button, [tabindex="0"]'
        ))
            .filter((element) => !element.classList?.contains?.(CLEAN_LINK_MENU_CLASS))
            .filter((element) => {
                const text = normalizeMenuItemText(element.innerText || element.textContent);
                return /^(複製連結|Copy link)$/i.test(text);
            })
            .filter((element) => {
                const rect = element.getBoundingClientRect();
                return isNativeCopyLinkActionRect(
                    rect,
                    window.innerWidth,
                    window.innerHeight
                );
            })
            .sort((a, b) => {
                const aRect = a.getBoundingClientRect();
                const bRect = b.getBoundingClientRect();
                return (aRect.width * aRect.height) - (bRect.width * bRect.height);
            });
    }

    function findNativeCopyLinkMenuItem(container = document) {
        return findNativeCopyLinkMenuItems(container)[0] || null;
    }

    function findNativeShareMenuContainer(nativeItem) {
        if (!nativeItem) return null;
        const container = nativeItem.closest?.('[role="menu"]') ||
            nativeItem.closest?.('[role="dialog"][aria-modal="true"], [aria-modal="true"]');
        const body = typeof document !== 'undefined' ? document.body : null;
        const documentElement = typeof document !== 'undefined' ? document.documentElement : null;
        if (!container || container === body || container === documentElement) return null;
        return container;
    }

    function replaceNativeCopyLinkLabel(menuItem) {
        const textNodes = [];
        const walker = document.createTreeWalker(menuItem, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();

        while (node) {
            textNodes.push(node);
            node = walker.nextNode();
        }

        const labelNode = textNodes.find((textNode) =>
            /^(複製連結|Copy link)$/i.test(normalizeMenuItemText(textNode.nodeValue))
        );

        if (labelNode) {
            labelNode.nodeValue = message('cleanLinkMenuLabel');
        }

        menuItem.setAttribute('aria-label', message('cleanLinkAction'));
        menuItem.title = message('cleanLinkAction');
    }

    function replaceCleanLinkMenuIcon(menuItem) {
        const icon = menuItem.querySelector('svg');
        if (!icon) return;

        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('viewBox', '0 0 512 509.84');
        icon.setAttribute('width', '24');
        icon.setAttribute('height', '24');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('stroke', 'none');
        icon.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        icon.innerHTML = `
            <path fill="currentColor" stroke="none" fill-rule="nonzero" d="${CLEAN_LINK_ICON_PATH}" />
        `;
        icon.querySelectorAll('path').forEach((path) => {
            path.style.setProperty('fill', 'currentColor', 'important');
            path.style.setProperty('stroke', 'none', 'important');
        });
    }

    function isVisibleMenuItem(element) {
        if (!element?.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0;
    }

    function dispatchEscapeKey() {
        const target = document.activeElement instanceof Element
            ? document.activeElement
            : document.body;
        const eventInit = {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }

    function closeNativeShareMenu(context, cleanItem) {
        dispatchEscapeKey();

        window.clearTimeout(state.nativeShareCloseTimer);
        state.nativeShareCloseTimer = window.setTimeout(() => {
            state.nativeShareCloseTimer = 0;
            if (stopped || state.pendingShareContext !== context) return;
            const menuStillVisible = isVisibleMenuItem(cleanItem) ||
                isVisibleMenuItem(findNativeCopyLinkMenuItem(context?.menuContainer));
            const shareButton = context?.shareButton;
            if (menuStillVisible && shareButton?.isConnected) {
                state.suppressNativeShareContextUntil = Date.now() + 500;
                shareButton.click();
            }
            if (state.pendingShareContext === context) {
                clearNativeShareContext('menu_closed');
            }
        }, 120);
    }

    function injectCleanLinkMenuItem() {
        const context = state.pendingShareContext;
        if (!pruneNativeShareContext()) return false;
        if (
            context.cleanItem?.isConnected &&
            context.cleanItem.parentElement === context.menuItemParent &&
            context.menuContainer?.contains?.(context.cleanItem)
        ) return true;

        const candidates = findNativeCopyLinkMenuItems()
            .map((nativeItem) => ({
                nativeItem,
                menuContainer: findNativeShareMenuContainer(nativeItem)
            }))
            .filter(({ menuContainer }) => menuContainer)
            .filter(({ menuContainer }) => !context.baselineMenuContainers.has(menuContainer));
        const { nativeItem, menuContainer } = candidates[0] || {};
        if (!nativeItem) return false;

        const cleanItem = nativeItem.cloneNode(true);
        cleanItem.classList.add(CLEAN_LINK_MENU_CLASS);
        cleanItem.removeAttribute('id');
        cleanItem.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        replaceNativeCopyLinkLabel(cleanItem);
        replaceCleanLinkMenuIcon(cleanItem);

        cleanItem.addEventListener('pointerdown', stopButtonEvent, true);
        cleanItem.addEventListener('mousedown', stopButtonEvent, true);
        cleanItem.addEventListener('click', (event) => {
            blockEvent(event);
            const activationToken = createUserActivationToken(event);
            if (
                !pruneNativeShareContext() ||
                state.pendingShareContext !== context ||
                cleanItem.parentElement !== context.menuItemParent ||
                !context.menuContainer?.contains?.(cleanItem) ||
                !activationToken ||
                !copyText(context.cleanUrl, activationToken)
            ) return;
            toast(message('cleanLinkCopied'));
            closeNativeShareMenu(context, cleanItem);
        }, true);

        context.menuContainer = menuContainer;
        context.menuItemParent = nativeItem.parentElement;
        context.nativeItem = nativeItem;
        context.cleanItem = cleanItem;
        nativeItem.before(cleanItem);
        return true;
    }

    function scheduleCleanLinkMenuInjection(attempt) {
        window.clearTimeout(state.cleanLinkMenuTimer);
        state.cleanLinkMenuTimer = window.setTimeout(() => {
            state.cleanLinkMenuTimer = 0;
            if (injectCleanLinkMenuItem()) return;

            const context = state.pendingShareContext;
            if (context && pruneNativeShareContext() && attempt < 100) {
                scheduleCleanLinkMenuInjection(attempt + 1);
            } else if (context) {
                clearNativeShareContext('injection_timeout');
            }
        }, attempt === 0 ? 0 : 80);
    }

    function handleNativeShareContextLifecycle(event) {
        const context = state.pendingShareContext;
        if (!context) return;
        if (event?.type === 'keydown' && event.key === 'Escape') {
            clearNativeShareContext('escape');
            return;
        }
        if (event?.type !== 'pointerdown' && event?.type !== 'mousedown') return;
        const target = event.target;
        if (context.menuContainer?.contains?.(target) || context.shareButton?.contains?.(target)) return;
        clearNativeShareContext('outside_click');
    }

    function bindNativeShareMenuEvents() {
        listen(document, 'pointerdown', rememberNativeShareContext, true);
        listen(document, 'click', rememberNativeShareContext, true);
        listen(document, 'pointerdown', handleNativeShareContextLifecycle, true);
        listen(document, 'mousedown', handleNativeShareContextLifecycle, true);
        listen(document, 'keydown', handleNativeShareContextLifecycle, true);
    }

    function findClickableAncestor(node, boundary) {
        let current = node;

        for (let depth = 0; current && current !== boundary && depth < 8; depth += 1) {
            if (current.matches?.('[role="button"],button,a,[tabindex="0"]')) {
                return current;
            }

            const style = window?.getComputedStyle?.(current);
            if (style?.cursor === 'pointer') {
                return current;
            }

            current = current.parentElement;
        }

        return node.parentElement;
    }

    function isCompactIconRect(rect) {
        return rect &&
            rect.width >= 18 &&
            rect.height >= 18 &&
            rect.width <= 92 &&
            rect.height <= 58;
    }

    function findShareIconSlot(svg, boundary) {
        let current = svg;
        let best = findClickableAncestor(svg, boundary) || svg.parentElement;

        for (let depth = 0; current && current !== boundary && depth < 8; depth += 1) {
            const parent = current.parentElement;
            if (!parent) break;

            const rect = parent.getBoundingClientRect();
            if (!isCompactIconRect(rect)) break;

            best = parent;
            current = parent;
        }

        return best;
    }

    function detailShareCandidateScore(root, item, rootPriority) {
        const rootRect = root?.getBoundingClientRect?.();
        const rect = item.slot.getBoundingClientRect();
        let score = 0;

        if (rootPriority) {
            score -= 20000;
        }

        if (rootRect && rect.top >= rootRect.top && rect.bottom <= rootRect.bottom + 120) {
            score -= 10000;
        }

        score += rect.top;
        score += Math.abs(rect.left - 360) * 0.15;
        score += Math.max(0, rect.top - window.innerHeight) * 10;
        score += Math.max(0, -rect.top) * 10;

        return score;
    }

    function findDetailShareButton(root) {
        const detailPostInfo = getCurrentDetailPostInfo();
        const searchRoots = [
            { node: root, rootPriority: true },
            { node: document.body, rootPriority: false }
        ].filter((item) => item.node);
        const seen = new Set();
        const seenSlots = new Set();
        const actionBarCache = new WeakMap();
        const candidates = [];

        searchRoots.forEach(({ node: searchRoot, rootPriority }) => {
            Array.from(searchRoot.querySelectorAll(SHARE_SVG_CANDIDATE_SELECTOR))
                .filter((svg) => {
                    if (seen.has(svg)) return false;
                    seen.add(svg);
                    return true;
                })
                .filter((svg) => isShareSvg(svg, actionBarCache))
                .forEach((svg) => {
                    const slot = findShareIconSlot(svg, searchRoot);
                    const rect = slot?.getBoundingClientRect?.();
                    if (!slot || !rect || rect.width < 18 || rect.height < 18) return;
                    if (seenSlots.has(slot)) return;
                    seenSlots.add(slot);
                    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

                    const blockRoot = findPostBlockRootFromShareButton(slot);
                    const blockInfo = blockRoot
                        ? findBestPostInfoInNode(blockRoot, slot, true)
                        : null;
                    const matchesDetailPost = Boolean(
                        detailPostInfo?.postId &&
                        blockInfo?.postId === detailPostInfo.postId
                    );
                    let score = detailShareCandidateScore(root, { slot }, rootPriority);
                    score += matchesDetailPost ? -50000 : 50000;
                    candidates.push({ svg, slot, rect, score });
                });
        });

        const shareSvg = candidates
            .sort((a, b) => a.score - b.score)[0];

        return shareSvg?.slot || null;
    }

    function getPostIdsInNode(node) {
        const ids = new Set();
        const links = [
            ...(node.matches?.('a[href*="/post/"]') ? [node] : []),
            ...Array.from(node.querySelectorAll?.('a[href*="/post/"]') || [])
        ];

        links.forEach((link) => {
            const info = parsePostInfoFromUrl(link.href || link.getAttribute?.('href'));
            if (info?.postId) ids.add(info.postId);
        });

        return ids;
    }

    function isPostBoundaryNode(node) {
        return Boolean(node?.matches?.('article,[role="article"],[data-pressable-container]'));
    }

    function hasPostBoundaryCues(node) {
        return Boolean(
            node?.matches?.('article,[role="article"]') ||
            countShareIconsInNode(node) > 0 ||
            node?.querySelector?.('time[datetime], a[href^="/@"], a[href*="threads.com/@"]')
        );
    }

    function isMediaOwnedByPost(element, root, expectedPostId) {
        if (!element || !root || !expectedPostId || !root.contains?.(element)) return false;
        if (element === root) return true;
        if (isInsideNestedPostBlock(element, root)) return false;

        let node = element.parentElement;
        for (let depth = 0; node && node !== root && depth < MAX_POST_CONTEXT_ANCESTORS; depth += 1) {
            if (isPostBoundaryNode(node)) {
                const postIds = getPostIdsInNode(node);
                if (postIds.size > 1) return false;
                if (postIds.size === 1 && !postIds.has(expectedPostId)) return false;
                if (
                    postIds.size === 0 &&
                    hasPostBoundaryCues(node)
                ) return false;
            }
            node = node.parentElement;
        }

        return node === root;
    }

    function countShareIconsInNode(node) {
        const actionBarCache = new WeakMap();
        const slots = new Set();
        Array.from(node.querySelectorAll?.(SHARE_SVG_CANDIDATE_SELECTOR) || [])
            .filter((svg) => isShareSvg(svg, actionBarCache))
            .forEach((svg) => slots.add(findShareIconSlot(svg, node) || svg));
        return slots.size;
    }

    function findPostBlockRootFromShareButton(shareButton) {
        const article = shareButton.closest?.('article,[role="article"]');
        if (article && countShareIconsInNode(article) === 1) return article;

        let pressableRoot = shareButton.parentElement;
        for (let depth = 0; pressableRoot && depth < 16; depth += 1, pressableRoot = pressableRoot.parentElement) {
            if (!pressableRoot.hasAttribute?.('data-pressable-container')) continue;

            const rect = pressableRoot.getBoundingClientRect();
            const hasPostIdentity = getPostIdsInNode(pressableRoot).size > 0 ||
                Boolean(pressableRoot.querySelector('time[datetime]'));
            if (
                rect.width >= 220 &&
                rect.height >= 48 &&
                rect.width <= Math.min(window.innerWidth, 1100) &&
                countShareIconsInNode(pressableRoot) >= 1 &&
                hasPostIdentity
            ) {
                return pressableRoot;
            }
        }

        let node = shareButton.parentElement;
        let best = null;

        for (let depth = 0; node && depth < 16; depth += 1, node = node.parentElement) {
            if (node === document.body || node === document.documentElement) break;

            const rect = node.getBoundingClientRect();
            if (rect.width < 220 || rect.height < 48 || rect.width > Math.min(window.innerWidth, 1100)) {
                continue;
            }

            const shareCount = countShareIconsInNode(node);
            if (shareCount > 1) break;
            if (shareCount !== 1) continue;

            const postIds = getPostIdsInNode(node);
            const hasPostIdentity = postIds.size === 1 || Boolean(node.querySelector('time[datetime]'));
            if (!hasPostIdentity) continue;

            best = node;
        }

        return best;
    }

    function createLinkToolButton(root, shareButton) {
        const linkButton = document.createElement('button');
        linkButton.type = 'button';
        linkButton.className = LINK_TOOL_CLASS;
        linkButton.title = message('copyCleanLink');
        linkButton.setAttribute('aria-label', message('copyCleanLink'));
        linkButton.innerHTML = `
            <svg aria-hidden="true" viewBox="0 0 512 509.84" preserveAspectRatio="xMidYMid meet">
                <path fill="currentColor" stroke="none" fill-rule="nonzero" d="${CLEAN_LINK_ICON_PATH}"></path>
            </svg>
        `;
        linkButton.addEventListener('click', (event) => {
            blockEvent(event);
            const activationToken = createUserActivationToken(event);
            if (!activationToken) return;
            const context = state.linkContextByButton.get(linkButton);
            copyPostBlockCleanLink(context?.root, context?.shareButton, activationToken);
        }, true);

        state.linkButtonByRoot.set(root, linkButton);
        state.linkButtonByShare.set(shareButton, linkButton);
        state.linkContextByButton.set(linkButton, { root, shareButton });
        state.liveLinkButtons.add(linkButton);
        return linkButton;
    }

    function createCopyToolButton(root, shareButton) {
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = COPY_TOOL_CLASS;
        copyButton.title = message('copyPostText');
        copyButton.setAttribute('aria-label', message('copyPostText'));
        copyButton.innerHTML = `
            <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="3" width="16" height="18" rx="2"></rect>
                <path d="M8 8h8M8 12h8M8 16h8"></path>
            </svg>
        `;
        copyButton.addEventListener('click', (event) => {
            blockEvent(event);
            const activationToken = createUserActivationToken(event);
            if (!activationToken) return;
            const context = state.copyContextByButton.get(copyButton);
            copyPostBlockText(context?.root, context?.actionBar, activationToken);
        }, true);

        state.copyButtonByRoot.set(root, copyButton);
        state.copyButtonByShare.set(shareButton, copyButton);
        state.copyContextByButton.set(copyButton, {
            root,
            shareButton,
            actionBar: shareButton.parentElement
        });
        state.liveCopyButtons.add(copyButton);
        return copyButton;
    }

    function cleanupCopyButtons() {
        state.liveCopyButtons.forEach((button) => button.remove());
        state.liveCopyButtons.clear();
        state.copyButtonByRoot = new WeakMap();
        state.copyButtonByShare = new WeakMap();
        state.copyContextByButton = new WeakMap();
        state.liveLinkButtons.forEach((button) => button.remove());
        state.liveLinkButtons.clear();
        state.linkButtonByRoot = new WeakMap();
        state.linkButtonByShare = new WeakMap();
        state.linkContextByButton = new WeakMap();
    }

    function ensureCopyButtonsForBlocks() {
        if (!document.body) return;

        const activeCopyButtons = new Set();
        const activeLinkButtons = new Set();
        const seenRoots = new Set();
        const seenSlots = new Set();
        const actionBarCache = new WeakMap();

        Array.from(document.querySelectorAll(SHARE_SVG_CANDIDATE_SELECTOR))
            .filter((svg) => isShareSvg(svg, actionBarCache))
            .forEach((svg) => {
                const shareButton = findShareIconSlot(svg, document.body);
                if (!shareButton || seenSlots.has(shareButton)) return;
                seenSlots.add(shareButton);

                const rect = shareButton.getBoundingClientRect();
                if (!isCompactIconRect(rect)) return;

                let copyButton = state.copyButtonByShare.get(shareButton);
                const cachedContext = copyButton && state.copyContextByButton.get(copyButton);
                const root = cachedContext?.root?.isConnected
                    ? cachedContext.root
                    : findPostBlockRootFromShareButton(shareButton);
                if (!root || seenRoots.has(root)) return;
                seenRoots.add(root);

                let linkButton = state.linkButtonByShare.get(shareButton) ||
                    state.linkButtonByRoot.get(root);
                if (!linkButton || !linkButton.isConnected) {
                    linkButton = createLinkToolButton(root, shareButton);
                } else {
                    state.linkButtonByRoot.set(root, linkButton);
                    state.linkButtonByShare.set(shareButton, linkButton);
                    state.linkContextByButton.set(linkButton, { root, shareButton });
                }

                copyButton = copyButton || state.copyButtonByRoot.get(root);
                if (!copyButton || !copyButton.isConnected) {
                    copyButton = createCopyToolButton(root, shareButton);
                } else {
                    state.copyButtonByShare.set(shareButton, copyButton);
                    state.copyContextByButton.set(copyButton, {
                        root,
                        shareButton,
                        actionBar: shareButton.parentElement
                    });
                }

                if (linkButton.previousElementSibling !== shareButton) {
                    shareButton.after(linkButton);
                }
                if (copyButton.previousElementSibling !== linkButton) {
                    linkButton.after(copyButton);
                }
                activeLinkButtons.add(linkButton);
                activeCopyButtons.add(copyButton);
            });

        state.liveCopyButtons.forEach((button) => {
            if (activeCopyButtons.has(button)) return;
            button.remove();
            state.liveCopyButtons.delete(button);
        });
        state.liveLinkButtons.forEach((button) => {
            if (activeLinkButtons.has(button)) return;
            button.remove();
            state.liveLinkButtons.delete(button);
        });
    }

    function ensureDetailFallbackBar(root) {
        if (!root) return null;

        let bar = root.querySelector?.(':scope > .tm-post-media-tool-fallback');
        if (bar) return bar;

        bar = document.createElement('div');
        bar.className = 'tm-post-media-tool-fallback';
        root.appendChild(bar);
        return bar;
    }

    function isPostMediaPickerEnabled() {
        return USER_OPTIONS.enablePostMediaPicker !== false;
    }

    function cleanupDetailButton() {
        if (state.detailButton) {
            const parent = state.detailButton.parentElement;
            state.detailButton.remove();
            if (parent?.classList?.contains('tm-post-media-tool-fallback') && parent.childElementCount === 0) {
                parent.remove();
            }
            state.detailButton = null;
        }

        state.detailRoute = '';
        state.detailUiCache = null;
        state.modalItems = [];

        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.remove();
    }

    function getDetailUiContext(routeKey) {
        const cached = state.detailUiCache;
        if (
            cached?.routeKey === routeKey &&
            cached.root?.isConnected &&
            cached.shareButton?.isConnected &&
            cached.actionBar?.isConnected
        ) {
            return cached;
        }

        const root = findDetailPostRoot();
        const shareButton = findDetailShareButton(root);
        const actionBar = shareButton?.parentElement ||
            findDetailActionBar(root) ||
            ensureDetailFallbackBar(root);
        const context = { routeKey, root, shareButton, actionBar };
        state.detailUiCache = context;
        return context;
    }

    function ensureDetailButton() {
        if (!document.body) return;

        if (!isDetailPostPage()) {
            cleanupDetailButton();
            state.detailRoute = '';
            return;
        }

        const routeKey = getMediaRouteKey();
        if (state.detailRoute && state.detailRoute !== routeKey) {
            cleanupDetailButton();
        }

        const { root, shareButton, actionBar } = getDetailUiContext(routeKey);
        if (!actionBar) return;

        if (isPostMediaPickerEnabled() && !state.detailButton) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = POST_TOOL_CLASS;
            button.title = message('openMediaDownloader');
            button.setAttribute('aria-label', message('openMediaDownloader'));
            button.innerHTML = `
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 4v12M8 12l4 4 4-4M4 20h16" />
                </svg>
            `;
            button.addEventListener('click', (event) => {
                blockEvent(event);
                if (!createUserActivationToken(event)) return;
                openPostMediaModal();
            }, true);
            state.detailButton = button;
        } else if (!isPostMediaPickerEnabled()) {
            cleanupDetailButton();
        }

        const linkButton = state.linkButtonByRoot.get(root) ||
            (shareButton ? state.linkButtonByShare.get(shareButton) : null);
        const copyButton = state.copyButtonByRoot.get(root) ||
            (shareButton ? state.copyButtonByShare.get(shareButton) : null);
        if (shareButton) {
            if (linkButton && linkButton.previousElementSibling !== shareButton) {
                shareButton.after(linkButton);
            }
            const copyAnchor = linkButton || shareButton;
            if (copyButton && copyButton.previousElementSibling !== copyAnchor) {
                copyAnchor.after(copyButton);
            }
            const downloadAnchor = copyButton || linkButton || shareButton;
            if (state.detailButton && state.detailButton.previousElementSibling !== downloadAnchor) {
                downloadAnchor.after(state.detailButton);
            }
        } else {
            if (state.detailButton && state.detailButton.parentElement !== actionBar) {
                actionBar.appendChild(state.detailButton);
            }
        }

        state.detailRoute = routeKey;
    }

    function getModalItemIdentity(item, rectKey) {
        const resolvedKey = getMediaUrlIdentity(item.resolvedUrl);
        if (resolvedKey) return `${item.type}:${resolvedKey}`;

        const previewKey = getMediaUrlIdentity(item.previewUrl);
        if (previewKey) return `${item.type}:${previewKey}`;

        return `${item.type}:rect:${rectKey}`;
    }

    function dedupeModalItems(items) {
        const structuredSlots = [];
        const itemByKey = new Map();

        items.forEach((item) => {
            if (!item.resolvedUrl) return;

            if (Number.isInteger(item.structuredSlotIndex)) {
                structuredSlots.push(item);
                return;
            }

            const rect = item.element?.getBoundingClientRect?.() || { left: item.indexHint || 0, top: item.indexHint || 0, width: 0, height: 0 };
            const rectKey = [
                Math.round(rect.left / 12),
                Math.round(rect.top / 12),
                Math.round(rect.width / 12),
                Math.round(rect.height / 12)
            ].join(':');
            const key = getModalItemIdentity(item, rectKey);
            const existing = itemByKey.get(key);

            if (!existing || (!existing.previewUrl && item.previewUrl)) {
                itemByKey.set(key, item);
            }
        });

        return [...structuredSlots, ...itemByKey.values()].map((item, index) => {
            const { structuredSlotIndex, ...publicItem } = item;
            return { ...publicItem, index: index + 1, selected: false };
        });
    }

    function orderModalItemsFromStructuredMedia(structuredItems, fallbackItems) {
        const orderedStructuredItems = Array.from(structuredItems || []);
        const availableItems = Array.from(fallbackItems || []).filter((item) => item?.resolvedUrl);
        const usedItems = new Set();
        const exactMatches = new Map();

        orderedStructuredItems.forEach((structuredItem, structuredSlotIndex) => {
            const exactMatch = availableItems.find((item) =>
                !usedItems.has(item) &&
                item.type === structuredItem.type &&
                areMediaUrlsEquivalent(item.resolvedUrl, structuredItem?.resolvedUrl)
            );
            if (!exactMatch) return;
            usedItems.add(exactMatch);
            exactMatches.set(structuredSlotIndex, exactMatch);
        });

        const orderedItems = orderedStructuredItems.map((structuredItem, structuredSlotIndex) => {
            const exactMatch = exactMatches.get(structuredSlotIndex);
            if (!exactMatch) return { ...structuredItem, structuredSlotIndex };
            return {
                ...exactMatch,
                ...structuredItem,
                element: exactMatch.element || structuredItem.element,
                previewUrl: exactMatch.previewUrl || structuredItem.previewUrl || '',
                structuredSlotIndex
            };
        });

        return [
            ...orderedItems,
            ...availableItems.filter((item) => !usedItems.has(item))
        ];
    }

    function finalizeModalItems({ rawItems, cachedImageItems, cachedVideoItems, structuredItems = [] }) {
        const fallbackItems = [
            ...rawItems,
            ...cachedImageItems,
            ...cachedVideoItems
        ];
        // Once the API supplied carousel slots, cache entries are alternate URLs for
        // those slots rather than additional media.  Keep DOM-only leftovers as a
        // compatibility fallback, but do not append cache variants after the
        // authoritative structured sequence.
        const items = structuredItems.length > 0
            ? orderModalItemsFromStructuredMedia(structuredItems, rawItems)
            : fallbackItems;
        return dedupeModalItems(items);
    }

    function uniqueElements(elements) {
        const seen = new Set();
        return elements.filter((element) => {
            if (!element || seen.has(element)) return false;
            seen.add(element);
            return true;
        });
    }

    function orderMediaElementsByVisualPosition(elements) {
        return Array.from(elements || [])
            .map((element, originalIndex) => {
                const rect = element?.getBoundingClientRect?.() || {};
                const top = Number(rect.top);
                const left = Number(rect.left);
                return {
                    element,
                    originalIndex,
                    top: Number.isFinite(top) ? top : Infinity,
                    left: Number.isFinite(left) ? left : Infinity
                };
            })
            .sort((a, b) => {
                const aRow = Number.isFinite(a.top) ? Math.round(a.top / 12) : Infinity;
                const bRow = Number.isFinite(b.top) ? Math.round(b.top / 12) : Infinity;
                return (aRow - bRow) ||
                    (a.left - b.left) ||
                    (a.top - b.top) ||
                    (a.originalIndex - b.originalIndex);
            })
            .map(({ element }) => element);
    }

    function findVideoPreviewImage(video, images) {
        if (!video) return null;

        const videoRect = video.getBoundingClientRect();
        const cover = images.find((img) => rectsOverlap(img.getBoundingClientRect(), videoRect));
        return cover ? resolveImageUrl(cover) : null;
    }

    function collectDetailPostImages(root, postId) {
        if (!root) return [];

        const rootImages = Array.from(root.querySelectorAll('img'))
            .filter(isLikelyDetailPostImage)
            .filter((image) => isMediaOwnedByPost(image, root, postId));

        return uniqueElements(rootImages)
            .sort((a, b) => {
                const aRect = a.getBoundingClientRect();
                const bRect = b.getBoundingClientRect();
                return (aRect.top - bRect.top) || (aRect.left - bRect.left);
            });
    }

    function collectVisibleDetailPageMedia(root, postId) {
        if (!root) return [];

        const rootRect = root.getBoundingClientRect();
        const shareButton = findDetailShareButton(root);
        const actionBar = findDetailActionBar(root);
        const actionRect = (shareButton || actionBar)?.getBoundingClientRect?.();
        const bottomLimit = actionRect
            ? Math.min(rootRect.bottom + 16, actionRect.top + 8)
            : rootRect.bottom + 16;
        return Array.from(root.querySelectorAll('img, video'))
            .filter(isDownloadableHoverMedia)
            .filter((element) => isMediaOwnedByPost(element, root, postId))
            .filter((element) => {
                const rect = element.getBoundingClientRect();
                const inMainPostBand = rect.top >= rootRect.top - 24 && rect.top <= bottomLimit;
                return inMainPostBand;
            })
            .sort((a, b) => {
                const aRect = a.getBoundingClientRect();
                const bRect = b.getBoundingClientRect();
                return (aRect.top - bRect.top) || (aRect.left - bRect.left);
            });
    }

    function collectDetailPostMediaItems() {
        const root = findDetailPostRoot();
        if (!root) return [];
        scanInlineScriptsForVideoUrls();

        const pagePostInfo = getCurrentDetailPostInfo();
        const postInfo = pagePostInfo
            ? { ...pagePostInfo, createdAt: findPostTimeInNode(root) }
            : null;
        const postId = normalizePostIdentity(postInfo?.postId);

        const rootRect = root.getBoundingClientRect();
        const isInMainRootBand = (element) => {
            const rect = element.getBoundingClientRect();
            return rect.top >= rootRect.top - 8 && rect.top <= rootRect.bottom + 8;
        };
        const images = collectDetailPostImages(root, postId)
            .filter(isInMainRootBand);
        const videos = Array.from(root.querySelectorAll('video'))
            .filter(isDownloadableHoverMedia)
            .filter((video) => isMediaOwnedByPost(video, root, postId))
            .filter(isInMainRootBand);
        const standaloneVideos = videos.filter((video) => {
            const videoRect = video.getBoundingClientRect();
            return !images.some((img) => rectsOverlap(img.getBoundingClientRect(), videoRect));
        });
        const pageMedia = collectVisibleDetailPageMedia(root, postId);
        const visibleVideoElements = uniqueElements([
            ...videos,
            ...pageMedia.filter((element) => element.tagName === 'VIDEO')
        ]);
        const media = orderMediaElementsByVisualPosition(
            uniqueElements([...images, ...standaloneVideos, ...pageMedia])
                .filter((element) => {
                    if (element.tagName !== 'IMG') return true;

                    const imageRect = element.getBoundingClientRect();
                    return !visibleVideoElements.some((video) => rectsOverlap(imageRect, video.getBoundingClientRect()));
                })
        );

        const rawItems = media.map((element, index) => {
            const isVideo = element.tagName === 'VIDEO' || isVideoTargetElement(element);
            const previewUrl = element.tagName === 'IMG'
                ? resolveImageUrl(element)
                : (element.poster || findVideoPreviewImage(element, images) || '');
            let resolvedUrl = null;

            if (!isVideo && element.tagName === 'IMG') {
                resolvedUrl = previewUrl;
            } else if (element.tagName === 'IMG') {
                const postContext = findPostContext(element);
                resolvedUrl = pickMappedVideoUrlForThumbnail(element, postContext);
            } else {
                resolvedUrl = resolveVideoUrl(element, element);
            }

            return {
                type: isVideo ? 'video' : 'image',
                element,
                previewUrl,
                resolvedUrl,
                postInfo,
                indexHint: index
            };
        });

        const videoPreviewKeys = new Set(
            rawItems
                .filter((item) => item.type === 'video')
                .map((item) => getMediaUrlIdentity(item.previewUrl))
                .filter(Boolean)
        );
        const cachedImageItems = (postId ? (state.imageUrlsByPostId.get(postId) || []) : [])
            .slice()
            .reverse()
            .filter((url) => !videoPreviewKeys.has(getMediaUrlIdentity(url)))
            .map((url, index) => ({
                type: 'image',
                element: root,
                previewUrl: url,
                resolvedUrl: url,
                postInfo,
                indexHint: rawItems.length + index
            }));

        const cachedVideoItems = (postId ? (state.videoUrlsByPostId.get(postId) || []) : [])
            .slice()
            .reverse()
            .map((url, index) => ({
                type: 'video',
                element: root,
                previewUrl: '',
                resolvedUrl: url,
                postInfo,
                indexHint: rawItems.length + cachedImageItems.length + index
            }));

        const structuredItems = (postId ? (state.structuredMediaItemsByPostId.get(postId) || []) : [])
            .map((item, index) => ({
                type: item.type,
                element: root,
                previewUrl: item.type === 'image' ? item.url : '',
                resolvedUrl: item.url,
                postInfo,
                indexHint: index
            }));

        return finalizeModalItems({ rawItems, cachedImageItems, cachedVideoItems, structuredItems });
    }

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
                </div>
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
            downloadAll: modal.querySelector('[data-action=download-all]')
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
        list.innerHTML = '';

        if (state.modalItems.length === 0) {
            list.innerHTML = `<div class="tm-empty">${escapeHtml(message('noMedia'))}</div>`;
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
        if (!isPostMediaPickerEnabled()) {
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
    }

    async function downloadModalItems(downloadAll, activationToken, options = {}) {
        if (!isValidUserActivationToken(activationToken)) return false;
        if (state.batchDownloadInProgress) return false;

        const sourceItems = Array.isArray(options.items) ? options.items : state.modalItems;
        const items = getModalDownloadItems(sourceItems, downloadAll).slice();

        if (items.length === 0) {
            toast(message('nothingSelected'));
            return false;
        }

        state.batchDownloadInProgress = true;
        setBatchDownloadButtonsDisabled(true);
        const downloadFn = options.downloadFn || downloadItem;
        const resolveItem = options.resolveItem || mediaItemFromElementWithRetry;
        const delayFn = options.delayFn || ((delayMs) =>
            new Promise((resolve) => window.setTimeout(resolve, delayMs))
        );

        try {
            toast(message('preparingDownloads', { count: items.length }));

            for (const modalItem of items) {
                if (stopped || !isValidUserActivationToken(activationToken)) return false;
                const resolved = modalItem.resolvedUrl
                    ? {
                        type: modalItem.type,
                        url: modalItem.resolvedUrl,
                        element: modalItem.element,
                        contextElement: modalItem.element,
                        postInfo: modalItem.postInfo
                    }
                    : await resolveItem(modalItem.element);
                if (stopped) return false;
                if (!resolved) {
                    toast(message('mediaLinkNotFound', {
                        type: message(modalItem.type === 'video' ? 'video' : 'photo'),
                        index: modalItem.index
                    }));
                    continue;
                }

                await downloadFn({
                    ...resolved,
                    contextElement: modalItem.element
                }, activationToken, options.downloadOptions || {});
                if (stopped) return false;
                await delayFn(320);
            }
            return true;
        } finally {
            state.batchDownloadInProgress = false;
            setBatchDownloadButtonsDisabled(false);
        }
    }

    function getLayoutRefreshIntervalMs() {
        const value = Number(USER_OPTIONS.layoutRefreshIntervalMs);
        return Number.isFinite(value) ? Math.max(0, value) : 260;
    }

    function getBackgroundScanIntervalMs() {
        const value = Number(USER_OPTIONS.backgroundScanIntervalMs);
        return Number.isFinite(value) ? Math.max(3000, value) : 5000;
    }

    function getMediaRouteKey() {
        return buildMediaRouteKey(location.href);
    }

    function syncMediaRouteScope() {
        const nextScope = transitionMediaRouteScope({
            routeKey: state.mediaRouteKey
        }, getMediaRouteKey());

        state.mediaRouteKey = nextScope.routeKey;
        if (nextScope.changed) {
            state.diagnostics.routeTransitions += 1;
            state.videoUrlsByPostId.clear();
            state.imageUrlsByPostId.clear();
            state.structuredMediaItemsByPostId.clear();
            state.postCounters.clear();
            state.modalItems = [];
            clearNativeShareContext('route_change');
        }
        return nextScope.changed;
    }

    function getScrollRefreshTarget(event) {
        const target = event?.target;
        if (!target || target === document || target === document.body || target === document.documentElement) {
            return document.documentElement;
        }

        return target.nodeType === Node.ELEMENT_NODE ? target : null;
    }

    function shouldIgnoreScrollRefresh(event) {
        if (USER_OPTIONS.ignoreHorizontalOnlyScroll === false || event?.type !== 'scroll') return false;

        const target = getScrollRefreshTarget(event);
        if (!target) return false;

        const left = target === document.documentElement ? window.scrollX : Number(target.scrollLeft) || 0;
        const top = target === document.documentElement ? window.scrollY : Number(target.scrollTop) || 0;
        const previous = state.scrollPositions.get(target);
        state.scrollPositions.set(target, { left, top });
        if (!previous) return false;

        const deltaX = Math.abs(left - previous.left);
        const deltaY = Math.abs(top - previous.top);
        return deltaX > 0 && deltaY < 1;
    }

    function refreshHoverButtonLayout() {
        const hoverTargetIsValid = state.hoverElement &&
            isDownloadableHoverMedia(state.hoverElement) &&
            isPlausibleHoverRect(state.hoverElement.getBoundingClientRect());

        if (!hoverTargetIsValid) {
            hideHoverButton();
            return;
        }

        showHoverButton(state.hoverElement);
    }

    function refreshButtons(options = {}) {
        if (!document.body) return;

        state.diagnostics.fullRefreshes += 1;

        syncMediaRouteScope();
        if (options.scanNetwork !== false) {
            scanInlineScriptsForVideoUrls();
        }
        ensureCopyButtonsForBlocks();
        ensureDetailButton();
        refreshHoverButtonLayout();
        refreshOpenPostMediaModal();
    }

    function scheduleRefresh(options = {}) {
        if (options.scanNetwork !== false) state.pendingScanNetworkRefresh = true;
        if (state.scanTimer) return;

        state.scanTimer = window.setTimeout(() => {
            state.scanTimer = 0;
            const scanNetwork = state.pendingScanNetworkRefresh;
            state.pendingScanNetworkRefresh = false;
            refreshButtons({ scanNetwork });
        }, SCAN_DEBOUNCE_MS);
    }

    function runQueuedLayoutRefresh() {
        if (state.rafRefresh) return;

        state.rafRefresh = window.requestAnimationFrame(() => {
            state.rafRefresh = 0;
            state.lastLayoutRefreshAt = Date.now();
            const fullRefresh = state.pendingLayoutFullRefresh;
            state.pendingLayoutFullRefresh = false;
            if (fullRefresh) {
                refreshButtons({ scanNetwork: false });
            } else {
                refreshHoverButtonLayout();
            }
        });
    }

    function refreshButtonsSoon(event) {
        if (shouldIgnoreScrollRefresh(event)) return;
        if (event?.type === 'resize') {
            state.pendingLayoutFullRefresh = true;
        }

        const interval = getLayoutRefreshIntervalMs();
        const elapsed = Date.now() - state.lastLayoutRefreshAt;

        if (elapsed >= interval) {
            window.clearTimeout(state.layoutRefreshTimer);
            state.layoutRefreshTimer = 0;
            runQueuedLayoutRefresh();
            return;
        }

        if (state.layoutRefreshTimer) return;
        state.layoutRefreshTimer = window.setTimeout(() => {
            state.layoutRefreshTimer = 0;
            runQueuedLayoutRefresh();
        }, interval - elapsed);
    }

    function rememberVideoUrl(url, postId) {
        const validated = validateMediaUrl(url, 'video');
        if (!validated.ok) return;
        const normalized = validated.url;

        syncMediaRouteScope();

        if (postId) {
            const identity = normalizePostIdentity(postId);
            if (!identity) return;
            const current = state.videoUrlsByPostId.get(identity) || [];
            state.videoUrlsByPostId.delete(identity);
            state.videoUrlsByPostId.set(identity, mergeMediaUrlCache(current, normalized, 32));
            trimMapToSize(state.videoUrlsByPostId, 160);
        }
    }

    function rememberImageUrl(url, postId) {
        const validated = validateMediaUrl(url, 'image');
        if (!validated.ok) return;
        const normalized = validated.url;
        if (/profile_pic|s150x150|s320x320|emoji|sprite|static|favicon|avatar/i.test(normalized)) return;
        if (!postId) return;

        const identity = normalizePostIdentity(postId);
        if (!identity) return;
        const current = state.imageUrlsByPostId.get(identity) || [];
        state.imageUrlsByPostId.delete(identity);
        state.imageUrlsByPostId.set(identity, mergeMediaUrlCache(current, normalized, 32));
        trimMapToSize(state.imageUrlsByPostId, 160);
    }

    function trimMapToSize(map, maxSize) {
        while (map.size > maxSize) {
            const oldestKey = map.keys().next().value;
            if (oldestKey === undefined) break;
            map.delete(oldestKey);
        }
    }

    function rememberStructuredMediaOrder(records) {
        const itemsByPostId = new Map();
        let pendingRecordCount = 0;
        Array.from(records || []).some((record) => {
            if (pendingRecordCount >= MAX_STRUCTURED_RECORDS_PER_ROUTE) return true;
            if (!record?.postId || !record?.type || !record?.url) return;
            const postId = normalizePostIdentity(record.postId);
            if (!postId) return;
            if (!itemsByPostId.has(postId)) itemsByPostId.set(postId, []);
            itemsByPostId.get(postId).push({ type: record.type, url: record.url });
            pendingRecordCount += 1;
            return false;
        });

        itemsByPostId.forEach((nextItems, postId) => {
            const currentItems = state.structuredMediaItemsByPostId.get(postId) || [];
            if (nextItems.length >= currentItems.length) {
                state.structuredMediaItemsByPostId.delete(postId);
                state.structuredMediaItemsByPostId.set(postId, nextItems);
                trimMapToSize(state.structuredMediaItemsByPostId, 160);
            }
        });
        let overflow = Array.from(state.structuredMediaItemsByPostId.values())
            .reduce((total, items) => total + items.length, 0) - MAX_STRUCTURED_RECORDS_PER_ROUTE;
        while (overflow > 0 && state.structuredMediaItemsByPostId.size) {
            const oldestPostId = state.structuredMediaItemsByPostId.keys().next().value;
            const oldestItems = state.structuredMediaItemsByPostId.get(oldestPostId) || [];
            if (oldestItems.length <= overflow) {
                overflow -= oldestItems.length;
                state.structuredMediaItemsByPostId.delete(oldestPostId);
            } else {
                state.structuredMediaItemsByPostId.set(oldestPostId, oldestItems.slice(overflow));
                overflow = 0;
            }
        }
    }

    function walkJsonForVideoUrls(value, postCode) {
        const records = collectStructuredMediaUrls(value, postCode);
        rememberStructuredMediaOrder(records);
        records.forEach((record) => {
            if (record.type === 'video') {
                rememberVideoUrl(record.url, record.postId);
            } else {
                rememberImageUrl(record.url, record.postId);
            }
        });
    }

    function parseJsonPayload(text) {
        if (!text || typeof text !== 'string') return null;

        const trimmed = text.trim()
            .replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;/, '')
            .replace(/^\s*while\s*\(\s*1\s*\)\s*;/, '');

        try {
            return JSON.parse(trimmed);
        } catch (error) {
            const firstObject = trimmed.search(/[\[{]/);
            if (firstObject < 0) return null;

            const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
            if (lastBrace <= firstObject) return null;

            try {
                return JSON.parse(trimmed.slice(firstObject, lastBrace + 1));
            } catch (innerError) {
                return null;
            }
        }
    }

    function scanInlineScriptsForVideoUrls() {
        if (isSensitiveThreadsRoute(location.href)) return;
        Array.from(document.scripts || []).forEach((script) => {
            const text = script.textContent || '';
            if (state.scannedScriptContents.get(script) === text) return;

            state.scannedScriptContents.set(script, text);
            if (utf8ByteLength(text) > NETWORK_RESPONSE_MAX_BYTES) return;
            if (!/video_versions|playable_url|video_url|image_versions|\.mp4|\.jpe?g|\.hei[cf]|\.png|\.webp|bytestart|byteend/i.test(text)) return;

            extractVideoUrlsFromText(text, getMediaRouteKey());
        });
    }

    function extractVideoUrlsFromText(text, sourceRouteKey = getMediaRouteKey()) {
        if (!text || typeof text !== 'string') return;

        state.diagnostics.networkPayloadParses += 1;
        const parsedPayload = parseJsonPayload(text);
        if (parsedPayload) {
            walkJsonForVideoUrls(parsedPayload, null);
        }
    }

    function installNetworkHooks(targetWindow) {
        const nativeFetch = targetWindow.fetch;
        let routeGeneration = 0n;
        let installedFetch = null;
        let installedOpen = null;
        let installedSend = null;
        let installedSetRequestHeader = null;
        let installedPushState = null;
        let installedReplaceState = null;
        let nativeOpen = null;
        let nativeSend = null;
        let nativeSetRequestHeader = null;
        const routeListenerDisposers = [];
        const invalidateRouteGeneration = () => {
            routeGeneration += 1n;
        };
        const history = targetWindow.history;
        const installHistoryHook = (methodName) => {
            const nativeMethod = history?.[methodName];
            if (typeof nativeMethod !== 'function') return null;
            const wrappedMethod = function (...args) {
                const result = nativeMethod.apply(this, args);
                invalidateRouteGeneration();
                return result;
            };
            try {
                history[methodName] = wrappedMethod;
                return history[methodName] === wrappedMethod
                    ? { nativeMethod, wrappedMethod }
                    : null;
            } catch {
                return null;
            }
        };
        const listenForRouteChange = (target, type) => {
            if (typeof target?.addEventListener !== 'function') return;
            try {
                target.addEventListener(type, invalidateRouteGeneration);
                routeListenerDisposers.push(() => {
                    try {
                        target.removeEventListener?.(type, invalidateRouteGeneration);
                    } catch { /* Page-owned navigation APIs are untrusted. */ }
                });
            } catch { /* A hostile page hook must not break runtime startup. */ }
        };
        installedPushState = installHistoryHook('pushState');
        installedReplaceState = installHistoryHook('replaceState');
        listenForRouteChange(targetWindow, 'popstate');
        listenForRouteChange(targetWindow, 'hashchange');
        listenForRouteChange(targetWindow.navigation, 'navigate');
        listenForRouteChange(targetWindow.navigation, 'currententrychange');
        const uninstall = () => {
            if (installedFetch && targetWindow.fetch === installedFetch) targetWindow.fetch = nativeFetch;
            routeListenerDisposers.splice(0).forEach((dispose) => dispose());
            if (installedPushState && history?.pushState === installedPushState.wrappedMethod) {
                try { history.pushState = installedPushState.nativeMethod; } catch { /* Best effort. */ }
            }
            if (installedReplaceState && history?.replaceState === installedReplaceState.wrappedMethod) {
                try { history.replaceState = installedReplaceState.nativeMethod; } catch { /* Best effort. */ }
            }
            const prototype = targetWindow.XMLHttpRequest?.prototype;
            if (!prototype) return;
            if (installedOpen && prototype.open === installedOpen) prototype.open = nativeOpen;
            if (installedSend && prototype.send === installedSend) prototype.send = nativeSend;
            if (installedSetRequestHeader && prototype.setRequestHeader === installedSetRequestHeader) {
                prototype.setRequestHeader = nativeSetRequestHeader;
            }
        };
        if (typeof nativeFetch === 'function' && !nativeFetch.__tmTargetWrapped) {
            const wrappedFetch = function (input, init = {}) {
                let captureContext = { allowed: false, reason: 'classification_failed' };
                const sourceRouteGeneration = routeGeneration;
                try {
                    const routeUrl = location.href;
                    const inputIsUrl = typeof input === 'string' || input instanceof URL;
                    const hasUninspectedRequestBody = !inputIsUrl &&
                        init.body === undefined &&
                        input?.body != null;
                    captureContext = hasUninspectedRequestBody
                        ? { allowed: false, reason: 'request_body_uninspected' }
                        : classifyNetworkCaptureRequest({
                            url: inputIsUrl ? input : input?.url,
                            method: init.method || input?.method || 'GET',
                            headers: init.headers || input?.headers,
                            body: init.body,
                            routeUrl
                        });
                    if (captureContext.allowed) {
                        captureContext = { ...captureContext, sourceRouteGeneration };
                    }
                } catch (error) {
                    captureContext = { allowed: false, reason: 'classification_failed' };
                }
                return nativeFetch.apply(this, arguments).then((response) => {
                    if (captureContext.allowed && !stopped) {
                        inspectResponse(response, captureContext, {
                            extractor: extractVideoUrlsFromText,
                            signal: state.lifecycleController.signal,
                            shouldContinue: () => !stopped &&
                                !isSensitiveThreadsRoute(location.href) &&
                                captureContext.sourceRouteGeneration === routeGeneration &&
                                captureContext.sourceRouteKey === getMediaRouteKey()
                        })
                            .catch(() => { });
                    }
                    return response;
                });
            };

            wrappedFetch.__tmTargetWrapped = true;
            targetWindow.fetch = wrappedFetch;
            installedFetch = wrappedFetch;
        }

        const xhrCtor = targetWindow.XMLHttpRequest;
        if (!xhrCtor?.prototype) return uninstall;

        nativeOpen = xhrCtor.prototype.open;
        nativeSend = xhrCtor.prototype.send;

        if (!nativeOpen.__tmTargetWrapped && !nativeSend.__tmTargetWrapped) {
            xhrCtor.prototype.open = function (method, url, ...rest) {
                if (this.__tmTargetLoadHandler) {
                    this.removeEventListener?.('load', this.__tmTargetLoadHandler);
                    this.__tmTargetLoadHandler = null;
                }
                this.__tmTargetFriendlyName = '';
                this.__tmTargetRequest = {
                    method,
                    url,
                    routeUrl: location.href,
                    sourceRouteGeneration: routeGeneration
                };
                return nativeOpen.call(this, method, url, ...rest);
            };

            xhrCtor.prototype.send = function (body) {
                const request = this.__tmTargetRequest || {};
                let captureContext = { allowed: false, reason: 'classification_failed' };
                try {
                    captureContext = classifyNetworkCaptureRequest({
                        ...request,
                        body,
                        headers: {
                            'x-fb-friendly-name': this.__tmTargetFriendlyName || ''
                        }
                    });
                    if (captureContext.allowed) {
                        captureContext = {
                            ...captureContext,
                            sourceRouteGeneration: request.sourceRouteGeneration
                        };
                    }
                } catch (error) {
                    captureContext = { allowed: false, reason: 'classification_failed' };
                }
                if (captureContext.allowed) {
                    const loadHandler = function () {
                        if (this.__tmTargetLoadHandler !== loadHandler) return;
                        this.__tmTargetLoadHandler = null;
                        if (stopped) return;
                        inspectXhrResponse(this, captureContext, {
                            extractor: extractVideoUrlsFromText,
                            signal: state.lifecycleController.signal,
                            shouldContinue: () => !stopped &&
                                !isSensitiveThreadsRoute(location.href) &&
                                captureContext.sourceRouteGeneration === routeGeneration &&
                                captureContext.sourceRouteKey === getMediaRouteKey()
                        })
                            .catch(() => { });
                    };
                    this.__tmTargetLoadHandler = loadHandler;
                    this.addEventListener('load', loadHandler, { once: true });
                }

                return nativeSend.apply(this, arguments);
            };

            nativeSetRequestHeader = xhrCtor.prototype.setRequestHeader;
            if (typeof nativeSetRequestHeader === 'function' && !nativeSetRequestHeader.__tmTargetWrapped) {
                xhrCtor.prototype.setRequestHeader = function (name, value) {
                    if (String(name).toLowerCase() === 'x-fb-friendly-name') {
                        this.__tmTargetFriendlyName = this.__tmTargetFriendlyName
                            ? `${this.__tmTargetFriendlyName},${value}`
                            : value;
                    }
                    return nativeSetRequestHeader.call(this, name, value);
                };
                xhrCtor.prototype.setRequestHeader.__tmTargetWrapped = true;
            }

            xhrCtor.prototype.open.__tmTargetWrapped = true;
            xhrCtor.prototype.send.__tmTargetWrapped = true;
            installedOpen = xhrCtor.prototype.open;
            installedSend = xhrCtor.prototype.send;
            if (nativeSetRequestHeader) installedSetRequestHeader = xhrCtor.prototype.setRequestHeader;
        }
        return uninstall;
    }

    function initObserver() {
        if (!document.body) {
            state.initObserverTimer = window.setTimeout(initObserver, 100);
            return;
        }

        const observer = new window.MutationObserver((mutations) => {
            state.diagnostics.observerCallbacks += 1;
            const requiresRefresh = mutations.some((mutation) => {
                if (mutation.type === 'attributes') return true;

                const changedNodes = [
                    ...Array.from(mutation.addedNodes || []),
                    ...Array.from(mutation.removedNodes || [])
                ];
                return changedNodes.some((node) => {
                    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                    if (!element) return false;
                    return !element.matches?.(
                        `.${POST_TOOL_CLASS}, .${COPY_TOOL_CLASS}, .${LINK_TOOL_CLASS}, .${BUTTON_CLASS}, #${TOAST_ID}, #${MODAL_ID}`
                    );
                });
            });

            if (requiresRefresh) scheduleRefresh();
            if (state.pendingShareContext) {
                if (pruneNativeShareContext() && !state.cleanLinkMenuTimer) {
                    scheduleCleanLinkMenuInjection(0);
                }
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset']
        });
        state.observer = observer;

        ensureHoverButton();
        scanInlineScriptsForVideoUrls();
    }

    function startBackgroundScanInterval() {
        if (state.backgroundScanIntervalId) {
            window.clearInterval(state.backgroundScanIntervalId);
        }

        state.backgroundScanIntervalId = window.setInterval(refreshButtons, getBackgroundScanIntervalMs());
    }

    function initRefreshListeners() {
        bindHoverEvents();
        if (state.uiRefreshIntervalId) {
            window.clearInterval(state.uiRefreshIntervalId);
        }
        state.uiRefreshIntervalId = window.setInterval(
            () => refreshButtons({ scanNetwork: false }),
            5000
        );
        startBackgroundScanInterval();
    }

    const testing = Object.freeze({
            acceptPostContextCandidate,
            activateButton,
            buildModalItemPreviewMarkup,
            buildMediaRouteKey,
            classifyNetworkCaptureRequest,
            cleanPostTextFragment,
            closeNativeShareMenu,
            collectStructuredMediaUrls,
            copyText,
            copyPostBlockCleanLink,
            createUserActivationToken,
            downloadItem,
            downloadModalItems,
            downloadViaBlob,
            ensureCopyButtonsForBlocks,
            ensureDetailButton,
            extractPostBlockText,
            extractVideoUrlsFromText,
            finalizeModalItems,
            findPostContext,
            findBestPostInfoInNode,
            findNativeShareMenuContainer,
            findShareSvgFromEvent,
            getPostBlockTextBoundary,
            getRenderedPostText,
            handlePostMediaModalKeydown,
            isModalControlIntent,
            getMediaUrlIdentity,
            getModalDownloadItems,
            getVideoThumbnailLayout,
            getOwnedDetailPostFallback,
            getPerformanceSnapshot: () => Object.freeze({
                ...state.diagnostics,
                imageRouteCacheEntries: state.imageUrlsByPostId.size,
                videoRouteCacheEntries: state.videoUrlsByPostId.size,
                structuredRouteCacheEntries: state.structuredMediaItemsByPostId.size,
                structuredRouteRecordCount: Array.from(state.structuredMediaItemsByPostId.values())
                    .reduce((total, items) => total + items.length, 0),
                listenerCount: state.listenerDisposers.length,
                startupTimerCount: state.startupTimers.length,
                pendingTimeoutCount: [
                    state.hideTimer,
                    state.cleanLinkMenuTimer,
                    state.nativeShareCloseTimer,
                    state.initObserverTimer,
                    state.scanTimer,
                    state.hoverScanTimer,
                    state.layoutRefreshTimer
                ].filter(Boolean).length,
                animationFrameCount: Number(Boolean(state.hoverMoveRaf)) +
                    Number(Boolean(state.rafRefresh)),
                activeIntervalCount: Number(Boolean(state.backgroundScanIntervalId)) +
                    Number(Boolean(state.uiRefreshIntervalId)),
                observerActive: Boolean(state.observer)
            }),
            getShareContextInvalidReason,
            inspectResponse,
            inspectXhrResponse,
            installNetworkHooks,
            isInspectableResponseMime,
            isInsideNestedPostBlock,
            isMediaOwnedByPost,
            isNativeCopyLinkActionRect,
            isSecurityDownloadError,
            isShareSvg,
            isTrustedUserActivation,
            mergeMediaUrlCache,
            rememberNativeShareContext,
            orderMediaElementsByVisualPosition,
            resolveImageUrl,
            scanInlineScriptsForVideoUrls,
            scheduleRefresh,
            selectPostBoundVideoUrl,
            syncMediaRouteScope,
            transitionMediaRouteScope,
            validateMediaUrl
    });
    async function start() {
        if (started) return false;
        if (stopped) throw new Error('runtime_stopped');
        started = true;
        if (IS_NODE_RUNTIME) return true;

        state.disposeStyles = await platform.installStyles(PLUGIN_CSS);
        if (stopped) {
            state.disposeStyles?.();
            state.disposeStyles = null;
            return false;
        }
        await registerUserOptionMenu();
        if (stopped) {
            state.disposeSettingsUi?.();
            state.disposeSettingsUi = null;
            return false;
        }
        state.uninstallNetworkCapture = captureSource
            ? installNetworkHooks(captureSource)
            : null;
        if (stopped) {
            state.uninstallNetworkCapture?.();
            state.uninstallNetworkCapture = null;
            return false;
        }
        bindGlobalButtonEvents();
        bindNativeShareMenuEvents();
        initObserver();
        initRefreshListeners();
        state.startupTimers.push(window.setTimeout(refreshButtons, 800));
        state.startupTimers.push(window.setTimeout(refreshButtons, 1800));
        state.startupTimers.push(window.setTimeout(refreshButtons, 3600));
        return true;
    }

    async function stop() {
        if (stopped) return false;
        stopped = true;
        state.lifecycleController.abort();
        state.disposeSettingsUi?.();
        state.disposeStyles?.();
        state.uninstallNetworkCapture?.();
        if (!IS_NODE_RUNTIME) {
            clearNativeShareContext('runtime_stop');
            window.clearTimeout(state.hideTimer);
            window.clearTimeout(state.cleanLinkMenuTimer);
            state.hideTimer = 0;
            state.cleanLinkMenuTimer = 0;
            state.listenerDisposers.splice(0).forEach((dispose) => dispose());
            state.observer?.disconnect?.();
            state.observer = null;
            window.clearInterval(state.backgroundScanIntervalId);
            window.clearInterval(state.uiRefreshIntervalId);
            state.backgroundScanIntervalId = 0;
            state.uiRefreshIntervalId = 0;
            window.clearTimeout(state.initObserverTimer);
            state.initObserverTimer = 0;
            state.startupTimers.splice(0).forEach((timerId) => window.clearTimeout(timerId));
            window.clearTimeout(state.scanTimer);
            window.clearTimeout(state.hoverScanTimer);
            window.clearTimeout(state.layoutRefreshTimer);
            state.scanTimer = 0;
            state.pendingScanNetworkRefresh = false;
            state.hoverScanTimer = 0;
            state.layoutRefreshTimer = 0;
            if (state.hoverMoveRaf) window.cancelAnimationFrame(state.hoverMoveRaf);
            if (state.rafRefresh) window.cancelAnimationFrame(state.rafRefresh);
            state.hoverMoveRaf = 0;
            state.rafRefresh = 0;
            state.hoverButton?.remove?.();
            state.hoverButton = null;
            state.hoverElement = null;
            state.pendingHoverPoint = null;
            cleanupDetailButton();
            state.liveButtons.forEach((button) => button.remove?.());
            state.liveButtons.clear();
            state.buttonByElement = new WeakMap();
            state.elementByButton = new WeakMap();
            cleanupCopyButtons();
            document.getElementById(MODAL_ID)?.remove?.();
            document.getElementById(TOAST_ID)?.remove?.();
            document.querySelectorAll(`.${CLEAN_LINK_MENU_CLASS}`).forEach((item) => item.remove());
            document.querySelectorAll('.tm-post-media-tool-fallback').forEach((item) => {
                if (item.childElementCount === 0) item.remove();
            });
        }
        state.postCounters.clear();
        state.scannedScriptContents = new WeakMap();
        state.mediaRouteKey = '';
        state.captureRouteGeneration = '';
        state.modalItems = [];
        state.modalReturnFocus = null;
        state.detailUiCache = null;
        state.batchDownloadInProgress = false;
        state.videoUrlsByPostId.clear();
        state.imageUrlsByPostId.clear();
        state.structuredMediaItemsByPostId.clear();
        return true;
    }

    async function updateOptions(nextOptions) {
        Object.assign(USER_OPTIONS, normalizeOptions(nextOptions));
        if (started && !stopped && !IS_NODE_RUNTIME) applyUserOptions();
        return Object.freeze({ ...USER_OPTIONS });
    }

    function setCaptureRouteGeneration(nextGeneration) {
        if (nextGeneration === '') {
            state.captureRouteGeneration = '';
            return true;
        }
        if (typeof nextGeneration !== 'string' || !/^[a-f0-9]{16,64}$/.test(nextGeneration)) return false;
        state.captureRouteGeneration = nextGeneration;
        return true;
    }

    function ingestCapturedMedia(records, sourceRouteKey, sourceRouteGeneration) {
        if (stopped || !started || IS_NODE_RUNTIME ||
            sourceRouteKey !== getMediaRouteKey() ||
            !state.captureRouteGeneration ||
            sourceRouteGeneration !== state.captureRouteGeneration) {
            return false;
        }
        const accepted = Array.from(records || []).filter((record) => {
            if (!record?.postId || (record.type !== 'image' && record.type !== 'video')) return false;
            return validateMediaUrl(record.url, record.type).ok;
        });
        if (!accepted.length) return false;
        rememberStructuredMediaOrder(accepted);
        accepted.forEach((record) => {
            if (record.type === 'video') rememberVideoUrl(record.url, record.postId);
            else rememberImageUrl(record.url, record.postId);
        });
        scheduleRefresh({ scanNetwork: false });
        return true;
    }

    return Object.freeze({
        start,
        stop,
        updateOptions,
        setCaptureRouteGeneration,
        ingestCapturedMedia,
        testing
    });
}
