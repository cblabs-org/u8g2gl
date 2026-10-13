# PR-06 CI input: the xtensa compile check (rehearsed manually in device-measurements WO2 / M4)

Purpose: catch "host-clean, target-broken" generated code (spec 17.3). The defect class that
motivated it: `int32_t` is `long` on xtensa and `int` on the host, so an integer literal beside
`int32_t` and `bool` overloads is ambiguous only on the target (PR-05R's seventh defect).
Verified here: `static_assert(is_same<int32_t,int>)` passes on Apple clang 21 and fails with
`xtensa-esp32-elf-g++` 14.2.0.

Everything below was run in `tmp/m4/` of the worktree at runtime 0.8.0 / CLI 0.12.0 (81e533f).

## 1. The check, step by step

1. Input: a directory of generated output (6 `.cpp` + `ui.hpp` + `u8g2gl_generated_config.h`; the
   fixture is `cli/test/generator/fixtures/emit-project/expected/`).
2. A throwaway PlatformIO project with `src/main.cpp` (below) and one env per target.
3. Build every env; any compiler `error:` fails the check; any `warning:` whose file is the
   generated directory or the runtime (`src/`, `include/u8g2gl/`) fails it too. Third-party and
   framework warnings are reported, not failed (see 5).
4. Run the self-test (section 4) first; if it does not fail as expected, the check is broken.

Per-env result at this commit (MCP `build_project`, forced, warm package cache; logs in
`tmp/m4/.pio-mcp-workspace/logs/build/`): all pass, 0 warnings from generated or runtime code;
11-12 s per env wall.

| env | target | RAM / Flash (B) |
|---|---|---|
| esp32dev | ESP32 (LX6) | 26604 / 318264 |
| nano_esp32 | ESP32-S3 (LX7) | 27228 / 348202 |

## 2. Packages (what must be present)

- `platform = espressif32` resolving to pioarduino `platform-espressif32` commit `5f39b6db`,
  platform.json 55.03.311 (PlatformIO prints `55.3.311+sha.5f39b6d`).
- `framework-arduinoespressif32` 3.3.11, `framework-arduinoespressif32-libs` 5.5.5+sha.b774170ff46
  (ESP-IDF 5.5.5), `toolchain-xtensa-esp-elf` 14.2.0+20260121 (one toolchain serves both
  ESP32 and S3 on this platform), `tool-esptoolpy` 5.3.0, PlatformIO Core 6.1.19.
- `olikraus/U8g2@2.36.18` (registry) and this repository as `symlink://` (CI: `symlink://${PWD}`
  or a `lib_extra_dirs` entry; the library is `u8g2gl@0.8.0`).
- Pin: `platform = espressif32` was used (what foundation uses); a hard pin needs the git URL form
  `https://github.com/pioarduino/platform-espressif32.git#<tag-or-sha>`, which clones from the
  network. PR-06 must choose and record a pin; an unpinned `espressif32` moves under the check.
- Disk (this machine): framework-libs 2.0 GB, toolchain 1.2 GB, framework 74 MB, platform 33 MB;
  per-env build tree ~170 MB for all, libdeps 48 MB. Cache `~/.platformio` in CI keyed on the
  pin; cold install is network-bound and was NOT measured here (everything was already cached).

## 3. Flags and files that had to be supplied (and why)

Per env `build_flags`:

- `-std=gnu++17` AND `build_unflags = -std=gnu++11 -std=gnu++2a -std=gnu++2b`. FINDING: the
  platform's own flags end `-std=gnu++2b ... -std=gnu++2a`, and the last `-std` wins, so a bare
  `-std=gnu++17` in `build_flags` is silently overridden and the code compiles as gnu++2a (C++20).
  Foundation's `-std=gnu++17` + `build_unflags=-std=gnu++11` therefore also builds C++20. Decide
  which standard the check asserts; this rehearsal ran both (`esp32dev`/`nano_esp32` = gnu++2a
  effective, `*_std17` = gnu++17 effective): identical results.
- `-I <generated dir>` : the runtime's `u8g2gl_config.h` includes the generated config by name.
- `-D U8G2GL_GENERATED_CONFIG=\"u8g2gl_generated_config.h\"` (spec 16): without it the library's own
  `u8g2gl_obj.cpp` keeps the default (large) binding pool and the generated capacities are not applied.
- `-Wall -Wextra` : already in the platform's flags (it passes `-Wall -Wextra` itself), so supplying
  them is redundant but harmless. BUT the platform also passes `-Wno-unused-parameter
  -Wno-sign-compare -Wno-missing-field-initializers` after yours, muting part of `-Wextra`. To see
  those, `build_unflags` them (env `*_strict`).
- S3 board only (`arduino_nano_esp32`): `board_build.arduino.memory_type = qio_opi`,
  `board_upload.flash_size = 16MB`, `-DBOARD_HAS_PSRAM -DARDUINO_USB_MODE=1 -DARDUINO_USB_CDC_ON_BOOT=1`
  (copied from foundation; not required to compile the check, kept to mirror the real target).
- `-DU8G2_WITHOUT_FONT_ROTATION -DU8G2_WITHOUT_UNICODE` : mirrors foundation.
- Source selection: `build_src_filter = +<main.cpp> +<../corpus/*.cpp>` with the generated output
  copied to `corpus/` next to `src/` (a copy, so PlatformIO compiles it with the env's flags).
- `src/main.cpp` : needed so the link is real. It includes `ui.hpp` first, constructs
  `U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI display(U8G2_R0, 10, 9, U8X8_PIN_NONE)`, calls
  `display.begin(); ui_init(); ui_screen_<N>_activate();` in `setup()` and `_tick(millis())`,
  `clearBuffer()`, `_render(display)`, `sendBuffer()` in `loop()`. The screen name N is a `-D`
  token (`-DM4_SCREEN=home`) pasted into the symbol; a real check should derive it from the XML.
  Source: `tmp/m4/src/main.cpp`.
- `board_build.partitions = default.csv` (any valid table; no flash is involved).

Gotchas: PlatformIO prints `Warning! Circular dependencies detected` between U8g2 and the
symlinked library (U8g2's library.json lists u8g2gl); harmless, but a grep for "Warning" will hit.
The S3 build always emits `#warning The build system forces the Arduino API to use GPIO numbers`
from the framework (`io_pin_remap.cpp`): third-party noise, must be allow-listed.
`forceExecution` in the MCP bypasses only the MCP cache; SCons reuses objects, so use a clean
build dir (or `clean_project`) when a true rebuild matters.

## 4. Self-test (positive control)

Run the same project against the pre-fix state: `git archive u8g2gl-05r/wo3-platformio` (runtime
0.7.0 and its fixture `expected/`) into a directory, point `lib_deps` and `-I` at it. It MUST fail,
on both envs, with exactly:

```
.../expected/ui_screen_home.cpp:109:32: error: call of overloaded
 'bind_flag_if_eq(u8g2gl_subject_bool_n<1>*, int, const uint8_t&)' is ambiguous
 note: candidate: 'bool u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base*, int32_t, uint8_t)'
 note: candidate: 'bool u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base*, bool, uint8_t)'
```

Observed: `ctl_esp32dev` FAILED in 7.8 s and `ctl_nano_esp32` FAILED in 8.6 s, both with that
error (the `u8g2gl-05r/wo3-platformio` branch must stay reachable; better, store the control as a
small frozen fixture pair in the repo so CI needs no old ref). Host contrast: the same file under
`c++ -std=gnu++17 -fsyntax-only -Wall -Wextra` (Apple clang 21, same `-I`) is accepted, no output.
If the control ever builds, the check no longer detects the class: fail CI.

## 5. What can and cannot run in CI

- Can: the compile only. No device, no flash, no lock. ~11 s per env warm; two envs in parallel are
  fine (separate build dirs).
- Needs network on a cold cache: platform git clone, framework + libs tarballs (GitHub release
  assets, ~2 GB), toolchain zip, U8g2 from the PlatformIO registry. Cache `~/.platformio`.
- Cannot: anything that needs `symlink://` to an absolute path unless the path is templated;
  running the firmware; rendering (the host harness covers pixels).

## 6. What the check does not cover

- Runtime behaviour, pixel output, timing, memory at run time (RAM/Flash from the link is reported
  but not asserted).
- Only two targets (LX6, LX7). Not RISC-V (C3/C6), not AVR, not the host.
- Only the committed fixture corpus / the project under test, not arbitrary user XML.
- Warnings from the framework and U8g2 are not failed on: with `-Wconversion -Wshadow
  -Wsign-compare -Wunused-parameter -Wformat=2` re-enabled (env `*_strict`) the build reports
  1226 (esp32dev) / 1543 (nano) warnings, of which 1225 / 1542 are framework or U8g2 and 1 is the
  runtime's: `src/u8g2gl_obj.cpp:690` `-Wformat-nonliteral` (`snprintf` with the binding's own
  format string; by design, not host-vs-target). Generated code: 0 under every configuration.
- Format-width, signedness and `char` differences are only caught where the compiler warns; the
  strict env found none in generated or runtime code. Measured differences (host = Apple clang 21,
  arm64, vs xtensa-esp32-elf-g++ 14.2.0, `-fsyntax-only` probes in `tmp/m4/logs/probe*.cpp`):
  `int32_t` is `int` on host / `long` on xtensa; plain `char` is signed on host / UNSIGNED on
  xtensa (a `char` compared with a negative or `>= 0x80` value behaves differently, and a UTF-8
  `"\xC2\xB7"` byte read through `char` is negative on host only); `size_t` is 8 bytes on host / 4 on
  xtensa. None of these produce a diagnostic by themselves: the check only sees what the compiler
  rejects or warns about.

## 7. Other projects swept with the same harness (reported separately, owner ruling R2)

All against the runtime in this worktree (0.8.0), both targets, default flags (gnu++2a effective):
foundation's committed `uidesign/ssd1322-256x64/u8g2gl/generated/` (env `fdn_*`, built with the MCP),
and WO1's scratch outputs `tmp/device-m1/ui/generated` and `tmp/device-m1c/ui/generated`
(envs `wo1_m1_*`, `wo1_m1c_*`, snapshots copied at 2026-10-13, built with direct `pio run`
after the owner switched the MCP off). All six + four builds: success, 0 errors, 0 warnings from
generated or runtime code (only the S3 framework `#warning` in `io_pin_remap.cpp`). Note: the
check can be run with either the MCP or `pio run -e <env> -v`; the latter writes the full compile
command lines (needed to prove which `-std` and warning flags were in force).
