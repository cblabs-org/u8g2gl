---
name: pr-02-cli-schema-wo3
description: Handoff instructions for Work Order 3 — XML Parser with Source Locations
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create additional branches, and do not plan beyond this
> checklist. Your task is strictly limited to executing the checklist below.

# Objective

Implement an XML parser in `cli/src/core/parser/` that parses U8G2GL project
XML files into the typed schema structures from WO2 (`cli/src/core/schema/`),
with source location tracking (file, line, column per element and per attribute).
The parser must be **fully isomorphic** — no Node imports — since it runs in the
browser for the designer.

# Parent PR & Authorization

This work order belongs to **PR-02: CLI Foundation, Schema, Validator, Display
Catalogue**. Human approval recorded in:
`.agents/skills/principal-architect-workspace/pr-02-cli-schema/PROJECT.md`
(status log, 2026-09-08T23:08:28Z).

# Context You Must Read

Before writing any code, read these files:

1. `.agents/skills/u8g2gl-standards/references/typescript.md` — §1 isomorphic
   constraint, §7 dependency rules
2. `docs/design_spec.md` §5.1–§5.4 — XML file formats
3. `docs/design_spec.md` §6.3–§6.4 — component and widget manifest XML
4. `cli/src/core/schema/` — all type definitions from WO2 (these are your
   output types)

# Strict Boundary Box

**DO NOT:**
- Create or modify any C++ files
- Modify files under `cli/src/core/schema/` (WO2's output — read only)
- Implement any validation logic — WO5 does that
- Implement any CLI commands — WO6 does that
- Create additional git branches
- Modify anything in `.agents/` except appending your Completion Report

**YOU MAY:**
- Create all files under `cli/src/core/parser/`
- Create test files and fixtures under `cli/test/parser/`
- Update `cli/src/core/index.ts` to re-export parser
- Add **browser-compatible** dependencies to `cli/package.json` if justified
  (prefer no dependency — see standards §7)

# Coding Standards

- PascalCase types, camelCase functions, kebab-case files
- SPDX MIT header on every source file
- No `any` — use `unknown` and narrow
- No `node:` imports (isomorphic)
- Never `throw` for user input errors — return `Diagnostic[]`

# Design Decisions

## XML Subset

U8G2GL XML is a restricted subset — no DTD, no CDATA sections, no processing
instructions beyond `<?xml?>`, no namespaces. The parser only needs to handle:
- Elements (self-closing and with children)
- Attributes (quoted values, single or double quotes)
- Text content (minimal — mostly attribute-driven)
- Comments (`<!-- -->`)
- The `<?xml?>` declaration (optional, skip if present)

## Parser Architecture

Implement a two-layer architecture:

1. **Tokeniser / low-level parser** — Turns raw XML string into a stream of
   tokens or a raw element tree, tracking source positions. This is the layer
   that might use an external library or be hand-rolled.

2. **Schema transformer** — Takes the raw parse tree and transforms it into
   the typed schema structures (`U8g2glProject`, `Globals`, `Screen`,
   `Component`, `WidgetManifest`) from WO2. This layer:
   - Maps element names to types (e.g. `<u8g2gl>` → `U8g2glProject`)
   - Extracts attributes into typed fields
   - Threads `SourceLocation` through every node and attribute
   - Returns `Diagnostic[]` for structural errors (unknown elements at this
     point — semantic validation is WO5's job)

## Source Locations Are Non-Negotiable

Every parsed element and every parsed attribute value must carry a
`SourceLocation` (file, line, column). This is what makes §15 diagnostics
possible — without it, error messages say "somewhere in the file" instead of
pointing to the exact attribute. The file is passed in by the caller (the
parser operates on strings, not files).

## Dependency Evaluation

Before choosing, evaluate these options in order of preference:

1. **No dependency** — A hand-rolled recursive-descent tokeniser for the
   restricted XML subset. Pros: zero bundle, full control over source locations.
   Cons: more code. The XML subset is small enough that this is viable.

2. **`fast-xml-parser`** — Popular, browser-compatible, but verify it reports
   per-attribute source locations (not just per-element). If it doesn't, option 1
   is better.

3. **Other** — Only if browser-compatible and reports per-attribute locations.

Document your choice and rationale in the Completion Report.

# Line-Item Instructions

- [ ] **`cli/src/core/parser/xml-tokeniser.ts`** (or use external lib) —
  Low-level XML tokeniser that:
  - Accepts a string and a filename (for source locations)
  - Tracks line and column position as it scans
  - Produces a raw element tree with:
    - Element name + source location
    - Attributes as `{ name, value, loc }` where `loc` points to the value
    - Children (nested elements)
    - Text content
    - Comments (preserved but not transformed)
  - Returns `Diagnostic[]` for malformed XML:
    - Code `U8G2GL_MALFORMED_XML`
    - File, line, column of the error
    - Human-readable message (e.g. "unclosed tag 'screen'")

- [ ] **`cli/src/core/parser/parse-project.ts`** — Transform raw XML tree
  into `U8g2glProject`:
  - Root element must be `<u8g2gl>`
  - Extract `schema`, `name`, `version` attributes
  - Parse `<target>` children → `Target[]`
  - Parse `<output>` child → `OutputConfig`
  - Thread source locations through all nodes

- [ ] **`cli/src/core/parser/parse-globals.ts`** — Transform raw XML tree
  into `Globals`:
  - Root element must be `<globals>`
  - Parse `<consts>` → `<int>`, `<string>` → `ConstDecl[]`
  - Parse `<subjects>` → `<int>`, `<string>`, `<bool>`, `<time>` → `SubjectDecl[]`
  - Parse `<styles>` → `<style>` → `StyleDecl[]`
  - Parse `<fonts>` → `<bdf>`, `<builtin>` → `FontDecl[]`
  - Parse `<images>` → `<xbm>`, `<convert>` → `ImageDecl[]`

- [ ] **`cli/src/core/parser/parse-screen.ts`** — Transform raw XML tree
  into `Screen`:
  - Root element must be `<screen>`
  - Parse local `<styles>` if present
  - Parse `<view>` → widget tree
  - Parse `<focus_ring>` → `FocusRing`
  - Call `parseWidgetTree` for the view's children

- [ ] **`cli/src/core/parser/parse-widget-tree.ts`** — Parse widget elements
  recursively:
  - Recognise Tier 1 primitives (`u8g2gl_hline`, `u8g2gl_vline`, `u8g2gl_box`,
    `u8g2gl_line`, `u8g2gl_circle`, `u8g2gl_ellipse`, `u8g2gl_triangle`,
    `u8g2gl_pixel`)
  - Recognise Tier 2 built-ins (`u8g2gl_label`, `u8g2gl_scrolling_label`,
    `u8g2gl_xbm`, `u8g2gl_glyph`, `u8g2gl_progress_bar`, `u8g2gl_clock`,
    `u8g2gl_switch`, `u8g2gl_button`)
  - Accept any `u8g2gl_*` or `wd_*` prefixed tag (custom widgets)
  - Accept any other tag as a potential component instance
  - Extract common attributes (x, y, width, height, right, bottom, etc.)
  - Extract `style_*` prefixed attributes as style overrides
  - Extract `bind_*` attributes
  - Parse child elements: nested widgets, `<bind_flag_if_*>`, `<screen_load_event>`,
    `<screen_back_event>`, `<event_cb>`, `<style>`
  - Produce `WidgetNode` with all source locations

- [ ] **`cli/src/core/parser/parse-component.ts`** — Transform raw XML tree
  into `Component`:
  - Root element must be `<component>`
  - Parse `<api>` → component props
  - Parse `<view>` → widget tree (reuse `parseWidgetTree`)

- [ ] **`cli/src/core/parser/parse-widget-manifest.ts`** — Transform raw XML
  tree into `WidgetManifest`:
  - Root element must be `<widget>`
  - Extract `name`, `extends`, `animated` attributes
  - Parse `<api>` → `ApiBlock` (props, bindings, elements)

- [ ] **`cli/src/core/parser/index.ts`** — Public API:
  ```ts
  // Parse a single XML file into the appropriate typed structure
  function parseProjectFile(xml: string, filename: string): ParseResult<U8g2glProject>;
  function parseGlobalsFile(xml: string, filename: string): ParseResult<Globals>;
  function parseScreenFile(xml: string, filename: string): ParseResult<Screen>;
  function parseComponentFile(xml: string, filename: string): ParseResult<Component>;
  function parseWidgetManifestFile(xml: string, filename: string): ParseResult<WidgetManifest>;

  // Generic result type
  interface ParseResult<T> {
    readonly value?: T;              // present if parsing succeeded
    readonly diagnostics: readonly Diagnostic[];  // always present (may be empty)
  }
  ```

- [ ] **Update `cli/src/core/index.ts`** — Re-export parser public API

## Test Fixtures

- [ ] **`cli/test/parser/fixtures/`** — Create fixture XML files:
  - `valid-project.xml` — A complete u8g2gl.xml per §5.1
  - `valid-globals.xml` — A complete globals.xml per §5.3
  - `valid-screen.xml` — A screen with label, button, focus_ring per §5.4/§12
  - `valid-component.xml` — A component with api props and view per §6.3
  - `valid-widget-manifest.xml` — A widget manifest with api block per §6.4
  - `malformed.xml` — Unclosed tags, bad attributes
  - `unknown-elements.xml` — Valid XML but with unknown element names

## Tests

- [ ] **`cli/test/parser/parse-project.test.ts`** — Test parsing u8g2gl.xml:
  - Parses `valid-project.xml` into a `U8g2glProject` with correct fields
  - Schema, name, version, targets all populated
  - Source locations present on project and each target
  - Attribute source locations point to correct line/column

- [ ] **`cli/test/parser/parse-globals.test.ts`** — Test parsing globals.xml:
  - All sections parsed: consts, subjects, styles, fonts, images
  - Font discriminated union (`bdf` vs `builtin`) correctly tagged
  - Image discriminated union (`xbm` vs `convert`) correctly tagged
  - Source locations on every declaration

- [ ] **`cli/test/parser/parse-screen.test.ts`** — Test parsing screen files:
  - Widget tree parsed with correct nesting
  - Common attributes extracted
  - Style overrides (style_*) captured
  - Binding children parsed
  - Event children parsed
  - Focus ring parsed with entries

- [ ] **`cli/test/parser/parse-component.test.ts`** — Test component parsing:
  - API props extracted with types and defaults
  - View widget tree parsed

- [ ] **`cli/test/parser/parse-widget-manifest.test.ts`** — Test manifest parsing:
  - Props, bindings, elements all parsed from `<api>` block
  - `animated`, `extends` attributes extracted

- [ ] **`cli/test/parser/malformed.test.ts`** — Test error handling:
  - Malformed XML returns `U8G2GL_MALFORMED_XML` diagnostic with correct location
  - Parser does not throw — returns diagnostics
  - Missing required attributes produce diagnostics

# Verification Requirement

1. `npm run build` — zero errors
2. `npm test` — all tests pass (existing + new parser tests)
3. `npm run lint` — zero errors (all parser code in `src/core/`, isomorphic enforced)

**Commit on green build.** Do not wait for approval.
Branch: `u8g2gl-cli/wo3-parser`. Push to origin after committing.

**CRITICAL:** Before committing, verify branch with `git branch --show-current`.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

---

## Completion Report

### Summary
Implemented zero-dependency, isomorphic, error-recovering XML parser toolkit in `cli/src/core/parser/` with exact 1-based source coordinate tracking (`SourceLocation` line and column) on elements and attribute values. Transformed untyped raw XML into typed U8G2GL schema ASTs (`U8g2glProject`, `Globals`, `Screen`, `Component`, `WidgetManifest`) adhering to `docs/design_spec.md` and returning structured diagnostics without throwing exceptions.

### Files Created/Modified
- `cli/src/core/parser/raw-xml.ts` — Raw XML element, attribute, and document AST interfaces with attribute query/inspection utilities.
- `cli/src/core/parser/xml-tokeniser.ts` — Pure TypeScript character scanner tracking line/column positions, handling XML entities, self-closing tags, comments, declarations, and syntax error diagnostics.
- `cli/src/core/parser/parse-project.ts` — Transforms `u8g2gl.xml` into `U8g2glProject` with hardware targets and output configuration.
- `cli/src/core/parser/parse-globals.ts` — Transforms `globals.xml` into `Globals` (consts, subjects, styles, fonts, images).
- `cli/src/core/parser/parse-widget-tree.ts` — Recursive widget tree parser handling common layout attributes, style overrides (`style_*`), reactive binding slots, and user interaction events.
- `cli/src/core/parser/parse-screen.ts` — Transforms `screen_*.xml` into `Screen` with local styles, view widget tree, and explicit cyclic `FocusRing`.
- `cli/src/core/parser/parse-component.ts` — Transforms Tier 3 component XML into `Component` with `<api>` props and `<view>` template.
- `cli/src/core/parser/parse-widget-manifest.ts` — Transforms widget manifests into `WidgetManifest` with props, bindings, and collection elements.
- `cli/src/core/parser/index.ts` — Public barrel export providing `ParseResult<T>` and parse functions.
- `cli/src/core/index.ts` — Re-exports parser public APIs from isomorphic core barrel.
- `cli/test/parser/fixtures/valid-project.xml` — Project descriptor fixture per §5.1.
- `cli/test/parser/fixtures/valid-globals.xml` — Globals fixture per §5.3.
- `cli/test/parser/fixtures/valid-screen.xml` — Screen fixture with widgets, events, and focus ring per §5.4/§12.
- `cli/test/parser/fixtures/valid-component.xml` — Component fixture with API and view per §6.3.
- `cli/test/parser/fixtures/valid-widget-manifest.xml` — Widget manifest fixture with API block per §6.4/§13.1.
- `cli/test/parser/fixtures/malformed.xml` — Malformed XML fixture with unclosed tags and syntax errors.
- `cli/test/parser/fixtures/unknown-elements.xml` — Fixture containing unknown elements.
- `cli/test/parser/xml-tokeniser.test.ts` — Tokeniser unit tests (coordinate tracking, entities, comments, self-closing tags).
- `cli/test/parser/parse-project.test.ts` — Project descriptor parsing unit tests.
- `cli/test/parser/parse-globals.test.ts` — Globals declaration parsing unit tests.
- `cli/test/parser/parse-screen.test.ts` — Screen document parsing unit tests.
- `cli/test/parser/parse-component.test.ts` — Component template parsing unit tests.
- `cli/test/parser/parse-widget-manifest.test.ts` — Widget manifest parsing unit tests.
- `cli/test/parser/malformed.test.ts` — Diagnostic reporting and error recovery tests.

### Verification Results
- `npm run build`: PASS (zero errors)
- `npm test`: 36 passed, 36 total across 9 test files
- `npm run lint`: PASS (zero errors, zero warnings)
- All 13 items on checklist verified: YES

### Notes
- Chose Option 1 (pure TypeScript scanner, zero third-party dependencies). Fully browser and Node isomorphic with no `node:*` imports in `src/core/`.
- `SourceLocation` points directly to the opening tag `<` for elements and the first character of attribute values inside quotes, perfectly aligning with diagnostic spans and `offendingText`.
- Clean recovery on XML errors emits `U8G2GL_MALFORMED_XML` and `U8G2GL_MISSING_REQUIRED` diagnostics while returning `undefined` for `value`.
