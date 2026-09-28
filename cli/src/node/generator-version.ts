/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/generator-version.ts
 * Purpose: The generator version stamped into every generated file (§13.9), read
 *          from `package.json` and **never guessed**. Generated code is a
 *          committed artefact a human reads in review ([D-11]), and the stamp is
 *          how anyone — or any CI check — knows which generator produced it. A
 *          wrong version in that stamp is worse than no output at all: it is a
 *          false provenance claim on code that has already been committed.
 * Description: `getGeneratorVersion()` resolves `package.json` relative to
 *              `import.meta.url`, so it works from `dist/` and from source, and
 *              **throws** when it cannot be read or holds no version.
 *
 *              It used to fall back to the literal `'0.3.0'` (PR-04 WO5b finding
 *              6). That fallback could only ever be wrong — the package was at
 *              0.6.0 when it was found — and it failed silently, stamping a
 *              version that had never generated anything into files nobody would
 *              re-check. Throwing turns an unreadable install into one loud
 *              message before a single file is written.
 *
 *              It lives in its own module rather than in `cli.ts` because
 *              `cli.ts` calls `runCli(process.argv)` at module scope: importing
 *              it to test the unreadable case would run the CLI. The work order
 *              requires a test for that case, so the lookup moved here, and
 *              nothing else moved with it. The file reader is injectable for the
 *              same reason — a test must be able to make the read fail without
 *              touching the real `package.json`.
 *
 * Exports:
 * - FileReader:              Reads a file's text, or throws
 * - getGeneratorVersion():   The CLI's own version, or a thrown error
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Reads a file as UTF-8 text, or throws. Injectable so a test can make the read
 * fail; the default is `node:fs`.
 */
export type FileReader = (path: string) => string;

// readUtf8
// The default reader.
const readUtf8: FileReader = (path) => readFileSync(path, 'utf8');

/**
 * @brief The generator version to stamp into generated files (§13.9, §16).
 *
 * @param read Optional file reader, for tests. Defaults to `node:fs`.
 * @return The `version` field of the CLI's own `package.json`.
 * @throws Error if `package.json` cannot be read, is not valid JSON, or declares
 *         no non-empty `version`. Deliberately fatal rather than defaulted: the
 *         version is stamped into committed output, so a guess would be a false
 *         provenance claim (PR-04 WO5b finding 6).
 */
export function getGeneratorVersion(read: FileReader = readUtf8): string {
  // Two levels up from this module: `dist/node/` and `src/node/` are both one
  // directory below the package root, so the same relative path serves the
  // built CLI and a source run.
  const packageJsonUrl = new URL('../../package.json', import.meta.url);
  const path = fileURLToPath(packageJsonUrl);

  let text: string;
  try {
    text = read(path);
  } catch (cause) {
    throw new Error(
      `Cannot read '${path}' to determine the u8g2gl generator version, which is stamped into every ` +
        `generated file (§13.9). Reinstall the CLI. Generating with a guessed version would record a ` +
        `false provenance in committed code: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  let version: unknown;
  try {
    version = (JSON.parse(text) as { version?: unknown }).version;
  } catch (cause) {
    throw new Error(
      `'${path}' is not valid JSON, so the u8g2gl generator version cannot be determined: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (typeof version !== 'string' || version === '') {
    throw new Error(
      `'${path}' declares no 'version', so the u8g2gl generator version cannot be determined. It is ` +
        `stamped into every generated file (§13.9) and is never guessed.`,
    );
  }
  return version;
}
