---
name: e-2c-wo1-wo5
description: Work Orders 1–5 of E-2c — the property panel generated from manifests
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the five named here, do not push, do not
start other work. Execute WO1 to WO5 in order.

**Parent project:** `e-2c-panel` ([PROJECT.md](PROJECT.md)); its rulings are binding, especially
ruling 1 (generated, never hand-written) and ruling 10 (the boundary). Its parent,
`e-2-canvas-editing/PROJECT.md`, holds the owner's approval (rule 00) and the programme rulings.
The design is `docs/ui_spec.md` §6 (the panel region) and §9, and
`e-d-editor-design/EDITOR-DESIGN.md` §3.3, §3.5, §7 ([Q-10], [Q-19], [Q-7]) and §8. E-2a's
records (`e-2a-selection/`) describe the selection you build on.

**Another worker is building direct manipulation (E-2b) at the same time,** in another worktree
from the same base. Do not touch canvas gesture code; keep shared shell files' changes small.

# Where you work

- Worktree `../U8G2GL-e2c`, starting on `u8g2gl-e2c/wo1-panel-model`. Each later WO:
  `git checkout -b u8g2gl-e2c/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Record baselines first, suites one at a time. Build the framework editor Wasm before
  `npm run build:e2e` (as CI's `designer-e2e` job does).
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles. The home-path guard must pass.
- Never open a browser window on the owner's desktop: Playwright headless, `--no-open`.

# WO1 — the panel model (`u8g2gl-e2c/wo1-panel-model`)

- [x] A pure model (no React) from the selection and the manifest registry to panel rows:
      order and pinned geometry (ruling 2), the *From u8g2gl_obj* group, own vs inherited
      (ruling 1's additive field if needed). Unit tests on framework, project and drawing
      elements of the departures project.
- [x] The panel region in the shell (ui_spec §6, right side), showing the rows read-only.

# WO2 — editors and committing (`u8g2gl-e2c/wo2-editors`)

- [x] One editor per type (ruling 3); report on font faces.
- [x] Committing (ruling 4), with tests: each commit one undo stop, reset removes the attribute,
      typing alone writes nothing.

# WO3 — guidance (`u8g2gl-e2c/wo3-guidance`)

- [x] Inline help, live validation, defaults greyed with reset (ruling 5).
- [x] The two generic constraints (ruling 5), with their reasons.
- [x] [Q-19]'s cost rule (ruling 6).
- [x] Detach and Edit in XML (ruling 7), with e2e cases.

# WO4 — multi-selection and the budget (`u8g2gl-e2c/wo4-multi-budget`)

- [x] Multi-selection and the screen's properties (ruling 8).
- [x] Ruling 9: the scripted 300-frame stand-in, the panel's share of the frame, and the render
      count showing only the changed field re-renders. Report the numbers.
- [x] Every manifest prop of the departures project is editable from the panel (an e2e walk).

# WO5 — review and C4's evidence (`u8g2gl-e2c/wo5-readability`)

- [ ] Spawn the `readability-reviewer` on E-2c's diff (against `e2bbb4f`); resolve P1–P3,
      decide P4 with reasons.
- [ ] Screenshots for checkpoint C4, saved under `tmp/c4/`: the panel on the departures project
      with a framework element, a project widget (its *From u8g2gl_obj* group open and closed), a
      drawing element, a multi-selection, nothing selected.
- [ ] Final run of every suite, one at a time; a completion report at the end of this file.
