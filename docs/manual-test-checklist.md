# Manual browser test checklist

Automated local Chrome fixture validation completed on 2026-08-12 with Chrome 151.0.7922.108. The 2026-08-13 automated checkpoint passed 146 Node tests plus the userscript, extension, documentation, generated-output, packaging, and dependency-audit gates. These results describe the checkpoint implementation; final visual assets and the exact release ZIP must be regenerated and signed off before submission:

- fresh install disclosure visible while shared runtime remains dormant;
- accepting starts the packaged shared runtime;
- declining persists a dormant state without repeated prompts;
- options page loads with default values;
- page-content consent enables controls;
- advanced capture stays off until a second dialog is confirmed;
- confirmation enables advanced capture and instructs already-open Threads tabs to reload;
- no page console errors in the tested options flow.
- latest-build fixture confirmed accepted page-content runtime start, immediate stop at `/messages/`, restart on return to a safe route, and no page-console errors;
- a dedicated disclosure regression proves synthetic clicks are ignored while trusted clicks settle consent.

Browser-control policy prevented automation of `chrome://extensions`, so the following real unpacked-extension and signed-in Threads checks must be performed manually before the Goal can be marked complete.
Before release, run `npm.cmd run package:extension` and `npm.cmd run verify:package`, record the resulting checksum, and extract that exact ZIP into a new empty local directory. Do not reuse an earlier `manual-test-unpacked-*` directory.

On 2026-08-13, the signed-in Threads tab still exposed an older same-version userscript build: its media dialog lacked the final `aria-labelledby` binding and left focus on the opener. Tampermonkey v5.1.0 must therefore be overwritten from the current root `threads-plugin.user.js` before Section E can pass; the displayed version number alone is not sufficient evidence.


The automated restart integration reconstructs a fresh worker instance, reconciles dynamic capture registration, and completes a validated download afterward. It does not replace the unchecked real-Chrome step below, which must terminate and restart the installed extension's actual service worker.
### 2026-08-13 recorded checkpoint evidence

- PASS (historical owner report) — the owner loaded the then-current checkpoint with Tampermonkey disabled and reported the tested Chrome Extension behavior as OK. This does not replace final release sign-off.
- PASS — Tampermonkey was disabled while testing the Chrome Extension, preventing duplicate injection.
- PASS — the tested Chrome Extension exposed one media control for the target detail post and one copy-control set per visible post.
- PASS — the media dialog had `aria-modal`, `aria-labelledby`, focus entered Close, Escape hid the dialog, and focus returned to the opener.
- PASS — the target carousel contained five video slots in visible order.
- PASS — a real Chrome `downloads` request created `hot.elhunter_20260812-100350Z_Db758PICOVn_video_01 (1).mp4` (744,172 bytes); the filename retained author, UTC timestamp, post ID, type, and sequence, and the file began with a valid ISO-BMFF `ftyp` header. SHA-256: `DC9F8295A4BCDE8F762B8AE3EDE0D3921CE5634235DD58C15F440EC11BE85101`.
- PASS (owner observation) — the direct clean-link action placed the expected clean post URL on the system clipboard. The browser-control clipboard is isolated and is not used as contrary evidence.
- PASS — `/messages/` contained no media, clean-link, text-copy, or disclosure UI; returning to the supported post restored controls.
- PASS — no page-console error was recorded during the tested picker, download, sensitive-route, and return flow.

## A. Clean-profile install
- PROVISIONAL — `docs/store-assets/screenshot-01.png` is retained only as current workflow/layout evidence; capture a new final screenshot after icon and Store visual design are approved.

- [ ] Create a new Chrome profile with no Tampermonkey and no other Threads extensions.
- [ ] Record the freshly verified production ZIP SHA-256, then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select only the new empty-directory extraction of that exact ZIP.
- [ ] Confirm Chrome reports no manifest or service-worker error; from service-worker DevTools stop the worker, reopen Threads/options, perform one download, and confirm the worker restarts, consent persists, dynamic capture registration reconciles, and no error appears.
- [ ] Confirm the extension icon and options page render at normal and 200% zoom.
- [ ] Confirm manifest permissions shown by Chrome are limited to downloads, storage, scripting, and the four Threads origins.

## B. Disclosure and revocation

- [ ] With storage cleared, open `https://www.threads.com/`; confirm only the disclosure appears and no Threads Plugin media/copy controls exist behind it.
- [ ] Choose **暫不啟用**; reload and confirm no disclosure and no plugin controls.
- [ ] Open extension options, choose **同意並啟用**; return to the already-open Threads tab and confirm controls appear without a reload.
- [ ] Enable advanced capture; confirm the second disclosure appears before the toggle becomes enabled.
- [ ] Disable advanced capture; confirm the option is off, service-worker DevTools shows no registered `threads-plugin-main-capture-v1` script, and the already-open document's fetch/XHR wrappers are immediately restored.
- [ ] Without reloading that same document, enable advanced capture again; confirm options instructs a reload and the stopped controller does not restart or produce `MEDIA_RECORDS`. Reload the tab (or open a new document), confirm capture can start only there, then choose **撤銷同意**; confirm controls disappear, the dynamic script is unregistered, and the revoked document cannot restart capture.
- [ ] Visit `/login/`, `/messages/`, `/settings/`, and `/accounts/` paths if accessible; confirm no plugin controls or disclosure appear.

## C. Functional parity matrix

Repeat on home feed, following feed, profile, single-post detail, replies where available, and after SPA back/forward navigation.

- [ ] Hover a normal image and download it; verify file exists, opens, and filename contains author, UTC timestamp, post ID, `photo`, and sequence.
- [ ] Hover a normal video and download it; verify file exists, plays, and filename contains `video`.
- [ ] Open a mixed image/video carousel; verify picker order matches visible carousel order and duplicate real slots remain separate.
- [ ] Select a subset in the media picker; verify only selected items download and repeated click while busy does not duplicate downloads.
- [ ] Test a quoted/reposted/reply post; verify media and filename never borrow the surrounding post identity.
- [ ] Copy post text from a long post containing translation/tag/counter UI; verify only intended post text is copied.
- [ ] Copy the direct clean link; verify known tracking parameters are absent and the correct post URL remains.
- [ ] Open the native Threads share menu and use the injected clean-link action; verify it targets the same post, including quoted posts.
- [ ] Navigate between posts without full reload; verify old route media never appears in the new post picker.
- [ ] At 200% zoom and keyboard-only navigation, verify disclosure, options, picker modal, buttons, focus rings, and Escape/close behavior remain usable; return to normal zoom and save at least one accurate 1280×800 or 640×400 Store screenshot as `docs/store-assets/screenshot-01.png`.

## D. Network and security observations

- [ ] With advanced capture off, inspect page globals/network behavior and confirm Threads Plugin does not wrap page fetch/XHR.
- [ ] With advanced capture on, verify only known feed/post GraphQL operations produce `MEDIA_RECORDS`; login/message/settings operations do not.
- [ ] Change routes while a response is in flight; verify stale-route records do not populate the new route.
- [ ] Confirm extension service-worker console and page console have no errors through enable/disable/revoke cycles.
- [ ] Confirm no request is sent to a developer-owned analytics or backend domain.

## E. Userscript regression

- [ ] In a separate profile with Tampermonkey, overwrite/import the generated root `threads-plugin.user.js`; after reload, confirm the media dialog has `aria-labelledby`, focus enters the dialog, Escape closes it, and focus returns to its opener.
- [ ] Repeat the functional parity matrix for image, video, mixed carousel, text copy, direct clean link, native share clean link, SPA navigation, quoted posts, filenames, and 200% zoom.
- [ ] Confirm Tampermonkey lists only the declared `@grant`, `@connect`, and four `@match` entries and no `@require`.

Record Chrome version, OS, test account state, tested URLs/post types, download filenames, failures, and screenshots below. Do not include private post content or credentials in evidence.

## Sign-off

- Tester:
- Date/time (Asia/Taipei):
- Chrome version:
- Tampermonkey version:
- Chrome Extension result:
- Userscript result:
- Known limitations accepted:
