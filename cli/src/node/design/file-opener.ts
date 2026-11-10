/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/file-opener.ts
 * Purpose: The one place the design server starts another program on the
 *          author's behalf: their editor, for "Open in editor", and the file
 *          manager, for "Reveal". The designer does not edit C++ (ui_spec §14),
 *          so handing a widget's source to the author's own editor is how it
 *          gets edited. Kept apart from the server so the server's routes can
 *          be tested with a fake that records what would have been started,
 *          and so no test can open a window on the desktop by accident.
 * Description: The editor command (`--editor`, else `U8G2GL_EDITOR`) is split
 *              into a program and its arguments **once, at start-up**, by
 *              `parseEditorCommand()`; nothing from a request ever becomes a
 *              program or an option. A request contributes one absolute path,
 *              already validated by the server, and at most a line number.
 *              Every program is started with `spawn` and an argument array —
 *              never a shell — detached, its output ignored.
 *
 * Exports:
 * - EditorCommand:          A program and its leading arguments
 * - parseEditorCommand():   Split an editor command line, once
 * - SpawnProgram:           Starts a program; resolves once it has started
 * - FileOpenerOptions:      A FileOpener's editor, platform and spawner
 * - spawnDetached():        The real SpawnProgram
 * - Launch:                 One program start: the command and its arguments
 * - FileOpener:             Opens and reveals files
 *
 *     - openArgs():         What "Open in editor" starts, for a path and line
 *     - revealArgs():       What "Reveal" starts, for a path
 *     - open():             Start the editor on a file
 *     - reveal():           Show a file in the file manager
 */

import { spawn } from 'node:child_process';
import { basename, dirname } from 'node:path';

/** A program and the arguments that come before the file. */
export interface EditorCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** One program start. */
export interface Launch {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Starts a program with an argument array and no shell. Resolves once the
 * program has started, and rejects if it could not be (no such program).
 */
export type SpawnProgram = (command: string, args: readonly string[]) => Promise<void>;

/** Editors that take `-g path:line` to open a file at a line. */
const GOTO_EDITORS: readonly string[] = ['code', 'code-insiders', 'cursor'];

/**
 * @brief Splits an editor command line into a program and its arguments.
 *
 * Whitespace separates words; a word may be quoted with `"` or `'` to keep
 * spaces (`"/Applications/My Editor.app/x" --wait`). No other shell syntax is
 * recognised — no variables, globs or escapes — because the result is passed
 * to `spawn` as an array and never to a shell.
 *
 * @param text The command line, from `--editor` or `U8G2GL_EDITOR`.
 * @return The command, undefined for a blank line (no editor configured), or
 *         `{ error }` for an unterminated quote.
 */
export function parseEditorCommand(text: string): EditorCommand | undefined | { readonly error: string } {
  const words: string[] = [];
  let word: string | undefined;
  let quote: string | undefined;
  for (const char of text) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (/\s/.test(char)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else {
      word = (word ?? '') + char;
    }
  }
  if (quote !== undefined) {
    return { error: `the editor command has an unterminated ${quote} quote` };
  }
  if (word !== undefined) words.push(word);
  const [command, ...args] = words;
  return command === undefined ? undefined : { command, args };
}

/**
 * @brief The real {@link SpawnProgram}: detached, output ignored, no shell.
 *
 * Detached and unref'd so the editor outlives neither more nor less than it
 * would if the author had started it, and Ctrl-C on the server leaves it open.
 */
export const spawnDetached: SpawnProgram = (command, args) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { detached: true, stdio: 'ignore', shell: false });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
    child.once('error', reject);
  });

/** Options for a {@link FileOpener}. */
export interface FileOpenerOptions {
  /** The author's editor, parsed at start-up; the platform's opener when omitted. */
  readonly editor?: EditorCommand;
  /** The host platform, as `process.platform` names it. */
  readonly platform?: NodeJS.Platform;
  /** How programs are started; tests pass a fake. */
  readonly spawn?: SpawnProgram;
}

/** Opens files in the author's editor and reveals them in the file manager. */
export class FileOpener {
  private readonly editor: EditorCommand | undefined;
  private readonly platform: NodeJS.Platform;
  private readonly spawnProgram: SpawnProgram;

  /** @param options The editor, the platform and the spawner; each defaulted. */
  constructor(options: FileOpenerOptions = {}) {
    this.editor = options.editor;
    this.platform = options.platform ?? process.platform;
    this.spawnProgram = options.spawn ?? spawnDetached;
  }

  /**
   * @brief What "Open in editor" starts.
   *
   * A path from the server is always absolute, so it can never be read as an
   * option by the program it is handed to.
   *
   * @param absolute The file's absolute path, already validated.
   * @param line     1-based line to open at, where the editor can take one.
   */
  openArgs(absolute: string, line?: number): Launch {
    // --- Step 1: A configured editor: its own arguments, then the file ---
    if (this.editor !== undefined) {
      const { command, args } = this.editor;
      // Matched on the program's base name, so `/usr/local/bin/code` and
      // Windows' `code.cmd` both count; any other editor's line syntax is
      // unknown, so it is given the path alone rather than a guess.
      // On Windows, `spawn` with no shell cannot start a `.cmd` or `.bat`
      // file, and VS Code's `code` is one: there, `--editor` must name the
      // editor's executable (`Code.exe`), which takes the same `-g`. Starting
      // a shell to run the `.cmd` would undo the no-shell rule above.
      const name = basename(command).replace(/\.(cmd|exe)$/i, '').toLowerCase();
      const file = line !== undefined && GOTO_EDITORS.includes(name) ? ['-g', `${absolute}:${line}`] : [absolute];
      return { command, args: [...args, ...file] };
    }

    // --- Step 2: Otherwise the platform's opener: the app associated with the file ---
    // Windows uses explorer.exe rather than `cmd /c start`, which would put
    // the path through cmd's parser — a shell by another name.
    if (this.platform === 'darwin') return { command: 'open', args: [absolute] };
    if (this.platform === 'win32') return { command: 'explorer.exe', args: [absolute] };
    return { command: 'xdg-open', args: [absolute] };
  }

  /**
   * @brief What "Reveal" starts: on macOS, Finder with the file selected;
   *        elsewhere, the containing folder in the file manager.
   *
   * @param absolute The file's absolute path, already validated.
   */
  revealArgs(absolute: string): Launch {
    if (this.platform === 'darwin') return { command: 'open', args: ['-R', absolute] };
    if (this.platform === 'win32') return { command: 'explorer.exe', args: [dirname(absolute)] };
    return { command: 'xdg-open', args: [dirname(absolute)] };
  }

  /**
   * @brief Starts the editor on a file.
   *
   * @param absolute The file's absolute path, already validated by the server.
   * @param line     1-based; only `code`, `code-insiders` and `cursor` are given it.
   * @return Resolves once started; rejects if the program could not be.
   */
  open(absolute: string, line?: number): Promise<Launch> {
    return this.start(this.openArgs(absolute, line));
  }

  /**
   * @brief Shows a file in the file manager.
   *
   * @param absolute The file's absolute path, already validated by the server.
   * @return Resolves once started; rejects if the program could not be.
   */
  reveal(absolute: string): Promise<Launch> {
    return this.start(this.revealArgs(absolute));
  }

  // start
  // Starts one launch, resolving with it once the program has started.
  private async start(launch: Launch): Promise<Launch> {
    await this.spawnProgram(launch.command, launch.args);
    return launch;
  }
}
