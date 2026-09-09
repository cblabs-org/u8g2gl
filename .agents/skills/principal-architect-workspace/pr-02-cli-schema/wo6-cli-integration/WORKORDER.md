---
name: pr-02-cli-schema-wo6
description: Handoff instructions for Work Order 6 — CLI Polish + Integration Tests
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create additional branches, and do not plan beyond this
> checklist. Your task is strictly limited to executing the checklist below.

# Objective

Final integration of the U8G2GL CLI: polish human-readable output formatting
for diagnostics and display queries per §15.1, ensure `--json` works on every
command, add end-to-end integration tests, and bundle the pre-generated display
catalogue with the npm package.

# Parent PR & Authorization

This work order belongs to **PR-02: CLI Foundation, Schema, Validator, Display
Catalogue**. Human approval recorded in:
`.agents/skills/principal-architect-workspace/pr-02-cli-schema/PROJECT.md`
(status log, 2026-09-08T23:08:28Z).

# Context You Must Read

1. `docs/design_spec.md`:
   - §5.2 — display query result format examples
   - §15.1 — diagnostic output format (the exact example to match)
   - §15.3 — [D-16] machine-readable contract
2. `cli/src/node/cli.ts` — current CLI wiring (WO1/WO4/WO5 state)
3. `cli/src/core/schema/diagnostic.ts` — Diagnostic type
4. `cli/src/core/catalogue/query.ts` — query engine API (WO4)

# Strict Boundary Box

**DO NOT:**
- Create or modify any C++ files
- Modify core logic in `cli/src/core/validator/`, `cli/src/core/parser/`,
  `cli/src/core/catalogue/query.ts` (read only — fix bugs only if found)
- Create additional git branches
- Modify anything in `.agents/` except appending your Completion Report

**YOU MAY:**
- Create/modify files under `cli/src/node/` (CLI, formatters)
- Create test files under `cli/test/integration/`
- Modify `cli/package.json` (scripts, files field for npm packaging)

# Coding Standards

- PascalCase types, camelCase functions, kebab-case files
- SPDX MIT header on every source file
- No `any`
- Determinism: no timestamps, sorted output

# Line-Item Instructions

## Human-Readable Diagnostic Formatter

- [x] **`cli/src/node/format-diagnostic.ts`** — Format diagnostics per §15.1:
  ```
  error: screens/screen_home.xml:14:32
     unknown font 'small_9'
     |
  14 |     <u8g2gl_label font="small_9" ... />
     |                       ^^^^^^^
     = 3 fonts are declared in globals.xml: small_09, tall_12, clock_small_7
     = did you mean 'small_09'?
  ```
  Implementation:
  - Accept a `Diagnostic` and the original file content (for context lines)
  - Print `severity: file:line:column` header
  - Print the message
  - Print the source line with a line number gutter
  - Print underline carets (`^`) under the offending text
  - Print suggestion lines if `suggestions` is non-empty:
    - If 1 suggestion: `= did you mean '<suggestion>'?`
    - If multiple: list them
  - Colour output when stdout is a TTY (red for errors, yellow for warnings,
    cyan for info) — but **no colour** when `--json` or piped

- [x] **`cli/src/node/format-display.ts`** — Format display query results:
  - **Identify mode:** tabular output with controller, geometry, bus, setup name
  - **Source mode:** same table plus framebuffer classification if `--fits` used
  - **Compare mode:** table showing only differing fields, side by side
  - **Enumerate mode:** summary table (controller, count of variants, geometries)
  - **Negative results:** clear actionable messages:
    - "Controller 'XYZ' is not supported by U8G2 2.36.18"
    - "SSD1306 is supported but not at 256x64. Available geometries: 128x64, 128x32, ..."
    - "Ambiguous query 'SSD' — did you mean one of: SSD1306, SSD1309, SSD1322, ...?"

## CLI Refinement

- [x] **Refactor `cli/src/node/cli.ts`** — Complete the CLI wiring:
  - `u8g2gl validate [project-dir]`:
    - Read all project XML files from the directory
    - Parse with WO3 parser, validate with WO5 validator
    - `--json` → `{ "diagnostics": Diagnostic[], "errors": N, "warnings": N }`
    - Default → formatted diagnostics using `format-diagnostic.ts`
    - Read source files for context lines in formatted output
    - Exit 0 on clean, 1 on errors
  - `u8g2gl find <query> [flags]`:
    - `--json` → JSON result from query engine
    - Default → formatted table using `format-display.ts`
  - `u8g2gl catalogue`:
    - `--json` → full catalogue JSON
    - Default → summary table
  - `u8g2gl --version` → version from package.json
  - `u8g2gl --help` → usage showing all commands and flags
  - Common flag: `--no-color` to force plain output

- [x] **`cli/src/node/read-project.ts`** — Project file reader (Node-only):
  ```ts
  interface ProjectFiles {
    readonly projectXml: string;         // u8g2gl.xml content
    readonly globalsXml: string;         // globals.xml content
    readonly screenXmls: readonly { filename: string; content: string }[];
    readonly componentXmls: readonly { filename: string; content: string }[];
    readonly widgetManifestXmls: readonly { filename: string; content: string }[];
  }

  function readProjectFiles(dir: string): ProjectFiles;
  ```
  - Reads `u8g2gl.xml` from project root
  - Reads `globals.xml` from project root
  - Globs `screens/screen_*.xml`
  - Globs `components/*/[name].xml`
  - Globs `widgets/*/[name].xml`
  - Throws clear error if `u8g2gl.xml` not found

## npm Packaging

- [x] **Update `cli/package.json`** — Add `files` field to control what gets
  published:
  ```json
  "files": ["dist/", "src/data/catalogue.json", "src/data/page-mode-map.json"]
  ```
  The catalogue JSON ships with the package — it is not generated at install
  time.

## Integration Tests

- [x] **`cli/test/integration/fixtures/valid-project/`** — A complete valid
  project directory:
  - `u8g2gl.xml` — targets a real display from the catalogue
  - `globals.xml` — consts, subjects, styles, fonts, images
  - `screens/screen_home.xml` — widgets with bindings and focus ring
  - `components/status_bar/status_bar.xml` — a reusable component

- [x] **`cli/test/integration/fixtures/broken-project/`** — A project with
  known errors:
  - Unknown font, unknown display, missing required prop, bad name

- [x] **`cli/test/integration/cli.test.ts`** — End-to-end CLI tests:
  - `u8g2gl validate valid-project/` → exit 0, no output on stderr
  - `u8g2gl validate valid-project/ --json` → valid JSON, `errors: 0`
  - `u8g2gl validate broken-project/` → exit 1, diagnostics on stderr
  - `u8g2gl validate broken-project/ --json` → valid JSON with diagnostics
  - `u8g2gl find "SSD1306 128x64 i2c"` → output contains "SSD1306"
  - `u8g2gl find "SSD1306 128x64 i2c" --json` → valid JSON array
  - `u8g2gl catalogue --json` → valid JSON, array length > 100
  - `u8g2gl --version` → prints version matching package.json
  - `u8g2gl --help` → prints usage including all commands
  - `u8g2gl nonexistent` → exit 1, error message
  - Every `--json` output parses as valid JSON
  
  **Test method:** Use `child_process.execFile` to run the built CLI as a
  subprocess. This tests the real entry point.

## Final Verification

- [x] **Verify `--json` on every command:**
  - `node dist/node/cli.js validate fixtures/valid/ --json` → valid JSON
  - `node dist/node/cli.js find "SSD1306" --json` → valid JSON
  - `node dist/node/cli.js catalogue --json` → valid JSON

- [x] **Verify human-readable output matches §15.1:**
  - Run `validate` on the broken fixture
  - Visually confirm: file:line:column header, source line with gutter,
    underline carets, suggestion lines

# Verification Requirement

1. `npm run build` — zero errors
2. `npm test` — all tests pass (existing + new integration tests)
3. `npm run lint` — zero errors
4. Run through all the final verification checks above

**Commit on green build.** Do not wait for approval.
Branch: `u8g2gl-cli/wo6-cli-integration`. Push to origin after committing.

**CRITICAL:** Before committing, verify branch with `git branch --show-current`.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

---

## Completion Report

### 1. Summary of Work Delivered
- **`cli/src/node/format-diagnostic.ts`**: Implemented compiler-style diagnostic formatting matching design_spec §15.1, including `severity: file:line:column` headers, source context lines with padded line number gutters, underline carets pointing directly to offending tokens, and near-match suggestion lines. Supports ANSI terminal colours with automatic TTY and `NO_COLOR` / `--no-color` detection.
- **`cli/src/node/format-display.ts`**: Implemented human-readable formatters for all four catalogue query modes (§5.2): identify (tabular match list with framebuffer size and electrical variant notes), source (filter candidate table with internal SRAM headroom evaluation), compare (difference-only side-by-side table), and catalogue summary (controller family breakdown). Formats negative query responses with actionable guidance.
- **`cli/src/node/read-project.ts`**: Implemented Node filesystem reader discovering and loading `u8g2gl.xml`, `globals.xml`, `screens/screen_*.xml`, `components/*/[name].xml`, and `widgets/*/[name].xml`. Throws descriptive error if `u8g2gl.xml` is missing. Provides `getProjectFileMap` helper for fast source context line lookups.
- **`cli/src/node/cli.ts`**: Refactored CLI command router and handlers:
  - `u8g2gl validate [project-dir]`: loads project files via `readProjectFiles`, parses via WO3 parser, validates via WO5 validator, emits structured JSON with `{ diagnostics, errors, warnings }` when `--json` is supplied, or formatted diagnostics with source context lines on stderr when errors exist (exit 0 on clean, exit 1 on errors).
  - `u8g2gl find <query> [flags]`: supports identify, source, and compare modes with human-readable tables or `--json` structured arrays.
  - `u8g2gl catalogue`: supports summary table or `--json` array.
  - Global flags `--version`, `--help`, `--no-color` supported.
- **`cli/package.json`**: Added `"files": ["dist/", "src/data/catalogue.json", "src/data/page-mode-map.json"]` for npm package distribution.
- **Integration Test Fixtures**:
  - `cli/test/integration/fixtures/valid-project/`: valid targets, globals, screens with focus ring and bindings, status_bar component, and u8g2gl_label manifest.
  - `cli/test/integration/fixtures/broken-project/`: triggers all 4 known error classes (`U8G2GL_UNKNOWN_DISPLAY`, `U8G2GL_INVALID_NAME`, `U8G2GL_MISSING_REQUIRED`, `U8G2GL_UNKNOWN_FONT`).
- **End-to-End Tests**:
  - `cli/test/integration/cli.test.ts`: 10 subprocess tests using `child_process.execFile` covering all required commands, exit codes, stderr/stdout routing, and `--json` parsing.
  - `cli/test/node/format-diagnostic.test.ts`: unit tests for §15.1 layout, gutter alignment, carets, suggestions, and ANSI colors.
  - `cli/test/node/format-display.test.ts`: unit tests for all display search modes.
  - `cli/test/node/read-project.test.ts`: unit tests for directory discovery and error handling.

### 2. Verification Results
- `npm run build`: Zero errors (`tsc` passed cleanly).
- `npm test`: 23 test files passed, 121 tests passed (100% pass rate).
- `npm run lint`: Zero errors (`eslint` passed cleanly).
- Manual verification:
  - `validate fixtures/valid --json` -> exit 0, `{ "diagnostics": [], "errors": 0, "warnings": 0 }`.
  - `find "SSD1306 128x64 i2c" --json` -> exit 0, valid JSON array of `DisplayRecord`.
  - `catalogue --json` -> exit 0, valid JSON array (length 221 > 100).
  - `validate fixtures/broken-project` -> exit 1, formatted diagnostics on stderr matching §15.1.
  - `--version` -> `0.3.0`.
  - `--help` -> complete command usage.
  - `nonexistent` -> exit 1, error message.

### 3. Issues Surfaced Outside Boundary Box
None. All isomorphic core components, parsers, and catalogue data performed exactly to specification without requiring modifications.
