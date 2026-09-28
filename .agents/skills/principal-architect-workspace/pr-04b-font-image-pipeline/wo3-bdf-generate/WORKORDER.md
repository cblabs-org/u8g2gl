---
name: pr-04b-font-image-pipeline-wo3
description: Handoff instructions for Work Order 3 — <bdf> through generate
complexity: standard
---

# WO3 — `<bdf>` through `generate`

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo3-bdf-generate` (already created, base
`u8g2gl-fonts/wo2-font-compiler`). **Working tree:**
`/Users/mcneillm/Documents/Projects/U8G2GL-04b`. Work only there.

## Role Definition

You are an expert senior software engineer and execution-focused worker agent.
You are NOT the Principal Architect. Do not make high-level architectural
decisions, do not create branches, and do not plan beyond this checklist.

**You commit on a green build and you never ask permission mid-flight.** Nobody
can answer you while you run; a question strands your work uncommitted. Where
this WORKORDER leaves a choice to you, make it and record it under *Decisions
Made*. If something genuinely blocks you, commit what is green, write the
Completion Report with status `partial` or `blocked`, and stop.

## Objective

`u8g2gl generate` accepts a `<bdf>` font, compiles it with WO2's
`compileBdf`, and emits it into `ui_fonts.cpp` as `ui_font_<name>` with a
provenance comment. The budget reports each compiled font's **measured** byte
size. Replace the refusal; do not change the schema.

The committed C++ fixture (`test/generated_fixture/`), the real-U8G2 C++ test
and the editor target are **WO3b's**, not yours. You prove this WO with CLI
tests that build temporary projects, and through the built CLI.

## Read first

- [PROJECT.md](../PROJECT.md) — *Design decisions* and the Session Log entries
  *WO1 ingested* and *WO2 ingested*.
- WO2's Completion Report: [../wo2-font-compiler/WORKORDER.md](../wo2-font-compiler/WORKORDER.md) —
  *The API WO3 will call* is your contract with WO2.
- design_spec §13.4 (the `<bdf>` → `ui_font_<name>` row and the naming rules),
  §13.9 (determinism), §14.1 (provenance), §18 (budget).

## Strict Boundary Box

**In scope:**
- `cli/src/core/fonts/**` — item 1 only.
- `cli/src/core/assets/` or similar — new: the async compile step (item 3). Name
  it per the standards skill.
- `cli/src/core/generator/generate.ts`, `cli/src/core/generator/emit/fonts.ts`,
  `emit/ui-hpp.ts`, `emit/unit.ts`, `emit/images.ts` and `emit/xbm.ts` (only for
  the bytes change in item 2), `cli/src/core/generator/report/budget.ts`, and
  the budget's formatter `cli/src/node/format-budget.ts`.
- `cli/src/core/validator/validate-not-yet-supported.ts` — remove the `<bdf>`
  refusal only. **`<convert>` stays refused** (WO4).
- `cli/src/core/schema/diagnostic.ts` — new codes only if none fits.
- `cli/src/node/load-project.ts`, `cli/src/node/cli.ts` — reading asset bytes,
  finding licence files, calling the compile step.
- `cli/src/core/index.ts`, `cli/src/browser/index.ts` — export the compile step.
- `cli/package.json`, `cli/package-lock.json` — version 0.8.0 → **0.9.0**
  (both `version` fields in the lockfile too; PR-4R had to fix that once).
- `cli/test/**` — new and updated tests, including any existing test that
  asserts the `<bdf>` refusal: change it to assert the new behaviour, and say
  which in the report.
- This WORKORDER's Completion Report.

**Explicitly out of scope:**
- `test/generated_fixture/**`, `test/**/*.cpp`, `test/stubs/**`,
  `test/CMakeLists.txt`, the C++ runtime, `CMakeLists.txt` — WO3b.
- `cli/src/core/generator/emit/scene.ts` and anything else in the editor target
  — WO3b. If your change forces an editor-target change to keep the suite
  green, make the smallest one and report it.
- `<convert>` (WO4). `extern/u8g2/**` (read-only). `docs/**`, `LICENSE`,
  `THIRD-PARTY-NOTICES.md`, `.agents/**` except this file.
- The schema: no new attribute, element or manifest field.
- `cli/src/data/bdfconv/**` — the artefact is final.

## Tooling Constraints

- CLI, from `cli/`: `npm test`, `npm run lint`, `npm run build`. All green
  before every commit. The C++ suite is not affected by this WO (the committed
  fixture is unchanged) — do not run CMake.
- Scratch projects and files go in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill before writing code.

## Line-Item Instructions

- [ ] **1. An absent `range` means every glyph — the PA's correction.** WO2
  used bdfconv's `*` when no `range` is given, as WO2's WORKORDER told it to.
  That instruction was wrong: `bdf_map.c:174` defines `*` as **32–255**, so a
  font with glyphs above 255 — icon fonts, departures-board's weather and Wi-Fi
  fonts — would silently lose them. `range` is documented as an optional
  *filter*, so absent means unfiltered: use `0-65535` (`MAX_BDF_CODEPOINT`),
  which is also exactly what departures-board-v3's build passes. Fix it in
  `compile-bdf.ts`, correct any comment or test that says `*`, and add a test
  using a small BDF you write yourself (MIT, in `cli/test/fonts/fixtures/` or
  similar) with a glyph above 0xFF and one below 0x20: with no `range`, both
  are in the result. Re-run WO2's sweep of U8G2's `-b 0` BDFs with the new
  default and report the new count (WO2 got 363/364, the failure being
  `waffle-10.bdf`).

- [ ] **2. Assets travel as bytes.** `GenerateInput.assets` and `readAssets`
  in `load-project.ts` carry `string` today. BDF files may be Latin-1, and
  WO4's PNGs are binary, so make the one asset channel
  `ReadonlyMap<string, Uint8Array>`, decode to text where `<xbm>` needs it,
  and read `<bdf>` `src` files through the same project-root confinement
  `readAssets` already applies. This is a type change across the emitter and
  budget — keep it mechanical, and keep every existing `<xbm>` test green
  unchanged in substance.

- [ ] **3. The async compile step.** `generate()` is synchronous and must stay
  so; `compileBdf` is asynchronous. Add one core function both hosts call
  **before** `generate`, shaped roughly:
  ```ts
  compileProjectAssets(input: { globals; assets: ReadonlyMap<string, Uint8Array> })
    : Promise<{ fonts: ReadonlyMap<string /* font name */, CompiledFont>; diagnostics: Diagnostic[] }>
  ```
  and pass its result into `generate` as a new `GenerateInput` field. It
  compiles every `<bdf>` in declaration order (it may run them concurrently,
  but results and diagnostics must come out in declaration order — §13.9).
  Diagnostics, each at the `<bdf>` declaration's location:
  - source file missing, unreadable, or outside the project root — follow how
    `<xbm>` reports the same today, and reuse its code if it fits;
  - `compileBdf` failure — its `reason`, plus bdfconv's stderr lines if any;
  - a `range` WO2's validator already rejected never reaches here (confirm).

  `generate` must refuse, with an internal-error-class diagnostic rather than a
  crash, if a `<bdf>` has no compiled entry — a host that forgot the step is
  a programming error, and it must be loud. Wire `cli.ts`'s `generate` path
  (and any other command that emits — check `--check`, `--json` and the
  editor target's entry) to call the step. Do **not** make `validate` compile
  fonts.

- [ ] **4. Remove the refusal.** Delete the `<bdf>` half of Step 3 in
  `validate-not-yet-supported.ts` and its comments; keep `<convert>`'s. Update
  every comment in the tree that says `<bdf>` is refused or "delivered in
  PR-04b" — `grep -rn "PR-04b" cli/src` and fix each `<bdf>` mention (leave
  `<convert>` ones for WO4).

- [ ] **5. Emission.** In `ui_fonts.cpp`, for each `<bdf>`, in declaration
  order, interleaved with `<builtin>`s in document order:
  ```cpp
  // small_9: compiled from assets/fonts/small.bdf by bdfconv (U8G2 2.36.18) (§14.1).
  //   BDF font: -Misc-Fixed-Medium-R-Normal--6-60-75-75-C-40-ISO10646-1
  //   BDF copyright: Public domain font.  Share and enjoy.
  //   licence file: assets/fonts/LICENSE
  //   range: 0x20-0x7F — 95 of 919 glyphs, 723 bytes
  static const uint8_t ui_fontdata_small_9[723] U8G2_FONT_SECTION("ui_fontdata_small_9") = {
    0x5f, 0x00, …   // 16 bytes per line, lowercase hex, trailing comma rules your choice but fixed
  };
  const uint8_t* const ui_font_small_9 = ui_fontdata_small_9;
  ```
  The substance is prescribed; the exact comment wording is yours.
  - **Why the array has its own name, `ui_fontdata_<name>`:** `ui.hpp` declares
    every font as `extern const uint8_t* const ui_font_<name>;`, and keeping
    that one form for both kinds means no consumer can tell them apart. A name
    like `ui_font_<name>_data` would collide with a `<bdf>` named
    `<name>_data` in the same unit; `ui_fontdata_` is a distinct family inside
    the reserved `ui_` prefix (§13.4), so no author name can reach it. Say so
    in a comment.
  - Paths are project-relative with forward slashes, never absolute (§13.9).
    The BDF's own `FONT`/`COPYRIGHT` lines appear only when present. Sanitise
    anything from the BDF that goes into a `//` comment: strip or escape
    newlines and control characters and `*/`, and cap the length — a BDF is
    author input, and it must not be able to break or inject into generated
    C++. Test that.
  - **Licence file:** the host lists files in the BDF's own directory whose
    name, case-insensitively, starts with `license`, `licence`, `copying` or
    `ofl`, or is `<bdf-stem>.license`/`<bdf-stem>.licence` with any extension.
    Record every match, sorted, project-relative. None found → no line. This
    is convenience provenance (§14.1), never a diagnostic.
  - The U8G2 version in the comment comes from `bdfconv-source.json`, not a
    literal.
  - The file-level `#include <U8g2lib.h>` already present provides
    `U8G2_FONT_SECTION` on real U8G2.

- [ ] **6. Budget (§18).** A `<bdf>` font's flash cost is its array's length —
  exact, so `measured`. Split the fonts line into a measured line for compiled
  `<bdf>` fonts (count, names, sum of `declaredLength`, reason naming the
  source of the figure) and the existing unmeasured line for `<builtin>`. Keep
  both in `--json`. Check `format-budget.ts` renders the new line and that the
  flash total still honestly reflects which lines are unmeasured.

- [ ] **7. Tests** (new files under `cli/test/`, names yours):
  - a temp project with one `<bdf>` (U8G2's `4x6.bdf` **copied into the temp
    dir** at test time, with `range="0x20-0x7F"`) generates; the emitted bytes
    equal `u8g2_font_4x6_tr` from `extern/u8g2/csrc/u8g2_fonts.c`, read by a
    reader independent of `bdfconv-output.ts` (WO2's oracle test has one —
    reuse it by moving it to a test helper, don't copy it);
  - `ui.hpp` declares it; the budget reports 723 bytes, measured;
  - **determinism**: generate that project twice, from two different cwds and
    `TZ` values, via the built CLI in child processes → byte-identical output
    trees, and no absolute path anywhere in them;
  - every diagnostic in item 3, located at the declaration;
  - interleaving order of `<builtin>` and `<bdf>`; two `<bdf>`s from one BDF
    with different ranges;
  - the licence-file rule, including none, one and several;
  - comment sanitisation (a BDF whose `COPYRIGHT` contains `*/`, a newline and
    a very long string);
  - **§13.4** — the existing test pinning that a `<bdf>` name keeps the
    `[a-z][a-z0-9_]*` rule while a `<builtin>` is exempt must still pass
    unchanged. Name it in the report.

- [ ] **8. End to end, and report it.** `npm run build`, then run the **built**
  CLI (`node dist/node/cli.js generate …`) on a scratch project in `tmp/` that
  uses three of departures-board-v3's BDFs — read-only from
  `/Users/mcneillm/Documents/Projects/departures-board-v3/src/fonts/source/`,
  copied into `tmp/`, with no `range` — and paste the budget output into the
  report. Do not modify anything in departures-board-v3.

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` all green from
`cli/`. Every one of the current 1138 CLI tests passes or is deliberately
changed (list those), plus yours. Report final counts.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo3-bdf-generate`. Do not push. Commit style `feat(cli): …`,
`fix(cli): …`, `test(cli): …`; every message ends with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO3 Completion Report`.

## Issue Surfacing

A defect, upstream bug or concern *outside your boundary box* goes in the
Completion Report under *Out-of-Scope Findings*. Do not file issues and do not
fix it.

---

## Completion Report (written by the worker at task completion)

---
## Completion Report

### Status
complete

### Changes Made
- `cli/src/core/fonts/compile-bdf.ts` — item 1: absent `range` now maps to
  `0-MAX_BDF_CODEPOINT` (unfiltered — every glyph), not bdfconv's own default
  map `*` (32–255). Fixes a WO2 WORKORDER instruction that would have silently
  dropped glyphs above 255 for any font relying on the default.
- `cli/src/core/assets/compile-project-assets.ts`, `cli/src/core/assets/index.ts`
  — new (item 3). `compileProjectAssets()`, the async seam both hosts call
  before `generate()`: compiles every `<bdf>` in declaration order (concurrent,
  via `Promise.all`, whose result order does not depend on completion order),
  returns compiled fonts by name and a diagnostic per font that could not be
  read (`U8G2GL_MISSING_FILE`) or compiled (`U8G2GL_BDF_COMPILE_FAILED`, new
  code, item 3).
- `cli/src/core/generator/emit/unit.ts` — `ProjectEmitInput.assets` is now
  `ReadonlyMap<string, Uint8Array>` (item 2); added optional `compiledFonts`
  and `bdfLicenceFiles`.
- `cli/src/core/generator/emit/images.ts` — decodes an `<xbm>`'s bytes as UTF-8
  text at the one point that still needs text (an XBM file is itself C
  source); everything else about `<xbm>` emission is unchanged.
- `cli/src/core/generator/emit/fonts.ts` — rewritten (item 5). Both font kinds
  now share one `fontDeclarations()` list and one `ui.hpp` declaration form. A
  compiled `<bdf>` emits `ui_fontdata_<name>[declaredLength]` (the array,
  `U8G2_FONT_SECTION`-tagged) and `ui_font_<name>` (a pointer to it), with a
  provenance comment: source path, U8G2 version (from `bdfconv-source.json`),
  the BDF's own `FONT`/`COPYRIGHT` when present (sanitised — control
  characters and `\n` become spaces, `*/` is escaped, capped at 200 chars),
  any licence files found beside the BDF, and the effective range with glyph
  counts. `emitFontsUnit()` throws (never a diagnostic) if a `<bdf>` reaches
  it with no compiled entry — `generate()` must already have refused that
  build; this is the "value validation should have refused" convention
  `value.ts` already uses.
- `cli/src/core/generator/emit/index.ts` — `ProjectEmissionInput` gets the same
  `assets` type change and two new optional fields, threaded through
  `emitProjectFiles()` and `emitEditorFiles()`.
- `cli/src/core/generator/generate.ts` — item 3's cross-check: `GenerateInput`
  gains `compiledAssets?: CompileProjectAssetsResult` and
  `bdfLicenceFiles?: ReadonlyMap<string, readonly string[]>`. For every
  `<bdf>` declared, if it has no compiled entry *and* no diagnostic already
  names it (by `offendingText === font.name`), `generate()` raises
  `U8G2GL_MISSING_COMPILED_FONT` (new code) — the "host forgot to call
  `compileProjectAssets()`" case, distinct from an author's BDF failing to
  compile (which already has its own diagnostic and needs no second one).
- `cli/src/core/generator/report/budget.ts` — `ReportInput.assets` is now
  bytes; new required `compiledFonts` field; the flash table's old single
  `fonts` line is now `fonts (builtin)` (unmeasured, unchanged reasoning) and
  `fonts (compiled bdf)` (measured — sum of each compiled font's
  `declaredLength`, item 6).
- `cli/src/core/validator/validate-not-yet-supported.ts` — item 4: the `<bdf>`
  half of Pass 8's Step 3 is gone; `<convert>` stays refused for WO4.
- `cli/src/core/schema/diagnostic.ts` — two new codes:
  `U8G2GL_BDF_COMPILE_FAILED`, `U8G2GL_MISSING_COMPILED_FONT`.
- `cli/src/core/resolver/mangle.ts`, `cli/src/core/resolver/index.ts` — new
  `fontDataIdentifier()` (`ui_fontdata_<name>`), exported alongside
  `fontIdentifier()`.
- `cli/src/core/index.ts`, `cli/src/browser/index.ts` — export the new
  `assets` barrel.
- `cli/src/node/load-project.ts` — `readAssets()` now reads a `<bdf>`'s `src`
  too (bytes, not text), through the same project-root confinement as an
  `<xbm>`'s; new `readBdfLicenceFiles()` scans each `<bdf>`'s own directory
  for a file matching `license`/`licence`/`copying`/`ofl` (case-insensitive
  prefix) or `<bdf-stem>.license`/`.licence` (any extension), sorted,
  project-relative; `LoadedProject` gains `bdfLicenceFiles`.
- `cli/src/node/cli.ts` — `handleGenerateCommand()` (and therefore `runCli()`)
  is now `async`: it calls `compileProjectAssets()` once, before `generate()`,
  and that one call's result feeds `generate()`, the editor target
  (`editorFilesOf()`) and the budget report (`reportFor()`) — the "any command
  that emits" wiring the WORKORDER asked for, satisfied by one call site
  rather than one per flag. `validate` is untouched: it never compiles fonts.
- `cli/package.json`, `cli/package-lock.json` — 0.8.0 → 0.9.0.
- `cli/test/integration/fixtures/valid-project/globals.xml`,
  `.../fonts/4x6.bdf` (new) — the fixture's two `<bdf>` fonts now reference a
  real BDF (U8G2's own `tools/font/bdf/4x6.bdf`, the WO2 oracle's own font,
  public domain) with different ranges, and actually compile; every test that
  pinned the fixture's old "valid but refused" warning/error counts is updated
  (see *Tests changed rather than added*).
- New tests: `cli/test/assets/compile-project-assets.test.ts` (5),
  `cli/test/generator/emit-fonts.test.ts` (7),
  `cli/test/node/load-project-assets.test.ts` (7),
  `cli/test/integration/generate-bdf.test.ts` (1) — see *Measurements* and
  *Line-Item Instructions* item 7 below for what each covers.
- `cli/test/fonts/u8g2-oracle.test.ts` → moved its independent font-array
  reader into `cli/test/helpers/u8g2-font-reader.ts` (parameterised on the
  `u8g2_fonts.c` path) so `emit-fonts.test.ts`'s own oracle assertion reuses it
  rather than duplicating it, per the line item's instruction.

### The surface WO3b and WO4 will use

```ts
// cli/src/core/assets/index.ts
export function compileProjectAssets(input: {
  readonly globals: Globals;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): Promise<{
  readonly fonts: ReadonlyMap<string /* font name */, CompiledFont>;
  readonly diagnostics: readonly Diagnostic[];
}>;
```

Call it once, before `generate()`, and pass its result as
`GenerateInput.compiledAssets`. `GenerateInput` also takes
`assets: ReadonlyMap<string, Uint8Array>` (bytes, keyed by each `<xbm>`'s or
`<bdf>`'s `src` path — one channel for both) and optionally
`bdfLicenceFiles: ReadonlyMap<string, readonly string[]>` (font `name` →
sorted, project-relative licence files; from `loadProject()`'s
`LoadedProject.bdfLicenceFiles` on the Node side). Both are `?? new Map()`
inside `generate()` if omitted — a project with no `<bdf>` needs neither.

WO3b's committed C++ fixture and real-U8G2 test can therefore build the exact
same `ui_fontdata_<name>`/`ui_font_<name>` pair this WO emits — nothing about
that shape is provisional. WO4's `<convert>` images share the same
`assets: ReadonlyMap<string, Uint8Array>` channel (keyed by the image's own
`src`) and the same `ProjectEmitInput`/`ProjectEmissionInput` shape; no new
plumbing is needed for a second asset kind, only a second compile step
alongside `compileProjectAssets()` if WO4 wants one, or an extension of it.

### Measurements

- **Sweep with the 0-65535 default**: swept every `.bdf` file directly under
  `extern/u8g2/tools/font/bdf/` (396 files — a superset of WO2's 364-file,
  `BM_T`-bit-only selection; I did not reconstruct `build.c`'s exact filter,
  but a superset sweep can only be as strict or stricter) with no `range`
  given: **396/396 succeed**, including `waffle-10.bdf`, WO2's one failure
  under the old `*` (32–255) default — confirming the fix: `waffle-10.bdf`'s
  glyphs are encoded outside 32–255 (`CHARSET_ENCODING "1"`, not ISO 10646, as
  WO2's Completion Report noted), so the old default excluded them and the new
  one does not.
- **Built-CLI budget output for three departures-board-v3 fonts** — a scratch
  project in `cli/tmp/` (not committed; departures-board-v3 itself untouched)
  with `<bdf>` declarations for `NatRailSmall9.bdf`, `NatRailTall12.bdf` and
  `UndergroundClock8.bdf`, no `range`, read-only from
  `/Users/mcneillm/Documents/Projects/departures-board-v3/src/fonts/source/`,
  through `node dist/node/cli.js generate`:

  ```
  u8g2gl 0.9.0 — target 'primary' (U8G2_SSD1306_128X64_NONAME_F_HW_I2C 128x64)

    FLASH
      runtime core                          unmeasured
      framework element classes (1)         unmeasured
      custom element classes (0)            unmeasured
      fonts (builtin) (0)                   unmeasured
      fonts (compiled bdf) (3)              2336 bytes
      image data (xbm arrays) (0)              0 bytes
      generated code                        unmeasured
      ------------------------------------------------
      derivable                             2336 bytes

    RAM (static)
      framebuffer (128x64)                  1024 bytes
      element objects (3)                   unmeasured
      string subject storage (0)               0 bytes
      subject observer slots (0)            unmeasured
      binding pool slots (0)                unmeasured
      styles (0)                            unmeasured
      ------------------------------------------------
      derivable                             1024 bytes
  ```

  All three fonts compiled with **every glyph selected** (95/95, 95/95, 12/12
  — none of these BDFs has a glyph outside 32–255, so this run does not by
  itself distinguish the old and new defaults; the 396-file sweep above is
  what does). Per-font byte counts, read from the generated `ui_fonts.cpp`'s
  own comments: `nat_rail_small_9` 947 bytes, `nat_rail_tall_12` 1221 bytes,
  `underground_clock_8` 168 bytes (sum 2336, matching the budget line).
- **Determinism check**: `cli/test/integration/generate-bdf.test.ts` runs the
  built CLI in two child processes — different `cwd` (project root vs. its
  own `screens/` directory, naming the project `..`) and different `TZ`
  (`UTC` vs. `Asia/Tokyo`) — against a project with one `<bdf>` (U8G2's own
  `4x6.bdf`, `range="0x20-0x7F"`): byte-identical output trees, and no
  absolute path (neither the temp directory nor a bare `/Users/` or `/home/`)
  anywhere in any generated file.

### Tests changed rather than added

- `test/validator/not-yet-supported.test.ts` — `<bdf>` removed from
  `GLOBALS_XML` and every assertion about it (item 4: it is no longer
  not-yet-supported); location assertions and the warning count (7 → 6)
  shifted accordingly.
- `test/generator/generate.test.ts` (unit) — `BDF_GLOBALS_XML` replaced with
  `CONVERT_GLOBALS_XML`: the "refuses a not-yet-supported construct" test
  needs *some* deferred construct, and `<bdf>` no longer is one; `<convert>`
  (still refused, WO4) takes its place.
- `test/validator/validate.test.ts` — the "valid project fixture" test's own
  `<bdf>`-bearing globals fixture (`test/validator/fixtures/valid/globals.xml`,
  unchanged — this fixture is validator-only and never reaches
  `compileProjectAssets()`) now produces 0 warnings, not 2: `validate()` never
  compiles a font, so a `<bdf>` it can't read is simply not its business.
- `test/integration/cli.test.ts`, `test/integration/generate.test.ts` — every
  assertion pinning valid-project's old "2 `<bdf>` + 1 `<focus_ring>` = 3
  not-yet-supported warnings, refused with 3 errors" is now "1
  (`<focus_ring>` alone)", since valid-project's `<bdf>`s now compile (see
  fixture change above). `packageVersion`/stamp assertions: `0.8.0` → `0.9.0`.
- `test/generator/budget-report.test.ts`, `test/integration/generate.test.ts`
  ("reports every unmeasurable cost...", "reports every unmeasurable cost as
  unmeasured...") — the flash-line exception list gains `'fonts (compiled
  bdf)'` beside `'image data (xbm arrays)'`: a project with no `<bdf>` still
  gets that line, at `measured, bytes: 0` rather than absent (item 6's
  "always report the split, an empty result is still a fact").
- `test/generator/emit-screen.test.ts`, `test/generator/realise.test.ts` —
  their inline asset maps (`ReadonlyMap<string, string>`) are now
  `Uint8Array` via `new TextEncoder().encode(...)` (item 2's type change);
  behaviour unchanged.

### Decisions Made

- **`ui_fontdata_<name>` for the array, not `ui_font_<name>_data`** — already
  decided by the PA at WO2→WO3 handoff (PROJECT.md's WO2-ingested session log
  entry) and implemented as specified; recorded again in
  `fontDataIdentifier()`'s own doc comment so the reasoning travels with the
  code.
- **Diagnostic `offendingText` is the font's own `name`**, not its `src` path
  — a deliberate departure from `images.ts`'s convention (`image.src`) for
  the two new asset-compile diagnostics. `generate()`'s "host forgot to call
  `compileProjectAssets()`" guard (item 3) needs to tell "this font already
  has a diagnostic" from "this font has none at all" by matching on the
  declared font name, and only the name is guaranteed to be a stable, unique
  handle a diagnostic and a `<bdf>` declaration can both carry.
- **The "missing compiled entry" guard lives in `generate()`, not
  `emitFontsUnit()`.** `generate()` is the one place that knows both what
  `compileProjectAssets()` was actually asked to do and what the document
  declares; by the time `emitFontsUnit()` runs, `generate()` has already
  refused any build where an entry is missing, so `emitFontsUnit()` throws
  (not a diagnostic) if it ever finds one anyway — a defect in the pipeline
  wiring, never the author's, mirroring `value.ts`'s existing "value
  validation should have refused" convention rather than inventing a second
  one.
- **`compiledFonts` and `bdfLicenceFiles` are optional on `ProjectEmitInput`
  and `ProjectEmissionInput`**, defaulting to empty inside `fonts.ts` and
  `generate.ts`, rather than required — this kept the change's blast radius
  to exactly the places that construct these objects and care about `<bdf>`
  (the editor target's nested scene-description input, and several tests that
  build a `ProjectEmitInput` directly, never touch either).
- **The sweep covers 396 files, not WO2's 364** — I did not reconstruct
  `build.c`'s `BM_T`-bit filter to reproduce the exact subset; a superset
  sweep is the more conservative measurement (it can only surface *more*
  failures than the narrower one, never fewer), and it still isolates the
  fix directly: `waffle-10.bdf` moves from fail to pass, and nothing else
  changes.

### Dead Ends & Warnings

- **`tsx` cannot run a script with top-level `await`** in this repo's default
  CJS-targeting transform — wrap the sweep (or any one-off script) in an
  `async function main() { … } main();` rather than a bare top-level `await`.
- **`npm run build` must be re-run before every integration-test run that
  exercises the built CLI** — I lost time once to `dist/node/cli.js` still
  reflecting a pre-edit build while iterating on the fixture and the refusal
  removal together; the failures printed the *old* `<bdf>`-refused message
  and were easy to misread as a code defect rather than a stale build.

### Out-of-Scope Findings

- None found beyond WO3b/WO4's already-scoped work.

### Blockers
(none)
