# Principal Architect Memory
<!-- Last updated: 2026-10-15T19:55:00Z -->

## Active Programs
| Program | Plan | Status |
|---|---|---|
| [U8G2GL](../PROGRAM.md) | [PROGRAM-PLAN.md](../PROGRAM-PLAN.md) | Executing — **PR-06 merged** (#15, `ce0046c`). Runtime 0.10.0, CLI 0.13.1, C++ 512 / CLI 1353. D-9 parity proved (bridge path). Programme's first CI: 5 jobs. Criterion 1 holds on host and device; Q-14's SPI half answered, I²C open; C2 still open. PR-05's foundation half stays held off its `main` until the cut-over (R10). Editor track (E-D, then E-1..3) runs after the PR-07 gate. CA owes: `rules/03` determinism coupling, F-PLATFORM in cut-over |

## Active Projects
| Project | Status | Modules | Context |
|---|---|---|---|
| pr-05r2-timing | **Submitted** — 8/8 WOs, PR from `u8g2gl-05r2/wo8-device`. Device PASS (scroll 40.01 px/s, 0 idle wakes, seconds one frame after the boundary). LVGL-shaped host-owned timers, wall clock, resume callback, dirty-order fix, label resize, non-copyable subjects. Runtime 0.9.0, CLI 0.13.0. C++ 501 / CLI 1353. Worktree `../U8G2GL-05r2` | Firmware Runtime | [PROJECT.md](../pr-05r2-timing/PROJECT.md) |
| device-measurements | **Complete and pushed**; rulings Q-C, Q-14, C4 reframe, PR-06 recorded — C1 holds; Q-14 SPI answered (11.76 / 4.41 ms), I²C open; D-15 deadlines honoured; repaint verified; xtensa sweep + PR06-SPEC; C3 +568 B; C4 +6.2 s structural (LDF). Remediation needed: D-A (scroll), D-B (clock 2 px), Q-C (clock owns seconds; subject write wakes loop). E-D input: ED-INPUT-EDIT-LOOP.md. Branch `u8g2gl-device/measurements`, worktree `../U8G2GL-device` | Device / Build | [PROJECT.md](../device-measurements/PROJECT.md) |
| pr-05r-runtime-fixes | **Submitted — [#13](https://github.com/cblabs-org/u8g2gl/pull/13)**, merge commit not squash (tip `u8g2gl-05r/wo6-readability`). C++ 415 / CLI 1353, runtime 0.8.0, CLI 0.12.0. Criterion 1 holds for U8G2GL alone, host and device (device sha = host sha) | Firmware Runtime / Host Tooling / Packaging | [PROJECT.md](../pr-05r-runtime-fixes/PROJECT.md) |
| pr-05-integration | **Verified; U8G2GL half merged (#11), foundation half HELD off main (R10)**: foundation PR matthewmcneill/esp32-app-foundation#292 is a draft until cut-over. Native 1018, device-verified on ESP32-S3 (`dev.91`–`dev.93`). 6 runtime/CLI findings; CA bridge written | Packaging / Integration | [PROJECT.md](../pr-05-integration/PROJECT.md) |
| pr-4r3-corrections | **Submitted** — 4/4 WOs, PR from `u8g2gl-4r3/wo4-readability`. C++ 401 / CLI 1338, CLI 0.11.0, runtime 0.7.0 (every regenerated project needs runtime ≥ 0.7). CA bridge written. Owner approved 2026-10-06. Worktree `../U8G2GL-4r3` | Host Tooling / Firmware Runtime | [PROJECT.md](../pr-4r3-corrections/PROJECT.md) |
| pr-4r2-corrections | **Submitted** — 4/4 WOs, PR from `u8g2gl-4r2/wo4-readability`. C++ 395 / CLI 1319, CLI 0.10.0, runtime 0.6.0. CA bridge written. Owner approved decomposition + rulings 2026-10-05. Worktree `../U8G2GL-4r2` | Host Tooling / Firmware Runtime | [PROJECT.md](../pr-4r2-corrections/PROJECT.md) |

## Recently Completed (last 5)
| Project | Completed | Modules | Key Outcome |
|---|---|---|---|
| [pr-06-wasm-ci](../pr-06-wasm-ci/PROJECT.md) | 2026-10-15 | CI / Wasm / Firmware Runtime | Merged #15. Programme's first CI (5 jobs). D-9 parity proved (bridge path, SHA-256 identical on macOS + Linux). Inverted positive control caught platform pin misconfiguration. Use-after-free caught by CI on first run. C++ 512 / CLI 1353, runtime 0.10.0, CLI 0.13.1. Finding: `espressif32` is not portable |
| [pr-04b-font-image-pipeline](../pr-04b-font-image-pipeline/PROJECT.md) | 2026-09-28 | Host Tooling | Merged #8. bdfconv as committed Wasm with provenance; PNG→XBM. Closes [Q-2]. All 12 departures-board font arrays byte-identical to generator output |
| [pr-4r-corrections](../pr-4r-corrections/PROJECT.md) | 2026-09-28 | Host Tooling / Firmware Runtime | 5 WOs, merged #6 + #7. Realisation made unobservable for clamping; radius bound measured against real U8G2 and pinned by a test; shared tables moved to neutral modules. Refuted a Chief Architect ruling by measurement |
| [pr-04-generator](../pr-04-generator/PROJECT.md) | 2026-09-28 | Host Tooling / Firmware Runtime | 21 WOs, merged #5. Generator emits compiling C++, plus the editor target (registry + scene JSON). C++ 361 / CLI 1044. Every U8G2 font usable |
| [pr-03-widgets](../pr-03-widgets/PROJECT.md) | 2026-09-10 | Firmware Runtime / Host Tooling | 9 WOs, merged #3. Settled [U-1] element identity |

## Older Projects
1 completed project.
Full project history: [PROJECT_INDEX.md](PROJECT_INDEX.md)
Cross-cutting module index: [MODULE_INDEX.md](MODULE_INDEX.md)
