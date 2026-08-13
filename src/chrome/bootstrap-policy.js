import { canProcessPage, hasAnsweredDisclosure } from '../shared/consent-state.js';
import { isSensitiveThreadsRoute } from '../shared/network-policy.js';

export function decideExtensionBootstrap(consent, pageUrl = 'https://www.threads.com/') {
    const sensitiveRoute = isSensitiveThreadsRoute(pageUrl);
    return Object.freeze({
        showDisclosure: !sensitiveRoute && !hasAnsweredDisclosure(consent),
        startRuntime: !sensitiveRoute && canProcessPage(consent),
        sensitiveRoute,
        captureSource: null
    });
}
