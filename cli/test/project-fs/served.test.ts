/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/served.test.ts
 * Purpose: `ServedProjectFileSystem` against a live design server passes
 *          the same contract suite as the in-memory implementation. Every
 *          request crosses real HTTP, every event comes through the real
 *          watcher and a real server-sent-event stream, and every "external"
 *          change is a real write to the project directory.
 * Description: Each test gets its own temporary project and server on port 0,
 *              closed in `dispose`. Node has no EventSource, so the minimal
 *              reader in test-event-source.ts is injected. Event timing is
 *              looser than in-memory's, since a real watcher is debounced.
 *              A fixture is handed over only once its watcher has been seen
 *              to report a change (see `untilWatcherLive`).
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ServedProjectFileSystem, type ProjectFsEvent } from '../../src/core/project-fs/index.js';
import { startDesignServer } from '../../src/node/design/design-server.js';
import { makeTempDir, removeTempDirs, writeFiles } from '../node/design/temp-project.js';
import { runProjectFsContract } from './contract.js';
import { createTestEventSource } from './test-event-source.js';

afterAll(removeTempDirs);

/** The file `untilWatcherLive` writes and removes; no contract test names it. */
const WATCH_PROBE = 'served-watch-probe.txt';

/** How long to wait for one probe write's event before writing again. */
const PROBE_RETRY_MS = 100;

/** How long the watcher may take to come up before the fixture gives up. */
const PROBE_DEADLINE_MS = 3000;

// until
// Polls `condition` until it holds or `timeoutMs` passes.
//   condition — checked every 10 ms
//   timeoutMs — how long to keep checking
// Returns whether the condition held.
async function until(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= end) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

// untilWatcherLive
// Resolves once the server's watcher has been seen to report a change. On
// macOS `fs.watch` returns before the file-event stream behind it is running,
// and a write in that gap is never reported at all — no deadline catches it.
// Measured on the raw `fs.watch`: about 1 in 150 writes made straight after
// start were lost, and none of 300 made 50 ms later. The watch tests write
// soon after setup, so without this they occasionally failed the same way. A
// fixed pause would only shrink the window; an event seen closes it.
//   fs   — the connected file system
//   root — the project directory
async function untilWatcherLive(fs: ServedProjectFileSystem, root: string): Promise<void> {
  const seen: ProjectFsEvent['kind'][] = [];
  const unsubscribe = fs.watch((event) => {
    if (event.path === WATCH_PROBE) {
      seen.push(event.kind);
    }
  });
  try {
    // --- Step 1: Write the probe until its event comes back ---
    // A write lost in the gap leaves the file unknown to the watcher, so the
    // first write it does see is still reported as `added`.
    const end = Date.now() + PROBE_DEADLINE_MS;
    for (let attempt = 0; !seen.includes('added'); attempt++) {
      if (Date.now() >= end) {
        throw new Error(`the design server's watcher reported nothing within ${PROBE_DEADLINE_MS} ms`);
      }
      writeFiles(root, { [WATCH_PROBE]: `${attempt}\n` });
      await until(() => seen.includes('added'), PROBE_RETRY_MS);
    }

    // --- Step 2: Remove it, so the project holds exactly the files asked for ---
    rmSync(join(root, WATCH_PROBE));
    if (!(await until(() => seen.includes('removed'), PROBE_DEADLINE_MS))) {
      throw new Error("the design server's watcher did not report the probe's removal");
    }
  } finally {
    unsubscribe();
  }
}

runProjectFsContract(
  'served',
  async (files) => {
    const root = makeTempDir('served-contract');
    writeFiles(root, files);
    const server = await startDesignServer({ projectRoot: root });
    const fs = new ServedProjectFileSystem({
      origin: `http://127.0.0.1:${server.port}`,
      token: server.token,
      createEventSource: createTestEventSource,
    });
    await fs.connect();
    try {
      await untilWatcherLive(fs, root);
    } catch (error) {
      fs.close();
      await server.close();
      throw error;
    }
    return {
      fs,
      externalWrite: async (path, content) => writeFiles(root, { [path]: content }),
      externalRemove: async (path) => rmSync(join(root, ...path.split('/')), { force: true }),
      dispose: async () => {
        fs.close();
        await server.close();
      },
    };
  },
  { eventTimeoutMs: 1000, quietMs: 300 },
);

describe('ServedProjectFileSystem — beyond the contract', () => {
  it('rejects connect() and reports unavailable for a wrong token', async () => {
    const root = makeTempDir('served-token');
    writeFiles(root, { 'u8g2gl.xml': '<u8g2gl />\n' });
    const server = await startDesignServer({ projectRoot: root });
    try {
      const fs = new ServedProjectFileSystem({
        origin: `http://127.0.0.1:${server.port}`,
        token: 'f'.repeat(64),
        createEventSource: createTestEventSource,
      });
      await expect(fs.connect()).rejects.toThrow(/event stream/);
      expect(await fs.read('u8g2gl.xml')).toMatchObject({ ok: false, code: 'unavailable' });
      expect(await fs.list()).toMatchObject({ ok: false, code: 'unavailable' });
    } finally {
      await server.close();
    }
  });

  it('reports unavailable, never throws, when the server is gone', async () => {
    const root = makeTempDir('served-gone');
    writeFiles(root, { 'u8g2gl.xml': '<u8g2gl />\n' });
    const server = await startDesignServer({ projectRoot: root });
    const origin = `http://127.0.0.1:${server.port}`;
    await server.close();
    const fs = new ServedProjectFileSystem({ origin, token: server.token, createEventSource: createTestEventSource });
    expect(await fs.read('u8g2gl.xml')).toMatchObject({ ok: false, code: 'unavailable' });
    expect(await fs.write('u8g2gl.xml', 'x')).toMatchObject({ ok: false, code: 'unavailable' });
  });
});
