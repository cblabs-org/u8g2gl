# Criterion 1 re-verified at runtime 0.10.0

C1 was last confirmed on the device at runtime **0.9.0** (`pr-05r2-timing/wo8-device/logs/
f1-criterion1.serial.txt`) and on the host at 0.8.0 (`pr-05r-runtime-fixes/CRITERION-1.md`).
`main` is 0.10.0, which changed `~u8g2gl_obj()` (observer removal). This file re-measures it.

## Host — measured 2026-10-22

- **What was compiled.** Foundation's render harness from `git archive 499142f8` (held
  integration tip, PR #292) into `tmp/fdn/`, unedited. Legacy `DiagnosticsBoard` and migrated
  `DiagnosticsScreenBoard` built into one host binary against real U8G2 2.36.18 (`extern/u8g2`
  @ `d66b49a`).
- **Which U8G2GL.** This worktree's `src/` and `include/` at `origin/main` @ `c30cd2d`, runtime
  **0.10.0** (`u8g2gl_version.h:47-48`), through `-DU8G2GL_SOURCE_DIR`; the harness's pinned SHA
  `82ec83f2` is overridden. Object paths confirm the runtime was compiled from this worktree
  (`build/CMakeFiles/u8g2gl_runtime.dir/…/U8G2GL-07/src/u8g2gl_obj.cpp.o`).
- **Baseline** regenerated in the same build (`--target baseline`) and checked byte-identical to
  foundation's committed `test/render/baseline/diagnostics_board/*.bin`.
- **Generated UI:** foundation's committed `uidesign/ssd1322-256x64/u8g2gl/generated`, not
  regenerated.
- Log: [evidence/c1-host-after.log](evidence/c1-host-after.log).

| Scenario | Identical | Differing | Lit | sha256 (migrated = baseline = committed) |
|---|---|---:|---:|---|
| connected | yes | 0 | 1405 | `b9042618dac87853d16f56f103b19352b3683428b15a9699b303583878d0f62d` |
| ap_mode | yes | 0 | 1477 | `5837eddd948b47c9f654218fc1bc6bac4daf07e420679106d68f805f4db9879f` |
| disconnected | yes | 0 | 1326 | `24631738bdc867e412c7dfa8d0c9e8b24abcf8215f3e6ea85e795e7710d2c528` |
| long_ssid | yes | 0 | 1679 | `1432ac1e340fee82e3022d8500a08e08f15071c9f56bfeb86f1cb4fd2ad9fdb3` |
| device_dev91 | yes | 0 | 1362 | `873d8ef1a3e528f175c710776e30e84a258ce47668bc2a72498208187802b892` |

**State probe** (connected): `no_font_pos_top` 0, `no_font_ref_height_all` 0,
`plain_user_ui_handler` 0 differing (0 rendered-only, 0 normal-only); font mode 1 / 1 / 1.
**Truncation probe:** 181 of 181 lengths identical; 41 of 41 truncated identical.

**Result: unchanged from 0.8.0, to the byte.** The 0.10.0 destructor change moved no pixel.

## Device — PENDING

Image `device-measurements/rig/c1-image-a`, `main.cpp` byte-identical, repointed at this
worktree ([evidence/c1-device-platformio.ini](evidence/c1-device-platformio.ini); only the
`device_after` env). Built through the MCP 2026-10-22: dependency graph `u8g2gl @ 0.10.0`,
`U8g2 @ 2.36.18`; only warning the framework's `io_pin_remap.cpp` `#warning`;
`firmware.bin` sha256 `ea3b29f87fc7690ffa37b63dd64e52ac73d62a6bb59d81bef50fd479bda92e5e`.

**Not flashed.** Asked 2026-10-22; owner answered **"Not now"**. Until it is, C1's device half
stands at **0.9.0**, one minor behind `main`.
