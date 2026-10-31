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

- [ ] Ruling 7: the generated height table, its test, the panel showing heights for built-ins.
      Report whether any golden or the CLI version moved.

# WO5 — Monaco split and the gates (`u8g2gl-e2d/wo5-split-gates`)

- [ ] Before anything else in this WO, record production `dist` size and initial-load JS (gzip).
- [ ] Ruling 8's split; the sizes after.
- [ ] Every timing gate re-measured on the finished tree, three clean runs of the drag gate;
      thresholds and self-tests unchanged.

# WO6 — review and evidence (`u8g2gl-e2d/wo6-readability`)

- [ ] Spawn the `readability-reviewer` on E-2d's diff (against the base); resolve P1–P3, decide
      P4 with reasons.
- [ ] Screenshots under `tmp/e2d/`: the palette with all three groups, the filter in use, an
      insert just dropped, the align toolbar enabled and with a refusal.
- [ ] Final run of every suite, one at a time (guard; CLI, lint, tsc; goldens; C++; Wasm then
      `build:e2e`; designer unit; e2e; production and its no-hook grep); a completion report at
      the end of this file.
