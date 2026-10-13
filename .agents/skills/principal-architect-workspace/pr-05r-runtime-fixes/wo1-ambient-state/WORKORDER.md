---
work_order: WO1
project: pr-05r-runtime-fixes
title: "The framework establishes ambient U8G2 state, and restores the caller's"
branch: u8g2gl-05r/wo1-ambient-state
base: main @ 9808423
complexity: architect
status: complete
---

# WO1 — ambient U8G2 state: established, saved, restored, everywhere a widget draws

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Rulings" R1 and R2 state
this WO's design. This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-05r`.** **Branch**:
`u8g2gl-05r/wo1-ambient-state` (already checked out, no upstream) · **Base**: `main` @ `9808423`.
The U8G2 submodule is already checked out. Run `git branch --show-current` **as its own command
immediately before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch files go in
`tmp/` in this worktree (`.agents/rules/02-workspace.md`), never in `/tmp`.

Another worker is running WO2 (CLI) in `../U8G2GL-05r-wo2` at the same time. Do not touch that
directory or the CLI.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/documentation.md`. **§4.1**: on
lines you add or change, cite published references (`§11.3`, `[D-5]`) and measured facts; no
work-order tags (no "PR-05R", "WO1"), no workspace paths, no narrated debate. Pre-existing
citations are not yours to sweep. **Correcting comments that this WO makes wrong is in scope** —
a comment that says state "cannot be read back" when it can is a defect here.

---

## Objective

Every widget draws with the framework's text baseline (`setFontPosTop()`, direction 0) whatever
the caller left, and the caller gets back exactly the U8G2 state it had — including a null font
and the font mode — whether the widget drew in the normal frame or in a blocked-loop repaint.

## Background (PA scoping at `9808423`)

- Nothing in `src/` calls `setFontPosTop()`; `u8g2gl_label.cpp:334` and `u8g2gl_clock.cpp:221`
  assume it. Measured downstream: a plain `begin()` + `ui_handler()` lights 15 pixels instead of
  1392 on the `connected` frame.
- `u8g2gl_state_saver` (`include/u8g2gl/u8g2gl_state_saver.h`) restores `getU8g2()->font`
  through `setFont()`. `u8g2_SetFont()` (`extern/u8g2/csrc/u8g2_font.c:1279`) reads the font
  header whenever the pointer changes, so restoring `nullptr` dereferences null. **The host stub
  (`test/stubs/U8g2lib.h`) models only `u8g2_t::font`, so stub tests cannot see this.** The
  real-U8G2 lane can: `u8g2gl_real_u8g2` and `test_rbox_bound` / `test_bdf_real_u8g2` in
  `test/CMakeLists.txt`, with Arduino shims in `test/real_u8g2/`.
- Every ambient setter is readable from the state struct (`extern/u8g2/csrc/u8g2.h`):
  `draw_color`, `font`, `font_decode.is_transparent` (font mode), `bitmap_transparency` (bitmap
  mode), `font_calc_vref` (font position, a function pointer), and `font_decode.dir` (direction,
  **only under `#ifdef U8G2_WITH_FONT_ROTATION`** — guard it).
- Three blocked-loop repaints call `render(display)` outside `u8g2gl_render_object()`:
  `u8g2gl_label.cpp:494` (marquee; it carries its own-bounds clip workaround),
  `u8g2gl_clock.cpp:291` (colon blink) and `u8g2gl_progress_bar.cpp:285`. Each clears its box with
  `setDrawColor(0)` and leaves state behind.

## The design (owner ruling R1, PROJECT.md)

`u8g2gl_state_saver` becomes **save → establish → restore**, still constructed inside
`u8g2gl_render_object()` (`src/u8g2gl_core.cpp:139`):

1. **Construct:** capture draw colour, font, font mode, bitmap mode, font position, and font
   direction (guarded). Then **establish** the framework baseline: `setFontPosTop()` and, guarded,
   `setFontDirection(0)`. Do not establish font, colour or modes — widgets set those from their
   style, and that stays their job.
2. **Destruct:** restore every captured item. **A null font is written back to
   `getU8g2()->font` directly**, never via `setFont()`. Font position is restored by writing the
   captured `font_calc_vref` back (there is no C++ setter for an arbitrary function pointer).
3. Keep the class name and its non-copyable/non-movable shape. Rewrite the file header and class
   doc: what it captures, what it establishes and why, what it still cannot save (the clip window —
   that reasoning stands and stays), and the rule **"U8G2GL's state inside each object's render;
   the caller's at every other moment."**

**Repaint paths (ruling R2):** the three blocked-loop repaints must run inside the same guard.
Put **one** shared helper beside `u8g2gl_render_object()` in `u8g2gl_core` that does: saver →
own-bounds clip (the label's existing approach, via `u8g2gl_apply_clip`) → the caller's clear +
`render()` → clip reset. All three widgets use it; the label's local workaround goes. Name it per
`u8g2gl-standards` §2. Partial refresh (`u8g2gl_partial_refresh`) stays where it is, after the
helper returns. If a widget's clear/render ordering makes one helper awkward, a callback or a
small RAII scope is acceptable — one implementation, not three.

**Cost (owner condition on R1):** the owner asked that full state setting be cheaper than applying
deltas, with no allocation. The PA's source reading says every setter is a single field
assignment, and `u8g2_SetFont` already returns early when unchanged. **Confirm by measurement**:
report `sizeof(u8g2gl_state_saver)` before and after, and a host micro-benchmark (real-U8G2 lane,
≥ 1e6 iterations, ns per construct+destruct pair, before and after). Do not commit the benchmark as
a test; keep it in `tmp/` and paste the figures.

## Line-Item Instructions

- [ ] **Baseline first**, from a clean configure, each suite alone: configure + build (expect **0**
      warnings under the project's flags), ctest (expect **401**, one skip
      `SizeOfReport.ThirtyTwoBitTarget`). Record it.
- [ ] **Reproduce before fixing, real-U8G2 lane.** Write these tests first and show them fail (or
      crash) against unmodified `src/`; paste the failure:
  - [ ] **Null font:** a fresh display with no font set renders a label through
        `u8g2gl_render_object()`; afterwards `getU8g2()->font` is `nullptr` again and a second
        render works. Before the fix this crashes — record the crash output (run the binary under
        `--gtest_filter` so one crash does not hide the others).
  - [ ] **Font position:** a label rendered after `setFontPosBaseline()` lights exactly the same
        pixels as one rendered after `setFontPosTop()`. Compare buffers, not just counts; also
        state the lit-pixel counts.
  - [ ] **Caller's state comes back:** set non-default draw colour, font mode, bitmap mode,
        baseline position and (guarded) direction; render; every field equals what was set.
  - [ ] **Repaint path:** a marquee label's (and a clock's) blocked-loop update, started with the
        caller in baseline position and draw colour 1, leaves the caller's state intact and draws
        the same pixels as the normal render path for the same content.
- [ ] `include/u8g2gl/u8g2gl_state_saver.h` — the design above.
- [ ] `src/u8g2gl_core.cpp`, `include/u8g2gl/u8g2gl_core.h` — the shared repaint helper; update
      `u8g2gl_render_object()`'s doc to say the guard establishes the baseline.
- [ ] `src/u8g2gl_label.cpp`, `src/u8g2gl_clock.cpp`, `src/u8g2gl_progress_bar.cpp` — use the
      helper; correct `u8g2gl_label.cpp:334` and `u8g2gl_clock.cpp:221` to say the framework
      establishes top positioning (and where).
- [ ] `test/stubs/U8g2lib.h` — model the fields the saver reads, **under the real field names**
      (`draw_color`, `font`, `font_calc_vref` with a `u8g2_font_calc_vref_fnptr` typedef,
      `font_decode.is_transparent`, `font_decode.dir`, `bitmap_transparency`), kept in step by the
      stub's setters, and define `U8G2_WITH_FONT_ROTATION` as `u8g2.h` does. The saver must compile
      identically against stub and real U8G2. Update the header's description.
- [ ] Stub tests that assert exact call sequences may now see the saver's extra calls — update the
      expectations, do not weaken them. `StateSaver.SavesAndRestores` (`test/test_obj.cpp:673`)
      extends to every captured field.
- [ ] `docs/design_spec.md` — Appendix A "Key Implementation Notes" (`setFontPosTop()` is the
      framework default → say the render guard establishes it) and the state-saver line beside it;
      §11.3 wherever it describes what the saver saves. **Only those passages** — WO2 edits other
      sections of this file in parallel.
- [ ] Measure the cost (above) and paste it.

## Strict Boundary Box

- **In:** the files above, plus new test files under `test/` and their `test/CMakeLists.txt`
  entries.
- **Out:** `cli/` entirely; `library.json`; `include/u8g2gl/u8g2gl_config.h`; version numbers
  (`u8g2gl_version.h`, `CMakeLists.txt` VERSION, `library.json` — WO4 bumps them); generated
  goldens; any widget's style-driven `setFont`/`setFontMode`/`setDrawColor` calls; the clip-window
  design (`u8g2gl_clip_scope`) beyond the repaint helper using it.
- If a generated golden or CLI test changes because of this WO, stop and report — it should not.

## Verification Requirement

- [ ] C++ from a **clean configure**, each suite alone: **0** warnings; ctest **401 + your new
      tests**, one skip. State the new total.
- [ ] Each reproduction test shown failing before and passing after (paste both).
- [ ] Cost figures pasted: `sizeof` before/after, ns per pair before/after.
- [ ] `grep -rn "setFontPosTop" src include` shows the call in the saver and comments that are now
      true.
- [ ] `git diff --name-only 9808423..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled elsewhere, do not re-report: misnamed screen files (WO2), the generated config's
PlatformIO advice and `library.json` frameworks (WO3), version bumps (WO4).

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Decisions Made · Evidence (reproductions
before/after, cost figures) · Dead Ends & Warnings · Out-of-Scope Findings · Blockers.

### Status

**complete** — implementation committed at `d6282d0` on `u8g2gl-05r/wo1-ambient-state`
(no push). **One item needs the owner (see Blockers): the measurement does not confirm R1's
cost condition** — full setting is measurably *slower* than a compare-first delta, though
both are a few nanoseconds per object.

### Baseline and final counts

| | Baseline (`540c799`, clean configure) | Final (`d6282d0`, clean configure) |
|---|---|---|
| Build warnings | 0 | 0 |
| ctest | 401 passed, 1 skip (`SizeOfReport.ThirtyTwoBitTarget`) | **410** passed, same 1 skip |

New tests (+9): `AmbientState.*` ×5 (new `test/test_ambient_state.cpp`, real-U8G2 lane),
`StateSaver.NullFontIsWrittenBackWithoutSetFont`, `Core.RenderObjectEstablishesTopPositionAndDirectionZero`,
`Core.RepaintObjectClearsAndRendersInsideOwnBoundsUnderTheGuard`,
`Core.RepaintObjectWhollyOffTheDisplayTouchesNothing`. `StateSaver.SavesAndRestores` extended to
every captured field. CLI not built or touched (out of the box).

### Changes Made

- `include/u8g2gl/u8g2gl_state_saver.h` — save → establish → restore. Captures draw colour,
  font, font mode (`font_decode.is_transparent`), bitmap mode (`bitmap_transparency`), font
  position (`font_calc_vref`) and, under `#ifdef U8G2_WITH_FONT_ROTATION`, direction
  (`font_decode.dir`). Establishes `setFontPosTop()` and `setFontDirection(0)` only. Restores
  all; null font written to `getU8g2()->font` directly; position written back as the captured
  pointer. Name and non-copyable/non-movable shape kept. File header and class doc rewritten
  (captured/established table, clip-window reasoning kept, the "U8G2GL's state inside each
  object's render; the caller's at every other moment" rule).
- `include/u8g2gl/u8g2gl_core.h`, `src/u8g2gl_core.cpp` — new
  `bool u8g2gl_repaint_object(U8G2&, u8g2gl_obj&)`: saver → own-bounds `u8g2gl_apply_clip` →
  `setDrawColor(0)` + `u8g2gl_draw_box(bounds)` → `render()` → `setMaxClipWindow()`; returns
  false (display untouched) for empty/off-display bounds. `u8g2gl_render_object()` doc and step
  comments now say the guard establishes the baseline.
- `src/u8g2gl_label.cpp`, `src/u8g2gl_clock.cpp`, `src/u8g2gl_progress_bar.cpp` — repaints call
  the helper, then `u8g2gl_partial_refresh` as before. Label's local clip workaround removed.
  Label's layout measurement inside `render_animation_update()` (it called `setFont` outside
  any guard) now runs under a local `u8g2gl_state_saver`. Comments at label Step 4 and clock
  Step 5 now say the guard establishes top positioning. Includes adjusted (`u8g2gl_tree.h` →
  `u8g2gl_state_saver.h` in label; `u8g2gl_draw.h` dropped from clock, `u8g2gl_core.h` added to
  clock and progress bar).
- `test/stubs/U8g2lib.h` — `u8g2_t` gains `draw_color`, `font_calc_vref`
  (`u8g2_font_calc_vref_fnptr`), `font_decode` (`is_transparent`, `dir`), `bitmap_transparency`,
  with `u8g2_SetupBuffer()`'s defaults; `U8G2_WITH_FONT_ROTATION` defined as `u8g2.h` does;
  setters keep the fields in step (`getDrawColor()` reads the struct); adds the real
  `setFontPosBaseline/Bottom/Center` and `setFontDirection`, with four distinct stub position
  functions so tests can tell positions apart. Header description updated.
- `test/test_ambient_state.cpp` + `test/CMakeLists.txt` entry (built as `test_bound_child_clip`
  is, plus `u8g2gl_u8g2_fonts_csrc`).
- `test/test_core.cpp`, `test/test_obj.cpp` — the stub-lane tests above.
- `docs/design_spec.md` — §11.3 lifecycle tree line and the state-saver paragraph; Appendix A
  Key Implementation Notes `setFontPosTop()` and `u8g2gl_state_saver` bullets. Nothing else.

### Decisions Made

- **The clear lives inside the helper**, not at each call site: all three widgets cleared
  identically (`setDrawColor(0)` + `u8g2gl_draw_box(x_, y_, w_, h_)`), so one implementation
  holds clear + render. It runs inside the guard (so colour 0 never leaks) and inside the clip
  (identical pixels: the box is the clip).
- **Name `u8g2gl_repaint_object`**, beside `u8g2gl_render_object` (§2 flat prefix).
- **Restore via the public setters** where they exist (colour, font mode, bitmap mode,
  direction, non-null font); direct struct writes only where the WO requires (null font,
  position). Full setting, as R1 specifies — see Blockers for the cost result.
- **Bitmap mode coverage**: the caller-state reproduction also renders a `u8g2gl_xbm`, the one
  widget that sets bitmap mode, so that field is exercised on real U8G2.
- **Reproduction references hold a font**: the position and repaint cases give their displays a
  caller font so they isolate their own fault from the null-font crash (without it, every case
  crashed first and showed nothing else).

### Evidence

**Reproductions before** (unmodified `src/`, each run alone under `--gtest_filter`):

```
NullFontIsRestoredAndASecondRenderWorks       exit=139 (SIGSEGV)
  stop reason = EXC_BAD_ACCESS (code=1, address=0x0)
  frame #0: u8g2_font_get_byte + 32
BaselineCallerDrawsTheSamePixelsAsTopCaller   FAILED
  baseline_lit Which is: 50   top_lit Which is: 93
  memcmp(top, baseline) Which is: -112          "lit pixels: top 93, baseline 50"
CallerStateComesBackAfterRender               FAILED
  after a label: font mode 0, expected 1
  after an XBM:  font mode 0, expected 1; bitmap mode 0, expected 1
MarqueeRepaintKeepsCallerStateAndMatchesRender FAILED
  font 0x…f56, expected 0x…2c1 (the widget's font leaked); font mode 0, expected 1
  memcmp(repainted, rendered) 112               "lit pixels: repaint 29, render 51"
ClockRepaintKeepsCallerStateAndMatchesRender  FAILED
  font leaked; font mode 0, expected 1
  memcmp(repainted, rendered) 64                "lit pixels: repaint 57, render 57" (same count, shifted)
```

**After** (`d6282d0`): all five `[ OK ]`, exit 0. Font-position case lit pixels: top **93**,
baseline **93**, buffers byte-identical.

**Cost** (Apple arm64 host, `-O2`, real U8G2 2.36.18 C sources, 1e7 iterations × 3 runs, ns per
construct+destruct pair, body = one `setDrawColor`; scratch in `tmp/bench/`, not committed):

| | Before (`9808423` saver) | After |
|---|---|---|
| `sizeof(u8g2gl_state_saver)`, 64-bit host | 24 B | 32 B |
| same, 32-bit target (ESP32), computed | 12 B | 16 B |
| ns per pair | 2.64 / 2.33 / 2.55 | 5.29 / 5.58 / 5.05 |

Stack only, once per object render, no allocation (no setter allocates; checked in source).

**Full vs delta** (same harness; delta = compare each field, call the setter only on a change;
caller in baseline position):

| Body inside the guard | Full (committed) | Delta |
|---|---|---|
| one `setDrawColor` | 5.66 / 5.89 / 5.78 ns | 2.74 / 2.88 / 3.12 ns |
| what a label sets (font = caller's, colour, font mode) | 6.57 / 7.01 / 6.44 ns | 3.41 / 3.72 / 3.52 ns |
| same, caller font differs (header read on both paths) | 49.4 / 50.6 / 50.8 ns | 46.9 / 48.5 / 48.1 ns |

`grep -rn "setFontPosTop" src include`: the call at `u8g2gl_state_saver.h:113`; comments at
`u8g2gl_state_saver.h:16`, `u8g2gl_label.cpp:335`, `u8g2gl_clock.cpp:222`, all now true.
`git diff --name-only 9808423..HEAD`: the files listed under Changes Made plus the PA's own
`540c799` workspace files — within the box. No generated golden or CLI file changed.

### Dead Ends & Warnings

- `u8g2_m_16_8_f()` returns one static buffer shared by every U8G2 instance in a process, so
  the real-U8G2 tests snapshot a frame before constructing the next display.
- The bench must link `u8g2gl_u8g2_csrc_arduino` (ARDUINO-built), not `u8g2gl_u8g2_csrc`, for the
  reason `test/CMakeLists.txt` gives (`u8x8_t` layout differs).

### Out-of-Scope Findings

- `include/u8g2gl/u8g2gl_obj.h` `render_animation_update()` doc still tells implementers to
  clear their own box and push; it is not wrong, but it should now point at
  `u8g2gl_repaint_object()`. Not in this WO's file list, so left.
- `docs/design_spec.md` "Font state on inline text" says an inline text draw call has no
  `u8g2gl_state_saver` around it. No text draw-call primitive exists today, but if the generator
  ever emits one it will also run in the caller's font position, not top. Untouched (outside
  the permitted passages).
- The repaint helper, like the code it replaces, checks neither effective visibility nor
  ancestor clips (a widget cannot reach its screen's arrays). Unchanged behaviour; noting it.

### Blockers

None for the code. **For the owner, R1's condition:** "full state setting must be cheaper than
applying deltas" — **measurement says it is not.** The PA's argument (a delta needs the same
comparison) missed that full setting pays a non-inlined call into U8G2's C library per item,
where a delta pays a load and compare. Full setting costs ~2.5–3 ns more per object on this
host (~5 % when a font change dominates). Absolute cost is small either way (a handful of ns
per object, no allocation). Switching the destructor to compare-first is a few lines inside
`u8g2gl_state_saver` with no behavioural change — establishing must still be unconditional for
position, since U8G2 does not export `u8g2_font_calc_vref_top` to compare against. Not done
here: R1 specifies full setting, and choosing otherwise is the owner's call.

### Follow-up: compare-first (R1a)

Committed `519e8bc`. Provenance: R1a and the owner's "1) yes, ok" are recorded in `PROJECT.md` at `aae3e07`.

- **Change:** `u8g2gl_state_saver` now calls a setter only when the field differs from its target value. That covers both establishing (`font_calc_vref` compared against `u8g2_font_calc_vref_top`, direction against 0) and restoring (draw colour, font mode, bitmap mode, direction, and the font too, so the no-op `setFont` call is skipped as well). Null-font handling is unchanged. The position is still written back as a plain store.
- **Behaviour unchanged:** the setters are plain field assignments (checked in `u8g2_hvline.c`, `u8g2_font.c` and `u8g2_bitmap.c`).
- **The top-position symbol:** `u8g2_font_calc_vref_top` has external linkage in `u8g2_font.c`, but `u8g2.h` does not declare it, so the saver header declares it `extern "C"`. The stub now defines all four position functions under U8G2's real names with C linkage. Its old stub-only names are gone, and `test_core.cpp`/`test_obj.cpp` use the real names.
- **Doc:** the class doc now explains compare-first and states the measured figures (§4.1).
- **Suite (clean configure):** 0 warnings, **410** passed, one skip (`SizeOfReport.ThirtyTwoBitTarget`). All five `AmbientState` reproductions pass.
- **Cost** (same harness as above; arm64 host, `-O2`, real U8G2, 1e7 iterations × 3; caller in baseline position). `sizeof` is unchanged at 32 B (16 B on 32-bit):

  | | Full setting (`d6282d0`) | Compare-first (`519e8bc`) |
  |---|---|---|
  | ns per construct+destruct (body: one `setDrawColor`) | 5.15 / 5.69 / 4.99 | 3.71 / 4.11 / 4.11 |
  | What a label sets (same font) | 6.94 / 6.51 / 6.80 | 3.97 / 3.77 / 4.01 |
  | Label, caller font differs (font header read) | 50.4 / 50.0 / 50.2 | 47.8 / 47.0 / 47.5 |

  The label case now matches the scratch compare-everything guard (3.6–3.7 ns) to within noise.
