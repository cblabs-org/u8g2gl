---
work_order: WO12
project: pr-04-generator
title: "Budget report, generate --json contract, determinism, CLI 0.7.0"
branch: u8g2gl-generator/wo12-budget-determinism
base: u8g2gl-generator/wo11b-validator-hardening
complexity: standard
status: complete
---

# WO12 — Budget, `--json`, determinism

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo12-budget-determinism`
**Base**: `u8g2gl-generator/wo11b-validator-hardening`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval. **Do not
tag, and do not publish to npm** — rules/03-versioning.md.

## Standards

`u8g2gl-standards` skill. **Honest cost reporting (§1.3):** no figure the tooling
cannot substantiate.

## Design authority

design_spec §1.3, §13.5 (realisation reported), §13.9, §15.3, §18, §18.1; [D-16];
[D-18] amendment. CLI **0.7.0** approved (PROJECT.md decision 5). Where this work
order and the spec disagree, **stop and report**.

---

## Objective

`generate` reports what the project costs and why each element was realised as it
was, as human output and as a specified JSON contract; and determinism is proven
by test rather than asserted.

## Line-Item Instructions

- [x] **§18.1 capacity section:** busiest screen objects `/ 254` with its name (screens and objects are named as the author wrote them, not by their emitted `ui_obj_` identifiers),
      busiest object's bindings with its name, total bindings, styles.
- [x] **RAM lines only where derivable:** subject storage from declared sizes
      (`max_len + 1`), capacity counts. Widget `sizeof`, flash and framebuffer
      figures the generator cannot know (§13.7) are shown as **unmeasured**, not
      estimated.
- [x] **The report states that classed-element demotion is not yet delivered**
      ([D-18] amendment) — on every run, in human output and in JSON.
- [x] **Realisation report:** per element, object or draw calls, and the reason
      codes from WO8 (§13.5, §6.1).
- [x] **`generate --json` contract:** `{ files, diagnostics, errors, warnings,
      budget, capacity, realisation }`, typed and documented. Every other command's
      contract unchanged.
- [x] **Determinism tests:** generate twice → identical bytes; shuffle file
      discovery order → identical bytes; diagnostics ordered file, line, column.
- [x] **Carried from WO11 — the scene file's marker.** `ui_scene.json` cannot carry the GENERATED
      marker, so the writer never deletes a stale one. Give the writer a way to recognise it (for
      example a top-level marker key) without special-casing the file name.
- [x] **Diagnostic codes in the `--json` contract.** WO11b added `U8G2GL_BOUND_POSITION_HAS_CHILDREN`
      and `U8G2GL_STRING_TOO_LONG` and renamed one key. The contract documents the code list as
      public, and says that renaming a code is a breaking change under §15.4.
- [x] **Carried from WO5b — locale-independent diagnostic order.** `validate.ts` and
      `check-project.ts` sort with `localeCompare`, so the order can differ between
      machines. §13.9 orders diagnostics by file, then line, then column; compare by
      code unit, not locale. Keep both paths on one comparator.
- [x] **Carried from WO5b — validate `<output dir>`.** `dir="../src"` is accepted. An
      output directory resolving outside the project root is an error (§13.10:
      generation writes only to the configured output directory, never the app's own
      sources).
- [x] **Carried from WO5b — empty directories.** Deleting stale generated files leaves
      empty directories behind; remove a directory only when the writer emptied it.
- [x] **Carried from WO11 — the scene file's marker.** `ui_scene.json` cannot carry the GENERATED
      marker, so the writer never deletes a stale one. Give the writer a way to recognise it
      (for example a top-level marker key) without special-casing the name.
- [x] **Carried from WO5b — usage errors under `--json`.** `generate` usage errors are
      prose on stderr even with `--json`. Under [D-16] they are JSON with a stable code.
- [x] **Carried from WO10 — the version proof changes.** WO10's goldens and committed fixture
      pin the generator stamp to `0.0.0-golden`, so bumping `package.json` does **not** change
      them. Prove the bump instead by generating a fresh project and asserting its header stamps
      `0.7.0`, and by asserting the goldens still regenerate byte-identically at the pinned stamp.
      Do not unpin the goldens.
- [x] **CLI 0.7.0** in `package.json`; a freshly generated project's header carries it.
      The goldens and committed fixture stay pinned at `0.0.0-golden` and do **not**
      change — the proof is the carried item above, not a regenerated diff.

## Strict Boundary Box

**In scope:** `cli/src/core/generator/report/` (new); `cli/src/node/cli.ts` and
formatters; `cli/package.json` (version); `cli/src/node/write-generated.ts`,
`cli/src/core/generator/check-project.ts` and `cli/src/core/validator/validate.ts`
(the four WO5b carries only); regenerated fixture and golden files;
tests; this WORKORDER.

**Do NOT touch:** emission logic (a determinism defect found here is a **stop and
report**, with the failing test); runtime; spec documents.

---

## Testing Requirement

- [x] The demotion-not-delivered statement is present in human and JSON output.
- [x] Capacity figures match the generated config header exactly.
- [x] Both determinism tests pass and are non-vacuous.

## Verification Requirement

- [x] C++ build zero warnings; `ctest` all pass
- [x] CLI tests, `tsc`, lint clean
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-27/28. **Status `complete`.** Commits `2bd6473`, `33a87ce`, `8ccd541`, plus
this report. Not pushed, not tagged. **CLI bumped 0.6.0 → 0.7.0** (PROJECT.md decision 5,
rules/03-versioning.md); nothing published to npm.

### Authorization

Verified from committed artefacts, not from the dispatch prompt: this WORKORDER's front matter reads
`project: pr-04-generator`, `status: dispatched`; `../PROJECT.md` "Human Approval" quotes the owner,
*"Approved — proceed with the twelve work orders, start WO1"*, recorded at `2026-09-13T19:59:36Z`; and
the status log's 2026-09-27 entry records WO12's dispatch at `700acd2`. All five files in
`.agents/rules/` were read, and the `u8g2gl-standards` skill (TypeScript reference and the
documentation reference) before any code was written.

### Suites — every figure from an uncontended run, each suite alone

| Suite | Base (`700acd2`) | Tip (`8ccd541`) |
|---|---|---|
| `npx vitest run` | 948, 57 files | **1030**, 61 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` | clean | clean |
| `cmake --build build --clean-first` | 0 warnings | **0 warnings** |
| `ctest --test-dir build` | 361, 1 known skip | **361**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

**Warning count: zero**, under `-Wall -Wextra -Wpedantic`, from a `--clean-first` build.

New tests: **+82** (1030 − 948) in 4 new files plus 2 existing ones —
`test/generator/budget-report.test.ts` (33), `test/generator/determinism.test.ts` (10),
`test/validator/output-dir.test.ts` (18), `test/node/read-project-order.test.ts` (3),
`test/node/write-generated.test.ts` (+7), `test/integration/generate.test.ts` (+11, two existing ones
updated for the widened contract). 83 tests were written; the net is 82 because one new integration
test replaced nothing and two existing ones were edited rather than added.

### At the base, priced honestly

Measured in a throwaway worktree at `700acd2` under `tmp/wo12-base` (since removed), with the six test
files copied in and run together:

- **29 behavioural failures.** 11 in `output-dir.test.ts` (the base validator accepts `dir="../src"`);
  11 in `integration/generate.test.ts` (no budget in the JSON or the human output, usage errors as
  prose, the stamp at 0.6.0); 5 in `write-generated.test.ts` (an emptied directory survives, a stale
  generated JSON file is not recognised); 2 in `determinism.test.ts` — `finaliseDiagnostics` puts
  `a.xml` before `B.xml` at the base, and the source scan finds `localeCompare` in all three modules.
- **36 trivial failures.** All 33 in `budget-report.test.ts`, because `core/generator/report/` does not
  exist there and the file cannot even be collected; 3 comparator unit tests in
  `determinism.test.ts`, because `compareDiagnostics` is not exported there.
- **18 pass at the base and are regression guards, not defect proofs.** Said plainly because it
  matters: all 3 `read-project-order.test.ts` tests pass at the base, so **the reversed-`readdirSync`
  claim already held** — `read-project.ts` already sorted its listings, and this work order was asked
  for the *test*, not for a fix. The same is true of `determinism.test.ts`'s 5 generate-twice and
  discovery-order tests, `write-generated.test.ts`'s 3 "leaves it alone" cases (the base removes
  nothing, so it passes them by doing nothing), and 7 of `output-dir.test.ts`'s "accepts" cases.

### The human budget report for the committed fixture, verbatim

Through the built CLI, on a copy of `test/generated_fixture` under `tmp/`, with `NO_COLOR=1`:

```
u8g2gl 0.7.0 — target 'host' (U8G2_SSD1306_128X64_NONAME_F_HW_I2C 128x64)

  FLASH
    runtime core                          unmeasured
    framework element classes (3)         unmeasured
    custom element classes (1)            unmeasured
    fonts (2)                             unmeasured
    image data (xbm arrays) (1)             32 bytes
    generated code                        unmeasured
    ------------------------------------------------
    derivable                               32 bytes

  RAM (static)
    framebuffer                           unmeasured
    element objects (13)                  unmeasured
    string subject storage (2)              50 bytes
    subject observer slots (10)           unmeasured
    binding pool slots (7)                unmeasured
    styles (2)                            unmeasured
    ------------------------------------------------
    derivable                               50 bytes

  NOT MEASURED — and why (§1.3: no figure the tooling cannot substantiate)
    runtime core, framework element classes, custom element classes, generated code:
      flash cost needs a linker map for a reference build (§18); §13.7 forbids the
      generator assuming any runtime class size or layout
    fonts:
      a <builtin> font's array lives in U8G2, not in generated code, so its size is
      U8G2's: flash cost needs a linker map for a reference build (§18); §13.7 forbids
      the generator assuming any runtime class size or layout
    framebuffer:
      the application constructs the U8G2 instance and owns its buffer (§12.1, §13.10);
      it may be a page-mode or differently sized buffer than the <target>'s setup names
    element objects, subject observer slots, binding pool slots, styles:
      sizeof is the runtime's, not the generator's: §13.7 lets the generator know only
      that a class is default-constructible and what its manifest declares

  CAPACITY (generated — see u8g2gl_generated_config.h)
    objects, busiest screen         5 / 254   bounds
    bindings, busiest object              1   track_readout
    bindings, total                       7
    styles                                2   note, loud

  REALISATION (§13.5 — what each element became, and why)
    screen 'bounds': 5 object(s), 2 element(s) as draw calls
      track                   slider                object     class_backed, composite, has_children
      track_knob              u8g2gl_box            draw calls
      track_readout           u8g2gl_label          object     class_backed, binding
      dot                     u8g2gl_box            draw calls
      temp                    u8g2gl_label          object     class_backed, binding
      own_font                u8g2gl_label          object     class_backed  [amendment]
      override                u8g2gl_label          object     class_backed  [amendment]
    screen 'gauges': 3 object(s), 4 element(s) as draw calls
      level_bar               u8g2gl_box            draw calls
      dial                    u8g2gl_circle         draw calls
      panel                   panel                 object     class_backed, binding, composite, has_children
      panel_edge              u8g2gl_hline          draw calls
      panel_note              u8g2gl_label          object     class_backed  [amendment]
      ghost                   u8g2gl_label          object     class_backed  [amendment]
      blip                    u8g2gl_pixel          draw calls
    screen 'home': 5 object(s), 1 element(s) as draw calls
      bar                     status_bar            object     class_backed, composite, has_children
      bar_location            u8g2gl_label          object     class_backed, binding
      bar_wifi_icon           u8g2gl_xbm            object     class_backed, binding
      bar_clock               u8g2gl_clock          object     class_backed, binding
      rule                    u8g2gl_hline          draw calls
      msg                     u8g2gl_label          object     class_backed, binding
    13 object(s) and 7 draw-call element(s) across 3 screen(s).

  NOTE — [D-18]'s 2026-09-13 amendment:
      Classed-element demotion is not yet delivered ([D-18] amendment, 2026-09-13): an
      element backed by a C++ class is always realised as an object, even where §13.5
      says it need not be. This report is therefore not the realisation rule's full
      saving.
      4 object(s) here are marked [amendment] above and are due to it alone: own_font,
      override, panel_note, ghost.
```

**Reading it against the committed header.** `test/generated_fixture/generated/u8g2gl_generated_config.h`
defines `U8G2GL_MAX_OBJECTS_PER_SCREEN 5`, `U8G2GL_MAX_BINDINGS_PER_OBJ 1`,
`U8G2GL_MAX_TOTAL_BINDINGS 7`, `U8G2GL_MAX_STYLES 2` — the four figures in the CAPACITY table, in
order. `element objects (13)` is the total across three screens, which is what the RAM table is about;
the capacity is the busiest single screen, which is what sizes the pool.

### The `--json` contract

Seven keys, in this order, on stdout:

```
{
  "files":       [{ "path", "action" }],   // output-relative; [] when refused
  "diagnostics": [Diagnostic],             // file, line, column, code order (§13.9)
  "errors":      N,
  "warnings":    N,
  "budget":      BudgetReport,             // §18
  "capacity":    CapacityReport,           // §18.1, [D-21]
  "realisation": RealisationReport         // §13.5, incl. the [D-18] amendment
}
```

As actually emitted for the committed fixture:

```
budget:      { generator: string, target: string, setup: string,
               display: { width: number, height: number },
               flash: [{ item: string, count?: number, names?: [string], figure: Figure }],
               ram:   [{ item: string, count?: number, names?: [string], figure: Figure }],
               ramBudget?: number, overBudget?: boolean, ramDerivedBytes: number }

Figure =     { kind: "measured",   bytes: number, derivation: string }
           | { kind: "unmeasured", reason: string }

capacity:    { header: string,
               entries: [{ macro: string, label: string, value: number,
                           ceiling?: number, names: [string] }] }

realisation: { demotion: { classedElementDemotionDelivered: false,
                           objectsNotRequiredByRule: number, names: [string],
                           statement: string },
               screens: [{ screen: string, objects: number, drawCallElements: number,
                           elements: [{ name, tag, file, line, column,
                                        realisation: "object" | "draw_calls",
                                        reasons: [string], requiredByRule: boolean,
                                        bindings: number }] }],
               totalObjects: number, totalDrawCallElements: number }
```

- **`Figure` is a tagged union, deliberately.** There is no numeric field to read when a cost is
  unknown — no zero, no null, no −1 — because every one of those is read as a cost by something,
  eventually. A consumer must branch on `kind`. Pinned by a test that asserts an unmeasured figure's
  keys are exactly `['kind', 'reason']`.
- **`budget`, `capacity` and `realisation` are absent when the build was refused**, exactly as `files`
  is then empty: a report about code that was not written describes nothing. Pinned both ways.
- **Present under `--check`**, where nothing was written but the figures describe the output the check
  just verified — otherwise `--check` would be the one journey with no cost statement.
- **Diagnostic codes are documented as public and stable** in the handler's TSDoc and in `--help`:
  a consumer branches on `diagnostics[].code`, renaming one is a breaking change under §15.4 with a
  migration, and the prose `message` beside it may be reworded freely. WO11b's additions
  (`U8G2GL_BOUND_POSITION_HAS_CHILDREN`, `U8G2GL_STRING_TOO_LONG`) and its key-only
  `UNRESOLVED_GEOMETRY` rename are named as the example of the rule in force. WO12 adds one document
  code, `U8G2GL_OUTPUT_DIR_OUTSIDE_PROJECT`, and one CLI code, `U8G2GL_USAGE`.
- **Every other command's contract is unchanged**, checked through the built CLI: `validate --json`
  still gives `diagnostics, errors, warnings, target`; `catalogue --json` and `find --json` still give
  their record arrays.

### How each determinism test is made non-vacuous

1. **Generate twice → identical bytes.** Compares the committed fixture's files *in emission order*,
   path by path and content by content, not as a set: emission order is draw order and file order, so
   a reordered list is a real diff. It also asserts more than five files were produced, so an empty
   result cannot pass, and that no file carries a date or an absolute path.
2. **Shuffled file discovery → identical bytes.** `test/node/read-project-order.test.ts` mocks
   `node:fs` so that every `readdirSync` listing comes back **reversed**, and the mock *records* what
   it reversed. The first test asserts the recorded screens listing is exactly
   `['screen_gamma.xml', 'screen_beta.xml', 'screen_alpha.xml']` — descending, which is the reversal
   having genuinely happened rather than the directory coincidentally reading that way. Without that
   assertion the whole file would pass just as well with the mock doing nothing. Three screens, not
   two, because a reversal of two is indistinguishable from several other orders; and two widget
   manifests, so both of the loader's listings are exercised.
   `determinism.test.ts` argues the same claim in two parts, because either alone proves less than it
   appears to: **part 1**, the loader hands emission one canonical order; **part 2**, that order is
   *load-bearing* — generating with the screens reversed produces different bytes and a different
   `ui.hpp` — so canonicalising it is real work rather than a no-op. A part-1-only test would pass
   even if emission ignored order entirely.
3. **Diagnostics ordered by file, line, column, code.** The pair is `a.xml` / `B.xml`, chosen because
   the two orders genuinely disagree: `'a.xml'.localeCompare('B.xml')` is **negative** on any ICU
   build (collation case-folds), while by code unit `'B'` (0x42) precedes `'a'` (0x61). So the test
   fails under `localeCompare` and passes by code unit *on the same machine* — no locale has to be
   changed to see it. A guard test asserts that the pair still tells the two orders apart, so a future
   Node cannot make the test vacuous without failing. A further test reads the source of all three
   modules (comments stripped, because two of them now *explain* why `localeCompare` is not used) and
   fails if a fourth copy of the comparator returns — a behavioural test cannot catch that, since
   either comparator passes for every input whose two orders happen to agree.

### The version proof

The goldens and the committed fixture stay pinned at `0.0.0-golden` and are **not** unpinned.

- `cli/package.json` is `0.7.0`. The integration test asserts `packageVersion === '0.7.0'` **as a
  literal**, then generates a fresh project and asserts its header contains `// generator: 0.7.0`, and
  that `u8g2gl --version` prints `0.7.0`. The literal pin is the point: the pre-existing test compared
  the stamp against the same `package.json` it came from, so it passed at every version and therefore
  proved no bump had ever happened.
- The same test asserts the fresh header does **not** contain `0.0.0-golden`.
- Running `refresh-goldens.mjs` after the bump reported **`unchanged` for all 8 WO9 goldens and all 10
  compile-fixture files**, and `updated` for exactly one file — `ui_scene.json`, by exactly one line,
  the new marker key. `git diff --stat` confirms `1 insertion` in the fixture. The goldens' own test
  (`emit-golden.test.ts`) still regenerates them byte-identically at the pinned stamp.

### Decisions I made

1. **The report is built in `cli.ts`, not inside `generate()`.** `generate.ts` is outside the Boundary
   Box, and `cli.ts` already has everything needed. §13.11 makes "report" the last pipeline step and
   the designer will want it, so this is recorded as finding 4 rather than presented as the end state.
2. **"Unmeasured" is a value, not a blank.** The shape makes it impossible to print a missing figure
   as a small one, which is the only way §1.3's obligation is actually enforced rather than restated.
3. **No percentage of `--ram-budget`.** §18's example prints "48% of this target's declared RAM
   budget"; with the total mostly unmeasured that percentage cannot be computed honestly, and a wrong
   one is worse than none. The declared budget is reported, and `overBudget` is set only when the
   *derived* figures alone already exceed it — a comparison that cannot be a false positive, and that
   says so.
4. **Exactly one exact flash figure: the `<xbm>` arrays.** The generator emits those bytes itself, and
   §18's stated purpose includes catching an asset far larger than the project needs. Everything else
   in FLASH is unmeasured. See finding 6 if the PA would rather the table carry no number at all.
5. **`U8G2GL_MAX_TOTAL_BINDINGS`'s floor is the header's, not the report's.** The header defines 1 for
   a project that binds nothing, because a zero-length array is ill-formed in standard C++; the budget
   reports the true 0. This is the right way round — the report must not inherit a C++ constraint as
   if it were a cost — and it is the one place the two deliberately differ, so it is pinned by test in
   both directions and the emitted header already explains itself in prose.
6. **The per-element realisation table is in the human report as well as in JSON.** §13.5 says
   realisation is "observable in the budget (§18) and reported by `--json`"; the line item asks for
   per-element reasons without restricting them to one surface, and a report meant to be read should
   contain what it claims to report.
7. **`SCENE_FORMAT_VERSION` is not bumped for the marker key.** WO11 bumped it for `origin`, which a
   host reads. No host reads the marker — `editor_host.cpp` checks only `format` and `version` and
   ignores unknown keys, which the C++ parity suite confirms — so bumping would invalidate hosts for a
   key that is the writer's business alone.
8. **`U8G2GL_USAGE` is a CLI code, declared in `cli.ts`.** Nothing in the project is at fault, so the
   diagnostic names no file, and it does not belong in the document's `DIAGNOSTIC_CODES` table. It is
   public and stable like any other code, and `--help` says so.
9. **Lines sharing an "unmeasured" reason are grouped against it.** §13.7's rule about runtime class
   sizes is one fact; printing it five times in five slightly different wordings would read as five
   separate shortcomings rather than one boundary.

### Disclosed edits outside the literal Boundary Box — six files, all small, all necessary

The box named `report/` (new), `cli.ts` and formatters, `package.json`, and `write-generated.ts` /
`check-project.ts` / `validate.ts` for the WO5b carries. Two carries could not be delivered inside it:

| File | Change | Why it could not go in the box |
|---|---|---|
| `core/generator/header.ts` | `GENERATED_JSON_MARKER_KEY` / `_VALUE`, and `isGeneratedContent()` accepts either form | The WO11 carry asks for "a way to recognise it … for example a top-level marker key". The marker's definition lives here, beside the C++ one, precisely so the writer and the emitter cannot disagree about what "generated" looks like |
| `core/generator/emit/scene.ts` | one key emitted, first, plus its comment | Same carry: a key nothing emits cannot be recognised. This is the only emission change in the work order, it is additive, and it moved exactly one line of one committed fixture |
| `core/schema/diagnostic.ts` | one new code, `OUTPUT_DIR_OUTSIDE_PROJECT` | The `<output dir>` carry needs a code a consumer can branch on (§15.3). Additive, so §15.4-safe; WO11b set the precedent |
| `core/validator/validate-schema.ts` | the `<output dir>` check (section 1c) | The literal box named `validate.ts`, the pass *runner*. Putting an `<output>` rule there would have created a **second place** where `<output>` is checked, three lines from the existing `<output prefix>` check — which is lesson 6's defect exactly. Placed beside its sibling instead, and disclosed rather than done quietly |
| `core/generator/index.ts` | one `export * from './report/index.js'` | "Typed and documented" is not met by a contract whose types a consumer cannot import |
| `core/validator/index.ts` | `compareDiagnostics` added to the existing export line | The node formatter needs it; a second copy is the thing the carry removes |

**Not touched:** runtime C++, `docs/`, `PROGRAM*.md`, `.agents/rules/`, `extern/`, the manifests, the
resolver, realisation, and firmware emission's output. `git diff --name-only 700acd2..HEAD` is 23 files
and contains nothing under `docs/`, `PROGRAM*.md`, `.agents/` (other than this WORKORDER), `extern/`,
or the runtime's `src/` and `include/`. The only file outside `cli/` is the one fixture line.
Scratch files are under `tmp/wo12/`, which is git-ignored; the base worktree was removed.

### Out-of-scope findings — not fixed, not filed

1. **Stop-and-report: this work order and §18 disagree about the framebuffer, and the spec may be
   right.** The WORKORDER and the dispatch both list the framebuffer among the figures "the generator
   cannot know". But §18's own example prints `framebuffer (256x64) 2.0 KB <- derived from
   u8g2_m_32_8_f`, and `DisplayRecord.framebufferBytes` already carries exactly that number —
   `tiles.width * tiles.height * 8`, derived from U8G2's allocator tables ([D-14]) and already used by
   `find --max-framebuffer`. **I followed the work order** and report it unmeasured, with the honest
   reason: the application constructs the `U8G2` instance (§12.1, §13.10) and may choose page mode, or
   a different constructor from the one the `<target>` names, so the buffer genuinely is not the
   generator's. The PA may prefer an *attributed* line — "the catalogue's full-buffer figure for this
   setup: 1024 bytes" — which would be a derived, sourced fact rather than an estimate, and would
   restore §18's most useful RAM line. One line in `report/budget.ts`. **Not changed.**
2. **`read-project.ts` sorts discovered filenames with `localeCompare` — twice.** This is
   file-discovery order reaching *emission* order, so a host collation that ordered two project
   filenames differently would change the committed bytes: the §13.9 defect, in the one place the
   comparator line item did not name (it named `validate.ts` and `check-project.ts`). Unlikely to bite
   today, because project filenames are lowercase ASCII with underscores. The fix is the same
   three-line change already made in the three diagnostic paths. Outside the box; my
   `read-project-order.test.ts` pins the *canonical order*, which both comparators give for these
   names, so it does **not** cover this.
3. **Three more `localeCompare` sorts, one of them on a committed artefact.**
   `node/catalogue-builder.ts` sorts the display records and page-mode constructors it writes into
   `src/data/catalogue.json`, which is committed — so that file's order is host-dependent, which is
   §13.9's hazard applied to a generated artefact the tool ships. `catalogue/edit-distance.ts`'s
   tie-break orders the `suggestions` array that appears in the `--json` contract, and
   `catalogue/query.ts` orders `find` results. None affects generated C++; all are visible to a
   consumer comparing two machines.
4. **`generate()` does not return the report.** §13.11's pipeline ends "emit → report", and the
   designer is isomorphic with no CLI, so it will want `GenerateReport` from `generate()` rather than
   re-deriving it. Building it in `cli.ts` was a Boundary Box decision, not a design one; moving the
   call into `generate.ts` and adding a `report?` field to `GenerateResult` is a small, additive change.
5. **`busiestObject` is the §13.4 identifier minus its prefix, not literally the author's name.** For
   a composite child, realisation's `identifier` is the instance-joined path — `bar_location` for
   `location` inside instance `bar`. Both the report and the generated header say `bar_location`. It is
   never the emitted `ui_obj_` form, which is what the line item required, and it is the string an
   author can search their XML for; but it is not the `name=` they typed. WO10b finding 4 already noted
   the generated config's comment describes this as "the author's name".
6. **The `<xbm>` byte count is the only figure in the FLASH table.** Included on the reasoning in
   decision 4. If the PA would rather FLASH carry no number at all — so that a reader cannot mistake a
   partial figure for a total — deleting that one line and its test is the whole change.
7. **`--check` does not report a directory that would be removed.** The writer now removes a directory
   it emptied, but `planGeneratedWrite` lists files only, so `--check` can say "up to date" while a
   stale empty directory is still on disk. A `FileChange` is about a file and §16's check asks whether
   any *file* would change, so extending it would change the `files` array's contract.
8. **The JSON marker is matched textually, not by parsing.** A generated scene file reformatted by
   another tool (different indentation) would not be recognised and would therefore be **kept**. That
   is the safe direction to be wrong in — the writer runs this predicate over every file in the output
   directory, including hand-written ones, and parsing arbitrary text to decide whether to delete it is
   a far wider door than matching one exact string (§13.10). Recorded because it is a real limit.
9. **The budget now makes WO11b finding 6's cost visible.** A string subject with no `max_len` is
   reported as unmeasured RAM, because its capacity is `U8G2GL_MAX_STRING_LEN`, a macro the
   application's build may override. The report names the subjects and tells the author that declaring
   `max_len` would show the figure — which is a reason to consider requiring it, and a decision for the
   owner rather than a defect.
10. **The report is the first thing in the CLI that prints `§` and em dashes to a terminal by default.**
    It is UTF-8 throughout and matches the diagnostics formatter's existing practice, so nothing here
    is new — but a Windows console in a legacy code page would mangle it, and nobody has tested one.

