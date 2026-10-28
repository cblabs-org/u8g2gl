---
name: e-2a-wo1-wo5
description: Work Orders 1–5 of E-2a — scene ranges, selection both ways, overlays, §3.8 states
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the five named here, do not push, do not
start other work. Execute WO1 to WO5 in order.

**Parent project:** `e-2a-selection` ([PROJECT.md](PROJECT.md)); its rulings are binding,
especially ruling 8 (the boundary). Its parent, `e-2-canvas-editing/PROJECT.md`, holds the
owner's approval (rule 00) and the programme rulings. The design is
`e-d-editor-design/EDITOR-DESIGN.md` §3.1, §3.3, §3.7 and §3.8; the UI is `docs/ui_spec.md` §4.3,
§6 (the status bar) and §8. E-1e's records (`e-1e-shell/`) describe the shell you build on.

# Where you work

- Worktree `../U8G2GL-e2a`, starting on `u8g2gl-e2a/wo1-scene-range`. Each later WO:
  `git checkout -b u8g2gl-e2a/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Record baselines first (CLI, C++, designer unit, designer e2e), suites one at a time. The
  designer's e2e build bundles the framework editor Wasm: build the Wasm first
  (`emcmake cmake -B build-wasm …`, target `u8g2gl_editor`, as CI's `designer-e2e` job does),
  then `npm run build:e2e`.
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles. The home-path guard (`scripts/check-home-paths.mjs`) must pass.
- Never open a browser window on the owner's desktop: Playwright headless, `--no-open`.

# WO1 — the scene's range (`u8g2gl-e2a/wo1-scene-range`)

- [x] `source` gains `start` and `end` (ruling 1). Unit test on a multi-line element.
- [x] Regenerate the goldens; check that the only change in each is the two new fields.
- [x] CLI 0.13.3 → 0.13.4 wherever stamped or asserted; CI's determinism script passes locally.
- [x] Confirm the bridge and runtime ignore `source` (ruling 1).

# WO2 — selection (`u8g2gl-e2a/wo2-selection`)

- [ ] The selection model (ruling 2), with unit tests: survives an unrelated edit, an edit that
      moves the element's text, a rename; drops a deleted element.
- [ ] Hit-testing (ruling 3), with unit tests for overlap cycling, marquee and composites.
- [ ] Canvas → XML (ruling 4): reveal and decorate, focus untouched. XML → canvas via
      `element-at.ts`.
- [ ] e2e: click selects and reveals; caret selects; ruling 5's version-id check.

# WO3 — overlays and the status bar (`u8g2gl-e2a/wo3-overlays`)

- [ ] Handles and a live `x, y, w, h` badge on each selected element; marquee rectangle while
      dragging one. Drawn over the framebuffer, never into it, crisp at every zoom.
- [ ] The status bar's selection geometry (ui_spec §6): one element's rectangle, or the bounding
      box of several.
- [ ] Ruling 6: show with a test or a render count that a selection change re-renders only the
      overlay and the status bar; E-1e's keystroke gate and its self-test still pass locally.

# WO4 — §3.8's states (`u8g2gl-e2a/wo4-states`)

- [ ] Hatching for invalid-but-buildable elements (ruling 7), with an e2e case (an overflow).
- [ ] The dimmed last good frame for unbuildable or not well-formed text; the banner for not
      well-formed, with its line and column.
- [ ] `canvasEditing` exposed and tested (false only when not well-formed).

# WO5 — review (`u8g2gl-e2a/wo5-readability`)

- [ ] Spawn the `readability-reviewer` on E-2a's diff; resolve P1–P3, decide P4 with reasons.
- [ ] Final run of every suite, one at a time (CLI, C++, designer unit, e2e, production build
      and its no-test-hook check); a completion report at the end of this file.
