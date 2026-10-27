/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/toolchain/toolchain-host.ts
 * Purpose: Every external effect the toolchain code has — spawning a process
 *          (which is also how it reaches the network: `git clone`, `emsdk
 *          install`), touching the filesystem, reading the environment — goes
 *          through one injected interface. Installing Emscripten is a 1.6 GB
 *          download that must never happen by accident, so the code that
 *          decides *whether* and *how* to install is tested against a fake
 *          host that records commands, and only `nodeToolchainHost()` can
 *          touch the real machine.
 * Description: `ToolchainHost` is the interface; `nodeToolchainHost()` is the
 *              real implementation over `node:child_process` and `node:fs`.
 *
 * Exports:
 * - RunResult:            A finished process's exit code and output
 * - RunOptions:           Working directory and environment for one process
 * - ToolchainHost:        The injected effects
 * - nodeToolchainHost():  The real host
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

/** A finished process. `code` is null when it could not be started or was killed. */
export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** How to run one process. */
export interface RunOptions {
  readonly cwd?: string;
  /** The complete environment; the host's own when absent. */
  readonly env?: NodeJS.ProcessEnv;
  /** Show the process's output to the user as it runs (a long download). */
  readonly inherit?: boolean;
}

/**
 * The toolchain code's view of the machine.
 */
export interface ToolchainHost {
  /** `process.platform`. */
  readonly platform: NodeJS.Platform;
  /** The environment detection reads (`PATH`) and child processes start from. */
  readonly env: NodeJS.ProcessEnv;
  /** The user's home directory. */
  readonly home: string;
  /** Runs a process to completion. Never throws: a spawn failure is `code: null`. */
  run(command: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
  exists(path: string): boolean;
  /** The file's text, or undefined if it cannot be read. */
  readText(path: string): string | undefined;
  writeText(path: string, text: string): void;
  /** Creates a directory and its parents. */
  makeDir(path: string): void;
  /** Deletes a file or directory tree; absent is not an error. */
  remove(path: string): void;
  /** The path with symlinks resolved, or the path itself if that fails. */
  realPath(path: string): string;
}

/**
 * @brief The real host: this process's platform, environment and filesystem.
 */
export function nodeToolchainHost(): ToolchainHost {
  return {
    platform: process.platform,
    env: process.env,
    home: homedir(),
    run: (command, args, options = {}) =>
      new Promise<RunResult>((resolve) => {
        let stdout = '';
        let stderr = '';
        const child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env ?? process.env,
          stdio: options.inherit === true ? 'inherit' : 'pipe',
          // emsdk's Windows driver is a .bat, which only a shell can run.
          shell: process.platform === 'win32',
        });
        child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('error', (error) => resolve({ code: null, stdout, stderr: stderr + error.message }));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
      }),
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
    realPath: (path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    },
  };
}
