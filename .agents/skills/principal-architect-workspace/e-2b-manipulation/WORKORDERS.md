---
name: e-2b-wo1-wo5
description: Work Orders 1–5 of E-2b — gestures through CST edits, move, resize, guides, the drag gate
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the five named here, do not push, do not
start other work. Execute WO1 to WO5 in order.

**Parent project:** `e-2b-manipulation` ([PROJECT.md](PROJECT.md)); its rulings are binding,
especially ruling 9 (the boundary). Its parent, `e-2-canvas-editing/PROJECT.md`, holds the
owner's approval (rule 00) and the programme rulings. The design is
`e-d-editor-design/EDITOR-DESIGN.md` §3.2–§3.6 and §3.8; the UI is `docs/ui_spec.md` §8. E-2a's
records (`e-2a-selection/`) describe the selection and overlays you build on.

**Another worker is building the property panel (E-2c) at the same time,** in another worktree
from the same base. Do not touch panel code; keep shared shell files' changes small.

# Where you work

- Worktree `../U8G2GL-e2b`, starting on `u8g2gl-e2b/wo1-gestures`. Each later WO:
  `git checkout -b u8g2gl-e2b/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Record baselines first, suites one at a time. Build the framework editor Wasm before
  `npm run build:e2e` (as CI's `designer-e2e` job does).
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles. The home-path guard must pass.
- Never open a browser window on the owner's desktop: Playwright headless, `--no-open`.

# WO1 — gestures and the edit path (`u8g2gl-e2b/wo1-gestures`)

- [x] Gesture ownership (ruling 1), replacing E-2a's "every drag is a marquee".
- [x] The edit path and undo grouping (ruling 2), with unit tests: a gesture of many frames is
      one undo stop; nudges within 750 ms share one; undo restores the text exactly.
- [x] `canvasEditing` false: no gesture writes (e2e).

# WO2 — move (`u8g2gl-e2b/wo2-move`)

- [x] Drag and nudge under ruling 3, each case with a unit test and the refusals with an e2e
      case showing the tooltip and the free axis still moving.
- [x] Ruling 6's minimal diffs, tested: a nudge is a one-line diff.

# WO3 — resize, snapping, guides (`u8g2gl-e2b/wo3-resize-guides`)

- [ ] Resize from the handles under ruling 4; Shift constrains the ratio.
- [ ] Integer snapping before the edit; guides at 3 screen pixels at every zoom (ruling 5).
- [ ] An overflowing drag is allowed and hatched (e2e).

# WO4 — the drag gate (`u8g2gl-e2b/wo4-drag-gate`)

- [ ] Ruling 7's 300-frame drag on both screens, with its self-test; report p95 and frames.
- [ ] Ruling 8: allocation and GC before and after, and the changes; generator goldens
      unchanged.
- [ ] E-1e's keystroke gate still passes, its self-test included.

# WO5 — review (`u8g2gl-e2b/wo5-readability`)

- [ ] Spawn the `readability-reviewer` on E-2b's diff (against `e2bbb4f`); resolve P1–P3,
      decide P4 with reasons.
- [ ] Final run of every suite, one at a time (CLI, C++, designer unit, e2e, production build
      and its no-test-hook check); a completion report at the end of this file.
