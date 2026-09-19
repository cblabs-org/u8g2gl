/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/diagnostic.ts
 * Purpose: Defines structured diagnostic representations for errors, warnings,
 *          and hints emitted by XML parsing, schema validation, and codegen.
 *          Per §1.2 and §15, diagnostic quality is a primary product surface;
 *          diagnostics carry stable machine codes and structured suggestions.
 * Description: Implements the diagnostic contract specified in design_spec §15
 *              and [D-16]. Defines diagnostic severity levels, standard diagnostic
 *              codes, and the immutable Diagnostic interface.
 *
 * Exports:
 * - Severity: Diagnostic severity level ('error' | 'warning' | 'info')
 * - Diagnostic: Structured diagnostic carrying code, location, message, and suggestions
 * - DIAGNOSTIC_CODES: Constant dictionary of stable U8G2GL diagnostic code identifiers
 * - DiagnosticCode: Union type of all valid diagnostic code string values
 */

/**
 * Diagnostic severity level.
 * Errors abort code generation; warnings highlight potential defects or budget limits;
 * info entries convey informational migration or optimisation notices.
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * Stable diagnostic identifiers emitted by parser, validator, and generator.
 * Per §15.3 and [D-16], diagnostic codes are a stable programmatic API. Consumers
 * (IDEs, agent skills, CI) branch on `code` rather than parsing human prose.
 */
export const DIAGNOSTIC_CODES = {
  UNKNOWN_FONT: 'U8G2GL_UNKNOWN_FONT',
  UNKNOWN_IMAGE: 'U8G2GL_UNKNOWN_IMAGE',
  UNKNOWN_SUBJECT: 'U8G2GL_UNKNOWN_SUBJECT',
  UNKNOWN_STYLE: 'U8G2GL_UNKNOWN_STYLE',
  UNKNOWN_COMPONENT: 'U8G2GL_UNKNOWN_COMPONENT',
  UNKNOWN_WIDGET: 'U8G2GL_UNKNOWN_WIDGET',
  UNKNOWN_DISPLAY: 'U8G2GL_UNKNOWN_DISPLAY',
  PAGE_MODE_DISPLAY: 'U8G2GL_PAGE_MODE_DISPLAY',
  UNKNOWN_ATTRIBUTE: 'U8G2GL_UNKNOWN_ATTRIBUTE',
  MISSING_REQUIRED: 'U8G2GL_MISSING_REQUIRED',
  /**
   * An element carries no `name` attribute ([U-1]).
   *
   * **This code is deliberately emitted at two severities, and which one you get
   * is a deterministic function of the `MissingNamePolicy` the caller passed to
   * the parser — never a judgement made inside it.** Under `'error'` (the
   * default, and the CLI's build journey) it is an `error` and no name is
   * synthesised. Under `'generate'` (the designer, and `validate --fix-names`)
   * it is a `warning` and the synthesised name is carried in `suggestions`.
   *
   * One code rather than two because it is one condition; the severity says what
   * was *done about it*, which the caller already chose. A consumer branching on
   * `code` therefore always knows in advance which severity it will see. This is
   * intentional, not an accident of two code paths sharing a constant.
   */
  MISSING_NAME: 'U8G2GL_MISSING_NAME',
  TYPE_MISMATCH: 'U8G2GL_TYPE_MISMATCH',
  OVERCONSTRAINED: 'U8G2GL_OVERCONSTRAINED',
  OUT_OF_BOUNDS: 'U8G2GL_OUT_OF_BOUNDS',
  NAME_COLLISION: 'U8G2GL_NAME_COLLISION',
  INVALID_NAME: 'U8G2GL_INVALID_NAME',
  UNKNOWN_SCHEMA_VERSION: 'U8G2GL_UNKNOWN_SCHEMA_VERSION',
  /**
   * A project declares a schema version this CLI once supported but no
   * longer does — `0.3`, superseded by `0.4` (design_spec §15.4, PR-3R WO8).
   *
   * Deliberately a distinct code from `UNKNOWN_SCHEMA_VERSION`: an unknown
   * version (never issued) gets a generic "expected X" message, but a known
   * superseded version gets the specific migration table, because the CLI
   * can name exactly what changed. Collapsing the two into one code would
   * let a consumer branch on "bad version" without ever learning there was
   * a migration to make — the failure this diagnostic exists to prevent.
   */
  DEPRECATED_SCHEMA_VERSION: 'U8G2GL_DEPRECATED_SCHEMA_VERSION',
  DUPLICATE_NAME: 'U8G2GL_DUPLICATE_NAME',
  INVALID_ENUM_VALUE: 'U8G2GL_INVALID_ENUM_VALUE',
  FORMAT_MISMATCH: 'U8G2GL_FORMAT_MISMATCH',
  MALFORMED_XML: 'U8G2GL_MALFORMED_XML',
  MISSING_FILE: 'U8G2GL_MISSING_FILE',
  CIRCULAR_REFERENCE: 'U8G2GL_CIRCULAR_REFERENCE',
  /**
   * A screen's element tree exceeds the structural object ceiling ([A-3],
   * [D-21]). `parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` consumes
   * one value, so a screen can hold at most 254 objects — this is a property
   * of the object model, not a tunable capacity like the ones in
   * `u8g2gl_config.h`. See `docs/decisions/d21-generated-capacities.md`.
   */
  TOO_MANY_OBJECTS: 'U8G2GL_TOO_MANY_OBJECTS',
  /**
   * A project manifest declares a tag a framework manifest already declares
   * ([D-17], [D-18]). Framework manifests ship with the CLI, so a project copy
   * can only go stale — the diagnostic names both files and tells the author
   * to delete the copy. Deliberately a hard error, not "project wins": an
   * override that silently diverges from the runtime class it describes is the
   * defect this code exists to prevent.
   */
  SHADOWED_FRAMEWORK_MANIFEST: 'U8G2GL_SHADOWED_FRAMEWORK_MANIFEST',
  /**
   * A drawing element's manifest — every prop `draw=`, none `setter=` —
   * declares `extends` ([D-18], §6.2). A drawing element compiles to a free
   * `u8g2gl_draw_*` call and has no class, and `extends` names real C++
   * inheritance (§6.5), so there is nothing for it to inherit from.
   */
  DRAWING_ELEMENT_EXTENDS: 'U8G2GL_DRAWING_ELEMENT_EXTENDS',
  /**
   * A manifest declares both `setter=` props and `draw=` props ([D-18],
   * §13.1). An element has one emission target: methods on its class, or a
   * free draw function with no class. The message names one prop of each kind.
   * Distinct from `OVERCONSTRAINED`, which is one prop declaring both.
   */
  MIXED_EMISSION_TARGETS: 'U8G2GL_MIXED_EMISSION_TARGETS',
  /**
   * A `<bind_flag_if_*>` directive names a flag the element cannot carry — today
   * `flag="disabled"` on a drawing element (§8.4, [D-18]). The flag set is fixed
   * at `hidden` and `disabled`; `hidden` applies to every element, but a drawing
   * element has no object, so there is nothing to disable.
   */
  INAPPLICABLE_FLAG: 'U8G2GL_INAPPLICABLE_FLAG',
  /**
   * A container whose own `x`, `y`, `width` or `height` is bound has an
   * anchor-positioned child (`right`, `bottom`, `hcenter`, `vcenter`) —
   * [D-20], §8.4. Anchors resolve at build time; re-resolving them whenever
   * the binding changed would be reflow, which U8G2GL does not have.
   */
  BOUND_GEOMETRY_ANCHORED_CHILD: 'U8G2GL_BOUND_GEOMETRY_ANCHORED_CHILD',
  /**
   * A container whose own **position** is bound (`bind_x` / `bind_y`) has
   * children — the Chief Architect's ruling 1c of 2026-09-19, §7.2 (PR-04
   * WO11b). Children's positions are fixed at build time and there is no reflow
   * yet, so they could not follow the container when its binding moves it; and
   * because every element must be fully positioned, "no positioned children"
   * means no children at all. A composite instance counts as a container: its
   * template's elements are its children. The message points to §21 Q-16, which
   * records how the rule can be lifted without a layout pass.
   *
   * An error in both journeys: it is not a construct awaiting a later PR, it is
   * a document schema 0.4 cannot mean. Distinct from
   * `BOUND_GEOMETRY_ANCHORED_CHILD`, which still covers a bound *size* with an
   * anchored child; a bound position is reported here alone.
   */
  BOUND_POSITION_HAS_CHILDREN: 'U8G2GL_BOUND_POSITION_HAS_CHILDREN',
  /**
   * The document uses a construct the schema accepts but the generator does not
   * build yet — focus rings, events and screen navigation (PR-09), collections
   * and composites with their own C++ class (PR-08), `<bdf>` fonts and `<convert>`
   * images (PR-04b). The message names the PR that delivers it.
   *
   * **Emitted at two severities, chosen by the caller's `RefusalPolicy`,
   * never inside the check** — the same journey split as `MISSING_NAME` ([U-1]).
   * `validate` (and the designer) report a `warning`, so the document is not shown
   * as broken while it is being authored; `generate` reports an `error` and writes
   * nothing, so a build never silently drops what it cannot emit. Code and location
   * are identical under both, so a consumer can match one against the other.
   */
  NOT_YET_SUPPORTED: 'U8G2GL_NOT_YET_SUPPORTED',
  /**
   * `generate --target <name>` names a target the project does not declare.
   * Suggestions carry the declared target names closest to the one given.
   */
  UNKNOWN_TARGET: 'U8G2GL_UNKNOWN_TARGET',
  /**
   * A coordinate expression names `#<constant>` that neither `globals.xml`
   * `<consts>` nor the built-ins (`#screen_width`, `#screen_height`,
   * `#parent_width`, `#parent_height`) declare (§7.2). Suggestions carry the
   * closest known names, spelled with their `#`.
   */
  UNKNOWN_CONSTANT: 'U8G2GL_UNKNOWN_CONSTANT',
  /**
   * A coordinate expression uses a constant whose value is not an integer — a
   * `<string>` constant, or an `<int>` whose `value` is not an integer literal.
   * Coordinate arithmetic is integer-only (§7.2, §13.9). An `<int>` whose value
   * is not an integer literal is also reported at its declaration (§7.2,
   * "validated where they're declared"), whether or not anything uses it.
   */
  NON_INTEGER_CONSTANT: 'U8G2GL_NON_INTEGER_CONSTANT',
  /** A coordinate expression divides by an operand that evaluates to zero (§7.2). */
  DIVISION_BY_ZERO: 'U8G2GL_DIVISION_BY_ZERO',
  /**
   * A coordinate attribute is not a well-formed integer expression: an unknown
   * character, a missing operand, or unbalanced parentheses (§7.2).
   */
  MALFORMED_EXPRESSION: 'U8G2GL_MALFORMED_EXPRESSION',
  /**
   * A coordinate expression's value leaves the `int32_t` range §13.2 emits
   * integers as. Checked after every operation, so no value ever exceeds what
   * JavaScript numbers hold exactly and no rounded result can reach output (§13.9).
   */
  INTEGER_OVERFLOW: 'U8G2GL_INTEGER_OVERFLOW',
  /**
   * A `$name` inside a composite's `<view>` names no prop the composite declares
   * in its `<api>` (§8.3, §13.6 step 2), so composite expansion has nothing to
   * substitute. Located at the reference in the template and reported once,
   * however many instances there are. Suggestions carry the closest declared
   * props, spelled with their `$`.
   */
  UNKNOWN_PROP: 'U8G2GL_UNKNOWN_PROP',
  /**
   * `right`, `bottom`, `hcenter` or `vcenter` on an element that is not
   * rectangular — whose effective manifest does not declare all of `x`, `y`,
   * `width` and `height` (§7.2). A line, pixel, circle or ellipse has no box for
   * an anchor to measure. The message names the element and the anchor.
   */
  INAPPLICABLE_ANCHOR: 'U8G2GL_INAPPLICABLE_ANCHOR',
  /**
   * A value that must be a literal integer by emission never resolves to one
   * (§7.2, §13.2). Two families share it, because they are one fact — the value
   * has no literal and the build would have to guess one:
   *
   * - **Geometry**: an element whose manifest declares geometry does not end up
   *   fully positioned after composite expansion — its `x` or `y` is
   *   under-determined (`width` with neither `x` nor `right`), or a coordinate it
   *   writes never resolves: a `$prop` outside a composite, a `#parent_*` whose
   *   container has no size, an anchor measured against a container with no size.
   * - **Any other `int` property** (PR-04 WO9): `scroll_px_per_sec="#speed"` with
   *   no such value for the target.
   *
   * Never a silent zero or absence.
   *
   * **Renamed in PR-04 WO11b (WO9 finding 7), key only.** The constant was
   * `UNRESOLVED_GEOMETRY`, narrower than its use since WO9. The **code string is
   * unchanged** — `U8G2GL_UNRESOLVED_GEOMETRY` — because codes are the public,
   * stable API §15.3 and [D-16] promise consumers (`--json`, the designer, agent
   * skills); renaming it would break every consumer branching on it for no
   * change in meaning to them.
   */
  UNRESOLVED_VALUE: 'U8G2GL_UNRESOLVED_GEOMETRY',
  /**
   * A resolved coordinate — `x`, `y`, `width` or `height` — lies outside
   * `int16_t`, the type `u8g2gl_obj` stores coordinates in (§13.2). Separate
   * from, and checked before, `OUT_OF_BOUNDS`: this asks whether the value is
   * representable at all, not whether it fits its container.
   */
  COORDINATE_OUT_OF_RANGE: 'U8G2GL_COORDINATE_OUT_OF_RANGE',
  /**
   * A `$name` that nothing can substitute, and that would therefore reach
   * output literally (§8.3, §13.6). Two conditions share this code, because
   * they are one fact — the reference has no value and never will:
   *
   * - Inside a composite's `<view>`, a `$name` in longer text that expansion
   *   cannot substitute: a non-`int` prop spliced into text (`text="Hi $who"`),
   *   or an `int` prop given no value. Interim rule (PR-04 WO7b) until the
   *   Chief Architect rules on interpolation.
   * - **Outside any composite** — written directly in a screen — a `$name` in a
   *   font, image, style or enum attribute, or in `hidden` / `hcenter` /
   *   `vcenter`. A `$prop` is a template parameter, and a screen has no
   *   template and so no props to bind, so the reference can only be a mistake.
   *   Before PR-04 WO8a every pass skipped such a value as "not yet knowable"
   *   and it validated silently; only geometry caught it, as
   *   `UNRESOLVED_VALUE`, which still reports the geometry attributes.
   */
  UNSUBSTITUTED_PROP: 'U8G2GL_UNSUBSTITUTED_PROP',
  /**
   * Something requires a C++ object of an element that has no class to
   * instantiate — a `draw=`-only drawing element ([D-18], §13.5).
   *
   * §13.5's rule gives an element an object when something must hold a
   * reference to it or it must remember something between frames: a
   * `<focus_ring>` naming it, an event on it, nested children it contains, or a
   * parent composite's typed pointer to it. A drawing element compiles to a
   * free `u8g2gl_draw_*` call and has no class, so there is nothing to
   * reference, nothing to focus and nothing to nest inside.
   *
   * Deliberately not `INAPPLICABLE_FLAG`'s shape: that names one attribute the
   * element cannot carry, while this names a *structural* requirement the
   * element cannot meet, and the message says which condition created it.
   * A binding is **not** one of those conditions — a drawing element compiles
   * its binding into the draw call (§13.5) and needs no object for it.
   */
  DRAWING_ELEMENT_NEEDS_OBJECT: 'U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT',
} as const;

/**
 * Union of all standard diagnostic codes recognized by U8G2GL.
 */
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

/**
 * A structured diagnostic message emitted during validation or code generation.
 * Follows design_spec §15.1 and [D-16].
 */
export interface Diagnostic {
  /** Stable programmatic error code (e.g. 'U8G2GL_UNKNOWN_FONT'). */
  readonly code: string;
  /** Severity classification. */
  readonly severity: Severity;
  /** Relative or absolute path to the file producing the diagnostic. */
  readonly file: string;
  /** 1-based starting line number. */
  readonly line: number;
  /** 1-based starting column number. */
  readonly column: number;
  /** Optional 1-based ending line number. */
  readonly endLine?: number;
  /** Optional 1-based ending column number. */
  readonly endColumn?: number;
  /** Human-readable explanatory message. May be reworded freely across releases. */
  readonly message: string;
  /** The specific token or snippet that caused the diagnostic. */
  readonly offendingText?: string;
  /**
   * Structured, machine-applicable replacement suggestions (e.g. near-match identifiers).
   * Never embedded in prose so callers can apply fixes programmatically.
   */
  readonly suggestions?: readonly string[];
}
