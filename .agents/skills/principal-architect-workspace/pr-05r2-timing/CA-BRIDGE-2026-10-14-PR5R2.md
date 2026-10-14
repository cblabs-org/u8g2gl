# CA bridge — device measurements and PR-5R2 returned (2026-10-14)

**From:** PA, `device-measurements` then `pr-05r2-timing`.

- **Measurement session:** branch `u8g2gl-device/measurements` (evidence only), **pushed, no PR**.
  Its evidence is `device-measurements/EVIDENCE.md` on that branch.
- **PR-5R2:** [cblabs-org/u8g2gl#14](https://github.com/cblabs-org/u8g2gl/pull/14), head
  `u8g2gl-05r2/wo8-device`, **open**. The owner is reviewing and merging it manually, with a merge
  commit (`rules/04`).
- **Before both:** PR-05R merged as #13 (`99ac4a3`, merge commit).

## 1. The measurement session (the CA's bridge, M1–M5)

All in `EVIDENCE.md`, each item with its method, the commit it measured, and a re-run command.

| Item | Result |
|---|---|
| C1 sanity | Device = host still: `lit=1405`, `b9042618…f62d`. Re-confirmed on runtime 0.9.0 after PR-5R2 |
| **M2 / Q-14** | SSD1322, 10 MHz SPI: full frame **11.76 ms** (9 240 B on the wire); one label's tiles **4.41 ms**. Time is linear in tiles. Material above about 10 frames/s. **SPI half answered; I²C open** (no I²C display on the rig). [D-4]'s "the transfer happens either way" is false on this bus |
| **M4** | xtensa sweep clean on LX6 and LX7. The positive control (the pre-R8 tree) fails as required. `PR06-SPEC.md` is PR-06's input |
| M1 | [D-15] deadlines honoured to ±1 ms; the frame loop is bus-bound at about 40 frames/s. Found D-A and D-B (§2) |
| M3 | `u8g2gl_repaint_object()` on hardware: 20 of 20 repaints, 0 state mismatches, 0 bytes changed outside the widget |
| M5, C3 | foundation `esp32dev` on 0.8.0: **+568 B flash, RAM 0**. Clean builds vary by about 1.8 KB (`esp_diagnostics`), so compare like for like |
| M5, C4 | The +6.2 s reproduces. It is PlatformIO's deep library finder. `chain` makes it worse; `off` plus explicit `lib_deps` beats legacy by 14 s, but costs about 45 hand-kept lines and changes the image by about 430 B |

**Owner rulings, recorded word for word in that branch's `PROJECT.md`:**

- **Q-14:** agreed. The SPI half is answered, I²C stays open. The §21 wording is now in PR-5R2.
- **PR-06:** freeze the positive control into the repository as a fixture pair.
- **Criterion 4 reframed.**
  - The firmware loop's +6.2 s is recorded as a cost of PlatformIO's library finder. `lib_ldf_mode =
    off` is the known way out, not adopted.
  - The **design** loop moves to the editor track as an E-2 acceptance criterion: **under 16 ms from
    edit to pixels**.
  - The owner's two-mode editor direction is written up for E-D in `ED-INPUT-EDIT-LOOP.md`: live
    editing in a prebuilt Wasm fed a scene, and a compiled "test run". It also covers the
    departures-board `layoutsim` precedent.
- **Q-C:** a developer adding a clock writes no seconds logic, and a binding update ends the loop's
  sleep. Delivered in PR-5R2.

## 2. PR-5R2 (#14): what changed

| # | Item | Outcome | Evidence |
|---|---|---|---|
| D-A | Label scroll 4% slow; deadline-0 idle wakes | Scheduled from the due time, exact rate, one step and a resync after a stall, never 0 | Device: 37.9 → **40.01 px/s**; idle wakes 4 343/20 s → **0** |
| D-B | Clock seconds 2 px low | Aligned by ascent (baseline) | Real-U8G2 pixel test, 3 font pairs: rows 32/34 → 32/32; owner: "clock is good now" |
| Q-C | Time-dependent content | `u8g2gl_timer` (LVGL-shaped) + `u8g2gl_wall_clock`; the clock binds to a time subject; `--:--` when the time is unknown | Device: each second drawn **15 ms** (one frame) after its boundary, blink on and off; was 260 ms, or never |
| Q-C | Binding update wakes the loop | `u8g2gl_set_resume_cb()` (mirrors `lv_timer_handler_set_resume_cb`), on the clean→dirty transition only | 12 tests |
| new | `ui_handler()` cleared dirty after rendering | Cleared before; returns 0 if dirtied during the draw | Reproduced against the old code |
| new | A resized label kept a stale layout | `on_size_changed()` hook on `u8g2gl_obj` | Control: fails on the old code |
| new | Subjects copyable (a copy shares observer storage) | Copy and move `= delete` on all 8 types | `static_assert`s |

**Counts:** C++ 415 → **501** (1 known skip), CLI **1353**, 0 warnings. Runtime **0.9.0**, CLI
**0.13.0** (the goldens moved by the runtime floor only), schema 0.4. Every project regenerated with
0.13.0 requires runtime ≥ 0.9. The Criterion 1 frame is unchanged on 0.9.0.

## 3. Design decisions the CA should know (`PROJECT.md` Design section)

1. **Timers follow LVGL's API, not its implementation.** LVGL has no "data source": the idiom is a
   timer whose callback writes a subject. Verified against the LVGL 9.5.0 source. Its timers drift
   (`last_run = lv_tick_get()`), which is the same flaw as D-A, so ours are due-time scheduled.
2. **Host-owned timer storage, no pool** (the owner's challenge). A fixed pool is justified only
   where the generator counts objects from XML; timers are created by host code it never sees. They
   use the intrusive list and LVGL's `_init` convention, and a timer's destructor unlinks it.
3. **The boundary between U8G2GL and foundation.** U8G2GL owns the mechanism and the generic
   wall-clock helper. **Foundation owns the concrete sources** (NTP time, system information, event
   bridges), which are now requirements for its cut-over.
4. **Widgets keep `tick()`,** a recorded difference from LVGL. Converting them to timers is not
   planned.
5. **`u8g2gl_resume_notify()`** lives in the library's first private header,
   `src/u8g2gl_internal.h`, so it is not public API.

## 4. For the Chief Architect

1. **PR-06 inputs,** in addition to its existing scope:
   - `PR06-SPEC.md` (the xtensa check, with a pinned platform and the cache);
   - the frozen positive control (owner ruling);
   - the editor-target Emscripten build and JS bridge (`ED-INPUT-EDIT-LOOP.md`, "missing" rows);
   - **F-STD:** the C++ standard the check asserts. Foundation actually compiles as **gnu++2b**,
     because the platform's `-std` comes after `build_flags`.
2. **Foundation's cut-over** now has these requirements:
   - NTP and system-info sources built on `u8g2gl_timer` / `u8g2gl_wall_clock`;
   - **F-LINK:** a `symlink://` to the repository root breaks foundation's library finding. Use a
     library-only layout;
   - **F-GLOB:** the middleware glob misses silently unless the directory is named `u8g2gl`. Switch
     to the `U8G2GL_GENERATED_CONFIG` macro;
   - **F-REGEN:** CLI output has moved since foundation's commit, so it needs a regeneration commit.
3. **The PR-07 gate:**
   - C1 holds on device and host;
   - C3 is +568 B;
   - C4 is reframed as above;
   - **C2 is still open:** how much of legacy's 99 lines the 33 XML lines replaced, plus a written
     "clearer" judgement. It is a reading exercise, not done here.
4. **Branch `u8g2gl-device/measurements`** (docs only, pushed, never PR'd) holds `EVIDENCE.md`,
   `PR06-SPEC.md`, `ED-INPUT-EDIT-LOOP.md`, and the rig sources and logs. Decide whether it merges to
   `main` as programme evidence or stays a reference branch.
5. **An open finding, not in #14:** the circular scroll re-sends identical frames while its text
   crosses the blank 30 px gap. These are the "33 redundant sends", explained by the data: 33 per
   wrap, 0 without one. A cheap later optimisation is to skip `mark_dirty()` while the text is fully
   clipped.
6. **Tooling:**
   - **The PlatformIO MCP now flashes end to end.** It was used for both PR-5R2 flashes.
   - **A machine-wide `~/.platformio-mcp/policy.yaml` (`profile: standalone`)** ungates uploads and
     drops the lock requirement everywhere. That is the owner's choice; the PA still asks before
     every flash.
   - **A Gemini MCP session on `Echenon-hr-relay`** left a monitor holding the test board's port for
     17 hours; the owner freed it. **The board now carries PR-5R2's test firmware.**
   - The `lab_admin` enrolment on `../U8G2GL-05r/tmp/device` is gone.
7. **Still owed (`rules/04`):** tag the pinned foundation commit, so merge strategy stops being
   load-bearing.
