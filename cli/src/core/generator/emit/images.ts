/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/images.ts
 * Purpose: The images unit (§14.2): every `<xbm>` asset's bytes, emitted
 *          `PROGMEM` so they live in flash rather than in the RAM a 16 KB target
 *          cannot spare ([D-1]). XBM is the format that needs no tooling — the
 *          file is already a C byte array — which is why `<xbm>` ships in PR-04
 *          and `<convert>` waits for PR-04b's PNG decoder.
 * Description: Emits one `ui_image_<name>[]` per declaration, in declaration
 *              order, with the bytes exactly as the asset holds them: XBM's bit
 *              order is what `drawXBMP` expects, so reordering would be a defect
 *              rather than a normalisation.
 *
 *              The asset's *text* is supplied by `src/node/`, because
 *              `src/core/` may not read files (typescript.md §1). An asset that
 *              is missing or malformed is an **author** error — the generator is
 *              working correctly and the project is not — so it becomes a
 *              diagnostic located at the `<xbm>` declaration, never a thrown
 *              error.
 *
 *              `<convert>` is refused by Pass 8 under `generate` (PR-04 decision
 *              3) and so never reaches here; it is skipped defensively and
 *              recorded in the emitted file, so a relaxed policy could not make
 *              an image silently vanish.
 *
 * Exports:
 * - IMAGES_UNIT:         The unit's file name
 * - PROGMEM_MACRO:       The attribute the bytes are declared with
 * - imageDeclarations(): The `ui_image_*` arrays, for `ui.hpp`
 * - emitImagesUnit():    Emit `ui_images.cpp`
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../../schema/diagnostic.js';
import type { XbmImageDecl } from '../../schema/globals.js';
import { imageIdentifier } from '../../resolver/index.js';
import { parseXbm } from './xbm.js';
import { declarationError, section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

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
  readonly image: XbmImageDecl;
  /** `ui_image_<name>` (§13.4). */
  readonly identifier: string;
}

/**
 * @brief The `ui_image_*` arrays this project emits, in declaration order.
 *
 * Only `<xbm>`: a `<convert>` is refused before emission (§14.2, PR-04b).
 *
 * @param input Globals.
 * @return One entry per XBM image, in declaration order (§13.9).
 */
export function imageDeclarations(input: ProjectEmitInput): readonly ImageDeclaration[] {
  const declarations: ImageDeclaration[] = [];
  for (const image of input.globals.images ?? []) {
    if (image.kind !== 'xbm') {
      continue;
    }
    declarations.push({ image, identifier: imageIdentifier(image.name) });
  }
  return declarations;
}

// missingAsset
// The diagnostic for an asset that is not there. MISSING_FILE rather than a type
// error: the declaration is well formed and the file it names is absent, which
// is the same condition the CLI reports for an unreadable project.
function missingAsset(image: XbmImageDecl): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.MISSING_FILE,
    severity: 'error',
    file: image.loc?.file ?? '',
    line: image.loc?.line ?? 1,
    column: image.loc?.column ?? 1,
    message:
      `Image '${image.name}' names '${image.src}', which could not be read relative to the project ` +
      `directory. An <xbm> asset is compiled into the generated code (§14.2), so the build cannot ` +
      `proceed without it.`,
    offendingText: image.src,
  };
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
 * @param input Globals, the asset texts and this file's stamp.
 * @return The unit, and one diagnostic per asset that is missing or malformed.
 */
export function emitImagesUnit(input: ProjectEmitInput): EmittedUnit {
  const diagnostics: Diagnostic[] = [];
  const declarations = imageDeclarations(input);
  const deferred = (input.globals.images ?? []).filter((image) => image.kind === 'convert');

  const lines: string[] = [input.stamp.trimEnd(), '', '#include "ui.hpp"', ''];

  lines.push(section('Images (§14.2)'));
  if (declarations.length === 0) {
    lines.push('// globals.xml declares no <xbm> images.');
  }

  for (const { image, identifier } of declarations) {
    // --- Step 1: The asset's text, as read by src/node/ ---
    const text = input.assets.get(image.src);
    if (text === undefined) {
      diagnostics.push(missingAsset(image));
      continue;
    }

    // --- Step 2: Its dimensions and bytes ---
    const parsed = parseXbm(text);
    if ('reason' in parsed) {
      diagnostics.push(
        declarationError(
          `Image '${image.name}' names '${image.src}', which is not a usable XBM file: ${parsed.reason}. ` +
            `Export it as XBM (§14.2).`,
          image.loc,
          image.src,
        ),
      );
      continue;
    }

    // --- Step 3: The array, in flash ---
    lines.push(
      '',
      `// ${image.name}: ${image.src}, ${parsed.width}x${parsed.height}, ${parsed.bytes.length} bytes.`,
      '// Drawn with drawXBMP, so the bytes keep the XBM bit order unchanged (§14.2).',
      `const uint8_t ${identifier}[] ${PROGMEM_MACRO} = {`,
      ...byteLines([...parsed.bytes]),
      '};',
    );
  }

  for (const image of deferred) {
    lines.push(
      '',
      `// ${image.name}: a <convert> image. Build-time PNG-to-XBM conversion is`,
      "// delivered in PR-04b, and 'u8g2gl generate' refuses it until then (§14.2),",
      '// so this declaration emits nothing.',
    );
  }

  lines.push('');
  return { content: lines.join('\n'), diagnostics };
}
