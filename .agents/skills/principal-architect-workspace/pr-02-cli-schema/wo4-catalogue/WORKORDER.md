---
name: pr-02-cli-schema-wo4
description: Handoff instructions for Work Order 4 — Display Catalogue Generator + Find Modes
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create additional branches, and do not plan beyond this
> checklist. Your task is strictly limited to executing the checklist below.

# Objective

Build the U8G2GL display catalogue from U8G2 2.36.18 source code and implement
the four query modes for `u8g2gl find` and `u8g2gl catalogue`. The catalogue
generator is Node-only (reads C source files). The query engine is isomorphic
(operates on the generated JSON in memory).

# Parent PR & Authorization

This work order belongs to **PR-02: CLI Foundation, Schema, Validator, Display
Catalogue**. Human approval recorded in:
`.agents/skills/principal-architect-workspace/pr-02-cli-schema/PROJECT.md`
(status log, 2026-09-08T23:08:28Z).

# Context You Must Read

1. `.agents/skills/u8g2gl-standards/references/typescript.md` — §1 isomorphic
2. `docs/design_spec.md` §5.2 — Display catalogue record schema and four
   query modes (identify, source, compare, enumerate)
3. `cli/src/core/schema/display-record.ts` — The `DisplayRecord` type (WO2)

# CRITICAL TRAP — Read This First

**Parse the `u8x8_display_info_t` structs in `u8x8_d_*.c`, NOT constructor
names.**

34% of full-buffer constructor names do not yield geometry by regex. For example,
`U8G2_SSD0323_OS128064_F_4W_SW_SPI` — the `OS128064` does NOT mean 128×64, and
regex extraction fails. The structs carry authoritative `pixel_width` and
`pixel_height` and cover 100% of displays.

`u8x8.h` states: *"pixel dimensions cannot always be computed from tile
dimensions."*

The structs are the ground truth. The constructors are display labels. Join them
through `u8g2_d_setup.c`.

# U8G2 Source Location

Reference copy of U8G2 2.36.18:
```
~/Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2/
```

Three source files matter:

1. **`src/clib/u8x8_d_*.c`** — ~90 driver files, each containing one or more
   `static const u8x8_display_info_t` structs. Total: 206 structs. Each struct
   has commented fields:
   ```c
   static const u8x8_display_info_t u8x8_ssd1306_128x32_univision_display_info =
   {
     /* chip_enable_level = */ 0,
     /* chip_disable_level = */ 1,
     /* post_chip_enable_wait_ns = */ 20,
     /* pre_chip_disable_wait_ns = */ 10,
     /* reset_pulse_width_ms = */ 100,
     /* post_reset_wait_ms = */ 100,
     /* sda_setup_time_ns = */ 50,
     /* sck_pulse_width_ns = */ 50,
     /* sck_clock_hz = */ 8000000UL,
     /* spi_mode = */ 0,
     /* i2c_bus_clock_100kHz = */ 4,
     /* data_setup_time_ns = */ 40,
     /* write_pulse_width_ns = */ 150,
     /* tile_width = */ 16,
     /* tile_height = */ 4,
     /* default_x_offset = */ 0,
     /* flipmode_x_offset = */ 0,
     /* pixel_width = */ 128,
     /* pixel_height = */ 32
   };
   ```
   You need: `tile_width`, `tile_height`, `default_x_offset`, `flipmode_x_offset`,
   `pixel_width`, `pixel_height`. Also capture the struct variable name (it links
   to the driver function).

2. **`src/clib/u8g2_d_setup.c`** — Contains ~1080 setup functions. Each one:
   ```c
   void u8g2_Setup_ssd1306_i2c_128x64_noname_f(u8g2_t *u8g2, const u8g2_cb_t *rotation,
       u8x8_msg_cb byte_cb, u8x8_msg_cb gpio_and_delay_cb)
   {
     u8g2_SetupDisplay(u8g2, u8x8_d_ssd1306_128x64_noname, ...);
     u8g2_SetupBuffer(u8g2, buf, 8, u8g2_ll_hvline_vertical_top_lsb, rotation);
   }
   ```
   You need: the setup function name (`u8g2_Setup_ssd1306_i2c_128x64_noname_f`),
   the driver function it calls (`u8x8_d_ssd1306_128x64_noname`), and the buffer
   tile count from `u8g2_SetupBuffer` (the second numeric arg). The `_f` suffix
   means full-buffer; `_1` and `_2` are page modes.

3. **`src/U8g2lib.h`** — Contains C++ constructor class declarations:
   ```cpp
   class U8G2_SSD1306_128X64_NONAME_F_4W_SW_SPI : public U8G2 {
     ...
     U8G2_SSD1306_128X64_NONAME_F_4W_SW_SPI(...) : U8G2() {
       u8g2_Setup_ssd1306_128x64_noname_f(&u8g2, ...);
     }
   };
   ```
   You need: the class name (this is what users write in `setup=` in their
   u8g2gl.xml target), and which setup function it calls.

# Strict Boundary Box

**DO NOT:**
- Create or modify any C++ files
- Modify schema types in `cli/src/core/schema/` (read only)
- Modify parser code in `cli/src/core/parser/` (read only)
- Implement validation logic — WO5 does that
- Create additional git branches
- Modify anything in `.agents/` except appending your Completion Report

**YOU MAY:**
- Create files under `cli/src/core/catalogue/` (isomorphic query engine)
- Create files under `cli/src/node/` (Node-only catalogue builder)
- Create the pre-built catalogue JSON at `cli/src/data/catalogue.json`
- Create test files and fixtures under `cli/test/catalogue/`
- Update `cli/src/core/index.ts` to re-export catalogue query API
- Update `cli/src/node/cli.ts` to wire the `find` and `catalogue` commands

# Coding Standards

- PascalCase types, camelCase functions, kebab-case files
- SPDX MIT header on every source file
- No `any` — use `unknown` and narrow
- `src/core/catalogue/` must be isomorphic — no `node:` imports
- `src/node/catalogue-builder.ts` may use `node:fs`, `node:path`
- Output JSON must be deterministic: sorted by setup name, no timestamps

# Line-Item Instructions

## Catalogue Builder (Node-only)

- [ ] **`cli/src/node/catalogue-builder.ts`** — The U8G2 source parser:

  **Step 1: Parse display_info structs from `u8x8_d_*.c`**
  - Glob for `u8x8_d_*.c` files in the U8G2 `src/clib/` directory
  - For each file, regex-parse `static const u8x8_display_info_t <varname> =`
    blocks, extracting the commented field values (the comments like
    `/* tile_width = */` are the reliable field identifiers — use them)
  - Build a map: `varname → { tile_width, tile_height, default_x_offset,
    flipmode_x_offset, pixel_width, pixel_height, sourceFile }`
  - Expected: 206 structs across 90 files

  **Step 2: Parse setup functions from `u8g2_d_setup.c`**
  - Parse all `void u8g2_Setup_*` function definitions
  - For each, extract:
    - Setup function name (e.g. `u8g2_Setup_ssd1306_i2c_128x64_noname_f`)
    - Driver function called in `u8g2_SetupDisplay(u8g2, <driver_fn>, ...)`
    - Whether it's full-buffer (`_f` suffix), page-1 (`_1`), or page-2 (`_2`)
  - Build a map: `setup_fn → { driver_fn, buffer_mode }`

  **Step 3: Parse constructor classes from `U8g2lib.h`**
  - Parse `class U8G2_*` declarations
  - For each, extract:
    - Class name (e.g. `U8G2_SSD1306_128X64_NONAME_F_4W_SW_SPI`)
    - Setup function called in the constructor body
  - Build a map: `class_name → setup_fn`

  **Step 4: Join and filter**
  - For each constructor class:
    - Look up its setup function → get driver function
    - Find which display_info struct the driver function uses (the driver
      function name is derived from the struct variable name — they follow a
      naming convention, e.g. `u8x8_d_ssd1306_128x64_noname` references
      `u8x8_ssd1306_128x64_noname_display_info` or similar)
    - If the setup function has `_f` suffix → include (full-buffer)
    - If `_1` or `_2` → exclude (page mode), but record the class name for
      the page-mode → full-buffer suggestion feature
  - Construct `DisplayRecord` for each matched constructor

  **Step 5: Extract controller and variant**
  - From the class name `U8G2_SSD1306_128X64_NONAME_F_4W_SW_SPI`:
    - Controller: `SSD1306` (first token after `U8G2_`)
    - Variant: tokens between controller and the `_F_` marker → `["128X64", "NONAME"]`
    - Bus: tokens after `_F_` → raw `"4W_SW_SPI"`, family `"spi"`
  - Bus family classification:
    - Contains `I2C` → `i2c`
    - Contains `SPI` → `spi`
    - Contains `8080` or `6800` or `PARALLEL` → `parallel`

  **Step 6: Compute framebuffer_bytes**
  - `framebufferBytes = tiles.width * tiles.height * 8`

  **Step 7: Write catalogue JSON**
  - Sort records by `setup` name (deterministic)
  - Write to `cli/src/data/catalogue.json`
  - **Also** export a TypeScript module `cli/src/data/catalogue.ts` that
    imports the JSON for use by the query engine:
    ```ts
    import catalogueData from './catalogue.json' with { type: 'json' };
    import type { DisplayRecord } from '../core/schema/display-record.js';
    export const CATALOGUE: readonly DisplayRecord[] = catalogueData as DisplayRecord[];
    ```

  **Step 8: Build a page-mode lookup**
  - For page-mode constructor classes, record a map:
    `pageModeName → fullBufferEquivalent`
  - Write to `cli/src/data/page-mode-map.json`
  - This is consumed by the validator (WO5) to suggest `_F_` alternatives

- [ ] **`cli/src/node/build-catalogue.ts`** — CLI script entry point:
  - Accepts a `--u8g2-path` argument (path to U8G2 source root)
  - Calls the builder, writes `catalogue.json` and `page-mode-map.json`
  - Prints summary: N structs parsed, N constructors matched, N full-buffer
  - Add a `scripts` entry in `package.json`: `"build:catalogue": "..."`

## Query Engine (Isomorphic)

- [ ] **`cli/src/core/catalogue/edit-distance.ts`** — Levenshtein edit distance:
  - Pure function, no dependencies
  - Used by fuzzy matching in identify mode and by the validator for suggestions
  - Export `editDistance(a: string, b: string): number`
  - Export `findClosest(query: string, candidates: readonly string[],
    maxDistance?: number): readonly string[]` — returns candidates sorted by
    distance, filtered to `maxDistance` (default 3)

- [ ] **`cli/src/core/catalogue/query.ts`** — Query engine operating on
  `DisplayRecord[]`:

  **(a) Identify mode** — `identifyDisplay(catalogue, query: string)`
  - Tokenise the query string
  - Score each `DisplayRecord` by matching tokens against: controller,
    variant[], width×height geometry, bus family/wiring
  - Use edit distance for fuzzy matching (e.g. "SSD1036" → "SSD1306")
  - Return results ranked by score
  - Include disambiguation notes when multiple variants match
  - Handle negative results:
    - Controller found but not at that geometry → message with available geometries
    - Controller not in U8G2 → message saying so
    - Ambiguous text → list interpretations

  **(b) Source mode** — `sourceDisplay(catalogue, constraints: SourceConstraints)`
  ```ts
  interface SourceConstraints {
    readonly minWidth?: number;
    readonly maxWidth?: number;
    readonly height?: number;
    readonly bus?: BusFamily;
    readonly maxFramebuffer?: number;
    readonly controllerFamily?: string;   // prefix match, e.g. "SSD" matches SSD1306, SSD1322
    readonly fitsTarget?: FitsTarget;     // RAM classification
  }

  interface FitsTarget {
    readonly boardRam: number;            // bytes
  }
  ```
  - Filter catalogue by constraints
  - If `fitsTarget` provided, classify each result's framebuffer:
    - `comfortable`: < 10% of board RAM
    - `significant`: 10-25%
    - `check`: > 25%
  - Return matching records with classification

  **(c) Compare mode** — `compareDisplays(catalogue, setups: string[])`
  - Look up each setup name in the catalogue
  - Return a comparison structure showing only fields that differ between
    the selected displays

  **(d) Enumerate mode** — `enumerateDisplays(catalogue)`
  - Return all records (the catalogue itself)

- [ ] **`cli/src/core/catalogue/index.ts`** — Re-export query API

- [ ] **Update `cli/src/core/index.ts`** — Re-export catalogue query API

## CLI Wiring

- [ ] **Update `cli/src/node/cli.ts`** — Wire the `find` and `catalogue`
  commands. Replace the "Not yet implemented" stubs with:

  **`u8g2gl find <query>`** — Default: identify mode
  - Parse remaining args as a free-text query string
  - Detect structured flags: `--min-width`, `--max-width`, `--height`, `--bus`,
    `--max-framebuffer`, `--controller-family`, `--fits`
  - If structured flags present → source mode
  - If `--compare` flag → compare mode (remaining args are setup names)
  - If `--json` → output JSON result
  - Else → human-readable table

  **`u8g2gl catalogue`** — Enumerate mode
  - If `--json` → output full catalogue JSON
  - Else → summary table (controller, geometry, bus variants)

## Tests

- [ ] **`cli/test/catalogue/edit-distance.test.ts`** — Unit tests:
  - Known distances: "kitten"/"sitting" = 3, identical = 0, empty strings
  - `findClosest` returns sorted results within max distance

- [ ] **`cli/test/catalogue/builder.test.ts`** — Integration test:
  - **Only if U8G2 source is available at the reference path** (skip otherwise)
  - Build the full catalogue
  - Assert 206 display_info structs found
  - Assert the number of full-buffer constructors is reasonable (~700-800 range)
  - Assert a known display exists: `U8G2_SSD1306_128X64_NONAME_F_HW_I2C` with
    width=128, height=64, bus.family='i2c'
  - Assert a known display's tile_width and pixel_width match the struct

- [ ] **`cli/test/catalogue/query.test.ts`** — Query tests:
  - **Identify**: "SSD1306 128x64 i2c" returns relevant results
  - **Identify**: "SSD1036" fuzzy-matches to "SSD1306" entries
  - **Identify negative**: "NONEXISTENT_9999" returns empty with message
  - **Source**: `{ minWidth: 128, bus: 'i2c' }` returns only matching records
  - **Source with fits**: classify framebuffer sizes against 520KB board RAM
  - **Compare**: comparing two SSD1306 variants shows only differing fields
  - **Enumerate**: returns all records

# Verification Requirement

1. `npm run build` — zero errors
2. `npm test` — all tests pass
3. `npm run lint` — zero errors
4. Run the catalogue builder against the reference U8G2 copy and verify output:
   `npx tsx src/node/build-catalogue.ts --u8g2-path ~/Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2`
5. `node dist/node/cli.js find "SSD1306 128x64 i2c"` — returns results
6. `node dist/node/cli.js catalogue --json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.length + ' displays')"` — prints count

**Commit on green build.** Do not wait for approval.
Branch: `u8g2gl-cli/wo4-catalogue`. Push to origin after committing.

**CRITICAL:** Before committing, verify branch with `git branch --show-current`.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

---

## Completion Report
<!-- Written by the worker at task completion -->

### 1. Summary of Accomplishments
- **Catalogue Builder**: Implemented `cli/src/node/catalogue-builder.ts` implementing the complete 8-step U8G2 source parsing pipeline:
  - Extracted 206 authoritative `u8x8_display_info_t` structs across 90 `u8x8_d_*.c` driver files using exact commented field values (`tile_width`, `tile_height`, `default_x_offset`, `flipmode_x_offset`, `pixel_width`, `pixel_height`).
  - Resolved 265 driver function symbols in `u8x8_d_*.c` (handling direct struct references and one-hop delegating/forwarding functions).
  - Parsed all setup functions from `u8g2_d_setup.c` separating full-buffer (`_f`) from page-mode (`_1`, `_2`).
  - Extracted all constructor classes from `U8g2lib.h`, joining each constructor to its setup function and underlying `display_info` struct.
  - Classified bus families (`i2c`, `spi`, `parallel`) and standard wiring modes (`hardware`, `software`, `4w_hardware`, etc.).
  - Compiled 1,637 full-buffer displays and mapped 3,274 page-mode constructors to their full-buffer equivalents.
- **Build CLI Script & Data Generation**:
  - Implemented `cli/src/node/build-catalogue.ts` supporting `--u8g2-path` with home directory (`~`) expansion.
  - Added `"build:catalogue": "tsx src/node/build-catalogue.ts"` in `cli/package.json`.
  - Generated deterministic `cli/src/data/catalogue.json` (sorted by setup name) and `cli/src/data/page-mode-map.json`.
  - Created `cli/src/data/catalogue.ts` exporting strongly typed `CATALOGUE: readonly DisplayRecord[]`.
- **Query Engine (Isomorphic)**:
  - Implemented `cli/src/core/catalogue/edit-distance.ts` providing pure Levenshtein distance (`editDistance`) and deterministic closest candidate ranking (`findClosest`).
  - Implemented `cli/src/core/catalogue/query.ts` providing all four query modes:
    - **(a) Identify**: Free-text token matching against controller, variant, geometry, bus, with fuzzy edit-distance fallback, electrical variant disambiguation notes (e.g. SH1106 2px shift), and actionable negative diagnostic messages.
    - **(b) Source**: Multi-constraint filtering with MCU SRAM headroom classification (`comfortable` < 10%, `significant` 10-25%, `check` > 25%).
    - **(c) Compare**: Attribute diffing returning only differing fields across selected setup names.
    - **(d) Enumerate**: Returns complete catalogue.
  - Exported through `cli/src/core/catalogue/index.ts` and re-exported via `cli/src/core/index.ts`.
- **CLI Subcommand Integration**:
  - Updated `cli/src/node/cli.ts` to wire `find` (identify, source, compare modes) and `catalogue` (enumerate mode), supporting `--json` and formatted human-readable output tables.
  - Ensured graceful event loop exit so stdout pipe buffers drain without truncation on large datasets.
- **Comprehensive Test Suite**:
  - `cli/test/catalogue/edit-distance.test.ts` (10 tests passing)
  - `cli/test/catalogue/builder.test.ts` (4 integration tests passing against reference U8G2 source)
  - `cli/test/catalogue/query.test.ts` (11 tests passing across all 4 query modes)
  - Entire test suite: 61 tests across 12 files passing (100%).

### 2. Verification Results
1. `npm run build`: Zero errors (`tsc` passed cleanly).
2. `npm test`: 61 tests passed across 12 files (100%).
3. `npm run lint`: Zero errors (ESLint passed cleanly).
4. Catalogue builder execution:
   `npx tsx src/node/build-catalogue.ts --u8g2-path ~/Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2`
   Successfully parsed 206 structs, resolved 265 driver functions, compiled 1,637 displays, mapped 3,274 page-mode constructors.
5. CLI find verification:
   `node dist/node/cli.js find "SSD1306 128x64 i2c"` returned matching displays with formatted table, framebuffer size, and disambiguation note.
6. CLI catalogue verification:
   `node dist/node/cli.js catalogue --json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.length + ' displays')"`
   Printed `1637 displays`.

### 3. Issues Surfaced
- **Upstream C Scoping in U8G2**: Two `static const u8x8_display_info_t` structs share identical variable names across different C driver files:
  - `u8x8_st7586s_ymc240160_display_info` in both `u8x8_d_st7586s_md240128.c` (240x128) and `u8x8_d_st7586s_ymc240160.c` (240x160).
  - `u8x8_uc1701_display_info` in both `u8x8_d_uc1701_dogs102.c` (102x64) and `u8x8_d_uc1701_mini12864.c` (128x64).
  In C, static variables are file-scoped. If a parser keys structs purely by variable name in a global map, one definition clobbers the other. The parser handles this by resolving driver functions to structs file-by-file within the translation unit, preserving exact geometry for each driver.
- **Node.js Stdout Piping with Large JSON**: Calling `process.exit(0)` immediately after `console.log(largeJson)` truncates the pipe stream at 64KB on POSIX systems because `process.exit()` terminates the process before the OS pipe buffer drains. Using `return` on clean exits allows Node's event loop to naturally flush stdout before termination.

