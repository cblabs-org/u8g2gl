/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/toolchain/toolchain-command.ts
 * Purpose: `u8g2gl toolchain install | status | path` — the user's handle on
 *          the Emscripten the design server builds the project editor Wasm
 *          with. `status` explains which one would be used and why another is
 *          not; `path` prints what to source or run, for scripts and CI;
 *          `install` fetches the pinned one, after asking.
 * Description: `parseToolchainArgs` turns the command line into options (the
 *              CLI reports its errors as usage errors). `runToolchainCommand`
 *              detects or installs through the injected host and prints prose,
 *              or one JSON object under `--json`. It returns the exit code
 *              rather than exiting, so it can be tested.
 *
 * Exports:
 * - ToolchainVerb:            'install' | 'status' | 'path'
 * - ToolchainArgs:            The parsed command line
 * - parseToolchainArgs():     Parse it
 * - ToolchainCommandIo:       Where output and the consent question go
 * - runToolchainCommand():    Run it; resolves to the exit code
 * - terminalConfirm():        The consent question, asked on the terminal
 */

import { createInterface } from 'node:readline';
import { detectToolchain, type SelectedToolchain, type ToolchainStatus } from './detect-toolchain.js';
import { installToolchain, type InstallOutcome } from './install-toolchain.js';
import type { ToolchainHost } from './toolchain-host.js';
import { EMSCRIPTEN_VERSION } from './toolchain-paths.js';

/** The three subcommands. */
export type ToolchainVerb = 'install' | 'status' | 'path';

/** The parsed `toolchain` command line. */
export interface ToolchainArgs {
  readonly verb: ToolchainVerb;
  /** `--yes`: install without asking. */
  readonly yes: boolean;
}

/** Where the command's output and question go. */
export interface ToolchainCommandIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly confirm: (question: string) => Promise<boolean>;
}

const VERBS: readonly ToolchainVerb[] = ['install', 'status', 'path'];

/**
 * @brief Parses `toolchain`'s arguments (global flags already removed).
 *
 * @return The options, or `{ error }` describing the first problem.
 */
export function parseToolchainArgs(args: readonly string[]): ToolchainArgs | { readonly error: string } {
  let verb: ToolchainVerb | undefined;
  let yes = false;
  for (const arg of args) {
    if (arg === '--yes' || arg === '-y') {
      yes = true;
    } else if (arg.startsWith('-')) {
      return { error: `Unknown option '${arg}' for toolchain. Options: --yes (install only).` };
    } else if (verb === undefined && (VERBS as readonly string[]).includes(arg)) {
      verb = arg as ToolchainVerb;
    } else {
      return { error: `toolchain takes one of ${VERBS.join(', ')}; '${arg}' is not one.` };
    }
  }
  if (verb === undefined) {
    return { error: `toolchain needs a subcommand: ${VERBS.join(', ')}.` };
  }
  if (yes && verb !== 'install') {
    return { error: `--yes applies only to 'toolchain install'.` };
  }
  return { verb, yes };
}

/**
 * @brief Runs `toolchain status`, `path` or `install`.
 *
 * @param args      Parsed arguments.
 * @param json      Whether `--json` was given: one JSON object on `out`.
 * @param host      The machine.
 * @param cacheRoot The cache directory for the managed install.
 * @param io        Output and the consent question.
 * @return The exit code: 0 when a toolchain is usable (or was installed),
 *         1 when none is, consent was refused, or the install failed.
 */
export async function runToolchainCommand(
  args: ToolchainArgs,
  json: boolean,
  host: ToolchainHost,
  cacheRoot: string,
  io: ToolchainCommandIo,
): Promise<number> {
  // --- Step 1: install ---
  if (args.verb === 'install') {
    const outcome = await installToolchain(host, {
      cacheRoot,
      assumeYes: args.yes,
      confirm: io.confirm,
      log: json ? () => undefined : io.out,
      showProgress: !json,
    });
    if (json) {
      io.out(JSON.stringify(outcomeJson(outcome)));
    } else if (outcome.kind === 'already') {
      io.out(`Emscripten ${outcome.toolchain.version} is already available (${sourceText(outcome.toolchain)}); nothing to install.`);
    } else if (outcome.kind === 'installed') {
      io.out(`Installed Emscripten ${outcome.toolchain.version}: ${outcome.toolchain.envScript ?? outcome.toolchain.emxx}`);
    } else if (outcome.kind === 'declined') {
      io.err('Nothing installed.');
    } else {
      io.err(`u8g2gl toolchain install: ${outcome.message}`);
    }
    return outcome.kind === 'already' || outcome.kind === 'installed' ? 0 : 1;
  }

  // --- Step 2: status and path both start from detection ---
  const status = await detectToolchain(host, cacheRoot);
  const selected = status.selected;
  if (json) {
    io.out(JSON.stringify(args.verb === 'path' ? (selected === undefined ? { error: noneMessage() } : describe(selected)) : statusJson(status)));
    return selected === undefined ? 1 : 0;
  }
  if (args.verb === 'path') {
    if (selected === undefined) {
      io.err(`u8g2gl toolchain path: ${noneMessage()}`);
      return 1;
    }
    // The env script for the managed install, because its em++ needs the
    // environment emsdk sets; the driver itself for one already on PATH.
    io.out(selected.envScript ?? selected.emxx);
    return 0;
  }
  for (const line of statusLines(status)) {
    io.out(line);
  }
  return selected === undefined ? 1 : 0;
}

/**
 * @brief Asks a yes/no question on the terminal; anything but y/yes is no.
 *
 * Without a terminal there is nobody to ask, so the answer is no and the
 * caller is told to pass `--yes`.
 */
export function terminalConfirm(question: string): Promise<boolean> {
  if (process.stdin.isTTY !== true) {
    console.error(`${question}\nNo terminal to ask on; pass --yes to install without asking.`);
    return Promise.resolve(false);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^\s*y(es)?\s*$/i.test(answer));
    });
  });
}

// outcomeJson
// `install --json`'s object: the outcome, plus the toolchain or the error.
function outcomeJson(outcome: InstallOutcome): Record<string, unknown> {
  switch (outcome.kind) {
    case 'already':
    case 'installed':
      return { outcome: outcome.kind, toolchain: describe(outcome.toolchain) };
    case 'failed':
      return { outcome: 'failed', error: outcome.message };
    case 'declined':
      return { outcome: 'declined' };
  }
}

// describe
// A selected toolchain as JSON: source, version, the driver and env script.
function describe(toolchain: SelectedToolchain): Record<string, string> {
  return {
    source: toolchain.source,
    version: toolchain.version,
    emxx: toolchain.emxx,
    ...(toolchain.envScript === undefined ? {} : { envScript: toolchain.envScript }),
  };
}

// statusJson
// Everything detection found, for `status --json`.
function statusJson(status: ToolchainStatus): Record<string, unknown> {
  return {
    required: EMSCRIPTEN_VERSION,
    selected: status.selected === undefined ? null : describe(status.selected),
    path: status.onPath === undefined ? null : { emxx: status.onPath.emxx, version: status.onPath.version ?? null },
    managed: {
      root: status.managed.layout.root,
      installed: status.managed.installed,
      incomplete: status.managed.incomplete,
    },
    notes: status.notes,
  };
}

// statusLines
// The human `status` report: what is used, then each candidate's state.
function statusLines(status: ToolchainStatus): string[] {
  const lines = [
    status.selected === undefined
      ? `Emscripten ${EMSCRIPTEN_VERSION}: none available. ${noneMessage()}`
      : `Emscripten ${status.selected.version}: using ${sourceText(status.selected)}`,
    `  PATH:    ${status.onPath === undefined ? 'no em++' : `${status.onPath.emxx} (${status.onPath.version ?? 'version unknown'})`}`,
    `  managed: ${status.managed.installed ? 'installed' : status.managed.incomplete ? 'incomplete' : 'not installed'} (${status.managed.layout.root})`,
  ];
  return [...lines, ...status.notes.map((note) => `  note: ${note}`)];
}

// sourceText
// Where a selected toolchain came from, in a phrase.
function sourceText(toolchain: SelectedToolchain): string {
  return toolchain.source === 'path' ? `em++ on PATH, ${toolchain.emxx}` : `the managed install, ${toolchain.envScript ?? toolchain.emxx}`;
}

// noneMessage
// What to do when there is no usable toolchain.
function noneMessage(): string {
  return `Run 'u8g2gl toolchain install', or put Emscripten ${EMSCRIPTEN_VERSION}'s em++ on PATH.`;
}
