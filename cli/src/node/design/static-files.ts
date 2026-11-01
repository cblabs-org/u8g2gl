/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/static-files.ts
 * Purpose: What the design server reads when it serves the designer itself
 *          (`designer/dist/`) and a project's built editor Wasm. Both are
 *          directories of files the server did not write and must not let a
 *          request climb out of, so the lookup is one function with one path
 *          rule rather than two hand-rolled `join`s in the router.
 * Description: `readStaticFile` maps a URL-relative path onto a directory: the
 *              shared lexical rule (`checkProjectPath`) refuses `..`, absolute
 *              paths and backslashes, then the real-path rule
 *              (`isInsideProject`) refuses a symlink pointing out. The media
 *              type comes from the extension, from a fixed table of what Vite
 *              and Emscripten emit; anything else is `application/octet-stream`.
 *              `locateDesignerDist` finds the built designer: the package's
 *              staged `designer/` when its stamp is this CLI's version
 *              (package-copy.ts), else `designer/dist/` in the source tree
 *              beside the CLI, as the editor Wasm job finds the framework.
 *
 * Exports:
 * - StaticFile:            A file's bytes and media type
 * - readStaticFile():      A file beneath a directory, or undefined
 * - DesignerLookup:        Where locateDesignerDist() looks (tests override it)
 * - locateDesignerDist():  The package's designer, or the source tree's build
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { checkProjectPath } from '../../core/project-fs/project-path-rule.js';
import { isInsideProject } from '../project-path.js';
import { locateSourceTree } from './build/framework-sources.js';
import { locateStagedCopy, type StagedCopyLookup } from './package-copy.js';

/** A file to serve. */
export interface StaticFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/**
 * Media types by extension. `application/wasm` matters: browsers refuse
 * `WebAssembly.instantiateStreaming` for any other type.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @brief Reads a file beneath a directory by a URL-relative path.
 *
 * @param root The directory served (absolute).
 * @param path The path below it, already percent-decoded, with no leading `/`.
 * @return The file, or undefined if the path is refused, absent, or a directory.
 */
export function readStaticFile(root: string, path: string): StaticFile | undefined {
  // --- Step 1: The lexical rule, then the real-path rule ---
  // The project path rule is reused because its job is the same: a relative
  // POSIX path that cannot name anything outside the directory it is under.
  const check = checkProjectPath(path);
  if (!check.ok) {
    return undefined;
  }
  const absolute = join(root, ...check.path.split('/'));
  // The real-path rule follows the lexical one because a lexically clean path
  // can still leave through a symlink inside the served directory (in dist/
  // or a build directory) that points out of it. `isFile()` because a
  // directory is not a file to serve: asking for one is a 404, not a read.
  if (!isInsideProject(root, absolute) || !existsSync(absolute) || !statSync(absolute).isFile()) {
    return undefined;
  }

  // --- Step 2: Bytes and media type ---
  return {
    bytes: new Uint8Array(readFileSync(absolute)),
    contentType: CONTENT_TYPES[extname(absolute).toLowerCase()] ?? 'application/octet-stream',
  };
}

/** Where locateDesignerDist() looks. Every field defaults to this CLI's own. */
export interface DesignerLookup extends StagedCopyLookup {
  /** The U8G2GL source tree; found from this file when omitted, `null` for none. */
  readonly sourceRoot?: string | null;
}

/**
 * @brief The built designer to serve.
 *
 * The package's staged `designer/` comes first, when its stamp names this
 * CLI's version: that is what an installed CLI has. Otherwise
 * `<source tree>/designer/dist/`, as a checkout has always found it. A
 * checkout whose designer was never built has neither, and the server keeps
 * serving its placeholder page.
 *
 * @param lookup Overrides for tests; this CLI's package, version and source tree otherwise.
 * @return The directory holding the designer's `index.html`, or undefined.
 */
export function locateDesignerDist(lookup: DesignerLookup = {}): string | undefined {
  const staged = locateStagedCopy('designer', 'index.html', lookup);
  if (staged.kind === 'staged') {
    return staged.dir;
  }
  const sourceRoot = lookup.sourceRoot === undefined ? locateSourceTree() : (lookup.sourceRoot ?? undefined);
  if (sourceRoot === undefined) {
    return undefined;
  }
  const dist = join(sourceRoot, 'designer', 'dist');
  return existsSync(join(dist, 'index.html')) ? dist : undefined;
}
