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

- [x] Resize from the handles under ruling 4; Shift constrains the ratio.
- [x] Integer snapping before the edit; guides at 3 screen pixels at every zoom (ruling 5).
- [x] An overflowing drag is allowed and hatched (e2e).

# WO4 — the drag gate (`u8g2gl-e2b/wo4-drag-gate`)

- [x] Ruling 7's 300-frame drag on both screens, with its self-test; report p95 and frames.
- [x] Ruling 8: allocation and GC before and after, and the changes; generator goldens
      unchanged.
- [x] E-1e's keystroke gate still passes, its self-test included.

# WO5 — review (`u8g2gl-e2b/wo5-readability`)

- [x] Spawn the `readability-reviewer` on E-2b's diff (against `e2bbb4f`); resolve P1–P3,
      decide P4 with reasons.
- [x] Final run of every suite, one at a time (CLI, C++, designer unit, e2e, production build
      and its no-test-hook check); a completion report at the end of this file.

# Completion report (worker)

**Commits** (one per WO, each on its own branch stacked on the last; base `e2bbb4f`):
WO1 `b1b4c77`, WO2 `1cd61d6`, WO3 `1f77e6b`, WO4 `40026d3`, WO5 the commit that adds this report.

**Suites, before (at `e2bbb4f`) and after (final run, one at a time, Emscripten on PATH):**

| Suite | Before | After |
|---|---:|---:|
| Home-path guard | clean | clean |
| CLI (`npm test`), lint, tsc | 2521 | 2521, lint clean |
| C++ (ctest) | 512/512 | 512/512 |
| Designer unit | 40 | 71 |
| Designer e2e (Chromium all, Firefox/WebKit `@cross-browser`) | 30 | 42 |
| Production build: no test hook in `dist/`; production e2e | 3/3 | 3/3 |

**Drag gate** (ruling 7; 4× throttle, 300 drawn moves per screen, input to end of blit). Final run:
departures 300/300 in the first frame, p95 14.1 ms (median 9.0); 20 elements 299/300 (one
3-frame miss, within the 3 allowed), p95 15.2 ms (median 9.3). Run to blit p95 5.4 / 3.9 ms.
Earlier WO4 runs: 300/300 and 300/300, p95 13.0–13.4 / 14.5–15.1 ms. The E-2c worker was running
in parallel throughout. **Self-test:** passes; four forced moves of twenty counted 3–4 frames
and the gate fails (`4 pointer move(s) missed their frame`, p95 62 ms).

**Keystroke gate:** passes, both screens 300/300 in the first frame; run to blit p95 4.1 / 3.8
ms; key to blit (reported) p95 18.8 / 18.9 ms. Self-test passes and fails the gate as it must.

**Allocation and GC** (ruling 8; `test/unit/pipeline-allocation.test.ts`, departures, 2000 runs
of a drag in Node; median KiB per run):

| Stage | Before | After |
|---|---:|---:|
| parse | 63 | 63 |
| resolve | 100 | 60 |
| realise | 38 | 38 |
| validate | 291 | 172 |
| scene | 57 | 57 |
| **run** | **550** | **390** |
| collections per 2200 runs | 40 | 29–30 |

Changes: the display catalogue's setup `Set` built once per catalogue (was every run, ~93 KiB);
each manifest's accepted attribute names built once per manifest; coordinate expressions parsed
once per text (bounded cache). Every generator golden passes unchanged. Scene was not reduced: its
allocation is the scene JSON itself.

**Deviations, for the PA:**
1. *The drag gate's input model.* DevTools-injected mouse events are not frame-aligned in
   headless Chromium (measured: 3–4 `pointermove` dispatches per frame from a 250 Hz stream), and a
   single event sent at a random phase waits up to a frame before any run can draw it: driven that
   way input→blit p95 was 22 ms, as key→blit is ~19 ms for the keystroke gate, which reports it
   rather than gating it. The gate therefore drives a continuous 250 Hz pointer and measures the
   **latest move that edited the text before the run** — the position the frame actually shows,
   since the pipeline draws only the latest text (§3.2). The gate itself (p95 < 16 ms, ≤ 1%
   missed) is as ruled. Please confirm this reading of "input event to paint".
2. E-2a's two marquee tests now start their press off the display, since ruling 1 makes a press
   on an element a move.
3. Additions beyond the rule text: centring (`hcenter`/`vcenter`) refuses an axis like an
   expression; an over-constrained axis refuses a resize; a resize stops at one pixel of size.
   Nudge refusals are shown in the canvas's title (no pointer to put a tip at).
4. The insert-a-missing-start branch of ruling 3 is implemented and unit-tested with a synthetic
   placement, but the resolver never draws an element with no start, so it is not reachable from
   the canvas today; such an element refuses with a reason.
5. CI's production hook grep does not list `u8g2gl:drag-to-blit` (`.github/` is outside ruling 9's
   boundary); the hooks module is excluded from production as before, and the check above included it.

**Readability review (WO5):** P1 0, P2 0, P3 5 (all resolved: workspace citations replaced by
the durable fact, a dangling table definition, the unused `sizeOn`, stale probe names, cache
preconditions stated), P4 4 (all taken: step labels in `DragEdit.deltas` and `down`, the
`CstDocument` type, a banner reflow). Observations not acted on: `EDITOR-DESIGN §n` pointers
(an existing convention), and module-level caches in core (deterministic, bounded or weakly keyed).
