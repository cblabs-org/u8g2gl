/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/design-server.test.ts
 * Purpose: The design server's security and behaviour over real HTTP: the
 *          token on every route, no write escaping the project (by path or by
 *          symlink), loopback only, an external edit becoming a `changed` event
 *          within 200 ms, the ignored paths, malformed percent-encodings, the
 *          build queue's routes, the designer's files and the editor Wasm
 *          route, and a clean close with streams open.
 * Description: Each test starts a server on port 0 against a temporary project
 *              and closes it in afterEach. Requests use `fetch`, except the
 *              Host-header check, which needs `node:http` because `fetch` will
 *              not let a caller choose Host.
 */

import { existsSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ServedProjectFileSystem, type ProjectFsEvent } from '../../../src/core/project-fs/index.js';
import { startDesignServer, type DesignServer, type DesignServerOptions } from '../../../src/node/design/design-server.js';
import { EDITOR_WASM_JOB } from '../../../src/node/design/build/editor-wasm-build.js';
import { BuildJobFailure } from '../../../src/node/design/build-queue.js';
import { LOCK_FILE_NAME } from '../../../src/node/design/ignored-paths.js';
import { INVALID_PATHS } from '../../project-fs/contract.js';
import { createTestEventSource } from '../../project-fs/test-event-source.js';
import { MINIMAL_PROJECT, makeTempDir, removeTempDirs, writeFiles } from './temp-project.js';

let server: DesignServer | undefined;
let root = '';

// start
// A server on port 0 for a fresh project seeded with MINIMAL_PROJECT plus `extra`.
async function start(
  extra: Readonly<Record<string, string>> = {},
  options: Omit<DesignServerOptions, 'projectRoot'> = {},
): Promise<DesignServer> {
  root = makeTempDir('design-server');
  writeFiles(root, { ...MINIMAL_PROJECT, ...extra });
  server = await startDesignServer({ projectRoot: root, ...options });
  return server;
}

// api
// An authorised request to the running server.
function api(path: string, init: RequestInit = {}): Promise<Response> {
  if (server === undefined) throw new Error('no server');
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${server.token}` },
  });
}

afterEach(async () => {
  await server?.close();
  server = undefined;
});
afterAll(removeTempDirs);

/** Every route, with a method and a body where it takes one. */
const ROUTES: ReadonlyArray<{ readonly method: string; readonly path: string; readonly body?: string }> = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/api/files' },
  { method: 'GET', path: '/api/file?path=u8g2gl.xml' },
  { method: 'PUT', path: '/api/file?path=screens/screen_x.xml', body: '<screen />\n' },
  { method: 'GET', path: '/api/events' },
  { method: 'POST', path: '/api/build/editor-wasm' },
  { method: 'GET', path: '/api/build/1' },
  { method: 'GET', path: '/app/not-the-token/index.html' },
  { method: 'GET', path: '/api/editor-wasm/1/u8g2gl_editor.js' },
  { method: 'GET', path: '/no/such/route' },
];

describe('loopback only', () => {
  it('binds 127.0.0.1 and nothing else', async () => {
    const s = await start();
    expect(s.address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });
    expect(s.url).toBe(`http://127.0.0.1:${s.port}/?token=${s.token}`);
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the token, on every route', () => {
  const wrongTokens: ReadonlyArray<readonly [string, (token: string) => Record<string, string> | string]> = [
    ['no token', () => ({})],
    ['a wrong token of the right length', (t) => ({ Authorization: `Bearer ${t.slice(0, -1)}${t.endsWith('0') ? '1' : '0'}` })],
    ['a truncated token', (t) => ({ Authorization: `Bearer ${t.slice(0, 10)}` })],
    ['the token in upper case', (t) => ({ Authorization: `Bearer ${t.toUpperCase()}` })],
    ['a non-Bearer scheme', (t) => ({ Authorization: `Basic ${t}` })],
    ['a wrong query token', (t) => `token=${'0'.repeat(t.length)}`],
    ['a wrong header beside the right query token', (t) => `token=${t}|Bearer nope`],
  ];

  for (const route of ROUTES) {
    it(`refuses ${route.method} ${route.path} with 403 for every missing or wrong token`, async () => {
      const s = await start();
      for (const [label, make] of wrongTokens) {
        const made = make(s.token);
        let path = route.path;
        let headers: Record<string, string> = {};
        if (typeof made === 'string') {
          const [query, header] = made.split('|');
          path += `${path.includes('?') ? '&' : '?'}${query}`;
          if (header !== undefined) headers = { Authorization: header };
        } else {
          headers = made;
        }
        const response = await fetch(`http://127.0.0.1:${s.port}${path}`, {
          method: route.method,
          headers,
          body: route.body,
        });
        expect(response.status, label).toBe(403);
        await response.body?.cancel();
      }
      // Nothing a refused request asked for happened.
      expect(existsSync(join(root, 'screens', 'screen_x.xml'))).toBe(false);
    });
  }

  it('accepts the token as a Bearer header and as a ?token= query parameter', async () => {
    const s = await start();
    expect((await api('/api/files')).status).toBe(200);
    const page = await fetch(s.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('not built yet');
  });

  it('refuses a request whose Host is not the loopback address (DNS rebinding)', async () => {
    const s = await start();
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port: s.port, path: `/?token=${s.token}`, headers: { Host: `evil.example:${s.port}` } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});

describe('no write escapes the project', () => {
  it.each(INVALID_PATHS.map((p) => [JSON.stringify(p), p]))('refuses %s with 400 invalid-path', async (_l, path) => {
    await start();
    const response = await api(`/api/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: 'escaped\n' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid-path' });
  });

  it('refuses percent-encoded traversal, which the query decodes to ..', async () => {
    const s = await start();
    const response = await fetch(`http://127.0.0.1:${s.port}/api/file?path=..%2Foutside.xml`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${s.token}` },
      body: 'escaped\n',
    });
    expect(response.status).toBe(400);
  });

  it('refuses writes through a symlink pointing outside: a file, a directory, and a dangling link', async () => {
    const outside = makeTempDir('design-outside');
    writeFileSync(join(outside, 'secret.xml'), 'original\n');
    await start();
    symlinkSync(join(outside, 'secret.xml'), join(root, 'link.xml'));
    symlinkSync(outside, join(root, 'linkdir'));
    symlinkSync(join(outside, 'created-by-dangling.xml'), join(root, 'dangling.xml'));

    for (const path of ['link.xml', 'linkdir/new.xml', 'linkdir/deeper/new.xml', 'dangling.xml']) {
      const response = await api(`/api/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: 'escaped\n' });
      expect(response.status, path).toBe(403);
      expect(await response.json(), path).toMatchObject({ code: 'outside-project' });
    }
    expect(readFileSync(join(outside, 'secret.xml'), 'utf8')).toBe('original\n');
    expect(readdirSync(outside).sort()).toEqual(['secret.xml']);

    // And reading through one is refused too.
    expect((await api('/api/file?path=link.xml')).status).toBe(403);
  });

  it('still writes through a symlink that stays inside the project', async () => {
    await start({ 'screens/real.xml': 'old\n' });
    symlinkSync(join(root, 'screens', 'real.xml'), join(root, 'alias.xml'));
    const response = await api('/api/file?path=alias.xml', { method: 'PUT', body: 'new\n' });
    expect(response.status).toBe(200);
    expect(readFileSync(join(root, 'screens', 'real.xml'), 'utf8')).toBe('new\n');
  });

  it.each(['.git/hooks/pre-commit', 'node_modules/x/index.js', 'generated/ui.cpp', LOCK_FILE_NAME])(
    'refuses a write to %s, which is not project source',
    async (path) => {
      await start();
      const response = await api(`/api/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: 'x\n' });
      expect(response.status).toBe(403);
      expect(existsSync(join(root, ...path.split('/')))).toBe(false);
    },
  );
});

describe('files and events', () => {
  it('lists project source only — not generated/, .git/, node_modules/ or the lock', async () => {
    await start({
      'generated/ui.cpp': '// GENERATED\n',
      '.git/HEAD': 'ref: refs/heads/main\n',
      'node_modules/x/index.js': '',
      [LOCK_FILE_NAME]: '{}',
      'fonts/small.bdf': 'STARTFONT 2.1\n',
    });
    expect(await (await api('/api/files')).json()).toEqual({
      files: ['fonts/small.bdf', 'screens/screen_home.xml', 'u8g2gl.xml'],
    });
  });

  it('sends no event for generated/ or the lock file', async () => {
    const s = await start();
    const fs = new ServedProjectFileSystem({ origin: `http://127.0.0.1:${s.port}`, token: s.token, createEventSource: createTestEventSource });
    await fs.connect();
    const events: ProjectFsEvent[] = [];
    fs.watch((e) => events.push(e));
    try {
      writeFiles(root, { 'generated/ui.cpp': '// x\n', [LOCK_FILE_NAME]: '{}', 'screens/screen_home.xml': '<screen name="home" v="2" />\n' });
      await waitUntil(() => events.some((e) => e.path === 'screens/screen_home.xml'), 1000);
      await new Promise((r) => setTimeout(r, 200));
      expect(events).toEqual([{ kind: 'changed', path: 'screens/screen_home.xml' }]);
    } finally {
      fs.close();
    }
  });

  it('an external write yields a changed event within 200 ms (20 runs)', async () => {
    const s = await start();
    const fs = new ServedProjectFileSystem({ origin: `http://127.0.0.1:${s.port}`, token: s.token, createEventSource: createTestEventSource });
    await fs.connect();
    const timings: number[] = [];
    try {
      for (let run = 0; run < 20; run++) {
        const arrived = new Promise<number>((resolve) => {
          const off = fs.watch((e) => {
            if (e.kind === 'changed' && e.path === 'screens/screen_home.xml') {
              off();
              resolve(performance.now());
            }
          });
        });
        const startedAt = performance.now();
        writeFileSync(join(root, 'screens', 'screen_home.xml'), `<screen name="home" run="${run}" />\n`);
        const elapsed = (await Promise.race([arrived, new Promise<number>((r) => setTimeout(() => r(Infinity), 1000))])) - startedAt;
        timings.push(elapsed);
      }
    } finally {
      fs.close();
    }
    const max = Math.max(...timings);
    console.info(`external-write timings (ms): ${timings.map((t) => t.toFixed(1)).join(', ')} — max ${max.toFixed(1)}`);
    expect(max).toBeLessThan(200);
  });

  it('closes promptly with an event stream still open', async () => {
    const s = await start();
    const fs = new ServedProjectFileSystem({ origin: `http://127.0.0.1:${s.port}`, token: s.token, createEventSource: createTestEventSource });
    await fs.connect();
    const startedAt = performance.now();
    await s.close();
    server = undefined;
    expect(performance.now() - startedAt).toBeLessThan(1000);
    fs.close();
  });
});

describe('malformed percent-encodings', () => {
  it.each([
    ['GET', '/api/file?path=%zz'],
    ['GET', '/api/file?path=screens%2F%E0%A4'],
    ['PUT', '/api/file?path=%'],
    ['POST', '/api/build/%zz'],
    ['GET', '/api/build/%E0%A4'],
  ])('answers %s %s with 400 invalid-path, not 500', async (method, path) => {
    await start();
    const response = await api(path, { method, body: method === 'GET' ? undefined : 'x' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid-path' });
  });

  it('still decodes a well-formed path, with + as a space', async () => {
    await start({ 'screens/a b.xml': '<screen />\n' });
    expect((await api('/api/file?path=screens%2Fa+b.xml')).status).toBe(200);
    expect((await api('/api/file?path=screens/a%20b.xml')).status).toBe(200);
  });
});

describe('the build routes', () => {
  it('has no jobs registered: posting one is 404', async () => {
    await start();
    const response = await api('/api/build/editor-wasm', { method: 'POST' });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'unknown-job' });
    expect((await api('/api/build/1')).status).toBe(404);
  });

  it('queues a registered job and serves its record until it finishes', async () => {
    const s = await start();
    s.builds.register('echo', async ({ params, projectRoot }) => ({ params, projectRoot }));
    s.builds.register('boom', async () => {
      throw new Error('toolchain missing');
    });

    const posted = await api('/api/build/echo', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(posted.status).toBe(202);
    const record = (await posted.json()) as { id: string; status: string };
    expect(record).toMatchObject({ job: 'echo', status: 'queued' });
    const failed = (await (await api('/api/build/boom', { method: 'POST' })).json()) as { id: string };

    await s.builds.idle();
    expect(await (await api(`/api/build/${record.id}`)).json()).toEqual({
      id: record.id,
      job: 'echo',
      status: 'succeeded',
      result: { params: { a: 1 }, projectRoot: root },
    });
    expect(await (await api(`/api/build/${failed.id}`)).json()).toMatchObject({ status: 'failed', error: 'toolchain missing' });
  });

  it("serves a coded failure's code beside its message", async () => {
    const s = await start();
    s.builds.register('coded', async () => {
      throw new BuildJobFailure('no-emscripten', 'no Emscripten 5.0.3');
    });
    const failed = (await (await api('/api/build/coded', { method: 'POST' })).json()) as { id: string };
    await s.builds.idle();
    expect(await (await api(`/api/build/${failed.id}`)).json()).toEqual({
      id: failed.id,
      job: 'coded',
      status: 'failed',
      error: 'no Emscripten 5.0.3',
      code: 'no-emscripten',
    });
  });

  it('refuses build parameters that are not JSON', async () => {
    const s = await start();
    s.builds.register('echo', async () => null);
    expect((await api('/api/build/echo', { method: 'POST', body: '{nope' })).status).toBe(400);
  });
});

describe('the designer route', () => {
  // designer
  // A stand-in designer build: an index page, a script, and a symlink that
  // points out of it at a project file.
  function designer(): string {
    const dir = makeTempDir('designer-dist');
    writeFiles(dir, { 'index.html': '<!doctype html><title>designer</title>\n', 'assets/main.js': 'export {};\n' });
    return dir;
  }

  it('redirects / to the token-carrying app path, and serves the app from it', async () => {
    const dist = designer();
    const s = await start({}, { designerRoot: dist });
    const page = await fetch(s.url, { redirect: 'manual' });
    expect(page.status).toBe(302);
    expect(page.headers.get('location')).toBe(`/app/${s.token}/`);

    const index = await fetch(`http://127.0.0.1:${s.port}/app/${s.token}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(index.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await index.text()).toContain('<title>designer</title>');

    const script = await fetch(`http://127.0.0.1:${s.port}/app/${s.token}/assets/main.js`);
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await script.text()).toBe('export {};\n');
  });

  it('refuses the app path without the right token in it', async () => {
    const s = await start({}, { designerRoot: designer() });
    const base = `http://127.0.0.1:${s.port}`;
    for (const path of [`/app/${'0'.repeat(64)}/`, `/app/${s.token}`, '/app/', `/app//${s.token}/`]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(403);
      await response.body?.cancel();
    }
  });

  it('serves nothing outside the designer build: traversal, symlinks and missing files are refused', async () => {
    const dist = designer();
    const s = await start({}, { designerRoot: dist });
    symlinkSync(join(root, 'u8g2gl.xml'), join(dist, 'escape.xml'));
    const app = `http://127.0.0.1:${s.port}/app/${s.token}/`;
    for (const path of ['%2e%2e/u8g2gl.xml', 'assets/%2e%2e/%2e%2e/u8g2gl.xml', 'escape.xml', 'nope.js', 'assets', '%zz']) {
      const response = await fetch(`${app}${path}`);
      // 403 where URL parsing collapses an encoded `..` and so climbs out of
      // the token's segment too; 404 where the path rule refuses it.
      expect([403, 404], path).toContain(response.status);
      expect(await response.text(), path).not.toContain('<u8g2gl');
    }
  });

  it('without a designer build, / is the placeholder page and the app path is 404', async () => {
    const s = await start();
    expect(await (await fetch(s.url)).text()).toContain('not built yet');
    expect((await fetch(`http://127.0.0.1:${s.port}/app/${s.token}/`)).status).toBe(404);
  });
});

describe('the editor Wasm route', () => {
  // wasmOutput
  // A stand-in editor Wasm build's output directory.
  function wasmOutput(): string {
    const dir = makeTempDir('editor-wasm');
    writeFiles(dir, { 'u8g2gl_editor.js': 'var createU8g2glEditor;\n', 'u8g2gl_editor.wasm': new Uint8Array([0, 0x61, 0x73, 0x6d]) });
    return dir;
  }

  it("serves a succeeded editor-wasm build's loader and module, by build id", async () => {
    const s = await start();
    const wasmDir = wasmOutput();
    s.builds.register(EDITOR_WASM_JOB, async () => ({ status: 'built', wasmDir }));
    const record = (await (await api(`/api/build/${EDITOR_WASM_JOB}`, { method: 'POST' })).json()) as { id: string };
    await s.builds.idle();

    const loader = await api(`/api/editor-wasm/${record.id}/u8g2gl_editor.js`);
    expect(loader.status).toBe(200);
    expect(loader.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await loader.text()).toBe('var createU8g2glEditor;\n');

    // A <script> tag cannot send a header, so the query token is accepted too.
    const module = await fetch(`http://127.0.0.1:${s.port}/api/editor-wasm/${record.id}/u8g2gl_editor.wasm?token=${s.token}`);
    expect(module.headers.get('content-type')).toBe('application/wasm');
    expect(new Uint8Array(await module.arrayBuffer())).toEqual(new Uint8Array([0, 0x61, 0x73, 0x6d]));
  });

  it('serves nothing for another job, a failed or unknown build, or a file it did not write', async () => {
    const s = await start();
    const wasmDir = wasmOutput();
    writeFiles(wasmDir, { 'build-hash.txt': 'abc\n' });
    s.builds.register('other', async () => ({ wasmDir }));
    const other = (await (await api('/api/build/other', { method: 'POST' })).json()) as { id: string };
    let fail = false;
    s.builds.register(EDITOR_WASM_JOB, async () => {
      if (fail) throw new Error('no Emscripten');
      return { wasmDir };
    });
    const good = (await (await api(`/api/build/${EDITOR_WASM_JOB}`, { method: 'POST' })).json()) as { id: string };
    await s.builds.idle();
    fail = true;
    const failed = (await (await api(`/api/build/${EDITOR_WASM_JOB}`, { method: 'POST' })).json()) as { id: string };
    await s.builds.idle();

    for (const path of [
      `/api/editor-wasm/${other.id}/u8g2gl_editor.js`,
      `/api/editor-wasm/${failed.id}/u8g2gl_editor.js`,
      '/api/editor-wasm/999/u8g2gl_editor.js',
      `/api/editor-wasm/${good.id}/build-hash.txt`,
      `/api/editor-wasm/${good.id}/%2e%2e/u8g2gl_editor.js`,
      `/api/editor-wasm/${good.id}/u8g2gl_editor.js/x`,
      `/api/editor-wasm/${good.id}`,
    ]) {
      const response = await api(path);
      expect(response.status, path).toBe(404);
      await response.body?.cancel();
    }
    expect((await api(`/api/editor-wasm/${good.id}/u8g2gl_editor.wasm`)).status).toBe(200);
  });
});

describe('startDesignServer()', () => {
  it('fails, leaving nothing running, when the port is taken', async () => {
    const s = await start();
    const other = makeTempDir('design-server-busy');
    await expect(startDesignServer({ projectRoot: other, port: s.port })).rejects.toThrow(/EADDRINUSE/);
  });
});

// waitUntil
// Polls a condition every 10 ms; rejects after `timeoutMs`.
async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}
