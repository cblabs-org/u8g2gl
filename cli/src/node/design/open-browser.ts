/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/open-browser.ts
 * Purpose: Opens the editor URL in the user's default browser, which is what
 *          `u8g2gl design` does unless `--no-open` is given. Kept apart from the
 *          command so that nothing else — and no test — can reach it by
 *          accident: every test passes `--no-open`.
 * Description: The platform's own opener (`open`, `cmd /c start`, `xdg-open`),
 *              detached, with failure ignored: the URL has already been
 *              printed, so a missing opener costs a click, not the session.
 *
 * Exports:
 * - openBrowser():  Open a URL; never throws
 */

import { spawn } from 'node:child_process';

/**
 * @brief Opens a URL in the default browser, without waiting and without throwing.
 *
 * @param url The URL to open. Must not contain shell metacharacters — the
 *            design URL is an address, a port and a hex token.
 */
export function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // No opener: the URL is on the terminal.
  }
}
