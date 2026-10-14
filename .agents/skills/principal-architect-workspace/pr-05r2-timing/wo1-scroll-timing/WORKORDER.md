---
name: pr-05r2-wo1
description: Handoff instructions for Work Order 1 — label scroll timing (D-A)
complexity: standard
---

# PR-5R2 / WO1 — label scroll timing (D-A)

## Role Definition

You are an expert senior embedded C++ engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan.
Your task is strictly limited to executing the checklist below.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md`. Its
Status Log records the owner's approval of this decomposition. Verify that before you start
(`.agents/rules/00-operating-model.md`).

## Objective

Make a scrolling label step at exactly its configured rate, and make the deadline it returns from
`tick()` truthful: never 0 when nothing is due, and never a burst of steps after a stall. Measured on
hardware: 37.9 px/s against 40 configured, and 4 343 wakes with nothing to do in 20 s.

## Strict Boundary Box

- **Work in** the worktree `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, on branch
  `u8g2gl-05r2/wo1-scroll-timing` (already checked out). Do not create branches.
- **Edit only:** `src/u8g2gl_label.cpp`, `include/u8g2gl/u8g2gl_label.h`, `test/test_label.cpp`, and
  the spec text in `docs/design_spec.md` **only** where it describes scroll stepping or the label's
  deadline (quote the old and new text in your report). Plus your Completion Report.
- **Do not touch** the clock, `u8g2gl_core.cpp`, timers, the CLI, versions or the changelog. Those
  are later work orders.
- **Never** change the public API's signatures. Private members may change.
- **No version bump** (WO5 does the release).
- Temporary files go in `tmp/` of the worktree (`.agents/rules/02-workspace.md`).

## Tooling Constraints

- **C++:** CMake + GoogleTest + ctest in a fresh build directory, e.g.
  `cmake -S . -B tmp/build-wo1 && cmake --build tmp/build-wo1 -j && ctest --test-dir tmp/build-wo1`.
  The project builds with warnings enabled; **0 warnings is the bar**.
- **CLI:** not affected. Run `cd cli && npm ci && npx vitest run` once at the end only to confirm
  nothing moved; do not change CLI files.
- **No PlatformIO, no device.** The device re-measure is WO5.
- **Before writing code, load the `u8g2gl-standards` skill.** File headers, Doxygen, step comments
  and why-comments carry equal weight to the code.

## Context

The defect, as read by the PA in `src/u8g2gl_label.cpp` at `99ac4a3`:

1. **Line ~218:** a step happens only when `now_ms > last_scroll_ms_` (strictly greater), so every
   step is at least one interval **plus 1 ms**.
2. **Lines ~263 and ~278:** the next step is scheduled as `now_ms + interval_ms`, from when the step
   *ran* rather than when it was *due*, so any lateness accumulates.
3. **Line ~284:** returns `last_scroll_ms_ - now_ms`, which is **0** when they are equal. Point 1
   then refuses to step, so a loop that sleeps for the deadline wakes with nothing to do until
   `millis()` advances.
4. `interval_ms = 1000 / scroll_px_per_sec_` truncates: 30 px/s becomes 33 ms, which is 30.3 px/s.

Hardware evidence is in `git show origin/u8g2gl-device/measurements:.agents/skills/principal-architect-workspace/device-measurements/EVIDENCE.md`
(section M1 and defect D-A), with firmware under `…/device-measurements/rig/m1-m3-image-b2/`.
Phase U (an uncapped loop) also showed **33 full-frame sends with no buffer change**, inside the
ticker's 1000 ms initial-delay window. The cause was not isolated. Candidates are the
`needs_layout_` path that returns 1, or a `mark_dirty()` without a visible change.

LVGL comparison, for your understanding only: LVGL's timers have the same drift (they set
`last_run = now`). We are deliberately not copying that.

## Line-Item Instructions

- [ ] **Baseline:** configure, build and run ctest in a fresh directory. Record the pass, skip and
  warning counts before any change.
- [ ] **Due-time scheduling** in `u8g2gl_label.cpp`, for both `U8G2GL_LONG_SCROLL` (bounce, with
  dwell) and `U8G2GL_LONG_SCROLL_CIRCULAR`:
  - A step is due when `now >= due`.
  - After a step, the next due time is computed from the **previous due time**, not from `now`.
  - **Exact rate without truncation:** compute step *k*'s due time as `origin + (k * 1000) / speed`
    in integer arithmetic (or an equivalent accumulator), so 30 px/s averages exactly 30.
  - **Resync, never burst:** if a call arrives more than one interval late (for example after a
    blocked loop or a long frame), take one step and resync the origin to `now`. Never take several
    steps in one call, and never return 0 to catch up.
  - **Wraparound:** `uint32_t` millisecond time wraps. Use difference arithmetic
    (`static_cast<int32_t>(now - due) >= 0`), not plain `>=` on absolute values.
- [ ] **The returned deadline:** after a step, the time until the next due time. When not yet due,
  `due - now`, which is ≥ 1 by construction. **`tick()` never returns 0.** Apply the same rule to
  the dwell paths (`static_dwell_ms_`) and the initial delay.
- [ ] **The render path:** `u8g2gl_label` also calls `tick()` from its render or animation path
  (around lines 472–485). Make sure scheduling cannot advance twice for one due time. If that path
  is a separate concern, document it.
- [ ] **The 33 redundant sends:** reproduce on the host. Drive `ui_handler()` (or the label's
  tick/render pair) with a fake tick clock through the initial delay, counting frames marked dirty
  with no pixel change. Fix it if the cause is inside the label. If it is outside your boundary
  box, report it with a reproduction instead.
- [ ] **Tests in `test/test_label.cpp`,** each driven by a simulated clock:
  - **Rate:** 20 s at 40 px/s, waking exactly at each returned deadline plus 0–1 ms of jitter: 800 ± 1
    steps. The same at 30 px/s: 600 ± 1.
  - **No zero:** across those runs, no `tick()` returns 0, and every wake at a returned deadline
    takes a step.
  - **Edge:** `tick(due - 1)` does not step and returns 1; `tick(due)` steps.
  - **Stall:** after a 1 s stall, the next call takes exactly one step and the rate then resumes
    without a burst.
  - **Wraparound:** a scroll whose due times straddle `UINT32_MAX` keeps its rate.
  - **Bounce mode:** the dwell still lasts `static_dwell_ms_` (± 0) and the direction still flips.
  - **Existing tests:** if one encodes the old timing (for example "returns interval + 1"), update
    it and quote the before and after with the reason in your report. Do not weaken an assertion
    just to make it pass.
- [ ] **Spec:** if `docs/design_spec.md` states scroll timing that is now different, correct it and
  quote the change.

## Verification Requirement

- ctest is all green in a **fresh** build directory, with 0 warnings. State the before and after
  totals.
- The CLI vitest totals are unchanged from baseline (run once).
- `git status --short` is clean apart from your intended files.
- **Verify the branch before committing** (`git branch --show-current` must print
  `u8g2gl-05r2/wo1-scroll-timing`; `.agents/rules/04-branch-hygiene.md`). Then commit on it, with a
  conventional message ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not push.**
- Then message the PA with your results. The PA reviews before the next WO starts.

## Issue Surfacing

Defects or concerns outside your boundary box go in your Completion Report with a reproduction. Do
not fix them and do not file issues.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete

### Changes Made
- `src/u8g2gl_label.cpp` - `tick()` rewritten to due-time scheduling. A step is due when
  `int32(now - next_due_ms_) >= 0`; the next due time is the previous due time plus an exact interval
  (`1000 / speed`, remainder carried in `step_rem_`, so 30 px/s averages exactly 30). A call at least
  one interval late takes one step and restarts the schedule from `now` (no burst). New private
  `schedule()` is the single exit for deadlines and clamps to >= 1, so `tick()` never returns 0 (also
  on the initial delay, the bounce dwell, and the static-fit dwell). The sentinel `last_scroll_ms_ == 0`
  is replaced by `timing_started_` (0 is a real time). The bounce dwell runs from `now` (when the edge
  is shown), so it lasts exactly `static_dwell_ms_`. `reset_scroll()` resets the new state.
  `render_animation_update()` comment documents that it cannot double-step.
- `include/u8g2gl/u8g2gl_label.h` - private only: `last_scroll_ms_` renamed `next_due_ms_`; added
  `step_rem_` (uint8_t), `timing_started_` (bool), `schedule()`; `tick()` Doxygen updated. No public
  signature changed. sizeof stays within the 80-byte ceiling.
- `test/test_label.cpp` - 11 new `LabelScrollTiming` tests (rate 40 and 30 px/s in both modes, uint32
  wrap, ms-zero start, due-edge, late-wake, stall/no-burst, bounce dwell and flip, zero dwell, render
  path vs tick, and the redundant-frames repro). Two existing assertions updated (below).
- `docs/design_spec.md` line 1208 - old: "a scrolling label returns its step interval"; new: "a scrolling
  label returns the time left until its next step is due (never 0, and measured from the previous due
  time rather than from when the step ran, so the scroll holds its configured rate)".

### Decisions Made
- Resync threshold is `late >= interval` (so an on-time wake is always < one interval late).
- Dwell is measured from `now`, not the due time: measuring from due shortened the visible pause by
  the lateness and broke the existing `DwellsAtFarEndForStaticDwellMs` (1990 vs 2000).
- `scroll_px_per_sec == 0` keeps the historical 40 ms default (25 px/s).
- Initial delay of 0 returns 1 and makes the first step due at now + 1.
- Existing tests changed (both encoded "interval restarted from when the step ran"):
  `LabelScroll.InitialDelayBeforeScroll`: step due 4000, run at 4001, `EXPECT_EQ(d3, 40u)` -> `39u`
  (next due 4040). `LabelScroll.ConfigurableScrollSpeed`: step due 500, run at 501,
  `EXPECT_EQ(tick(501), 20u)` -> `19u` (next due 520). Neither assertion was weakened; both are exact.

### Dead Ends & Warnings
- The 33 redundant sends did NOT reproduce inside the label. Host repro: `LabelScrollTiming.
  NoRedundantFramesInsideInitialDelay` drives the real `ui_handler()` uncapped (every ms) through a
  1000 ms delay: 1 send. A second scratch repro (not committed) added a blinking `u8g2gl_clock`, a
  non-zero boot time and a 13 ms frame cost: the only send in the delay window was the clock colon
  toggle at +500 ms, which changes pixels. So the cause is outside the label's scheduling or depends on
  the real generated app. The test is kept as a regression guard (passes before and after the fix).
  Untested candidates: the clock's `bind_time` subject path, or app code re-setting a subject. Needs the
  hardware rig with a per-call dirty-reason log.
- Fresh worktree needed `git submodule update --init extern/u8g2` (used `--reference` to the main
  checkout); no tracked change.

### Out-of-Scope Findings
- `u8g2gl_obj::set_coords()` (and set_w) does not set `needs_layout_` on a label, so changing the width
  after the first render leaves `needs_scroll_`/`message_width_` stale. Repro: render a 60 px-wide label
  with 60 px text, then `set_coords(0,0,50,16)`: it still does not scroll. Not fixed (outside the box).
- The clock's `tick()` still has the same class of drift (WO scope: later work order).

### Blockers
(none)
