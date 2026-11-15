/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/catalogue/snippet.ts
 * Purpose: Writes the board-side code that constructs a catalogued display —
 *          the copyable sample that replaces the pin attributes U8G2GL no
 *          longer reads. The firmware's board owns the wiring and U8G2GL owns
 *          the panel ([D-22]), so the sample shows where each pin goes without
 *          knowing any of them: every pin is a named placeholder that stops the
 *          build until it is filled in. It is shown by the designer's target
 *          section and by `u8g2gl display <setup> --snippet`, and is never
 *          written into `generated/`: generated code is compiled, and a sample
 *          beside the board's real constructor would be compiled twice.
 * Description: One pure function over a catalogue record. The constructor's
 *              argument list is the record's `bus.pins`, which the catalogue
 *              builder extracts from U8G2's own U8g2lib.h, so nothing here
 *              knows a wiring by hand. Rotation appears only as the contract
 *              macro `ui.hpp` defines, so the sample stays right when the
 *              project's rotation changes. Isomorphic: the designer bundles it.
 *
 * Exports:
 * - PIN_PLACEHOLDER:       The identifier every pin is defined to until filled in
 * - pinMacro():            The `DISPLAY_<NAME>` macro a pin is defined as
 * - constructorSnippet():  The board-side construction of a display, as text
 */

import { TARGET_ROTATION_MACRO } from '../generator/emit/ui-hpp.js';
import { UI_DISPLAY_MATCHES_FUNCTION, UI_INIT_FUNCTION } from '../resolver/mangle.js';
import type { DisplayRecord } from '../schema/display-record.js';
import { normaliseRotation } from '../schema/project-vocabulary.js';

/**
 * The value every pin macro is defined to until the author fills it in. It is
 * an identifier nothing declares, so an unfilled sample fails to compile with
 * an error that names it, rather than building against an invented pin.
 */
export const PIN_PLACEHOLDER = 'FILL_IN_PIN';

/**
 * Longest constructor line kept on one line; a longer one (the parallel
 * wirings take up to fourteen pins) puts each argument on its own line.
 */
const MAX_CONSTRUCTOR_LINE = 120;

/** The C++ indent the sample uses, as the runtime's own sources do. */
const INDENT = '    ';

/**
 * @brief The macro a constructor parameter is passed as in the sample.
 *
 * @param pinName U8G2's parameter name, as `bus.pins` records it (e.g. `cs`).
 * @return `DISPLAY_` and the name in upper case (e.g. `DISPLAY_CS`).
 */
export function pinMacro(pinName: string): string {
  return `DISPLAY_${pinName.toUpperCase()}`;
}

// pinDefines
// One `#define` per pin, in constructor order, with the macro names padded to
// one column so the comments line up. An optional pin says U8X8_PIN_NONE is
// allowed, because U8G2 gives that parameter the default itself.
//   record — the display whose pins are listed
function pinDefines(record: DisplayRecord): readonly string[] {
  const width = Math.max(...record.bus.pins.map((pin) => pinMacro(pin.name).length));
  return record.bus.pins.map((pin) => {
    const head = `#define ${pinMacro(pin.name).padEnd(width)} ${PIN_PLACEHOLDER}`;
    const wired = `GPIO wired to the panel's ${pin.name.toUpperCase()}`;
    const note = pin.optional ? `${wired}, or U8X8_PIN_NONE (U8G2's default)` : wired;
    return `${head}  // ${note}`;
  });
}

// constructorLines
// The global display object, constructed with the contract's rotation macro
// and then each pin macro in U8G2's parameter order. Kept on one line when it
// fits; otherwise one argument per line, so a fourteen-pin parallel wiring
// stays readable.
//   record — the display constructed
function constructorLines(record: DisplayRecord): readonly string[] {
  const args = [TARGET_ROTATION_MACRO, ...record.bus.pins.map((pin) => pinMacro(pin.name))];
  const oneLine = `${record.setup} display(${args.join(', ')});`;
  if (oneLine.length <= MAX_CONSTRUCTOR_LINE) {
    return [oneLine];
  }
  return [
    `${record.setup} display(`,
    ...args.map((arg, i) => `${INDENT}${arg}${i < args.length - 1 ? ',' : ');'}`),
  ];
}

// rotationComment
// Says where the rotation macro comes from and, when the rotation is one the
// schema accepts, what it expands to for this target. The expansion is a
// comment only: the code names the macro, so it follows the project.
//   rotation — the target's `rotation` attribute as written, or undefined
function rotationComment(rotation: string | undefined): string {
  const normalised = normaliseRotation(rotation);
  const source = `// ${TARGET_ROTATION_MACRO} comes from ui.hpp`;
  return normalised === undefined
    ? `${source}.`
    : `${source}; at this target's rotation it is U8G2_${normalised}.`;
}

/**
 * @brief The board-side code that constructs a display for a target.
 *
 * Includes U8g2lib.h and the generated `ui.hpp`, defines a `DISPLAY_<NAME>`
 * placeholder for every pin the wiring takes, constructs the display with
 * `U8G2GL_TARGET_ROTATION` and those pins in U8G2's own parameter order, and
 * shows the `setup()` sequence: `begin()`, the `ui_display_matches()` check,
 * then `ui_init()`. An I²C wiring also shows a commented `setI2CAddress()`,
 * because U8G2 cannot know the panel's address.
 *
 * The sample never invents a pin number: each placeholder is
 * {@link PIN_PLACEHOLDER}, which fails to compile until replaced. It never
 * writes to the project, and nothing compiles it as generated code.
 *
 * @param record     The target's catalogue record (`bus.pins` gives the wiring).
 * @param rotation   The target's `rotation` as written, or undefined for R0.
 *                   Used only in a comment naming what the macro expands to.
 * @param targetName The target's name, quoted in the mismatch comment.
 * @return The sample, newline-terminated. Deterministic: the same inputs give
 *         the same text, byte for byte.
 */
export function constructorSnippet(record: DisplayRecord, rotation: string | undefined, targetName: string): string {
  // --- Step 1: What this is, and where it belongs ---
  const lines: string[] = [
    `// Board-side construction of ${record.setup} for target '${targetName}'.`,
    '// A starting point for your firmware\'s board file (e.g. board.h), not',
    '// generated code: U8G2GL describes the panel; the pins and bus are your board\'s.',
    '',
    '#include <U8g2lib.h>',
    '#include "ui.hpp"  // generated by u8g2gl, in the project\'s output directory',
    '',
  ];

  // --- Step 2: A placeholder for every pin the wiring takes ---
  // A bus-less record still has pins (a KS0108 takes fourteen); a record with
  // none would be a builder defect, but the sample then simply has no defines.
  if (record.bus.pins.length > 0) {
    lines.push(`// Replace each ${PIN_PLACEHOLDER} with your board's pin; the build stops until you do.`);
    lines.push(...pinDefines(record));
    lines.push('');
  }

  // --- Step 3: The constructor, rotated by the contract's macro ---
  lines.push(rotationComment(rotation));
  lines.push(...constructorLines(record));
  lines.push('');

  // --- Step 4: The boot sequence the generated UI expects ---
  lines.push('void setup() {');
  if (record.bus.family === 'i2c') {
    lines.push(
      `${INDENT}// U8G2 can't know your panel's I2C address. If it isn't U8G2's default,`,
      `${INDENT}// set it before begin(), in U8G2's 8-bit form (the 7-bit address * 2):`,
      `${INDENT}// display.setI2CAddress(0x3C * 2);`
    );
  }
  lines.push(
    `${INDENT}display.begin();`,
    `${INDENT}if (!${UI_DISPLAY_MATCHES_FUNCTION}(display)) {`,
    `${INDENT}${INDENT}/* the panel or rotation differs from target '${targetName}' */`,
    `${INDENT}}`,
    `${INDENT}${UI_INIT_FUNCTION}();`,
    '}'
  );
  return lines.join('\n') + '\n';
}
