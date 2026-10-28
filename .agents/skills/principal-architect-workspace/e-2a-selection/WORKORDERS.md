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

- [x] The selection model (ruling 2), with unit tests: survives an unrelated edit, an edit that
      moves the element's text, a rename; drops a deleted element.
- [x] Hit-testing (ruling 3), with unit tests for overlap cycling, marquee and composites.
- [x] Canvas → XML (ruling 4): reveal and decorate, focus untouched. XML → canvas via
      `element-at.ts`.
- [x] e2e: click selects and reveals; caret selects; ruling 5's version-id check.

# WO3 — overlays and the status bar (`u8g2gl-e2a/wo3-overlays`)

- [x] Handles and a live `x, y, w, h` badge on each selected element; marquee rectangle while
      dragging one. Drawn over the framebuffer, never into it, crisp at every zoom.
- [x] The status bar's selection geometry (ui_spec §6): one element's rectangle, or the bounding
      box of several.
- [x] Ruling 6: show with a test or a render count that a selection change re-renders only the
      overlay and the status bar; E-1e's keystroke gate and its self-test still pass locally.

# WO4 — §3.8's states (`u8g2gl-e2a/wo4-states`)

- [x] Hatching for invalid-but-buildable elements (ruling 7), with an e2e case (an overflow).
- [x] The dimmed last good frame for unbuildable or not well-formed text; the banner for not
      well-formed, with its line and column.
- [x] `canvasEditing` exposed and tested (false only when not well-formed).

# WO5 — review (`u8g2gl-e2a/wo5-readability`)

- [x] Spawn the `readability-reviewer` on E-2a's diff; resolve P1–P3, decide P4 with reasons.
- [x] Final run of every suite, one at a time (CLI, C++, designer unit, e2e, production build
      and its no-test-hook check); a completion report at the end of this file.

# Completion report (worker, 2026-10-28)

**Commits** (branches stacked, each from the previous tip; nothing pushed):

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e2a/wo1-scene-range` | `a1e0b6d` |
| WO2 | `u8g2gl-e2a/wo2-selection` | `73de8e8` |
| WO3 | `u8g2gl-e2a/wo3-overlays` | `7b8ff8b` |
| WO4 | `u8g2gl-e2a/wo4-states` | `d574184` |
| WO5 | `u8g2gl-e2a/wo5-readability` | the review fixes and this report |

**Suites, before → after** (run one at a time, locally):

| Suite | Before (`fd717b1`) | After |
|---|---|---|
| CLI (vitest) | 2514 passed, 6 skipped | 2515 passed, 6 skipped; lint clean |
| C++ (ctest) | 512 (1 skipped) | 512 (1 skipped), zero warnings |
| Wasm tests (snapshot, placeholder, last-error) | pass | pass, against the regenerated scene golden |
| Designer unit | 20 | 40 |
| Designer e2e | 14 | 30 (Chromium 26, Firefox 2, WebKit 2) |
| Production build + hook grep + production e2e | pass, 3 | pass (no hook string), 3 |

**Keystroke gate** (Chromium, 4× CPU, 300 keys per screen, local, final run): departures
300/300 in the first frame, run→blit p95 3.9 ms (baseline 4.0); 20 elements 300/300,
p95 3.8 ms (baseline 299/300, 3.8). Key→blit p95 18.6 / 19.1 ms (reported only). Self-test:
the four forced keys counted 4 frames each and the gate failed, as it must.

**Ruling 6:** five selection changes (click, cycle, another element, marquee, Esc) render
`SelectionGeometry` five times and no other shell component; a self-test shows a canvas
panel change is counted.

**Deviations and decisions, with reasons:**

1. *WO1 touches the parser and schema, outside ruling 8's file list.* `scene.ts` cannot
   reach offsets without them: `WidgetNode` gains an optional `range`, copied from the raw
   element in `parse-widget-tree.ts` (two lines, additive). Only the editor scene golden
   moved, by exactly `start`/`end` per element; the C++ goldens do not carry `source`. The
   scene format stays at version 3 (hosts ignore keys they do not read; the bridge reads no
   `source`). CI's determinism condition watches only `cli/test/generator/fixtures/*/expected/`,
   so it passes trivially here; the bump is still made, as ruling 1 requires.
2. *The designer reads element ranges from the current CST, not the scene's `start`/`end`.*
   EDITOR-DESIGN §3.7 maps a hit by name, and the scene is withheld or stale while the text
   is broken; the current text's spans are always right. The scene's ranges are there for
   E-2b.
3. *A name drops out when it is gone from the CST;* the scene supplies only geometry, so an
   element with nothing drawn can still be selected from the caret.
4. *A canvas selection opens (or brings forward) its file's editor tab* so it can be
   revealed; the request carries no position, so it neither moves the caret nor takes focus.
5. *A drag anywhere is a marquee* until E-2b claims drags that start on a selection.
   Shift-click toggles and Shift-marquee adds, beyond the ruling's minimum.
6. *§3.8:* the pipeline now describes a scene despite errors when the emitter can; a throw
   on a model with errors means unbuildable, a throw with none is re-thrown. The
   unbuildable state keeps its error-count banner from E-1e; only not-well-formed gets the
   *XML not well-formed at L:C* banner. `canvasEditing` is false while **any** project
   document is not well-formed (the frame is stale then anyway).
7. *Render counting* is a test-build-only counter (`perf/render-count.ts`), compiled away in
   production, since React's Profiler is inert in a production bundle.

**Readability review:** P1 0, P2 0, P3 2 (both fixed: element-at's Purpose, hit-test's export
list), P4 9. Done: step comments in `problemElements` and `up`, the needless optional
chaining, a local `Box` alias in `canvas-view.ts`, the status-bar export list and the
test-hooks wrap. Declined: renaming `Selection` (it shadows the DOM type but ripples through
imports; the architect's call); moving `TextChange` to `documents/` (it is defined beside
`mapOffset`, which gives it its meaning); one constant per colour (the CSS cannot share a TS
constant, so it would still be written twice); sharing the specs' `open()` and the overlay
margin (each spec's `open` differs slightly, and importing `canvas-view.ts` into Node specs
would load DOM code for one number).

