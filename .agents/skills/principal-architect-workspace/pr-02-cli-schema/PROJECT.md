# PROJECT — PR-02: CLI Foundation, Schema, Validator, Display Catalogue

**Tier 2 · Principal Architect**
**Parent programme:** [PROGRAM.md](../PROGRAM.md) · [implementation_plan.md](../../../docs/implementation_plan.md)
**Normative spec:** [design_spec.md](../../../docs/design_spec.md) v0.3 — §5, §5.2, §13, §15
**Branch prefix:** `u8g2gl-cli/`

## Mandate

Deliver the U8G2GL TypeScript/Node CLI as an npm-publishable package (`u8g2gl`)
with: XML schema definition, XML parser with source locations, display catalogue
generator, validator with §15-grade diagnostics, and query modes for display
discovery.

### Critical Architectural Constraint — Isomorphism

Per [D-10] and [UD-2], the core schema, validator and parser code must be
**isomorphic** — running unmodified in both Node and a browser. The designer runs
client-side and consumes these modules directly. Node-only APIs (`fs`, `path`,
`process`) are confined to `src/node/`; the core boundary is `src/core/`.

### In Scope

1. **TypeScript/Node project skeleton**: npm-publishable as `u8g2gl`, consumed
   as a git submodule pre-1.0. Vitest, `strict: true`, `noUncheckedIndexedAccess`.
2. **XML schema types** for u8g2gl.xml, globals.xml, screens, components,
   and widget `<api>` manifests — schema version 0.3 — per design_spec §5 and §13.
3. **XML parser** with source location tracking (file, line, column per
   attribute) for diagnostic quality.
4. **Display catalogue** generated from U8G2 2.36.18 source per [D-14].
   Parse `u8x8_display_info_t` structs (ground truth), link to constructors via
   `u8g2_d_setup.c`, filter to `_F_` constructors.
5. **Validator** with §15-grade diagnostics: file/line/column, offending text,
   edit-distance suggestions, stable machine codes, structured suggestion lists.
6. **`u8g2gl find` query modes** per §5.2: identify, source (--fits), compare,
   enumerate.
7. **`--json` on every command** per [D-16], with stable machine codes on
   diagnostics and structured suggestion lists.

### Deferred — Pending UI Spec Review

The nine ui_spec §15 editor requirements (`<previews>`, `help` formalisation,
property grouping/order, palette metadata, editor-target generation hooks,
sample data, stable element identity [U-1], round-trip parser contract [UD-3],
editor view state sidecar) are **held** pending human review of the UI spec.
They will be added as a follow-on WO once the UI spec questions are settled.

The schema types designed here are **additive-ready**: adding §15 fields later
is a non-breaking extension (new optional attributes and elements), not a
restructuring.

### Explicitly Out of Scope

- Code generation, XML → C++ — **PR-04** (but schema must accommodate §13's
  `<api>` manifests since they are part of the schema surface).
- Any C++ runtime code — **PR-01** (complete), **PR-03**.
- Wasm preview — **PR-06**.
- `bdfconv` packaging — [Q-2], deferred.
- `<row>`/`<col>` stacking sugar — deferred per §7.2.

### Constraints

- **Determinism** per §13.9: no timestamps in any emitted output.
- **Schema surface is expensive** (§1.5): every element is permanent once
  authors write XML against it. Omission is the default.
- **Underspecification protocol**: if §13, §5.2 or §15 is contradictory
  or underspecified, STOP and surface it — PR-04 and PR-03 build against the
  same contract.

---

## Status

| Event | Date | Detail |
|---|---|---|
| Created | 2026-09-08 | Decomposition presented for human approval |
| Human approval | 2026-09-08T23:08:28Z | APPROVED — 6-WO decomposition for autonomous execution |
| WO1 complete | 2026-09-08T23:22:00Z | `bea71ee` — project skeleton, 2 tests |
| WO2 complete | 2026-09-08T23:27:00Z | `bd45c84` — schema types, 12 tests |
| WO3 complete | 2026-09-08T23:34:00Z | `54073b1` — XML parser, 36 tests |
| WO4 complete | 2026-09-08T23:44:00Z | `12bdfc0` — display catalogue, 61 tests |
| WO5 complete | 2026-09-08T23:52:00Z | `a67d818` — validator, 95 tests |
| WO6 complete | 2026-09-08T23:59:00Z | `23c2dd6` — CLI integration, 121 tests |
| **PR staged** | **2026-09-09** | **All 6 WOs complete — 121 tests, 0 errors. Pending: WO7 (ui_spec §15, deferred)** |

---

## Work Order Ledger

Six work orders, strictly serialised (each stacks on the previous). Serialised
because each WO builds on the types and infrastructure from the previous one.

### WO1 — Project Skeleton + npm + Vitest

- **[x] [wo1-skeleton](wo1-skeleton/WORKORDER.md)** ✅ `bea71ee`
  Create the TypeScript/Node project skeleton inside a `cli/` directory at the
  repository root. npm-publishable as `u8g2gl`. `package.json` with `bin`,
  `main`, `types`, and `exports` fields. TypeScript 5.x with `strict: true`,
  `noUncheckedIndexedAccess`. Directory structure enforcing the isomorphic
  boundary:
  ```
  cli/
  ├── package.json
  ├── tsconfig.json
  ├── vitest.config.ts
  ├── src/
  │   ├── core/          ← isomorphic (NO node: imports)
  │   ├── node/          ← Node-only (fs, CLI entry)
  │   └── browser/       ← browser-only (stub for now)
  └── test/
  ```
  ESLint rule prohibiting `node:` imports in `src/core/`. A smoke test proving
  Vitest runs. CLI entry point stub (`src/node/cli.ts`) that parses `--json`
  and dispatches to subcommands.
  **Branch:** `u8g2gl-cli/wo1-skeleton` off `main`
  **Complexity:** mechanical

### WO2 — Schema Types (design_spec §5, §13)

- **[x] [wo2-schema](wo2-schema/WORKORDER.md)** ✅ `bd45c84`
  Define the complete TypeScript type system for schema 0.3 in `src/core/schema/`.
  This is the document model that every downstream consumer (validator, generator,
  editor) works against.

  **Core project files:**
  - `U8g2glProject` — `u8g2gl.xml`: schema version, name, version, targets
    (each with display setup + rotation + optional bus params), output config.
  - `Globals` — `globals.xml`: consts (int/string), subjects (int/string/bool/time
    with max_len), styles (§10 property set), fonts (bdf + builtin), images
    (xbm + convert with mode/threshold).
  - `Screen` — screen files: name, local styles, view with widget tree.
  - `Component` — component files: api props, view.
  - `Widget` — widget manifest files: name, extends, animated, api block.

  **The `<api>` block model (§13.1):**
  - `Prop`: name, type (int|bool|string|enum|font|image|subject|style|color),
    setter, default, required, animated, emit pattern, values.
  - `Bind`: name, type, setter, fmt.
  - `Element`: name, access (add), help, and child args.

  **Widget element tree types:**
  - All Tier 1 primitives: hline, vline, line, box, circle, ellipse,
    triangle, pixel — with their attribute sets.
  - All Tier 2 built-in widgets: label, scrolling_label, xbm, glyph,
    progress_bar, clock, switch, button — with their attribute sets.
  - Common attributes: x, y, width, height, right, bottom, hcenter,
    vcenter, name, style, style_* overrides, hidden.
  - Binding children: bind_flag_if_eq, bind_flag_if_not_eq, etc.
  - Event children: screen_load_event, screen_back_event, event_cb.
  - Focus ring: focus_ring with focus entries.

  **Display catalogue record type** per §5.2:
  `DisplayRecord`: setup, controller, variant[], width, height, tiles,
  framebuffer_bytes, bus (family, wiring, raw), x_offset, driver.

  **Diagnostic type** per §15/[D-16]:
  `Diagnostic`: code (stable string), severity, file, line, column, message,
  suggestions (string[]).

  **Source location types:**
  `SourceLocation`: file, line, column. Threaded through all parsed types
  so the validator can point to the exact attribute.

  All types are `readonly` / immutable. No classes — plain interfaces and type
  aliases for serialisation.
  **Branch:** `u8g2gl-cli/wo2-schema` off `wo1-skeleton`
  **Complexity:** standard

### WO3 — XML Parser with Source Locations

- **[x] [wo3-parser](wo3-parser/WORKORDER.md)** ✅ `54073b1`
  Implement an XML parser in `src/core/parser/` that:
  - Parses XML with source location tracking: file, line, column per element
    and per attribute value — this is the foundation that makes §15 diagnostics
    possible.
  - Transforms parsed XML into the typed schema structures from WO2, with
    source locations threaded through for diagnostics.
  - Handles all project files: u8g2gl.xml, globals.xml, screens, components,
    widget manifests.
  - Is **fully isomorphic** — no Node imports.
  - Produces clear diagnostics for malformed XML (unclosed tags, bad attributes)
    with file/line/column.

  **Tests (fixture-driven):**
  - Parse valid XML fixtures, assert typed output matches expected structure.
  - Source locations: assert line/column on known attributes.
  - Malformed XML: assert diagnostics with file/line/column.
  - Parse all example XML from the design spec (§5.1, §5.3, §5.4, §6.3, §6.4).

  **Dependency decision:** evaluate `fast-xml-parser` or similar for the
  tokeniser. Key requirement: must be browser-compatible and must report
  source locations per attribute. If no suitable library exists, a minimal
  SAX-style tokeniser is acceptable — the XML subset this schema uses is small
  (no DTD, no CDATA, no processing instructions beyond `<?xml?>`).
  **Branch:** `u8g2gl-cli/wo3-parser` off `wo2-schema`
  **Complexity:** standard

### WO4 — Display Catalogue Generator + Find Modes

- **[x] [wo4-catalogue](wo4-catalogue/WORKORDER.md)** ✅ `12bdfc0`
  Build the display catalogue in `src/core/catalogue/` and wire the CLI
  commands in `src/node/`.

  **Catalogue generator (`src/node/catalogue-builder.ts`):**
  This is Node-only (reads U8G2 source files). Outputs a JSON catalogue
  conforming to `DisplayRecord[]` from WO2.

  1. Parse all `u8x8_d_*.c` files for `u8x8_display_info_t` structs.
     Extract: tile_width, tile_height, default_x_offset, flipmode_x_offset,
     pixel_width, pixel_height. **Parse the structs, not constructor names —
     34% of names don't yield geometry by regex.**
  2. Parse `u8g2_d_setup.c` to map: setup function → driver function →
     buffer allocator. Extract constructor names, link to display_info.
  3. Parse `U8g2lib.h` for the C++ constructor class names (these are what
     users write in `setup=`). Link each to its setup function.
  4. Filter to `_F_` (full-buffer) constructors only — [D-2].
  5. Normalise bus variants to three families (spi, i2c, parallel) per §5.2.
  6. Compute `framebuffer_bytes` from tile dimensions (tiles_w × tiles_h × 8).
  7. Write catalogue JSON deterministically (sorted by setup name).

  **Catalogue query engine (`src/core/catalogue/query.ts` — isomorphic):**
  Operates on the generated `DisplayRecord[]` in memory. Implements four modes:
  - **(a) Identify** — free-text fuzzy matching across controller, variant
    tokens, geometry. Edit-distance ranking. Variant disambiguation output.
  - **(b) Source** — constraint-driven selection: `--min-width`, `--height`,
    `--bus`, `--max-framebuffer`, `--controller-family`. `--fits <target>`
    classifying framebuffer vs board RAM as comfortable/significant/check.
  - **(c) Compare** — tabulate candidates with only differing fields.
  - **(d) Enumerate** — full catalogue as JSON.

  **Negative results** per §5.2: controller supported but not at that
  geometry, controller not in U8G2, ambiguous text — each with actionable
  response.

  **CLI wiring:**
  - `u8g2gl find <query>` — mode (a) by default.
  - `u8g2gl find --min-width 128 ...` — mode (b).
  - `u8g2gl find --compare <setup1> <setup2>` — mode (c).
  - `u8g2gl catalogue` — mode (d).
  - `--json` on all, outputting `DisplayRecord[]` or structured results.

  **Tests:**
  - Unit tests for struct parser against known U8G2 source snippets.
  - Integration test building the full catalogue from the reference U8G2 copy,
    asserting 206 display_info structs found, 1631 `_F_` constructors linked.
  - Query tests for each mode with expected results.

  **U8G2 source location:** `~/Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2/`
  (reference copy of 2.36.18).
  **Branch:** `u8g2gl-cli/wo4-catalogue` off `wo3-parser`
  **Complexity:** standard

### WO5 — Validator with §15 Diagnostics

- **[x] [wo5-validator](wo5-validator/WORKORDER.md)** ✅ `a67d818`
  Implement the validator in `src/core/validator/`. Fully isomorphic.

  **What it validates (in order):**
  1. **Schema structure** — correct elements, required attributes, attribute
     types, enum values. Unknown elements/attributes are errors.
  2. **Cross-file references** — fonts, images, subjects, styles, components
     referenced in screens must be declared in globals.xml or locally.
  3. **Display validation** — `setup=` in targets must match a catalogue entry.
     Page-mode constructors rejected with their `_F_` equivalent named.
  4. **Widget property validation** — attributes on widget instances validated
     against `<api>` manifests. Unknown props are errors. Required props
     without values are errors.
  5. **Type checking** — `bind_*` attribute subject types match their binding
     type. `bind_text_fmt` format specifiers match subject type.
  6. **Geometry validation** — over-constrained anchors (x + width + right all
     set), elements extending past display bounds (computed values reported).
  7. **Identifier validation** — names match `[a-z][a-z0-9_]*`, no reserved
     prefixes, collision detection after component-inlining mangling.
  8. **Schema version** — `schema="0.3"` required. Unknown versions refused
     with migration hint.

  **Diagnostic quality (§15.1):**
  - Every diagnostic: `{ code, severity, file, line, column, message, suggestions }`.
  - **Edit-distance suggestions** for unknown identifiers (fonts, images,
    subjects, components, styles, display setups).
  - Geometry errors report computed values.
  - Over-constrained anchors name all three conflicting attributes.
  - `bind_text_fmt` mismatches report both format specifier and subject type.
  - Unknown `setup=` suggests near matches from catalogue; page-mode
    constructor names suggest their `_F_` equivalent.

  **Stable diagnostic codes** — `U8G2GL_` prefixed, documented:
  `U8G2GL_UNKNOWN_FONT`, `U8G2GL_UNKNOWN_IMAGE`, `U8G2GL_UNKNOWN_SUBJECT`,
  `U8G2GL_UNKNOWN_STYLE`, `U8G2GL_UNKNOWN_COMPONENT`, `U8G2GL_UNKNOWN_WIDGET`,
  `U8G2GL_UNKNOWN_DISPLAY`, `U8G2GL_PAGE_MODE_DISPLAY`,
  `U8G2GL_UNKNOWN_ATTRIBUTE`, `U8G2GL_MISSING_REQUIRED`,
  `U8G2GL_TYPE_MISMATCH`, `U8G2GL_OVERCONSTRAINED`,
  `U8G2GL_OUT_OF_BOUNDS`, `U8G2GL_NAME_COLLISION`,
  `U8G2GL_INVALID_NAME`, `U8G2GL_UNKNOWN_SCHEMA_VERSION`,
  `U8G2GL_DUPLICATE_NAME`, and others as discovered.

  **`u8g2gl validate` command:**
  Runs the full check, emits no files. Exit code 0 on success, 1 on error.
  Human-readable output by default, `--json` emits `Diagnostic[]`.

  **Tests (fixture-driven):**
  - Valid fixture files that pass cleanly.
  - Invalid fixtures asserting exact diagnostic code, line, column,
    and suggestion list for each error class.
  - Edge cases: empty project, missing globals.xml, circular component refs.
  **Branch:** `u8g2gl-cli/wo5-validator` off `wo4-catalogue`
  **Complexity:** standard

### WO6 — CLI Polish + Integration Tests

- **[x] [wo6-cli-integration](wo6-cli-integration/WORKORDER.md)** ✅ `23c2dd6`
  Final integration: wire all commands into the CLI entry point, ensure `--json`
  works on every command, add end-to-end integration tests, and polish the
  human-readable output formatting.

  **CLI commands (all support `--json`):**
  - `u8g2gl validate [project-dir]` — run validator, report diagnostics.
  - `u8g2gl find <query>` — display catalogue identify mode.
  - `u8g2gl find --min-width N [--height N] [--bus TYPE] [--fits TARGET]
    [--max-framebuffer N] [--controller-family FAM]` — source mode.
  - `u8g2gl find --compare <setup1> <setup2> ...` — compare mode.
  - `u8g2gl catalogue` — enumerate all displays.
  - `u8g2gl --version` — version from package.json.
  - `u8g2gl --help` — usage.

  **Human-readable formatting:**
  - Diagnostic output per §15.1: file:line:column, offending text snippet
    with underline, suggestion list.
  - Display query results per §5.2 examples: tabular, with variant
    disambiguation notes and negative-result messages.
  - Framebuffer classification for `--fits`: comfortable/significant/check.

  **Integration tests (end-to-end):**
  - A complete valid fixture project (u8g2gl.xml, globals.xml, screens/,
    components/, widgets/) that validates cleanly.
  - A broken fixture project with known errors, asserting CLI exit code
    and JSON diagnostic output.
  - `u8g2gl find "SSD1306 128x64 i2c"` asserting expected results.
  - `u8g2gl catalogue --json | jq length` asserting catalogue size.
  - `--json` on every command produces valid JSON.

  **Catalogue bundling:**
  Pre-generated catalogue JSON shipped with the npm package (not generated
  at install time). The catalogue builder from WO4 is a development tool;
  the shipped CLI loads the pre-built JSON.
  **Branch:** `u8g2gl-cli/wo6-cli-integration` off `wo5-validator`
  **Complexity:** standard

---

## Deferred Work Order — ui_spec §15 Editor Schema Requirements

**Held pending human review of the UI spec.** Will be added as WO7 once the
UI spec questions are settled. Scope will include:

1. `<previews>` on Component/Widget
2. `help` formalisation on every `<prop>`
3. Property grouping (`group`) and order
4. Palette metadata (displayName, category, icon)
5. Editor-target generation hooks ([UD-4])
6. Sample data types and `samples/` schema
7. Stable element identity ([U-1])
8. Round-trip parser fidelity contract ([UD-3])
9. Editor view state sidecar type

All are additive (new optional attributes/elements) — not restructuring.

---

## Modules & Components

| Module | Path | WOs |
|---|---|---|
| Project skeleton | `cli/package.json`, `cli/tsconfig.json` | WO1 |
| Schema types | `cli/src/core/schema/` | WO2 |
| XML parser | `cli/src/core/parser/` | WO3 |
| Display catalogue (builder) | `cli/src/node/catalogue-builder.ts` | WO4 |
| Display catalogue (query) | `cli/src/core/catalogue/` | WO4 |
| Validator | `cli/src/core/validator/` | WO5 |
| CLI entry | `cli/src/node/cli.ts` | WO1, WO6 |
| Diagnostic formatter | `cli/src/node/formatter.ts` | WO6 |
| Tests | `cli/test/` | WO1–WO6 |

---

## Display Catalogue — Ground Truth Approach

**Critical trap, documented here for all workers:**

Parse the `u8x8_display_info_t` structs in `u8x8_d_*.c`, **NOT** constructor
names. Verified against U8G2 2.36.18:
- 206 `display_info` structs across 90 driver files
- Each struct has authoritative `pixel_width` / `pixel_height`
- Constructor names like `U8G2_SSD0323_OS128064_F_4W_SW_SPI` do NOT yield
  geometry by regex (34% failure rate on `_F_` constructors)
- `u8x8.h` states: "pixel dimensions cannot always be computed from tile
  dimensions"

The pipeline:
```
u8x8_d_*.c  ──struct parse──▶  display_info records (206)
u8g2_d_setup.c ──fn parse──▶  setup → driver → buffer mapping
U8g2lib.h    ──class parse──▶  constructor class → setup function
                                    │
                              join + filter _F_
                                    │
                              ▼ catalogue.json (1631 _F_ constructors)
```

---

## Architecture Notes for Workers

1. **Isomorphic boundary is enforced by lint.** `src/core/` must never import
   `node:` anything. ESLint rule configured in WO1.

2. **TypeScript naming:** PascalCase types, camelCase functions, kebab-case
   files. NOT C++ `u8g2gl_` style — per u8g2gl-standards §2.

3. **Read before implementing:** `.agents/skills/u8g2gl-standards/SKILL.md`
   and `.agents/skills/u8g2gl-standards/references/typescript.md`.

4. **Diagnostics are the product, not error handling** (§1.2). Never `throw`
   for a user error. Collect and return `Diagnostic[]`.

5. **Determinism** (§13.9): no timestamps, sorted outputs, no locale-dependent
   formatting.

6. **Schema surface is expensive** (§1.5). Do not add schema elements beyond
   what the spec requires. Omission is the default.

7. **Reference U8G2 source:** `~/Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2/`

---

## Session Log

### 2026-09-08T23:07:00Z — PR-02 PA session initiated
Tier-2 PA engaged for PR-02 CLI foundation. Read all programme context:
operating model (5 rule files), design_spec v0.3 (§5, §5.2, §13, §15),
ui_spec v1.0 (all of §15), implementation_plan v1.7, PROGRAM.md session log,
MEMORY.md, PR-01 PROJECT.md (for lessons learned).

**Reconnaissance of U8G2 source (2.36.18):**
- Confirmed 206 `u8x8_display_info_t` structs across 90 `u8x8_d_*.c` files.
- Struct fields include `tile_width`, `tile_height`, `pixel_width`,
  `pixel_height`, `default_x_offset`, `flipmode_x_offset`.
- `u8g2_d_setup.c` contains 1080 setup functions; ~720 are `_f` (full-buffer).
- Constructor class names in `U8g2lib.h` map to setup functions.
- Confirmed the 34% regex failure rate: constructor names like
  `U8G2_SSD0323_OS128064_F_4W_SW_SPI` do not yield `128x64` by regex.

**PR-01 lessons applied:**
1. Workers will COMMIT ON GREEN BUILD — no "ask before committing" since
   SendMessage is disabled in this environment.
2. WORKORDERs will trace each objective through to the API surface that
   delivers it, not just name the objective.

Decomposed into 6 serialised work orders and presented for human approval.

### 2026-09-08T23:13:00Z — ui_spec §15 items deferred
Human requested hold on all UI-related elements pending questions about the
UI spec. The nine §15 editor requirements removed from the current
decomposition and noted as a deferred WO7. All are additive to the schema
types being built — no restructuring needed when they land.

Core CLI scope (skeleton, schema types from design_spec, parser, catalogue,
validator, CLI commands) proceeds independently. Revised decomposition
presented for approval.

### 2026-09-08T23:18:00Z — Human approval received
Human granted explicit approval for autonomous execution of the 6-WO
decomposition. Recorded in status table. Began execution immediately.

### 2026-09-08T23:22:00Z — WO1 Complete: Project Skeleton
`bea71ee` on `u8g2gl-cli/wo1-skeleton`. npm package `u8g2gl@0.3.0`, ESM,
TypeScript strict, Vitest, ESLint with isomorphic boundary rule enforcing
no `node:` imports in `src/core/`. CLI stub with `--json`, `--version`,
`--help`. 2 tests.

### 2026-09-08T23:27:00Z — WO2 Complete: Schema Types
`bd45c84` on `u8g2gl-cli/wo2-schema`. Complete type system for schema 0.3:
13 type definition files covering all XML file types, `<api>` manifests,
display records, diagnostics with 22 stable codes, source locations. All
readonly/immutable interfaces. 12 tests.

### 2026-09-08T23:34:00Z — WO3 Complete: XML Parser
`54073b1` on `u8g2gl-cli/wo3-parser`. Zero-dependency hand-rolled XML
tokeniser (isomorphic). Source locations per element and per attribute value.
Schema transformers for all file types. Error-recovering (returns diagnostics,
never throws). 36 tests across 9 suites.

### 2026-09-08T23:44:00Z — WO4 Complete: Display Catalogue
`12bdfc0` on `u8g2gl-cli/wo4-catalogue`. Parsed 206 `u8x8_display_info_t`
structs across 90 U8G2 driver files. Resolved 265 driver functions.
1637 full-buffer display records. 3274 page-mode → full-buffer mappings.
Four query modes (identify/source/compare/enumerate) with fuzzy matching
and negative-result diagnostics. 61 tests.

**Cross-cutting note:** The catalogue found 1637 `_F_` constructors — more
than the ~720 `_f` setup functions, because multiple constructor classes
(different bus wiring variants) can map to the same setup function.

### 2026-09-08T23:52:00Z — WO5 Complete: Validator
`a67d818` on `u8g2gl-cli/wo5-validator`. Seven validation passes: schema
structure, cross-file references, display validation, widget props vs
manifests, type checking, geometry, identifiers. Edit-distance suggestions
on all unknown-identifier errors. Page-mode → `_F_` suggestions. Name
collision detection after component inlining. 95 tests across 19 suites.

### 2026-09-08T23:59:00Z — WO6 Complete: CLI Integration
`23c2dd6` on `u8g2gl-cli/wo6-cli-integration`. §15.1 diagnostic formatter
with source context lines, underline carets, ANSI colour (TTY-aware).
Display query formatters for all four modes. Project file reader with
directory discovery. End-to-end integration tests via subprocess. npm
`files` field for packaging. 121 tests across 23 suites.

### 2026-09-08T23:59:30Z — Project Wrap-Up
**Architectural outcome:** The U8G2GL CLI is a working npm-publishable
TypeScript package with:
- An isomorphic core (`src/core/`) that runs in both Node and browser,
  enforced by ESLint
- A complete schema type system for XML v0.3
- A zero-dependency XML parser with per-attribute source locations
- A display catalogue of 1637 displays parsed from U8G2 C source (ground truth)
- A validator producing §15-grade diagnostics with stable machine codes
- `--json` on every command per [D-16]

**Lessons for future PRs:**
1. Workers still paused to ask approval despite WORKORDER saying "commit on
   green build" (WO1). The instruction needs to be more prominent or repeated.
2. Serialised WOs work well when each genuinely depends on the previous.
   All 6 ran cleanly with zero rework — the type system from WO2 was the key
   foundation that made WO3-WO6 straightforward.
3. Pre-writing all WORKORDERs while early workers run eliminates latency
   between WO completions.

**Unresolved items:**
- **WO7 (deferred):** Nine ui_spec §15 editor requirements held pending
  human review of the UI spec. All are additive extensions to the schema
  types — no restructuring needed. Scope documented in PROJECT.md.
- **No issues surfaced by any worker.** All six workers reported clean
  completion with no out-of-scope findings.
