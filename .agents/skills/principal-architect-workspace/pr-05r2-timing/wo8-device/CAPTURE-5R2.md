# Capture plan - PR-5R2 WO8 images (build only; the PA flashes with the owner)

Interpreter (PlatformIO's own env, has pyserial):
`PY=/Users/mcneillm/.platformio/penv/bin/python`
Capture command: `$PY tmp/device-a/capture.py <port> <secs> <out>` (run from the worktree root
/Users/mcneillm/Documents/Projects/U8G2GL-05r2; start it BEFORE or right after the flash, it reopens the
port if the board re-enumerates). Flash `firmware.bin` at 0x10000 (not `firmware.factory.bin`).
Both images link u8g2gl 0.9.0 (build log: `|-- u8g2gl @ 0.9.0`).

## Image A' - PR-05R Criterion 1, unchanged, on this runtime (regression)
- Firmware: tmp/device-a/.pio/build/device_after/firmware.bin, 356912 bytes,
  sha256 bb810f6cc07d5d16939b9cab968690ab2885b07b7cd6fc241d5aea98f2536a56
- main.cpp byte-identical to the device-measurement rig's (cmp). The only change is the
  `device_after` lib_deps symlink.
- Capture 12 s: `$PY tmp/device-a/capture.py <port> 12 tmp/logs-A.txt`
- First line `U8G2GL-DEVICE boot env=device_after runtime=0.9.0`; then `buffer_bytes=2048` and
  `lit=1405 sha256=b9042618dac87853d16f56f103b19352b3683428b15a9699b303583878d0f62d`, four
  `row<k>=` lines, repeating every 5 s.
- Panel: the static foundation diagnostics screen (bold centred hostname, WiFi line, uptime,
  heap). Nothing moves.

## Image V - verification of PR-5R2
- Firmware: tmp/device-v/.pio/build/v/firmware.bin, 360368 bytes,
  sha256 2871ef262665b5fc36fbce5f3d5c986325dd21888b5206e4fc3adffc53cb8134
- First line `U8G2GL-V boot env=v runtime=0.9.0 note="panel should show --:--:-- for 5 s ..."`.
- Timeline from reset: boot pump to 6.5 s; phase D1 (blink on) 30 s -> 36.5 s; D2 (blink off)
  20 s -> 56.5 s; U (uncapped) 10 s -> 66.5 s; first summary ~67 s, reprinted every 5 s, ends
  `U8G2GL-V end`. Capture >= 85 s (a late capture still gets the summaries; the phase banners need
  a capture from reset):
  `$PY tmp/device-a/capture.py <port> 85 tmp/logs-V.txt`
- Serial: tag `U8G2GL-V `, key=value. Lines: `boot`, `phase=<D1|D2|U> start`, then per summary
  `method` (x2), `boot_pump`, and per phase `summary`, `call_us`, `deadline_hist_ms`, `scroll`,
  and `loop` + `second_latency_us` (D1, D2) or `redundant_sends ... at_ms_since_phase_start`
  (U), then `U8G2GL-V end`.
- What the owner should watch on the panel, and when:
  - 0:00-0:05 after reset: the clock reads `--:--:--` (the host time is unknown); the ticker
    starts scrolling after its 1 s delay regardless.
  - ~0:05-0:06: the clock changes to `12:34:xx` (base epoch 12:34:56 + uptime, so ~12:35:01).
  - From then, 0:06-0:36 (D1, blink on): the seconds tick exactly with the colon's blinking;
    no second skipped, none late.
  - The seconds' baseline sits level with HH:MM (WO2 fix): the small SS digits share the large
    digits' baseline, not 2 px lower.
  - The ticker scrolls smoothly at ~40 px/s through D1 and D2, no hitches at second changes.
  - 0:36-0:56 (D2, blink off): the colon is steady; seconds still tick on time.
  - 0:56-1:06 (U, loop flat out): same picture as D1/D2, the panel is not flickering.
- Pass thresholds (for the PA, from the serial summary):
  - scroll steps_per_s = 40.0 +/- 0.2 in D1 and D2
  - zero_deadlines = 0 and no `0` histogram bucket while nothing is due
  - idle_wakes ~ 0
  - second_latency_us max <= ~14000 (one frame) with blink on (D1) and off (D2)
  - skipped_seconds = 0 (D1, D2)
  - cap_hits = 0 while scrolling (D1, D2)
  - Phase U: report redundant_sends and their times.
