---
name: pr-05r2-wo4
description: Handoff instructions for Work Order 4 — dirty-flag ordering, the resume callback, and the threading contract
complexity: standard
---

# PR-5R2 / WO4 — dirty-flag ordering, the resume callback, the threading contract

## Role Definition

You are an expert senior embedded C++ engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan.
Your task is limited to executing the checklist below; where a detail is open, choose the option
most consistent with LVGL 9 and the house standards, and record it under Decisions Made.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md`. Read its
**Design** section and its WO3 status entry. The Status Log records the owner's approval.

## Objective

The second half of the owner's Q-C ruling: **a binding update ends the loop's sleep.** This WO
delivers it in three parts:

1. **Fix a real ordering bug.** `ui_handler()` clears `dirty` *after* rendering, so a subject written
   during a render is lost.
2. **Add a resume callback** mirroring LVGL's `lv_timer_handler_set_resume_cb`.
3. **Write the threading contract** into the spec.

## Strict Boundary Box

- **Work in** `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, on branch
  `u8g2gl-05r2/wo4-dirty-and-resume` (checked out; it contains WO1–WO3). Do not create branches.
- **May edit:**
  - `src/u8g2gl_core.cpp` and `include/u8g2gl/u8g2gl_core.h`;
  - `src/u8g2gl_timer.cpp` and `include/u8g2gl/u8g2gl_timer.h`, **only** to fire the resume callback;
  - `test/test_core.cpp`, `test/test_timer.cpp`, and a new `test/test_resume.cpp` if you prefer
    (with its `test/CMakeLists.txt` entry);
  - `docs/design_spec.md`: §11.1, §11.2 (if it describes the dirty gate), §8.1's time-subject row,
    and §11.3's deadline paragraph (around line 1249).
  - your Completion Report.
- **Do NOT touch** widgets (label, clock, others), the wall clock, the CLI or generator, any schema,
  versions or the changelog (WO5).
- No allocation.

## Tooling Constraints

- Fresh build: `cmake -S . -B tmp/build-wo4 && cmake --build tmp/build-wo4 -j && ctest --test-dir tmp/build-wo4`.
  **0 warnings.** Baseline is **481** tests with 1 skip.
- CLI suite once at the end: `cd cli && npx vitest run` (1353, unchanged).
- **Load the `u8g2gl-standards` skill before writing code.**
- No PlatformIO and no device.

## Reference: LVGL 9.5.0

`/Users/mcneillm/Documents/Projects/repo-memory-plugin/evaluation/eval-v2/template/.pio/libdeps/crowpanel-128-rotary/lvgl/src/misc/lv_timer.c`.

- **`lv_timer_handler_resume()`** (around line 401) sets `timer_time_until_next = 0` and calls
  `state.resume_cb(state.resume_data)`. It is called from `lv_timer_create`, `_resume`,
  `_set_period`, `_ready`, `_reset` and `lv_timer_enable(true)`.
- **A subject write reaches it through the display:** subject → widget → invalidate →
  `LV_EVENT_REFR_REQUEST` → `lv_timer_resume(disp->refr_timer)` (`lv_display.c` around line 1556) →
  resume callback.
- **What it is for:** an OS port's display task blocks for the returned deadline, and the callback
  wakes it.

## Line-Item Instructions

### A. The dirty-flag ordering bug (`ui_handler()`)

- [ ] **Clear before rendering:** clear `s_active_screen->dirty` **before** `clearBuffer()` and
  rendering, not after `sendBuffer()`. A subject written during the render (an observer, or a
  widget's render path) then leaves the frame dirty for the next call, rather than being lost.
- [ ] **Return 0 when work is left over:** if the frame is dirty again when `ui_handler()` is about to
  return, return **0**, because work is pending. Reconcile this with the elapsed-time helper WO3
  introduced (`u8g2gl_sleep_after_frame`).
- [ ] **Two tests:**
  - **Reproduce first, against the current code:** a subject written from inside a widget's render
    (a test widget whose `render()` writes a subject bound elsewhere on the screen). On the old code
    the change is never drawn. Show the failure, then fix it.
  - **Steady state:** after the fix, the next call redraws and the returned value was 0, while a
    plain frame with nothing pending still returns the real deadline.

### B. The resume callback

- [ ] **API:** `using u8g2gl_resume_cb_t = void (*)(void* user_data);` and
  `void u8g2gl_set_resume_cb(u8g2gl_resume_cb_t cb, void* user_data);`. Name and place it where the
  house standards put core configuration, beside `u8g2gl_set_tick_cb()`. If the standards point to a
  different name (for example LVGL's `..._timer_handler_set_resume_cb` shape), choose and justify.
  Passing `nullptr` clears it.
- [ ] **Fired:**
  - when the active screen goes from **clean to dirty**, through `u8g2gl_mark_dirty()`, the
    frame-dirty subject observer, and `u8g2gl_set_active_screen()`. Fire only on the transition, not
    on every write to an already-dirty frame (unlike LVGL, which fires per call; here that would be a
    storm on every subject write);
  - from `u8g2gl_timer_init`, `_resume`, `_ready`, `_reset` and `_set_period`, as LVGL does (WO3
    named these hook points in `src/u8g2gl_timer.cpp`).
- [ ] **Synchronous:** it runs in the caller's context. U8G2GL does not defer it.
- [ ] **Inside `ui_handler()`:** decide whether a dirty transition caused *during* `ui_handler()`
  (a timer writing a subject) fires it. LVGL does not suppress. The recommended rule: suppress
  while inside `ui_handler()`, since the loop is awake by definition. Choose, justify, and test.
- [ ] **Tests:**
  - it fires on a subject write to a clean bound frame;
  - it does not fire again while the frame is already dirty;
  - it fires on each timer call listed above;
  - your rule inside `ui_handler()`;
  - `nullptr` clears it;
  - no callback set means no effect.

### C. The threading contract, and the spec gaps WO3 could not reach

- [ ] **§11.1, a short "Threads" paragraph:**
  - U8G2GL is single-threaded, as LVGL is without `LV_USE_OS`. Subjects, timers and `ui_handler()`
    are used from one thread, the one that calls `ui_handler()`.
  - Data produced on another task is handed over (a queue or a notification) and written to
    subjects by the UI thread.
  - The resume callback is the hook for waking that thread from its own sleep. It runs
    synchronously wherever the dirty transition or timer call happened.
  - **`ui_handler()` must not be called from a timer callback** (WO3's finding).
  - State plainly what is undefined if this is violated.
- [ ] **§11.1:** describe the resume callback, the LVGL row it maps to, and the "transition only"
  divergence. Add it to the divergences list.
- [ ] **§11.2** (if it describes the dirty gate): the clear-before-render order and the 0 return
  when work is pending.
- [ ] **§8.1, the time-subject row:** mention `U8G2GL_TIME_UNKNOWN` and that a `u8g2gl_wall_clock`
  (§11.1) can keep it current.
- [ ] **§11.3 (around line 1249):** the clock's blink is locked to changes in its time value. Its
  per-second updates come from the wall clock's timer, not its own `tick()`.
- [ ] **Quote** every changed passage in your report.

## Verification Requirement

- ctest green in a **fresh** build, 0 warnings, editor target included. State the before and after
  totals. The CLI vitest total is unchanged.
- `git status --short` clean apart from intended files.
- **Verify the branch** (`u8g2gl-05r2/wo4-dirty-and-resume`), then commit. Logical commits welcome;
  end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not push.**
- Message the PA with your results and decisions.

## Issue Surfacing

Defects or concerns outside your boundary box go in your Completion Report with a reproduction. Do
not fix them and do not file issues.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete | partial | blocked

### Changes Made
- `path/to/file` — what changed and why

### Decisions Made
- Decision description and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, and what to avoid

### Out-of-Scope Findings
- Finding description and suggested action

### Blockers
(none)
