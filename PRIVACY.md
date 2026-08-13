# Threads Plugin Privacy Policy

Last updated: 2026-08-13

Threads Plugin provides user-invoked media download, post-text copy, and clean-link copy features for Threads. The extension has no developer-operated backend, analytics, advertising, or tracking. Processing is performed locally in the user's browser, subject to the user controls and necessary destinations described below.

## Data handled

After the user accepts the page-content disclosure, the extension may handle the following information from the currently open supported Threads page:

- post text and other user-generated website content;
- post URLs and the current Threads route;
- public author usernames or identifiers and post identifiers;
- image and video URLs, media types, and DOM information needed to identify the selected post and place controls;
- trusted click, pointer, scroll, and keyboard events needed to position controls and fulfill a user-requested action.

The extension does not read Threads passwords, authentication cookies, payment information, or direct-message content. Its page runtime remains off on login, account, challenge, direct-message, OAuth, security, privacy, and settings routes.

Advanced network-response capture requires a separate opt-in and is disabled by default. When enabled, a packaged MAIN-world script inspects only allowlisted Threads feed/post GraphQL operations on non-sensitive routes. A bounded same-page bridge sends validated post identifiers, media types and URLs, the source route, the allowlisted operation name, and random replay-prevention protocol metadata to the extension's isolated content context. Raw response bodies are not forwarded to the extension service worker, the developer, or an external server.

## How the data is used

The handled data is used only to provide the extension's single purpose: user-requested Threads post media downloads and post text or clean-link copy tools. It is also used locally to preserve media ordering, prevent one post or route from borrowing another post's data, render controls, and enforce consent and security limits.

Threads Plugin does not sell user data, use it for advertising or profiling, use it to determine creditworthiness or lending eligibility, or allow the developer or another human to read it.

## Necessary destinations and sharing

The extension does not send page content or media records to the developer or to an unrelated analytics, advertising, or tracking service.

Two user-requested actions necessarily place data outside the extension's in-tab memory:

- **Download:** Chrome makes an HTTPS request to the selected media's existing approved Threads, Instagram, CDN Instagram, or FBCDN host. That host receives the normal request needed to return the file. Chrome may retain the media URL, filename, and download record, and the downloaded file remains according to the user's Chrome and operating-system settings.
- **Copy:** the selected post text or clean link is written to the operating-system clipboard. It remains there according to the user's operating system or clipboard-manager settings.

No other transfer is performed by the extension. Raw GraphQL response bodies remain in the page context and are not sent through `chrome.runtime` messaging.

## Storage and retention

`chrome.storage.local` stores only normalized feature/timing options and consent state. It does not store post text, media URLs, browsing history, cookies, credentials, analytics identifiers, or downloaded file content.

Parsed post text, links, and media records may remain in the current tab's memory while that tab's consented runtime is active. Route and post identity checks prevent stale records from being accepted for or used as a different route or post. In-memory records are cleared when consent is revoked, the runtime stops (including entry into a sensitive route), or the tab closes; they are never persisted by the extension. Copies and downloads have the separate retention described above.

## User control

The extension remains dormant before consent. Users may decline without repeated prompts, enable processing later from the options page, disable advanced capture independently, or revoke all consent. Revocation stops the runtime in open Threads tabs, removes injected UI, stops the current MAIN-world wrapper, removes the same-page bridge listener, unregisters future MAIN-world capture, and prevents future page processing until consent is granted again.

Disabling advanced capture or revoking all consent also makes the service worker invoke a terminal MAIN-world revoke in each currently open tab: fetch/XHR wrappers are restored and the controller is permanently locked for that document, so page code or reinjection cannot restart capture. If advanced capture is enabled again in the same open tab, the user must reload it or open a new document; ordinary consented DOM tools remain independent of this per-document capture lock.

## Security limits

Download URLs must use HTTPS without embedded credentials or unexpected ports, use approved Threads/Instagram/CDN hosts and media file extensions, and pass validation again in the service worker. Capture is limited by exact operation, route, schema, record-count, payload-size, media-URL, and replay checks. The extension executes only packaged code and does not use remotely hosted JavaScript.

## Chrome Web Store Limited Use

Threads Plugin's use and handling of information received from Chrome extension APIs and supported Threads pages adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/), including the Limited Use requirements. Information is used only to provide or improve the extension's disclosed single purpose, is not transferred except as necessary to provide that purpose or as otherwise permitted by the policy, is not used for personalized advertising, and is not made available for human reading.

## Contact and changes

Contact the maintainer through [GitHub Issues](https://github.com/Jwander0820/threads-plugin/issues). Do not include private post content, credentials, or other sensitive information in a public issue. Material policy changes will update this document's date and the project changelog.
