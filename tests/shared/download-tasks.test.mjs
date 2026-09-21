import assert from 'node:assert/strict';
import test from 'node:test';
import { getRetryableDownloadItems, runDownloadTasks } from '../../src/shared/download-tasks.js';

test('batch preserves individual failures, absent media and successes in source order', async () => {
    const items = ['ok', 'failed', 'missing', 'throws'].map((key) => ({ key }));
    const observed = [];
    const result = await runDownloadTasks({
        items,
        resolveItem: async (item) => item.key === 'missing' ? null : item,
        downloadItem: async (item) => {
            if (item.key === 'throws') throw new Error('network response contains private data');
            return item.key === 'ok';
        },
        onResult: (outcome) => observed.push(outcome.status)
    });
    assert.deepEqual(observed, ['success', 'failed', 'not_found', 'failed']);
    assert.deepEqual(result.counts, { success: 1, failed: 2, not_found: 1, cancelled: 0 });
    assert.equal(result.completed, true);
    assert.equal(result.results.at(-1).error, 'download_failed');
    assert.deepEqual(getRetryableDownloadItems(result.results), items.slice(1));
});

test('retry re-resolves current items and never re-downloads previous successes', async () => {
    const originalItems = ['ok', 'missing', 'failed', 'cancelled'].map((key) => ({ key, old: true }));
    const previousResults = originalItems.map((item, index) => ({
        key: item.key, item, status: ['success', 'not_found', 'failed', 'cancelled'][index]
    }));
    const currentItems = originalItems.map((item) => ({ key: item.key, refreshed: true }));
    const attempted = [];
    const result = await runDownloadTasks({
        items: currentItems,
        previousResults,
        retryOnly: true,
        resolveItem: async (item) => {
            assert.equal(item.refreshed, true);
            attempted.push(item.key);
            return item;
        },
        downloadItem: async () => true
    });
    assert.deepEqual(attempted, ['missing', 'failed']);
    assert.deepEqual(result.counts, { success: 3, failed: 0, not_found: 0, cancelled: 1 });
    assert.equal(previousResults[1].status, 'not_found');
});

test('feature or route loss during resolution cancels remaining items without downloading', async () => {
    let active = true;
    let downloads = 0;
    const result = await runDownloadTasks({
        items: [{ key: 1 }, { key: 2 }],
        isActive: () => active,
        resolveItem: async (item) => { active = false; return item; },
        downloadItem: async () => { downloads += 1; return true; }
    });
    assert.equal(downloads, 0);
    assert.equal(result.completed, false);
    assert.equal(result.counts.cancelled, 2);
});

test('a completed transfer remains successful when consent is revoked before the next transfer', async () => {
    const controller = new AbortController();
    const result = await runDownloadTasks({
        items: [{ key: 1 }, { key: 2 }],
        signal: controller.signal,
        resolveItem: async (item) => item,
        downloadItem: async () => { controller.abort(); return true; }
    });
    assert.equal(result.completed, false);
    assert.deepEqual(result.results.map((item) => item.status), ['success', 'cancelled']);
});

test('authorization is rechecked after the delay and duplicate keys are downloaded once', async () => {
    let active = true;
    let downloads = 0;
    const result = await runDownloadTasks({
        items: [{ key: 1 }, { key: 1 }, { key: 2 }],
        isActive: () => active,
        resolveItem: async (item) => item,
        downloadItem: async () => { downloads += 1; return true; },
        delay: async () => { active = false; }
    });
    assert.equal(downloads, 1);
    assert.deepEqual(result.results.map((item) => item.status), ['success', 'cancelled']);
});

test('object outcomes distinguish browser handoff from completion and never treat ok false as success', async () => {
    const outcomes = [true, { ok: true, completion: 'completed' }, { ok: true, completion: 'started' }, { ok: false }];
    const result = await runDownloadTasks({
        items: outcomes.map((_, key) => ({ key })),
        resolveItem: async (item) => item,
        downloadItem: async (item) => outcomes[item.key]
    });
    assert.deepEqual(result.results.map((item) => [item.status, item.completion]), [
        ['success', 'completed'], ['success', 'completed'], ['success', 'started'], ['failed', undefined]
    ]);
});
