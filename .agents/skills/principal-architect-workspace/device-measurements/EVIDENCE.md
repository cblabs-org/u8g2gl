# On-device measurement session — evidence

Measurements on real hardware and the xtensa toolchain, for the PR-07 gate and PR-06. **Evidence
only:** no runtime or CLI code was changed. Defects found here are reported with a reproduction,
not fixed. Plan, rulings and the owner's approvals are in [PROJECT.md](PROJECT.md).

**Paths rewritten 2026-10-28** by `scripts/rewrite-home-paths.mjs` (C-1): absolute home-folder paths in `evidence/` and `rig/logs/` were made repo-relative (under a checkout of this repository) or `~/…` (elsewhere). Nothing else in them changed. No hash recorded here is of a rewritten file.

## Common method

- **Runtime under test:** branch `u8g2gl-05r/wo6-readability` @ `81e533f` (PR #13, unmerged),
  runtime **0.8.0**, CLI **0.12.0**, schema 0.4. The evidence branch `u8g2gl-device/measurements`
  changes nothing under `src/`, `include/`, `library.json` or `cli/` (verified by diff, `81e533f..HEAD`).
- **Hardware:** ESP32-S3 Nano (`arduino_nano_esp32`, USB `303A:1001`) with an SSD1322 256×64 on
  hardware SPI: CS 10, DC 9, SCK 48, MOSI 38, no reset; `SPI.begin(48, 47, 38, -1)`; constructor
  `U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI(U8G2_R0, 10, 9, U8X8_PIN_NONE)`.
- **Toolchain:** PlatformIO Core 6.1.19; platform pioarduino `espressif32` 55.3.311
  (`+sha.5f39b6d`): arduino-esp32 3.3.11, ESP-IDF 5.5.5, `xtensa-esp-elf` gcc 14.2.0; U8g2 2.36.18.
- **How things ran:** builds and flashes with direct `pio` (`~/.platformio/penv/bin/pio`), with the
  owner's explicit permission (verbatim in PROJECT.md). The owner switched the PlatformIO MCP off
  mid-session; nothing below depends on it except M4's first builds and Criterion 3's first 0.7.0
  build, called out where they appear. Serial was captured with `rig/c1-image-a/capture.py` under
  PlatformIO's own Python.
- **Firmware sources** are committed under [rig/](rig/), and the raw serial logs under
  [rig/logs/](rig/logs/). In the `platformio.ini` copies, `${U8G2GL_WORKTREE}` stands for the
  worktree root, which was an absolute path. Image A and the M5 builds also read `tmp/fdn/`, a
  `git archive` of foundation's held integration tip `499142f8`.
- **Timing:** `esp_timer_get_time()` in µs; blocking SPI, so elapsed time includes the transfer.

| Image | Measures | `firmware.bin` sha256 | Flash |
|---|---|---|---|
| A (`device_after`) | C1 sanity | `9739f991c675e84d85724da73bbb3a7b238f29449a695257257cbb113e49d6b8` | F1 |
| B1 (`m2`) | M2 | `e2c4c5c29f408b8070f2c72355d18d3cbf8df9e19af0065e72e302d1fbc10f68` | F2 |
| B2 (`m1`) | M1, M3 | `acb06d92c8b90d78a12a89178193c56ad58d6bce393288b587fc287c06ab9800` | F3 |
| B3 (`m1c`) | M1, clock only | `584bc80dd2b900a5bb279df600f7efe0e2fb6a63f09dcd5ccd13df226db66429` | F4 |

**Re-run** any image: `pio run -d <project> -e <env> -t upload --upload-port <port>`, then
`python capture.py <port> <seconds> <out>` (B2 needs ≥ 75 s, B3 ≥ 80 s, the others ≥ 15 s).

---

## C1 — Criterion 1 sanity check: still device = host

Image A is PR-05R's Criterion 1 firmware, unchanged apart from the two `symlink://` paths
(`main.cpp` is byte-identical). Its build links `u8g2gl @ 0.8.0` from this worktree.

- **Expected** ([CRITERION-1.md](../pr-05r-runtime-fixes/CRITERION-1.md) on #13's branch):
  lit 1405, sha256 `b9042618dac87853d16f56f103b19352b3683428b15a9699b303583878d0f62d`.
- **Got (F1):** `U8G2GL-DEVICE runtime=0.8.0 lit=1405 sha256=b9042618…f62d`, the same on every
  5-second repeat. **The rig behaves as it did for PR-05R.** Log: `rig/logs/f1-c1.serial.txt`.

---

## M2 — [Q-14] on SPI: full frame against dirty tiles

**What was compiled:** `rig/m2-image-b1/`. Foundation's `diagnostics` screen with the `connected`
rows, drawn as a plain user (`begin()` only). Before any timing, the frame's buffer is hashed and
must match C1, which proves the timings are of the Criterion 1 frame. Got: `lit=1405`, `b9042618…f62d`.

- **The changing label** is row 3 (uptime). Its bounds come from the generated object: x 4, y 30,
  w 248, h 12. The runtime's own `u8g2gl_partial_refresh()` converts that to tiles x 0, y 3, 32
  wide, 3 high: 96 of the panel's 256 tiles. Changing text in place keeps the same bounds, so the
  union of old and new bounds is just the label's own bounds.
- **Runtime state:** the runtime has no dirty-bounds union yet (Q-14 is unimplemented), so the
  rectangle is supplied by the harness. **This measures the transfer, not the bookkeeping.**
- **Bus:** 10 MHz, U8G2's SSD1322 default (read back from `display_info->sck_clock_hz`).
- **Bytes on the wire:** the SSD1322 is 4 bits per pixel, so U8G2 expands its 1-bit buffer on the way
  out. Per 8×8 tile it sends `0x15, x, x+1, 0x5c` and then 32 data bytes; per tile row,
  `0x75, y, y+7` (`u8x8_d_ssd1322.c`, `DRAW_TILE`, PA-checked). That makes **9240 B per full frame**
  and **3465 B for the label's tiles**.
- **Timing:** 5 untimed warm-ups, then n = 200 timed runs each (µs). Log: `rig/logs/f2-m2.serial.txt`.

| Series | What is timed | min | **median** | p95 | max |
|---|---|---:|---:|---:|---:|
| `T_full` | `sendBuffer()` | 11 757 | **11 764** | 11 768 | 11 768 |
| `T_tiles` | `u8g2gl_partial_refresh()` of the label's tiles | 4 406 | **4 413** | 4 417 | 4 423 |
| `T_render` | `clearBuffer()` + render, no send | 1 707 | **1 712** | 1 713 | 1 713 |
| `T_change` | set uptime text, tick, clear, render, partial send | 6 147 | **6 155** | 6 161 | 6 167 |

**Reading:**

- **Send time is linear in tiles:** 4413 / 11764 = 0.375 = 96/256.
- **The bus runs at about 63% efficiency.** At 10 MHz the raw minimum is 7.39 ms for a full frame;
  the measured 11.76 ms reflects the four command bytes and the DC switching before every tile.
- **A one-label frame costs 6.2 ms with dirty tiles against about 13.5 ms with a full send**
  (1.71 + 11.76). The send blocks the CPU, so the saving is CPU time handed back to the loop.
- **[D-4]'s rationale says the transfer "happens either way". On this bus that is not true:** the
  transfer is 87% of a full-redraw frame's cost, and it scales with what is sent.
- **Whether the saving matters depends on frame rate.** At one update a second, the full send costs
  1.2% of CPU and dirty tiles 0.4%: immaterial. At M1's 40 frames a second, the full send is about
  47% of CPU time. Sending only a 12 px ticker's 2 tile rows (2/8 × 11.76 ≈ 2.9 ms) would be about
  12%: material. Both figures are send time only; rendering adds 1.7 ms per frame either way.
- **This case only saves rows.** A label 248 px wide covers every tile column, so a narrower label
  would save more. A screen whose changes span many rows would save less.

**Q-14 status: the SPI half is answered on this rig** (SSD1322, 10 MHz). **The I²C half is still
open:** this rig has no I²C display, and the SPI result does not carry over, because I²C's per-byte
cost and overhead are different. Q-14 also asks for a departures-board screen; this is the diagnostics
screen (ruling R1).

---

## M1 — the frame loop at bus speed, and [D-15]'s deadlines

**What was compiled:** `rig/m1-m3-image-b2/`. A scratch screen generated by this worktree's CLI
0.12.0 (`node cli/dist/node/cli.js generate ui --target ssd1322`; header stamps: schema 0.4, generator
0.12.0, runtime floor 0.8; 0 errors, 0 warnings):

- `ticker`: a `scroll_circular` label at 40 px/s, with a 1000 ms initial delay.
- `clock`: HH:MM:SS, blink on, seconds in a smaller secondary font, bound to a time subject.
- `caption`: a static label.

The firmware drives the **real `ui_handler()`**. The app writes the time subject once per loop pass.

- **"Changed"** means the 2048-byte buffer differs from its state after the previous call.
- **"Sent"** means the call took more than 2000 µs. That threshold is checked by the data: in phase U
  the slowest call without a send took 17 µs and the fastest send 12 858 µs (in phase D, 12 µs and
  12 923 µs).
- **Private read:** the firmware reads the ticker's private scroll offset through `#define private public`
  around one include in its own `main.cpp`. This is a test-only shortcut; no runtime file changed.

Log: `rig/logs/f3-m1-m3.serial.txt`. **Owner watching the panel:** ticker "scrolling perfectly", colon
blink fine, caption fine. The owner also saw the seconds sitting low (defect D-B).

| | Phase U: uncapped, 20 s | Phase D: `delay(deadline)`, 20 s |
|---|---|---|
| `ui_handler()` calls | 295 668 (14 783/s) | 5 144 (257/s) |
| **Frames changed / s** | **37.5** | **40.05** |
| Sends with no change | 33 | **0** |
| Cost of a call that sends | mean 13 521 µs | mean 13 568 µs |
| Cost of a call that does nothing | mean 4 µs | mean 4 µs |
| Wake against promised deadline | n/a | **5 143 of 5 143 within ±1 ms** (latest +515 µs) |
| Returned deadline = 0 | 20 995 | **4 389 of 5 144** |
| Wakes with nothing to do | n/a | **4 343** |
| Scroll steps (1 px each) | 722 in ~19 s ≈ **38.0 px/s** | 758 in 20 s = **37.9 px/s** |
| Colon toggles | 40 (expected 40) | 39 (expected 40) |

**Reading:**

- **The frame rate is bus-bound.** A sending call costs about 13.5 ms (render plus 11.8 ms SPI),
  which caps a full-redraw loop at about 74 frames/s. Here content changed at the ticker's step rate.
- **The deadlines are honoured, not ignored.** Sleeping exactly the returned deadline produced every
  change on time, with zero wasted sends. The uncapped loop did worse: 33 redundant sends and fewer
  frames.
- **But the deadline value is sometimes wrong, and the scroll runs slow** (defect D-A). Most returns
  in phase D were 0, and 4 343 wakes found nothing to do. The scroll runs at 38 px/s against the
  configured 40, in both phases.
- **Firmware arithmetic error:** its printed "expected steps" for phase D (760) wrongly subtracts the
  initial delay, which applies only once, in phase U. The correct figure is 800.
- **The 33 redundant sends in phase U** fall in the ticker's initial-delay window. Their cause was
  not isolated; treat it as an observation that belongs with D-A's remediation.
- **Phase D's clock line in the log is contaminated, and is not used.** The stage after M3 calls
  `feedClock(s_d)`, so the 10 s M3 gap appears as `skipped_seconds=1` and `write_lateness_max=787`.
  Clock figures come from M1C below.

### M1C — clock only: what a deadline-sleeping app does to the seconds

WO1 noticed in the code that `u8g2gl_clock::tick()` returns a deadline only for its colon blink. In
B2 the ticker's 25 ms deadline hides that, so image B3 (`rig/m1c-image-b3/`) has the clock alone.

- **Loop:** `d = ui_handler(); delay(min(d, 1000))`.
- **Latency** runs from each second boundary (on the same clock that feeds the subject) to the end
  of the call that first draws the new second.
- **Phases:** D1 for 30 s with blink on, then D2 for 30 s with blink off (`set_blink(false)` at runtime).

Log: `rig/logs/f4-m1c.serial.txt`. Owner: "Everything steps evenly that I can see."

| Phase | Returned deadlines | Second shown after its boundary (ms) | Skipped seconds |
|---|---|---|---|
| D1 (blink on) | 61 of 61 in 100–499 ms | n=31: min 260, **median 260**, p95 260, max 774 (the first) | 0 |
| D2 (blink off) | **30 of 30 `U8G2GL_IDLE`** | n=30: min 261, **median 441**, p95 597, max 609 | 0 |

**Reading:**

- **With blink on, every second appears late by one fixed amount.** The loop wakes only on colon
  toggles, so the delay is wherever the toggle phase happens to fall relative to the second. Here
  that was 260 ms; it could be anything from 0 to 500 ms. It looks even because it is constant.
- **With blink off, `ui_handler()` says there is never anything to do,** although the display has a
  new second every second. The seconds appeared at all only because the test app capped its sleep at
  1 s. **An app that honoured `U8G2GL_IDLE` would never redraw the clock.** This follows the spec's
  current wording (§11.1 names only the blink deadline), so it goes to a ruling (Q-C), not the defect list.

---

## M3 — `u8g2gl_repaint_object()` with the main loop blocked

**What was compiled:** `rig/m1-m3-image-b2/`, after M1.

1. **Before entering:** the app sets a deliberately non-framework U8G2 state: font `6x10`,
   `setFontPosBaseline()`, `setFontRefHeightText()`, `setFontMode(0)`, `setDrawColor(1)`. It snapshots
   that state from U8G2's state struct.
2. **For 10 s:** a busy-wait with no `ui_handler()` and no yielding `delay()`. Every 500 ms the app
   writes the time subject and calls `u8g2gl_repaint_object(display, clock)`.
3. **After each call:** compare the state snapshot, and compare the buffer outside the clock's bounds
   (x 4, y 18, w 160, h 20) with a copy taken just before the call. The app then pushes the clock's
   tiles with `u8g2gl_partial_refresh()`.

| Check | Result |
|---|---|
| Repaints / returned true | 20 / **20** |
| State mismatches after a repaint (font, position, draw colour, font mode, bitmap mode, height mode, clip) | **0 of 20**, in every field |
| Buffer bytes changed **outside** the clock's bounds | **0** (0 of 20 calls) |
| Repaints that changed pixels inside the bounds | 10 of 20 (the second changes every other repaint) |
| Repaint cost (excluding the push) | 378 / 390 / 422 µs (min / mean / max) |
| `ui_handler()` afterwards | first call redraws; 31 sends in 60 calls; **0 state mismatches** with the app's state still in place |

**Owner watching:** during the blocked window the ticker froze and the clock box kept updating.
**Result: the blocked-loop repaint works on hardware.** It redraws only inside its widget, leaves
the application's U8G2 state exactly as it found it, and the normal loop resumes cleanly.

---

## M4 — the xtensa compile sweep (a dry run of PR-06's CI check)

**What was compiled:** `rig/m4-sweep/`. The generated corpus
`cli/test/generator/fixtures/emit-project/expected/` (6 `.cpp` files), built and linked for
**esp32dev** (ESP32, LX6) and **nano_esp32** (ESP32-S3, LX7) against this worktree's runtime, with
`-Wall -Wextra`. The full procedure is in **[PR06-SPEC.md](PR06-SPEC.md)**, written as PR-06's input.

| Build | esp32dev | nano_esp32 |
|---|---|---|
| Fixture corpus (0.8.0) | **pass**, 0 warnings from generated or runtime code | **pass**, same |
| **Positive control:** fixture + runtime at `u8g2gl-05r/wo3-platformio` (before the R8 fix) | **fails as required** | **fails as required** |
| Foundation's committed generated project | pass | pass |
| WO1's scratch projects (B2, B3) | pass | pass |
| Strict pass (`-Wconversion -Wshadow -Wformat=2`, platform mutes removed) | generated code 0; runtime 1 | same |

- **The control's error,** PA-checked in both logs: `ui_screen_home.cpp:109:32: error: call of
  overloaded 'bind_flag_if_eq(u8g2gl_subject_bool_n<1>*, int, const uint8_t&)' is ambiguous`. The
  candidates are the `int32_t` overload (`u8g2gl_obj.h:369`) and the `bool` overload (`:370`).
  Apple clang accepts the same file.
- **The one strict-pass runtime warning:** `-Wformat-nonliteral` at `src/u8g2gl_obj.cpp:690`, where
  `snprintf` is given the binding's own format string. It is by design, and not a host-versus-target issue.
- **No new diagnostic of the PR-05R class exists in the current corpus.**
- **Measured host-versus-xtensa differences:** `int32_t` is `int` on the host and `long` on xtensa;
  plain `char` is signed on the host and **unsigned** on xtensa; `size_t` is 8 bytes on the host and
  4 on xtensa. The check sees these only where the compiler rejects or warns.

**What PR-06 has to implement** (summarised from PR06-SPEC.md):

- **Pin the platform.** An unpinned `espressif32` moves underneath the check, and a hard pin needs
  the git-URL form.
- **Cache `~/.platformio`:** about 3.3 GB, mostly framework libraries and the toolchain. A cold
  install was not measured.
- **Supply the generated config:** `-I <generated>` and `-DU8G2GL_GENERATED_CONFIG=…`.
- **Supply a `main.cpp` that links.**
- **Allow-list the framework's S3 `#warning` (`io_pin_remap.cpp`)** and PlatformIO's harmless
  "Circular dependencies" warning.
- **Make the positive control the check's self-test.** Freeze it into the repository as a fixture
  pair, so CI does not depend on an old branch staying reachable.

**The C++ standard needs a decision (finding F-STD).** The platform's own flags come after
`build_flags`, and the last `-std` wins. So `-std=gnu++17` is silently overridden unless
`build_unflags` removes the platform's flags.

- In foundation's real build, the compile line is `… -std=gnu++17 -std=gnu++2b …`: it compiles as
  **gnu++2b**. (PR06-SPEC.md says gnu++2a; the PA checked foundation's line in
  `tmp/m5/logs/fdn-08.clean.pio.log`.)
- With gnu++17 forced, the corpus result was identical.

---

## M5 — the two stale gate numbers

### Criterion 3: foundation `esp32dev` flash and RAM on 0.8.0

**Method:** clean `esp32dev` builds of foundation's held tip `499142f8` (a `git archive` copy), using
the `RAM:` / `Flash:` lines and `xtensa-esp32-elf-size -A`, as in foundation's PR-05 evidence.

- **0.7.0:** built as pinned (`82ec83f`).
- **0.8.0:** the pin replaced by `symlink://` to a library-only copy of this worktree's runtime,
  named `u8g2gl` (byte-identical `src/` and `include/`; finding F-LINK explains why).

| | RAM (B) | Flash (B) | Source |
|---|---:|---:|---|
| Recorded for the gate (2026-10-07) | 57 340 | 1 344 575 (85.5%) | foundation EVIDENCE.md |
| Rebuilt today, 0.7.0 | 57 340 | 1 344 547 | `tmp/m5/logs/fdn-07.clean2.pio.log` |
| Rebuilt today, **0.8.0** | **57 340** | **1 345 115 (85.5%)** | `tmp/m5/logs/fdn-08.clean.pio.log` |

**Delta from 0.7.0 to 0.8.0: RAM 0, flash +568 B (+0.04%), leaving 227 749 B of headroom.** All of it
is `.flash.text`, attributed by `nm`:

| Symbol | Bytes |
|---|---:|
| `u8g2gl_repaint_object` | +184 |
| the new `u8g2gl_state_saver` destructor | +146 |
| `render_animation_update` | +91 |
| `render_object` | +40 |
| U8G2's height-mode and bitmap-mode setters, now linked | +44 together |

The binding pool is 96 B (4 bindings) in both builds.

**Clean builds are not deterministic here: compare only like with like.** Some clean builds pull in
the managed component `esp_diagnostics` (`diag_log_add` and friends, about 1.8 KB) and some do not,
with the same sdkconfig. The table uses builds where it is present, which is the state the recorded
figure was taken in. The first 0.7.0 build gave flash 1 342 679 and a later one 1 342 735, both
without it. (In-session, the PA briefly misquoted one of these as a 0.8.0 figure; the log
attribution above is the checked one.)

### Criterion 4: can `lib_ldf_mode` or explicit `lib_deps` remove the +5 s?

**Method:** `pio run -e esp32dev -v` no-change builds, timed by wall clock, in 5 interleaved rounds
(legacy, S0, S1, S2), each variant warmed up first. Host load was 4.7 to 5.6. The table is in
`rig/logs/c4-obs.tsv`, and the PA recomputed it from that file.

- **Not comparable with the recorded +4.99 s in absolute terms.** That figure was MCP task time, and
  the MCP was off. Only the gap between S0 and legacy compares.
- **Legacy** = foundation `7396e43d` (a `git archive` copy). **S0** = the 0.8.0 tree as is.
  **S1** = S0 with `lib_ldf_mode = chain`. **S2** = S0 with `lib_ldf_mode = off` and an explicit
  `lib_deps`.

| Variant | Median (s) | Range (s) | Against legacy, paired median (s) |
|---|---:|---|---:|
| legacy | 23.03 | 21.81–23.49 | — |
| **S0**: as is | 29.27 | 28.36–29.58 | **+6.24** |
| S1: `lib_ldf_mode = chain` | 33.64 | 32.76–33.98 | +10.62 |
| S2: `off` + explicit `lib_deps` | **8.66** | 8.36–8.98 | **−14.05** |

**Reading:**

- **The regression reproduces** (+6.2 s here, +4.99 s recorded).
- **It is PlatformIO's deep dependency walk over a bigger graph.** Dependency-graph lines in the
  verbose logs: legacy 6 265, S0 8 934, S1 10 648, S2 130.
- **`chain` makes it worse.**
- **`off` with explicit `lib_deps` removes it and beats legacy by 14 s, but it is not free:**
  - **About 45 lines of hand-kept configuration:** the 48-library list, `-I` for every module and
    `lib/` directory, and `WebServer` given as a `symlink://` path, because the bare name also matches
    Arduino's framework library.
  - **It changes the firmware:** flash +428 B and RAM +8 B against S0 (S1: +420 B). S0's own
    run-to-run noise is about 70 B. The cause was not isolated.
- **The regression is structural to PlatformIO's default library finder, and avoidable only by
  opting out of it.** Whether that is worth the maintenance cost is a foundation decision for PR-07.
- **Under all three variants the generator hook still regenerates** after an edit. Edit-loop times
  of 31.0, 35.3 and 12.5 s were taken at load 8–16 and are indicative only.

---

## Defects found (reported, not fixed)

### D-A — The scroll runs about 4% slow, and the deadline sometimes returns 0 with nothing due

**Where:** `src/u8g2gl_label.cpp`.

- **Line 218** steps only when `now_ms > last_scroll_ms_` (strictly greater).
- **Lines 263 and 278** schedule the next step from `now_ms`, not from when the step was due.
- **Effect:** a 25 ms interval becomes at least 26 ms plus however late the wake was, so the scroll
  runs at no more than 38.5 px/s. Measured: 37.9–38.0 px/s against 40 configured.
- **Line 284** returns `last_scroll_ms_ - now_ms`, which is **0** when the two are equal. Line 218
  then refuses to step, so a deadline-sleeping loop wakes with nothing to do until `millis()` advances.
- **Reproduction:** image B2, phase D: 4 389 zero deadlines and 4 343 idle wakes in 20 s, and 758
  steps where 800 were due (`rig/logs/f3-m1-m3.serial.txt`).
- **Fix direction, for the remediation:** schedule each step from its due time, and make the
  comparison and the returned remainder agree.
- **Severity:** low visually (the owner saw a smooth scroll); real for power and for any app that trusts the deadline.

### D-B — The clock's seconds sit below the HH:MM digits

**Where:** `src/u8g2gl_clock.cpp:228-232`.

- **Cause:** the code lines up the bottoms of the two fonts' descender areas
  (`draw_y + font_height − sec_font_height`). Digits sit on the **baseline**, and the fonts'
  descender depths differ (helvB12 4 px, helvR08 2 px).
- **Size:** **2 px**, the same with "all" and with default text reference height, so it predates
  PR-05R.
- **Reproduction:**
  - On the device (image B2 or B3): the owner saw the seconds' bottoms lower than the HH:MM bottoms.
  - On the host with real U8G2 (`rig/clockprobe/probe.c` reproduces the clock's placement): HH:MM
    lit rows 21–32, SS lit rows 27–34.
- **Open:** the owner's estimate by eye was "about 4px". The source and the host render both give
  2 px; reading the device buffer would settle it.
- **Fix direction:** align ascents (baselines), not total heights.
- **Severity:** visible on the first clock anyone builds.

### Harness defects (this session's own firmware; no runtime impact)

- **B2's phase D clock statistics** are polluted by its resume stage (`feedClock(s_d)`). They are not
  used; M1C replaces them.
- **B2's "expected steps" for phase D** should have been 800, not 760.

### Foundation and build findings (from M5; for foundation's cut-over)

- **F-LINK — a `symlink://` to the U8G2GL repository root breaks foundation's build.** With the pin
  replaced by a symlink to the worktree root, the build fails: `EventBus.hpp: No such file`
  (`modules/Application/Application.hpp:69`). The dependency graph stops after u8g2gl, LittleFS and
  WiFi, so none of foundation's `modules/*` libraries are found. A library-only copy works. The cause
  inside PlatformIO was not isolated. Reproduction: `tmp/m5/diag/fdn-08-rootlink`.
- **F-GLOB — PR-05R's middleware finding is reproduced.** If the symlinked runtime directory is not
  named `u8g2gl`, the build middleware's glob matches nothing. The pool silently becomes 6 144 B and
  RAM becomes 63 388 B (+6 048), while the script still prints that the include was forced into the
  runtime's sources. Reproduction: `tmp/m5/diag/fdn-08-othername`.
- **F-STD:** see M4. Foundation compiles as gnu++2b, not the gnu++17 it asks for.
- **F-REGEN — CLI 0.12.0's output differs from foundation's committed generated files.** The first
  hook run regenerates every file, so foundation's cut-over needs a regeneration commit.
- **F-DIAG:** clean-build sizes vary by about 1.8 KB with `esp_diagnostics` (see Criterion 3).

---

## Rulings (owner, 2026-10-13; verbatim in PROJECT.md)

1. **Q-C — ruled.** Widgets that depend on time own their schedule: the clock returns a deadline
   for its next second, from a wall-clock source the framework provides. A subject write is work,
   and ends the loop's sleep. This is a design change (new API and spec §11.1) for a remediation PR,
   together with D-A and D-B.
2. **Q-14 — agreed.** The SPI half is answered on this rig and the I²C half stays open. Proposed §21
   wording: *"SPI (SSD1322, 10 MHz) measured 2026-10-13: full frame 11.8 ms, one label's tiles
   4.4 ms; the saving is material above roughly 10 frames/s. I²C open."*
3. **Criterion 4 — reframed.** Record the firmware loop's +6.2 s as a cost of PlatformIO's library
   finder, with S2 as the known way out, not adopted. The design loop moves to the editor track as an
   E-2 acceptance criterion: under 16 ms from edit to pixels. See
   [ED-INPUT-EDIT-LOOP.md](ED-INPUT-EDIT-LOOP.md).
4. **PR-06 — agreed.** Freeze the positive control into the repository as a fixture pair.
5. **F-LINK — not ruled.** Left for foundation's cut-over; the library-only layout works.

## What this does not show

- **I²C:** no I²C display on this rig.
- **A departures-board screen:** M2 used the diagnostics screen.
- **Other boards:** one board, one display, one SPI clock (U8G2's default; no sweep).
- **The cost of a dirty-bounds union** (Q-14 bookkeeping): not implemented, so not measured.
- **Foundation's own firmware running on 0.8.0:** that is foundation's cut-over. Criterion 3 here is
  a build measurement only.
- **Criterion 4 in MCP task time:** the MCP was off; the comparison is wall time.
- **D-B's exact pixel count on the device itself.**
