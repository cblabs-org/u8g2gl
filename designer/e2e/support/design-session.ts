/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/support/design-session.ts
 * Purpose: Each end-to-end test drives the real thing: the built CLI's
 *          `u8g2gl design`, on a temporary copy of the departures project,
 *          serving the built designer, in a real browser. This module starts
 *          and stops that, so no test can leave a server running or touch the
 *          fixture itself.
 * Description: `startDesign` copies the project to the worktree's `tmp/e2e/`,
 *              optionally adjusts files, and spawns the CLI with `--no-open`
 *              (never a window on the desktop) and port 0. The child gets its
 *              own HOME, so the toolchain cache, the editor build cache and the
 *              lock never touch the user's, and — unless the test asks for the
 *              toolchain — a PATH with no Emscripten on it, which is the
 *              "no toolchain" state of E1 e8. `stop` sends SIGINT and waits for
 *              the exit, which removes the lock.
 *
 * Exports:
 * - REPO, PROJECT_FIXTURE:   Where things are
 * - DesignSession:           A running server and its project copy
 * - startDesign():           Start one
 * - emscriptenOnPath():      Whether the runner's PATH has Emscripten 5.0.3
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** The departures project the acceptance criteria name. */
export const PROJECT_FIXTURE = join(REPO, 'cli', 'test', 'fixtures', 'departures-project');
/** The built CLI. */
const CLI = join(REPO, 'cli', 'dist', 'node', 'cli.js');
/** Scratch, inside the worktree and git-ignored. */
const SCRATCH = join(REPO, 'tmp', 'e2e');

/** A running `u8g2gl design` and the project copy it serves. */
export interface DesignSession {
  /** The URL the CLI printed, token included. */
  readonly url: string;
  /** The project copy's directory. */
  readonly project: string;
  /** A project file's absolute path. */
  file(path: string): string;
  /** A project file's text. */
  read(path: string): string;
  /** Writes a project file, as an IDE beside the designer would. */
  write(path: string, text: string): void;
  /** Stops the server and deletes the copy. */
  stop(): Promise<void>;
}

/** Options for {@link startDesign}. */
export interface StartOptions {
  /** Files to write into the copy before the server starts, by project path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Whether the server may find Emscripten (on the runner's PATH). */
  readonly toolchain?: boolean;
}

/**
 * @brief Starts `u8g2gl design` on a fresh copy of the departures project.
 *
 * @throws Error if the CLI or designer is not built, or the server does not start.
 */
export async function startDesign(options: StartOptions = {}): Promise<DesignSession> {
  // --- Step 1: The built pieces must exist; say how to make them if not ---
  for (const [what, path] of [
    ['the CLI (cd cli && npm run build)', CLI],
    ['the designer (cd designer && npm run build)', join(REPO, 'designer', 'dist', 'index.html')],
  ] as const) {
    if (!existsSync(path)) throw new Error(`Build ${what} before the end-to-end tests: ${path} is missing.`);
  }

  // --- Step 2: A project copy and a home of its own ---
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, 'session-'));
  const project = join(root, 'project');
  const home = join(root, 'home');
  cpSync(PROJECT_FIXTURE, project, { recursive: true });
  // The fixture keeps its generated output for other tests; a designer session
  // on a real project has none of the editor's, so drop it from the copy.
  rmSync(join(project, 'generated_editor'), { recursive: true, force: true });
  mkdirSync(home);
  for (const [path, text] of Object.entries(options.files ?? {})) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), text);
  }

  // --- Step 3: The server, with or without a toolchain in reach ---
  const path = options.toolchain === true ? (process.env.PATH ?? '') : withoutEmscripten(process.env.PATH ?? '');
  const child = spawn(process.execPath, [CLI, 'design', project, '--no-open', '--json', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...withoutEmsdkVariables(process.env), PATH: path, HOME: home, XDG_CACHE_HOME: join(home, '.cache') },
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
  const url = await firstUrl(child, () => stderr);

  return {
    url,
    project,
    file: (p) => join(project, ...p.split('/')),
    read: (p) => readFileSync(join(project, ...p.split('/')), 'utf8'),
    write: (p, text) => writeFileSync(join(project, ...p.split('/')), text),
    stop: async () => {
      await stopChild(child);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** @brief Whether Emscripten 5.0.3 is on the runner's PATH, so a project build can run. */
export function emscriptenOnPath(): boolean {
  const result = spawnSync('em++', ['--version'], { encoding: 'utf8' });
  return result.status === 0 && /\b5\.0\.3\b/.test(result.stdout);
}

// withoutEmscripten
// PATH with every directory that holds an em++ removed.
function withoutEmscripten(path: string): string {
  return path
    .split(delimiter)
    .filter((dir) => dir !== '' && !existsSync(join(dir, 'em++')) && !/emsdk/.test(dir))
    .join(delimiter);
}

// withoutEmsdkVariables
// The environment without what emsdk_env.sh exports, so a "no toolchain"
// server cannot find one through them either.
function withoutEmsdkVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env };
  for (const name of ['EMSDK', 'EMSDK_NODE', 'EMSDK_PYTHON', 'EM_CONFIG', 'EM_CACHE', 'EMSDK_QUIET']) delete copy[name];
  return copy;
}

// firstUrl
// The URL from the CLI's one line of JSON; rejects if it exits or takes over 20 s.
function firstUrl(child: ChildProcess, stderr: () => string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`u8g2gl design did not start: ${stderr()}`)), 20_000);
    child.stdout?.on('data', (chunk) => {
      out += String(chunk);
      const line = out.split('\n')[0];
      if (out.includes('\n') && line !== undefined) {
        clearTimeout(timer);
        try {
          resolve((JSON.parse(line) as { url: string }).url);
        } catch {
          reject(new Error(`u8g2gl design printed '${line}'`));
        }
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`u8g2gl design exited ${code}: ${stderr()}`));
    });
  });
}

// stopChild
// SIGINT, then SIGKILL if it has not exited within 5 s.
async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGINT');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
}
