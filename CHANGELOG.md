# Changelog

All notable changes to this project are documented in this file.

## [5.1.0] - 2026-08-13

### Added
- Added deterministic `package:handoff` / `verify:handoff` commands for moving a dual-platform source snapshot, documentation, tests, generated products, Store assets, and production Chrome ZIP without `.git`, `node_modules`, or stale manual extraction directories.

- Added a shared-source build that generates both the Tampermonkey userscript and a Manifest V3 Chrome Extension.
- Added a first-run content-processing disclosure, persistent decline, options-page consent controls, and live revocation across open Threads tabs.
- Added an optional second-consent MAIN-world network resolver using dynamic packaged content-script registration and a bounded validated media-record bridge.
- Added a service worker that revalidates sender, frame, origin, consent, media URL, media type, and filename before starting downloads.
- Added Chrome options, packaged privacy policy, original extension icons, Store permission/listing drafts, deterministic production ZIP tooling, and a manual clean-profile test matrix.
- Added Chrome adapter, consent, registration, bridge, service-worker, sensitive-route, and local-browser E2E coverage.
- Added separate daily and release documentation gates so pending public privacy hosting, manual sign-off, and Store screenshots cannot be mistaken for submission readiness.
- Added a deterministic, original 440×280 Store promotional tile generated from the packaged product icon.
- Added `docs/ARCHITECTURE.md`, `docs/TEST_MATRIX.md`, and `docs/store-listing.md` as traceable architecture, lifecycle, automated-evidence, manual-gate, Store-metadata, and completion-boundary ledgers.
- Added `docs/SECURITY_REVIEW.md` as the executive Critical/High-risk and Chrome Web Store Go/No-Go ledger; pending live-browser and publication gates remain explicit blockers.
- Added a focused `test:e2e` gate that binds the current built content bundle to the local fixture and runs Chrome disclosure, lifecycle, MAIN-stop, and download-boundary contracts.
- Added deterministic performance counters/tests for MutationObserver filtering, full-refresh coalescing, response parse count, route-cache reset, and runtime resource cleanup.
- Added deterministic service-worker disposal/recreation coverage for registration reconciliation and post-restart download handling.

### Changed

- Refocused `README.md` on user-facing features, installation, usage, and privacy, while keeping detailed engineering guidance outside the public README.
- Moved the existing feature runtime under `src/shared` with explicit `start`, `stop`, option update, and captured-media ingestion lifecycle methods.
- Made `package.json` the single product-version source and centralized website/permission allowlists.
- Chrome page processing now remains dormant until consent and does not start on login, account, challenge, direct-message, OAuth, security, privacy, or settings routes.
- Options/disclosure visual design now uses an original near-black and cobalt product identity with dark-mode, keyboard-focus, zoom, and reduced-motion support.
- Route capture now uses a content-issued generation handshake in Chrome and a monotonic generation in the userscript, preventing stale A→B→A fetch/XHR responses from becoming current again.
- Options and release documentation now state that re-enabling advanced capture in an already-open tab requires a reload/new document; the UI no longer claims that a stopped document automatically resynchronizes.

### Fixed

- Fixed the media picker keyboard contract so focus enters the dialog, Tab and Shift+Tab remain trapped, Escape closes it, and focus returns to the opener.
- Fixed clean post links for Threads usernames beginning with an underscore; URL identity is now preserved while filenames remain sanitized independently.
- Fixed hover-download post identity for real detail-page carousel media nested more than twenty DOM ancestors deep without weakening quoted/reply isolation.

### Security

- Sensitive-route detection now repeatedly decodes and canonicalizes path aliases fail-closed, including encoded message routes, before DOM processing, capture, or downloads can proceed.
- Post and bridge identity keys preserve valid edge underscores without filename-sanitizer collisions; nested/multi-ID post boundaries fail closed instead of borrowing quoted or reply media.
- Media-dialog trusted actions are bound to immutable control identities, so hostile page DOM attribute changes cannot turn selection controls into privileged batch downloads.
- Capture synchronization now fails closed on service-worker errors and rechecks consent immediately before MAIN injection, preventing a revoke-during-enable stale injection race.
- Threads permalink parsing now requires an exact HTTPS Threads origin, safe port/credentials, and canonical post path.
- Advanced capture is off by default, separately disclosed, restricted to packaged code and exact Threads hosts, and unregisters/stops on disable or revocation.
- Authoritative service-worker disable/revoke permanently locks the frozen MAIN controller for the current document, so hostile page code or reinjection cannot restart capture before a reload/new document.
- The same-page bridge enforces source, origin, marker, version, exact schema, operation allowlist, current route/generation, replay prevention, 64 KiB payload, 128 records, 8192-character URLs, 80-character post IDs, 256 valid messages per 60 seconds, a 256-entry replay LRU, bounded route caches, and media URL policy. Its listener is installed before injection and the MAIN `READY` handshake avoids an early-message queue.
- Network response inspection has a hard 2 MiB ceiling; configuration can tighten but cannot raise that limit.
- The extension does not request `tabs`, `activeTab`, `webRequest`, `webRequestBlocking`, `cookies`, `nativeMessaging`, `<all_urls>`, or remote code.
- MAIN fetch/XHR/history hook installation is now transactional and rolls back every earlier page mutation if any hostile getter, setter, or non-writable prototype member rejects setup.
- The frozen MAIN controller now rejects re-entrant installation and cleans up when revocation occurs during setup, preventing a page accessor from leaving an untracked capture wrapper after terminal revoke.
- Dependency audit reports zero known vulnerabilities at the Phase 7 checkpoint.

### Compatibility

- Chrome Extension minimum version is Chrome 111. Dynamic MAIN-world content scripts require Chrome 102+, leaving margin within the declared minimum.
- Real clean-profile unpacked installation and signed-in Threads parity checks remain required before publishing.

## [5.0.0] - 2026-08-11

### Added

- Added first-frame video thumbnails with portrait, landscape, and square aspect-ratio handling when Threads does not provide a poster.
- Added structured carousel ordering so offscreen or cache-only media can return to their original post slots.
- Added regression coverage for privileged metadata allowlists, version synchronization, synthetic user events, route and post isolation, MIME limits, download watchdogs, batch locking, carousel ordering, and hover-download filenames.

### Changed

- Restricted media downloads to HTTPS URLs on approved Threads, Instagram, CDN Instagram, and FBCDN hosts with explicit media extensions.
- Limited fetch and XHR response inspection to known Threads operations, non-sensitive routes, inspectable MIME types, and bounded response sizes.
- Made structured carousel slots authoritative while using DOM media only for matching previews and genuine DOM-only fallbacks.
- Changed the blob fallback to anonymous requests and independent progress-aware timeout handling.
- Updated repository verification to read the version from `package.json` and exactly compare `@grant`, `@connect`, and `@match` allowlists.

### Fixed

- Fixed active image and video downloads being aborted by a fixed-duration watchdog while progress was still being reported.
- Fixed blob fallback accepting missing or conflicting media MIME information.
- Fixed permission and security failures falling through to a less restricted download path.
- Fixed media from previous routes, adjacent feed posts, replies, reposts, or quoted posts being selected as another post's fallback.
- Fixed mixed image/video pickers losing videos, misordering carousel items, or showing all video previews as landscape.
- Fixed the first carousel image being appended twice when its structured and cached URLs differed only by `ig_cache_key`.
- Fixed legitimate duplicate carousel slots being collapsed when they intentionally shared the same media URL.
- Fixed post-level representative media being added before the authoritative carousel sequence, which could make the first carousel image appear twice.
- Fixed a later DOM media preview being attached to an earlier cache-only carousel slot.
- Fixed hover downloads on deeply nested feed carousels falling back to `unknown_` filenames.
- Fixed a global click debounce causing the first click on another idle media button to be ignored; per-button busy state now prevents duplicates without swallowing valid downloads.
- Fixed Threads music attachment lyrics being appended to copied post text; text extraction now stops before the music player while preserving the author's caption.

### Security

- Privileged clipboard and download actions now require a trusted, route-bound user activation token.
- Media URL validation rejects extension smuggling, embedded credentials, unexpected ports, and unapproved hosts.
- Network inspection avoids private message, login, account, security, and settings routes and does not send captured content to external services.

### Compatibility

- Valid media URLs without a recognizable path extension remain unsupported and will be rejected before download; this conservative rule avoids treating arbitrary signed endpoints as media.
- Anonymous blob fallback may not download private media that requires authenticated cookies. `GM_download` redirect and credential behavior still depends on the installed userscript manager and should be checked manually before publishing.

## [4.8.2] - 2026-06-24

### Added

- Added Greasy Fork and GitHub publishing metadata: `@license`, `@homepageURL`, and `@supportURL`.
- Added README, changelog, and MIT license for public release.
- Added a static verification script for metadata, permission scope, core feature entry points, and obvious privacy risks.

### Changed

- Renamed the release userscript to `threads-plugin.user.js`.
- Kept `@connect` scoped to Threads, Instagram, CDN Instagram, and FBCDN related domains.

## [4.8.1] - 2026-06-24

### Added

- Added single image download.
- Added single video download.
- Added post media picker modal for batch download and resource selection.
- Added per-post copy text button.
- Added direct clean-link copy button.
- Added clean-link copy item inside the native Threads share menu.

### Fixed

- Fixed quoted-post detection so inner quoted posts do not accidentally use the outer post.
- Fixed duplicate copy icon behavior in quoted posts.
- Improved text extraction for long posts, multi-node text, translations, tags, and carousel counters.

### Changed

- Adjusted button spacing, alignment, and icon styling to better match the Threads UI.
- Reduced background UI healing frequency and limited expensive refresh work during scroll.
- Cached detail-page DOM lookup, URL regex results, image URL lookups, and video URL lookups.
- Scanned inline scripts only once and reduced repeated JSON media traversal.
- Ignored plugin-owned DOM mutations in the MutationObserver.

### Security

- Removed broad `@connect *` permission.
- Verified there is no analytics/tracking code, remote JavaScript loading, `eval`, `new Function`, cookie access, storage access, or `sendBeacon` usage.
