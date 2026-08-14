import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

const sourcePath = resolve(process.argv[2] || 'extension/icon.svg');

const outputDir = resolve('extension', 'icons');
await mkdir(outputDir, { recursive: true });
const source = await readFile(sourcePath);

function createBackgroundMask(size) {
    const inset = size * 1.5 / 128;
    const radius = size * 240 / 1254 - inset;
    const extent = size - inset * 2;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<rect x="${inset}" y="${inset}" width="${extent}" height="${extent}" rx="${radius}" fill="#fff"/></svg>`
    );
}

await Promise.all([16, 32, 48, 128].map(async (size) => {
    const output = await sharp(source)
        .resize(size, size, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
        .composite([{ input: createBackgroundMask(size), blend: 'dest-in' }])
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    await writeFile(resolve(outputDir, `icon-${size}.png`), output);
}));
await writeFile(resolve('extension', 'icon-source.png'), await sharp(source)
    .resize(1254, 1254, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .composite([{ input: createBackgroundMask(1254), blend: 'dest-in' }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer());

console.log(`Generated icon source preview and extension icons from ${sourcePath}`);
