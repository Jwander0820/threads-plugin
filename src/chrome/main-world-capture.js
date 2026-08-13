import { installMainCapture } from './main-capture-runtime.js';

const STOP_MESSAGE = Object.freeze({
    marker: 'threads-plugin-capture',
    version: 1,
    type: 'STOP_CAPTURE'
});
const READY_MESSAGE = Object.freeze({
    marker: 'threads-plugin-capture',
    version: 1,
    type: 'CAPTURE_READY'
});
const postReady = () => window.postMessage(READY_MESSAGE, window.location.origin);
const capture = installMainCapture(window, { onRouteInvalidated: postReady });
if (capture?.active) {
    const onControlMessage = (event) => {
        const data = event.data;
        if (event.source !== window || event.origin !== window.location.origin) return;
        if (data?.marker === STOP_MESSAGE.marker && data?.version === STOP_MESSAGE.version &&
            data?.type === STOP_MESSAGE.type && Object.keys(data).length === 3) {
            capture.stop();
            return;
        }
        if (data?.marker === STOP_MESSAGE.marker && data?.version === STOP_MESSAGE.version &&
            data?.type === 'ROUTE_STATE' && Object.keys(data).length === 5) {
            capture.setRouteState?.({
                sourceRouteKey: data.sourceRouteKey,
                sourceRouteGeneration: data.sourceRouteGeneration
            });
        }
    };
    if (capture.claimControlMessageListener(onControlMessage)) {
        try {
            window.addEventListener('message', onControlMessage);
        } catch {
            capture.releaseControlMessageListener(onControlMessage);
        }
    }
}
if (capture?.active) postReady();
