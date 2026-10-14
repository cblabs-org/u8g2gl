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

### Status
complete (all three images built, none flashed, none run on hardware; every number below is a
build fact or a computation from the driver source, not a measurement)

Provenance checked first: `PROJECT.md` Status Log, 2026-10-12, records the owner's verbatim
"approve" of the decomposition; the 2026-10-13 entry (direct `pio` for compiling and flashing,
PA flashes) is in the working tree and was relayed by the PA.

### Images (all under /Users/mcneillm/Documents/Projects/U8G2GL-device/tmp/)
Flash `firmware.bin` (0x10000). The `firmware.factory.bin` beside each also embeds
`nora_recovery.ino.bin` at 0xf70000 and is not needed.

| Image | Firmware | Bytes | sha256 |
|---|---|---|---|
| A (device_after) | `device/.pio/build/device_after/firmware.bin` | 356608 | `9739f991c675e84d85724da73bbb3a7b238f29449a695257257cbb113e49d6b8` |
| B1 (m2) | `device-m2/.pio/build/m2/firmware.bin` | 357776 | `e2c4c5c29f408b8070f2c72355d18d3cbf8df9e19af0065e72e302d1fbc10f68` |
| B2 (m1) | `device-m1/.pio/build/m1/firmware.bin` | 361920 | `acb06d92c8b90d78a12a89178193c56ad58d6bce393288b587fc287c06ab9800` |

Image A was built once by me (MCP); the PA then rebuilt it in `tmp/device/` himself, so compare
against what is actually flashed. B1 and B2 were rebuilt twice and hashed identically both times.

### Build results
- A: MCP `build_project` env `device_after`, SUCCESS 13.6 s. RAM 8.3 % (27196 B), flash 8.3 %
  (349634 B). Only warning: the framework's `io_pin_remap.cpp` `#warning` (library, not mine).
  `device_before` not built (not flashed this session).
- B1: `pio run -d tmp/device-m2 -e m2` (compile only, owner-permitted), SUCCESS 13 s. RAM 8.6 %
  (28140 B), flash 8.4 % (350778 B). No warnings from `main.cpp`.
- B2: `pio run -d tmp/device-m1 -e m1`, SUCCESS 19 s (after fixing the source filter path). RAM
  9.6 % (31388 B), flash 8.5 % (354622 B). No warnings from `main.cpp`.
- Library warnings: only the `io_pin_remap.cpp` `#warning` above, in all three.
- The MCP refused B1's build with QUEUE_ENFORCEMENT_FAILED ("hardware tied up by an implicit
  session"). I did not reset server state; I used `pio run` once the owner's compile permission
  arrived. No upload, flash, erase, lock, policy file or enrolment anywhere.

### Changes Made (all git-ignored under `tmp/`; `git status --short` shows only the PA's own
uncommitted `PROJECT.md` edit, nothing of mine)
- `tmp/device/platformio.ini` - only the two `symlink://` paths: `device_after`
  `.../U8G2GL-05r` -> `.../U8G2GL-device`; `device_before`
  `.../U8G2GL-05r/tmp/device/runtime-before` -> `.../U8G2GL-device/tmp/device/runtime-before`.
- `tmp/device-m2/` (new) - `platformio.ini`, `partitions.csv`, `src/main.cpp` (image B1).
- `tmp/device-m1/` (new) - `platformio.ini`, `partitions.csv`, `src/main.cpp`, and the scratch
  UI `ui/u8g2gl.xml`, `ui/globals.xml`, `ui/screens/screen_measure.xml`, `ui/generated/*` (image B2).
- `tmp/CAPTURE.md` (new) - per-image firmware, hash, first line, capture command and panel notes.
- `cli/node_modules/` and `cli/dist/` (git-ignored): created by `npm ci && npm run build` because
  this worktree had no built CLI. `tmp/device-m1/ui/generated` came from it.
- `.pio-mcp-workspace/` directories under `tmp/device` and `tmp/device-m2` were written by the MCP
  (git-ignored).

### CLI command and stamps (B2 scratch project)
    cd tmp/device-m1 && node ../../cli/dist/node/cli.js validate ui
    node ../../cli/dist/node/cli.js generate ui --target ssd1322
CLI prints `0.12.0`. Generated headers stamp `schema: 0.4`, `generator: 0.12.0`, `target: ssd1322`;
config asserts `U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4)` and `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 8)`
(runtime here is 0.8.0). Validation: 0 errors, 0 warnings. Screen: `ticker`
(`u8g2gl_label`, `long_mode=scroll_circular`, 40 px/s, `initial_delay_ms=1000`, text far wider
than 256 px), `clock` (`u8g2gl_clock`, `hh_mm_ss`, `blink=true`, secondary font, `bind_time` to a
`<time>` subject, bounds x=4 y=18 w=160 h=20), `caption` (static label). The schema offered
everything needed; nothing was substituted.

### Serial protocols (115200, USB CDC on boot)
- **A**: unchanged: `U8G2GL-DEVICE boot env=... runtime=...`, `buffer_bytes=2048`, then
  `runtime=0.8.0 lit=<n> sha256=<hex>` + four `row<k>=` lines, repeated every 5 s.
- **B1 (`U8G2GL-M2 `)**: `boot env=m2 runtime=0.8.0`; then once after the measurement and every
  5 s: `runtime= buffer_bytes= lit= sha256=` (must be `lit=1405`, `b9042618...f62d`);
  `method clock=esp_timer_get_time unit=us warmup=5 reps=200 p95=nearest_rank blocking_spi=1`;
  `bus sck_clock_hz=` (read at runtime from `display_info`); `label=uptime obj_index=2 px_x px_y
  px_w px_h` (read from the generated object); `tiles tx ty tw th tile_count full_tile_count`;
  `wire_bytes full partial one_tile`; four lines `T_full|T_tiles|T_render|T_change n= unit=us
  min= median= p95= max=`; `end`.
- **B2 (`U8G2GL-M1 ` / `U8G2GL-M3 `)**: banners `U8G2GL-M1 phase=U start`, `phase=D start`,
  `U8G2GL-M3 watch enter bounds_x.. duration_ms=10000` and `watch exit`. Then, every 5 s after the
  run: per phase `summary` (calls, calls/s, sent, changed, changed/s, wasted sends), `call_us`
  (mean/min/max with a send and mean/max without, and a `separated=` flag for the 2000 us send
  threshold), `deadline_hist_ms` (11 buckets), `scroll` (1 px steps, wraps, jumps >1 px vs
  expected steps), `clock` (subject changes, skipped seconds, write lateness); phase D adds
  `deadline` (cap hits, idle returns), `wake_vs_promise_us` (early/on-time/late counts and
  max), `change_appear_after_promise_us`, `woken_with_nothing_to_do`. M3: `bounds`, `repaints=
  true_returns= false_returns= repaint_us_*`, `state_mismatch_calls` with a per-field breakdown,
  `buffer_outside_bounds changed_calls changed_bytes`, `resume ui_handler ...`. Ends
  `U8G2GL-M1 end` and `U8G2GL-M3 end`. Every figure carries its unit and n in its line.

### Bus facts (from `u8x8_d_ssd1322.c`, U8g2 2.36.18, computed, not measured)
- Bus clock U8G2 configures: `sck_clock_hz = 10000000UL` (10 MHz), SPI mode 0, `tile_width` 32,
  `default_x_offset` 0x1c. (B1 also prints it at runtime.)
- The 1-bit 2048 B buffer is expanded to 4 bpp per 8x8 tile (`u8x8_ssd1322_8to32`): 8 buffer
  bytes become 32 data bytes. Per tile: `0x15, x, x+1, 0x5c` (4 bytes) + 32 data = 36 bytes. Per tile
  row: `0x75, y, y+7` = 3 bytes.
- Full frame: 8 rows x (3 + 32 x 36) = **9240 bytes** on the wire (not 2048); one tile row =
  1155; one tile = 39 incl. its row header. Raw minimum at 10 MHz: full 7.39 ms, uptime
  rectangle 2.77 ms (overheads per byte and per transaction come on top; that is what B1 measures).
- Uptime label, bounds (px) x=4 y=30 w=248 h=12 -> tiles tx=0, ty=3, tw=32, th=3 -> 3465 bytes,
  i.e. 3/8 of a frame. Since the label spans the full width, even a one-label change pushes 37.5 %
  of the full frame's bytes (see findings).

### Decisions Made
- `u8g2gl_partial_refresh()` does the px-to-tile math internally and returns nothing, so the tile
  rectangle cannot be read from the helper. The timed path calls the helper itself; the printed
  tx/ty/tw/th restate the helper's formula (helpers.h Step 2) and are marked as such.
- The uptime change flips between "Up: 2h 14m 36s" and "...37s" (same width) and T_change includes
  subject set + `tick_fn` + clear + render + partial refresh.
- "Sent" is inferred from call duration > 2000 us; B2 prints min send / max no-send time and a
  `separated` flag so a wrong threshold is visible rather than silent.
- B2 reads the label's `scroll_x_` through `#define private public` around one `#include` of
  `u8g2gl_label.h` in `main.cpp` only (no runtime file touched; class layout unaffected).
- The application writes the clock subject once per loop pass from `millis()`. M3 uses the real
  epoch too, so the panel digits change once per second although repaints run every 500 ms.
- M3 snapshots the state_saver's fields (font, font position function, draw colour, font mode,
  bitmap mode, height mode). `U8G2_WITH_FONT_ROTATION` is off in this build, so direction is not
  there. The clip window is also compared but reported separately (not a state_saver field).
- M3 resume also checks that `ui_handler()` over the non-framework state leaves it unchanged.
- 20 s, 20 s, 10 s phase lengths as specified; they run back to back from boot.

### Dead Ends & Warnings
- First B2 link failed: `build_src_filter` path was copied as `../../ui/generated/` but
  `src/` is one level below the project; correct form is `../ui/generated/` (fixed).
- A `find /` across the disk (to locate the SSD1322 driver) ran into the background after 120 s; it
  was harmless but wasteful; the driver is at
  `tmp/device/.pio/libdeps/device_after/U8g2/src/clib/u8x8_d_ssd1322.c`.
- Image A shares `.pio` with the PA's rebuild: I stopped building in `tmp/device` as asked.
- None of the three images has run on hardware: layout of the wire-byte numbers, the 2000 us send
  threshold and the 25 ms-per-scroll-step expectations are untested assumptions until the capture.

### Out-of-Scope Findings (on paper; none reproduced on a device)
1. **Clock seconds have no deadline.** `u8g2gl_clock::tick()` (src/u8g2gl_clock.cpp:137) returns
   only the colon-blink deadline (500 ms) or IDLE. The displayed second changes only when the app
   writes the time subject, so a loop that sleeps to the returned deadline sees a new second up to
   ~500 ms late (blink on) or never promptly (blink off: IDLE). In B2 the scrolling ticker's
   25 ms deadline masks this; the `clock write_lateness_ms_*` figures will show the unmasked
   effect only if you want a variant with the ticker removed (not built).
   Repro: clock only, blink on, `delay(ui_handler())` loop, write subject from `millis()/1000`.
2. **Scroll never skips; it slows.** `u8g2gl_label::tick()` advances `scroll_x_` by exactly one
   pixel per call regardless of elapsed time (src/u8g2gl_label.cpp, Step 5). A late call therefore
   cannot skip a step; it lowers the effective speed below `scroll_px_per_sec`. B2 reports
   `steps_1px` against `expected_steps_at_40pxps` so the drift is a number.
3. **One changed label is not one tile column.** A full-width label (the diagnostics rows are 248
   px wide) makes `u8g2gl_partial_refresh` push 32 tiles x its rows: 3/8 of the frame for the
   uptime row. Q-14's saving for such screens is bounded by the label's tile rows, not its text.
4. `label::tick` uses `last_scroll_ms_ == 0` as "not started" (Step 3); a deadline computed to
   exactly 0 after `millis()` wrap would restart the initial delay. Not exercised here.

### Blockers
(none)

### Addendum - Image B3 (M1C, clock-only deadline test; approved by the PA)
- Firmware: `tmp/device-m1c/.pio/build/m1c/firmware.bin`, 354192 bytes, sha256
  `584bc80dd2b900a5bb279df600f7efe0e2fb6a63f09dcd5ccd13df226db66429`. `pio run -e m1c`, SUCCESS
  21 s, RAM 8.9 %, flash 8.3 %, no warnings from `main.cpp` (only the framework `io_pin_remap`
  `#warning`). Not flashed, not run.
- Scratch UI `tmp/device-m1c/ui/`: the same `clock` element as B2 (blink="true", bind_time), no
  other widget; same CLI command, CLI 0.12.0, schema 0.4, generator 0.12.0, validation clean.
- Firmware: two phases of 30 s, `U8G2GL-M1C ` tag. D1 blink on; D2 blink off. The clock does
  support runtime toggling (`set_blink()` is public), so D2 is in the same image and no further
  image is needed. Each: `d = ui_handler(); delay(min(d,1000))`, subject written once per pass
  from `kBaseEpoch + esp_timer/1e6`.
- Measured per second: latency in ms from the boundary (esp_timer multiple of 1e6 us) to the end
  of the `ui_handler()` call that first drew the new second ("shown" = buffer changed and
  `clock.get_time()` equals the new epoch); n, min, median, p95, max; `not_shown` and
  `skipped_seconds`; deadline histogram (same buckets as B2, plus cap hits and idle returns); call
  durations; colon toggles.
- Note on method: latency is bounded below by the app's wake-up phase. The subject is written only
  when the loop wakes, so in D1 the expected spread is 0..~500 ms (wake every blink toggle) and in
  D2 up to the 1000 ms cap (clock returns IDLE). These are the predictions from reading
  `u8g2gl_clock::tick()`; the capture decides.
