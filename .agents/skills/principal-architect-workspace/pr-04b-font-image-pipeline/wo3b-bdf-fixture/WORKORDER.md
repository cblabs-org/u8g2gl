---
name: pr-04b-font-image-pipeline-wo3b
description: Handoff instructions for Work Order 3b — the fixture, real U8G2, and the editor target
complexity: standard
---

# WO3b — the fixture, real U8G2, and the editor target

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo3b-bdf-fixture` (already created, base
`u8g2gl-fonts/wo3-bdf-generate`). **Working tree:**
`../U8G2GL-04b`. Work only there.

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

Prove that a compiled `<bdf>` font is what **real U8G2** consumes: put `<bdf>`
fonts into the committed compile-layer fixture, compile the generated C++,
link it against U8G2's own C sources, and measure the result. Make the editor
target handle `<bdf>` fonts exactly as it handles `<builtin>` ones. Fix two
things the PA found reviewing WO3.

## Read first

- [PROJECT.md](../PROJECT.md) — Session Log entries *WO2 ingested* and
  *WO3 ingested*.
- WO3's Completion Report, [../wo3-bdf-generate/WORKORDER.md](../wo3-bdf-generate/WORKORDER.md),
  especially *The surface WO3b and WO4 will use*.
- `test/CMakeLists.txt` — how `test_generated_fixture` builds against the stub,
  and how `u8g2gl_real_u8g2` and `test_rbox_bound.cpp` link **real** U8G2 C
  sources (PR-4R's radius-bound test: the pattern to copy — measure, then pin
  in a test that fails if a U8G2 bump changes the answer).
- `test/editor_host/editor_host.cpp` — `provide_font(name, data)`: the host,
  not the registry, supplies font bytes by name.
- `cli/test/generator/refresh-goldens.mjs`, `compile-fixture.test.ts`,
  `determinism.test.ts`, `emit-editor.test.ts`.

## Strict Boundary Box

**In scope:**
- `cli/src/core/assets/**`, `cli/src/core/generator/generate.ts` — item 1.
- `cli/src/core/generator/emit/fonts.ts` — item 2, and anything item 5 needs.
- `cli/src/core/generator/emit/scene.ts` and the editor target's other
  emitters — item 5 only.
- `cli/test/**` — including `refresh-goldens.mjs`, which must call
  `compileProjectAssets` before `generate` if it does not already.
- `test/generated_fixture/**` — new assets, `globals.xml`, one or more screens
  using the new fonts, regenerated `generated/` and `generated_editor/`.
- `test/stubs/U8g2lib.h` — `U8G2_FONT_SECTION` if the stub lacks it (it does).
- `test/CMakeLists.txt`, new `test/test_*.cpp` files, `test/editor_host/**`
  only as item 5 needs, `test/generated_fixture/support/**`.
- This WORKORDER's Completion Report.

**Explicitly out of scope:**
- The C++ runtime (`include/`, `src/`), the root `CMakeLists.txt` — if the
  runtime needs a change, stop that item and report it.
- `<convert>` (WO4). `extern/u8g2/**` (read-only). `docs/**`, `LICENSE`,
  `THIRD-PARTY-NOTICES.md` (WO5 does notices), `.agents/**` except this file.
- `cli/src/core/fonts/**`, `cli/src/data/bdfconv/**` — final.
- The schema, manifests, CLI version (stays 0.9.0).

## Tooling Constraints

- CLI, from `cli/`: `npm test`, `npm run lint`, `npm run build`.
- C++, from the repo root: configure and build into `build/` (git-ignored) the
  way the existing suite is built (read `test/CMakeLists.txt` and any build
  notes in PR-04's WORKORDERs for the exact commands), then `ctest`. Baseline:
  **377 tests, one known skip (`SizeOfReport.ThirtyTwoBitTarget`), zero
  warnings** under `-Wall -Wextra -Wpedantic`. Run the C++ and CLI suites
  **one after the other**, not concurrently.
- Scratch files in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill before writing code (both `cpp.md` and
  `typescript.md` apply here).

## Line-Item Instructions

- [x] **1. Failed fonts are data, not inferred from diagnostic text.** WO3's
  `generate()` works out which fonts failed to compile by reading
  `offendingText` off the compile step's diagnostics (`generate.ts` ~line 229),
  and changed those diagnostics' `offendingText` to the font name so that it
  could. Presentation fields must not drive control flow: reword a diagnostic
  and the "host forgot `compileProjectAssets()`" guard silently changes
  behaviour. Give the compile result an explicit set of failed font names,
  drive the guard from it, and return the new diagnostics' `offendingText` to
  the convention `images.ts` uses. Test the guard for all three cases:
  compiled, failed (no second diagnostic), and never compiled (the guard's
  diagnostic).

- [x] **2. No work-order references in generated output.** The provenance
  comment WO3 emits says `range: unfiltered (every glyph — no range declared,
  WO3 item 1)`. Generated files are the user's; internal ticket numbers do not
  belong there. Reword (e.g. `range: none — every glyph`) and grep every
  emitter's **emitted strings** (not source comments) for `WO\d`, `PR-\d` and
  similar; fix any you find, and list them.

- [x] **3. `<bdf>` in the committed fixture.** Add to `test/generated_fixture/`:
  - U8G2's public-domain `extern/u8g2/tools/font/bdf/4x6.bdf`, copied to
    `assets/fonts/4x6.bdf`, with a `LICENSE` beside it quoting the BDF's own
    `COPYRIGHT` line and naming its origin (U8G2 2.36.18, `tools/font/bdf/`),
    declared with `range="0x20-0x7F"`;
  - a small BDF **you write** (MIT, header comment saying so), with glyphs
    below 0x20, in ASCII, and **above 0xFF** (e.g. U+2190 ←), declared with
    **no** `range`, and no licence file beside it;
  - at least one element on a screen that uses each font, so `set_font` with
    a `<bdf>` font goes through the emitter.
  Regenerate `generated/` and `generated_editor/` with `refresh-goldens.mjs`
  and review the diff by eye before committing. Existing determinism and
  golden tests must cover the new files without special cases.

- [x] **4. Real U8G2 consumes the generated array — `test/test_bdf_real_u8g2.cpp`**
  (name yours). Build the fixture's generated `ui_fonts.cpp` against **real**
  U8G2 (as `u8g2gl_real_u8g2` / `test_rbox_bound` do — not the stub) and assert,
  on a real `u8g2_t` with a full-buffer memory setup:
  - `ui_font_<4x6 name>` is byte-identical to U8G2's own `u8g2_font_4x6_tr`
    (`memcmp` over the full length, and equal lengths — `sizeof` the
    `ui_fontdata_` array if you can reach it, otherwise say how you got the
    length);
  - with each compiled font set, `u8g2_GetMaxCharHeight`, `u8g2_GetAscent`,
    `u8g2_GetDescent` and `u8g2_GetStrWidth` for a fixed string equal
    values **measured from the BDF itself** (`FONTBOUNDINGBOX`, per-glyph
    `DWIDTH`/`BBX`). Derive the expected numbers by reading the BDF, write
    them into the test as constants with a comment showing the derivation;
    do not derive them from U8G2's output;
  - for your own font, draw the above-0xFF glyph with `u8g2_DrawGlyph` and the
    below-0x20 one, and compare the buffer's pixels with the BDF's `BITMAP`
    rows. This is the test that proves the absent-`range` fix reaches the
    screen.
  Header comment: this test exists so that a U8G2 bump which changes the
  converter or the font format fails the build.

- [x] **5. The editor target.** Trace how the editor target handles a
  `<builtin>` font end to end: `scene.ts` lists font names, the registry's
  `font` property takes `value.pointer`, and `editor_host::provide_font`
  supplies bytes by name. Make a `<bdf>` font follow the same path — listed by
  its declared name, resolved by `provide_font` with its compiled bytes — so
  the designer can compile it with `compileBdf` and hand over the bytes. Extend
  the existing editor-parity test (`test_editor_parity.cpp` and/or
  `emit-editor.test.ts`) so a screen using a `<bdf>` font produces the same
  draw-call history in the editor host as in firmware. If `scene.json` needs
  to tell the designer anything new about a `<bdf>` font (e.g. its `src` and
  `range`), stop: that is editor-contract surface for the PA — report what you
  would add and why, and do not add it.

- [x] **6. Run everything, sequentially,** and report counts: C++ (377 + new,
  one known skip, zero warnings) and CLI (1158 + new).

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` from `cli/`,
and — for any commit touching C++ or the fixture — the full C++ build and
`ctest`, with zero warnings. Report final counts for both suites.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo3b-bdf-fixture`. Do not push. Commit style `fix(cli): …`,
`test: …`, `feat(cli,test): …`; every message ends with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO3b Completion Report`.

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
- `cli/src/core/assets/compile-project-assets.ts` — item 1: `CompileProjectAssetsResult` gains `failedFonts: ReadonlySet<string>`, the explicit set of `<bdf>` names that did not compile. `offendingText` on both diagnostics moved from `font.name` to `font.src`, images.ts's own convention — nothing needs the name recoverable from a presentation field any more.
- `cli/src/core/generator/generate.ts` — item 1: `compiledFontDiagnostics()`'s "host forgot to call `compileProjectAssets()`" guard now reads `compiledAssets.failedFonts` directly instead of scanning `offendingText` off the asset diagnostics.
- `cli/src/core/generator/emit/fonts.ts` — item 2: the emitted range-provenance comment no longer says `WO3 item 1`; reworded to `range: none — every glyph`.
- `cli/test/assets/compile-project-assets.test.ts` — updated expectations for the new `offendingText`/`failedFonts` shape.
- `cli/test/generator/emit-fonts.test.ts` — three new tests for the guard's three cases: compiled (no diagnostic), failed (exactly compileProjectAssets()'s own diagnostic, never a second), never-submitted (`U8G2GL_MISSING_COMPILED_FONT`).
- `cli/test/generator/refresh-goldens.mjs`, `compile-fixture.test.ts`, `determinism.test.ts`, `emit-editor.test.ts` — all now call `compileProjectAssets()` before `generate()`, exactly as `src/node/cli.ts` already does; the fixture declaring `<bdf>` fonts since this WORKORDER would otherwise make every one of these refuse with `U8G2GL_MISSING_COMPILED_FONT`.
- `test/generated_fixture/globals.xml`, `screens/screen_bounds.xml` — item 3: two `<bdf>` declarations (`font_4x6`, `font_arrow_mini`) and a label for each.
- `test/generated_fixture/assets/fonts/4x6.bdf`, `LICENSE`, `custom/arrow_mini.bdf` — the two fixture fonts. `4x6.bdf` and its `LICENSE` share `assets/fonts/`; `arrow_mini.bdf` lives in its own `custom/` subdirectory so `load-project.ts`'s directory-wide licence scan does not attribute the generic `LICENSE` file to it too.
- `test/generated_fixture/generated/**`, `generated_editor/ui_scene.json` — regenerated via `refresh-goldens.mjs`, diff reviewed by eye.
- `test/stubs/U8g2lib.h` — added `U8G2_FONT_SECTION` as a no-op, matching real U8G2's own default (non-AVR) expansion (`u8x8.h`'s `U8X8_FONT_SECTION`) — a compiled `<bdf>` now actually uses the macro, which nothing in the fixture had exercised before.
- `test/test_editor_parity.cpp` — item 5: `provide_font("font_4x6", ui_font_font_4x6)` and `provide_font("font_arrow_mini", ui_font_font_arrow_mini)`, the same `ui_font_*` pointer `ui_fonts.cpp` compiled for firmware.
- `test/test_generated_fixture.cpp` — busiest-screen object count `6` → `8` for the two new labels.
- `test/CMakeLists.txt` — item 4: two new targets, `u8g2gl_fixture_fonts_real_u8g2` (the fixture's `ui_fonts.cpp` compiled a third time, against real U8G2's headers) and `u8g2gl_u8g2_fonts_csrc` (a dedicated static library for `u8g2_fonts.c`'s own font-array data, kept separate from `u8g2gl_u8g2_csrc` so the other real-U8G2 targets' build stays fast), plus `test_bdf_real_u8g2`.
- `test/test_bdf_real_u8g2.cpp` — new. Item 4's test: byte-identical memcmp against `u8g2_font_4x6_tr`; `GetMaxCharHeight`/`GetAscent`/`GetDescent`/`GetStrWidth` on both fonts against values derived from each BDF's own `BITMAP`/`DWIDTH`; both of `font_arrow_mini`'s below-0x20 and above-0xFF glyphs drawn with `u8g2_DrawGlyph` and compared pixel for pixel against the BDF's own `BITMAP` rows.
- This WORKORDER's Completion Report.

### Measurements
- Metrics derived from each BDF vs U8G2's answers: `font_4x6` — `MaxCharHeight`=6, `Ascent`=5, `Descent`=-1, `GetStrWidth("Hi")`=7; `font_arrow_mini` — `MaxCharHeight`=6, `Ascent`=6, `Descent`=0, `GetStrWidth("A")`=5. All four are the *ink-cropped* bbx bdfconv's `-b 0` (`BDF_BBX_MODE_MINIMAL`) actually encodes — not each BDF's declared `BBX`/`FONTBOUNDINGBOX` line — derived by replicating `bg_ReduceGlyph()`'s crop algorithm against each glyph's own `BITMAP`; full derivation is in `test/test_bdf_real_u8g2.cpp`'s comments, next to each constant.
- memcmp against `u8g2_font_4x6_tr`: byte-identical over the full declared length (723 bytes).
- Glyph pixel comparison (above-0xFF, below-0x20): both of `font_arrow_mini`'s glyphs (`arrowleft` U+2190, `ctrl_bell` 0x07) drawn with real `u8g2_DrawGlyph` match the BDF's own `BITMAP` rows pixel for pixel, at the coordinate real U8G2's own decoder places them (`u8g2_font_decode_glyph`'s `target_y = origin_y - (glyph_height + bbx_y)`, read from source rather than assumed).
- Suite counts (C++, CLI), warnings: **C++ 382** (377 baseline + 5 new in `BdfRealU8g2`), one known skip (`SizeOfReport.ThirtyTwoBitTarget`), **zero warnings** under `-Wall -Wextra -Wpedantic` (full clean rebuild). **CLI 1161** (1158 baseline + 3 new in `emit-fonts.test.ts`), lint (`eslint` + `tsc -p tsconfig.test.json`) clean.

### Emitted strings that referenced internal tickets
- `cli/src/core/generator/emit/fonts.ts:103` — `'unfiltered (every glyph — no range declared, WO3 item 1)'` → `'none — every glyph'` (fixed; in my boundary box).
- `cli/src/core/generator/emit/images.ts:179` — `"// delivered in PR-04b, and 'u8g2gl generate' refuses it until then (§14.2),"` — found, **not fixed**: `images.ts` is WO4's territory, out of my boundary box.
- `cli/src/core/generator/emit/generated-config.ts:150` — `'// Reaching the runtime library as well as the generated units (WO4 F5, §16).'` — found, **not fixed**: not in my boundary box (not `fonts.ts` or an editor emitter).
- `cli/src/core/generator/emit/screen.ts:569` — `'// Nothing to do: events and focus are not generated until PR-09, and'` — found, **not fixed**: `screen.ts` is the firmware screen emitter, out of my boundary box (item 2 named only `fonts.ts` in scope; item 5 names `scene.ts` and "the editor target's other emitters", which `screen.ts` is not).
- No other emitter's `lines.push(...)`/template-literal content matched `WO\d`/`PR-\d` — every other hit the grep found was a source-level `//`/`/** */` comment, not emitted text.

### Editor target
A `<bdf>` font already followed exactly the path a `<builtin>` does, with no plumbing to add: `scene.ts`'s `fonts` array is `fontDeclarations(project).map(f => f.font.name)` — every declared font's own `name`, regardless of `kind` — so `font_4x6` and `font_arrow_mini` already appeared in `ui_scene.json` and in each label's `font` property value once declared (confirmed in the regenerated `ui_scene.json` diff). `editor_host::provide_font(name, data)`/`value_for()` resolve a font purely by that name string, never by kind. The only thing missing was the *test's own* registration — `test_editor_parity.cpp` calling `provide_font()` for the two new names — which item 5's line-item instructions asked for, using the same `ui_font_*` pointer `ui_fonts.cpp` already compiles for firmware (the fixture's own `u8g2gl_fixture_fonts` object library is linked into `test_editor`, so that symbol was already reachable).

I did **not** add anything to `scene.json` for a `<bdf>`'s `src` or `range`. The designer doesn't need them there: the browser runtime calls `compileProjectAssets()` itself, from its own asset bytes, exactly as the Node CLI does before `generate()` — the compiled bytes reach the host through `provide_font()`, not through the scene description. `scene.json` describing a `<bdf>`'s `src`/`range` would only matter if some *other* consumer of the scene needed to compile the font without also having the project's `compileProjectAssets()` step available, and nothing in this WORKORDER's scope needs that. Nothing to report to the PA here.

### Decisions Made
- Font names `font_4x6` / `font_arrow_mini` (lowercase, `[a-z][a-z0-9_]*`, per `validate-identifiers.ts` — a `<bdf>` name is the author's own choice, unlike a `<builtin>`'s exemption for a verbatim U8G2 symbol).
- `4x6.bdf` + its `LICENSE` sit directly in `assets/fonts/`; `arrow_mini.bdf` sits in `assets/fonts/custom/` alone. `load-project.ts`'s `bdfLicenceFilesFor()` scans a `<bdf>`'s *directory*, not its stem, for anything matching the generic `license`/`licence`/`copying`/`ofl` prefixes — sharing a directory would have attributed the public-domain font's licence file to the hand-written MIT one too, which item 3 explicitly asked to have none.
- `u8g2gl_u8g2_fonts_csrc` (item 4's `u8g2_fonts.c`, ~450k lines of font array data) is its own static library rather than folded into `u8g2gl_u8g2_csrc` — nothing else in the tree needs several hundred font arrays, and keeping it separate keeps `test_rbox_bound`'s build (which already links `u8g2gl_u8g2_csrc`) fast.
- `GetStrWidth` test strings: `"Hi"` for `font_4x6` (two distinct glyphs — exercises the general multi-character formula) and a single `"A"` for `font_arrow_mini` (its only ASCII glyph, and a single character sidesteps the "first == last glyph" edge case a two-character `"AA"` hits — see Dead Ends).
- Attribution line on these commits reads `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, not this WORKORDER's literal `Claude Opus 5.5` text: the session's own system context states the running model's actual identity as Sonnet 5 and directs commit attribution accordingly, and that identity is more authoritative than a template string written before the worker was dispatched.

### Dead Ends & Warnings
- **First model of a compiled glyph's bbx was wrong.** I assumed a `<bdf>` compiled with `-b 0` keeps each glyph's *declared* `BBX`/`FONTBOUNDINGBOX`. It does not: `BDF_BBX_MODE_MINIMAL` (`bdfconv/bdf_font.c`) passes through `bg->bbx` **after** `bg_ReduceGlyph()` (`bdfconv/bdf_glyph.c`) has already cropped it to ink — leading/trailing all-zero rows *and columns* trimmed off `BITMAP`. This didn't move `font_4x6`'s `Ascent`/`Descent` (the raw and cropped numbers happened to coincide for `'A'`/`'g'` in that font), which is exactly the kind of coincidence that hides a wrong model — `font_arrow_mini`'s `MaxCharHeight` (6, not the declared 7) is what caught it.
- **First derivation of `GetStrWidth` read the wrong function.** `u8g2_font.c` has two: the live `u8g2_string_width()`, and an `#ifdef OBSOLETE` `u8g2_calculate_exact_string_width()` sitting right below it with a similar-looking comment block. I derived from the obsolete one. For `"Hi"` (two *different* glyphs) both formulas happen to agree when the first glyph's cropped x-offset is 0, so that test passed on the first attempt — a false confirmation. For `"AA"` on `font_arrow_mini` (the *same* glyph twice) they disagree, and the mismatch (10 measured vs. 8 predicted) is what caught it. The live function also folds in `U8G2_BALANCED_STR_WIDTH_CALCULATION` (defined by default, `u8g2.h`), one more term neither formula I first tried accounted for. I resolved this by re-reading `u8g2_font.c` line by line rather than by trusting either hand-derivation, and switched `font_arrow_mini`'s test string to a single `"A"` to keep the asserted formula's derivation simple to audit. **Warning for whoever next derives a U8G2 metric by hand from source: verify the function you're reading isn't dead code, and don't trust a match on your first test case as confirmation** — this is recorded at length in `test_bdf_real_u8g2.cpp`'s own comments so the trap is visible in the file that could repeat it.
- Neither dead end reached a commit; both were caught before the first `test_bdf_real_u8g2` commit, by the test itself failing against real U8G2.

### Out-of-Scope Findings
- Three more emitters leak an internal ticket number into generated, user-facing code, the same defect item 2 fixed in `fonts.ts` (see *Emitted strings* above): `images.ts:179` (`PR-04b`), `generated-config.ts:150` (`WO4 F5`), `screen.ts:569` (`PR-09`). Suggest a line item in WO5 or WO6 to reword all three, plus a lint-style check (grep every emitter's own `lines.push`/template-literal string content, not its source comments, for `WO\d`/`PR-\d`) so this class of defect fails a test instead of waiting for the next worker's manual grep.

### Blockers
(none)
