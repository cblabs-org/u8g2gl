/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/in-memory.test.ts
 * Purpose: Holds `InMemoryProjectFileSystem` to the shared `ProjectFileSystem`
 *          contract, and checks what only it has: seeding, its two
 *          external-change hooks, and that a throwing listener cannot starve
 *          the others.
 * Description: The contract fixture maps the suite's external-change hooks
 *              onto `simulateExternalWrite` and `simulateExternalRemove`.
 */

import { describe, expect, it } from 'vitest';
import { InMemoryProjectFileSystem, type ProjectFsEvent } from '../../src/core/project-fs/index.js';
import { runProjectFsContract } from './contract.js';

runProjectFsContract('in-memory', async (files) => {
  const fs = new InMemoryProjectFileSystem(files);
  return {
    fs,
    externalWrite: async (path, content) => fs.simulateExternalWrite(path, content),
    externalRemove: async (path) => fs.simulateExternalRemove(path),
    dispose: async () => {},
  };
});

describe('InMemoryProjectFileSystem', () => {
  it('seeds bytes as well as text, without emitting events', async () => {
    const fs = new InMemoryProjectFileSystem({ 'fonts/a.bdf': new Uint8Array([1, 2, 3]) });
    const result = await fs.readBytes('fonts/a.bdf');
    expect(result.ok && [...result.bytes]).toEqual([1, 2, 3]);
  });

  it('throws when seeded or simulated with a path the rule refuses — a caller defect', () => {
    expect(() => new InMemoryProjectFileSystem({ '../x.xml': '' })).toThrow(/not a project path/);
    const fs = new InMemoryProjectFileSystem();
    expect(() => fs.simulateExternalWrite('/abs.xml', '')).toThrow(/not a project path/);
    expect(() => fs.simulateExternalRemove('a//b')).toThrow(/not a project path/);
  });

  it('emits nothing when an absent file is removed', () => {
    const fs = new InMemoryProjectFileSystem();
    const events: ProjectFsEvent[] = [];
    fs.watch((e) => events.push(e));
    fs.simulateExternalRemove('never.xml');
    expect(events).toEqual([]);
  });

  it('keeps delivering to other listeners when one throws', () => {
    const fs = new InMemoryProjectFileSystem({ 'a.xml': '' });
    const events: ProjectFsEvent[] = [];
    fs.watch(() => {
      throw new Error('listener defect');
    });
    fs.watch((e) => events.push(e));
    fs.simulateExternalWrite('a.xml', 'x');
    expect(events).toEqual([{ kind: 'changed', path: 'a.xml' }]);
  });

  it('returns a copy of the bytes, so a caller cannot alter the stored file', async () => {
    const fs = new InMemoryProjectFileSystem({ 'a.bin': new Uint8Array([9]) });
    const first = await fs.readBytes('a.bin');
    if (first.ok) first.bytes[0] = 0;
    const second = await fs.readBytes('a.bin');
    expect(second.ok && [...second.bytes]).toEqual([9]);
  });
});
