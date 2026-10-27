/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/session-token.ts
 * Purpose: The design server's only authentication. A loopback server is
 *          reachable from every page in every browser on the machine
 *          (EDITOR-DESIGN §2.1), so binding to 127.0.0.1 keeps other machines
 *          out but not other web pages; a random per-session token that only
 *          the URL the CLI printed carries is what keeps them out.
 * Description: 32 random bytes from `node:crypto`, as hex. A request presents it
 *              as `Authorization: Bearer <token>` or as a `?token=` query
 *              parameter — the latter for the first page load and for the
 *              event stream, since `EventSource` cannot set headers. The
 *              comparison is constant-time so response timing cannot be used
 *              to guess the token a byte at a time.
 *
 * Exports:
 * - generateSessionToken():  A fresh token
 * - presentedToken():        The token a request carries, if any
 * - tokenMatches():          Constant-time comparison
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** @brief A fresh session token: 32 random bytes as 64 lower-case hex digits. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * @brief The token a request presents: the Bearer header if there is one, else `?token=`.
 *
 * @param request The request, for its headers.
 * @param url     The request URL, already parsed, for its query.
 * @return The presented token, or undefined if neither carries one.
 */
export function presentedToken(request: IncomingMessage, url: URL): string | undefined {
  const header = request.headers.authorization;
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return match?.[1];
  }
  return url.searchParams.get('token') ?? undefined;
}

/**
 * @brief Compares a presented token with the session's in constant time.
 *
 * @param presented The token the request carried, or undefined.
 * @param expected  The session token.
 * @return True only for an exact match.
 */
export function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) {
    return false;
  }
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual requires equal lengths. The length of a wrong token leaks
  // nothing useful: every real token is 64 characters, which is public.
  return a.length === b.length && timingSafeEqual(a, b);
}
