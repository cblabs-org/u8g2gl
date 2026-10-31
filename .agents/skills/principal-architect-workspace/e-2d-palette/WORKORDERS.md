---
name: e-2d-wo1-wo6
description: Work Orders 1–6 of E-2d — palette, insert, delete, duplicate, align, font heights, Monaco split
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the six named here, do not push, do not
start other work. Execute WO1 to WO6 in order.

**Parent project:** `e-2d-palette` ([PROJECT.md](PROJECT.md)); its rulings are binding,
especially ruling 10 (the boundary). Its parent, `e-2-canvas-editing/PROJECT.md`, holds the
owner's approval (rule 00), the programme rulings and C4's decision. The design is
`e-d-editor-design/EDITOR-DESIGN.md` §3.4–§3.6 and §8, and `docs/ui_spec.md` §6 (the activity bar and primary sidebar, where the Palette lives) and
§8. E-2a's, E-2b's and E-2c's records describe the selection, gestures and panel you build on —
read E-2b ruling 3 (placement) and E-2c ruling 11 with its amendment (how the drag gate
measures).

# Where you work

- Worktree `../U8G2GL-e2d`, starting on `u8g2gl-e2d/wo1-palette`. Each later WO:
  `git checkout -b u8g2gl-e2d/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Record baselines first, suites one at a time. Build the framework editor Wasm before
  `npm run build:e2e` (as CI's `designer-e2e` job does).
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles. The home-path guard must pass.
- Never open a browser window on the owner's desktop: Playwright headless, `--no-open`.
- **Timing runs:** after each, check `pmset -g log` (read only) for Sleep or DarkWake inside its
  window; a run that overlaps one is void and repeated. Change no power setting.

# WO1 — palette and insert (`u8g2gl-e2d/wo1-palette`)

- [x] The palette (ruling 1) in the primary sidebar behind the activity bar's Palette entry (ui_spec §6), generated, with its filter. If the shell has no activity bar yet, add the smallest one that switches Explorer and Palette, and report it.
- [x] Generated names (ruling 3), unit-tested against the validator.
- [x] Drag-to-insert (ruling 2): screen and container drops, refusals with reasons; one undo
      stop and a minimal diff (e2e and unit).

# WO2 — delete and duplicate (`u8g2gl-e2d/wo2-delete-duplicate`)

- [x] Delete (ruling 4), single and multi, with the whitespace rule unit-tested.
- [x] Alt-drag duplicate (ruling 5), single and multi; refusals as a move's.

# WO3 — align and distribute (`u8g2gl-e2d/wo3-align`)

- [x] The toolbar (ruling 6), every command unit-tested on literal, anchored and refusing
      elements; e2e for each from the canvas.

# WO4 — font heights (`u8g2gl-e2d/wo4-font-heights`)

- [x] Ruling 7: the generated height table, its test, the panel showing heights for built-ins.
      Report whether any golden or the CLI version moved.

# WO5 — Monaco split and the gates (`u8g2gl-e2d/wo5-split-gates`)

- [x] Before anything else in this WO, record production `dist` size and initial-load JS (gzip).
- [x] Ruling 8's split; the sizes after.
- [x] Every timing gate re-measured on the finished tree, three clean runs of the drag gate;
      thresholds and self-tests unchanged.

# WO6 — review and evidence (`u8g2gl-e2d/wo6-readability`)

- [x] Spawn the `readability-reviewer` on E-2d's diff (against the base); resolve P1–P3, decide
      P4 with reasons.
- [x] Screenshots under `tmp/e2d/`: the palette with all three groups, the filter in use, an
      insert just dropped, the align toolbar enabled and with a refusal.
- [x] Final run of every suite, one at a time (guard; CLI, lint, tsc; goldens; C++; Wasm then
      `build:e2e`; designer unit; e2e; production and its no-hook grep); a completion report at
      the end of this file.

# Completion report (worker, 2026-10-31)

**Commits:**
| WO | Branch | Commit(s) |
|---|---|---|
| WO1 | `u8g2gl-e2d/wo1-palette` | `4eccc32` (palette, names), `ac5b2c7` (insert, under ruling 11) |
| WO2 | `u8g2gl-e2d/wo2-delete-duplicate` | `3d41e83` |
| WO3 | `u8g2gl-e2d/wo3-align` | `a2f6533` |
| WO4 | `u8g2gl-e2d/wo4-font-heights` | `c8d9c3a` (CLI 0.13.4 → 0.13.5) |
| WO5 | `u8g2gl-e2d/wo5-split-gates` | `e79c9ba` |
| WO6 | `u8g2gl-e2d/wo6-readability` | `d62ed03` (review fixes), and this report |

**Suites, before (base `8029f65`) → after:**
| Suite | Before | After |
|---|---|---|
| Home-path guard | self-test 11/11, clean | self-test 11/11, clean |
| CLI tests | 2517 passed, 6 skipped | 2521 passed, 6 skipped |
| CLI lint and test `tsc` | clean | clean |
| Emscripten CLI tests | — | 50 passed, none skipped |
| C++ (ctest) | 512/512 | 512/512, 0 warnings |
| Wasm | 3/3 | 3/3 |
| Designer unit | 98 | 126 |
| Designer e2e | 58 | 67 |
| Production e2e | — | 3/3, no hook in `dist` |

**Bundle sizes (production `npm run build`, gzip by Node's zlib default):**
| Measured at | `dist` bytes | `dist` files | Initial-load JS bytes | Initial-load JS gzip |
|---|---|---|---|---|
| Base | 16,274,439 | 98 | 5,727,644 | 1,340,349 |
| WO5 start | 16,344,753 | 98 | 5,797,080 | 1,354,530 |
| After the split | 5,979,203 | 10 | 1,814,779 | 347,068 |

**Timing gates.** Every gate below was measured on the finished tree. No Sleep, DarkWake or Wake event fell in any run's window, and each self-test failed its gate as it should.

Drag gate, input→blit p95 in ms, every move painted in its first frame:
| Run | departures 1× | departures 2× | 20 elements 1× | 20 elements 2× |
|---|---|---|---|---|
| 1 | 8.6 | 8.7 (299/300 in the first frame) | 10.3 | 10.2 |
| 2 | 10.3 | 8.9 | 8.5 | 8.5 |
| 3 | 8.7 | 7.4 | 9.3 | 8.1 |
| Final | 9.1 | 8.3 | 8.2 | 8.3 |

The other gates, from the final run:
- **Keystroke gate** (run→blit p95): departures 4.0 ms (299/300 keystrokes in their first frame), 20 elements 3.4 ms.
- **Panel share** (p95): 0.9 ms.

**Goldens and versions:**
- No generator golden moved.
- The CLI went 0.13.4 → 0.13.5 for the catalogue data, as ruling 7 provides.
- No schema or runtime change.
- No dependency was added.

**Screenshots, in `tmp/e2d/`:**
- `palette-groups.png`
- `palette-filter.png`
- `insert-dropped.png`
- `align-enabled.png`
- `align-refusal.png`

**Readings and deviations:**
- **Insert follows ruling 11.**
  - Size comes from `INSERT_SIZE` (16 × 8).
  - The container is the innermost element under the drop point that already has element children, else `<view>`. An element child here means a child the registry knows, not `<style>` or a binding.
  - A point extra is spread over `INSERT_SIZE` so that a line or triangle is visible.
  - A length extra (radius, `rx`, `ry`) is set to half the size along the axes it spans.
- **Duplicate also renames the copy's named descendants.** Ruling 5 says the copy is verbatim except `name`, but a copied child would otherwise duplicate its original's name in the same screen.
- **Delete skips an element inside another selected element.** The ancestor's removal already takes it.
- **`overlays.spec.ts` admits `AlignToolbar`.** Its buttons depend on the selection, so the toolbar is now allowed among the components that may re-render on a selection change. It re-renders only when which buttons are enabled changes, at most twice in that test. This is not a timing gate.
- **The canvas toolbar now wraps when narrow.** Otherwise its items overlapped.
- **Before Monaco loads, nothing opens a document.** Monaco loads after the canvas's first frame or on an editor tab's request. Until then no model exists, so a canvas edit made in that window does nothing.
- **Review P4s declined:**
  - The shared `nameOf` helper: a one-line private getter, and sharing it would couple two modules for nothing.
  - Splitting `planInsert`'s Step 3: it is already step-commented, and the split is structure rather than documentation.

