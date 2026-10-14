# Principal Architect Memory
<!-- Last updated: 2026-10-12T12:00:00Z -->

## Active Programs
| Program | Plan | Status |
|---|---|---|
| [U8G2GL](../PROGRAM.md) | [PROGRAM-PLAN.md](../PROGRAM-PLAN.md) | Executing — merged through #10 (PR-4R3). **PR-05 verified** — packaging merged (#11); foundation integration held off its `main` until a cut-over (R10). **PR-05R submitted as #13** (2026-10-12) — six findings plus three, device = host; then PR-06. Criterion 1's 0-pixel result must be re-measured after it: the legacy module was setting the font position. Then PR-06, PR-07 gate on branch evidence. CA-1 and CA-2 closed 2026-10-05: the editor track (E-D, then E-1..3) runs after the PR-07 gate |

## Active Projects
| Project | Status | Modules | Context |
|---|---|---|---|
| pr-05r2-timing | **WO1/6** — scroll timing (D-A), clock baseline (D-B), LVGL-shaped host-owned timers + wall clock + resume callback (Q-C), dirty-flag fix; runtime 0.9.0. Owner approved 2026-10-14. Worktree `../U8G2GL-05r2` | Firmware Runtime | [PROJECT.md](../pr-05r2-timing/PROJECT.md) |
| pr-05r-runtime-fixes | **Submitted — [#13](https://github.com/cblabs-org/u8g2gl/pull/13)**, merge commit not squash (tip `u8g2gl-05r/wo6-readability`). C++ 415 / CLI 1353, runtime 0.8.0, CLI 0.12.0. Criterion 1 holds for U8G2GL alone, host and device (device sha = host sha) | Firmware Runtime / Host Tooling / Packaging | [PROJECT.md](../pr-05r-runtime-fixes/PROJECT.md) |
| pr-05-integration | **Verified; U8G2GL half merged (#11), foundation half HELD off main (R10)**: foundation PR matthewmcneill/esp32-app-foundation#292 is a draft until cut-over. Native 1018, device-verified on ESP32-S3 (`dev.91`–`dev.93`). 6 runtime/CLI findings; CA bridge written | Packaging / Integration | [PROJECT.md](../pr-05-integration/PROJECT.md) |
| pr-4r3-corrections | **Submitted** — 4/4 WOs, PR from `u8g2gl-4r3/wo4-readability`. C++ 401 / CLI 1338, CLI 0.11.0, runtime 0.7.0 (every regenerated project needs runtime ≥ 0.7). CA bridge written. Owner approved 2026-10-06. Worktree `../U8G2GL-4r3` | Host Tooling / Firmware Runtime | [PROJECT.md](../pr-4r3-corrections/PROJECT.md) |
| pr-4r2-corrections | **Submitted** — 4/4 WOs, PR from `u8g2gl-4r2/wo4-readability`. C++ 395 / CLI 1319, CLI 0.10.0, runtime 0.6.0. CA bridge written. Owner approved decomposition + rulings 2026-10-05. Worktree `../U8G2GL-4r2` | Host Tooling / Firmware Runtime | [PROJECT.md](../pr-4r2-corrections/PROJECT.md) |
| pr-04b-font-image-pipeline | **Submitted** — 7/7 WOs, PR from `u8g2gl-fonts/wo6-readability`. C++ 383 / CLI 1281, CLI 0.9.0. CA bridge: 9 items | Host Tooling | [PROJECT.md](../pr-04b-font-image-pipeline/PROJECT.md) |

## Recently Completed (last 5)
| Project | Completed | Modules | Key Outcome |
|---|---|---|---|
| [pr-04b-font-image-pipeline](../pr-04b-font-image-pipeline/PROJECT.md) | 2026-09-28 | Host Tooling | Merged #8. bdfconv as committed Wasm with provenance; PNG→XBM. Closes [Q-2]. All 12 departures-board font arrays byte-identical to generator output |
| [pr-4r-corrections](../pr-4r-corrections/PROJECT.md) | 2026-09-28 | Host Tooling / Firmware Runtime | 5 WOs, merged #6 + #7. Realisation made unobservable for clamping; radius bound measured against real U8G2 and pinned by a test; shared tables moved to neutral modules. Refuted a Chief Architect ruling by measurement |
| [pr-04-generator](../pr-04-generator/PROJECT.md) | 2026-09-28 | Host Tooling / Firmware Runtime | 21 WOs, merged #5. Generator emits compiling C++, plus the editor target (registry + scene JSON). C++ 361 / CLI 1044. Every U8G2 font usable |
| [pr-03-widgets](../pr-03-widgets/PROJECT.md) | 2026-09-10 | Firmware Runtime / Host Tooling | 9 WOs, merged #3. Settled [U-1] element identity |
| [pr-3r-remediation](../pr-3r-remediation/PROJECT.md) | 2026-09-13 | Firmware Runtime / Host Tooling | 12 WOs. Realigned merged PR-01/02/03 to [D-18]-[D-21], schema 0.4. C++ 240 / CLI 266, zero warnings. Three of four defects found by unifying duplicated logic |

## Older Projects
0 completed projects.
Full project history: [PROJECT_INDEX.md](PROJECT_INDEX.md)
Cross-cutting module index: [MODULE_INDEX.md](MODULE_INDEX.md)
