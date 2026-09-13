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
   * A container whose own `x`, `y`, `width` or `height` is bound has an
   * anchor-positioned child (`right`, `bottom`, `hcenter`, `vcenter`) —
   * [D-20], §8.4. Anchors resolve at build time; re-resolving them whenever
   * the binding changed would be reflow, which U8G2GL does not have.
   */
  BOUND_GEOMETRY_ANCHORED_CHILD: 'U8G2GL_BOUND_GEOMETRY_ANCHORED_CHILD',
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
