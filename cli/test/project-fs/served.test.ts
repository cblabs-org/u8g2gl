/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/served.test.ts
 * Purpose: c5 — `ServedProjectFileSystem` against a live design server passes
 *          the same contract suite as the in-memory implementation. Every
 *          request crosses real HTTP, every event comes through the real
 *          watcher and a real server-sent-event stream, and every "external"
 *          change is a real write to the project directory.
 * Description: Each test gets its own temporary project and server on port 0,
 *              closed in `dispose`. Node has no EventSource, so the minimal
 *              reader in test-event-source.ts is injected. Event timing is
 *              looser than in-memory's, since a real watcher is debounced.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ServedProjectFileSystem } from '../../src/core/project-fs/index.js';
import { startDesignServer } from '../../src/node/design/design-server.js';
import { makeTempDir, removeTempDirs, writeFiles } from '../node/design/temp-project.js';
import { runProjectFsContract } from './contract.js';
import { createTestEventSource } from './test-event-source.js';

afterAll(removeTempDirs);

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
