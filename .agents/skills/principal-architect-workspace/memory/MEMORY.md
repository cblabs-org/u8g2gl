# Principal Architect Memory
<!-- Last updated: 2026-09-28T14:55:00Z — was: 2026-09-05T10:59:27Z -->

## Active Programs
| Program | Plan | Status |
|---|---|---|
| [U8G2GL](../PROGRAM.md) | [PROGRAM-PLAN.md](../PROGRAM-PLAN.md) | Executing — PR-01/02/03/3R/04/4R merged (through #7); PR-04b next, then PR-4R2; editor track (E-1..3) still placeholders |

## Active Projects
| Project | Status | Modules | Context |
|---|---|---|---|
| pr-04b-font-image-pipeline | **Active** — WO1/6 (bdfconv Wasm). Worktree `../U8G2GL-04b`, branches `u8g2gl-fonts/wo<N>-*`, base `main` @ `453f9f3` | Host Tooling | [PROJECT.md](../pr-04b-font-image-pipeline/PROJECT.md) |

## Recently Completed (last 5)
| Project | Completed | Modules | Key Outcome |
|---|---|---|---|
| [pr-4r-corrections](../pr-4r-corrections/PROJECT.md) | 2026-09-28 | Host Tooling / Firmware Runtime | 5 WOs, merged #6 + #7. Realisation made unobservable for clamping; radius bound measured against real U8G2 and pinned by a test; shared tables moved to neutral modules. Refuted a Chief Architect ruling by measurement |
| [pr-04-generator](../pr-04-generator/PROJECT.md) | 2026-09-28 | Host Tooling / Firmware Runtime | 21 WOs, merged #5. Generator emits compiling C++, plus the editor target (registry + scene JSON). C++ 361 / CLI 1044. Every U8G2 font usable |
| [pr-03-widgets](../pr-03-widgets/PROJECT.md) | 2026-09-10 | Firmware Runtime / Host Tooling | 9 WOs, merged #3. Settled [U-1] element identity |
| [pr-02-cli-schema](../pr-02-cli-schema/PROJECT.md) | 2026-09-09 | Host Tooling | 6 WOs, merged #2. Schema, validator, display catalogue |
| [pr-3r-remediation](../pr-3r-remediation/PROJECT.md) | 2026-09-13 | Firmware Runtime / Host Tooling | 12 WOs. Realigned merged PR-01/02/03 to [D-18]-[D-21], schema 0.4. C++ 240 / CLI 266, zero warnings. Three of four defects found by unifying duplicated logic |

## Older Projects
0 completed projects.
Full project history: [PROJECT_INDEX.md](PROJECT_INDEX.md)
Cross-cutting module index: [MODULE_INDEX.md](MODULE_INDEX.md)
