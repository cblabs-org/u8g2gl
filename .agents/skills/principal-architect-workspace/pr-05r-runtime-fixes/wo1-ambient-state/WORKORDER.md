---
work_order: WO1
project: pr-05r-runtime-fixes
title: "The framework establishes ambient U8G2 state, and restores the caller's"
branch: u8g2gl-05r/wo1-ambient-state
base: main @ 9808423
complexity: architect
status: dispatched
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
