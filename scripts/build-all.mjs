import { buildExtension } from './build-extension.mjs';
import { buildStoreAssets } from './build-store-assets.mjs';
import { buildUserscript } from './build-userscript.mjs';

await Promise.all([
    buildUserscript(),
    buildExtension(),
    buildStoreAssets()
]);

console.log('Built userscript, Chrome extension, and Store promotional asset.');
