/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/refusal-page.ts
 * Purpose: What a person sees when they open a designer link the server will
 *          not honour: the bare address, an old bookmark, or a tab left open
 *          across a restart, which has a new token. The token gate's JSON
 *          refusal is right for the designer's own requests, but in a browser
 *          tab it is a line of raw JSON with no next step. A browser asking
 *          for a page gets this one instead, which says how to get back in.
 * Description: One static HTML string, with no framework and no script, and
 *              the test that decides who gets it. The page is the same bytes
 *              for every refusal: it names no project, path or token, so it
 *              tells an unauthorised caller no more than the JSON does, and
 *              nothing about which routes exist.
 *
 * Exports:
 * - REFUSAL_PAGE:     The page
 * - wantsPage():      Whether a refused request is a browser asking for a page
 */

import type { IncomingHttpHeaders } from 'node:http';

/** The refusal page's HTML: a complete document, identical for every refusal. */
export const REFUSAL_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>u8g2gl design: no session</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 36rem; padding: 0 1rem; }
  code { font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<h1>This designer link needs a running session</h1>
<p>A designer link stops working when <code>u8g2gl design</code> stops or restarts.</p>
<p>To continue, run <code>npx u8g2gl design</code> in the project folder. It opens
the browser, or reopens the session if it is already running.</p>
</body>
</html>
`;

/**
 * @brief Whether a refused request should get {@link REFUSAL_PAGE} rather than
 *        the JSON refusal.
 *
 * True for a `GET` that is a top-level navigation (`Sec-Fetch-Mode: navigate`),
 * or whose `Accept` prefers `text/html` to JSON. Everything else — the
 * designer's `fetch` calls, `EventSource`, scripts and tools — keeps the JSON,
 * so a caller that branches on its `code` is never handed a page.
 *
 * @param method  The request method.
 * @param headers The request headers.
 */
export function wantsPage(method: string, headers: IncomingHttpHeaders): boolean {
  if (method !== 'GET') return false;
  if (headers['sec-fetch-mode'] === 'navigate') return true;
  const accept = headers.accept;
  if (accept === undefined) return false;
  const ranges = parseAccept(accept);
  const html = quality(ranges, 'text', 'html');
  // Strictly preferred: `*/*` alone, which `fetch` sends, rates both the same.
  return html > 0 && html > quality(ranges, 'application', 'json');
}

/** One media range from an `Accept` header, with its weight. */
interface MediaRange {
  readonly type: string;
  readonly subtype: string;
  readonly q: number;
}

// parseAccept
// An `Accept` header's media ranges, lower-cased, with `q` defaulting to 1. A
// malformed `q` counts as 0, so it can never make a page more likely.
//   accept — the header's value
function parseAccept(accept: string): MediaRange[] {
  return accept.split(',').flatMap((part) => {
    const [range = '', ...params] = part.split(';').map((s) => s.trim().toLowerCase());
    const [type, subtype] = range.split('/');
    if (type === undefined || subtype === undefined || type === '' || subtype === '') return [];
    const qParam = params.find((p) => p.startsWith('q='));
    const q = qParam === undefined ? 1 : Number(qParam.slice(2));
    return [{ type, subtype, q: Number.isFinite(q) ? q : 0 }];
  });
}

// quality
// The weight the most specific matching range gives a media type (RFC 9110
// §12.5.1): an exact match, then `type/*`, then `*/*`; 0 if none matches.
//   ranges          — from parseAccept
//   type, subtype   — the media type asked about
function quality(ranges: readonly MediaRange[], type: string, subtype: string): number {
  const exact = ranges.find((r) => r.type === type && r.subtype === subtype);
  const partial = ranges.find((r) => r.type === type && r.subtype === '*');
  const any = ranges.find((r) => r.type === '*' && r.subtype === '*');
  return (exact ?? partial ?? any)?.q ?? 0;
}
