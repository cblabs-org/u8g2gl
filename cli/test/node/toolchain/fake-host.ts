/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/toolchain/fake-host.ts
 * Purpose: A ToolchainHost for tests that can never download anything. The
 *          filesystem is real but confined to temp directories under the
 *          git-ignored tmp/; every process is faked: recorded, and answered by
 *          a script that imitates git and emsdk just far enough (a clone makes
 *          a directory, `rev-parse` reports a configurable commit, `emsdk
 *          install` lays down an em++ and its version file).
 * Description: `fakeHost()` builds the host and its command log; `fakeEmscripten()`
 *              writes a stand-in em++ with a version file into a directory, as
 *              an emsdk on PATH would have.
 *
 * Exports:
 * - RecordedRun:       One faked process
 * - FakeHostOptions:   What the fake processes do
 * - FakeHost:          The host and its log
 * - fakeHost():        Build one
 * - fakeEmscripten():  A stand-in emscripten directory with em++ at a version
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunOptions, RunResult, ToolchainHost } from '../../../src/node/toolchain/toolchain-host.js';
import { EMSDK_COMMIT } from '../../../src/node/toolchain/toolchain-paths.js';

/** One faked process. */
export interface RecordedRun {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** What the fake processes do. */
export interface FakeHostOptions {
  /** `PATH` for detection. */
  readonly path?: string;
  /** Extra environment variables. */
  readonly env?: NodeJS.ProcessEnv;
  /** The commit `git rev-parse HEAD` reports after a clone. */
  readonly cloneCommit?: string;
  /** Make this step exit 1. */
  readonly failStep?: 'clone' | 'install' | 'activate';
  /** What `em++ --version` prints, for an em++ with no version file. */
  readonly versionOutput?: string;
}

/** The host, and what it was asked to run. */
export interface FakeHost {
  readonly host: ToolchainHost;
  readonly runs: RecordedRun[];
}

/**
 * @brief A host whose processes are faked and recorded.
 */
export function fakeHost(options: FakeHostOptions = {}): FakeHost {
  const runs: RecordedRun[] = [];
  const env: NodeJS.ProcessEnv = { ...options.env, PATH: options.path ?? '' };

  const run = async (command: string, args: readonly string[], runOptions: RunOptions = {}): Promise<RunResult> => {
    runs.push({ command, args: [...args], cwd: runOptions.cwd, env: runOptions.env });
    const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
    const failed: RunResult = { code: 1, stdout: '', stderr: 'simulated failure\n' };
    if (command === 'git' && args.includes('clone')) {
      if (options.failStep === 'clone') {
        return failed;
      }
      const target = args[args.length - 1] ?? '';
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'emsdk'), '#!/bin/sh\n');
      writeFileSync(join(target, 'emsdk_env.sh'), '# env\n');
      return ok();
    }
    if (command === 'git' && args.includes('rev-parse')) {
      return ok(`${options.cloneCommit ?? EMSDK_COMMIT}\n`);
    }
    if (command.endsWith('emsdk') && (args[0] === 'install' || args[0] === 'activate')) {
      if (options.failStep === args[0]) {
        return failed;
      }
      if (args[0] === 'install') {
        fakeEmscripten(join(runOptions.cwd ?? '', 'upstream', 'emscripten'), args[1] ?? '');
      }
      return ok();
    }
    if (command.endsWith('em++') && args[0] === '--version') {
      return options.versionOutput === undefined ? failed : ok(options.versionOutput);
    }
    return { code: null, stdout: '', stderr: `fake host: unexpected command ${command}` };
  };

  const host: ToolchainHost = {
    platform: 'darwin',
    env,
    home: '/nonexistent-home',
    run,
    exists: (path) => existsSync(path),
    readText: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    writeText: (path, text) => writeFileSync(path, text),
    makeDir: (path) => mkdirSync(path, { recursive: true }),
    remove: (path) => rmSync(path, { recursive: true, force: true }),
    realPath: (path) => realpathSync(path),
  };
  return { host, runs };
}

/**
 * @brief Writes a stand-in emscripten directory: em++, emcc, and the
 *        `emscripten-version.txt` Emscripten ships (quoted, as the real one is).
 *
 * @param dir     The emscripten directory to create.
 * @param version Its version, or undefined for no version file.
 * @return `dir`.
 */
export function fakeEmscripten(dir: string, version: string | undefined): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'em++'), '#!/bin/sh\n');
  writeFileSync(join(dir, 'emcc'), '#!/bin/sh\n');
  if (version !== undefined) {
    writeFileSync(join(dir, 'emscripten-version.txt'), `"${version}"\n`);
  }
  return dir;
}
