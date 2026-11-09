import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

// Exercise actual pointer events and generated userscript startup in disposable
// browser contexts. The GM facade records downloads without writing any files.
const root = resolve(import.meta.dirname, '../..');
const outputDir = resolve(root, 'artifacts/hover-regression');
await mkdir(outputDir, { recursive: true });
const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(path => path && existsSync(path));
if (!executablePath) throw new Error('Install Playwright Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');

const userscript = await readFile(resolve(root, 'threads-plugin.user.js'), 'utf8');
const runtimeBundle = (await build({
    stdin: {
        contents: `import { createThreadsRuntime } from './src/shared/threads-runtime.js';
            const platform = {
                installStyles(css) { const style=document.createElement('style'); style.textContent=css; document.head.append(style); return ()=>style.remove(); },
                installSettingsUi() { return ()=>{}; },
                downloadMedia(details) { window.GM_download(details); }
            };
            window.testRuntime=await createThreadsRuntime({ platform, captureSource:null });
            await window.testRuntime.start();`,
        resolveDir: root
    }, bundle: true, write: false, format: 'esm'
})).outputFiles[0].text;
const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#517fa4' } }).jpeg().toBuffer();

const scenarios = [
    { name: 'html-overflow', css: 'html{overflow-x:hidden}', scroll: 'document' },
    { name: 'body-overflow-propagation', css: 'body{height:100vh;overflow-x:hidden}', scroll: 'document' },
    { name: 'body-scrollport', css: 'html{height:100%;overflow:hidden}body{height:100vh;overflow:auto}', scroll: 'body' },
    { name: 'nested-scrollport', css: 'html{overflow:hidden}main{position:fixed;left:240px;top:120px;width:600px;height:550px;overflow:auto}.column{margin-left:0}', scroll: 'main' },
    { name: 'scaled-scrollport', css: 'html{overflow:hidden}main{position:fixed;left:240px;top:120px;width:600px;height:550px;overflow:auto;transform:scale(1.5);transform-origin:top left}.column{margin-left:0}', scroll: 'main' }
];

function fixtureHtml(scenario) {
    const posts = Array.from({ length: 12 }, (_, index) => {
        const image = `<img src="https://cdninstagram.com/photo-${index}.jpg" alt="Photo ${index}">`;
        const wrapped = index % 4 === 2
            ? `<a href="/@fixture/post/POST_${index}" style="display:inline;overflow:hidden">${image}</a>`
            : index % 4 === 3
                ? `<div role="region" aria-label="Gallery" class="zero-wrapper">${image}</div>` : image;
        return `<article><div class="media" data-photo="${index}">${wrapped}${index % 2 ? '<div class="overlay"></div>' : ''}</div></article>`;
    }).join('');
    const content = `<div class="column"><div class="title"><button id="back" onclick="window.backClicks=(window.backClicks||0)+1">Back</button></div><div class="body-clip"><div class="region" role="region" aria-label="Column body">${posts}
        <div class="carousel">${[0, 1, 2].map(index => `<img src="https://cdninstagram.com/slide-${index}.jpg" alt="Slide ${index}">`).join('')}</div><div class="spacer"></div>
        <div id="viewer-mount" hidden><div class="viewer-backdrop"></div><div class="viewer-portal"><div class="full-viewer" role="dialog"><button id="viewer-close">Close image</button><div class="viewer-body"><img class="viewer-image" src="https://cdninstagram.com/photo-0.jpg" alt="Expanded photo"></div></div></div></div>
        </div></div></div>`;
    return `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;background:#111;color:white}.column{margin-left:240px;width:600px}
        .title{height:72px;position:sticky;top:0;background:#222;z-index:1}#back{position:absolute;left:24px;top:18px;width:36px;height:36px}
        .body-clip{overflow:hidden}.region{overflow:hidden auto}article{height:420px}
        .media{position:relative;width:400px;height:300px;margin:20px 10px}img{display:block;width:400px;height:300px}
        .overlay{position:absolute;inset:0}.zero-wrapper{height:0;overflow:visible}.zero-wrapper img{position:absolute;top:0;left:0}
        .carousel{display:flex;overflow-x:auto;width:400px;margin:20px 10px}.carousel img{flex:0 0 300px;width:300px;height:240px}.spacer{height:1000px}
        .viewer-backdrop{position:fixed;inset:0;z-index:15;background:black}.viewer-portal{position:relative;width:0;height:0;overflow:hidden}
        .full-viewer{position:fixed;inset:0;z-index:20;background:black;overflow:auto}.viewer-body{position:relative;height:200vh}
        .viewer-image{position:absolute;top:0;left:calc(50% - 200px);width:400px;height:100vh;object-fit:contain}
        #viewer-close{position:absolute;top:10px;left:10px;z-index:1}
        ${scenario.css}</style>${scenario.scroll === 'main' ? `<main id="scrollport">${content}</main>` : content}
        <script>
          document.addEventListener('click', event => {
            if (event.target.closest('.media')) {
              document.querySelector('#viewer-mount').hidden = false;
              history.pushState({}, '', '/@fixture/post/PHOTO_0/media');
            } else if (event.target.id === 'viewer-close') {
              document.querySelector('#viewer-mount').hidden = true;
              history.pushState({}, '', '/');
            }
          });
        </script>`;
}

async function scrollBy(page, scenario, delta) {
    await page.evaluate(async ({ scroll, delta }) => {
        if (scroll === 'document') window.scrollBy(0, delta);
        else (scroll === 'body' ? document.body : document.querySelector('#scrollport')).scrollTop += delta;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { scroll: scenario.scroll, delta });
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
    for (const product of ['runtime', 'userscript']) {
        for (const scenario of scenarios) {
            const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname === 'cdninstagram.com' && url.pathname.endsWith('.jpg')) {
                    await route.fulfill({ contentType: 'image/jpeg', body: photo });
                } else if (url.origin === 'https://www.threads.com' && route.request().resourceType() === 'document') {
                    await route.fulfill({ contentType: 'text/html', body: fixtureHtml(scenario) });
                } else if (url.origin === 'https://www.threads.com' && url.pathname === '/favicon.ico') {
                    await route.fulfill({ status: 204 });
                } else {
                    errors.push(`Unexpected request: ${url.origin}${url.pathname}`);
                    await route.abort();
                }
            });
            const button = page.locator('.tm-target-download-button');
            const hover = async locator => {
                // Ensure a real pointermove even when scrollIntoView places the
                // next photo at exactly the previous photo's screen coordinates.
                await page.mouse.move(50, 900);
                await locator.hover();
                await button.waitFor({ state: 'visible', timeout: 2000 });
                const bounds = await button.boundingBox();
                const header = await page.locator('.title').boundingBox();
                assert.ok(bounds.y >= header.y + header.height, 'download button stays below the pinned title row');
            };
            try {
                await page.goto('https://www.threads.com/');
                await page.evaluate(() => {
                    window.downloadRequests = [];
                    window.GM_download = details => { window.downloadRequests.push(details.url); details.onload?.(); };
                });
                await page.addScriptTag(product === 'runtime'
                    ? { type: 'module', content: runtimeBundle } : { content: userscript });
                const photos = page.locator('.media');
                for (const order of [Array.from({ length: 12 }, (_, i) => i), Array.from({ length: 12 }, (_, i) => 11 - i)]) {
                    for (const index of order) await hover(photos.nth(index));
                }

                // Keep the source photo partly visible underneath the title row.
                await hover(photos.nth(3));
                await button.hover();
                const image = await photos.nth(3).boundingBox();
                const header = await page.locator('.title').boundingBox();
                await scrollBy(page, scenario, image.y - header.y - header.height + 100);
                assert.equal(await button.isVisible(), true);
                assert.ok((await button.boundingBox()).y >= (await page.locator('.title').boundingBox()).y + header.height);
                const remaining = await photos.nth(3).boundingBox();
                await scrollBy(page, scenario, remaining.y + remaining.height - header.y - header.height + 1);
                await button.waitFor({ state: 'hidden', timeout: 2000 });
                await page.locator('#back').click();
                assert.equal(await page.evaluate(() => window.backClicks), 1);
                assert.equal(await page.evaluate(() => window.downloadRequests.length), 0);

                const slides = page.locator('.carousel img');
                await hover(slides.nth(0));
                await page.locator('.carousel').evaluate(async element => {
                    element.scrollLeft = element.scrollWidth;
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                });
                await button.waitFor({ state: 'hidden', timeout: 2000 });
                await hover(slides.nth(2));
                await button.click();
                await page.waitForFunction(() => window.downloadRequests.length === 1);
                assert.match((await page.evaluate(() => window.downloadRequests))[0], /slide-2\.jpg/);

                await photos.nth(0).click();
                const expanded = page.locator('.viewer-image');
                await expanded.waitFor({ state: 'visible', timeout: 2000 });
                await page.mouse.move(50, 900);
                await expanded.hover();
                await button.waitFor({ state: 'visible', timeout: 2000 });
                await page.waitForFunction(() => document.querySelector('.tm-target-download-button').dataset.tmBusy !== '1');
                const viewer = await page.locator('.full-viewer').boundingBox();
                const expandedButton = await button.boundingBox();
                assert.ok(expandedButton.y >= viewer.y && expandedButton.y + expandedButton.height <= viewer.y + viewer.height);
                await button.click();
                await page.waitForFunction(() => window.downloadRequests.length === 2);
                assert.match((await page.evaluate(() => window.downloadRequests))[1], /photo-0\.jpg/);
                await page.locator('#viewer-close').click();
                await expanded.waitFor({ state: 'hidden', timeout: 2000 });
                await hover(photos.nth(0));
                assert.deepEqual(errors, []);
                console.log(`PASS ${product}/${scenario.name}: 12 photos down/up, header bounds, carousel, expanded-view download and return to browsing`);
            } catch (error) {
                await page.screenshot({ path: resolve(outputDir, `${product}-${scenario.name}.png`) });
                throw error;
            } finally {
                await context.close();
            }
        }
    }
} finally {
    await browser.close();
}
