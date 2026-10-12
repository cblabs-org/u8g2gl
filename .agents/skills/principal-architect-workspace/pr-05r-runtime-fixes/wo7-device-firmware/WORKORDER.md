---
work_order: WO7
project: pr-05r-runtime-fixes
title: "Device test firmware for criterion 1 — build only, the PA flashes"
branch: u8g2gl-05r/wo6-readability (no code commits; this WORKORDER's report only)
complexity: architect
status: dispatched
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

`/Users/mcneillm/Documents/Projects/U8G2GL-05r`, branch `u8g2gl-05r/wo6-readability`. **Change no
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

- [ ] `tmp/device/platformio.ini` with envs `device_after` and `device_before`, sharing one
      `src/main.cpp`.
- [ ] Build both through the MCP from clean; paste `[SUCCESS]`, RAM/flash. "Before" must build: if
      it does not, report why — do not patch the old runtime.
- [ ] Host cross-check: compile the same `main.cpp` render path once against the host? **Not
      required** — the harness is the host reference. Instead, state in the report the exact
      subject strings you set and where in the harness each came from.
- [ ] Report: the expected SHA-256 and lit count, the env names, the firmware paths, and the exact
      serial line format to look for.

## Strict Boundary Box

Only `tmp/device/` and this WORKORDER's Completion Report. No upload, no serial, no lock release,
no source change, no commit except the report (`git branch --show-current` first).

## Completion Report (append below)

Status · Builds (both envs, MCP evidence) · Expected frame (sha256, lit) · Subject strings and
their source · Serial format · Dead Ends · Out-of-Scope Findings.
