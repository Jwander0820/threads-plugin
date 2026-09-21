# Installed extension regression tests

These cases launch Playwright's bundled Chromium in a disposable persistent
profile and load `dist/chrome-extension` with Chromium's extension loader. They
exercise the packaged content script, service worker, options page,
`chrome.storage`, `chrome.scripting`, and clipboard through real browser APIs.
The suite does not replace `chrome` with a mock or insert the content bundle into
a normal page.

```powershell
npm.cmd ci
npm.cmd run test:browser:install
npm.cmd run test:browser
```

`test:browser` rebuilds the extension first. Browser installation is a one-time
step per Playwright browser revision. An existing Google Chrome or Edge install
is not used because current branded builds do not support these extension
sideloading flags. See the [Playwright extension guide](https://playwright.dev/docs/chrome-extensions).

To repeat the suite against an already-built extension without changing the
installed files, use:

```powershell
npx.cmd playwright test --config tests/browser/playwright.config.mjs
```

This command does not verify that `dist/chrome-extension` matches the current
source; use the regular build and generated-freshness checks when that evidence
is required.

For a visible run, set `$env:PW_HEADED = '1'` before running the command. Every
case uses a fresh profile; it does not connect to personal browser sessions.
Failure screenshots and traces are saved under `artifacts/browser/results/`.
Each run also writes the machine-readable Playwright JSON report to
`artifacts/browser/report.json`, alongside the console list reporter. It records
test outcomes, durations, errors, and attachment references for repeatable
comparison. The report is overwritten on the next run; copy it together with
any referenced failure artifacts before starting a run whose evidence you want
to retain. These generated artifacts are Git-ignored.

The nine cases cover:

- Mixed photo/video carousel ordering, poster deduplication, selection, and focus.
- Below-viewport reply detail media ownership and exact text/link copying without parent content.
- SPA transitions, sensitive-route shutdown, route cache cleanup, and duplicate UI.
- Automatic page language, persisted language overrides, and light/dark icon colors.
- Consent revocation with the modal open, advanced capture unregistration, disabled
  state across SPA/reload, and explicit re-enablement.
- All 16 combinations of the four feature switches, saved through the packaged
  options page, with live button updates, exact text/link copying, and picker access.
- Disabling an open picker while other features remain enabled; saved switches
  survive SPA/reload and the real options reset restores defaults.
- Text-only and unresolved-video routes show an empty picker without media from
  the previous route or entries in the browser download history.
- Repeated dialog opens, close/Escape and focus restoration; downloading an empty
  selection creates no download or result summary and leaves retry disabled.

All Threads document and media requests are fulfilled from synthetic fixtures;
unexpected page requests fail the test. This isolates extension integration from
the live Threads service and accounts. It does **not** establish compatibility
with current logged-in Threads markup, actual video playback, CDN downloads, or
Tampermonkey installation. Keep the separate Node contract tests and the manual
dual-platform release checklist.

The unresolved-video fixture has a poster but no downloadable source. Current
discovery excludes it from the picker, so this case verifies the empty state;
it does not exercise a per-item `not_found` result or successful retry. Those
task outcomes have separate Node behavior tests.

## Optional native-download routing diagnostic

The installed-extension suite's request routing does not currently intercept
native `chrome.downloads.download()` traffic. A page image fulfilled by
`context.route()` does not prove that downloading that image through the
extension will use the same fixture. Do not use the suite's page-request log as
evidence that native downloads stayed offline.

After the browser dependencies and extension have been built, repeat this
capability probe from the repository root:

```powershell
node scripts/diagnostics/native-download-route-probe.mjs
```

The probe opens a fresh disposable Playwright Chromium profile and calls the
actual extension download API against the synthetic reserved `.invalid` domain.
It compares a routed control page with a native download request, and writes
`artifacts/browser/native-download-route-probe.json`; any download files stay in
`artifacts/browser/route-probe-downloads/`. Paths resolve from the script location,
independent of the current working directory. The report is overwritten on rerun.
It does not use a personal browser profile, actual CDN, API mocks, DNS overrides,
or additional security flags.

The observed result was `route-control-ok` for the page, no route/request event
for the download, and Chrome's `interrupted` / `NETWORK_FAILED` with zero bytes.
This optional diagnostic is not one of the nine regression cases and does not
validate the product's media allowlist, batch outcomes, or retry behavior.
