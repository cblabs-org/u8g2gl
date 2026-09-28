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

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Changes Made
- `path` — what changed and why

### The surface WO3b and WO4 will use
<!-- The compile step's exact name, signature and import path; the new GenerateInput field; how the asset map is keyed and typed. -->

### Measurements
- Sweep with the 0-65535 default (was 363/364):
- Built-CLI budget output for three departures-board-v3 fonts:
- Determinism check:

### Tests changed rather than added
- test — why

### Decisions Made
- Decision and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, what to avoid

### Out-of-Scope Findings
- Finding and suggested action

### Blockers
(none)
```
