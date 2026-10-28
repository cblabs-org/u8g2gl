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

- **Work in** `.`, only under `tmp/` (git-ignored),
  plus your Completion Report. **No tracked file changes:** no runtime, CLI, test or spec edits. A
  defect is a finding with a reproduction.
- **Never flash, upload or erase.** Never touch the serial port. **Never create or edit
  `.pio-mcp-policy.json`,** and never enrol a directory.
- **Copy from, never edit:** `tmp/` (`device/`,
  `device-m1/`, `device-m1c/`, `fdn/`, `CAPTURE.md`). Copy what you need into `tmp/` of this worktree,
  **without** any `.pio`, `.pio-mcp-policy.json` or `.pio-mcp-workspace`.
- **Do not commit.** The PA commits.

## Tooling Constraints

- **Direct `pio` for compiling is permitted** (the owner switched the PlatformIO MCP off and
  approved direct `pio`; see the device-measurements PROJECT.md, branch
  `u8g2gl-device/measurements`). Use `~/.platformio/penv/bin/pio run -d <project> -e <env>`:
  **compile only**.
- Point every rig's `lib_deps` at **this worktree** (`symlink://.`).
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
complete (both images build; nothing flashed, no tracked file changed)

### Changes Made
All under `tmp/` (git-ignored); `git status --short` is empty.
- `tmp/device-a/` (copy of `device-m` rig `tmp/device/`, no `.pio`/logs/runtime-before) and `tmp/fdn/`.
  `src/main.cpp` is byte-identical (`cmp`). Only `device_after`'s `lib_deps` symlink now points at this worktree.
  Firmware `tmp/device-a/.pio/build/device_after/firmware.bin`, 356912 bytes,
  sha256 `bb810f6cc07d5d16939b9cab968690ab2885b07b7cd6fc241d5aea98f2536a56`.
  (The expected `b9042618...` is the frame hash the firmware prints, not the image hash.) Log `tmp/build-a.log`.
- `tmp/device-v/` (from `device-m1`): new `src/main.cpp`, env `v`, symlink to this worktree; screen XML
  unchanged except the caption text. UI regenerated with this worktree's CLI:
  `cd tmp/device-v && node ../../cli/dist/node/cli.js generate ui --target ssd1322` (after `cd cli && npm run build`).
  Header stamps: `schema: 0.4`, `generator: 0.13.0`, `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 9)`.
  Firmware `tmp/device-v/.pio/build/v/firmware.bin`, 360368 bytes,
  sha256 `2871ef262665b5fc36fbce5f3d5c986325dd21888b5206e4fc3adffc53cb8134`. Logs `tmp/build-v.log`, `tmp/gen-v.log`.
- Both build logs: `|-- u8g2gl @ 0.9.0`. Only warning is the framework's `io_pin_remap.cpp` `#warning`; none from `main.cpp`.
- `tmp/CAPTURE-5R2.md`: capture plan, what to watch, thresholds.

### Decisions Made
- Image V pre-phases: UI and wall clock come up first, then Serial (up to 3 s, UI pumped meanwhile), so the
  5 s unknown window is not eaten by the serial wait; a boot pump runs to 6.5 s so the first known second has landed
  before D1. Boot-pump redundant sends are reported separately (`boot_pump`).
- Second latency is read from the subject after each `ui_handler()` call: the call in which the subject takes a
  new value; latency = end of that call minus `(sec - kBaseEpoch) * 1e6` us on the esp_timer axis (includes frame
  time). The first second of each run is a baseline, not a sample. `second_changes_without_buffer_change`
  checks that the changing call also changed the buffer.
- Scroll rate = (steps - 1) / (last step - first step) from `scroll_x_` after each call (private-as-public, in
  `main.cpp` only). Limitation (also in the serial method line): logical offset at call end, not panel pixels.
- Cap hits exclude U8G2GL_IDLE returns; those are counted as `idle_returns`.
- Time-unknown path: the wall clock retries every 1000 ms when unknown, so the first known second may appear up to
  ~1 s after 5 s; expect the panel to leave `--:--:--` between 5 and 6 s.

### Dead Ends & Warnings
- None blocking. The PA should be aware phase U starts after ~56 s of steady state, so the "33 redundant sends in
  the first second" will only reappear if they are tied to the start of an uncapped loop; the boot-pump count
  covers the real first seconds.
- `device_before` env is left in `device-a/platformio.ini` untouched and points at a `runtime-before` directory
  that is not copied; I built with `-e device_after` only.

### Out-of-Scope Findings
- None.

### Blockers
(none)
