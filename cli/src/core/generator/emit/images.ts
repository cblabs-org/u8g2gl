/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/images.ts
 * Purpose: The images unit (§14.2): every image's bytes, `<xbm>` and
 *          `<convert>` alike, emitted `PROGMEM` so they live in flash rather
 *          than in the RAM a 16 KB target cannot spare ([D-1]). Both kinds
 *          arrive as the one `XbmImage` model, produced by the asset step, so
 *          nothing here knows or cares how an image was made beyond the
 *          provenance comment.
 * Description: Emits one `ui_image_<name>[]` per declared image, in declaration
 *              order, with the bytes exactly as the model holds them: XBM's bit
 *              order is what `drawXBMP` expects, so reordering would be a defect
 *              rather than a normalisation.
 *
 *              This module reads no file and converts nothing
 *              (`src/core/` may not read files, typescript.md §1, and PNG
 *              decoding is asynchronous): `compileProjectAssets()` has already
 *              turned every declaration into an image or a diagnostic, and
 *              `generate()` refuses a build for which it did not. An image
 *              absent from the map is therefore skipped, never guessed at.
 *
 *              A converted image carries a comment recording where it came
 *              from and how it was made (source, declared size, mode, effective
 *              threshold, byte count), because the bytes alone do not say that
 *              they were produced rather than exported, and a reviewer of the
 *              committed output should be able to tell.
 *
 * Exports:
 * - IMAGES_UNIT:         The unit's file name
 * - PROGMEM_MACRO:       The attribute the bytes are declared with
 * - ImageDeclaration:    One emitted array
 * - imageDeclarations(): The `ui_image_*` arrays, for `ui.hpp`
 * - emitImagesUnit():    Emit `ui_images.cpp`
 */

import type { Diagnostic } from '../../schema/diagnostic.js';
import type { ImageDecl } from '../../schema/globals.js';
import { imageIdentifier } from '../../resolver/index.js';
import { DEFAULT_THRESHOLD } from '../../images/index.js';
import { section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/** §13.7's images unit. */
export const IMAGES_UNIT = 'ui_images.cpp';

/**
 * The attribute bitmap data is declared with (§14.2).
 *
 * Not `PROGMEM` directly: that macro exists only on AVR, and the runtime also
 * builds for 32-bit targets, for the host test suite and for Wasm ([D-9]), where
 * naming it would not compile. `ui.hpp` defines this to `PROGMEM` where Arduino
 * provides it and to nothing everywhere else.
 */
export const PROGMEM_MACRO = 'U8G2GL_PROGMEM';

/** How many bytes go on one line of the emitted array. */
const BYTES_PER_LINE = 12;

/** One emitted image array. */
export interface ImageDeclaration {
  /** The `<xbm>` or `<convert>` declaration this array is emitted for. */
  readonly image: ImageDecl;
  /** `ui_image_<name>` (§13.4). */
  readonly identifier: string;
}

/**
 * @brief The `ui_image_*` arrays this project emits, in declaration order.
 *
 * Every declared image the asset step produced. A declaration with no entry in
 * `input.images` failed there and refuses the build, so it is never described.
 *
 * @param input Globals and the produced images.
 * @return One entry per image, in declaration order (§13.9).
 */
export function imageDeclarations(input: ProjectEmitInput): readonly ImageDeclaration[] {
  const declarations: ImageDeclaration[] = [];
  for (const image of input.globals.images ?? []) {
    if (input.images.has(image.name)) {
      declarations.push({ image, identifier: imageIdentifier(image.name) });
    }
  }
  return declarations;
}

// provenance
// The comment lines above one array: where the image came from and how.
//   image     — the declaration
//   width     — the produced image's width in pixels
//   height    — the produced image's height in pixels
//   byteCount — the size of the produced array, in bytes
function provenance(image: ImageDecl, width: number, height: number, byteCount: number): string[] {
  if (image.kind === 'xbm') {
    return [
      `// ${image.name}: ${image.src}, ${width}x${height}, ${byteCount} bytes.`,
      '// Drawn with drawXBMP, so the bytes keep the XBM bit order unchanged (§14.2).',
    ];
  }
  return [
    `// ${image.name}: converted from ${image.src}, ${width}x${height}, ` +
      `mode ${image.mode ?? 'threshold'}, threshold ${image.threshold ?? DEFAULT_THRESHOLD}, ${byteCount} bytes.`,
    '// Drawn with drawXBMP, so the bytes keep the XBM bit order unchanged (§14.2).',
  ];
}

// byteLines
// The array body: `BYTES_PER_LINE` bytes to a line, lower-case hex, two digits.
// A fixed layout rather than one that depends on the byte count, so an asset
// whose bytes change produces a diff only where the bytes changed (§13.9).
function byteLines(bytes: readonly number[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < bytes.length; index += BYTES_PER_LINE) {
    const row = bytes
      .slice(index, index + BYTES_PER_LINE)
      .map((byte) => `0x${byte.toString(16).padStart(2, '0')}`)
      .join(', ');
    lines.push(`    ${row},`);
  }
  return lines;
}

/**
 * @brief Emits the images unit (§14.2).
 *
 * @param input Globals, the produced images and this file's stamp.
 * @return The unit. Diagnostics are always empty: an unreadable or malformed
 *         asset is reported by `compileProjectAssets()`. The field exists
 *         because every unit emitter returns `EmittedUnit`.
 */
export function emitImagesUnit(input: ProjectEmitInput): EmittedUnit {
  const diagnostics: Diagnostic[] = [];
  const declarations = imageDeclarations(input);

  const lines: string[] = [input.stamp.trimEnd(), '', '#include "ui.hpp"', ''];

  lines.push(section('Images (§14.2)'));
  if (declarations.length === 0) {
    lines.push('// globals.xml declares no images.');
  }

  for (const { image, identifier } of declarations) {
    const produced = input.images.get(image.name);
    if (produced === undefined) {
      continue; // imageDeclarations() only lists images the map holds.
    }
    lines.push(
      '',
      ...provenance(image, produced.width, produced.height, produced.bytes.length),
      `const uint8_t ${identifier}[] ${PROGMEM_MACRO} = {`,
      ...byteLines(produced.bytes),
      '};',
    );
  }

  lines.push('');
  return { content: lines.join('\n'), diagnostics };
}
