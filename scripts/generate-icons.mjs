import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('usage: node scripts/generate-icons.mjs <source-png>');

const outputDir = resolve('extension', 'icons');
await mkdir(outputDir, { recursive: true });
const source = await readFile(sourcePath);
await Promise.all([16, 32, 48, 128].map(async (size) => {
    const output = await sharp(source)
        .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    await writeFile(resolve(outputDir, `icon-${size}.png`), output);
}));

console.log(`Generated icons in ${outputDir}`);
