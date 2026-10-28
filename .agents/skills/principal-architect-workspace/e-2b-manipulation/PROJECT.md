# E-2b: Direct Manipulation

**Parent:** E-2 ([e-2-canvas-editing/PROJECT.md](../e-2-canvas-editing/PROJECT.md)), whose
owner approval (2026-10-28) covers this PR's scope as its second row. **Base:** stacked on E-2a,
`u8g2gl-e2a/wo5-readability` @ `e2bbb4f` (PR #36). **Worktree:** `../U8G2GL-e2b`. **Runs
alongside E-2c** (`../U8G2GL-e2c`), which builds the property panel.

## Purpose

The canvas writes to the text. Every gesture becomes a CST edit on the one Monaco undo stack,
under EDITOR-DESIGN §3.5's rule that the canvas rewrites **the attribute that places the
element**, and never draws a position the text does not hold — at 16 ms, under 4× throttle.

## Decomposition

| WO | Topic | Branch | Status |
|---|---|---|---|
| WO1 | Gesture ownership; the edit path (intent → CST edit → Monaco); undo grouping | `u8g2gl-e2b/wo1-gestures` | ✅ `b1b4c77` |
| WO2 | Move: drag and nudge under §3.5's placement rules, with refusals | `u8g2gl-e2b/wo2-move` | ✅ `1cd61d6` |
| WO3 | Resize; integer snapping; edge and centre guides | `u8g2gl-e2b/wo3-resize-guides` | ✅ `1f77e6b` |
| WO4 | §3.4's drag gate and its self-test; the allocation spikes | `u8g2gl-e2b/wo4-drag-gate` | ✅ `40026d3` |
| WO5 | Readability review and PA verification | `u8g2gl-e2b/wo5-readability` | ✅ `d2e28e8` |

## PA rulings

1. **Gesture ownership.** A pointer-down on a selected element, or on an unselected one (which
   it selects first), starts a **move**; on a handle, a **resize**; on empty canvas, E-2a's
   marquee. Arrow keys nudge the selection while the canvas has focus (1 px; Shift 8 px). While
   `canvasEditing` is false (E-2a) no gesture writes: the cursor says why.
2. **The edit path.** Each frame of a gesture turns its intent into `TextEdit[]` with the CST
   edit functions (`cli/src/core/cst/edits.ts`) against the **current** text's CST, looked up by
   name, and applies them through `pushEditOperations`. `pushStackElement()` at the start and the
   end of each gesture (§3.6). Nudges on the same selection within 750 ms of each other share one
   stop. The pipeline still runs at most once per frame (E-1e's scheduler); intermediate texts
   are never rendered.
3. **§3.5's placement rules**, per axis, from the element's attributes in the CST:
   - integer literal (`^-?[0-9]+$`) on `x`/`y`: rewritten;
   - anchor (`right`/`bottom` set, `x`/`y` absent): rewritten **inverted**;
   - an expression or constant (anything else, e.g. `#margin + 4`): **refused on that axis**,
     the element moves on the other axis only, with §3.5's tooltip *x is computed from `…`*;
   - bound (`bind_x`/`bind_y` present): refused, tooltip *x is bound to `…`*;
   - a composite's child or `#parent_*`: not draggable; the instance is selected (E-2a already
     resolves hits so).
   An element with no attribute on an axis gains a literal (`insertAttribute`) only if the
   manifest has that prop; the default it moved from is the scene's rectangle. Never rewrite an
   expression into a literal: Detach is E-2c's.
4. **Resize** follows ruling 3 for `width`/`height`, and for `right`/`bottom` when the element is
   stretched between anchors. Shift constrains the ratio.
5. **Snapping and guides** (ui_spec §8): values are rounded to integers **before** the edit, so
   the text never holds a value the canvas did not show. Guides at sibling and display edges and
   centres, threshold 3 **screen** pixels, drawn on the overlay. Overflow is shown, not prevented
   (E-2a's hatching and Problems do the showing).
6. **Minimal diffs.** A nudge is a one-line diff of one attribute value; a drag a change only to
   the attributes ruling 3 names. Tested by diffing the text before and after.
7. **§3.4's gate** (programme ruling 1): a scripted 300-frame drag on the departures screen and on
   E-1e's 20-element screen, full shell, Chromium 4× CPU throttle. **Input event to paint p95
   under 16 ms, and no frame dropped at 60 Hz** (each input painted in its own frame, at most 1%
   missing, as E-1e's keystroke gate rules). Pass/fail locally; CI reports. A self-test forces
   misses and shows the gate fails.
8. **The allocation spikes** (E-1's follow-up): measure GC and allocation in resolve, validate
   and scene during the drag, before and after. Changes there must leave generator output
   byte-identical: if any golden moves, stop and report.
9. **Boundary:** `designer/src/` (canvas, selection, pipeline, perf), `designer/e2e/`, designer
   tests; `cli/src/core/cst/` (additive edit helpers only); `resolver/`, `validator/`, `realise/`
   and `generator/emit/scene.ts` for ruling 8 only. **Keep edits to shared shell files
   (`ui/app.tsx`, `workspace.ts`, `ui/status-bar.tsx`) small:** E-2c edits them in parallel. No
   panel work, no new dependency.

10. **The drag gate's input model** (PA, 2026-10-28, ruling on the worker's deviation 1).
    Headless Chromium delivers injected moves 3–4 per frame at random phase, so a single move's
    wait for the next frame is not the loop's latency. The gate drives a continuous 250 Hz pointer
    and measures, for each run, **the latest move that edited the text → its blit** — the position
    the frame shows (§3.2: only the latest text is drawn) — and still requires **each move to
    reach the canvas in its first frame** (at most 1% missing). This is the reading the owner
    chose for keystrokes at C3 ("Measure to the frame"); thresholds unchanged. Flagged to the
    owner at C4.

## Status log

- **2026-10-28.** Worktree created from E-2a's tip `e2bbb4f`, `extern/u8g2` checked out. WO1–WO5
  issued to one worker in order.

- **2026-10-28.** Both workers stopped at the usage limit during WO4; resumed by message, trees
  untouched in between.
- **2026-10-28. WO1–WO5 complete** (report at the end of WORKORDERS.md). Accepted: ruling 10;
  E-2a's marquee tests start below the display (a press on an element now moves); rules beyond
  ruling 3's table (centring refuses its axis, an over-constrained axis refuses resize, resize
  stops at 1 px, a refused nudge explains itself in the canvas title); ruling 3's insert path
  built and tested but unreachable from the canvas (the resolver draws no element without a start
  position); the latency constants shared in `e2e/support/latency.ts`. The PA added
  `u8g2gl:drag-to-blit` to CI's production no-hook check (outside the worker's boundary).
- **2026-10-28. PA verification** on `d2e28e8`, suites one at a time, Emscripten on PATH, no other
  worker running: guard clean; CLI 2521, lint and tsc clean; no generator golden changed; C++
  512/512; designer unit 71; e2e 42 passed. **Drag gate:** departures 300/300 in the first frame,
  input→blit p95 13.0 ms; 20 elements 300/300, p95 14.6 ms; self-test fails the gate (4 missed,
  p95 61.3 ms). Keystroke gate 300/300 on both, run→blit p95 3.8/3.7 ms. Production 3/3, no hook.
  Allocation per drag run 550 → 390 KiB (resolve 100 → 60, validate 291 → 172).
