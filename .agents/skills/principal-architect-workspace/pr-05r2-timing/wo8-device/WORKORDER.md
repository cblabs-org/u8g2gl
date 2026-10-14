---
name: pr-05r2-wo8
description: Handoff instructions for Work Order 8 — device verification firmware for PR-5R2 (build only; the PA flashes with the owner)
complexity: standard
---

# PR-5R2 / WO8 — device verification firmware (build only)

## Role Definition

You are an expert senior embedded engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make architectural decisions, do not branch, and do not plan.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md`. The
Status Log records the owner's approval. The **flashing is the PA's job**, done with the owner
present: you build only.

## Objective

Build **two firmware images**, against this PR's final runtime (0.9.0), that show on real hardware
what PR-5R2 fixed. Each prints evidence a reader who was not in the room can trust: the method, its
units and n.

- **Image A′ (Criterion 1 regression).** PR-05R's Criterion 1 firmware, unchanged, linked against
  this tip. Expected: `lit=1405`, sha256
  `b9042618dac87853d16f56f103b19352b3683428b15a9699b303583878d0f62d`. The diagnostics screen has no
  clock or scroll, so nothing in this PR should move it.
- **Image V (verification).** The device-measurement session's B2 screen (ticker, clock, caption),
  now driven the PR-5R2 way:
  - **the clock bound to a time subject that a `u8g2gl_wall_clock` keeps current**, with no app code
    writing seconds;
  - the app loop is `d = ui_handler(display); delay(d)`. Cap `d` at 1000 ms only as a safety net,
    and report how often the cap was hit; it should be zero while the ticker scrolls;
  - the host time function returns **unknown for the first 5 s after boot** (to show `--:--` on the
    panel), then a fixed base epoch plus `esp_timer` time.

## Strict Boundary Box

- **Work in** `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, only under `tmp/` (git-ignored),
  plus your Completion Report. **No tracked file changes:** no runtime, CLI, test or spec edits. A
  defect is a finding with a reproduction.
- **Never flash, upload or erase.** Never touch the serial port. **Never create or edit
  `.pio-mcp-policy.json`,** and never enrol a directory.
- **Copy from, never edit:** `/Users/mcneillm/Documents/Projects/U8G2GL-device/tmp/` (`device/`,
  `device-m1/`, `device-m1c/`, `fdn/`, `CAPTURE.md`). Copy what you need into `tmp/` of this worktree,
  **without** any `.pio`, `.pio-mcp-policy.json` or `.pio-mcp-workspace`.
- **Do not commit.** The PA commits.

## Tooling Constraints

- **Direct `pio` for compiling is permitted** (the owner switched the PlatformIO MCP off and
  approved direct `pio`; see the device-measurements PROJECT.md, branch
  `u8g2gl-device/measurements`). Use `~/.platformio/penv/bin/pio run -d <project> -e <env>`:
  **compile only**.
- Point every rig's `lib_deps` at **this worktree** (`symlink:///Users/mcneillm/Documents/Projects/U8G2GL-05r2`).
  The build log's dependency graph must show `u8g2gl @ 0.9.0`; quote it.
- Regenerate image V's scratch UI with **this worktree's CLI** (0.13.0):
  `cd cli && npm run build`, then `node cli/dist/node/cli.js generate ui --target ssd1322` in the rig.
  Record the command and the header stamps (generator 0.13.0, runtime floor 0.9).

## Line-Item Instructions

### Image A′

- [ ] **Copy** the device-measurement rig's `tmp/device/` (as `tmp/device-a/`) and `tmp/fdn/` into
  this worktree's `tmp/`. Change only the `device_after` `lib_deps` symlink. Keep `main.cpp`
  **byte-identical** (check with `cmp`).
- [ ] **Build** `device_after`. Record the `firmware.bin` path, size and sha256.

### Image V (`tmp/device-v/`)

- [ ] **Screen:** start from `device-m1`'s `ui/screens/screen_measure.xml` (ticker 40 px/s, clock
  helvB12 + helvR08 `hh_mm_ss` blink on, caption). Declare the clock's time subject as the project
  already does, and keep `bind_time`.
- [ ] **Firmware:**
  - **Wiring:** `u8g2gl_set_tick_cb(millis)`. `u8g2gl_wall_clock_init(&wc, &ui_subject_clock_time, time_fn)`,
    with `wc` static. `time_fn` returns false for 5 s after boot, then `kBaseEpoch + esp_timer/1e6`
    and the milliseconds into the second.
  - **Phase D1, 30 s, blink on.** Measure:
    - scroll steps per second, from the label's offset as B2 did (the `#define private public`
      read is acceptable, and its limitation must be documented);
    - wakes with nothing to do: calls that neither sent nor changed the buffer;
    - the deadline histogram, especially any 0s;
    - cap hits;
    - the latency of each second, from its boundary to the end of the `ui_handler()` call that drew
      it (as B3 did), giving n, min, median, p95 and max;
    - skipped seconds;
    - redundant sends: a send with no buffer change.
  - **Phase D2, 20 s, blink off** (`set_blink(false)`): the same second-latency figures. The clock
    has no deadline of its own now; the wall clock's timer drives it.
  - **Phase U, 10 s, uncapped `ui_handler()` loop:** redundant sends, which the earlier session saw
    33 of in its first second. Report the count and when they occurred.
- [ ] **Serial protocol:** tagged `U8G2GL-V `, `key=value`. Print a banner at boot and at each phase
  start; the boot banner says "panel should show --:-- for 5 s". After the run, reprint the summary
  every 5 s, ending `U8G2GL-V end`.
- [ ] **`tmp/CAPTURE-5R2.md`:** per image, the firmware path and sha256, the capture command
  (`~/.platformio/penv/bin/python tmp/device-a/capture.py <port> <secs> <out>`), its length, and
  **what the owner should watch on the panel, and when**:
  - `--:--:--` for 5 s;
  - then the seconds ticking exactly with the colon;
  - the seconds' baseline level with HH:MM;
  - the ticker smooth.
- [ ] **Pass thresholds for the PA:**
  - scroll 40.0 ± 0.2 px/s;
  - no 0 deadlines while nothing is due;
  - idle wakes ≈ 0;
  - second latency ≤ one frame time (about 14 ms) with blink on and off;
  - 0 skipped seconds;
  - 0 cap hits while scrolling.

## Verification Requirement

- Both images build. Report warnings from your own `main.cpp`: there should be none.
- `git status --short` in the worktree is empty (everything under `tmp/`).
- Message the PA with the image paths, sizes and sha256s, the dependency-graph line, the serial
  protocol, and the capture lengths.

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
