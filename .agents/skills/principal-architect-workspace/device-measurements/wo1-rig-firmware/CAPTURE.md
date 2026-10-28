# Capture plan - device-measurements WO1 images (build only; the PA flashes)

Interpreter for capture.py (PlatformIO's own env, has pyserial 3.5):
`~/.platformio/penv/bin/python`

    PY=~/.platformio/penv/bin/python
    $PY tmp/device/capture.py <port> <secs> <out>

capture.py reopens the port if the board re-enumerates after a reset, so start it BEFORE or
right after the flash completes. The board's USB CDC port drifts; use the port the lab reports.
Firmware is at 0x10000 (the project's `firmware.bin`, not `firmware.factory.bin`).

## Image A - PR-05R Criterion 1, unchanged (sanity)
- Firmware: tmp/device/.pio/build/device_after/firmware.bin, 356608 bytes,
  sha256 9739f991c675e84d85724da73bbb3a7b238f29449a695257257cbb113e49d6b8
  (built by WO1 through the MCP; the PA's own rebuild may differ - compare to what is flashed).
- First line: `U8G2GL-DEVICE boot env=device_after runtime=0.8.0`
- Capture 12 s: `$PY tmp/device/capture.py <port> 12 tmp/logs-A.txt`
- Expect: `buffer_bytes=2048`, then `lit=1405 sha256=b9042618...f62d`, four `row<k>=` lines,
  repeating every 5 s.
- Panel: foundation diagnostics screen, static. Four rows: bold centred hostname, WiFi line with a
  middle dot, "Up: 2h 14m 36s", "Heap: 278KB  v0.0.12-dev.83". Nothing moves.

## Image B1 - M2, SPI transfer time
- Firmware: tmp/device-m2/.pio/build/m2/firmware.bin, 357776 bytes,
  sha256 e2c4c5c29f408b8070f2c72355d18d3cbf8df9e19af0065e72e302d1fbc10f68
- First line: `U8G2GL-M2 boot env=m2 runtime=0.8.0`
- Capture 12 s (measurement takes about 2-3 s after the 3.5 s boot; the summary repeats every
  5 s and ends `U8G2GL-M2 end`): `$PY tmp/device/capture.py <port> 12 tmp/logs-B1.txt`
- Check first: `lit=1405 sha256=b9042618...f62d` on the `runtime=` line (same frame as image A).
- Panel: the same static diagnostics screen as image A. During the measurement the uptime row
  flips between "Up: 2h 14m 36s" and "...37s" for about 1-2 s (T_change), then settles back on
  "...36s". No flicker elsewhere should be seen.

## Image B2 - M1 then M3
- Firmware: tmp/device-m1/.pio/build/m1/firmware.bin, 361920 bytes,
  sha256 acb06d92c8b90d78a12a89178193c56ad58d6bce393288b587fc287c06ab9800
- First line: `U8G2GL-M1 boot env=m1 runtime=0.8.0`
- Timeline from reset: ~3.5 s boot; phase U 20 s; phase D 20 s; M3 10 s; resume 1 s; first
  summary at ~56 s, repeated every 5 s. Capture >= 75 s:
  `$PY tmp/device/capture.py <port> 75 tmp/logs-B2.txt`
  (A late capture still gets the summaries; the phase banners need a capture from reset.)
- Banners to watch for: `U8G2GL-M1 phase=U start`, `U8G2GL-M1 phase=D start`,
  `U8G2GL-M3 watch enter ...`, `U8G2GL-M3 watch exit ...`.
- Panel (three items: top ticker 0..11 px, centre clock HH:MM:SS at y=18..37, caption at y=46):
  - Phase U (0:04-0:24) and phase D (0:24-0:44): the ticker text scrolls left continuously at
    ~40 px/s (it starts after a 1 s delay), the clock counts seconds with a blinking colon.
    Phase U runs the loop flat out; phase D sleeps to each deadline. The owner should judge
    whether D looks as smooth as U, and whether any second is visibly skipped or late.
  - M3 (0:44-0:54): the ticker FREEZES and the colon freezes. Only the clock box is repainted,
    every 500 ms, so the seconds digits change once per second. Nothing outside the clock box
    (x 4..163, y 18..37) should move or flicker, and the caption must stay intact.
  - After M3 (~0:54): the ticker and blink resume at once.

## Image B3 - M1C, clock-only deadline test
- Firmware: tmp/device-m1c/.pio/build/m1c/firmware.bin, 354192 bytes,
  sha256 584bc80dd2b900a5bb279df600f7efe0e2fb6a63f09dcd5ccd13df226db66429
- First line: `U8G2GL-M1C boot env=m1c runtime=0.8.0`
- Timeline: ~3.5 s boot, phase D1 (blink on) 30 s, phase D2 (blink off) 30 s; first summary at
  ~64 s, repeated every 5 s, ends `U8G2GL-M1C end`. Capture >= 80 s:
  `$PY tmp/device/capture.py <port> 80 tmp/logs-B3.txt`
- Panel: a single HH:MM:SS clock at the left centre. D1: colon blinks 1 Hz and seconds tick.
  D2: colon solid; watch whether seconds still advance once a second or stutter.
