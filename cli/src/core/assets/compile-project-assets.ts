/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/assets/compile-project-assets.ts
 * Purpose: The seam WO1 named and WO3 fills: `generate()` is synchronous but
 *          `compileBdf()` is not, so compiling every `<bdf>` font a project
 *          declares has to happen in one asynchronous step *before* `generate()`
 *          runs, and its result handed in as data. Both hosts — the Node CLI and
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
 * Exports:
 * - CompileProjectAssetsInput:  Globals and the asset bytes read for them
 * - CompileProjectAssetsResult: Compiled fonts by name, any diagnostics, and
 *                                the set of font names that failed to compile
 * - compileProjectAssets():     Compiles every declared `<bdf>` font
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { BdfFontDecl, Globals } from '../schema/globals.js';
import { compileBdf, type CompiledFont } from '../fonts/index.js';

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
   * One diagnostic per `<bdf>` that could not be compiled, in declaration
   * order (§13.9), located at the font's own declaration.
   */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Declared `name` of every `<bdf>` that did not compile — explicit data for
   * `generate()`'s "the host forgot to call this" guard (PR-04b WO3b item 1),
   * rather than a control-flow decision inferred by reading a diagnostic's
   * `offendingText` (a presentation field, free to be reworded).
   */
  readonly failedFonts: ReadonlySet<string>;
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

/**
 * @brief Compiles every `<bdf>` font a project declares.
 *
 * Call this once before `generate()` and pass its result as
 * `GenerateInput.compiledAssets` — `generate()` itself never compiles a font.
 *
 * @param input Globals (for the `<bdf>` declarations) and the asset bytes read
 *              for them.
 * @return Every font that compiled, by name, and a diagnostic for every one
 *         that did not. Never throws for a defect in the author's project.
 */
// One font's compile outcome: exactly one of a diagnostic (why it failed) or
// the font it compiled to — a discriminated union so the loop below cannot
// read the wrong field from a partially-matched shape.
type FontOutcome =
  | { readonly name: string; readonly ok: false; readonly diagnostic: Diagnostic }
  | { readonly name: string; readonly ok: true; readonly compiled: CompiledFont };

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

  const fonts = new Map<string, CompiledFont>();
  const diagnostics: Diagnostic[] = [];
  const failedFonts = new Set<string>();
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      diagnostics.push(outcome.diagnostic);
      failedFonts.add(outcome.name);
      continue;
    }
    fonts.set(outcome.name, outcome.compiled);
  }
  return { fonts, diagnostics, failedFonts };
}
