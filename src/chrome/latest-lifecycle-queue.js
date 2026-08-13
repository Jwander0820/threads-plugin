export function createLatestLifecycleQueue(applyLatest) {
    if (typeof applyLatest !== 'function') throw new TypeError('applyLatest must be a function');

    let latestValue;
    let hasValue = false;
    let dirty = false;
    let draining = false;
    let closed = false;
    let queue = Promise.resolve();

    const schedule = () => {
        if (closed || !hasValue) return queue;
        dirty = true;
        if (draining) return queue;
        draining = true;
        queue = queue
            .catch(() => {})
            .then(async () => {
                let firstFailure = null;
                try {
                    while (!closed && dirty) {
                        dirty = false;
                        const value = latestValue;
                        try {
                            await applyLatest(value);
                        } catch (error) {
                            firstFailure ||= error;
                            if (!dirty) throw error;
                        }
                    }
                    if (firstFailure) throw firstFailure;
                } finally {
                    draining = false;
                }
            });
        return queue;
    };

    return Object.freeze({
        update(value) {
            if (closed) return queue;
            latestValue = value;
            hasValue = true;
            return schedule();
        },
        refresh() {
            return schedule();
        },
        close(finalizer = () => {}) {
            if (closed) return queue;
            closed = true;
            queue = queue
                .catch(() => {})
                .then(finalizer);
            return queue;
        },
        whenIdle() { return queue; },
        get latestValue() { return latestValue; }
    });
}
