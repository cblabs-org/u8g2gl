/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/report/budget.ts
 * Purpose: Builds §18's budget, §18.1's capacity table and §13.5's realisation
 *          report from the model the build was emitted from — and from nothing
 *          else. §1.3 makes the report the mechanism by which U8G2GL's cost stays
 *          honest "by tooling rather than by good intentions", which only works
 *          if the report and the generated code are two views of one analysis. So
 *          this module **counts nothing**: objects, bindings, styles and observer
 *          slots all come from the `Capacities` [D-21] already computed and
 *          emitted, and every element's outcome from the realisation §13.5
 *          already decided. A second count here would be the fifth instance of
 *          the defect PR-04 has met four times (WO8c's object count, two
 *          reserved-prefix lists, three spellings of "drawing element").
 * Description: `buildGenerateReport()` is a pure projection. Where a cost is
 *              derivable it is derived and its derivation recorded; where it is
 *              not, an {@link Unmeasured} carries the reason. Three costs are
 *              structurally unknowable to the generator and are always
 *              unmeasured:
 *
 *              - **Any flash figure.** §13.7 forbids the generator assuming
 *                anything about a runtime class's size or layout, so the runtime
 *                core, the element classes and a `<builtin>` font's compiled
 *                array are all the runtime's and U8G2's business. Measuring them
 *                needs a linker map for a reference build (§18).
 *              - **A widget's `sizeof`.** Same rule: the generator knows a class
 *                is default-constructible and nothing about its fields.
 *
 *              What *is* derivable is derived exactly: a string subject's storage
 *              from its declared `max_len + 1` (§8.2), an `<xbm>`'s bytes from
 *              the asset the build compiled in, the framebuffer from the
 *              catalogue's tile dimensions for the target's setup ([D-14], §18),
 *              and every count and capacity [D-21] emitted.
 *
 *              The framebuffer was reported as unmeasured until the WO12
 *              follow-up. The reasoning — that the application owns the `U8G2`
 *              instance — was a caveat mistaken for an impossibility: the figure
 *              is exact for the constructor the `<target>` names, §18 asks for it
 *              by name, and the caveat belongs beside it as a
 *              {@link BudgetLine.note}.
 *
 * Exports:
 * - ReportInput:            What building the report needs
 * - buildGenerateReport():  The three reports for one successful build
 */

import type { DisplayRecord } from '../../schema/display-record.js';
import type { Globals } from '../../schema/globals.js';
import type { ManifestRegistry } from '../../manifest/index.js';
import type { Target } from '../../schema/project.js';
import { classOf } from '../emit/screen-model.js';
import { GENERATED_CONFIG_HEADER } from '../emit/generated-config.js';
import { parseXbm } from '../emit/xbm.js';
import { compareCodeUnits } from '../../order.js';
import {
  MAX_OBJECTS_PER_SCREEN,
  walkRealised,
  type Capacities,
  type RealisedElement,
  type RealisedScreen,
} from '../realise/index.js';
import {
  MEASURED_KIND,
  UNMEASURED_KIND,
  type BudgetLine,
  type BudgetReport,
  type CapacityEntry,
  type DemotionStatus,
  type ElementRealisation,
  type Figure,
  type GenerateReport,
  type RealisationReport,
  type ScreenRealisation,
} from './model.js';

/** Everything {@link buildGenerateReport} reads. */
export interface ReportInput {
  readonly globals: Globals;
  /** The manifests the build used, for the element classes it names. */
  readonly manifests: ManifestRegistry;
  /** Realisation's answer per screen, in document order (§13.5, §13.3). */
  readonly realised: readonly RealisedScreen[];
  /** The capacities [D-21] counted and the generated header carries — never recounted here. */
  readonly capacities: Capacities;
  /** The `<target>` built. */
  readonly target: Target;
  /** Its catalogued display, when the catalogue has a record for the target's `setup`. */
  readonly display?: DisplayRecord;
  /** The CLI version stamped into the build (§13.9). */
  readonly generatorVersion: string;
  /**
   * Asset text by the `src` path each declaration names — the same map emission
   * compiled the `<xbm>` arrays from, so the byte count reported is the byte
   * count emitted.
   */
  readonly assets: ReadonlyMap<string, string>;
}

// measured
// A derived cost, with what it was derived from.
function measured(bytes: number, derivation: string): Figure {
  return { kind: MEASURED_KIND, bytes, derivation };
}

// unmeasured
// A cost the generator cannot know, with why (§1.3).
function unmeasured(reason: string): Figure {
  return { kind: UNMEASURED_KIND, reason };
}

/**
 * The reason every flash line carries.
 *
 * One constant rather than a reason per line, because the reason genuinely is
 * the same one in every case and repeating it in five slightly different
 * wordings would invite a reader to think some line is closer to measurable than
 * the others. None is: §13.7 forbids the generator assuming anything about a
 * runtime class's size, and a font array lives in U8G2.
 */
const FLASH_REASON =
  'flash cost needs a linker map for a reference build (§18); §13.7 forbids the generator assuming ' +
  'any runtime class size or layout';

/** The reason a widget instance's RAM cost is unmeasured — the same §13.7 rule. */
const SIZEOF_REASON =
  "sizeof is the runtime's, not the generator's: §13.7 lets the generator know only that a class is " +
  'default-constructible and what its manifest declares';

// elementClassesByOrigin
// The distinct C++ classes the build's objects are instances of, split by whose
// they are: `framework` for the runtime's own (`u8g2gl_label`), `project` for a
// user's `wd_` widget. Names come from `classOf()`, the one spelling emission
// uses, so a composite counts as the `u8g2gl_obj` container it really is
// ([D-18]) rather than as a class of its own.
//   input — the report input; reads `realised` and `manifests`
function elementClassesByOrigin(input: ReportInput): {
  readonly framework: readonly string[];
  readonly project: readonly string[];
} {
  const framework = new Set<string>();
  const project = new Set<string>();
  for (const screen of input.realised) {
    for (const object of screen.objects) {
      const manifest = input.manifests.get(object.element.node.tag);
      if (manifest === undefined) {
        continue; // An unknown tag is Pass 2's error; no build reaches here with one.
      }
      (manifest.origin === 'framework' ? framework : project).add(classOf(manifest).name);
    }
  }
  // Sorted through core/order.ts's compareCodeUnits, never by insertion or
  // locale, so the same document reports the same list on every machine (§13.9).
  const sorted = (names: Set<string>): readonly string[] => [...names].sort(compareCodeUnits);
  return { framework: sorted(framework), project: sorted(project) };
}

// imageDataBytes
// The exact bytes the `<xbm>` arrays add, read from the very assets emission
// compiled in. Derivable, so it is derived: §18's own purpose includes catching
// an asset that is far larger than the project needs, and an author cannot see
// that in XML. An asset that is absent or malformed refuses the build before the
// report is built, so a missing entry here can only be a `<convert>`, which is
// refused too — either way it contributes nothing rather than a guess.
//   input — the report input; reads `globals.images` and `assets`
function imageDataBytes(input: ReportInput): { readonly bytes: number; readonly names: readonly string[] } {
  let bytes = 0;
  const names: string[] = [];
  for (const image of input.globals.images ?? []) {
    if (image.kind !== 'xbm') {
      continue;
    }
    const text = input.assets.get(image.src);
    if (text === undefined) {
      continue;
    }
    const parsed = parseXbm(text);
    if ('reason' in parsed) {
      continue; // Malformed: emission refuses the build, so no report is built for it.
    }
    bytes += parsed.bytes.length;
    names.push(image.name);
  }
  return { bytes, names };
}

// flashLines
// §18's flash table. Every line is unmeasured except the `<xbm>` arrays, whose
// bytes the generator emits itself and therefore knows exactly.
//   input — the report input
function flashLines(input: ReportInput): readonly BudgetLine[] {
  const classes = elementClassesByOrigin(input);
  const fonts = (input.globals.fonts ?? []).filter((font) => font.kind === 'builtin').map((font) => font.name);
  const images = imageDataBytes(input);

  return [
    { item: 'runtime core', figure: unmeasured(FLASH_REASON) },
    {
      item: 'framework element classes',
      count: classes.framework.length,
      names: classes.framework,
      figure: unmeasured(FLASH_REASON),
    },
    {
      item: 'custom element classes',
      count: classes.project.length,
      names: classes.project,
      figure: unmeasured(FLASH_REASON),
    },
    {
      item: 'fonts',
      count: fonts.length,
      names: fonts,
      figure: unmeasured(
        `a <builtin> font's array lives in U8G2, not in generated code, so its size is U8G2's: ${FLASH_REASON}`,
      ),
    },
    {
      item: 'image data (xbm arrays)',
      count: images.names.length,
      names: images.names,
      figure: measured(images.bytes, 'the byte count of the arrays this build emits (§14.2)'),
    },
    { item: 'generated code', figure: unmeasured(FLASH_REASON) },
  ];
}

// stringSubjectStorage
// The one exactly derivable static-RAM figure: a string subject allocates
// `max_len + 1` bytes of character storage (§8.2), and the generator emitted that
// very number into `u8g2gl_subject_string_n<max_len, N>`. A string subject with
// no `max_len` is **not** counted and is reported separately: its capacity is
// `U8G2GL_MAX_STRING_LEN`, a macro the application's build may override, so the
// generator does not know it (WO11b finding 6).
//   input — the report input; reads `capacities.subjects`
function stringSubjectStorage(input: ReportInput): {
  readonly bytes: number;
  readonly declared: readonly string[];
  readonly undeclared: readonly string[];
} {
  let bytes = 0;
  const declared: string[] = [];
  const undeclared: string[] = [];
  for (const entry of input.capacities.subjects) {
    if (entry.subject.type !== 'string') {
      continue;
    }
    if (entry.maxLen === undefined) {
      undeclared.push(entry.subject.name);
      continue;
    }
    bytes += entry.maxLen + 1;
    declared.push(entry.subject.name);
  }
  return { bytes, declared, undeclared };
}

// framebufferLine
// §18's framebuffer line. Exact, and sourced: the display catalogue's
// `framebufferBytes` is `tiles.width * tiles.height * 8`, read from U8G2's own
// display-info tables ([D-14]), which is the same arithmetic §5.2 describes as
// "taken from the buffer allocator" and the same figure §18's example prints
// (`framebuffer (256x64) 2.0 KB <- derived from u8g2_m_32_8_f`).
//
// This was reported as unmeasured until the WO12 follow-up, on the reasoning that
// the application owns the U8G2 instance. That reasoning is a *caveat*, not a
// reason to withhold a figure the catalogue holds exactly — §1.3 forbids a figure
// the tooling cannot substantiate, and this one it can — so the caveat is now
// attached to the reported figure as a note.
//
// The allocator symbol is named, because it is how a reader checks the number
// against U8G2 itself: `u8g2_m_<tilesW>_<tilesH>_f` in `u8g2_d_memory.c`. The
// bytes come from the catalogue's tile dimensions, never from parsing that name,
// so the report cannot disagree with the catalogue about the figure while
// agreeing with it about the symbol.
//
// Unmeasured only when the catalogue has no record for the target's setup, which
// is the one case where there is genuinely nothing to report.
//   input — the report input; reads `display` and `target`
function framebufferLine(input: ReportInput): BudgetLine {
  const { display, target } = input;
  if (display === undefined) {
    return {
      item: 'framebuffer',
      figure: unmeasured(
        `the display catalogue has no record for '${target.setup}', so its tile dimensions — and ` +
          'therefore its buffer size — are not known here ([D-14], §5.2)',
      ),
    };
  }
  const allocator = `u8g2_m_${display.tiles.width}_${display.tiles.height}_f`;
  return {
    item: `framebuffer (${display.width}x${display.height})`,
    figure: measured(
      display.framebufferBytes,
      `${display.tiles.width}x${display.tiles.height} tiles x 8 bytes, from U8G2's buffer allocator ` +
        `${allocator} ([D-14], §5.2)`,
    ),
    note:
      'the application constructs the U8G2 instance and owns its buffer (§12.1, §13.10), so this is the ' +
      `full-buffer cost of the setup target '${target.name}' names, not a measurement of the ` +
      "application's own buffer: a page-mode or differently sized constructor costs something else",
  };
}

// ramLines
// §18's static-RAM table: derived where the document or the catalogue settles the
// figure, and unmeasured — with the reason — everywhere the size belongs to the
// runtime.
//   input — the report input
function ramLines(input: ReportInput): readonly BudgetLine[] {
  const { capacities } = input;
  const strings = stringSubjectStorage(input);
  const objects = input.realised.reduce((sum, screen) => sum + screen.objects.length, 0);
  const observerSlots = capacities.subjects.reduce((sum, entry) => sum + entry.observers, 0);

  const lines: BudgetLine[] = [framebufferLine(input),
    {
      item: 'element objects',
      count: objects,
      figure: unmeasured(SIZEOF_REASON),
    },
    {
      item: 'string subject storage',
      count: strings.declared.length,
      names: strings.declared,
      figure: measured(strings.bytes, 'max_len + 1 bytes per declared string subject (§8.2)'),
    },
  ];

  if (strings.undeclared.length > 0) {
    lines.push({
      item: 'string subject storage, no max_len',
      count: strings.undeclared.length,
      names: strings.undeclared,
      figure: unmeasured(
        'a string subject with no max_len is sized by U8G2GL_MAX_STRING_LEN, which the application build ' +
          'may override, so the generator cannot know it — declare max_len to see the figure',
      ),
    });
  }

  lines.push(
    {
      item: 'subject observer slots',
      count: observerSlots,
      figure: unmeasured(SIZEOF_REASON),
    },
    {
      item: 'binding pool slots',
      count: capacities.totalBindings,
      figure: unmeasured(SIZEOF_REASON),
    },
    {
      item: 'styles',
      count: capacities.styles,
      names: capacities.styleNames,
      figure: unmeasured(SIZEOF_REASON),
    },
  );

  return lines;
}

// capacityEntries
// §18.1's four rows, each naming the macro `u8g2gl_generated_config.h` defines
// it as. The values are `Capacities`' own, so the table and the header a build
// compiles against cannot disagree; a test reads the macros back out of the
// emitted header and compares.
//   capacities — [D-21]'s figures, as emitted
function capacityEntries(capacities: Capacities): readonly CapacityEntry[] {
  return [
    {
      macro: 'U8G2GL_MAX_OBJECTS_PER_SCREEN',
      label: 'objects, busiest screen',
      value: capacities.maxObjectsPerScreen,
      // The only figure with a fixed ceiling: uint8_t parent indices ([A-3]).
      ceiling: MAX_OBJECTS_PER_SCREEN,
      names: capacities.busiestScreen === undefined ? [] : [capacities.busiestScreen],
    },
    {
      macro: 'U8G2GL_MAX_BINDINGS_PER_OBJ',
      label: 'bindings, busiest object',
      value: capacities.maxBindingsPerObject,
      names: capacities.busiestObject === undefined ? [] : [capacities.busiestObject],
    },
    {
      macro: 'U8G2GL_MAX_TOTAL_BINDINGS',
      label: 'bindings, total',
      value: capacities.totalBindings,
      names: [],
    },
    {
      macro: 'U8G2GL_MAX_STYLES',
      label: 'styles',
      value: capacities.styles,
      names: capacities.styleNames,
    },
  ];
}

// elementReport
// One element's realisation, named as the author wrote it.
//   element — a realised element
function elementReport(element: RealisedElement): ElementRealisation {
  const loc = element.element.source.loc;
  return {
    name: element.identifier,
    tag: element.element.node.tag,
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    realisation: element.realisation,
    reasons: element.reasons,
    requiredByRule: element.requiredByRule,
    bindings: element.bindings.length,
  };
}

/**
 * The statement [D-18]'s amendment requires on every run.
 *
 * Fixed prose, in one place, so the human report and the JSON say the same thing
 * — a consumer that branched on `classedElementDemotionDelivered` and a person
 * reading the table must not be told different things.
 */
const DEMOTION_STATEMENT =
  'Classed-element demotion is not yet delivered ([D-18] amendment, 2026-09-13): an element backed by a ' +
  'C++ class is always realised as an object, even where §13.5 says it need not be. This report is ' +
  "therefore not the realisation rule's full saving.";

// realisationReport
// §13.5's report: every element's outcome and reasons, the per-screen totals, and
// [D-18]'s amendment stated whether or not it bit.
//   realised — the screens the build emitted
function realisationReport(realised: readonly RealisedScreen[]): RealisationReport {
  const screens: ScreenRealisation[] = [];
  const notRequired: string[] = [];
  let totalObjects = 0;
  let totalDrawCallElements = 0;

  for (const screen of realised) {
    const elements: ElementRealisation[] = [];
    let drawCallElements = 0;
    walkRealised(screen.elements, (element) => {
      elements.push(elementReport(element));
      if (element.realisation === 'draw_calls') {
        drawCallElements++;
        return;
      }
      // An object the rule itself does not require is one the amendment is
      // paying for, and §18 must be able to name it.
      if (!element.requiredByRule) {
        notRequired.push(element.identifier);
      }
    });
    screens.push({
      screen: screen.screen.name,
      objects: screen.objects.length,
      drawCallElements,
      elements,
    });
    totalObjects += screen.objects.length;
    totalDrawCallElements += drawCallElements;
  }

  const demotion: DemotionStatus = {
    classedElementDemotionDelivered: false,
    objectsNotRequiredByRule: notRequired.length,
    names: notRequired,
    statement: DEMOTION_STATEMENT,
  };
  return { demotion, screens, totalObjects, totalDrawCallElements };
}

/**
 * @brief Builds §18's budget, §18.1's capacities and §13.5's realisation report.
 *
 * A pure projection of the model the build was emitted from. It counts no
 * objects, bindings, styles or observers of its own: those come from the
 * `Capacities` the generated header carries, so the report and the header are
 * two renderings of one arithmetic ([D-21], PR-04 WO8c).
 *
 * @param input The build's globals, manifests, realisation, capacities, target
 *              and assets, and the generator version stamped into it.
 * @return The three reports `generate --json` carries. Deterministic for a given
 *         document (§13.9): every list is in document order or sorted by code
 *         unit, and nothing is read from a `Set`'s iteration order.
 */
export function buildGenerateReport(input: ReportInput): GenerateReport {
  // --- Step 1: The two cost tables (§18) ---
  const ram = ramLines(input);
  const ramDerivedBytes = ram.reduce(
    (sum, line) => (line.figure.kind === MEASURED_KIND ? sum + line.figure.bytes : sum),
    0,
  );

  // --- Step 2: The declared RAM budget, reported but never used as a denominator ---
  // A percentage of a total that is mostly unmeasured is the claim §1.3 withdrew.
  // The one honest comparison is whether what *is* derived already exceeds the
  // budget, which cannot be a false positive.
  const ramBudget = input.target.ramBudget;

  const budget: BudgetReport = {
    generator: input.generatorVersion,
    target: input.target.name,
    setup: input.target.setup,
    ...(input.display !== undefined
      ? { display: { width: input.display.width, height: input.display.height } }
      : {}),
    ...(ramBudget !== undefined ? { ramBudget, overBudget: ramDerivedBytes > ramBudget } : {}),
    flash: flashLines(input),
    ram,
    ramDerivedBytes,
  };

  // --- Step 3: §18.1's capacities, and §13.5's outcome per element ---
  return {
    budget,
    capacity: { header: GENERATED_CONFIG_HEADER, entries: capacityEntries(input.capacities) },
    realisation: realisationReport(input.realised),
  };
}
