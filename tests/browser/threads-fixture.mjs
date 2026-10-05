import { ROUNDED_THREADS_SHARE_GLYPH } from '../fixtures/threads-native-share-glyph.mjs';

export const ORIGIN = 'https://www.threads.com';
export const MIXED_PATH = '/@fixture_author/post/MIXED123';
export const REPLY_PATH = '/@reply_author/post/REPLY456';
export const NEXT_PATH = '/@next_author/post/NEXT789';
export const EMPTY_PATH = '/@text_author/post/EMPTY012';
export const UNRESOLVED_PATH = '/@video_author/post/UNRESOLVED345';
export const REPLY_TEXT = 'Reply body only.\n第二行：保留換行與文字。';
export const JAPANESE_PATH = '/@fixture_author/post/JAPANESE123';
export const JAPANESE_TEXT = '日文介面の本文。\n我最喜歡的工作是翻譯\n3/4';
export const MUSIC_PATH = '/@fixture_author/post/MUSIC123';
export const MUSIC_TEXT = '作者寫的主文與歌單。\nPlay music 與歌名也可以是正文。\n我最喜歡的工作是翻譯\n3/4';

const media = (name) => `https://scontent.cdninstagram.com/${name}`;

function actions() {
    return `<div class="native-actions"><button aria-label="Like"><svg aria-label="Like" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg></button><button aria-label="Reply"><svg aria-label="Reply" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></button><button aria-label="Share"><svg aria-label="Share" viewBox="0 0 24 24"><path d="M4 4l16 8-16 8 4-8z"/></svg></button></div>`;
}

function post({ id, path, body, contents, extraClass = '', nativeActions = actions() }) {
    return `<article id="${id}" class="${extraClass}"><header><a href="${path}?xmt=fixture"><time datetime="2026-09-20T08:00:00Z">2026-09-20</time></a></header><p dir="auto">${body}</p>${contents}${nativeActions}</article>`;
}

const japanese = post({
    id: 'japanese-post', path: JAPANESE_PATH, body: JAPANESE_TEXT,
    contents: `<img class="post-media" src="${media('japanese-only.jpg')}" alt="Photo">`,
    // Native labels alone must not be needed to find this four-action row.
    nativeActions: `<div class="native-actions">${['「いいね！」', '返信', '再投稿', 'シェアする'].map((label, index) =>
        `<div><div role="button" tabindex="0" aria-label="${label}"><div><svg viewBox="0 0 24 24"><title>${label}</title><path d="${index === 3 ? ROUNDED_THREADS_SHARE_GLYPH : 'M4 4h16v16H4z'}"/></svg></div></div></div>`
    ).join('')}</div>`
});

const music = `<article id="music-post"><header><a href="${MUSIC_PATH}"><time datetime="2026-10-04T00:00:00Z">2026-10-04</time></a></header>
<div class="music-post-content"><p dir="auto">${MUSIC_TEXT}</p><div class="music-card">
<div role="button" tabindex="0" aria-label="Play music" class="music-control"><span dir="auto">Fixture track title</span><span dir="auto">Fixture artist</span></div>
<div class="music-lyrics"><div class="music-lyrics-inner">${Array.from({ length: 16 }, (_, i) => `<div><span dir="auto">Attachment-only line ${i + 1}</span></div>`).join('')}</div></div>
<video hidden playsinline></video>
</div></div>${actions()}</article>`;

const mixed = post({
    id: 'mixed-post', path: MIXED_PATH,
    body: 'Mixed photo and video carousel.',
    contents: `<div class="carousel"><img src="${media('mixed-first.jpg')}" alt="First photo"><video muted preload="none" poster="${media('mixed-poster.jpg')}" src="${media('mixed-video.mp4')}"></video><img src="${media('mixed-last.jpg')}" alt="Last photo"></div>`
});
const reply = post({
    id: 'parent-post', path: '/@parent_author/post/PARENT000', body: 'Parent text must never be copied with the reply.',
    contents: `<img class="post-media" src="${media('parent-only.jpg')}" alt="Parent photo">`
}) + post({
    id: 'reply-post', path: REPLY_PATH, body: REPLY_TEXT,
    contents: `<img class="post-media" src="${media('reply-only.jpg')}" alt="Reply photo">`
});
const next = post({
    id: 'next-post', path: NEXT_PATH, body: 'Next route text.',
    contents: `<img class="post-media" src="${media('next-only.jpg')}" alt="Next photo">`
});
const empty = post({
    id: 'text-post', path: EMPTY_PATH, body: 'Text-only post: no media should leak from another route.', contents: ''
});
const unresolved = post({
    id: 'unresolved-post', path: UNRESOLVED_PATH, body: 'A native video has a poster but no downloadable source.',
    contents: `<video class="post-media" muted preload="none" poster="${media('unresolved-poster.jpg')}"></video>`
});

// The payload deliberately includes the same URLs as the DOM. Real content code
// must merge them, retain carousel order, and avoid counting a video poster twice.
const mixedPayload = {
    code: 'MIXED123',
    carousel_media: [
        { image_versions2: { candidates: [{ url: media('mixed-first.jpg') }] } },
        { video_versions: [{ url: media('mixed-video.mp4') }], image_versions2: { candidates: [{ url: media('mixed-poster.jpg') }] } },
        { image_versions2: { candidates: [{ url: media('mixed-last.jpg') }] } }
    ]
};

export function fixtureHtml(pathname) {
    const initialMarkup = ({ [MUSIC_PATH]: music, [JAPANESE_PATH]: japanese, [REPLY_PATH]: reply, [NEXT_PATH]: next, [EMPTY_PATH]: empty, [UNRESOLVED_PATH]: unresolved })[pathname] || mixed;
    return `<!doctype html><html lang="${pathname === JAPANESE_PATH ? 'ja' : 'en'}" data-theme="light"><head><meta charset="utf-8"><title>Offline Threads regression fixture</title><style>
html { --icon-primary: rgb(18, 18, 18); --text-primary: rgb(18, 18, 18); background: #fff; color: #121212; }
html[data-theme="dark"] { --icon-primary: rgb(245, 245, 245); --text-primary: rgb(245, 245, 245); background: #101010; color: #f5f5f5; }
body { margin: 0; font: 16px/1.5 system-ui; }
nav { margin: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
main { width: 680px; margin: 24px auto; }
article { padding: 20px; margin: 16px 0; border: 1px solid #888; border-radius: 12px; }
#parent-post { min-height: 820px; }
header { height: 28px; } a { color: inherit; } p { white-space: pre-wrap; }
.native-actions { display: flex; gap: 8px; height: 42px; align-items: center; }
.native-actions button { width: 40px; height: 36px; background: transparent; border: 0; color: inherit; }
.native-actions > div { width: 64px; height: 36px; }
.native-actions [role="button"] { height: 36px; display: flex; align-items: center; cursor: pointer; }
.native-actions svg { width: 22px; height: 22px; fill: none; stroke: currentColor; }
.carousel { display: flex; gap: 12px; overflow-x: auto; width: 100%; }
.carousel img,.carousel video { width: 280px; height: 220px; object-fit: cover; flex: 0 0 280px; }
.post-media { display: block; width: 400px; height: 240px; object-fit: cover; }
.music-card { width: 400px; overflow: hidden; border: 1px solid #888; border-radius: 12px; }
#music-post header time { color: #777; }
.music-control { height: 64px; display: flex; flex-direction: column; cursor: pointer; }
.music-lyrics { height: 130px; overflow: hidden; position: relative; }
.music-lyrics-inner { transform: translateY(-100px); }
.music-lyrics-inner > div { height: 24px; }
</style></head><body><nav aria-label="Fixture controls">
<button id="go-sensitive">Sensitive route</button><button id="go-next">Next post</button><button id="go-mixed">Mixed post</button><button id="go-empty">Text-only post</button><button id="go-unresolved">Unresolved video</button><button id="switch-language">Switch page language</button><button id="switch-theme">Switch page theme</button>
</nav><main>${initialMarkup}</main><script id="fixture-data" type="application/json">${pathname === MIXED_PATH ? JSON.stringify(mixedPayload) : '{}'}</script>
<script>
const fixtures = ${JSON.stringify({ mixed, next, empty, unresolved })};
function navigate(path, markup, payload) {
    history.pushState({}, '', path);
    document.querySelector('main').innerHTML = markup;
    document.querySelector('#fixture-data').textContent = JSON.stringify(payload || {});
}
document.querySelector('#go-sensitive').onclick = () => navigate('/settings/privacy', '<h1>Private settings fixture</h1>');
document.querySelector('#go-next').onclick = () => navigate('${NEXT_PATH}', fixtures.next);
document.querySelector('#go-mixed').onclick = () => navigate('${MIXED_PATH}', fixtures.mixed, ${JSON.stringify(mixedPayload)});
document.querySelector('#go-empty').onclick = () => navigate('${EMPTY_PATH}', fixtures.empty);
document.querySelector('#go-unresolved').onclick = () => navigate('${UNRESOLVED_PATH}', fixtures.unresolved);
document.querySelector('#switch-language').onclick = () => { document.documentElement.lang = document.documentElement.lang === 'en' ? 'zh-Hant' : 'en'; };
document.querySelector('#switch-theme').onclick = () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; };
</script></body></html>`;
}
