---
work_order: WO7
project: pr-05r-runtime-fixes
title: "Device test firmware for criterion 1 — build only, the PA flashes"
branch: u8g2gl-05r/wo6-readability (no code commits; this WORKORDER's report only)
complexity: architect
status: complete
---

# WO7 — build the on-device criterion 1 firmware (no flashing)

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" (the decomposition named "an on-device criterion 1 check when the owner attaches
hardware") and its Session Log entry recording the owner's "Hardware is ready and attached - do the
flash tests". This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Working tree and outputs

`../U8G2GL-05r`, branch `u8g2gl-05r/wo6-readability`. **Change no
tracked file except this WORKORDER** (Completion Report). All firmware lives in `tmp/device/`
(git-ignored). Read foundation only: `../esp32-app-foundation-u8g2gl` and the PA's archive
`tmp/fdn/` (foundation's held tip, `499142f8`).

## Tooling Constraints — PlatformIO MCP only, and NO UPLOAD

- The owner has denied the `pio` CLI. Load `platformio-mcp:pio-manager`; tools via ToolSearch
  (`select:mcp__plugin_platformio-mcp_platformio__build_project,mcp__plugin_platformio-mcp_platformio__check_task_status,mcp__plugin_platformio-mcp_platformio__clean_project,mcp__plugin_platformio-mcp_platformio__project_envs,mcp__plugin_platformio-mcp_platformio__size_report`).
  Pass `projectDir` and `environment`; `background: true`, poll.
- **Do not call `upload_firmware`, any monitor or serial tool, `release_lock`, or anything that
  touches `/dev/cu.usbmodem101`.** The board's port is held by another session; the PA releases it
  and flashes. Your job ends at a green build.

## Objective

Two firmware images for foundation's ESP32-S3 Nano with its SSD1322, each rendering foundation's
`connected` diagnostics frame through U8G2GL as **a plain user** — `begin()` and nothing else
before the first frame — then printing the frame buffer's SHA-256 and lit-pixel count over serial,
and showing the frame on the display. One against this branch's runtime ("after"), one against
`origin/main`'s ("before").

## Facts

- **Hardware** (`../esp32-app-foundation-u8g2gl/hardware/esp32s3nano/board.h`, env
  `[env:esp32s3nano]` in its `platformio.ini`): board `arduino_nano_esp32`; display
  `U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI`, CS 10, DC 9, RST unassigned (`U8X8_PIN_NONE`), SPI on
  SCK 48, MISO 47, MOSI 38. Foundation calls `SPI.begin(48, 47, 38, -1)` before `begin()`
  (`modules/U8G2Display/U8G2Display.cpp:123`). Copy whatever board options that env needs to boot
  (partitions, memory type, flash size, USB CDC flags) — read them, do not guess.
- **The screen:** foundation's committed generated project
  `tmp/fdn/uidesign/ssd1322-256x64/u8g2gl/generated/` (do **not** regenerate it). The host harness
  (`tmp/fdn/test/render/`) shows how the `connected` scenario's values reach the screen's subjects
  (`DiagnosticsScreenBoard`, `formatDiagnostics()`, the scenario's literals and
  `test/render/after/diagnostics_board/inputs.json`). Drive the same subjects with the **same exact
  row strings**, by setting subjects directly — no WiFi, no foundation modules.
- **Expected frame:** `tmp/fdn/after-05r/diagnostics_board/connected.bin` (2048 B, the PA's latest
  harness run against this branch). Compute its SHA-256 and lit count and put both in the report.
  The harness's frame is `clearBuffer()` + render, no `sendBuffer()` — so compute the device's
  hash **before** `sendBuffer()`.
- **Plain user, deliberately:** no `setFontPosTop()`, `setFontRefHeightAll()`, `setFontMode()`,
  `setDrawColor()` or `setFont()` before the first frame. That is the point of the test.
- **"Before":** a `git archive origin/main` of this repo into `tmp/device/runtime-before/`, used as
  that env's U8G2GL library (`symlink://` or `lib_extra_dirs`). Note: foundation's generated code
  was produced by CLI 0.11.0 and requires runtime ≥ 0.7, which both satisfy. Expect "before" to
  either crash on the first frame (the null-font restore) or render near-blank.
- **"After":** this worktree as the library. The generated config header should reach the runtime
  via `U8G2GL_GENERATED_CONFIG` as the header advises (this matters only to RAM, not pixels).
- **Serial protocol** (115200, USB CDC on boot), printed once after the first frame and again
  every 5 s, so the PA can catch it in a capture window:
  `U8G2GL-DEVICE runtime=<U8G2GL_VERSION> lit=<n> sha256=<64 hex>` plus one line per row giving
  the subject strings. Use mbedTLS (`mbedtls/sha256.h`) for the hash.

## Line-Item Instructions

- [x] `tmp/device/platformio.ini` with envs `device_after` and `device_before`, sharing one
      `src/main.cpp`.
- [x] Build both through the MCP from clean; paste `[SUCCESS]`, RAM/flash. "Before" must build: if
      it does not, report why — do not patch the old runtime.
- [x] Host cross-check: compile the same `main.cpp` render path once against the host? **Not
      required** — the harness is the host reference. Instead, state in the report the exact
      subject strings you set and where in the harness each came from.
- [x] Report: the expected SHA-256 and lit count, the env names, the firmware paths, and the exact
      serial line format to look for.

## Strict Boundary Box

Only `tmp/device/` and this WORKORDER's Completion Report. No upload, no serial, no lock release,
no source change, no commit except the report (`git branch --show-current` first).

## Completion Report (append below)

Status · Builds (both envs, MCP evidence) · Expected frame (sha256, lit) · Subject strings and
their source · Serial format · Dead Ends · Out-of-Scope Findings.

### Status

**Complete — both images build green through the PlatformIO MCP. Nothing was flashed.** I made no upload, serial, monitor or lock call, and did not touch `/dev/cu.usbmodem101`. Everything is under `tmp/device/` (git-ignored). The only tracked change is this report, plus `status: complete` and the ticked checklist.

### Builds (MCP `build_project`, `forceExecution`, fresh project dir = from clean)

| Env | Runtime linked | Result | RAM | Flash | `s_binding_pool` |
|---|---|---|---|---|---|
| `device_after` | this worktree, `u8g2gl @ 0.8.0` (symlink) | `[SUCCESS] Took 12.79 seconds` | 27196 B (8.3%) | 349634 B (8.3%) | 0x60 B (4 bindings) |
| `device_before` | `git archive origin/main` (`9808423`) → `tmp/device/runtime-before/`, `u8g2gl @ 0.7.0` | `[SUCCESS] Took 10.61 seconds` | 33244 B (10.1%) | 349018 B (8.3%) | 0x1800 B (defaults) |

The "before" runtime needed no patching. Firmware images (all at offset 0x10000, `app0`; partitions copied from foundation):
- `tmp/device/.pio/build/device_after/firmware.bin`: 356608 B, sha256 `c60a0c46c47a5b82494583b9ba77a55fcbc01ecb6071542dd96e912a730f9df8`
- `tmp/device/.pio/build/device_before/firmware.bin`: 355920 B, sha256 `f79d3b30c8b97ed55c5ab8e5b7ac7bac59b12e3b4d963e05d25409f04ba817ff`

The pool sizes are read from the ELF with `nm -S`. They show that `U8G2GL_GENERATED_CONFIG` reached the "after" library. On "before" the macro has no effect, because main predates it. The capacities only size the pool in `u8g2gl_obj.cpp` and no class layout depends on them, so this changes RAM, not pixels.

Board options come from foundation's `[env:esp32s3nano]`: `arduino_nano_esp32`, `upload_protocol = esptool`, `partitions.csv`, `memory_type = qio_opi`, `flash_size = 16MB`, `BOARD_HAS_PSRAM`, `ARDUINO_USB_MODE=1`, `ARDUINO_USB_CDC_ON_BOOT=1`, `U8G2_WITHOUT_FONT_ROTATION`, `U8G2_WITHOUT_UNICODE`, and `platform = espressif32` (the same installed pioarduino 55.03.311). U8g2 is pinned to exactly 2.36.18, which is what the harness used. The board's `BOARD_USES_HW_GPIO_NUMBERS` applies (the build's pin-remap `#warning` confirms it), so pins 10, 9, 48, 47 and 38 are GPIO numbers, as in foundation.

### Expected frame

`tmp/fdn/after-05r/diagnostics_board/connected.bin` (2048 B):
- **sha256 `b9042618dac87853d16f56f103b19352b3683428b15a9699b303583878d0f62d`**
- **lit = 1405** (this matches `inputs.json` `lit_pixels`)

`state_probe.json` in the same directory records `plain_user_ui_handler` (begin() only) as identical to this frame on the host. The device should agree.

### Subject strings and their source

All four strings are set directly with `ui_set_diag_*()` after `ui_init()`. No WiFi and no foundation modules are involved.

| Subject | Exact bytes | Source |
|---|---|---|
| `diag_hostname` | `esp32-foundation` | `test/render/main.cpp` kScenarios `connected` hostname, published by `DiagnosticsScreenBoard::configure()` |
| `diag_wifi` | `MyNetwork \xC2\xB7 192.168.1.42` | `formatDiagnostics()` `"%s \xC2\xB7 %s"` with the scenario's ssid/ip; inputs.json row 2 |
| `diag_uptime` | `Up: 2h 14m 36s` | `formatDiagnostics()` `"Up: %luh %lum %lus"` over `(2*3600+14*60+36)*1000` ms; inputs.json row 3 |
| `diag_heap` | `Heap: 278KB  v0.0.12-dev.83` (two spaces) | `formatDiagnostics()` `"Heap: %luKB  v%s"`, 278*1024 B, `HARNESS_DEFAULT_BUILD_VERSION` 0.0.12-dev.83; inputs.json row 4 |

### Render path (`tmp/device/src/main.cpp`)

1. `SPI.begin(48, 47, 38, -1)`, then `U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI(U8G2_R0, 10, 9, U8X8_PIN_NONE).begin()` and nothing else on U8G2. No setFont, setFontPosTop, setFontRefHeightAll, setFontMode or setDrawColor.
2. `u8g2gl_set_tick_cb(millis)`, `ui_init()`, the four setters, `u8g2gl_set_active_screen(&ui_screen_diagnostics)`.
3. `ui_handler()`'s own sequence, opened up so the hash comes before the send: `tick_fn(now)`, `clearBuffer()`, `render_fn(display)`, then the sha256 (mbedTLS) and popcount over `getBufferPtr()` (8×tileH×tileW = 2048 B), then `sendBuffer()`.

The hash comes from the first frame only. The 5 s repeats re-print that result and do not re-render.

### Serial format (115200, USB CDC on boot)

```
U8G2GL-DEVICE boot env=device_after runtime=0.8.0          # before the first frame (after ≤3 s wait for CDC + 500 ms)
U8G2GL-DEVICE buffer_bytes=2048                            # once
U8G2GL-DEVICE runtime=0.8.0 lit=<n> sha256=<64 hex>        # once, then every 5 s
U8G2GL-DEVICE row1="esp32-foundation"
U8G2GL-DEVICE row2="MyNetwork \xC2\xB7 192.168.1.42"       # non-printables escaped as \xNN
U8G2GL-DEVICE row3="Up: 2h 14m 36s"
U8G2GL-DEVICE row4="Heap: 278KB  v0.0.12-dev.83"
```

`device_before` prints `env=device_before runtime=0.7.0`. `runtime` is `U8G2GL_VERSION_MAJOR.MINOR.PATCH`, because the runtime defines no single `U8G2GL_VERSION` macro.

**How to read the result:** if `lit=1405` and the sha256 equals `b904…f62d`, criterion 1 holds on hardware. If boot lines repeat with no `runtime=… lit=` line, the first frame crashed and rebooted the board. For "before", that is the expected null-font restore. Capture a window longer than one boot cycle, about 5 s.

### Dead Ends

None. Both envs built on the first attempt.

### Out-of-Scope Findings

- The generated config header (CLI 0.11.0) advises `-include generated/u8g2gl_generated_config.h`. A forced include would also reach U8g2's C sources. I did not try it, and used `U8G2GL_GENERATED_CONFIG` as the WO directs. On a runtime without that macro (origin/main), the capacities silently fall back to defaults: 6 KB more RAM here, with no pixel effect.
- Arduino-only framework, not foundation's `arduino, espidf` + sdkconfig layering. Foundation's sdkconfig settings the rig does not reproduce: main task stack 16384 (Arduino's default loop stack is 8192), PSRAM memtest, console on USB-Serial-JTAG (here `ARDUINO_USB_MODE=1` gives the same HW CDC). None of them affects the frame buffer.
