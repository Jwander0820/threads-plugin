import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..');
export const STORE_ASSET_DIR = resolve(REPOSITORY_ROOT, 'docs', 'store-assets');
export const SMALL_PROMO_OUTPUT = resolve(STORE_ASSET_DIR, 'small-promo-440x280.png');

export async function renderSmallPromo() {
    const icon = await sharp(resolve(REPOSITORY_ROOT, 'extension', 'icons', 'icon-128.png'))
        .resize(112, 112, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280">' +
        '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#080b12"/><stop offset="1" stop-color="#111a2b"/></linearGradient>' +
        '<radialGradient id="glow" cx="82%" cy="42%" r="54%"><stop stop-color="#357cff" stop-opacity=".32"/><stop offset="1" stop-color="#080b12" stop-opacity="0"/></radialGradient></defs>' +
        '<rect width="440" height="280" rx="22" fill="url(#bg)"/><rect width="440" height="280" rx="22" fill="url(#glow)"/>' +
        '<path d="M286 -22C261 55 276 111 345 127C395 138 427 105 470 81" fill="none" stroke="#4d88ff" stroke-width="2" stroke-opacity=".21"/>' +
        '<rect x="292" y="78" width="116" height="116" rx="25" fill="#070a10" stroke="#397eff" stroke-opacity=".32"/>' +
        '<rect x="36" y="35" width="72" height="3" rx="1.5" fill="#397eff"/>' +
        '<text x="36" y="62" fill="#81a7ff" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="2">THREADS MEDIA TOOLS</text>' +
        '<text x="34" y="116" fill="#f4f7ff" font-family="Segoe UI,Arial,sans-serif" font-size="38" font-weight="700">Threads</text>' +
        '<text x="34" y="155" fill="#f4f7ff" font-family="Segoe UI,Arial,sans-serif" font-size="38" font-weight="700">Plugin</text>' +
        '<text x="36" y="187" fill="#aab4c8" font-family="Segoe UI,Arial,sans-serif" font-size="13">Download. Copy. Stay in control.</text>' +
        '<rect x="36" y="218" width="138" height="28" rx="14" fill="#18233a" stroke="#477fff" stroke-opacity=".5"/><circle cx="53" cy="232" r="4" fill="#4d83ff"/>' +
        '<text x="65" y="235.5" fill="#c9d7fb" font-family="Segoe UI,Arial,sans-serif" font-size="9.5" font-weight="700" letter-spacing="1.25">PRIVATE BY DEFAULT</text>' +
        '</svg>';
    return sharp(Buffer.from(svg))
        .composite([{ input: icon, left: 294, top: 80 }])
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
}

export async function buildStoreAssets() {
    await mkdir(STORE_ASSET_DIR, { recursive: true });
    await writeFile(SMALL_PROMO_OUTPUT, await renderSmallPromo());
    return SMALL_PROMO_OUTPUT;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildStoreAssets();
    console.log(`Built ${SMALL_PROMO_OUTPUT}`);
}
