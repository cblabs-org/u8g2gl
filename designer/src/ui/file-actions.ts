/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/file-actions.ts
 * Purpose: What the Explorer's context menu can do with a file beyond showing
 *          it: hand it to the author's own editor, show it in the file
 *          manager, or copy its path. The designer does not edit C++
 *          (ui_spec §14), so these are how a widget's source is reached for
 *          editing. Kept out of the component so the menu's contents are a
 *          pure function of an entry, and the server calls are said once.
 * Description: "Open in editor" and "Reveal" are requests to the design
 *              server (`POST /api/open`, `POST /api/reveal`), which validates
 *              the path and starts the program; the browser cannot start one.
 *              "Copy path" needs no server. The reveal label follows the
 *              platform, which the browser and the loopback-only server share.
 *
 * Exports:
 * - isCppSource():          Whether a path is C++ source
 * - sourceTitle():          A read-only source tab's title
 * - revealLabel():          "Reveal in Finder" on macOS, "Reveal in file manager" elsewhere
 * - hostPlatform():         The browser's platform string
 * - FileActions:            The server-backed actions
 *
 *     - openInEditor():     `POST /api/open`
 *     - reveal():           `POST /api/reveal`
 *     - copyPath():         The project-relative path to the clipboard
 */

import type { DesignSession } from '../session';

/** C++ source extensions, as the Explorer's widget entries carry them. */
const CPP_EXTENSIONS: readonly string[] = ['.cpp', '.cc', '.hpp', '.h'];

/** @brief Whether a project path is C++ source, which the designer shows but never edits. */
export function isCppSource(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  return CPP_EXTENSIONS.some((extension) => name.endsWith(extension) && name.length > extension.length);
}

/** @brief A read-only source tab's title: the file's name, marked read-only. */
export function sourceTitle(path: string): string {
  return `${path.slice(path.lastIndexOf('/') + 1)} (read-only)`;
}

/**
 * @brief The reveal action's label: macOS names its file manager, other
 *        platforms do not share one name.
 *
 * @param platform The browser's platform, from {@link hostPlatform}.
 */
export function revealLabel(platform: string): string {
  return /mac/i.test(platform) ? 'Reveal in Finder' : 'Reveal in file manager';
}

/**
 * @brief The browser's platform string.
 *
 * The server binds loopback only, so the browser showing the menu runs on the
 * machine the server will start the file manager on, and its platform is the
 * server's.
 */
export function hostPlatform(): string {
  const data = (navigator as Navigator & { readonly userAgentData?: { readonly platform?: string } }).userAgentData;
  return data?.platform ?? navigator.platform;
}

/** The context menu's server-backed actions on one session. */
export class FileActions {
  private readonly session: DesignSession;
  private readonly log: (line: string) => void;

  /**
   * @param session The server and token.
   * @param log     Where a failure is reported (the Output panel).
   */
  constructor(session: DesignSession, log: (line: string) => void) {
    this.session = session;
    this.log = log;
  }

  /**
   * @brief Asks the server to open a project file in the author's editor.
   *
   * @param path Project-relative.
   * @param line 1-based, for an editor that can open at a line.
   * @return Whether the server started the editor; a refusal is logged.
   */
  openInEditor(path: string, line?: number): Promise<boolean> {
    return this.post('/api/open', line === undefined ? { path } : { path, line }, `Open in editor: ${path}`);
  }

  /**
   * @brief Asks the server to show a project file in the file manager.
   *
   * @param path Project-relative.
   * @return Whether the server started it; a refusal is logged.
   */
  reveal(path: string): Promise<boolean> {
    return this.post('/api/reveal', { path }, `Reveal: ${path}`);
  }

  /**
   * @brief Copies a project-relative path to the clipboard.
   *
   * @param path Project-relative.
   * @return Whether it was copied; the clipboard can refuse (no focus, no
   *         permission), which is logged.
   */
  async copyPath(path: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(path);
      return true;
    } catch (cause) {
      this.log(`Copy path: the clipboard refused (${cause instanceof Error ? cause.message : String(cause)})`);
      return false;
    }
  }

  // post
  // A token-carrying JSON POST; a non-2xx answer or a network failure is
  // logged with the server's own message.
  //   route — the server route
  //   body  — the JSON body
  //   what  — the action, for the log line
  private async post(route: string, body: unknown, what: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.session.origin}${route}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) return true;
      const answer = (await response.json().catch(() => ({}))) as { readonly message?: unknown };
      this.log(`${what} — ${typeof answer.message === 'string' ? answer.message : `HTTP ${response.status}`}`);
    } catch (cause) {
      this.log(`${what} — ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return false;
  }
}
