/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/assets/compile-project-assets.ts
 * Purpose: The seam WO1 named and WO3 fills: `generate()` is synchronous but
 *          `compileBdf()` and PNG decompression are not, so compiling every
 *          `<bdf>` font and producing every image a project declares has to
 *          happen in one asynchronous step *before* `generate()` runs, and its
 *          result handed in as data. Both hosts — the Node CLI and
 *          the designer's browser runtime — call this before `generate`, so
 *          `generate()` itself never touches bdfconv and stays synchronous and
 *          isomorphic.
 * Description: Compiles every `<bdf>` font in declaration order. Fonts may
 *              compile concurrently (`Promise.all`), but because `Promise.all`
 *              preserves the order of the array it was given regardless of which
 *              settles first, the result and its diagnostics are always built in
 *              declaration order (§13.9) — never in whichever order compilation
 *              happened to finish.
 *
 *              Two things become diagnostics rather than being thrown, because
 *              they are the author's defect, not this module's: the BDF's `src`
 *              file is missing from `assets` (unreadable, absent, or outside the
 *              project root — the host already applied that confinement when it
 *              built the map), and `compileBdf()` itself reporting failure. Both
 *              are located at the `<bdf>` declaration. A `range` the validator
 *              would already have rejected never reaches `compileBdf()` here,
 *              because `generate()` refuses a document with a validation error
 *              before this step's caller has any reason to run it.
 *
 *              Every diagnostic's `offendingText` follows the same convention
 *              `images.ts` uses for `<xbm>` (the declaration's own `src`) —
 *              PR-04b WO3b item 1 moved `generate()`'s "the host forgot to call
 *              this" guard off of parsing that field, so nothing here needs the
 *              font's name recoverable from a presentation field any more.
 *              {@link CompileProjectAssetsResult.failedFonts} is the explicit
 *              set the guard drives from instead.
 *
 *              **Images (PR-04b WO4).** The same step produces every image,
 *              whatever its kind: an `<xbm>` is parsed by `parseXbm()`, a
 *              `<convert>` is decoded and converted by `convertPng()`, and both
 *              arrive as the one `XbmImage` model in
 *              {@link CompileProjectAssetsResult.images}. The images emitter,
 *              the §18 budget and the editor target read only that map, so an
 *              image cannot be measured one way and emitted another. A
 *              declaration that failed is named in
 *              {@link CompileProjectAssetsResult.failedImages}, the explicit
 *              set `generate()`'s guard drives from (fonts' pattern).
 *              A `<convert>` whose own attributes the validator rejects (bad
 *              `mode`, `threshold` or size) is not converted and adds no
 *              diagnostic here: `validate` reports it, once, from the same
 *              `convertDeclProblems()` definition.
 *
 * Exports:
 * - CompileProjectAssetsInput:  Globals and the asset bytes read for them
 * - CompileProjectAssetsResult: Compiled fonts and produced images by name, any
 *                                diagnostics, and the names that failed
 * - compileProjectAssets():     Compiles every `<bdf>` font, produces every image
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { BdfFontDecl, ConvertImageDecl, Globals, ImageDecl, XbmImageDecl } from '../schema/globals.js';
import { compileBdf, type CompiledFont } from '../fonts/index.js';
import { convertDeclProblems, convertPng, parseXbm, type XbmImage } from '../images/index.js';

/** Input to {@link compileProjectAssets}. */
export interface CompileProjectAssetsInput {
  /** The project's globals — only `fonts` is read, for its `<bdf>` declarations. */
  readonly globals: Globals;
  /**
   * Asset bytes by the `src` path each declaration names, exactly as the host
   * read them (Node from disk, the designer from an editor buffer). An absent
   * entry means the file could not be read; this module never touches a
   * filesystem itself (typescript.md §1).
   */
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

/** What {@link compileProjectAssets} produced. */
export interface CompileProjectAssetsResult {
  /**
   * Every `<bdf>` font that compiled successfully, keyed by its declared
   * `name`. A font that failed has no entry here — only in {@link diagnostics}.
   */
  readonly fonts: ReadonlyMap<string, CompiledFont>;
  /**
   * Every image that was produced — `<xbm>` parsed, `<convert>` converted —
   * keyed by its declared `name`, in declaration order (§13.9). The one image
   * model: emission, the budget and the editor target read nothing else. An
   * image that failed has no entry here, only in {@link diagnostics} (or, for a
   * declaration `validate` rejects, only in that report).
   */
  readonly images: ReadonlyMap<string, XbmImage>;
  /**
   * One diagnostic per `<bdf>` that could not be compiled and per image that
   * could not be produced, fonts first, each in declaration order (§13.9),
   * located at the declaration.
   */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Declared `name` of every `<bdf>` that did not compile — explicit data for
   * `generate()`'s "the host forgot to call this" guard (PR-04b WO3b item 1),
   * rather than a control-flow decision inferred by reading a diagnostic's
   * `offendingText` (a presentation field, free to be reworded).
   */
  readonly failedFonts: ReadonlySet<string>;
  /**
   * Declared `name` of every `<xbm>` or `<convert>` that produced no image —
   * explicit data for `generate()`'s "the host forgot to call this" guard,
   * exactly as {@link failedFonts} is for fonts.
   */
  readonly failedImages: ReadonlySet<string>;
}

// missingBdfSource
// The diagnostic for a <bdf> whose src file did not come through in `assets` —
// missing, unreadable, or outside the project root, the same condition
// images.ts's missingAsset() reports for an <xbm>, applied to a <bdf>'s source.
// offendingText is font.src, images.ts's own convention (PR-04b WO3b item 1) —
// the guard that used to read this field is now driven by
// CompileProjectAssetsResult.failedFonts instead.
//   font — the declaration
function missingBdfSource(font: BdfFontDecl): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.MISSING_FILE,
    severity: 'error',
    file: font.loc?.file ?? '',
    line: font.loc?.line ?? 1,
    column: font.loc?.column ?? 1,
    message:
      `Font '${font.name}' names '${font.src}', which could not be read relative to the project ` +
      `directory. A <bdf> font is compiled into the generated code (§14.1), so the build cannot ` +
      `proceed without it.`,
    offendingText: font.src,
  };
}

// bdfCompileFailed
// The diagnostic for a <bdf> whose bytes were read but that bdfconv could not
// compile — compileBdf()'s own reason, plus its stderr lines if it ran at all.
// offendingText is font.src, images.ts's own convention (PR-04b WO3b item 1).
//   font   — the declaration
//   reason — compileBdf()'s human-readable reason
//   stderr — bdfconv's own stderr lines, [] if it never ran
function bdfCompileFailed(font: BdfFontDecl, reason: string, stderr: readonly string[]): Diagnostic {
  const stderrClause = stderr.length === 0 ? '' : ` bdfconv reported: ${stderr.join(' ')}`;
  return {
    code: DIAGNOSTIC_CODES.BDF_COMPILE_FAILED,
    severity: 'error',
    file: font.loc?.file ?? '',
    line: font.loc?.line ?? 1,
    column: font.loc?.column ?? 1,
    message: `Font '${font.name}' (${font.src}) could not be compiled: ${reason}${stderrClause}`,
    offendingText: font.src,
  };
}

// locOf
// A declaration's own location as the diagnostic fields, with the fallbacks
// every diagnostic in this module uses.
//   loc — the declaration's location, if the parser recorded one
function locOf(loc: SourceLocation | undefined): { readonly file: string; readonly line: number; readonly column: number } {
  return { file: loc?.file ?? '', line: loc?.line ?? 1, column: loc?.column ?? 1 };
}

// missingImageSource
// The diagnostic for an image whose src file did not come through in `assets`.
// MISSING_FILE, as for a <bdf>. The <xbm> text is exactly what images.ts said
// before this step took the job over (PR-04b WO4 item 3).
//   image — the declaration
function missingImageSource(image: ImageDecl): Diagnostic {
  const what =
    image.kind === 'xbm'
      ? 'An <xbm> asset is compiled into the generated code (§14.2), so the build cannot proceed without it.'
      : 'A <convert> source is converted into the generated code (§14.2), so the build cannot proceed without it.';
  return {
    code: DIAGNOSTIC_CODES.MISSING_FILE,
    severity: 'error',
    ...locOf(image.loc),
    message:
      `Image '${image.name}' names '${image.src}', which could not be read relative to the project ` +
      `directory. ${what}`,
    offendingText: image.src,
  };
}

// badXbm
// The diagnostic for an <xbm> whose bytes were read but are not usable XBM.
// TYPE_MISMATCH and this text, unchanged from when images.ts raised it.
//   image  — the declaration
//   reason — parseXbm()'s reason
function badXbm(image: XbmImageDecl, reason: string): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.TYPE_MISMATCH,
    severity: 'error',
    ...locOf(image.loc),
    message:
      `Image '${image.name}' names '${image.src}', which is not a usable XBM file: ${reason}. ` +
      `Export it as XBM (§14.2).`,
    offendingText: image.src,
  };
}

// badConvert
// The diagnostic for a <convert> whose PNG could not be turned into an XBM.
//   image   — the declaration
//   message — the sentence saying why
function badConvert(image: ConvertImageDecl, message: string): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.IMAGE_CONVERT_FAILED,
    severity: 'error',
    ...locOf(image.loc),
    message,
    offendingText: image.src,
  };
}

// One image's outcome: exactly one of a diagnostic, an image, or (for a
// declaration `validate` reports) nothing at all.
type ImageOutcome =
  | { readonly name: string; readonly ok: false; readonly diagnostic?: Diagnostic }
  | { readonly name: string; readonly ok: true; readonly image: XbmImage };

// produceImage
// One image, whatever its kind.
//   image  — the declaration
//   assets — asset bytes by src
async function produceImage(image: ImageDecl, assets: ReadonlyMap<string, Uint8Array>): Promise<ImageOutcome> {
  // --- Step 1: A <convert> the validator rejects is not converted ---
  if (image.kind === 'convert' && convertDeclProblems(image.name, image).length > 0) {
    return { name: image.name, ok: false };
  }
  if (image.kind === 'convert' && (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1)) {
    return { name: image.name, ok: false }; // Missing or non-numeric: the parser reported it.
  }

  // --- Step 2: The file's bytes, as the host read them ---
  const bytes = assets.get(image.src);
  if (bytes === undefined) {
    return { name: image.name, ok: false, diagnostic: missingImageSource(image) };
  }

  // --- Step 3a: <xbm> — the file is C source, parsed as UTF-8 text ---
  if (image.kind === 'xbm') {
    const parsed = parseXbm(new TextDecoder('utf-8').decode(bytes));
    return 'reason' in parsed
      ? { name: image.name, ok: false, diagnostic: badXbm(image, parsed.reason) }
      : { name: image.name, ok: true, image: parsed };
  }

  // --- Step 3b: <convert> — decode, convert, and hold it to the declared size ---
  const converted = await convertPng(bytes, {
    ...(image.mode !== undefined ? { mode: image.mode as 'threshold' | 'dither' } : {}),
    ...(image.threshold !== undefined ? { threshold: image.threshold } : {}),
  });
  if ('reason' in converted) {
    return {
      name: image.name,
      ok: false,
      diagnostic: badConvert(image, `Image '${image.name}' (${image.src}) could not be converted: ${converted.reason}.`),
    };
  }
  if (converted.width !== image.width || converted.height !== image.height) {
    return {
      name: image.name,
      ok: false,
      diagnostic: badConvert(
        image,
        `Image '${image.name}' declares ${image.width}x${image.height} but '${image.src}' is ` +
          `${converted.width}x${converted.height}; resize the PNG.`,
      ),
    };
  }
  return { name: image.name, ok: true, image: converted };
}

// One font's compile outcome: exactly one of a diagnostic (why it failed) or
// the font it compiled to — a discriminated union so the loop below cannot
// read the wrong field from a partially-matched shape.
type FontOutcome =
  | { readonly name: string; readonly ok: false; readonly diagnostic: Diagnostic }
  | { readonly name: string; readonly ok: true; readonly compiled: CompiledFont };

/**
 * @brief Compiles every `<bdf>` font and produces every image a project declares.
 *
 * Call this once before `generate()` and pass its result as
 * `GenerateInput.compiledAssets` — `generate()` itself never compiles a font or
 * reads an image.
 *
 * @param input Globals (for the declarations) and the asset bytes read for them.
 * @return Every font that compiled and every image that was produced, by name,
 *         and a diagnostic for every one that was not. Never throws for a
 *         defect in the author's project.
 */
export async function compileProjectAssets(input: CompileProjectAssetsInput): Promise<CompileProjectAssetsResult> {
  const bdfFonts = (input.globals.fonts ?? []).filter((font): font is BdfFontDecl => font.kind === 'bdf');

  // Concurrent, but Promise.all's result array is in the same order as
  // `bdfFonts` regardless of which compile settles first, so the fonts map and
  // diagnostics list below are always built in declaration order (§13.9) —
  // the WORKORDER's "may run them concurrently, but results ... must come out
  // in declaration order".
  const outcomes: readonly FontOutcome[] = await Promise.all(
    bdfFonts.map(async (font): Promise<FontOutcome> => {
      const bytes = input.assets.get(font.src);
      if (bytes === undefined) {
        return { name: font.name, ok: false, diagnostic: missingBdfSource(font) };
      }
      const compiled = await compileBdf({ bdf: bytes, identifier: font.name, range: font.range });
      if (!compiled.ok) {
        return { name: font.name, ok: false, diagnostic: bdfCompileFailed(font, compiled.reason, compiled.stderr) };
      }
      return { name: font.name, ok: true, compiled };
    }),
  );

  // Images likewise: concurrent, collected in declaration order.
  const imageOutcomes: readonly ImageOutcome[] = await Promise.all(
    (input.globals.images ?? []).map((image) => produceImage(image, input.assets)),
  );

  const fonts = new Map<string, CompiledFont>();
  const images = new Map<string, XbmImage>();
  const diagnostics: Diagnostic[] = [];
  const failedFonts = new Set<string>();
  const failedImages = new Set<string>();
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      diagnostics.push(outcome.diagnostic);
      failedFonts.add(outcome.name);
      continue;
    }
    fonts.set(outcome.name, outcome.compiled);
  }
  for (const outcome of imageOutcomes) {
    if (!outcome.ok) {
      if (outcome.diagnostic !== undefined) {
        diagnostics.push(outcome.diagnostic);
      }
      failedImages.add(outcome.name);
      continue;
    }
    images.set(outcome.name, outcome.image);
  }
  return { fonts, images, diagnostics, failedFonts, failedImages };
}
