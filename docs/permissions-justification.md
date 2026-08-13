# Chrome Web Store permission justification

## Single purpose

Threads Plugin helps users download media from Threads posts and copy post text or clean post links. Every declared permission directly supports that single purpose.

## `downloads`

Required to save a media URL chosen by the user. The content script cannot call this API directly, so it sends a fixed-schema request to the service worker. The worker revalidates extension ID, top frame, exact Threads sender origin, consent, media type, HTTPS URL, approved host, explicit media extension, and safe filename before calling `chrome.downloads.download()`.

## `storage`

Required to store only:

- user-facing timing and feature options;
- disclosure version and accept/decline state;
- page-content processing state;
- separate advanced network-capture opt-in state.

No post text, media URL, browsing history, cookies, credentials, analytics identifier, or downloaded file content is stored in Chrome storage.

## `scripting`

Required only for the optional advanced media resolver. It dynamically registers and unregisters the packaged `main-world-capture.js` content script with `world: "MAIN"`, and injects that same packaged file into an already-open consented top-frame tab when the user enables the option.

It is never used for remote or user-supplied code. Advanced capture is disabled by default, has a second disclosure, is restricted to the four Threads match patterns, and is unregistered immediately when disabled or consent is revoked.

## Host permissions

The four exact host patterns are:

- `https://www.threads.com/*`
- `https://threads.com/*`
- `https://www.threads.net/*`
- `https://threads.net/*`

They are needed to add the user-facing controls on supported Threads deployments and to limit optional packaged MAIN-world capture to Threads. The extension does not request `<all_urls>`.

Media downloads may resolve to approved Threads, Instagram, CDN Instagram, or FBCDN HTTPS hosts, but those URLs are passed to the `downloads` API after validation; the extension does not declare broad content-script access to those CDN origins.

## Explicitly not requested

The extension does not request `tabs`, `activeTab`, `webRequest`, `webRequestBlocking`, `cookies`, `nativeMessaging`, `history`, `clipboardRead`, `clipboardWrite`, `<all_urls>`, or remote-code permissions.
