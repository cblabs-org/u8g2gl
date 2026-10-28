---
name: pr-05r2-wo2
description: Handoff instructions for Work Order 2 — clock seconds aligned by baseline (D-B)
complexity: standard
---

# PR-5R2 / WO2 — clock seconds aligned by baseline (D-B)

## Role Definition

You are an expert senior embedded C++ engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan.
Your task is strictly limited to executing the checklist below.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md`. Its
Status Log records the owner's approval of this decomposition. Verify that before you start
(`.agents/rules/00-operating-model.md`).

## Objective

In `hh_mm_ss` format with a secondary font, the seconds digits must sit on the **same baseline** as
the HH:MM digits. Today they sit 2 px low with `helvB12` / `helvR08`. The owner saw this on the
panel.

## Strict Boundary Box

- **Work in** `../U8G2GL-05r2`, on branch
  `u8g2gl-05r2/wo2-clock-baseline` (already checked out; it contains WO1). Do not create branches.
- **Edit only:** `src/u8g2gl_clock.cpp`, `test/test_clock.cpp`, a **new** real-U8G2 pixel test (a new
  file under `test/`, plus its `test/CMakeLists.txt` entry), and `docs/design_spec.md` only where it
  describes the clock's dual-font alignment (quote the old and new text). Plus your Completion
  Report.
- **Do not touch** the clock's `tick()`, blink or time handling. WO3 rewrites those, so keep your
  change inside the vertical-placement step of `render()`.
- **Do not touch** the label, core, CLI, versions or changelog.
- Public API signatures are unchanged.

## Tooling Constraints

- Fresh build directory: `cmake -S . -B tmp/build-wo2 && cmake --build tmp/build-wo2 -j && ctest --test-dir tmp/build-wo2`.
  **0 warnings.** The `extern/u8g2` submodule is already initialised in this worktree.
- **Load the `u8g2gl-standards` skill before writing code.**
- No PlatformIO and no device.

## Context

- **The defect** (`src/u8g2gl_clock.cpp`, around lines 220–235, "Step 5: Compute vertical
  centering and baseline alignment"):
  `sec_draw_y = draw_y + font_height − sec_font_height`, where each height is `getAscent() −
  getDescent()`. That lines up the **bottoms of the two fonts' descender boxes**. Digits sit on the
  **baseline**, and the descenders differ (helvB12 4 px, helvR08 2 px), so the seconds land 2 px low.
  This is the same in "all" and default text reference-height modes, so it predates PR-05R.
- **Text position:** the state saver establishes `setFontPosTop()` and `setFontRefHeightAll()`
  around every render (§11.3). A glyph's baseline therefore sits at `y + ascent` (U8G2's top
  reference adds 1 to both ascents, which cancels out).
- **The fix direction:** align ascents, `sec_draw_y = draw_y + (main_ascent − sec_ascent)`, with
  each ascent read with its own font set. Keep the main digits' vertical centring exactly as it is.
- **The PA's host probe,** which reproduces the clock's placement on real U8G2 and prints the
  lowest lit rows (HH:MM rows 21..32, SS rows 27..34 today):
  `git show origin/u8g2gl-device/measurements:.agents/skills/principal-architect-workspace/device-measurements/rig/clockprobe/probe.c`.
  Use it as a reference; the committed test must drive the real `u8g2gl_clock`, not a copy of its
  arithmetic.
- **Real-U8G2 tests already exist:** see the `u8g2gl_real_u8g2` / `u8g2gl_u8g2_csrc_arduino` /
  `u8g2gl_u8g2_fonts_csrc` targets in `test/CMakeLists.txt` (around lines 470–620) and the tests
  that link them. Follow that pattern. Use the `ARDUINO`-built U8G2 target; PR-4R2 found that
  mixing the two builds gives two struct layouts.

## Line-Item Instructions

- [ ] **Baseline:** a fresh build and ctest. Record the totals (expect 426 tests with 1 skip, from
  WO1).
- [ ] **The fix,** in the vertical-placement step of `u8g2gl_clock::render()`: seconds baseline equal
  to the main baseline. Restore the main font afterwards exactly as the code does now.
  Why-comment: digits sit on the baseline; descender depths differ between fonts.
- [ ] **A new real-U8G2 pixel test.** It renders a real `u8g2gl_clock` into a real U8G2 full buffer
  (the SSD1322 256×64 setup, as the device uses) inside the runtime's render path, so the state saver
  is in force. It finds the **lowest lit row** of the HH:MM digit pixels and of the SS digit pixels
  (separate them by column), and asserts they are **equal**:
  - helvB12 with helvR08, the device pair;
  - at least one more pair with a different descender difference (for example `u8g2_font_profont22_tr`
    with `u8g2_font_6x10_tr`, or whatever is in the test font library). Choose time values whose
    digits have no descenders;
  - a control: the same test against the **old** formula must fail. Show that once, by temporarily
    reverting, and record the old rows in your report. Do not commit a failing test.
- [ ] **`hh_mm` format and the no-secondary-font case** are unchanged: assert their pixels are
  identical before and after, or assert the existing tests still cover them and say which.
- [ ] **Existing clock tests:** if any asserts the old `sec_draw_y`, update it with the arithmetic in
  the test's comment, and quote the before and after in your report.
- [ ] **Spec:** correct any text that describes "bottom-align descenders", and quote it.

## Verification Requirement

- ctest is green in a **fresh** build directory, with 0 warnings. State the before and after totals.
- `git status --short` is clean apart from intended files.
- **Verify the branch** (`git branch --show-current` = `u8g2gl-05r2/wo2-clock-baseline`), then commit
  with a conventional message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  **Do not push.**
- Message the PA with your results.

## Issue Surfacing

Defects or concerns outside your boundary box go in your Completion Report with a reproduction. Do
not fix them and do not file issues.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete

### Changes Made
- `src/u8g2gl_clock.cpp` - Step 5 only: `sec_draw_y = draw_y + (main_ascent - sec_ascent)`, each ascent read with its own font set; main font restored as before. Why-comment added (digits sit on the baseline; descender depths differ). Old: `draw_y + font_height - sec_font_height` (bottom-aligned descender boxes).
- `test/test_clock_baseline.cpp` (new) - real-U8G2 pixel test, SSD1322 256x64 full buffer, real `u8g2gl_clock` through `u8g2gl_render_object()` (state saver in force). Three tests: seconds baseline equals HH:MM baseline for three font pairs; no-secondary-font path; HH:MM columns of an HH:MM:SS clock identical to an HH:MM-only clock.
- `test/CMakeLists.txt` - `u8g2gl_u8g2_ssd1322_arduino` (u8x8_d_ssd1322.c built with ARDUINO, matching the `_arduino` C sources) and `test_clock_baseline`.
- Tests 426 (1 skip) -> 429 (1 skip); 0 warnings before and after, fresh build dir `tmp/build-wo2`.

Lowest lit row, HH:MM / SS (old formula -> new):
- helvB12/helvR08 (clock y=18 h=20, the panel case): 32/34 -> 32/32
- profont22/6x10 (y=10 h=44): 39/41 -> 39/39
- helvB18/helvR10 (y=10 h=44): 39/41 -> 39/39
Control: with the old formula restored the test fails on all three pairs (rows above), then the fix was re-applied. Not committed failing.

### Decisions Made
- The seconds colon is excluded from the SS measurement: 6x10 hangs its colon dot 1 px below the digit baseline, which made an early version read a false mismatch. The SS columns are the last N columns, N = ink width of "56" in the secondary font (measured in a scratch render).
- The taller pairs use a taller bounds box (y=10, h=44); at y=18 h=20 the old placement's lower rows were clipped to row 37, which hid the defect (3rd pair read 37/37 both ways). The device pair keeps the owner's exact bounds.
- hh_mm and no-secondary-font unchanged: verified by an out-of-tree frame hash (FNV over the 2048-byte buffer) with old and new sources, identical for both; only HH:MM:SS with a secondary font changed. The committed tests pin this within one build.

### Dead Ends & Warnings
- `real_display` instances share one static frame buffer (`u8g2_m_32_8_f`), so a scratch render must finish before the real one starts.
- `git stash`/`pop` preserved an mtime that made make skip a rebuild once; `touch` the source when A/B-ing.

### Out-of-Scope Findings
- None new. No existing test asserted the old `sec_draw_y` (stub tests never check y), so none was changed.
- Spec: no text describes "bottom-align descenders"; the only mentions (design_spec.md lines ~226, ~2008) say "dual-font baseline alignment", which is now true. No spec edit.

### Blockers
(none)
