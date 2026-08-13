import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatestLifecycleQueue } from '../../src/chrome/latest-lifecycle-queue.js';

test('queued refresh always applies the newest state instead of reviving stale consent', async () => {
    const applied = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const queue = createLatestLifecycleQueue(async (value) => {
        applied.push(value);
        if (applied.length === 1) await firstGate;
    });

    const first = queue.update('accepted');
    while (applied.length === 0) await Promise.resolve();
    const staleRouteRefresh = queue.refresh();
    const revoked = queue.update('revoked');
    releaseFirst();
    await Promise.all([first, staleRouteRefresh, revoked]);
    await queue.whenIdle();

    assert.deepEqual(applied, ['accepted', 'revoked']);
});

test('close waits for running work and prevents later refreshes', async () => {
    const applied = [];
    const queue = createLatestLifecycleQueue(async (value) => applied.push(value));
    await queue.update('accepted');
    await queue.close(() => applied.push('closed'));
    await queue.update('revived');
    await queue.refresh();
    assert.deepEqual(applied, ['accepted', 'closed']);
});

test('a failed apply still drains a newer dirty value and remains refreshable', async () => {
    const applied = [];
    let releaseFirst;
    let firstEntered;
    const entered = new Promise((resolve) => { firstEntered = resolve; });
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const queue = createLatestLifecycleQueue(async (value) => {
        applied.push(value);
        if (value === 'accepted') {
            firstEntered();
            await firstGate;
            throw new Error('sync failed');
        }
    });

    const first = queue.update('accepted');
    await entered;
    const latest = queue.update('revoked');
    releaseFirst();
    await assert.rejects(first, /sync failed/);
    await assert.rejects(latest, /sync failed/);
    assert.deepEqual(applied, ['accepted', 'revoked']);

    await queue.refresh();
    assert.deepEqual(applied, ['accepted', 'revoked', 'revoked']);
});
