---
name: device-measurements-wo1
description: Handoff instructions for Work Order 1 — rig re-point and measurement firmware (build only)
complexity: standard
---

# device-measurements / WO1 — rig and measurement firmware

## Role Definition

You are an expert senior embedded engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make high-level architectural decisions, do not branch, and do not
plan. Your task is strictly limited to executing the checklist below.

**Parent project:** `.agents/skills/principal-architect-workspace/device-measurements/PROJECT.md`
— its Status Log records the owner's approval of this decomposition. Verify it before you start
(`.agents/rules/00-operating-model.md`).

## Objective

Produce three **built, not flashed** firmware images for the ESP32-S3 Nano + SSD1322 rig, so the
PA can flash them in one sitting with the owner present:

- **Image A** — the PR-05R Criterion 1 firmware, unchanged, as a sanity check.
- **Image B1** — M2: SPI transfer time, full frame against the dirty tiles of one changed label.
- **Image B2** — M1 then M3: the real frame loop with moving content, then the blocked-loop repaint.

A number without its method is not evidence: every image must print enough on serial that the
reader can tell exactly what was measured.

## Strict Boundary Box

- **Work only in this worktree** (`/Users/mcneillm/Documents/Projects/U8G2GL-device`), and only
  under `tmp/` (git-ignored) plus your Completion Report in this file.
- **Do not edit** anything under `src/`, `include/`, `cli/`, `docs/`, tests, or any tracked file.
  No runtime or CLI change, no fix. A defect you find is a finding with a reproduction.
- **Do not touch** `../U8G2GL-05r` (PR #13's worktree) or any foundation checkout.
- **Do not write into `tmp/m4/` or `tmp/m5/`** — another worker owns them in parallel.
- **Never flash, erase or upload.** Not through the MCP, not through `pio`, not through esptool.
  The PA flashes. Do not call `upload_firmware`, `upload_filesystem`, `agent_flash_monitor_verify`,
  `erase_flash`, or acquire the device lock.
- **Never create or edit `.pio-mcp-policy.json`** or enrol any directory in an MCP policy profile.
  If a build is refused by policy, stop and report.
- **Do not commit.** The PA reviews and commits.

## Tooling Constraints

- **PlatformIO goes through the PlatformIO MCP only** (`mcp__plugin_platformio-mcp_platformio__*`:
  `build_project`, `get_project_config`, `size_report`, `check_task_status`, `query_logs`).
  **Direct `pio` / `platformio` on the command line is denied by the owner** — a previous worker
  was stopped for it. If the MCP cannot do something you need, stop and report; do not work around.
- Running this worktree's CLI (Node, under `cli/`) to *generate* a scratch project into `tmp/` is
  allowed; if it needs a build step first, its output must stay git-ignored — check
  `git status --short` afterwards and report anything it shows.
- Temporary files: `tmp/` of this worktree (`.agents/rules/02-workspace.md`).

## Context you need

- **Rig:** `tmp/device/` (`platformio.ini`, `src/main.cpp`, `capture.py`, `partitions.csv`,
  `runtime-before/`) and `tmp/fdn/` (a `git archive` of foundation's held tip `499142f8`). Copied
  from `../U8G2GL-05r/tmp/`; `main.cpp` is byte-identical. Read
  `../U8G2GL-05r/.agents/skills/principal-architect-workspace/pr-05r-runtime-fixes/CRITERION-1.md`
  ("On the device") for what image A proved and the expected values.
- **Hardware:** `arduino_nano_esp32`, SSD1322 256×64, CS 10, DC 9, SCK 48, MOSI 38, no reset,
  `SPI.begin(48, 47, 38, -1)`, constructor `U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI(U8G2_R0, 10, 9,
  U8X8_PIN_NONE)`. Board options: copy the `[device]` section of `tmp/device/platformio.ini`.
- **Runtime under test:** this worktree, runtime 0.8.0 (`include/u8g2gl/u8g2gl_version.h`).
- **APIs:** `ui_handler()` / `tick()` and the [D-15] deadline contract (`docs/design_spec.md`
  §11.1 and the paragraph at "`tick()` returns its own next deadline"); `u8g2gl_repaint_object()`
  (`include/u8g2gl/u8g2gl_core.h:319`, spec [D-5] and §11's state-saver paragraph); tile
  conversion for `updateDisplayArea()` (`include/u8g2gl/u8g2gl_helpers.h`); Q-14 in spec §21.
- **Bus bytes:** U8G2 keeps a 1-bit 2048-byte buffer but the SSD1322 is 4 bpp, so its driver
  expands on the way out. Read `extern/u8g2/csrc/u8x8_d_ssd1322.c` and state the bytes that
  actually go on the wire for a full frame and for one tile row/column, and the bus clock U8G2
  configures for this display (`u8x8_display_info_t` `sck_clk_hz`). Print the clock at runtime too.

## Line-Item Instructions

### Image A — unchanged sanity firmware

- [ ] `tmp/device/platformio.ini` — change **only** the two `symlink://` paths in `lib_deps`:
  `device_after` → this worktree's root; `device_before` → this worktree's
  `tmp/device/runtime-before`. Nothing else. Record the diff in your report.
- [ ] Build `device_after` through the MCP (`build_project`, `projectDir` = `tmp/device`,
  `environment: device_after`). Do not build `device_before` unless trivially cheap; it is not
  flashed this session. Record firmware path, size and sha256 of `firmware.bin`.

### Image B1 — M2, Q-14 on SPI

- [ ] New project `tmp/device-m2/` (own `platformio.ini` from the `[device]` section, one env
  `m2`, `lib_deps` symlink to this worktree + `olikraus/U8g2@2.36.18`, same generated-project
  source filter and config macro as image A).
- [ ] `tmp/device-m2/src/main.cpp`: draw foundation's `diagnostics` screen with the `connected`
  rows exactly as image A does (plain user, `begin()` only). Print its buffer `lit` and sha256 as
  image A does — it must equal `lit=1405` / `b9042618…f62d`, which proves M2 timed the same frame.
- [ ] Choose the **uptime row** (row 3) as "the one label that changes". Take its bounds from the
  generated object (the `ui_obj_*` for that row) and convert them to tiles with the runtime's
  helper in `u8g2gl_helpers.h`, so the rectangle is the one Q-14's implementation would send. An
  in-place text change has the same previous bounds, so the union is the label's own bounds; say so.
- [ ] Time with `esp_timer_get_time()` (µs), 5 warm-up + 200 timed repetitions each, nothing
  printed inside a timed loop:
  - **T_full:** `sendBuffer()`.
  - **T_tiles:** `updateDisplayArea(tx, ty, tw, th)` for the uptime tile rectangle.
  - **T_render:** `clearBuffer()` + the screen's render (no send), for context: what share of a
    frame the transfer is.
  - **T_change:** set the uptime subject to a different string, then render + `updateDisplayArea`
    of the tile rectangle — the realistic one-label-changes frame.
- [ ] Report per measurement: n, min, median, p95, max (µs), plus the bus clock, the tile
  rectangle (tx, ty, tw, th) and its pixel bounds, and computed wire bytes for full and partial.
- [ ] Serial protocol, 115200, USB CDC on boot. Lines tagged `U8G2GL-M2 `, `key=value` pairs.
  Run the measurement once after boot, then **reprint the full summary every 5 s** so a capture
  started late still gets it. End each summary with `U8G2GL-M2 end`.

### Image B2 — M1 then M3

- [ ] Scratch U8G2GL project `tmp/device-m1/ui/` (XML) authored for the 256×64 panel with, at
  minimum: **one scrolling label** (text wider than its box, scroll enabled — read
  `include/u8g2gl/manifests/u8g2gl_label.xml`), **one clock widget** bound to a time subject (read
  `u8g2gl_clock.h` and its manifest; enable the blink/colon behaviour if it has one), and one
  static label. Generate it with **this worktree's CLI**. Record the exact CLI command, the CLI
  version it prints, and the generated files' header stamps. If authoring needs anything the
  schema does not offer, use the closest thing and say so; do not change the CLI.
- [ ] Project `tmp/device-m1/` (env `m1`, same board section, symlink to this worktree), firmware
  in `tmp/device-m1/src/main.cpp`, **using the real `ui_handler()`** — do not re-implement the
  frame sequence.
- [ ] **M1 phase U (uncapped), 20 s:** call `ui_handler()` back-to-back. Per call, record the
  returned deadline and whether the buffer changed (hash or byte-compare against the previous
  buffer after the call returns — the buffer survives `sendBuffer()`). Report calls/s,
  changed-frames/s (the achieved frame rate), the µs per call with and without a send, and the
  histogram of returned deadlines.
- [ ] **M1 phase D (deadline-driven), 20 s:** `d = ui_handler(); delay(d)` (cap `d` at 1000 ms and
  report how often the cap bit). For each changed frame record when it was due by the previous
  call's returned deadline and when the change actually appeared. Report: late (> 1 ms past
  promise), early/wasted (a send with no buffer change, i.e. woken for nothing), and whether any
  scroll step or clock second was **skipped** (content jumped more than one step). The question is
  whether [D-15]'s deadlines are honoured in practice or quietly ignored — answer it with counts.
- [ ] **M3 phase (blocked loop), 10 s:** before entering, set a deliberately non-framework
  application state: a different U8G2 font, `setFontPosBaseline()`, `setFontRefHeightText()`,
  `setFontMode(0)`, `setDrawColor(1)`. Snapshot the state from U8G2's state struct (the same fields
  `u8g2gl_state_saver.h` captures). Then busy-wait (no `ui_handler()`, no `delay()` yielding to
  the loop) and every 500 ms update the clock's time subject and call
  `u8g2gl_repaint_object(display, <clock object>)`. After **each** call: record its return value,
  compare the state snapshot field by field, and compare the buffer **outside** the clock's bounds
  with a copy taken before the call (it must be unchanged — the repaint is clipped to the widget).
  Report counts of repaints, true returns, state mismatches (by field) and out-of-bounds buffer
  changes. Print `U8G2GL-M3 watch` at entry and exit, with the object's pixel bounds, so the owner
  knows when and where to look on the panel.
- [ ] After M3, resume `ui_handler()` and confirm the next frame renders (buffer changes; report).
- [ ] Serial: lines tagged `U8G2GL-M1 ` and `U8G2GL-M3 `, `key=value`; after the run, reprint both
  summaries every 5 s, each ending `... end`. Print a one-line `U8G2GL-M1 phase=<U|D> start` banner
  at each phase start so the owner can watch the panel at the right time.

### Capture plan

- [ ] Write `tmp/device-m1/../CAPTURE.md` (i.e. `tmp/CAPTURE.md`) giving, per image (A, B1, B2):
  the firmware path and sha256, the expected first serial line, how long to capture with
  `tmp/device/capture.py <port> <secs> <out>` (it uses PlatformIO's own Python env — say which
  interpreter path), and what the owner should watch for on the panel and when.

## Verification Requirement

- Every image builds cleanly through the MCP. Report warnings from **your** `main.cpp` files (there
  should be none) separately from library warnings.
- Re-read each serial protocol against this checklist: every reported number states its units and
  its n.
- `git status --short` in this worktree must be empty (everything under `tmp/`).
- Before finishing, **stop and message the PA** with the image paths and hashes; do not wait for
  the owner — the PA relays.

## Issue Surfacing

If you discover a defect, upstream bug, or concern outside your boundary box (for example, the
clock widget's deadline is wrong on paper before you even flash), surface it in your Completion
Report with a reproduction. Do not file issues and do not fix it.

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
