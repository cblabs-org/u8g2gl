# Project: PR-5R2 — animation timing, the clock, and timers

★ Interim remediation from the on-device measurement session (branch
`u8g2gl-device/measurements`, `EVIDENCE.md`), before PR-06 records snapshot goldens.

## Why before PR-06

PR-06 builds the snapshot harness and records golden images. A clock whose seconds sit 2 px low
would become the reference; the spec's own example of what snapshots must catch is "a rendering
regression in `u8g2gl_clock`'s dual-font alignment". PR-06's animation tests will also depend on
how deadlines behave, which WO1, WO3 and WO4 change.

## Base and branches

- **Base:** `origin/main` @ `99ac4a3` (PR #13, PR-05R, merged with a merge commit).
- **Worktree:** `../U8G2GL-05r2`. **Stack:** `u8g2gl-05r2/wo1-…` → `wo6-…`; the top is the PR head.
- Runtime at base: **0.8.0**, CLI 0.12.0, schema 0.4.

## Findings addressed (evidence: `u8g2gl-device/measurements`, `.agents/skills/principal-architect-workspace/device-measurements/EVIDENCE.md`)

- **D-A** — label scroll runs ~4% slow (37.9 px/s against 40) and a deadline-sleeping loop wakes
  with nothing to do (4 343 idle wakes in 20 s): `u8g2gl_label.cpp:218` steps only when
  `now > due`, `:263`/`:278` reschedule from `now`, `:284` returns 0 when `now == due`.
- **D-B** — clock seconds sit 2 px below HH:MM: `u8g2gl_clock.cpp:228-232` aligns descender
  boxes, not baselines.
- **Q-C (ruled)** — time-dependent content must update without app logic, and a binding update must
  end the loop's sleep.
- Bug found in planning: `ui_handler()` clears `dirty` **after** rendering, so a subject written
  during a render is lost.

## Design (agreed with the owner, 2026-10-13/14)

- **Timers, LVGL-shaped** ([D-15] already copies `lv_timer_handler`'s contract; spec principle 1).
  Verified against LVGL 9.5.0 source: LVGL has no data-source or wall-clock concept — the idiom is a
  timer whose callback sets a subject. U8G2GL adopts `lv_timer`'s API shape, reimplemented:
  - **Host-owned storage, no pool, no heap.** A fixed pool is justified only where the generator
    counts the objects from XML; timers are created by host code it never sees. The host declares
    each `u8g2gl_timer` (static or member); U8G2GL links them intrusively. LVGL's own convention:
    `_init` for caller-owned storage (`lv_subject_init_int`, `lv_style_init`). Precedents: FreeRTOS
    `xTimerCreateStatic`, Zephyr `k_timer`. The destructor unschedules (RAII).
  - **Scheduled from the due time,** not from when the callback ran. LVGL sets
    `last_run = lv_tick_get()` and drifts; this is D-A's flaw and is not copied.
  - **API subset (principle 6):** init, delete, pause, resume, set_period, ready, reset,
    set_repeat_count, get_user_data, and a resume callback. Omitted (heap/OS artefacts): auto-delete,
    external data, global enable, idle statistics, list walking.
  - **Resume callback** mirrors `lv_timer_handler_set_resume_cb`: fired when the frame becomes dirty
    or a timer gains work, so a sleeping loop is woken by a binding update (LVGL: subject → widget →
    `LV_EVENT_REFR_REQUEST` → refresh timer resumed → resume callback).
- **Wall clock = a timer + a time subject.** A library helper (host-declared object containing its
  timer) realigns its period to the next second boundary and writes a time subject from the host's
  time function. The clock binds to the subject as today; its own `tick()` handles only the colon
  blink, phase-locked to changes in the bound value. **Unknown time shows `--:--`.**
- **Boundary U8G2GL / foundation:** the timer mechanism and the generic wall-clock helper live in
  U8G2GL (it must stay standalone; its own clock must work without foundation). Concrete sources
  (NTP time, system info, event bridges) are foundation's, in its cut-over work (held, R10) — out of
  scope here.
- **Widgets keep `tick()` deadlines** (U8G2GL's design); not converted to timers. Recorded as a
  known difference from LVGL.
- **No schema change.** Runtime 0.8.0 → **0.9.0** (new API). CLI bumped only if generated output
  changes.

## Work-Order ledger

- **[x] [wo1-scroll-timing](wo1-scroll-timing/WORKORDER.md):** `5b7d8d9`. D-A. Label steps scheduled from the due
  time, exact rate, no zero deadlines, no bursts after a stall; the 33 redundant sends explained.
  `standard`.
- **[x] [wo2-clock-baseline](wo2-clock-baseline/WORKORDER.md):** `75d801f`. D-B. Seconds aligned by baseline; pixel test against real U8G2.
  `standard`.
- **[x] [wo3-timers-wall-clock](wo3-timers-wall-clock/WORKORDER.md):** `ca442c9`…`189ab4b`. `u8g2gl_timer` (host-owned, intrusive, due-time scheduling, guards),
  `ui_handler()` merges timer and widget deadlines, the wall-clock helper, clock blink phase-locked,
  `--:--`, spec §11.1 LVGL table. `architect`.
- **[x] [wo4-dirty-and-resume](wo4-dirty-and-resume/WORKORDER.md):** `cf39c3e`…`656a30b`. the dirty-flag bug, the resume callback, the threading contract in
  §11.1. `standard`.
- **[x] [wo5-release](wo5-release/WORKORDER.md):** `90d9ef8`. runtime 0.9.0, CLI runtime floor re-stamped,
  CLI 0.13.0 (goldens move with the floor), goldens regenerated, Q-14 wording in §21. `standard`.
- **[x] [wo6-small-fixes](wo6-small-fixes/WORKORDER.md):** `e01b85a`, `8c39d2b`. the two out-of-scope findings, owner-approved:
  a resized label re-measures its layout; subjects cannot be copied. `standard`.
- **[x] [wo7-readability](wo7-readability/WORKORDER.md):** `a163bf7` + PA comment fix. house standards pass over the whole PR, then remediation. `standard`.
- **[x] [wo8-device](wo8-device/WORKORDER.md):** PASS on hardware, 2026-10-14. worker builds the rig firmware against the final tip (the clock driven by
  `u8g2gl_wall_clock`, no app-fed seconds); the PA flashes with the owner watching. Pass: 40.0 px/s,
  no idle wakes, seconds within a frame of the boundary, baselines aligned; the 33 redundant sends
  re-checked. `interactive`.

*Reordered 2026-10-14 by the PA within the approved scope: readability before the device check, so
the owner watches the final code.*

Stacked and serial: WO2 and WO3 both touch `u8g2gl_clock.cpp`; WO3 and WO4 both touch
`u8g2gl_core.cpp`.

## Out of scope

Schema changes; PR-06 work (the frozen positive control stays there); anything in foundation;
converting widgets to timers.

## Status Log

- **2026-10-13** — Plan presented (six WOs). Owner asked how WO3 generalises; design iterated:
  self-refreshing data source → LVGL timer + subject (LVGL 9.5.0 source read) → host-owned timer
  storage after the owner's challenge: "I think th have a fixed pool model we really need a
  deterministic set of timers we compile to."
- **2026-10-14** — **Owner, verbatim: "Approve the plan."** **Owner, verbatim: "--:-- for unknown
  time is fine".** **Owner, verbatim: "Approve your recommendationon the subset of functions from
  LVGL."** (keep init, delete, pause, resume, set_period, ready, reset, set_repeat_count,
  get_user_data, resume callback; omit auto-delete, external data, global enable, idle statistics,
  list walking). Worktree `../U8G2GL-05r2` created on `u8g2gl-05r2/wo1-scroll-timing` @
  `99ac4a3`. WO1 dispatched.
- **2026-10-14 — WO1 verified** (`5b7d8d9`). PA re-ran in a fresh build dir: ctest **426/426**
  (1 skip, `SizeOfReport.ThirtyTwoBitTarget`), 0 warnings; was 415. Diff read: due-time
  scheduling, exact rate with carried remainder (`step_rem_` is `uint8_t`, safe: speed is `uint8_t`
  and the remainder < speed), one step and resync when ≥ 1 interval late, `schedule()` the single
  exit (≥ 1), `timing_started_` replaces the 0 sentinel, uint32 wrap by difference arithmetic. Two
  existing expectations corrected (interval + 1 → due-based), none weakened. Spec line 1208 updated.
  - **PA rulings:** dwell measured from now (what the viewer sees) — accepted. Clock drift → WO3.
  - **The 33 redundant sends are not the label's scheduling** (host repro: 1 send through the
    initial delay). → WO5's device run, with a log of why each frame was marked dirty.
  - **Out-of-scope finding, put to the owner:** `set_coords()` / `set_w()` do not mark a label's
    layout stale, so `needs_scroll_` / `message_width_` go stale after a resize (repro: 60 px label,
    60 px text, render, `set_coords(0,0,50,16)` → never scrolls). PA recommends folding into WO2.
- **2026-10-14 — WO2 dispatched** on `u8g2gl-05r2/wo2-clock-baseline` (from WO1's tip).
- **2026-10-14 — WO2 verified** (`75d801f`). PA fresh build: ctest **429/429** (1 skip), 0
  warnings. Fix: `sec_draw_y = draw_y + (main_ascent − sec_ascent)`. New real-U8G2 pixel test
  (`test/test_clock_baseline.cpp`, ARDUINO-built U8G2 + SSD1322 driver): lowest lit row HH:MM / SS
  helvB12/helvR08 32/34 → 32/32; profont22/6x10 39/41 → 39/39; helvB18/helvR10 39/41 → 39/39.
  Control: old formula fails all three. HH:MM-only and no-secondary frames byte-identical
  before/after. No spec text described descender alignment, so no spec edit. Worker's commit trailer
  names Sonnet 5.5, the model that wrote it — kept.
- **2026-10-14 — WO3 dispatched** on `u8g2gl-05r2/wo3-timers-wall-clock`. The label-resize finding
  is still with the owner (not in WO3).
- **2026-10-14 — WO3 verified** (`ca442c9` timer + `ui_handler()`, `41d045b` wall clock +
  `U8G2GL_TIME_UNKNOWN`, `826c10f` clock, `e028312` spec, `189ab4b` report). PA fresh build: ctest
  **481/481** (1 skip), 0 warnings; no allocation in the new files. Handler read: reschedules from
  the due time before the callback (the callback's own reset/ready/set_period wins), restarts from
  the head when a callback changes the list, run-once flags prevent a double run, a `s_running`
  pointer guards a self-deleted timer. `ui_handler()` runs timers first, min()s with widget
  deadlines, keeps the elapsed correction (factored into one helper), and runs timers with no
  screen. End-to-end: a clock bound to a wall-clock subject, app sleeping exactly the returned
  deadline, draws every second within ≤ 1 ms of its boundary, blink on and off, over 125 s; the
  assertion was mutation-tested. Sizes (64-bit host): timer 40 B, wall clock 56 B.
  - **PA rulings:** the edit to `test/test_ambient_state.cpp` (outside the WO's list) accepted: the
    blink lock removed the free-running toggle it relied on; the assertion is unchanged. Spec gaps
    (§8.1 time subject, §11.3 blink lock) → WO4. Generator emitting a wall clock: not needed now
    (a generated `<time>` subject works with `u8g2gl_wall_clock_init`); a possible later item.
- **2026-10-14 — WO4 dispatched** on `u8g2gl-05r2/wo4-dirty-and-resume`.
- **2026-10-14 — WO4 verified** (`cf39c3e` core, `f05b753` spec, `656a30b` report). PA fresh build:
  ctest **495/495** (1 skip), 0 warnings. One helper (`mark_screen_dirty`) is the only clean→dirty
  site and fires the resume callback on the transition only; an RAII scope silences it inside
  `ui_handler()`; dirty cleared before drawing, 0 returned if dirtied during the draw. Bug
  reproduced against the old code first (change never drawn; 500 returned instead of 0).
  - **PA rulings:** suppression also covering timer-call firings inside `ui_handler()` — accepted
    (consistent). `u8g2gl_resume_notify()` public-but-internal in `u8g2gl_core.h` — accepted for
    now; WO6 to judge.
  - **Second out-of-scope finding, put to the owner with the label-resize one:** the
    `u8g2gl_subject_*_n` types are copyable, and a copy shares the source's observer storage
    (silently breaks the subject). Suggested fix: `= delete` the copy operations.
- **2026-10-14 — WO5 dispatched** on `u8g2gl-05r2/wo5-release`.
- **2026-10-14 — WO5 verified** (`90d9ef8`). PA fresh build: ctest **495/495** (1 skip), 0 warnings;
  CLI vitest **1353/1353** (run after ctest, not alongside); `cli.js --version` → 0.13.0. Runtime
  0.9.0 in `u8g2gl_version.h`, `CMakeLists.txt`, `library.json`; `runtime-version.json` re-stamped.
  Golden diff is the floor only (`(0, 8)` → `(0, 9)` and its `#error` text) in the two
  `u8g2gl_generated_config.h` goldens; editor outputs unchanged. §21 Q-14 marked "SPI half
  answered … I²C open", row left open. Schema 0.4 unchanged; nothing tagged or published.
- **Holding before WO6** for the owner's answer on the two out-of-scope fixes (label resize layout;
  non-copyable subjects), so readability runs once over the final code.
- **2026-10-14 — Owner, verbatim: "yes - fix the bugs please"** — both out-of-scope findings join
  the PR as WO6 (label resize re-layout; non-copyable subjects). Readability becomes WO7, the
  device check WO8. WO6 dispatched on `u8g2gl-05r2/wo6-small-fixes`.
- **2026-10-14 — WO6 verified** (`e01b85a` fixes, `8c39d2b` stronger test). Protected virtual
  `on_size_changed()` on `u8g2gl_obj`, called by `set_coords`/`set_w`/`set_h` only on a real size
  change (bindings go through them); the label re-measures and resets its scroll. All 8 subject
  types `= delete` copy and move; nothing needed changing. PA ran the control the worker skipped:
  against the pre-fix sources the widening test first **passed** (did not detect the bug) — sent
  back; after `8c39d2b` the narrowing, widening and bound-width tests all fail on the old code and
  pass on the new (the move and dirty tests pass on both, correctly). Fresh build: ctest
  **501/501** (1 skip), 0 warnings.
- **2026-10-14 — WO7 started:** readability-reviewer audit of `99ac4a3..HEAD`, then remediation.
- **2026-10-14 — WO7 audit received** ([AUDIT.md](wo7-readability/AUDIT.md)): P1 0, P2 1 (stale
  "Step 5" comment), P3 5 items (work-order tags on new lines; `ui_handler()` Doxygen missing the
  timer-callback rule and the 0 return; stale Purpose blocks), P4 3. New timer and wall-clock
  modules called exemplary; no allocation. **PA decision:** `u8g2gl_resume_notify()` moves to a new
  private `src/u8g2gl_internal.h` now — cheap before 0.9 ships, a breaking change after. All items
  incl. P4 dispatched to a remediation worker.
- **2026-10-14 — WO7 verified** (`a163bf7`). PA fresh build: ctest **501/501** (1 skip), 0 warnings.
  Non-comment diff is only the `u8g2gl_resume_notify()` move: removed from `u8g2gl_core.h`, new
  private `src/u8g2gl_internal.h` (include guard + declaration), two quoted includes. All AUDIT items
  ticked. The one leftover unpublished tag the worker flagged (`test_label.cpp:1117`, "D-A") fixed
  by the PA as a comment-only edit; that test re-run and passing.
- **2026-10-14 — WO8 dispatched** (build-only device firmware; the PA flashes with the owner).
- **2026-10-14 — WO8 on hardware: PASS.** Flashed through the **PlatformIO MCP** end to end (the
  first time in the programme: `acquire_lock` → `upload_firmware` → `capture_serial_window` →
  `release_lock`), on the owner-provided board (`303A:1001`, SER `80:65:99:A1:8E:90`, now
  `/dev/cu.usbmodem1101`). Before flashing, a stale monitor from another session (Gemini MCP, project
  `Echenon-hr-relay`, idle 17 h) held the port; the owner freed it. Logs: `wo8-device/logs/`.
  - **F1 (image A′, `bb810f6c…6a56`):** `runtime=0.9.0 lit=1405 sha256=b9042618…f62d`, stable — the
    Criterion 1 frame is unchanged by PR-5R2.
  - **F2 (image V, `2871ef26…8134`), owner watching — "clock is good now":**
    | | D1 blink on, 30 s | D2 blink off, 20 s | U uncapped, 10 s | before PR-5R2 |
    |---|---|---|---|---|
    | scroll | 40.01 px/s | 40.01 px/s | 40.01 px/s | 37.9 |
    | idle wakes | 0 | 0 | n/a | 4 343 / 20 s |
    | cap hits | 0 | 0 | n/a | — |
    | second latency (median / max) | 15.5 / 15.6 ms | 15.1 / 15.6 ms | — | 260 ms (blink on); never drawn if IDLE honoured (blink off) |
    | skipped seconds | 0 | 0 | 0 | — |
    | redundant sends | 33 | 33 | 0 | 33 |
    Second latency ≈ one frame (render + 11.8 ms SPI send ≈ 13.5 ms), i.e. the second is drawn in
    the first frame after its boundary. **Zero deadlines** (120 / 40 / 80) all led to work — idle
    wakes are 0 — so they are frames overrunning the next due time, the elapsed-correction's
    intended 0, not the old spin.
  - **The 33 redundant sends — cause identified from the data:** exactly 33 in each phase with one
    circular-scroll wrap (D1, D2) and 0 in the phase with none (U), independent of phase length. The
    `scroll_circular` label keeps stepping (and marking dirty) through its blank 30 px gap plus the
    off-screen run-in, where nothing visible changes. Harmless (a re-send of identical pixels); a
    possible optimisation: skip `mark_dirty()` while the text is entirely outside the clip. **Not in
    this PR** — recorded as a finding.
- **2026-10-14 — Owner, verbatim: "Yes push the stack and PR - let's move on and close out this
  one".** PR opened from `u8g2gl-05r2/wo8-device` (description: [PR-DESCRIPTION.md](PR-DESCRIPTION.md)).
- **2026-10-14 — Closed out by the PA.** CA bridge written:
  [CA-BRIDGE-2026-10-14-PR5R2.md](CA-BRIDGE-2026-10-14-PR5R2.md) (covers the device-measurements
  session as well). Owner reviews and merges #14 manually. On merge: graduate this project in
  `memory/MEMORY.md` (Active → Recently Completed).

## Session Log

### 2026-10-14 — Project wrap-up
- **Outcome:** animation keeps time on hardware — scroll 40.01 px/s, 0 idle wakes, each second drawn
  one frame after its boundary with blink on or off, baselines aligned. Q-C delivered as an
  LVGL-shaped timer with host-owned storage plus a wall-clock helper and a resume callback; the
  dirty-ordering bug and two smaller defects fixed. Runtime 0.9.0, CLI 0.13.0, schema 0.4.
- **Design lessons:** (1) copy LVGL's *API*, not its scheduling — its timers drift exactly as D-A
  did. (2) A fixed pool is only justified where the generator can count the objects; host-created
  objects need host-owned storage. (3) "A self-refreshing data source" is just a timer writing a
  subject — the owner's framing led straight to LVGL's own idiom.
- **Process lessons:** run every bug-catching test against the pre-fix code (the PA's control caught
  a widening test that could not fail). Readability before the device check, so the owner watches
  final code. The PlatformIO MCP now flashes end to end; a stale monitor from another session can
  hold the port.
- **Open:** circular-scroll redundant sends (an optimisation); widget ticks as timers; foundation's
  concrete sources (its cut-over).
