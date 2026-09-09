---
name: pr-02-cli-schema-wo5
description: Handoff instructions for Work Order 5 — Validator with §15 Diagnostics
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create additional branches, and do not plan beyond this
> checklist. Your task is strictly limited to executing the checklist below.

# Objective

Implement the U8G2GL validator in `cli/src/core/validator/`. The validator
checks parsed project files against the schema, cross-file references, display
catalogue, widget `<api>` manifests, type rules, geometry constraints, and
naming rules. It produces §15-grade diagnostics with file/line/column, offending
text, edit-distance suggestions, and stable machine codes.

Per design_spec §1.2, **diagnostics are the product, not error handling**. The
validator is the most user-facing part of this PR.

# Parent PR & Authorization

This work order belongs to **PR-02: CLI Foundation, Schema, Validator, Display
Catalogue**. Human approval recorded in:
`.agents/skills/principal-architect-workspace/pr-02-cli-schema/PROJECT.md`
(status log, 2026-09-08T23:08:28Z).

# Context You Must Read

1. `.agents/skills/u8g2gl-standards/references/typescript.md` — §4 diagnostics
2. `docs/design_spec.md`:
   - §13.1–§13.2 — widget property manifests and type mapping
   - §13.4 — identifier mangling rules and collision detection
   - §13.5 — static demotion rules (informational — not validated here)
   - §15.1 — diagnostic requirements (the spec for what you're building)
   - §15.2 — `u8g2gl validate` command
   - §15.3 — [D-16] machine-readable contract
   - §15.4 — schema versioning
3. `cli/src/core/schema/` — all type definitions (WO2)
4. `cli/src/core/parser/` — parser API (WO3)
5. `cli/src/core/catalogue/` — query engine and edit-distance (WO4)
6. `cli/src/core/schema/diagnostic.ts` — `DIAGNOSTIC_CODES` (WO2)

# Strict Boundary Box

**DO NOT:**
- Create or modify any C++ files
- Modify schema types in `cli/src/core/schema/`
- Modify parser code in `cli/src/core/parser/`
- Modify catalogue code in `cli/src/core/catalogue/`
- Implement CLI formatting — WO6 does that
- Create additional git branches
- Modify anything in `.agents/` except appending your Completion Report

**YOU MAY:**
- Create all files under `cli/src/core/validator/`
- Create test files and fixtures under `cli/test/validator/`
- Update `cli/src/core/index.ts` to re-export validator API
- Update `cli/src/node/cli.ts` to wire the `validate` command (basic wiring —
  full formatting is WO6)
- Add diagnostic codes to `cli/src/core/schema/diagnostic.ts` if new error
  classes are discovered (document them in Completion Report)

# Coding Standards

- PascalCase types, camelCase functions, kebab-case files
- SPDX MIT header on every source file
- No `any` — use `unknown` and narrow
- Fully isomorphic — no `node:` imports in `src/core/validator/`
- Never `throw` for a user input error — collect `Diagnostic[]` and return them
- Determinism: diagnostics sorted by file, then line, then column (§13.9)

# Line-Item Instructions

## Validator Core

- [x] **`cli/src/core/validator/validate.ts`** — Main validator entry point:
  ```ts
  interface ValidateInput {
    readonly project: U8g2glProject;
    readonly globals: Globals;
    readonly screens: readonly Screen[];
    readonly components: readonly Component[];
    readonly widgetManifests: readonly WidgetManifest[];
    readonly catalogue: readonly DisplayRecord[];
  }

  interface ValidateResult {
    readonly diagnostics: readonly Diagnostic[];
    readonly errors: number;
    readonly warnings: number;
  }

  function validate(input: ValidateInput): ValidateResult;
  ```
  The function runs all validation passes in order (see below), collects
  diagnostics, sorts them by file/line/column, and returns the result.

## Validation Passes (in order)

- [x] **`cli/src/core/validator/validate-schema.ts`** — Schema structure:
  - Required attributes present on all elements (e.g. `name` on `<screen>`,
    `schema` on `<u8g2gl>`, `type` on `<prop>`)
  - Attribute values match expected types (boolean strings, integers, enum
    values from the allowed set)
  - Unknown elements produce `U8G2GL_UNKNOWN_ATTRIBUTE` diagnostics (but
    don't reject unknown widget tags — those could be components)
  - Schema version check: `schema="0.3"` required; unknown versions produce
    `U8G2GL_UNKNOWN_SCHEMA_VERSION` with migration hint

- [x] **`cli/src/core/validator/validate-references.ts`** — Cross-file refs:
  - Fonts referenced in widgets/styles → must exist in `globals.fonts`
    → `U8G2GL_UNKNOWN_FONT` with edit-distance suggestions
  - Images referenced in widgets → must exist in `globals.images`
    → `U8G2GL_UNKNOWN_IMAGE` with suggestions
  - Subjects referenced in `bind_*` → must exist in `globals.subjects`
    → `U8G2GL_UNKNOWN_SUBJECT` with suggestions
  - Styles referenced by `style=` → must exist in globals or screen-local styles
    → `U8G2GL_UNKNOWN_STYLE` with suggestions
  - Component instances → component must exist in the components list
    → `U8G2GL_UNKNOWN_COMPONENT` with suggestions
  - Focus ring entries → must reference a named element in the same screen
  - **Suggestion mechanism:** Use `findClosest` from the catalogue's
    `edit-distance.ts` to suggest the nearest declared name for each unknown
    identifier. Suggestions must be a structured array in the diagnostic, not
    embedded in prose.

- [x] **`cli/src/core/validator/validate-display.ts`** — Display validation:
  - Each target's `setup=` value → must exist in the catalogue
    → `U8G2GL_UNKNOWN_DISPLAY` with edit-distance suggestions from catalogue
  - If the setup name matches a page-mode constructor (ends with `_1` or `_2`),
    produce `U8G2GL_PAGE_MODE_DISPLAY` and suggest the `_F_` equivalent from
    the page-mode map (loaded from `cli/src/data/page-mode-map.json`)

- [x] **`cli/src/core/validator/validate-widget-props.ts`** — Widget property
  validation against `<api>` manifests:
  - For each widget instance in a screen, find its manifest (by tag name)
  - Check each attribute against the manifest's `<prop>` list:
    - Unknown attribute → `U8G2GL_UNKNOWN_ATTRIBUTE` with suggestions from
      the manifest's props
    - Required prop missing → `U8G2GL_MISSING_REQUIRED`
  - Enum value validation: if a prop has `type="enum"` and `values="a,b,c"`,
    the attribute value must be one of them → `U8G2GL_INVALID_ENUM_VALUE`
  - Skip common attributes (x, y, width, height, name, style, etc.) — these
    are valid on all elements and not in the manifest

- [x] **`cli/src/core/validator/validate-types.ts`** — Type checking:
  - `bind_*` attribute's subject must have a type compatible with the binding:
    - `bind_text` → subject must be `string` or `int` (format string)
    - `bind_value` → subject must be `int`
    - `bind_flag_if_eq` → subject type must match comparison value type
  - `bind_text_fmt` format specifiers vs subject type:
    - `%d`, `%i`, `%u` → subject must be `int`
    - `%s` → subject must be `string`
    → `U8G2GL_FORMAT_MISMATCH` reporting both the specifier and subject type

- [x] **`cli/src/core/validator/validate-geometry.ts`** — Geometry validation:
  - Over-constrained anchors: if all three of `x + width + right` (or
    `y + height + bottom`) are set → `U8G2GL_OVERCONSTRAINED` naming all three
  - Elements extending past display bounds (requires knowing the target
    display dimensions from the catalogue):
    → `U8G2GL_OUT_OF_BOUNDS` reporting computed position: "element extends to
    x=264, display is 256px wide (0..255)"
  - Note: geometry validation is best-effort — expressions using `#const` may
    not be resolvable without a full resolver. Validate what can be resolved
    (literal integers), skip what can't.

- [x] **`cli/src/core/validator/validate-identifiers.ts`** — Identifier rules:
  - Names match `[a-z][a-z0-9_]*` → `U8G2GL_INVALID_NAME`
  - No reserved prefixes: `u8g2gl_`, `ui_`, `wd_` (except on widget tags) →
    `U8G2GL_INVALID_NAME`
  - No C++ keywords as names
  - Duplicate names within the same scope → `U8G2GL_DUPLICATE_NAME`
  - Component-inlining name collision detection: if instance `bar` has child
    `title`, and the screen also has `bar_title` → `U8G2GL_NAME_COLLISION`
    naming both sources (§13.4)

## Public API

- [x] **`cli/src/core/validator/index.ts`** — Re-export `validate` function
  and `ValidateInput`/`ValidateResult` types

- [x] **Update `cli/src/core/index.ts`** — Re-export validator

## CLI Wiring

- [x] **Update `cli/src/node/cli.ts`** — Wire the `validate` command:
  - Accept optional `[project-dir]` argument (default: current directory)
  - Read project files from the directory using `node:fs`
  - Parse each file using the parser (WO3)
  - Run the validator
  - If `--json` → output `Diagnostic[]` as JSON
  - Else → print diagnostics in a basic human-readable format (one per line,
    with file:line:column prefix). Full §15.1 formatting is WO6's job.
  - Exit code: 0 if no errors, 1 if any errors

## Test Fixtures

- [x] **`cli/test/validator/fixtures/valid/`** — A complete valid project:
  - `u8g2gl.xml` — with a target using a real display setup from the catalogue
  - `globals.xml` — with consts, subjects, styles, fonts, images
  - `screens/screen_home.xml` — using declared resources, valid bindings
  - `components/status_bar/status_bar.xml` — a simple component
  - `widgets/u8g2gl_label/u8g2gl_label.xml` — a widget manifest

- [x] **`cli/test/validator/fixtures/invalid/`** — Targeted invalid files:
  - `unknown-font.xml` — uses a font not declared in globals
  - `unknown-display.xml` — target with non-existent display setup
  - `page-mode-display.xml` — target using a `_1` page-mode constructor
  - `overconstrained.xml` — element with x + width + right all set
  - `invalid-name.xml` — element with name "3bad" or "ui_reserved"
  - `missing-required.xml` — widget missing a required prop
  - `duplicate-name.xml` — two elements with the same name in one screen
  - `bad-binding-type.xml` — bind_text on a bool subject
  - `bad-schema-version.xml` — schema="0.1"

## Tests

- [x] **`cli/test/validator/validate.test.ts`** — Integration tests:
  - Valid project fixture produces zero diagnostics
  - Invalid fixtures produce the expected diagnostic codes, each test asserting:
    - The exact `code` (e.g. `U8G2GL_UNKNOWN_FONT`)
    - Correct `line` and `column`
    - Non-empty `suggestions` array where applicable
    - Correct `severity` ('error' vs 'warning')

- [x] **`cli/test/validator/references.test.ts`** — Cross-reference tests:
  - Unknown font → suggests nearest declared font by edit distance
  - Unknown subject → suggests nearest
  - Unknown style → suggests nearest
  - Unknown component → suggests nearest

- [x] **`cli/test/validator/display.test.ts`** — Display validation tests:
  - Valid setup passes
  - Unknown setup → suggests nearest from catalogue
  - Page-mode setup → suggests `_F_` equivalent

- [x] **`cli/test/validator/identifiers.test.ts`** — Identifier tests:
  - Valid names pass
  - Invalid names caught with correct code
  - Duplicate names caught
  - Name collision after component inlining caught

# Verification Requirement

1. `npm run build` — zero errors
2. `npm test` — all tests pass (existing + new validator tests)
3. `npm run lint` — zero errors
4. `node dist/node/cli.js validate cli/test/validator/fixtures/valid/` — exit 0
5. `node dist/node/cli.js validate cli/test/validator/fixtures/invalid/` — exit 1,
   diagnostics printed

**Commit on green build.** Do not wait for approval.
Branch: `u8g2gl-cli/wo5-validator`. Push to origin after committing.

**CRITICAL:** Before committing, verify branch with `git branch --show-current`.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

---

## Completion Report

- **Task**: WO5 — Validator with §15 Diagnostics
- **Status**: COMPLETE
- **Timestamp**: 2026-09-08T23:53:00Z
- **Branch**: `u8g2gl-cli/wo5-validator`

### Summary of Implementation
1. **Validator Core & Multi-Pass Engine** (`cli/src/core/validator/`):
   - `validate-schema.ts` (Pass 1): Enforces schema version "0.3" (`U8G2GL_UNKNOWN_SCHEMA_VERSION`), checks required attributes on targets/globals/screens/components/manifests (`U8G2GL_MISSING_REQUIRED`), and validates enumerated type sets (`U8G2GL_INVALID_ENUM_VALUE`).
   - `validate-references.ts` (Pass 2): Cross-references fonts, images, subjects, styles, component tags, and focus ring entries. Suggests closest matching declared symbols using `findClosest` Levenshtein distance (`U8G2GL_UNKNOWN_FONT`, `U8G2GL_UNKNOWN_IMAGE`, `U8G2GL_UNKNOWN_SUBJECT`, `U8G2GL_UNKNOWN_STYLE`, `U8G2GL_UNKNOWN_COMPONENT`, `U8G2GL_UNKNOWN_WIDGET`).
   - `validate-display.ts` (Pass 3): Verifies target display constructor setups against catalogue records. Detects page-mode (`_1` and `_2`) drivers and suggests their `_F_` full-buffer equivalents via `page-mode-map.json` (`U8G2GL_PAGE_MODE_DISPLAY`). Suggests closest catalogue matches for typos (`U8G2GL_UNKNOWN_DISPLAY`).
   - `validate-widget-props.ts` (Pass 4): Validates widget and component attributes against `<api>` manifests and prop definitions. Flags missing required props and invalid enum values. Permits common layout attributes and inline style overrides (`style_*`).
   - `validate-types.ts` (Pass 5): Validates data binding type compatibility (`bind_text` with string/int, `bind_value` with int, `<bind_flag_if_eq>` comparison values) (`U8G2GL_TYPE_MISMATCH`). Flags printf format specifier mismatches in `bind_text_fmt` against bound subject types (`U8G2GL_FORMAT_MISMATCH`).
   - `validate-geometry.ts` (Pass 6): Identifies over-constrained anchors (`x + width + right` or `y + height + bottom`) (`U8G2GL_OVERCONSTRAINED`). Checks literal coordinates against target display resolution (`U8G2GL_OUT_OF_BOUNDS`). Safely ignores dynamic expressions.
   - `validate-identifiers.ts` (Pass 7): Enforces `[a-z][a-z0-9_]*` naming syntax, rejects leading digits, uppercase, double underscores (`__`), reserved prefixes (`u8g2gl_`, `ui_`, `wd_`), and C++ keywords (`U8G2GL_INVALID_NAME`). Detects duplicate names in local scopes (`U8G2GL_DUPLICATE_NAME`) and component-inlining collisions (`U8G2GL_NAME_COLLISION`).
   - `validate.ts`: Coordinates passes 1–7 and deterministically sorts diagnostics by `file`, `line`, `column`, and `code` (§13.9).
   - `index.ts`: Re-exports public validator API and individual pass functions.

2. **Integration**:
   - Re-exported validator in `cli/src/core/index.ts`.
   - Wired `validate` subcommand into `cli/src/node/cli.ts` supporting `--json`, directory traversal, file parsing, diagnostic aggregation, and exit code 0/1.

3. **Fixtures & Tests**:
   - Created valid project fixture in `cli/test/validator/fixtures/valid/`.
   - Created 9 targeted invalid test fixtures in `cli/test/validator/fixtures/invalid/`.
   - Created 7 test suites under `cli/test/validator/`: `validate.test.ts`, `references.test.ts`, `display.test.ts`, `identifiers.test.ts`, `widget-props.test.ts`, `types.test.ts`, `geometry.test.ts`.

### Verification Results
1. `npm run build`: Zero errors.
2. `npm test`: 19 test files passed, 95 tests passed.
3. `npm run lint`: Zero errors / zero warnings.
4. `node dist/node/cli.js validate cli/test/validator/fixtures/valid/`: Exited with code 0 (`Validation passed: 0 errors, 0 warnings.`).
5. `node dist/node/cli.js validate cli/test/validator/fixtures/invalid/`: Exited with code 1, emitting all expected diagnostics with suggestions.
