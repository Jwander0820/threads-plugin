# Threads Plugin 5.1.0 test matrix

## Release-candidate identity

- Source date: 2026-08-13 (Asia/Taipei)
- Branch: `codex/chrome-extension-dual-runtime`
- Products: generated Tampermonkey userscript and Manifest V3 Chrome Extension
- Production archive: `artifacts/threads-plugin-chrome-5.1.0.zip`
- Automated environment: Windows, Node.js, deterministic local fixture
- Human environment: signed-in Threads access available; owner-reported Chrome Extension and Tampermonkey 5.1.0 functional acceptance completed on 2026-08-14; exact final-ZIP clean-profile verification remains pending

This file distinguishes executable local evidence from checks that require a real installed extension, live Threads account state, or a public URL. Pending rows are release blockers; they are not skipped or treated as passes.

## Automated evidence

| Gate | Command or evidence | Current result |
| --- | --- | --- |
| Clean dependency install | `npm.cmd ci` | PASS — 12 packages audited, zero known vulnerabilities |
| Dual build | `npm.cmd run build` | PASS — userscript, four extension bundles, manifest/static files, icons, and Store promo generated |
| Userscript contract | `npm.cmd run verify:userscript` | PASS — 32 checks, including metadata, allowlists, no `@require`, strict IIFE, and VM bootstrap |
| Extension contract | `npm.cmd run verify:extension` | PASS — 30 MV3, permission, consent, registration, bridge, service-worker, and packaged-file checks |
| Documentation core | `npm.cmd run verify:docs` | PASS — 27 policy, handoff, permission, architecture/test-ledger, icon, and deterministic-promo checks; external gates remain reported |
| Unit/contract/security tests | `node --test --test-isolation=none` | PASS — 146 tests at the final source checkpoint |
| Built-extension contract/lifecycle suite | `npm.cmd run test:e2e` | PASS — 33 focused checks including the current built-bundle fixture contract |
| Deterministic packaging pipeline | `npm.cmd run test:pipeline` | PASS — existing-dist export and default build-first packaging contracts |
| Generated freshness | `npm.cmd run verify:generated` | PASS — root userscript, manifest, content, MAIN, service worker, and options outputs match source |
| Dependency audit | `npm.cmd audit --audit-level=high` | PASS — zero vulnerabilities |
| Production package | `npm.cmd run package:extension` then `npm.cmd run verify:package` | PASS — exact 12-file allowlist, root manifest, safe paths, non-empty entries, and byte equality with build |
| Reproducibility | package and verify repeated from the same source | PASS — identical SHA-256 `6aa25a6fe45abfa136e8d781abec49b51db61d01e8ae195fdbc7179267482085` |
| Portable project handoff | `npm.cmd run package:handoff` then `npm.cmd run verify:handoff` | PASS — per-file SHA-256 manifest, prohibited paths excluded, deterministic packaging, and clean-directory build/freshness verification |
| Diff hygiene | `git diff --check` | PASS |

The Node suite covers the shared media/post/route/options runtime, userscript adapter and generated bootstrap, Chrome consent/disclosure, lifecycle coalescing and failure recovery, capture registration repair, authoritative terminal MAIN revocation and per-document restart lock, MAIN fetch/XHR cancellation and reuse, bridge validation and replay rejection, service-worker restart reconstruction and download validation, sensitive routes, A→B→A late-response rejection, DOM cleanup, deterministic packaging, and build/verifier contracts. The in-process command shown above is used in this sandbox because child-process spawning is unavailable; it executes the same Node test files.

The deterministic performance probe records two MutationObserver callbacks, suppresses the plugin-owned mutation without a full refresh, coalesces one page mutation into one full refresh, parses one eligible response exactly once, clears the one-entry route cache on transition, and reports zero listeners, startup timers, active intervals, or observer after stop. These counters are exposed only through the runtime test surface and do not add telemetry.

## Security invariant evidence (S1–S18)

| Invariant | Evidence | Status |
| --- | --- | --- |
| S1 — No dynamic code | userscript/extension verifiers reject `eval` and `new Function`; source scan | PASS |
| S2 — No remote hosted executable code | manifest/CSP/import checks and exact ZIP file allowlist | PASS |
| S3 — No broad host permission | manifest exact-host test rejects `<all_urls>` | PASS |
| S4 — Minimum permissions | manifest exact permission allowlist is `downloads`, `scripting`, `storage` | PASS |
| S5 — No cookie access | forbidden-permission and source checks; sensitive/private routes dormant | PASS |
| S6 — No tracking | verifier/source/manifest inspection; live network observation remains in the manual matrix | PASS automated / PENDING_MANUAL observation |
| S7 — Bounded network inspection | endpoint, exactly-one-operation, route, MIME, conflict, and allowlist tests | PASS |
| S8 — Response limit | `NETWORK_RESPONSE_MAX_BYTES` is an absolute 2 MiB ceiling; caller options can only reduce it; declared-size, stream, fetch, and XHR override tests | PASS |
| S9 — Media URL policy | HTTPS/host/default-port/no-credentials/extension/type adversarial tests | PASS |
| S10 — Trusted activation | synthetic click rejection plus route-bound activation/download tests | PASS |
| S11 — MAIN is untrusted | MAIN imports no Chrome adapter; bridge accepts normalized records only | PASS |
| S12 — Service Worker revalidation | sender/tab/frame/route/consent/schema/URL/type/filename negative tests | PASS |
| S13 — No content persistence | adapter/storage tests and privacy/source inspection limit storage to options/consent | PASS |
| S14 — Consent before processing | bootstrap/disclosure/content lifecycle tests and local fixture | PASS automated / PENDING_MANUAL real install |
| S15 — Bounded bridge | 64 KiB payload, 128 records, 8192-character URL, 80-character post ID, 256 valid messages/60 s, replay LRU 256, listener-before-injection/READY handshake, and route caches bounded to 32 URLs/post and 160 posts | PASS |
| S16 — Route isolation | content-issued Chrome generation handshake plus synchronous MAIN invalidation, and userscript monotonic route generation; A→B→A fetch/XHR regressions | PASS |
| S17 — Service Worker restart safety | deterministic worker restart/reconstruction integration and focused contracts | PASS automated / PENDING_MANUAL real Chrome termination/restart |
| S18 — Generated/package artifact integrity | source-to-userscript, manifest, and four-bundle freshness gate plus deterministic existing-dist packaging pipeline tests | PASS |

## Local browser fixture evidence

The packaged `content.js` was loaded by the local fixture with a mocked extension API in Chrome 151.0.7922.108. This is useful integration evidence but is not represented as a real MV3 installation.

- PASS: first-run disclosure rendered while the runtime stayed dormant.
- PASS: accepted consent started the packaged shared runtime and injected one product control.
- PASS: navigation to `/messages/` removed style and controls within the fixture observation window.
- PASS: returning to a supported route restarted the page-content runtime without a page reload; this does not bypass a terminally revoked MAIN capture controller.
- PASS: options default, page-content consent, second network disclosure, confirmation, and disable/revoke flows were exercised without page-console errors; options tells already-open tabs to reload after enabling advanced capture.
- PASS: a dedicated browser-like regression rejects synthetic disclosure clicks and accepts trusted clicks.

The browser-control surface cannot automate `chrome://extensions` and did not yield a trusted click in the fixture. Those limitations are stated directly; neither observation is used to satisfy clean-profile installation, real service-worker, or signed-in Threads gates.

## Cross-platform functional matrix

| Behavior | Shared/automated evidence | Real Chrome MV3 | Tampermonkey |
| --- | --- | --- | --- |
| Image and video download | PASS | PASS — owner reported | PASS — owner reported |
| Mixed carousel order, real duplicate slots, subset batch | PASS | PASS — owner reported | PASS — owner reported |
| Busy-state duplicate suppression and late-stop safety | PASS | PASS — owner reported | PASS — owner reported |
| Quoted, reposted, and reply identity isolation | PASS | PASS — owner reported | PASS — owner reported |
| Post-text copy | PASS | PASS — owner reported | PASS — owner reported |
| Direct clean-link copy and tracking removal | PASS | PASS — owner reported | PASS — owner reported |
| Native-share clean-link action | PASS | PASS — owner reported | PASS — owner reported |
| SPA route isolation and stale record rejection | PASS | PASS — owner reported | PASS — owner reported |
| Filename author/time/post/type/sequence fields | PASS | PASS — owner reported | PASS — owner reported |
| 200% zoom, keyboard, focus, Escape/close | static/fixture evidence | PASS — owner reported | PASS — owner reported |

## Chrome privacy and lifecycle matrix

| Invariant | Automated evidence | Real-browser status |
| --- | --- | --- |
| Before first consent, runtime and advanced capture are dormant | consent/bootstrap/disclosure tests and fixture | PASS — owner reported |
| Decline persists without repeated disclosure | consent/disclosure tests and fixture | PASS — owner reported |
| Existing tab reacts to page-content accept; advanced disable/revoke stops and permanently locks that document's MAIN controller | lifecycle queue, service-worker, and MAIN integration tests | PASS — owner reported |
| Network capture requires independent second confirmation | options dialog tests and fixture | PASS — owner reported |
| Dynamic MAIN registration is exact, repaired, and removed on revoke; same-document re-enable remains locked until reload/new document | capture-registration, service-worker, and MAIN runtime tests | PASS — owner reported |
| Login/messages/settings/account routes fail closed | route, content, MAIN, and download tests; fixture `/messages/` | PASS — owner reported |
| In-flight response work cannot parse or post after stop/route change | abort, content-issued/monotonic generation, A→B→A fetch, and XHR tests | PASS — owner reported |
| Download message requires valid extension/top-frame/tab/route/consent/media/filename | download-handler adversarial tests | PASS — owner reported |
| Service-worker restart reconstructs registration and download behavior | deterministic restart/reconstruction integration passes | PENDING_MANUAL real Chrome termination/restart |
| No developer analytics/backend request | source/manifest allowlist checks | PASS — owner reported network observation |

The owner-reported Chrome result accepts one low-severity lifecycle limitation: an already-open Threads tab can retain an invalidated content-script context after the extension is reloaded or updated. That tab can log `Extension context invalidated` and requires a page reload; this does not indicate content upload, permission escalation, or persistent service-worker failure.

## Store and production matrix

| Item | Status |
| --- | --- |
| Manifest name/version/description/permissions | PASS |
| Privacy policy source and packaged page match implementation | PASS |
| Permission rationale, single purpose, data mapping, reviewer steps, and unaffiliated notice | PASS |
| Final icon and 440×280 promotional tile | PASS — icon uses designer-supplied `ThreadsPlugin_org.svg`; promo uses the separately supplied raster source and deterministically exports at 440×280 |
| One to five screenshots from the final installed product | PENDING_FINAL_ASSET — no screenshot is currently present |
| Public HTTPS privacy-policy URL reachable while signed out | PENDING_EXTERNAL |
| ZIP automated content/freshness/checksum verification | PASS |
| ZIP extracted into an empty directory, inspected, and clean-profile installed | PENDING_MANUAL |
| Functional browser matrix and sign-off | PASS — owner reported on 2026-08-14; exact final-ZIP clean install and Store screenshot remain pending |

`npm.cmd run verify:docs:release` is expected to fail while any pending Store or manual row remains. The detailed one-time completion steps and sign-off form are in `docs/manual-test-checklist.md`.

## Completion boundary

Local implementation, generated products, automated tests, privacy/store drafts, reproducible production packaging, and owner-reported Chrome/Tampermonkey functional acceptance are available as a checkpoint. Release readiness additionally requires the deferred Store screenshot, production-ZIP clean-room install/service-worker sign-off, and a public privacy-policy URL with no unresolved failure.
