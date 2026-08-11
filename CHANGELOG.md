# Changelog

All notable changes to this project are documented in this file.

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
- Fixed a later DOM media preview being attached to an earlier cache-only carousel slot.
- Fixed hover downloads on deeply nested feed carousels falling back to `unknown_` filenames.
- Fixed a global click debounce causing the first click on another idle media button to be ignored; per-button busy state now prevents duplicates without swallowing valid downloads.

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
