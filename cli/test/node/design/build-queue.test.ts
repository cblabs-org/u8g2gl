/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build-queue.test.ts
 * Purpose: `BuildQueue`'s guarantees, without HTTP: it starts empty, a job
 *          name registers once, jobs run strictly one at a time in submission
 *          order, and a failing job fails only itself.
 * Description: Runners record when they start and finish, and are released by
 *              hand, so ordering is asserted rather than inferred from timing.
 */

import { describe, expect, it } from 'vitest';
import { BuildQueue } from '../../../src/node/design/build-queue.js';

describe('BuildQueue', () => {
  it('starts with no jobs, and refuses to submit an unknown one', () => {
    const queue = new BuildQueue('/project');
    expect(queue.has('editor-wasm')).toBe(false);
    expect(queue.submit('editor-wasm', undefined)).toBeUndefined();
  });

  it('refuses to register one job name twice', () => {
    const queue = new BuildQueue('/project');
    queue.register('generate', async () => null);
    expect(() => queue.register('generate', async () => null)).toThrow(/already registered/);
  });

  it('runs jobs one at a time, in submission order, and a failure does not stop the queue', async () => {
    const queue = new BuildQueue('/project');
    const log: string[] = [];
    const releases: Array<() => void> = [];
    queue.register('slow', async ({ params }) => {
      log.push(`start ${String(params)}`);
      await new Promise<void>((resolve) => releases.push(resolve));
      log.push(`end ${String(params)}`);
      if (params === 'b') throw new Error('b failed');
      return params;
    });

    const a = queue.submit('slow', 'a');
    const b = queue.submit('slow', 'b');
    const c = queue.submit('slow', 'c');
    await Promise.resolve();
    expect(queue.get(a?.id ?? '')?.status).toBe('running');
    expect(queue.get(b?.id ?? '')?.status).toBe('queued');

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      releases.shift()?.();
    }
    await queue.idle();
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(queue.get(a?.id ?? '')).toMatchObject({ status: 'succeeded', result: 'a' });
    expect(queue.get(b?.id ?? '')).toMatchObject({ status: 'failed', error: 'b failed' });
    expect(queue.get(c?.id ?? '')).toMatchObject({ status: 'succeeded', result: 'c' });
  });

  it('forgets the oldest finished records beyond 100', async () => {
    const queue = new BuildQueue('/project');
    queue.register('quick', async () => null);
    const first = queue.submit('quick', undefined);
    for (let i = 0; i < 100; i++) queue.submit('quick', undefined);
    await queue.idle();
    expect(queue.get(first?.id ?? '')).toBeUndefined();
    expect(queue.get('101')).toMatchObject({ status: 'succeeded' });
  });
});
