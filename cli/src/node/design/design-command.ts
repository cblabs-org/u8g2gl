/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/design-command.ts
 * Purpose: `u8g2gl design [project-dir] [--port N] [--no-open]` — the
 *          served-first entry point to the designer. It
 *          owns everything about the server's life that the server itself
 *          should not: finding an already-running server for the project and
 *          attaching to it, the lock file, printing and opening the URL, and a
 *          clean Ctrl-C.
 * Description: `parseDesignArgs` turns the command line into options (the CLI
 *              reports its errors as usage errors). `startOrAttach` is the
 *              testable core: it either attaches to a live server named by the
 *              project's lock, or replaces a stale lock, starts a server with
 *              the `editor-wasm` build job registered and the built designer
 *              (if there is one) at `/`, and takes the lock.
 *              `runDesignCommand` wraps it with output, the browser and
 *              signal handling.
 *
 * Exports:
 * - DesignArgs:            The parsed command line
 * - parseDesignArgs():     Parse it
 * - DesignSession:         Started (with a stop function) or attached
 * - startOrAttach():       Attach to a live server or start one, taking the lock
 * - runDesignCommand():    The command: output, browser, signals
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { registerEditorWasmJob } from './build/editor-wasm-job.js';
import { startDesignServer, type DesignServer } from './design-server.js';
import { isLockLive, readLock, removeLockIfOwned, tryCreateLock, type DesignLock } from './lock-file.js';
import { openBrowser } from './open-browser.js';
import { locateDesignerDist } from './static-files.js';

/** The parsed `design` command line. */
export interface DesignArgs {
  /** The project directory, as given (relative to the working directory). */
  readonly projectDir: string;
  /** Port to bind; 0 picks a free one. */
  readonly port: number;
  /** Whether to open the browser. */
  readonly open: boolean;
}

/** What {@link startOrAttach} did. */
export type DesignSession =
  | { readonly kind: 'started'; readonly server: DesignServer; readonly stop: () => Promise<void> }
  | { readonly kind: 'attached'; readonly lock: DesignLock }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * @brief Parses the `design` subcommand's arguments (global flags already removed).
 *
 * @return The options, or `{ error }` describing the first problem.
 */
export function parseDesignArgs(args: readonly string[]): DesignArgs | { readonly error: string } {
  let projectDir: string | undefined;
  let port = 0;
  let open = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--no-open') {
      open = false;
    } else if (arg === '--port') {
      const value = args[++i];
      const parsed = value !== undefined && /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isInteger(parsed) || parsed > 65535) {
        return { error: `--port needs a port number from 0 to 65535, not '${value ?? ''}'.` };
      }
      port = parsed;
    } else if (arg.startsWith('-')) {
      return { error: `Unknown option '${arg}' for design. Options: --port <n>, --no-open.` };
    } else if (projectDir === undefined) {
      projectDir = arg;
    } else {
      return { error: `design takes one project directory; '${arg}' is a second.` };
    }
  }
  return { projectDir: projectDir ?? '.', port, open };
}

/**
 * @brief Attaches to the project's running design server, or starts one and takes the lock.
 *
 * A lock whose server is not live (dead pid, or a pid now belonging to
 * another program) is replaced.
 *
 * @param projectRoot Absolute project directory, containing u8g2gl.xml.
 * @param port        Port for a new server; 0 for any free one.
 * @return `started` with the server and a `stop` that closes it and removes
 *         the lock; `attached` with the live lock; or `failed` if another
 *         instance took the lock in the same instant and then did not answer.
 */
export async function startOrAttach(projectRoot: string, port: number): Promise<DesignSession> {
  // --- Step 1: Attach to a live server, or clear a stale lock ---
  const attached = await attachOrClear(projectRoot);
  if (attached !== undefined) {
    return { kind: 'attached', lock: attached };
  }

  // --- Step 2: Start a server with its build jobs, then take the lock exclusively ---
  // The designer is served when this CLI sits in a source tree that built it;
  // otherwise `/` is the placeholder page (static-files.ts).
  const designerRoot = locateDesignerDist();
  const server = await startDesignServer({ projectRoot, port, ...(designerRoot !== undefined ? { designerRoot } : {}) });
  registerEditorWasmJob(server.builds);
  const lock: DesignLock = { pid: process.pid, port: server.port, token: server.token, url: server.url };
  if (!tryCreateLock(projectRoot, lock)) {
    // Another instance won the race between Step 1 and here: defer to it.
    await server.close();
    const winner = await attachOrClear(projectRoot);
    return winner !== undefined
      ? { kind: 'attached', lock: winner }
      : { kind: 'failed', message: 'another u8g2gl design took the project lock and is not answering; try again' };
  }
  const stop = async (): Promise<void> => {
    await server.close();
    removeLockIfOwned(projectRoot, server.token);
  };
  return { kind: 'started', server, stop };
}

/**
 * @brief The `design` command.
 *
 * Prints the URL (or, under `--json`, one JSON line `{ url, port, pid,
 * attached }`), opens the browser unless `--no-open`, and for a started server
 * stays running until SIGINT or SIGTERM, then closes, removes the lock and
 * exits 0. Attaching exits 0 at once. A directory without u8g2gl.xml exits 1.
 *
 * @param args Parsed arguments.
 * @param json Whether `--json` was given.
 */
export async function runDesignCommand(args: DesignArgs, json: boolean): Promise<void> {
  // --- Step 1: Refuse a directory that is not a project ---
  const projectRoot = resolve(args.projectDir);
  if (!existsSync(join(projectRoot, 'u8g2gl.xml'))) {
    const message = `'${args.projectDir}' is not a U8G2GL project: it has no u8g2gl.xml.`;
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`u8g2gl design: ${message}`);
    }
    process.exit(1);
  }

  // --- Step 2: Attach to the running server, or start one ---
  const session = await startOrAttach(projectRoot, args.port);
  if (session.kind === 'failed') {
    console.error(`u8g2gl design: ${session.message}`);
    process.exit(1);
  }

  // --- Step 3: Report the URL, and open it ---
  const lock = session.kind === 'started'
    ? { url: session.server.url, port: session.server.port, pid: process.pid }
    : session.lock;
  if (json) {
    console.log(JSON.stringify({ url: lock.url, port: lock.port, pid: lock.pid, attached: session.kind === 'attached' }));
  } else if (session.kind === 'attached') {
    console.log(`u8g2gl design · already running for ${projectRoot} (pid ${lock.pid})`);
    console.log(`  → ${lock.url}`);
  } else {
    console.log(`u8g2gl design · ${projectRoot}`);
    console.log(`  → ${lock.url}`);
    console.log('  Ctrl-C to stop.');
  }
  if (args.open) {
    openBrowser(lock.url);
  }
  if (session.kind === 'attached') {
    process.exit(0);
  }

  // --- Step 4: A started server keeps the process alive; a signal ends it cleanly ---
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    session.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Last resort for an exit no signal handler saw (an uncaught error): the
  // lock must not outlive the process that wrote it.
  process.on('exit', () => removeLockIfOwned(projectRoot, session.server.token));
}

// attachOrClear
// The project's lock if its server is live; otherwise deletes the stale lock
// (if any) and returns undefined.
//   projectRoot — absolute project directory
async function attachOrClear(projectRoot: string): Promise<DesignLock | undefined> {
  const lock = readLock(projectRoot);
  if (lock !== undefined && (await isLockLive(lock))) {
    return lock;
  }
  // Token-guarded: if another instance has replaced the lock since it was
  // read, its new lock is left alone. A malformed lock reads as undefined and
  // is deleted as stale.
  removeLockIfOwned(projectRoot, lock?.token);
  return undefined;
}
