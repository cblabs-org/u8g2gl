# Project: device-measurements — on-device measurement session

A **measurement session**, not a feature PR. It produces evidence and changes no runtime or CLI
code. A defect found here is a finding with a reproduction, for PR-06 or a new remediation — never
a fix in this branch.

## Base and branch

- **Base:** `u8g2gl-05r/wo6-readability` @ `81e533f` (PR #13, open). Runtime 0.8.0 / CLI 0.12.0.
  `main` is 0.7.0 and crashes on the first frame of a plain user's render (`CRITERION-1.md`).
- **Branch:** `u8g2gl-device/measurements`, evidence only, in worktree `../U8G2GL-device`. #13's
  branch and its worktree `../U8G2GL-05r` are not written to.
- **Rig:** copied from `../U8G2GL-05r/tmp/` into this worktree's `tmp/device/` and `tmp/fdn/`
  (git-ignored), **without** `.pio-mcp-policy.json` and `.pio-mcp-workspace/`, so this rig is
  not enrolled in any MCP policy profile and every flash needs approval.
- **Foundation** is never written to. What is needed comes by `git archive` into `tmp/`.

## Hardware

ESP32-S3 Nano (`arduino_nano_esp32`, USB `303A:1001`, seen at `/dev/cu.usbmodem101`) with an
SSD1322 256×64: CS 10, DC 9, SCK 48, MOSI 38, no reset. `SPI.begin(48, 47, 38, -1)`.

## Measurements

| Id | Question | Needs | Priority |
|---|---|---|---|
| C1 | Sanity: rig still gives `lit=1405`, sha256 `b9042618…f62d` | flash F1 | gate for the rest |
| M2 | [Q-14] SPI: full 2048-byte frame vs dirty tiles for one changed label | flash F2 | 1 |
| M4 | xtensa sweep of the generated corpus — PR-06 CI rehearsal | build only | 2 |
| M1 | Frame loop at bus speed; are [D-15] deadlines honoured | flash F3 + owner's eyes | 3 |
| M3 | `u8g2gl_repaint_object()` with the loop blocked; state guard | flash F3 + owner's eyes | 4 |
| M5 | Criterion 3 (flash/RAM on 0.8.0) and Criterion 4 (`lib_ldf_mode`, explicit `lib_deps`) | build only | 5 |

## Work-Order ledger

- **[x] [wo1-rig-firmware](wo1-rig-firmware/WORKORDER.md):** Re-point the copied rig at this
  worktree; build image A (unchanged `device_after`), image B1 (M2) and image B2 (M1 → M3).
  Build only, through the MCP. `standard`.
- **[x] [wo2-build-measurements](wo2-build-measurements/WORKORDER.md):** M4 xtensa sweep (with
  a positive control at the pre-fix runtime), then M5. Build only, through the MCP. `standard`.
- **[x] wo3-flash-session:** PA with the owner present. F1 (image A), F2 (image B1), F3 (image
  B2), asked for once, lock around each. MCP `upload_firmware` first; if refused, ask the owner in the moment before any
  direct `pio`. A third flash only on a broken image B, asked separately. `interactive`.
- **[x] wo4-evidence:** [EVIDENCE.md](EVIDENCE.md), with [PR06-SPEC.md](PR06-SPEC.md) and [rig/](rig/). PA reproduces headline figures from raw logs, writes `EVIDENCE.md` to the
  `CRITERION-1.md` standard, commits on this branch.

WO1 and WO2 run in parallel: disjoint `tmp/` directories (`tmp/device/` against `tmp/m4/`,
`tmp/m5/`), no tracked source touched by either. **Workers do not commit**; the PA reviews and
commits, so no two parties share HEAD.

## Rulings

- **R1 — Q-14 screen.** Q-14 asks for a departures-board screen; none exists on this rig. Use
  foundation's diagnostics screen (the real screen on this panel), change one row. State that it
  is not the departures board. The runtime has no dirty-bounds union, so the tile rectangle is
  computed by hand: M2 measures transfer, not bookkeeping. I²C stays open.
- **R2 — M4 coverage.** The brief's corpus (`cli/test/generator/fixtures/*/expected/`) is one
  project, 6 `.cpp`. Also compile foundation's committed generated diagnostics project and the M1
  scratch project, reported separately. Warnings are listed, not failures. Both `esp32dev`
  (LX6) and `esp32-s3` (LX7) targets.
- **R3 — Owner's eyes** on the panel during F3 for M1 and M3; confirmed at flash time.
- **R4 — Push** of this branch is asked at the end, not assumed.
- **R5 — Policy.** The `lab_admin` enrolment of `../U8G2GL-05r/tmp/device` was found **still
  live** on 2026-10-12 (`approvalRequiredOperations: []`, `upload_firmware` allowed). No MCP
  operation is run in that folder. Revoking it is the owner's action.

## Status Log

- **2026-10-12** — Decomposition presented (four WOs, flash points F1 + F2 in one sitting, R1–R5
  as proposed defaults). **Owner's approval, verbatim: "approve".** Taken as approval of the plan
  as written including the proposed defaults for the four open questions (R1–R4). Worktree
  `../U8G2GL-device` created on `u8g2gl-device/measurements` @ `81e533f`; rig copied without
  policy files.
- **2026-10-12** — PA refinement within the approved plan: M2 split into its own image (B1) from
  M1/M3 (B2), so the top-priority measurement does not depend on the scratch screen. Flashes F1–F3
  in one sitting, one ask. WO1 and WO2 written and dispatched in parallel.
- **2026-10-12** — WO1 and WO2 both killed by the API usage limit mid-work. Snapshot: tree clean,
  nothing committed; WO1 had re-pointed `tmp/device/platformio.ini` (the two `symlink://` paths
  only) and started `tmp/device-m2/`; WO2 had started `tmp/m4/`. Both resumed, same agents.
- **2026-10-13** — **Owner, verbatim: "ok - the device is attached. Approval to use pio directly to
  flash and compile."** Direct `pio` is therefore permitted this session for builds and for flashing
  (the PA flashes; workers may compile with `pio`, never upload). Device lock still taken around
  every flash. Enrolment rules (R5) unchanged.
- **2026-10-13 F1 (C1 sanity) — PASS.** Image A (`device_after`, links this worktree's 0.8.0 via
  `symlink://`, `firmware.bin` sha256 `9739f991…d6b8`), flashed with `pio … -t upload` under the
  device lock: `runtime=0.8.0 lit=1405 sha256=b9042618…f62d`, stable across repeats. Logs
  `tmp/device/logs/{build_f1,upload_f1,f1}.log`.
- **2026-10-13 F2 (M2) — measured.** Image B1 (sha256 `e2c4c5c2…0f68`), same frame first
  (`lit=1405`, `b9042618…f62d`). SPI 10 MHz (U8G2's SSD1322 default). Uptime label 248×12 at (4,30)
  → tiles 32×3 of 32×8. n=200 medians: **full send 11 764 µs; label tiles 4 413 µs; render 1 712 µs;
  one-label-changes frame (render + partial) 6 155 µs.** Time ∝ tiles (4413/11764 = 0.375 = 3/8).
  Wire bytes 9240 full / 3465 partial, checked by the PA against `u8x8_d_ssd1322.c` DRAW_TILE
  (per tile: `0x15,x,x+1,0x5c` + 32 data; per tile row `0x75,y,y+7`). Log
  `tmp/device-m2/logs/f2.log`.
- **2026-10-13** — **Owner, verbatim: "I have turned off the MCP server because of the issues we
  have been having with it.  Operate directly for now."** The MCP device lock was held by an implicit
  session (WO2's MCP builds) when F3 was due; from here no lock tool exists, so the port is protected
  by convention: only the PA touches it, workers compile only. WO2 told to use `pio` for everything.
- **2026-10-13 F3 (M1 + M3) — measured, owner watching.** Image B2 (`acb06d92…9800`). Log
  `tmp/device-m1/logs/f3.log`. Owner: ticker "scrolling perfectly", colon blink fine, caption fine;
  **seconds digits sit lower than HH:MM ("about 4px")**. Panel froze after ~55 s: by design (the
  firmware stops calling `ui_handler()` after the 1 s resume check).
  - M1 U (uncapped, 20 s): 14 783 calls/s; **37.5 changed frames/s**; a send costs 13.5 ms
    (render + 11.8 ms SPI); 33 sends with no buffer change; scroll 722 steps in ~19 s ≈ 38 px/s.
  - M1 D (deadline-driven, 20 s): **40.05 frames/s, 0 wasted sends**; all 5 143 wakes within ±1 ms
    of the promised deadline (max late 515 µs); scroll 758 steps in 20 s = 37.9 px/s (configured 40;
    the firmware's "expected 760" wrongly subtracts the initial delay in D too — it should be 800);
    but **4 389 of 5 144 returns were deadline 0, and 4 343 wakes did nothing**.
  - M1 D clock line is contaminated: the post-M3 resume stage calls `feedClock(s_d)`, so
    `skipped_seconds=1`, `write_lateness_max=787` come from the 10 s M3 gap. Harness defect, not
    runtime; clock latency is taken from B3 instead.
  - M3 (10 s, loop blocked): 20/20 repaints returned true; **0 state mismatches** (font, position,
    draw colour, font mode, bitmap mode, height mode, clip); **0 bytes changed outside the clock's
    bounds**; 10 of 20 changed pixels inside (a second changes every other repaint); repaint
    378–422 µs. Resume: first `ui_handler()` call redrew, 0 state mismatches over 60 calls.
- **2026-10-13 F4 (M1C, clock only) — measured.** Image B3 (`584bc80d…6429`), built at the PA's
  request after WO1 read that `u8g2gl_clock::tick()` has no deadline for seconds. Log
  `tmp/device-m1c/logs/f4.log`. Owner: steps evenly; seconds lower than HH:MM.
  - D1 blink on: deadlines all 100–499 ms (toggle remainder); **second shown 260 ms after the
    boundary (n=31, median = p95 = 260, max 774 = first)** — a fixed phase between the blink and the
    second, which could be anything 0–500 ms.
  - D2 blink off: **every return was `U8G2GL_IDLE`** (30/30); seconds appeared only because the app
    capped sleep at 1000 ms: latency 261–609 ms, median 441. A deadline-sleeping app honouring IDLE
    would never redraw the clock.
- **PA analysis (code, reproduced by measurement):**
  - **D-A, scroll runs 4% slow and the loop spins.** `u8g2gl_label.cpp:218` steps only when
    `now_ms > last_scroll_ms_` (strict), and `:263`/`:278` reschedule from `now_ms`, not from the due
    time: a 25 ms interval becomes ≥ 26 ms → ≤ 38.5 px/s (measured 37.9–38.0). `:284` returns
    `last_scroll_ms_ - now_ms` = **0** when they are equal, but `:218` then refuses to step, so a
    deadline-sleeping loop wakes with nothing to do until `millis()` ticks (4 343 idle wakes in D).
  - **D-B, clock seconds 2 px below HH:MM.** `u8g2gl_clock.cpp:228-232` aligns the bottoms of the
    two fonts' descender boxes, but digits sit on the baseline. helvB12 descent 4, helvR08 descent 2
    → 2 px, in both "all" and default text height modes, so it predates PR-05R. Host render on real
    U8G2 (`tmp/clockprobe/probe.c`): HH:MM rows 21..32, SS rows 27..34. Owner's eye: "about 4px" —
    discrepancy open; resolve from the device buffer.
  - **Q-C, [D-15] cannot express subject-driven content.** The clock's deadline covers only its blink;
    seconds come from the app writing the subject. For ruling, not a defect per the current spec text.
- **2026-10-13 — WO2 complete; PA verified** the M4 control failure (both targets, from the logs),
  recomputed Criterion 4 from `obs.tsv` (exact match), mapped every M5 log to its runtime (the
  PA's earlier in-chat "0.8.0 is 2.4 KB smaller" was a misread of a no-diagnostics 0.7.0 build;
  corrected: +568 B), and checked foundation's real compile line (`-std=gnu++17 -std=gnu++2b`).
  EVIDENCE.md written; rig sources and serial logs preserved under `rig/` (absolute paths replaced
  by `${U8G2GL_WORKTREE}`).

## Session Log

### 2026-10-13 — Session wrap-up
- **Outcome:** C1 still device = host. Q-14's SPI half answered (full 11.76 ms / label tiles
  4.41 ms; material above ~10 frames/s); I²C open. [D-15] deadlines honoured to ±1 ms; repaint
  holds the state guard and its clip on hardware. xtensa sweep clean with a working positive
  control; PR06-SPEC.md is PR-06's input. Criterion 3: +568 B on 0.8.0. Criterion 4: +6.2 s
  reproduced, structural to PlatformIO's deep LDF; `off` + explicit deps removes it at a config
  and ~430 B cost.
- **Defects for a remediation:** D-A (label scroll 4% slow, deadline-0 spins), D-B (clock seconds
  2 px low). **Ruling needed:** Q-C (D-15 and subject-driven content).
- **Lessons:** the MCP's implicit lock serialises unrelated builds behind the hardware queue, so
  parallel build workers stall the flasher; workers and the PA flashing should not share it. Clean
  ESP-IDF builds here are not size-deterministic (esp_diagnostics), so size comparisons need a
  same-state pair. Map every number to its log before quoting it, including in chat.
