/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/session-token.ts
 * Purpose: The design server's only authentication. A loopback server is
 *          reachable from every page in every browser on the machine,
 *          so binding to 127.0.0.1 keeps other machines
 *          out but not other web pages; a random per-session token that only
 *          the URL the CLI printed carries is what keeps them out.
 * Description: 32 random bytes from `node:crypto`, as hex. A request presents it
 *              as `Authorization: Bearer <token>`, as a `?token=` query
 *              parameter — for the first page load, the event stream (since
 *              `EventSource` cannot set headers) and a `<script>` tag — or as
 *              the first segment under `/app/`, for the designer's own files.
 *              The comparison is constant-time so response timing cannot be
 *              used to guess the token a byte at a time.
 *
 * Exports:
 * - APP_PATH_PREFIX:         Where the designer is served: `/app/<token>/`
 * - generateSessionToken():  A fresh token
 * - presentedToken():        The token a request carries, if any
 * - tokenMatches():          Constant-time comparison
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * The path the designer is served under, followed by the token and a `/`.
 *
 * The token is in the path, not the query, because the designer is a bundle of
 * modules, workers and a Wasm that load one another by **relative** URL, and a
 * relative URL keeps the path but drops the query. Under `/app/<token>/` every
 * file the bundle fetches carries the token without the bundle knowing it.
 */
export const APP_PATH_PREFIX = '/app/';

/** @brief A fresh session token: 32 random bytes as 64 lower-case hex digits. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * @brief The token a request presents: the Bearer header if there is one, else
 *        `?token=`, else the segment after {@link APP_PATH_PREFIX}.
 *
 * @param request The request, for its headers.
 * @param url     The request URL, already parsed, for its query and path.
 * @return The presented token, or undefined if none carries one.
 */
export function presentedToken(request: IncomingMessage, url: URL): string | undefined {
  const header = request.headers.authorization;
  if (header !== undefined) {
    // A header that is present but malformed does not fall back to `?token=`:
    // a request that sends a header has chosen it, and a wrong header must
    // not be rescued by a query parameter left over from the page URL.
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return match?.[1];
  }
  const query = url.searchParams.get('token');
  if (query !== null) {
    return query;
  }
  if (url.pathname.startsWith(APP_PATH_PREFIX)) {
    // Only a segment followed by '/' counts: `/app/<token>` alone names no
    // file, and accepting it would make two spellings of one URL.
    const rest = url.pathname.slice(APP_PATH_PREFIX.length);
    const slash = rest.indexOf('/');
    return slash > 0 ? rest.slice(0, slash) : undefined;
  }
  return undefined;
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
