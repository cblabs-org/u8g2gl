/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/file-chooser-model.ts
 * Purpose: The rules behind the file chooser (ui_spec §6.4) for the
 *          `globals.xml` elements that name a project file — `<bdf>`, `<xbm>`
 *          and `<convert>` — so choosing or importing a file never leaves the
 *          author to type a path, a name or an image's size by hand, and an
 *          import never replaces a file that is already there.
 * Description: Pure functions, unit-tested without a browser:
 *              - which files a kind takes, by extension, and where an import
 *                goes (`fonts/` or `images/`);
 *              - the name a new element gets from its file, made a valid
 *                identifier (the validator's rule: `[a-z][a-z0-9_]*`, no
 *                `__`, no reserved prefix, no C++ keyword) and unique among the
 *                names already taken;
 *              - why an import path is refused, if it is;
 *              - a PNG's width and height, from its IHDR chunk.
 *
 * Exports:
 * - FileKind:            What a kind's chooser lists and imports
 * - FILE_KINDS:          The kinds with a file chooser, by vocabulary id
 * - fileKindOf():        A kind's chooser, by vocabulary id
 * - fileKindOfField():   The chooser for a path field, by element id and attribute
 * - filesOfKind():       The project files a kind can name
 * - derivedName():       A valid, unique element name from a file's name
 * - importPath():        Where an imported file is proposed to go
 * - importRefusal():     Why an import path cannot be written, or undefined
 * - pngSize():           A PNG's width and height, or undefined
 */

import { CPP_KEYWORDS } from '@u8g2gl/core/schema/cpp-keywords.js';
import { RESERVED_IDENTIFIER_PREFIXES } from '@u8g2gl/core/resolver/index.js';
import { checkProjectPath, refusedPathMessage } from '@u8g2gl/core/project-fs/index.js';

/** What one kind's chooser lists and imports. */
export interface FileKind {
  /** The vocabulary id of the element (`font-bdf`). */
  readonly element: string;
  /** The extensions it accepts, lower case with the dot. */
  readonly extensions: readonly string[];
  /** The folder an import is proposed in. */
  readonly folder: 'fonts' | 'images';
  /** What a derived name starts with when the file's name begins with a digit. */
  readonly stem: 'font' | 'image';
  /** What the files are, for the chooser's words. */
  readonly noun: string;
  /** The article the noun takes, as it is said ("an XBM image"). */
  readonly article: 'a' | 'an';
}

/** The kinds with a file chooser, by vocabulary id (design_spec §14.1, §14.2). */
export const FILE_KINDS: ReadonlyMap<string, FileKind> = new Map(
  (
    [
      { element: 'font-bdf', extensions: ['.bdf'], folder: 'fonts', stem: 'font', noun: 'BDF font', article: 'a' },
      { element: 'image-xbm', extensions: ['.xbm'], folder: 'images', stem: 'image', noun: 'XBM image', article: 'an' },
      { element: 'image-convert', extensions: ['.png'], folder: 'images', stem: 'image', noun: 'PNG image', article: 'a' },
    ] as const
  ).map((kind) => [kind.element, kind]),
);

/** @brief A kind's chooser by vocabulary id, or undefined for a kind without one. */
export function fileKindOf(element: string): FileKind | undefined {
  return FILE_KINDS.get(element);
}

/** @brief The chooser for a field: every `src` of a kind that has one. */
export function fileKindOfField(element: string, attribute: string): FileKind | undefined {
  return attribute === 'src' ? fileKindOf(element) : undefined;
}

// extensionOf
// A path's extension, lower case with the dot, or '' for none.
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

/**
 * @brief The project files a kind can name: those with one of its extensions,
 *        in the listing's order (sorted by code unit, §13.9).
 */
export function filesOfKind(paths: readonly string[], kind: FileKind): readonly string[] {
  return paths.filter((path) => kind.extensions.includes(extensionOf(path)));
}

/**
 * @brief The name a new element gets from its file: valid, and unique.
 *
 * The file's base name without its extension, lower-cased, with every run of
 * other characters made one `_` and the ends trimmed of `_`. A name that would
 * start with a digit, start with a reserved prefix, be a C++ keyword or be
 * empty is prefixed with the kind's stem (`font_6x10`). A name already taken
 * gets the first free `_2`, `_3`…
 *
 * @param path   The file, as the project lists it.
 * @param kind   The element's chooser.
 * @param taken  Every name the list's items have now (fonts share one
 *               namespace, built-in and BDF alike; so do images).
 */
export function derivedName(path: string, kind: FileKind, taken: ReadonlySet<string>): string {
  // --- Step 1: The base name, as an identifier ---
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  const base = (dot <= 0 ? file : file.slice(0, dot))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  // --- Step 2: Prefixed where the validator would refuse it as it is ---
  const needsStem = base === '' || /^[0-9]/.test(base) || CPP_KEYWORDS.has(base) || RESERVED_IDENTIFIER_PREFIXES.some((prefix) => base.startsWith(prefix));
  const name = needsStem ? (base === '' ? kind.stem : `${kind.stem}_${base}`) : base;

  // --- Step 3: Unique among the names already taken ---
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    if (!taken.has(`${name}_${n}`)) return `${name}_${n}`;
  }
}

/** @brief Where an imported file is proposed to go: `fonts/<file>` or `images/<file>`. */
export function importPath(fileName: string, kind: FileKind): string {
  return `${kind.folder}/${fileName.split(/[\\/]/).pop() ?? fileName}`;
}

/**
 * @brief Why an import cannot be written to a path, or undefined if it can.
 *
 * Refused: a path the project file system refuses, an extension the kind does
 * not take, and a path that names an existing file — an import never replaces
 * one, so the author is asked to rename it instead. The server's own
 * "must not exist" check stays the last word, for a file that appears between
 * this check and the write.
 *
 * @param path      The path the author has chosen.
 * @param kind      The element's chooser.
 * @param existing  Every project file now.
 */
export function importRefusal(path: string, kind: FileKind, existing: readonly string[]): string | undefined {
  const check = checkProjectPath(path);
  if (!check.ok) return refusedPathMessage(path, check.reason);
  if (!kind.extensions.includes(extensionOf(check.path))) return `${kind.article === 'an' ? 'An' : 'A'} ${kind.noun} must end in ${kind.extensions.join(' or ')}.`;
  if (existing.includes(check.path)) return `${check.path} already exists, and an import never replaces a file. Rename it to import it.`;
  return undefined;
}

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * @brief A PNG's width and height, from the IHDR chunk that must come first.
 *
 * @param bytes  The file, or at least its first 24 bytes.
 * @return The size, or undefined when the bytes are not a PNG whose first
 *         chunk is a sane IHDR — the author then sets width and height.
 */
export function pngSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  // Signature (8), then the IHDR chunk: length (4) = 13, type (4) "IHDR",
  // width (4) and height (4), all big-endian.
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return undefined;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}
