/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/session.ts
 * Purpose: Where the designer learns which server it belongs to and how to
 *          prove it is allowed to talk to it. `u8g2gl design` serves the
 *          application under `/app/<token>/`, so the page's own URL is the only
 *          place the session token lives; everything that talks to the server
 *          (the project file system, builds, the editor Wasm) is given it from
 *          here rather than reading `location` itself.
 * Description: A pure parse of a URL into the server origin and the token. It
 *              is pure so it can be tested without a browser.
 *
 * Exports:
 * - DesignSession:  The server's origin and the session token
 * - readSession():  Parse them from the page URL
 */

/** The server this page was served by, and the token it requires. */
export interface DesignSession {
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** The 64-hex-digit session token. */
  readonly token: string;
}

/** The token-carrying path the server mounts the designer under. */
const APP_PATH = /^\/app\/([0-9a-f]{64})\//;

/**
 * @brief Parses the page URL the server sent the browser to.
 *
 * @param href The page URL, `location.href` in the application.
 * @return The session, or undefined if the page was not served by `u8g2gl design`
 *         (opened from disk, say) — the caller then says so instead of failing
 *         every request with 403.
 */
export function readSession(href: string): DesignSession | undefined {
  const url = new URL(href);
  const match = APP_PATH.exec(url.pathname);
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  return { origin: url.origin, token: match[1] };
}
