/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/report/model.ts
 * Purpose: The vocabulary §18's budget speaks, with no logic in it. §1.3
 *          withdrew v0.1's "zero runtime overhead" claim and replaced it with an
 *          obligation: the CLI reports the cost on every build, so the cost is
 *          visible rather than asserted away. That obligation is only met if the
 *          report cannot quietly invent a figure — so the shape here makes
 *          "I do not know this" a **first-class value** ({@link Unmeasured})
 *          rather than a zero, a blank, or a plausible guess.
 * Description: Three reports, matching the three keys `generate --json` carries
 *              beside its files and diagnostics:
 *
 *              - {@link BudgetReport}   — §18's flash and static-RAM lines
 *              - {@link CapacityReport} — §18.1's [D-21] pool figures
 *              - {@link RealisationReport} — §13.5's per-element outcome
 *
 *              Every cost line carries a {@link Figure}, which is either
 *              measured (a byte count, with how it was derived) or unmeasured
 *              (with why it cannot be known). A consumer must branch on `kind`,
 *              so it cannot read an absent figure as a cheap one. Nothing here
 *              is a percentage of a budget: a percentage of a total that is
 *              mostly unmeasured would be the dishonest claim §1.3 forbids.
 *
 *              Names are the author's. A screen is `bounds`, an element
 *              `track_readout` — never the emitted `ui_obj_track_readout`. The
 *              report exists so an author can find the declaration that costs
 *              them something, and they never wrote the `ui_obj_` prefix
 *              (§13.4, PR-04 WO12).
 *
 * Exports:
 * - UNMEASURED_KIND, MEASURED_KIND: the two `Figure` discriminants
 * - Measured, Unmeasured, Figure: a cost line's figure, or why there is none
 * - BudgetLine:         One line of the flash or RAM table, with its figure and caveat
 * - BudgetReport:       §18's report for one build
 * - CapacityEntry:      One [D-21] capacity, with the macro it is emitted as
 * - CapacityReport:     §18.1's report
 * - ElementRealisation: What one element became, and why (§13.5)
 * - ScreenRealisation:  One screen's elements and its object/draw-call totals
 * - DemotionStatus:     [D-18]'s amendment, stated on every run
 * - RealisationReport:  §13.5's report
 * - GenerateReport:     The three reports together
 */

import type { RealisationReason } from '../realise/index.js';

/** {@link Measured.kind} — a figure the generator derived. */
export const MEASURED_KIND = 'measured';

/** {@link Unmeasured.kind} — a figure the generator cannot know (§1.3). */
export const UNMEASURED_KIND = 'unmeasured';

/**
 * A cost the generator derived from the document, exactly.
 *
 * `derivation` is not decoration: §1.3 forbids a figure the tooling cannot
 * substantiate, and the only way a reader can check a figure is to be told what
 * it was computed from. A `Measured` with an unconvincing derivation is a defect
 * in this module, not a formatting nicety.
 */
export interface Measured {
  readonly kind: typeof MEASURED_KIND;
  /** The cost in bytes. Exact — never rounded, never an upper bound. */
  readonly bytes: number;
  /** What it was derived from, e.g. "max_len + 1 per string subject (§8.2)". */
  readonly derivation: string;
}

/**
 * A cost the generator cannot know, with the reason it cannot.
 *
 * This is the value §1.3 exists for. The generator knows class names, that they
 * are default-constructible, and their manifests — and explicitly **not** the
 * size or field layout of any runtime class (§13.7). So a widget's `sizeof`, the
 * runtime's flash footprint and a font's compiled size are not merely
 * unmeasured today: they are outside what this contract lets the generator
 * assume. Printing a plausible number for one would be the claim §1.3 withdrew.
 */
export interface Unmeasured {
  readonly kind: typeof UNMEASURED_KIND;
  /** Why it cannot be known, and what would measure it. */
  readonly reason: string;
}

/** A cost line's figure: derived, or honestly absent. */
export type Figure = Measured | Unmeasured;

/** One line of §18's flash or RAM table. */
export interface BudgetLine {
  /** What the line is about, e.g. "string subject storage". */
  readonly item: string;
  /**
   * The countable part, when there is one: how many fonts, objects, pool slots.
   * A count is derivable even when the size of each is not, and it is what makes
   * an `unmeasured` line worth printing at all — `objects (9) unmeasured` tells
   * an author something; `objects unmeasured` does not.
   */
  readonly count?: number;
  /** The names behind `count`, in document order, when naming them helps. */
  readonly names?: readonly string[];
  readonly figure: Figure;
  /**
   * A caveat on a figure that **is** reported — what it is not, as distinct from
   * {@link Measured.derivation}, which is where it came from.
   *
   * It exists for the framebuffer. That figure is exact for the constructor the
   * `<target>` names, and §18 asks for it; but the application builds the `U8G2`
   * instance itself (§12.1, §13.10) and may build a page-mode or differently
   * sized one. Reporting the figure and saying so is honest. Refusing to report
   * a figure the catalogue holds exactly, or reporting it as if it measured the
   * application's own buffer, would each be a different kind of dishonest.
   */
  readonly note?: string;
}

/** §18's budget for one build. */
export interface BudgetReport {
  /** The CLI version that produced the build, as stamped into every file (§13.9). */
  readonly generator: string;
  /** The `<target>` built. */
  readonly target: string;
  /** Its U8G2 constructor (§5.1). */
  readonly setup: string;
  /** The display's size, when the catalogue has a record for `setup`. */
  readonly display?: { readonly width: number; readonly height: number };
  /**
   * The target's `--ram-budget` in bytes, when it declares one (§18).
   *
   * Reported as a declaration, never as a denominator: §18's example prints a
   * percentage of the budget, and a percentage whose numerator is mostly
   * {@link Unmeasured} would be exactly the figure §1.3 forbids. The one
   * comparison that is honest — a single derived line already exceeding the
   * whole budget — is reported as {@link BudgetReport.overBudget}.
   */
  readonly ramBudget?: number;
  /**
   * True only when the **derived** static RAM alone exceeds `ramBudget`. It
   * cannot be false-negative-free, and says so: the total is not known, so a
   * project under this test may still not fit.
   */
  readonly overBudget?: boolean;
  /** §18's flash table, in reporting order. */
  readonly flash: readonly BudgetLine[];
  /** §18's static-RAM table, in reporting order. */
  readonly ram: readonly BudgetLine[];
  /** Derived static RAM — the sum of the `measured` RAM lines only. */
  readonly ramDerivedBytes: number;
}

/**
 * One [D-21] capacity, as both the report and the generated header carry it.
 *
 * `macro` is here so the two cannot drift: §18.1's table and
 * `u8g2gl_generated_config.h` are two renderings of one `Capacities`, and a test
 * reads the macro out of the emitted header and compares it against `value`. A
 * report that disagreed with the header a build actually compiles against would
 * be worse than no report, because it would be checked against the wrong thing.
 */
export interface CapacityEntry {
  /** The macro the generated header defines, e.g. `U8G2GL_MAX_OBJECTS_PER_SCREEN`. */
  readonly macro: string;
  /** §18.1's row label, e.g. "objects, busiest screen". */
  readonly label: string;
  /** The figure, exactly as the header defines it. */
  readonly value: number;
  /**
   * The structural ceiling, where one exists: 254 objects per screen, because
   * `parent_index_` is a `uint8_t` and one value is the root sentinel ([A-3]).
   * The other figures have no fixed ceiling (§18.1), so they carry none.
   */
  readonly ceiling?: number;
  /** What the figure is about, in the author's own names — a screen, an element, the styles. */
  readonly names: readonly string[];
}

/** §18.1's capacity report ([D-21]). */
export interface CapacityReport {
  /** The generated header these figures are emitted into, for the reader to check. */
  readonly header: string;
  /** The four capacities, in [D-21]'s order. */
  readonly entries: readonly CapacityEntry[];
}

/** What one element became, and every condition of §13.5's rule that held. */
export interface ElementRealisation {
  /**
   * The author's name, joined by each enclosing composite instance as §13.4
   * joins it (`bar_location` for `location` inside instance `bar`). Never the
   * emitted `ui_obj_` identifier. Empty for an unnamed element, which [U-1]
   * makes an error, so it cannot reach a successful build.
   */
  readonly name: string;
  /** Its tag, e.g. `u8g2gl_label`. */
  readonly tag: string;
  /** The file, line and column the author wrote it at. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** What it became (§13.5). */
  readonly realisation: 'object' | 'draw_calls';
  /** Every condition that held, in `REALISATION_REASONS` order (§13.5, §6.1). */
  readonly reasons: readonly RealisationReason[];
  /**
   * Whether §13.5's rule itself requires an object — any reason other than
   * `class_backed`. False on an `object` element is one [D-18]'s amendment is
   * paying for, which {@link DemotionStatus} counts.
   */
  readonly requiredByRule: boolean;
  /** Pool slots and observers it costs — one per binding ([D-21]). */
  readonly bindings: number;
}

/** One screen's realisation, with the totals §18 reports for it. */
export interface ScreenRealisation {
  /** The screen's name as the author wrote it. */
  readonly screen: string;
  /** Objects emitted, which is the length of its object array (§13.3). */
  readonly objects: number;
  /** Elements compiled to draw calls instead (§13.5). */
  readonly drawCallElements: number;
  /** Every element, depth-first in document order (§13.9). */
  readonly elements: readonly ElementRealisation[];
}

/**
 * [D-18]'s 2026-09-13 amendment, stated on **every** run.
 *
 * The amendment requires it: a classed element is always realised as an object
 * for now, even where §13.5 says it need not be, and §18's report "must state
 * explicitly that classed-element demotion is not yet delivered, so nobody reads
 * the report as the rule's full saving". A report that only mentioned the gap
 * when it happened to bite would be read as the full saving on every project
 * that did not trigger it.
 */
export interface DemotionStatus {
  /** Always `false` in PR-04. A field rather than a constant, so delivering it is one edit. */
  readonly classedElementDemotionDelivered: false;
  /**
   * Objects the amendment is paying for: realised as objects although no reason
   * other than `class_backed` held. Exact, and it may be 0 — the statement is
   * still made.
   */
  readonly objectsNotRequiredByRule: number;
  /** Their names, in document order, so the cost can be located. */
  readonly names: readonly string[];
  /** The statement itself, so a consumer can quote it without composing prose. */
  readonly statement: string;
}

/** §13.5's realisation report, reported per [D-16] and §13.5. */
export interface RealisationReport {
  /** [D-18]'s amendment, on every run. */
  readonly demotion: DemotionStatus;
  /** Screens in document order. */
  readonly screens: readonly ScreenRealisation[];
  /** Objects across every screen. */
  readonly totalObjects: number;
  /** Elements compiled to draw calls across every screen. */
  readonly totalDrawCallElements: number;
}

/** The three reports `generate` produces beside its files and diagnostics. */
export interface GenerateReport {
  readonly budget: BudgetReport;
  readonly capacity: CapacityReport;
  readonly realisation: RealisationReport;
}
