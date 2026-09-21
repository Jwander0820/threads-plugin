const RETRYABLE_STATUSES = new Set(['failed', 'not_found']);

export function summarizeDownloadResults(results) {
    const counts = { success: 0, failed: 0, not_found: 0, cancelled: 0 };
    for (const result of results) {
        if (Object.hasOwn(counts, result.status)) counts[result.status] += 1;
    }
    return counts;
}

export function getRetryableDownloadItems(results) {
    return results.filter((result) => RETRYABLE_STATUSES.has(result.status)).map((result) => result.item);
}

// The caller owns authorization, media resolution and the platform download API.
// This module only sequences work and preserves outcomes across an explicit retry.
export async function runDownloadTasks({
    items,
    previousResults = [],
    retryOnly = false,
    isActive = () => true,
    signal,
    resolveItem,
    downloadItem,
    onResult = () => {},
    delay = async () => {},
    getKey = (item) => item.key
}) {
    const canContinue = () => !signal?.aborted && isActive();
    const results = retryOnly ? previousResults.map((result) => ({ ...result })) : [];
    const previousByKey = new Map(previousResults.map((result) => [result.key, result]));
    const seen = new Set();
    const selected = items.filter((item) => {
        const key = getKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return !retryOnly || RETRYABLE_STATUSES.has(previousByKey.get(key)?.status);
    });
    let completed = true;
    const record = (item, status, error, completion) => {
        const key = getKey(item);
        const result = { key, item, status, ...(error ? { error } : {}), ...(completion ? { completion } : {}) };
        const existingIndex = results.findIndex((candidate) => candidate.key === key);
        if (existingIndex < 0) results.push(result);
        else results[existingIndex] = result;
        onResult(result, results.slice());
    };

    for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index];
        if (!canContinue()) {
            completed = false;
            selected.slice(index).forEach((remaining) => record(remaining, 'cancelled'));
            break;
        }
        try {
            const resolved = await resolveItem(item);
            if (!canContinue()) {
                completed = false;
                selected.slice(index).forEach((remaining) => record(remaining, 'cancelled'));
                break;
            }
            if (!resolved) {
                record(item, 'not_found');
                continue;
            }
            const outcome = await downloadItem(resolved, item);
            const succeeded = outcome === true || outcome?.ok === true;
            // A completed transfer stays successful even if authorization changed
            // just afterwards. No further transfer starts after that change.
            record(item, succeeded ? 'success' : (canContinue() ? 'failed' : 'cancelled'), undefined,
                succeeded ? (outcome?.completion === 'started' ? 'started' : 'completed') : undefined);
        } catch (error) {
            record(item, canContinue() ? 'failed' : 'cancelled', error?.code || 'download_failed');
        }
        if (!canContinue()) {
            completed = false;
            selected.slice(index + 1).forEach((remaining) => record(remaining, 'cancelled'));
            break;
        }
        if (index < selected.length - 1) await delay(320);
    }
    return { results, counts: summarizeDownloadResults(results), completed };
}
