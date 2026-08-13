# Threads Plugin dual-platform architecture

## Scope and source-of-truth rule

Threads Plugin 5.1.0 is built from one repository into two installable products:

- the root `threads-plugin.user.js` for Tampermonkey;
- the Manifest V3 extension under `dist/chrome-extension`, then the deterministic production ZIP under `artifacts`.

Runtime behavior belongs in `src/shared`. Platform adapters supply storage, clipboard, download, styling, settings, and lifecycle services. Generated bundles are outputs, not independent source files; `npm.cmd run verify:generated` rejects stale output.

```text
config/targets.mjs
        │
        ├── src/userscript/metadata.mjs
        └── scripts/build-extension.mjs

src/shared/threads-runtime.js ──┬── src/userscript/entry.js
                               │        └── src/userscript/platform-adapter.js
                               │
                               └── src/chrome/content-entry.js (ISOLATED)
                                        └── src/chrome/platform-adapter.js

src/shared/network-policy.js ───── src/chrome/main-capture-runtime.js (MAIN)
src/shared/capture-bridge.js  ───── MAIN → ISOLATED validated message bridge
src/shared/media-policy.js    ───── src/chrome/download-handler.js (service worker)
```

The shared tree does not call `GM_*` or `chrome.*`. Both entry points import and instantiate the same runtime. `npm.cmd run verify:generated` enforces those imports, rejects platform API leakage into `src/shared`, and requires `build-all.mjs` to invoke both product builders. This boundary prevents the two products from silently developing different media, filename, post-identity, route, or option behavior.

## Shared modules

- `threads-runtime.js` owns post discovery, buttons and menus, media selection, batch work, copy actions, filename construction calls, SPA refresh, native-share integration, capture ingestion, and hot start/stop cleanup.
- `post-model.js` extracts post identity and structured media while keeping quoted, reposted, reply, and surrounding posts separate.
- `media-policy.js` validates supported HTTPS media hosts and types, removes unsafe filename characters, and produces stable filenames.
- `route-media-state.js` scopes captured media to a canonical route, caps each post at 32 URLs and the route map at 160 posts, and provides monotonic generation invalidation for the userscript capture path.
- `network-policy.js` recognizes only explicit Threads GraphQL endpoint and operation allowlists, rejects sensitive routes and ambiguous operation headers, enforces an absolute 2 MiB response ceiling (configuration may only reduce it), validates MIME types, and supports cancellation.
- `capture-bridge.js` creates and validates the small metadata-only MAIN-to-ISOLATED payload, including origin/source checks, route and generation binding, replay IDs, a 64 KiB payload limit, 128-record limit, 8192-character URL limit, 80-character post-ID limit, 256-valid-message/60-second rate limit, replay LRU of 256 IDs, operation, post identity, and media URL validation.
- `consent-state.js` and `options.js` normalize persisted state and make permissive state impossible to obtain from malformed input.

## Userscript runtime

`src/userscript/entry.js` creates the shared runtime with the userscript adapter. The adapter is the only userscript layer that touches Tampermonkey APIs. It supplies `GM_addStyle`, downloads, cross-origin requests, storage, settings menu commands, clipboard access, and `unsafeWindow` access for the legacy same-page capture path.

The build creates a self-contained strict-mode IIFE with metadata generated from `config/targets.mjs`. There is no `@require`. The generated file retains the public raw update/download URLs, four Threads matches, the reviewed grants, and the reviewed media-host connect list.

Disposing the runtime restores wrapped page APIs, removes styles and controls, unregisters settings commands exactly once, aborts or invalidates deferred work, clears timers and route/media state, and prevents late downloads after stop. The userscript increments a monotonic capture generation synchronously on every observed route transition, so even an A→B→A transition invalidates responses that began on the earlier A generation.

## Chrome execution worlds

### ISOLATED content script

`src/chrome/content-entry.js` is the owner of consent, disclosure, shared runtime startup, route reconciliation, and bridge validation. It starts at `document_start`, but page processing remains dormant until disclosure consent is accepted. Login, account, challenge, messages, OAuth, privacy, security, and settings routes are fail-closed.

Consent and route changes pass through a latest-value lifecycle queue. A revoke or sensitive navigation also performs an immediate local stop before queued asynchronous work completes. Starting a runtime rechecks the latest consent, route, URL, and disposed state around asynchronous boundaries so an obsolete start cannot win after a stop.

The bridge listener is installed before the content script asks the service worker to inject or reconcile MAIN capture, so no separate unbounded early-message queue is needed. The content script issues a fresh route-generation token and answers the MAIN script's bounded `READY` handshake; bridge records must carry the current token as well as the current canonical route.

### MAIN capture script

`src/chrome/main-world-capture.js` installs `main-capture-runtime.js` only after the separately confirmed network-capture option is active. It wraps page `fetch` and XHR only for that opt-in period. Classification happens before response inspection; only known feed/post operations and endpoints are eligible.

Inspection works on a clone or XHR response and is bounded by size and MIME checks. The response ceiling is always 2 MiB even when a caller supplies a larger option; options may only tighten the limit. Stop, revoke, route change, or generation invalidation aborts pending reads and prevents parsing or posting late records. XHR reuse replaces old listeners, duplicate operation headers become conflicts, and repeated script injection retains a single STOP listener.

The controller is stored behind a non-configurable, non-writable window property. An authoritative disable/revoke invokes its terminal revoke path from the extension service worker in MAIN world: it restores fetch/XHR, aborts pending inspection, removes listeners, and permanently locks that controller for the current document. Page code, a swallowed same-page STOP signal, or repeated packaged injection cannot reactivate it. Re-enabling advanced capture in that tab requires a reload or new document.
Hook installation is transactional: fetch, XHR, history, and navigation hooks either become active as one owned installation or every earlier mutation is rolled back. The frozen controller also rejects re-entrant installation attempts and stops a partially constructed installation if revocation occurs during setup, so hostile page accessors cannot leave an untracked wrapper behind.


MAIN invalidates its active generation synchronously when history/navigation changes and requests a new token through `READY`. Because a request retains the generation present at classification, an A→B→A transition cannot make a response from the first A current again. The content-issued token also keeps MAIN and ISOLATED aligned when capture is injected into an already-running page.

The MAIN script posts only sanitized media records and protocol metadata to the same window. Raw GraphQL response bodies never cross the bridge.

### Extension service worker

`src/chrome/service-worker.js` reconciles the opt-in dynamic MAIN registration on install, startup, storage changes, and explicit content-script synchronization. Registration is compared against a canonical descriptor and repaired when any match, file, execution world, timing, frame, or persistence field drifts. On authoritative disable/revoke, it executes the terminal MAIN revoke in the sender tab before unregistering future capture.

Download messages are accepted only from this extension, a non-negative tab ID, the top frame, a supported non-sensitive Threads URL, and an accepted consent state. Media URL, host, type, and filename are revalidated before `chrome.downloads.download` runs. A restarted worker reconstructs all required state from packaged code plus `chrome.storage.local`; no in-memory worker state is authoritative. A deterministic integration test exercises worker disposal/recreation and verifies capture-registration reconciliation and subsequent download handling; real Chrome service-worker termination/restart remains a separate manual gate.

## Consent and data lifecycle

There are two independent gates:

1. Page-content consent permits DOM processing and user-invoked copy/download controls.
2. Advanced network capture is off by default and requires a second confirmation.

Declining records an answered-but-disabled state, so the disclosure does not loop. Revoking clears both permissions. On stop, plugin DOM, styles, observers, event listeners, menu registrations, timers, pending operations, replay IDs, post contexts, media maps, and route state are removed or invalidated. Sensitive navigation stops page processing and capture before the normal reconciliation queue.

Persistent extension storage contains only normalized options and consent. Parsed post/media records stay in tab memory; clipboard and downloaded-file retention are controlled by the operating system and Chrome, as disclosed in `PRIVACY.md`.

## Build, test, and release flow

`npm.cmd run build` generates both products and the deterministic Store promotional tile. `npm.cmd run verify` rebuilds and then checks userscript metadata/runtime bootstrap, MV3 structure and policies, documentation, tests, and source-to-output freshness. `npm.cmd run package:extension` rebuilds the extension and writes a sorted, fixed-timestamp ZIP plus SHA-256 file. `npm.cmd run verify:package` rejects unsafe, duplicate, missing, extra, empty, or byte-stale ZIP entries.

Store release gates are intentionally distinct from normal development verification. `npm.cmd run verify:docs:release` also requires a public privacy URL, valid real-product screenshots, all 30 manual checks, and all seven sign-off fields. An unchecked human gate must remain visible and cannot be converted into an automated pass.

The authoritative evidence ledger is `docs/TEST_MATRIX.md`; the step-by-step real-browser form is `docs/manual-test-checklist.md`; `docs/store-listing.md` is the maintained Store metadata source of truth.

## Security and maintenance invariants

- Permissions, Threads matches, userscript grants, and connect hosts are explicit allowlists.
- No runtime remote code, `eval`, telemetry, developer backend, credential access, or private-message processing is permitted.
- DOM discovery is scoped to the relevant post; structured records are scoped by both post identity and route.
- Capture is opt-in, operation-allowlisted, bounded by fixed response/bridge/schema/cache/rate limits, cancellable, same-origin bridged, replay-resistant, generation-bound, and immediately stoppable.
- Download authority is rechecked in the service worker; content-page input is never trusted by itself.
- Every async lifecycle boundary must recheck stop/consent/route generation before creating UI, parsing data, or writing a file.
- Generated artifacts must match source, and the production archive must match the freshly built extension byte for byte.
- Commit, push, merge, tag, Release creation, Greasy Fork update, and Chrome Web Store upload or publication remain owner-authorized actions outside the build pipeline.
