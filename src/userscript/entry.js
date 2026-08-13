import { normalizeOptions } from '../shared/options.js';
import { createThreadsRuntime } from '../shared/threads-runtime.js';
import { createUserscriptPlatformAdapter } from './platform-adapter.js';

const IS_NODE_RUNTIME = typeof process !== 'undefined' && process.release?.name === 'node';

export async function bootstrapUserscript(environment = globalThis) {
    const platform = createUserscriptPlatformAdapter(environment);
    const initialOptions = normalizeOptions(await platform.loadOptions());
    const runtime = await createThreadsRuntime({
        platform,
        captureSource: environment.unsafeWindow || environment.window,
        document: environment.document,
        window: environment.window,
        initialOptions,
        clock: environment
    });
    await runtime.start();
    return runtime;
}

if (!IS_NODE_RUNTIME) {
    bootstrapUserscript().then(() => {
        console.log('[Threads Target Downloader]', 'v__THREADS_PLUGIN_VERSION__ loaded');
    }).catch((error) => {
        console.error('[Threads Target Downloader]', 'bootstrap failed', error);
    });
}
