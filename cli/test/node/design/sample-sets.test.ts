/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/sample-sets.test.ts
 * Purpose: Sample sets (`samples/<set>.json`, ui_spec §11) on the design
 *          server, over real HTTP: they are listed, read, written and watched
 *          like the project's other files, under the same path and token
 *          rules, and they are the only files the server will delete, at the
 *          version the client read. And `generate` and `validate`, through the
 *          built CLI, ignore `samples/` entirely: a set never reaches the
 *          firmware, so even a set that is not JSON changes nothing.
 * Description: The server tests start a server on port 0 against a temporary
 *              project and close it in afterEach. The CLI tests copy the
 *              departures fixture to a temporary directory and run the built
 *              CLI (`dist/node/cli.js`) on it, with and without a set.
 */

import { execFile } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ServedProjectFileSystem, type ProjectFsEvent } from '../../../src/core/project-fs/index.js';
import { contentVersion } from '../../../src/core/project-fs/content-version.js';
import { startDesignServer, type DesignServer } from '../../../src/node/design/design-server.js';
import { createTestEventSource } from '../../project-fs/test-event-source.js';
import { MINIMAL_PROJECT, makeTempDir, removeTempDirs, writeFiles } from './temp-project.js';

const SET = 'samples/typical.json';
const SET_TEXT = '{\n  "u8g2gl_samples": 1,\n  "values": {},\n  "rows": {}\n}\n';

let server: DesignServer | undefined;
let root = '';

// start
// A server on port 0 for a fresh project seeded with MINIMAL_PROJECT plus `extra`.
async function start(extra: Readonly<Record<string, string>> = {}): Promise<DesignServer> {
  root = makeTempDir('sample-sets');
  writeFiles(root, { ...MINIMAL_PROJECT, ...extra });
  server = await startDesignServer({ projectRoot: root });
  return server;
}

// api
// A request to the running server, with the token unless `token` is false.
function api(path: string, init: RequestInit = {}, token = true): Promise<Response> {
  if (server === undefined) throw new Error('no server');
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${server.token}` } : {}) },
  });
}

// remove
// DELETE /api/file at an expected version.
function remove(path: string, version: string | undefined, token = true): Promise<Response> {
  return api(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: version === undefined ? {} : { 'U8G2GL-Expected-Version': version } }, token);
}

afterEach(async () => {
  await server?.close();
  server = undefined;
});
afterAll(removeTempDirs);

describe('sample sets on the design server', () => {
  it('lists, reads and writes a set like any project file, creating samples/ on first write', async () => {
    await start();
    const created = await api(`/api/file?path=${SET}`, { method: 'PUT', body: SET_TEXT, headers: { 'U8G2GL-Expected-Version': 'absent' } });
    expect(created.status).toBe(200);
    expect(readFileSync(join(root, 'samples', 'typical.json'), 'utf8')).toBe(SET_TEXT);
    const listing = (await (await api('/api/files')).json()) as { files: string[] };
    expect(listing.files).toContain(SET);
    const read = await api(`/api/file?path=${SET}`);
    expect(await read.text()).toBe(SET_TEXT);
    // A second create is a conflict: a set is never replaced by a create.
    const again = await api(`/api/file?path=${SET}`, { method: 'PUT', body: '{}', headers: { 'U8G2GL-Expected-Version': 'absent' } });
    expect(again.status).toBe(409);
  });

  it('refuses a set path that escapes the project, and any request without the token', async () => {
    await start({ [SET]: SET_TEXT });
    expect((await api('/api/file?path=samples/../../x.json', { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await api(`/api/file?path=${SET}`, {}, false)).status).toBe(403);
    expect((await api(`/api/file?path=${SET}`, { method: 'PUT', body: '{}' }, false)).status).toBe(403);
    expect((await remove(SET, contentVersion(new TextEncoder().encode(SET_TEXT)), false)).status).toBe(403);
    expect(existsSync(join(root, 'samples', 'typical.json'))).toBe(true);
  });

  it('reports an external edit, an added set and a removed one as events', async () => {
    const s = await start({ [SET]: SET_TEXT });
    const fs = new ServedProjectFileSystem({ origin: `http://127.0.0.1:${s.port}`, token: s.token, createEventSource: createTestEventSource });
    await fs.connect();
    const events: ProjectFsEvent[] = [];
    const seen = (kind: ProjectFsEvent['kind'], path: string): Promise<void> =>
      new Promise((resolveSeen, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${kind} event for ${path}`)), 2000);
        const check = (): void => {
          if (events.some((e) => e.kind === kind && e.path === path)) {
            clearTimeout(timer);
            resolveSeen();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    const off = fs.watch((e) => events.push(e));
    try {
      writeFileSync(join(root, 'samples', 'typical.json'), SET_TEXT.replace('{}', '{ "x": 1 }'));
      await seen('changed', SET);
      writeFileSync(join(root, 'samples', 'empty.json'), SET_TEXT);
      await seen('added', 'samples/empty.json');
      const version = contentVersion(new TextEncoder().encode(SET_TEXT));
      expect((await remove('samples/empty.json', version)).status).toBe(200);
      await seen('removed', 'samples/empty.json');
    } finally {
      off();
      fs.close();
    }
  });

  it('deletes a set only at the version the client read, and nothing that is not a set', async () => {
    await start({ [SET]: SET_TEXT, 'samples/notes.txt': 'x\n', 'samples/deep/a.json': '{}\n' });
    const version = contentVersion(new TextEncoder().encode(SET_TEXT));
    // No version, or "absent", is malformed: a removal is always conditional.
    expect((await remove(SET, undefined)).status).toBe(400);
    expect((await remove(SET, 'absent')).status).toBe(400);
    // A stale version is a conflict, and the file stays.
    const stale = await remove(SET, 'not-the-version');
    expect(stale.status).toBe(409);
    expect(existsSync(join(root, 'samples', 'typical.json'))).toBe(true);
    // Not a set: a screen, another extension, a set one level too deep, a traversal.
    for (const path of ['screens/screen_home.xml', 'samples/notes.txt', 'samples/deep/a.json', 'samples/../u8g2gl.xml']) {
      const file = join(root, ...path.split('/'));
      const before = existsSync(file);
      const answer = await remove(path, before ? contentVersion(readFileSync(file)) : 'x');
      expect(answer.status, path).toBe(400);
      expect(existsSync(file), path).toBe(before);
    }
    expect((await remove('samples/missing.json', version)).status).toBe(404);
    const removed = await remove(SET, version);
    expect(removed.status).toBe(200);
    expect(existsSync(join(root, 'samples', 'typical.json'))).toBe(false);
  });
});

/** The built CLI. */
const CLI = resolve(__dirname, '../../../dist/node/cli.js');
/** The departures fixture, the project sample sets were designed against. */
const DEPARTURES = resolve(__dirname, '../../fixtures/departures-project');

// cli
// Runs the built CLI; resolves with its exit code and output.
function cli(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolveRun({ code: error !== null && typeof error.code === 'number' ? error.code : 0, stdout, stderr });
    });
  });
}

// tree
// Every file under a directory, by relative path, with its bytes as text.
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(dir, path)] = readFileSync(path, 'latin1');
    }
  };
  walk(dir);
  return out;
}

describe('generate and validate ignore samples/', () => {
  it('generate writes the same output with a set present, even one that is not JSON, and validate passes', async () => {
    const plain = makeTempDir('samples-plain');
    const withSets = makeTempDir('samples-present');
    cpSync(DEPARTURES, plain, { recursive: true });
    cpSync(DEPARTURES, withSets, { recursive: true });
    writeFiles(withSets, {
      'samples/typical.json': '{ "u8g2gl_samples": 1, "values": { "platform": "4" }, "rows": {} }\n',
      'samples/broken.json': '{ this is not json\n',
      'samples/unknown.json': '{ "u8g2gl_samples": 99, "values": { "no_such_subject": 1 } }\n',
    });
    const first = await cli(['generate', plain]);
    const second = await cli(['generate', withSets]);
    expect(first.code, first.stderr).toBe(0);
    expect(second.code, second.stderr).toBe(0);
    expect(second.stderr).not.toMatch(/samples/);
    expect(tree(join(withSets, 'generated'))).toEqual(tree(join(plain, 'generated')));
    const validated = await cli(['validate', withSets]);
    expect(validated.code, validated.stderr).toBe(0);
    expect(`${validated.stdout}${validated.stderr}`).not.toMatch(/samples/);
  }, 60_000);
});
