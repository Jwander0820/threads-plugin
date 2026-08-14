import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..');
export const STORE_ASSET_DIR = resolve(REPOSITORY_ROOT, 'docs', 'store-assets');
export const SMALL_PROMO_SOURCE = resolve(REPOSITORY_ROOT, 'store-assets', 'promo-tile-source.png');
export const SMALL_PROMO_OUTPUT = resolve(STORE_ASSET_DIR, 'small-promo-440x280.png');

export async function renderSmallPromo() {
    return sharp(SMALL_PROMO_SOURCE)
        .resize(440, 280, {
            fit: 'cover',
            position: 'centre',
            kernel: sharp.kernel.lanczos3
        })
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
