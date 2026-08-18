# Threads Plugin executive security and Store-readiness review

## Decision rule

This is the release-owner Go/No-Go ledger for Threads Plugin 5.1.0. A **Go** decision requires all automated gates, every item in `docs/manual-test-checklist.md`, the public privacy-policy URL, current-product Store assets, and the final evidence/sign-off fields to pass against the exact production ZIP. Any unresolved Critical or High finding is an automatic **No-Go**.

Current decision: **LOCAL GO / PUBLICATION NO-GO — automated and owner-reported final-ZIP browser gates pass; Chrome Web Store Dashboard review and explicit upload/submission/publication authorization remain open.**

This file does not authorize commit, push, merge, tag, Release creation, Greasy Fork updates, Chrome Web Store upload, submission, or publication.

## Executive risk summary

| Area | Current evidence | Residual risk / release condition |
| --- | --- | --- |
| Permission blast radius | MV3 manifest declares only `downloads`, `scripting`, `storage`, and four exact Threads origins; verifiers reject broader permissions | PASS — installed production-ZIP permissions owner-confirmed |
| Consent and revocation | Two independent consent gates; sensitive routes fail closed; service worker performs terminal MAIN-world revoke; stale async work is generation-bound and aborted | PASS — disclosure, disable/revoke, same-document lock, reload-to-reenable, and real service-worker restart owner-confirmed |
| MAIN-world threat boundary | Frozen controller, immutable ownership key, transactional hook installation, re-entry rejection, exact GraphQL operation allowlist, 2 MiB response ceiling, bounded concurrent inspection, hostile-page stop regression | Observe real Threads GraphQL behavior and confirm no unexpected operation is accepted |
| Message/download privilege | Same-window bridge validates exact schema, origin, route generation, replay/rate/record/URL limits; service worker revalidates extension sender, top frame, consent, route, media URL/type, and filename | PASS — real download and stale-route checks owner-confirmed |
| User-data handling | No developer backend, analytics, advertising, tracking, or content persistence; raw response bodies remain in MAIN; clipboard/download destinations are disclosed | Public policy is live; Dashboard declarations still require owner review |
| Remote code / supply chain | All runtime JavaScript is packaged; no `eval`, `new Function`, remote script, or `@require`; production extension has no runtime npm dependency; audit reports zero vulnerabilities | Re-run lockfile audit and artifact checks immediately before submission |
| Artifact integrity | Build/source freshness gate, 12-file exact ZIP allowlist, byte equality, safe paths, fixed timestamps, deterministic packaging tests | Install and test the exact checksum recorded in `docs/TEST_MATRIX.md` |
| Store metadata | zh-TW/English copy, permission rationale, data-use mapping, reviewer instructions, required promo asset, and reviewed 1280×800 real-product screenshot | Add public privacy URL, Dashboard account/contact data, and final sign-off |

## Critical and High findings

No unresolved Critical or High issue was found in the 2026-08-13 source and production-candidate review. This conclusion is conditional: it does not convert pending real-browser or external checks into passes.

Previously identified high-risk lifecycle and consent defects were remediated and have deterministic regressions, including stale consent resurrection, startup-after-stop, response processing after revoke/route change, XHR reuse, duplicate operation headers, A→B→A route reuse, hostile-page STOP suppression, partial hook rollback, install-time re-entry, revoke-during-install, and same-document capture reinstallation after terminal revoke.

## Medium and operational risks

- Threads is an unversioned third-party DOM/GraphQL surface. Selector or operation changes can reduce availability; exact allowlists intentionally fail closed.
- Terminal capture revoke permanently locks the current document. Re-enabling advanced capture in an already-open tab requires reload/new document; this must remain prominent in UI, listing, reviewer instructions, and support responses.
- Media downloads necessarily contact the selected Meta/Instagram/CDN host, and files/download history or clipboard content can outlive the extension's in-tab memory.
- Tampermonkey behavior varies by manager/version, especially cross-origin redirects, authenticated media, and download callbacks. The generated v5.1.0 userscript must pass the live regression matrix independently of the Chrome extension.
- Chrome service-worker suspension, real download permissions, and dynamic MAIN registration cannot be proven solely by mocked or in-process tests.
- The first disclosure is rendered inside the Threads page from an isolated-world script. Host-page CSS or DOM interference can hide, reposition, or remove that UI (availability/UI-redressing risk); trusted-click enforcement prevents synthetic acceptance, and the separately disclosed advanced-capture consent remains on the extension-owned options page. Manual validation must confirm the disclosure is visually clear on the current Threads UI.
- A Chrome Web Store review outcome cannot be guaranteed. Listing, Dashboard privacy answers, public policy, and actual behavior must remain mutually consistent.

## Automated security evidence

- `npm.cmd run verify`: dual build; userscript, extension, documentation, unit, contract, security, and generated-output freshness gates all run from one command.
- `npm.cmd run test:e2e`: 33 built-extension lifecycle/security checks.
- `npm.cmd run test:pipeline`: deterministic existing-dist and build-first packaging contracts.
- `npm.cmd audit --audit-level=high` and production-only audit: zero known vulnerabilities.
- `npm.cmd run verify:package`: exact 12-file archive and byte equality with the built extension.
- The authoritative production checksum is recorded in `docs/TEST_MATRIX.md` and `docs/manual-test-checklist.md`.

## Store policy alignment

- Single purpose: user-invoked export of current Threads post media, text, and clean links.
- Minimum permissions: only permissions required for that purpose.
- User data: pre-install listing disclosure, in-product consent, accurate privacy/retention/destination statements, and affirmative Chrome Web Store Limited Use compliance.
- MV3: no remote hosted executable logic; all behavior is reviewable from packaged code.
- Listing: accurate name, description, icon, screenshot, promotional asset, support URL, reviewer instructions, and privacy Dashboard answers must describe the exact submitted build.

## Final Go checklist

- [x] Exact production ZIP installed from a clean extraction and no manifest/service-worker errors.
- [x] Chrome v5.1.0 real Threads matrix, security observations, worker restart, 200% zoom, keyboard and screenshot pass.
- [x] Tampermonkey generated v5.1.0 real Threads matrix and metadata pass.
- [x] No Critical/High finding from the final source, artifact, and live-behavior review.
- [x] Public privacy URL is reachable signed out and matches `PRIVACY.md`.
- [x] One to five current 1280×800 or 640×400 screenshots and the 440×280 promotional tile pass visual review.
- [ ] Developer Dashboard privacy, distribution, contact, reviewer instructions, and declarations match this build.
- [x] All 31 manual items and seven sign-off fields are complete.
- [x] `npm.cmd run verify:docs:release` passes.
- [ ] Owner separately authorizes any commit/push/upload/submission/publication action.

Until every unchecked item above is satisfied, the executive release decision remains **NO-GO**.
