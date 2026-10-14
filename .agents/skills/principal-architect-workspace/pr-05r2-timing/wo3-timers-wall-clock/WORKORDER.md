---
name: pr-05r2-wo3
description: Handoff instructions for Work Order 3 — LVGL-shaped host-owned timers, the wall-clock helper, and the clock driven by them (Q-C)
complexity: architect
---

# PR-5R2 / WO3 — timers, the wall clock, and the clock (Q-C)

## Role Definition

You are an expert senior embedded C++ engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make high-level architectural decisions beyond what this order fixes, do
not branch, and do not plan. Your task is limited to executing the checklist below. Where it leaves
a detail open, choose the option most consistent with LVGL 9 and the house standards, and record the
choice under Decisions Made.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md`. Read
its **Design** section first: it is the owner-approved design you are implementing. Its Status Log
records the owner's approval (`.agents/rules/00-operating-model.md`).

## Objective

The owner's ruling (Q-C): **a developer who adds a clock must not have to write seconds logic, and
time-dependent content updates through the library itself.** The approved mechanism is LVGL's: a
**timer whose callback writes a subject**. Deliver:

1. `u8g2gl_timer`: LVGL-shaped, with **storage owned by the host** (no pool, no heap), scheduled from
   each timer's due time, and run by `ui_handler()`, which combines timer deadlines with widget
   deadlines.
2. **The wall-clock helper:** an object the host declares, containing a timer. It publishes a time
   subject on each second boundary from the host's time function.
3. **The clock:** it binds to that subject as it does today. Its own `tick()` handles only the colon
   blink, phase-locked to changes in the bound value and scheduled drift-free. **Unknown time
   renders `--:--`.**

## Strict Boundary Box

- **Work in** `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, on branch
  `u8g2gl-05r2/wo3-timers-wall-clock` (checked out; it contains WO1 and WO2). Do not create branches.
- **May create:** `include/u8g2gl/u8g2gl_timer.h`, `src/u8g2gl_timer.cpp`,
  `include/u8g2gl/u8g2gl_wall_clock.h`, `src/u8g2gl_wall_clock.cpp`, `test/test_timer.cpp`,
  `test/test_wall_clock.cpp`.
- **May edit:** `src/u8g2gl_core.cpp` and `include/u8g2gl/u8g2gl_core.h` (**only** to run timers in
  `ui_handler()`); `src/u8g2gl_clock.cpp` and `include/u8g2gl/u8g2gl_clock.h`;
  `include/u8g2gl/u8g2gl_types.h` (one sentinel); `test/test_clock.cpp`, `test/test_core.cpp`,
  `test/test_sizeof_report.cpp`; build lists (`CMakeLists.txt`, `test/CMakeLists.txt`, and any
  `library.json` / Arduino metadata that lists sources or headers, so check them); and
  `docs/design_spec.md` (§11.1 and the clock's section). Plus your Completion Report.
- **Do NOT:**
  - fix the dirty-flag ordering in `ui_handler()`, or add the resume callback. Both are **WO4**.
  - touch the label, the CLI or the generator, any schema or manifest, versions or the changelog
    (WO5).
  - convert widgets to timers. Widgets keep `tick()`.
- **No allocation anywhere** (house memory discipline).

## Tooling Constraints

- Fresh build: `cmake -S . -B tmp/build-wo3 && cmake --build tmp/build-wo3 -j && ctest --test-dir tmp/build-wo3`.
  **0 warnings.** Baseline is 429 tests with 1 skip (`SizeOfReport.ThirtyTwoBitTarget`).
- At the end, run the CLI suite once to confirm nothing moved: `cd cli && npm ci && npx vitest run`
  (1353 expected).
- The editor target must still build and pass its tests (`U8G2GL_EDITOR` builds and the parity
  tests are part of ctest).
- **Load the `u8g2gl-standards` skill before writing any code.** Naming, file headers, Doxygen on
  every public API, step comments and why-comments are reviewed with equal weight.
- No PlatformIO and no device.

## Reference: LVGL 9.5.0 (read, do not copy)

LVGL is MIT-licensed, but we reimplement, because its timers use a heap linked list and drift. Its
source is at
`/Users/mcneillm/Documents/Projects/repo-memory-plugin/evaluation/eval-v2/template/.pio/libdeps/crowpanel-128-rotary/lvgl/src/misc/lv_timer.{h,c}`.
Read it for semantics: what repeat count, pause, ready and reset mean, and how a timer deleted
inside its own callback is handled (`state.timer_deleted`, `timer_created`). Two of its behaviours
are deliberately **not** copied:

- `last_run = lv_tick_get()`: reschedules from now, which drifts. We schedule from the due time.
- `lv_malloc` / `lv_ll`: we use storage the host owns, linked intrusively.

## Line-Item Instructions

### A. `u8g2gl_timer` (new `u8g2gl_timer.h` / `.cpp`)

- [ ] **Storage owned by the host.** `u8g2gl_timer` is a type the host declares (a static, or a
  member of its own object). It carries an intrusive `next` pointer, the callback, user data, the
  period, the next due time, the repeat count and flags. U8G2GL keeps only a head pointer, so there
  is **no pool and no capacity setting**.
- [ ] **API,** using LVGL's names with LVGL's `_init` convention for caller-owned storage (owner
  approved this exact subset):
  - `void u8g2gl_timer_init(u8g2gl_timer* t, u8g2gl_timer_cb_t cb, uint32_t period_ms, void* user_data)`:
    links the timer and schedules its first run at `now + period`, as LVGL does.
  - `u8g2gl_timer_delete(t)` (unlink; safe to call twice), `u8g2gl_timer_pause(t)`,
    `u8g2gl_timer_resume(t)`, `u8g2gl_timer_set_period(t, ms)`, `u8g2gl_timer_ready(t)` (due now),
    `u8g2gl_timer_reset(t)` (due `now + period`), `u8g2gl_timer_set_repeat_count(t, n)` (−1 =
    forever, the default; when it reaches 0 the timer **pauses**, since there is no heap to
    auto-delete), and `u8g2gl_timer_get_user_data(t)`.
  - Callback type: `void (*)(u8g2gl_timer*)`, as in LVGL.
  - `set_period` follows LVGL: the remaining time is measured from the last run against the new
    period. State your exact rule.
  - **Omitted, by owner decision:** auto-delete, external data, global enable, idle statistics,
    list walking.
- [ ] **Scheduling, drift-free** (the same rule WO1 applied to the label, so read its
  `schedule()`/`tick()`):
  - A timer is due when `static_cast<int32_t>(now - due) >= 0`.
  - After it runs: `due += period`.
  - If it was **one period or more late**, run **once** and resync with `due = now + period`. Never
    run several times to catch up.
  - Time arithmetic must survive `uint32_t` wraparound.
- [ ] **The handler:** an internal `u8g2gl_timer_handler(now)` runs every due, unpaused timer once
  and returns the time until the earliest due timer, or `U8G2GL_IDLE` if there are none. **It never
  returns 0 unless a timer became due during the pass**, for example via `ready()` from inside a
  callback.
- [ ] **Safety, each covered by a test:**
  - a callback that deletes **itself** or **another** timer;
  - a callback that initialises a **new** timer (it must not run in the same pass unless it is due);
  - `init` on an already-linked timer re-initialises it **without linking it twice**;
  - the **destructor** unlinks the timer (RAII), so a timer leaving scope is safe;
  - `delete` on an unlinked timer is a no-op.
- [ ] **Thread safety:** none, as in LVGL without `LV_USE_OS`. Document it in the header. WO4 writes
  the contract into the spec.

### B. `ui_handler()` integration (`u8g2gl_core.cpp`)

- [ ] **Run timers first:** run due timers **before** the widget tick step, so that a subject a timer
  writes is drawn in the same frame.
- [ ] **Return the earlier deadline:** combine the timer deadline with the widget deadline, keeping
  the existing elapsed-time correction.
- [ ] **Timers run even with no active screen.** Today `ui_handler()` returns `U8G2GL_IDLE` at once
  when there is no screen. Timers are data, not screen state, so they still run, and their deadline
  is still returned.
- [ ] **No other change to `ui_handler()`.** In particular, the dirty-flag clear stays where it is;
  that is WO4.

### C. The wall-clock helper (new `u8g2gl_wall_clock.h` / `.cpp`)

- [ ] **Shape:** `u8g2gl_wall_clock` is an object the host declares, with a `u8g2gl_timer` as a
  member.
- [ ] **Init:** `u8g2gl_wall_clock_init(u8g2gl_wall_clock* wc, u8g2gl_subject_time_base* subject, u8g2gl_wall_time_cb_t time_fn)`.
- [ ] **The host's time callback** has the shape
  `bool (*)(uint32_t* epoch_seconds, uint16_t* millis_into_second)`. It returns **false while the
  time is unknown** (for example before NTP has synced). It is the only thing the host supplies; the
  library stays free of NTP, RTC and ESP-IDF.
- [ ] **The timer callback:**
  - **Time known:** set the subject to the epoch seconds, then set the timer's next due time to the
    **next second boundary**, `1000 − millis_into_second`, at least 1 ms.
  - **Time unknown:** set the subject to `U8G2GL_TIME_UNKNOWN` and retry in 1000 ms.
- [ ] **On init,** set the subject at once: either the current time, or `U8G2GL_TIME_UNKNOWN`.
- [ ] **New sentinel:** `U8G2GL_TIME_UNKNOWN = UINT32_MAX`, in `u8g2gl_types.h`, beside
  `U8G2GL_IDLE`, with its doc comment.
- [ ] **Keep it generic:** no NTP, no time zones (the host's function returns the local epoch it
  wants displayed; document that), no platform calls.

### D. The clock (`u8g2gl_clock.cpp` / `.h`)

- [ ] **Unknown time:** when the time (set or bound) equals `U8G2GL_TIME_UNKNOWN`, render `--:--`
  in `hh_mm`, and `--:--:--` in `hh_mm_ss` with the seconds' `--` in the secondary font on WO2's
  baseline. Keep the same digit columns, so the layout does not jump when the time arrives. Owner
  approved `--:--`; extending it to `--:--:--` for `hh_mm_ss` is the consistent form, so state it.
  The colon stays steady (no blink) while the time is unknown.
- [ ] **Blink locked to the value:** when the clock's time value changes (through `set_time()` or the
  binding), show the colon and schedule the next toggle 500 ms later. Seconds and blink then move
  together: the colon appears with each new second.
- [ ] **Blink drift-free:** the next toggle is the previous due time + 500, with WO1's resync rule
  when a call is 500 ms or more late. `tick()` never returns 0.
- [ ] **Unchanged:** a clock with blink off returns `U8G2GL_IDLE` from `tick()`, which is now
  correct, because the wall clock's timer supplies the per-second deadline.
- [ ] **Do not touch** WO2's baseline code or the public signatures. Private members may change.

### E. Spec (`docs/design_spec.md`)

- [ ] **§11.1:** add timers to the LVGL comparison table (the `lv_timer_create` row →
  `u8g2gl_timer_init`, caller-owned). In the "deliberate divergences" list, add: host-owned storage
  with no heap; due-time scheduling (LVGL's drifts); the subset of calls. Then add a short
  subsection on timers and the wall clock: a timer whose callback writes a subject is how
  time-dependent data stays fresh. The library supplies the mechanism and the generic wall-clock
  helper; concrete sources belong to the host (for example foundation's NTP and system-information
  sources).
- [ ] **The clock's section:** describe binding to a wall-clock subject, the unknown-time display,
  and the blink lock.
- [ ] **Keep it accurate:** do not describe the resume callback or the dirty-flag fix (WO4). Quote
  every changed passage in your report.

### F. Tests

- [ ] **`test_timer.cpp`:**
  - drift-free over 1 000 periods with 0–3 ms of jitter: the run count is exact and the due times
    don't accumulate lateness;
  - the resync after a stall, with exactly one run;
  - the repeat count, after which the timer pauses;
  - pause and resume;
  - `ready`, `reset`, and `set_period`;
  - deleting itself or another timer inside a callback;
  - initialising a timer inside a callback;
  - double init;
  - the destructor unlinking;
  - wraparound;
  - the handler's deadline equals the earliest due timer, and is `U8G2GL_IDLE` with no timers.
- [ ] **`test_wall_clock.cpp`,** with a fake time function:
  - the subject is published at the boundary;
  - the deadline equals the milliseconds to the next boundary;
  - unknown, then known: `U8G2GL_TIME_UNKNOWN`, then the time;
  - no skipped or duplicated seconds over 120 simulated seconds with jitter.
- [ ] **`test_core.cpp`:**
  - `ui_handler()` returns min(timer deadline, widget deadline);
  - timers run with no active screen;
  - a timer that writes a bound subject causes a redraw in the **same** call.
- [ ] **`test_clock.cpp`:**
  - unknown time renders `--` (use the stub's recorded text);
  - the blink resets on a value change;
  - the drift-free blink;
  - `tick()` never returns 0.
- [ ] **`test_sizeof_report.cpp`:** add `u8g2gl_timer` and `u8g2gl_wall_clock`, following the file's
  existing pattern.
- [ ] **The end-to-end check that motivates all of this:** a clock bound to a wall-clock subject,
  driven only by `ui_handler()` while the "app" sleeps for the returned deadline, with blink **on**
  and with blink **off**. Each new second is drawn within 1 ms of its boundary, with no skips. On
  hardware it was 260 ms late (blink on), and never drawn if `U8G2GL_IDLE` was honoured (blink off).

## Verification Requirement

- ctest green in a **fresh** build, 0 warnings, editor target included. State the before and after
  totals.
- The CLI vitest total is unchanged (1353).
- `git status --short` clean apart from intended files.
- **Verify the branch** (`u8g2gl-05r2/wo3-timers-wall-clock`), then commit. Several logical commits
  are welcome (timer, core integration, wall clock, clock, spec). End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not push.**
- Message the PA with your results and every decision you made.

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
