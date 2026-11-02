/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/package-copy.ts
 * Purpose: The contract between the script that packs the CLI and the lookups
 *          that read what it packed. An installed CLI has no U8G2GL source
 *          tree beside it, so `npm pack` stages two directories into the
 *          package: `designer/` (the built designer) and `framework/` (the
 *          sources a project's Wasm builds compile). Each carries a stamp
 *          naming the CLI version and commit it was staged from, and a lookup
 *          trusts a staged copy only when that version is its own. The stamp's
 *          writer (scripts/stage-package.mjs, through writePackageStamp) and
 *          its readers (framework-sources.ts, static-files.ts) share this one
 *          definition, so they cannot disagree about its name or shape.
 * Description: `locateStagedCopy()` answers "is there a usable staged copy of
 *              `designer/` or `framework/` in this package?" with the copy, its
 *              absence, or the reason it was ignored (a missing or unreadable
 *              stamp, a different version, a missing marker file). A mismatch
 *              is ignored rather than fatal: the lookups then fall back to a
 *              source tree, as a checkout with nothing staged always has.
 *
 * Exports:
 * - PACKAGE_STAMP_FILE:   The stamp's file name inside a staged directory
 * - CLI_PACKAGE_ROOT:     This CLI's own package directory
 * - PackageStamp:         What a stamp records
 * - StagedCopyName:       The two directories the package can carry
 * - StagedCopyLookup:     Where to look, and for which version (tests override both)
 * - StagedCopy:           A lookup's answer
 * - writePackageStamp():  Stamp a staged directory
 * - locateStagedCopy():   Find a staged directory, or say why it was ignored
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGeneratorVersion } from '../generator-version.js';

/** The stamp's file name inside a staged directory. */
export const PACKAGE_STAMP_FILE = 'STAMP.json';

/**
 * This CLI's package directory: three levels above this module, which sits in
 * `dist/node/design/` when built and `src/node/design/` under a TypeScript
 * runner, so both resolve to the directory holding `package.json`.
 */
export const CLI_PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * What a stamp records: the CLI version and the commit a copy was staged from.
 * Only the version is a trust key. The commit is provenance, for a person
 * asking what a package was built from: a lookup never compares it, because an
 * installed CLI has no commit of its own to compare it with.
 */
export interface PackageStamp {
  readonly version: string;
  readonly commit: string;
}

/** The two directories the package can carry. */
export type StagedCopyName = 'designer' | 'framework';

/** Where to look, and for which version. Both default to this CLI's. */
export interface StagedCopyLookup {
  /** The package directory holding the staged copies. */
  readonly packageRoot?: string;
  /** The CLI version a copy's stamp must name. */
  readonly version?: string;
}

/** A lookup's answer. */
export type StagedCopy =
  | { readonly kind: 'staged'; readonly dir: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'ignored'; readonly dir: string; readonly reason: string };

/**
 * @brief Writes a staged directory's stamp.
 *
 * @param dir   The staged directory (`designer/` or `framework/`), which must exist.
 * @param stamp The CLI version and commit it was staged from.
 * @throws Error (ENOENT, EACCES) if the directory is missing or not writable:
 *         a staging defect, which must stop the pack rather than ship a copy
 *         no lookup will trust.
 */
export function writePackageStamp(dir: string, stamp: PackageStamp): void {
  writeFileSync(join(dir, PACKAGE_STAMP_FILE), `${JSON.stringify({ version: stamp.version, commit: stamp.commit }, null, 2)}\n`);
}

/**
 * @brief Finds the package's staged copy of `designer/` or `framework/`.
 *
 * A copy is usable only when its stamp names this CLI's version and its
 * marker file exists. The version check is what makes a staged copy safe to
 * prefer over a source tree: a copy left behind by an older pack, in a
 * checkout whose CLI has since moved on, names an older version and is
 * ignored, so the lookup falls back to the live sources. A copy of the
 * same version from another commit is trusted; only an interrupted pack in a
 * checkout leaves one, and the stage script removes it at the next pack.
 *
 * @param name   Which staged directory.
 * @param marker A file, relative to it, that a complete copy has.
 * @param lookup Overrides for tests; this CLI's package and version otherwise.
 * @return `staged` with the directory; `absent` when there is none; or
 *         `ignored` with the directory and a sentence saying why.
 */
export function locateStagedCopy(name: StagedCopyName, marker: string, lookup: StagedCopyLookup = {}): StagedCopy {
  // --- Step 1: Is there a staged directory at all? ---
  const dir = join(lookup.packageRoot ?? CLI_PACKAGE_ROOT, name);
  if (!existsSync(dir)) {
    return { kind: 'absent' };
  }

  // --- Step 2: Its stamp, which must name this CLI's version ---
  const stamp = readStamp(join(dir, PACKAGE_STAMP_FILE));
  if (stamp === undefined) {
    return { kind: 'ignored', dir, reason: `the package's ${name}/ has no readable ${PACKAGE_STAMP_FILE}` };
  }
  const version = lookup.version ?? getGeneratorVersion();
  if (stamp.version !== version) {
    return { kind: 'ignored', dir, reason: `the package's ${name}/ was staged for CLI ${stamp.version}, not this CLI's ${version}` };
  }

  // --- Step 3: And it must be complete ---
  if (!existsSync(join(dir, marker))) {
    return { kind: 'ignored', dir, reason: `the package's ${name}/ has no ${marker}` };
  }
  return { kind: 'staged', dir };
}

// readStamp
// A stamp file's contents, or undefined when it is missing, not JSON, or not
// a stamp: a lookup treats all three alike, as a copy it cannot trust.
//   path — the stamp file
function readStamp(path: string): PackageStamp | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Record<keyof PackageStamp, unknown>>;
    return typeof parsed.version === 'string' && typeof parsed.commit === 'string'
      ? { version: parsed.version, commit: parsed.commit }
      : undefined;
  } catch {
    return undefined;
  }
}
