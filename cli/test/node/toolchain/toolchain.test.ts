/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/toolchain/toolchain.test.ts
 * Purpose: The managed toolchain's contract, entirely against a fake host:
 *          which Emscripten is used and why, that installing asks first, pins
 *          by commit and cleans up after itself, and that an emsdk the user
 *          installed is never touched. Nothing here can reach the network or
 *          the real cache directory.
 * Description: Each test builds a fake PATH and cache root in temp directories
 *              under tmp/ and drives detection, installation or the command.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectToolchain, parseEmscriptenVersion } from '../../../src/node/toolchain/detect-toolchain.js';
import { installToolchain } from '../../../src/node/toolchain/install-toolchain.js';
import { parseToolchainArgs, runToolchainCommand } from '../../../src/node/toolchain/toolchain-command.js';
import {
  EMSCRIPTEN_VERSION,
  EMSDK_COMMIT,
  INSTALL_MARKER,
  managedLayout,
  toolchainCacheRoot,
  USER_EMSDK_VARIABLES,
} from '../../../src/node/toolchain/toolchain-paths.js';
import { makeTempDir, removeTempDirs } from '../design/temp-project.js';
import { fakeEmscripten, fakeHost } from './fake-host.js';

afterEach(removeTempDirs);

// snapshot
// Every file under a directory with its size and mtime, to prove nothing changed.
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        out.push(`${full} ${stat.size} ${stat.mtimeMs} ${readFileSync(full, 'utf8')}`);
      }
    }
  };
  walk(dir);
  return out;
}

const quietIo = (answer = true) => {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  return {
    out,
    err,
    asked,
    io: {
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
      confirm: async (question: string) => {
        asked.push(question);
        return answer;
      },
    },
  };
};

describe('toolchainCacheRoot', () => {
  it('uses each platform\'s user cache directory', () => {
    expect(toolchainCacheRoot('darwin', {}, '/Users/a')).toBe('/Users/a/Library/Caches/u8g2gl');
    expect(toolchainCacheRoot('linux', {}, '/home/a')).toBe('/home/a/.cache/u8g2gl');
    expect(toolchainCacheRoot('linux', { XDG_CACHE_HOME: '/xdg' }, '/home/a')).toBe('/xdg/u8g2gl');
    expect(toolchainCacheRoot('linux', { XDG_CACHE_HOME: 'relative' }, '/home/a')).toBe('/home/a/.cache/u8g2gl');
    expect(toolchainCacheRoot('win32', { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'C:\\Users\\a')).toBe(
      'C:\\Users\\a\\AppData\\Local\\u8g2gl',
    );
  });
});

describe('parseEmscriptenVersion', () => {
  it('reads the version file and the --version banner', () => {
    expect(parseEmscriptenVersion('"5.0.3"\n')).toBe('5.0.3');
    expect(
      parseEmscriptenVersion(
        'emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 5.0.3 (285c424dfa9e83b03cf8490c65ceadb7c45f28eb)\nclang\n',
      ),
    ).toBe('5.0.3');
    expect(parseEmscriptenVersion('no version here')).toBeUndefined();
  });
});

describe('detectToolchain', () => {
  it('uses an em++ on PATH at exactly the pinned version', async () => {
    const dir = fakeEmscripten(join(makeTempDir('tc-path'), 'emscripten'), EMSCRIPTEN_VERSION);
    const { host, runs } = fakeHost({ path: `/nowhere:${dir}` });
    const status = await detectToolchain(host, makeTempDir('tc-cache'));
    expect(status.selected).toMatchObject({ source: 'path', version: EMSCRIPTEN_VERSION, emxx: join(dir, 'em++') });
    expect(status.selected?.emcc).toBe(join(dir, 'emcc'));
    expect(status.notes).toEqual([]);
    expect(runs).toEqual([]);
  });

  it('reports an em++ on PATH at 4.0.6 and does not use it', async () => {
    const dir = fakeEmscripten(join(makeTempDir('tc-old'), 'emscripten'), '4.0.6');
    const { host } = fakeHost({ path: dir });
    const status = await detectToolchain(host, makeTempDir('tc-cache'));
    expect(status.selected).toBeUndefined();
    expect(status.onPath).toEqual({ emxx: join(dir, 'em++'), version: '4.0.6' });
    expect(status.notes.join('\n')).toMatch(/is 4\.0\.6, not 5\.0\.3; it is not used/);
  });

  it('only looks at the first em++ on PATH, as a shell would', async () => {
    const old = fakeEmscripten(join(makeTempDir('tc-first'), 'emscripten'), '4.0.6');
    const pinned = fakeEmscripten(join(makeTempDir('tc-second'), 'emscripten'), EMSCRIPTEN_VERSION);
    const { host } = fakeHost({ path: `${old}:${pinned}` });
    const status = await detectToolchain(host, makeTempDir('tc-cache'));
    expect(status.selected).toBeUndefined();
    expect(status.onPath?.version).toBe('4.0.6');
  });

  it('falls back to em++ --version when there is no version file', async () => {
    const dir = fakeEmscripten(join(makeTempDir('tc-nofile'), 'emscripten'), undefined);
    const { host, runs } = fakeHost({ path: dir, versionOutput: 'emcc (Emscripten) 5.0.3 (abc)\n' });
    const status = await detectToolchain(host, makeTempDir('tc-cache'));
    expect(status.selected?.source).toBe('path');
    expect(runs.map((run) => run.args)).toEqual([['--version']]);
  });

  it('uses the managed install once its marker exists, with an environment naming it', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    fakeEmscripten(layout.emscriptenDir, EMSCRIPTEN_VERSION);
    const { host } = fakeHost({ path: '/usr/bin', env: { EMSDK: '/user/emsdk', EM_CONFIG: '/user/emsdk/.emscripten' } });

    const unmarked = await detectToolchain(host, cache);
    expect(unmarked.selected).toBeUndefined();
    expect(unmarked.managed.incomplete).toBe(true);

    host.writeText(layout.marker, '{}\n');
    const marked = await detectToolchain(host, cache);
    expect(marked.selected).toMatchObject({ source: 'managed', emxx: layout.emxx, envScript: layout.envScript });
    expect(marked.selected?.env.EMSDK).toBe(layout.root);
    expect(marked.selected?.env.EM_CONFIG).toBeUndefined();
    expect(marked.selected?.env.PATH).toBe(`${layout.root}:${layout.emscriptenDir}:/usr/bin`);
  });

  it('prefers PATH at the pinned version over the managed install', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    fakeEmscripten(layout.emscriptenDir, EMSCRIPTEN_VERSION);
    const dir = fakeEmscripten(join(makeTempDir('tc-path'), 'emscripten'), EMSCRIPTEN_VERSION);
    const { host } = fakeHost({ path: dir });
    host.writeText(layout.marker, '{}\n');
    expect((await detectToolchain(host, cache)).selected?.source).toBe('path');
  });
});

describe('the user emsdk variables', () => {
  // Every variable a user's emsdk exports, set to point at that installation.
  const userEnv = Object.fromEntries(USER_EMSDK_VARIABLES.map(({ name }) => [name, `/user/emsdk/${name}`]));

  it('names EMSDK, EM_CONFIG, EMSDK_NODE, EMSDK_PYTHON and EM_CACHE, each with a reason', () => {
    expect(USER_EMSDK_VARIABLES.map(({ name }) => name)).toEqual(['EMSDK', 'EM_CONFIG', 'EMSDK_NODE', 'EMSDK_PYTHON', 'EM_CACHE']);
    for (const { reason } of USER_EMSDK_VARIABLES) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it('are all absent from a managed build\'s environment, EMSDK then naming the managed checkout', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    fakeEmscripten(layout.emscriptenDir, EMSCRIPTEN_VERSION);
    const { host } = fakeHost({ path: '/usr/bin', env: userEnv });
    host.writeText(layout.marker, '{}\n');
    const env = (await detectToolchain(host, cache)).selected?.env ?? {};
    for (const { name } of USER_EMSDK_VARIABLES) {
      expect(env[name], name).toBe(name === 'EMSDK' ? layout.root : undefined);
    }
  });

  it('are all absent from every process the installer runs', async () => {
    const { host, runs } = fakeHost({ path: '/usr/bin', env: userEnv });
    await installToolchain(host, { cacheRoot: makeTempDir('tc-cache'), assumeYes: true, confirm: async () => true, log: () => undefined });
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      for (const { name } of USER_EMSDK_VARIABLES) {
        expect(run.env?.[name], `${run.command} ${name}`).toBeUndefined();
      }
    }
  });
});

describe('installToolchain', () => {
  it('does nothing at all when consent is refused', async () => {
    const cache = join(makeTempDir('tc-cache'), 'u8g2gl');
    const { host, runs } = fakeHost({ path: '' });
    const asked: string[] = [];
    const outcome = await installToolchain(host, {
      cacheRoot: cache,
      assumeYes: false,
      confirm: async (question) => {
        asked.push(question);
        return false;
      },
      log: () => undefined,
    });
    expect(outcome).toEqual({ kind: 'declined' });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/Emscripten 5\.0\.3 \(about 1\.3 GB installed, about 2 GB once in use\)/);
    expect(runs).toEqual([]);
    expect(host.exists(cache)).toBe(false);
  });

  it('clones at the pinned tag, checks the commit, installs, activates and marks complete', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    const { host, runs } = fakeHost({ path: '/usr/bin', env: { EMSDK: '/user/emsdk', EM_CONFIG: '/user/.emscripten' } });
    const outcome = await installToolchain(host, { cacheRoot: cache, assumeYes: true, confirm: async () => false, log: () => undefined });

    expect(outcome.kind).toBe('installed');
    expect(runs.map((run) => [run.command, ...run.args])).toEqual([
      ['git', '-c', 'advice.detachedHead=false', 'clone', '--depth', '1', '--branch', '5.0.3',
        'https://github.com/emscripten-core/emsdk.git', layout.root],
      ['git', '-C', layout.root, 'rev-parse', 'HEAD'],
      [layout.emsdk, 'install', '5.0.3'],
      [layout.emsdk, 'activate', '5.0.3'],
    ]);
    // The user's emsdk variables are not passed to git or emsdk.
    for (const run of runs) {
      expect(run.env?.EMSDK).toBeUndefined();
      expect(run.env?.EM_CONFIG).toBeUndefined();
    }
    expect(JSON.parse(host.readText(join(layout.root, INSTALL_MARKER)) ?? '')).toEqual({
      version: EMSCRIPTEN_VERSION,
      commit: EMSDK_COMMIT,
    });
    expect((await detectToolchain(host, cache)).selected?.source).toBe('managed');
  });

  it('aborts and removes the checkout when the tag resolves to another commit', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    const { host, runs } = fakeHost({ cloneCommit: '0000000000000000000000000000000000000000' });
    const outcome = await installToolchain(host, { cacheRoot: cache, assumeYes: true, confirm: async () => true, log: () => undefined });
    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' && outcome.message).toMatch(/resolved to 0{40}, not the pinned a620cf1d/);
    expect(host.exists(layout.root)).toBe(false);
    expect(runs.some((run) => run.command === layout.emsdk)).toBe(false);
  });

  it.each(['clone', 'install', 'activate'] as const)('cleans up when %s fails', async (failStep) => {
    const cache = makeTempDir('tc-cache');
    const { host } = fakeHost({ failStep });
    const outcome = await installToolchain(host, { cacheRoot: cache, assumeYes: true, confirm: async () => true, log: () => undefined });
    expect(outcome.kind).toBe('failed');
    expect(host.exists(managedLayout(cache, 'darwin').root)).toBe(false);
  });

  it('replaces an interrupted install of its own', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    fakeEmscripten(layout.emscriptenDir, EMSCRIPTEN_VERSION); // no marker: interrupted
    const { host } = fakeHost();
    const outcome = await installToolchain(host, { cacheRoot: cache, assumeYes: true, confirm: async () => true, log: () => undefined });
    expect(outcome.kind).toBe('installed');
  });

  it('never modifies an emsdk the user installed, on PATH or named by EMSDK', async () => {
    const userEmsdk = makeTempDir('tc-user-emsdk');
    const userEmscripten = fakeEmscripten(join(userEmsdk, 'upstream', 'emscripten'), '4.0.6');
    writeFileSync(join(userEmsdk, '.emscripten'), 'user config\n');
    const before = snapshot(userEmsdk);
    const cache = makeTempDir('tc-cache');
    const { host, runs } = fakeHost({ path: `${userEmsdk}:${userEmscripten}`, env: { EMSDK: userEmsdk } });
    const outcome = await installToolchain(host, { cacheRoot: cache, assumeYes: true, confirm: async () => true, log: () => undefined });

    expect(outcome.kind).toBe('installed');
    expect(snapshot(userEmsdk)).toEqual(before);
    for (const run of runs) {
      expect([run.command, ...run.args, run.cwd ?? ''].some((part) => part.startsWith(userEmsdk))).toBe(false);
    }
  });

  it('installs nothing when PATH already has the pinned version', async () => {
    const dir = fakeEmscripten(join(makeTempDir('tc-path'), 'emscripten'), EMSCRIPTEN_VERSION);
    const cache = join(makeTempDir('tc-cache'), 'u8g2gl');
    const { host, runs } = fakeHost({ path: dir });
    const outcome = await installToolchain(host, { cacheRoot: cache, assumeYes: true, confirm: async () => true, log: () => undefined });
    expect(outcome.kind).toBe('already');
    expect(runs).toEqual([]);
    expect(host.exists(cache)).toBe(false);
  });
});

describe('toolchain command', () => {
  it('parses its verbs and refuses anything else', () => {
    expect(parseToolchainArgs(['status'])).toEqual({ verb: 'status', yes: false });
    expect(parseToolchainArgs(['install', '--yes'])).toEqual({ verb: 'install', yes: true });
    expect(parseToolchainArgs([])).toHaveProperty('error');
    expect(parseToolchainArgs(['frobnicate'])).toHaveProperty('error');
    expect(parseToolchainArgs(['status', '--yes'])).toHaveProperty('error');
    expect(parseToolchainArgs(['install', '--force'])).toHaveProperty('error');
  });

  it('status says what is used and why the PATH one is not', async () => {
    const dir = fakeEmscripten(join(makeTempDir('tc-old'), 'emscripten'), '4.0.6');
    const { host } = fakeHost({ path: dir });
    const { out, io } = quietIo();
    const code = await runToolchainCommand({ verb: 'status', yes: false }, false, host, makeTempDir('tc-cache'), io);
    expect(code).toBe(1);
    expect(out[0]).toMatch(/none available/);
    expect(out.join('\n')).toMatch(/4\.0\.6, not 5\.0\.3/);
  });

  it('path prints em++ for PATH, and JSON under --json', async () => {
    const dir = fakeEmscripten(join(makeTempDir('tc-path'), 'emscripten'), EMSCRIPTEN_VERSION);
    const { host } = fakeHost({ path: dir });
    const human = quietIo();
    expect(await runToolchainCommand({ verb: 'path', yes: false }, false, host, makeTempDir('tc-cache'), human.io)).toBe(0);
    expect(human.out).toEqual([join(dir, 'em++')]);
    const json = quietIo();
    await runToolchainCommand({ verb: 'path', yes: false }, true, host, makeTempDir('tc-cache'), json.io);
    expect(JSON.parse(json.out[0] ?? '')).toEqual({ source: 'path', version: '5.0.3', emxx: join(dir, 'em++') });
  });

  it('path prints the env script for the managed install', async () => {
    const cache = makeTempDir('tc-cache');
    const layout = managedLayout(cache, 'darwin');
    fakeEmscripten(layout.emscriptenDir, EMSCRIPTEN_VERSION);
    const { host } = fakeHost();
    host.writeText(layout.marker, '{}\n');
    const { out, io } = quietIo();
    await runToolchainCommand({ verb: 'path', yes: false }, false, host, cache, io);
    expect(out).toEqual([layout.envScript]);
  });

  it('install asks, and declining exits 1 having run nothing', async () => {
    const { host, runs } = fakeHost();
    const { asked, err, io } = quietIo(false);
    const code = await runToolchainCommand({ verb: 'install', yes: false }, false, host, makeTempDir('tc-cache'), io);
    expect(code).toBe(1);
    expect(asked).toHaveLength(1);
    expect(err).toEqual(['Nothing installed.']);
    expect(runs).toEqual([]);
  });
});
