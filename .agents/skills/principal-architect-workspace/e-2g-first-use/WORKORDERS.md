---
name: e-2g-wo1-wo4
description: Work Orders 1–4 of E-2g — designer first-use fixes (activity icons, visible saving, shape resize)
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.
Do not change the design, do not create any branches beyond the four named here, do not push, and
do not start other work. Execute WO1 to WO4 in order.

**Parent project:** `e-2g-first-use` ([PROJECT.md](PROJECT.md)). Its rulings are binding.
The owner's approval is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO4.

# Where you work

- **Worktree:** `../U8G2GL-e2g`, starting on `u8g2gl-e2g/wo1-activity-icons` (based on `60a4202`).
  For each later WO, run `git checkout -b u8g2gl-e2g/woN-<name>` from the previous tip.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time. Build the framework editor
  Wasm before `npm run build:e2e`. The e2e suite needs `npm run build:e2e`, never the production
  build; production is checked with `npm run build` and `test:e2e:production`. Emscripten:
  `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh` (never commit
  that path).
- **Standards:** load `u8g2gl-standards` before writing code. No workspace pointers in source
  comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Timing runs:** after each one, read `pmset -g log` (read only). A run that overlaps a Sleep
  or DarkWake is void and must be repeated. Change no power setting.
- **Versions:** never tag, never publish. Bump only what WO4 names.

# WO1 — activity bar icons (`u8g2gl-e2g/wo1-activity-icons`)

- [x] Ruling 1: `activity-bar.tsx` draws `<Icon>` per view (files, shapes, image, type, database,
      workflow, search) in place of the glyphs. The label stays "Palette". Size and colour suit
      the bar's existing `.activity` styling, and the active and disabled states still read.
- [x] Unit test: every view's icon resolves through `resolveIcon`.
- [x] e2e: the activity bar draws an icon for each view, and none has `data-icon-missing`.

# WO2 — visible saving (`u8g2gl-e2g/wo2-saving`)

- [x] Ruling 2: the status-bar "● N unsaved · Save" button (save all, with a tooltip listing the
      files and the shortcuts), absent while nothing is dirty.
- [x] The canvas toolbar's Save button, enabled only while the drawn screen is dirty.
- [x] ⌘S / Ctrl-S falls back to the canvas's file when no editor tab is active. ⌘⌥S / Ctrl-Alt-S
      saves all. `preventDefault` on both.
- [x] The Explorer shows a visible ● on a dirty file.
- [x] Save-all goes through `ProjectDocuments.save` per file, so E-2f's failure and conflict
      behaviour holds for each file.
- [x] Render counts: no new re-render of the Palette, the Explorer or the canvas on a keystroke
      or a drag. The existing render-count tests stay green.
- [x] Unit tests for the status text (zero, one and several files) and for the ⌘S target choice.
- [x] e2e: edit on the canvas, then the status Save appears, a click saves (the file on disk
      changes) and the button disappears; ⌘S with only the canvas active saves; the canvas Save
      button's enabled state follows dirtiness.

# WO3 — resize by points and radii (`u8g2gl-e2g/wo3-shape-resize`)

- [x] Ruling 3 in `resize-rules.ts`, or beside it, in the style of `placement-rules.ts`:
      - line and triangle box handles scale the vertices about the opposite edge, rounded;
      - circle `radius` and ellipse `rx`/`ry` follow the handles, with the anchor derived from
        the resolver;
      - `hline`/`vline` keep resizing on the axis they have.
- [x] Vertex handles for a single selected line or triangle: drawn by the canvas and hit-tested
      before the box handles. Dragging one moves that vertex alone. The cursor and snapping
      behave like the existing handles.
- [x] Refusals follow the existing rule (integer literals only; bindings and expressions refuse
      with a reason), and clamps keep each size at least one pixel.
- [x] The property panel says "Can't resize: <reason>" for a selected element whose resize is
      refused on an axis.
- [x] Each gesture is one undo step, through the existing edit path.
- [ ] Unit tests and e2e, as ruling 4 lists. The existing resize and move specs stay green.
      *(Worker: all done except the circle e2e, which is blocked: the canvas cannot select a
      circle, ellipse, hline or vline. See the completion report.)*
- [x] If a resolver helper is needed in `cli/src/core`, keep it minimal, test it, and report it.
      *(Worker: none needed. `drawnExtent()` and the resolved extras were enough.)*

# WO4 — docs, version, review, evidence (`u8g2gl-e2g/wo4-docs-review`)

- [x] Ruling 5's docs: the save affordances in `docs/ui_spec.md`, with §4's "save (debounced)"
      corrected; the resize behaviour for point and radius shapes; and a `ChangeLog` line.
- [x] CLI 0.16.1 → 0.16.2, in the files the 0.16.0 → 0.16.1 bump touched. No schema or runtime
      change. Show that no golden moved.
- [x] Spawn the `readability-reviewer` on E-2g's diff against `60a4202`. Resolve P1–P3, and
      decide P4 with reasons.
- [x] Screenshots under `tmp/e2g/`: the activity bar, the status Save, a triangle with its
      vertex handles, and a refusal line in the property panel.
- [x] A final run of every suite, one at a time: guard; CLI, lint and tsc; goldens; C++; Wasm,
      then `build:e2e`; designer unit; e2e; production and its no-hook grep;
      `check-package.mjs`. Then write a completion report at the end of this file: commits,
      suite counts, decisions, and anything left open.

# WO5 — select shapes boxed by their drawn extent (`u8g2gl-e2g/wo5-extent-selection`)

Added by the PA after WO4, under PROJECT.md's amendment. Cut the branch from the WO4 tip.

- [ ] `rectangleOf()` in `designer/src/pipeline/live-pipeline.ts` gains one last fallback: the
      box from `drawnExtent()`, used only where it returns `undefined` today. An hline or vline
      gets a one-pixel thickness on the axis it only starts on. The two existing paths are
      unchanged.
- [ ] Unit test: a box, label, line and triangle get the same rectangle as before; a circle,
      ellipse (including a `segments` quadrant), hline and vline get their drawn extent.
- [ ] e2e: select a circle on the canvas and resize it by a handle, checking `radius` (and
      `x`/`y` where the anchor demands it); select an hline and resize its width. Tick WO3's
      circle e2e box.
- [ ] Remove the "not yet reachable" notes from `docs/ui_spec.md` §8 and the ChangeLog.
- [ ] Run, one at a time: CLI lint and tsc; designer unit; `build:e2e`; e2e; production and
      `test:e2e:production`; `check-package.mjs`. Append a WO5 section to the completion
      report below, with the commit, counts and anything left open.

# Completion report (worker, 2026-11-11)

**Provenance.** Read from PROJECT.md's status log before work began: the owner's "Palette is fine. Approved to proceed autonomously." of 2026-11-11, and the PA's entry creating this worktree from `60a4202` and spawning this worker on WO1–WO4.

## Commits

Each branch is cut from the one before. Nothing is pushed, tagged or published.

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e2g/wo1-activity-icons` | `58e68f1` |
| WO2 | `u8g2gl-e2g/wo2-saving` | `69a3a9e` |
| WO3 | `u8g2gl-e2g/wo3-shape-resize` | `1437157` |
| WO4 | `u8g2gl-e2g/wo4-docs-review` | `062fd49` (docs, version), `8e44904` (review fixes), and this report |

## Versions

CLI 0.16.1 → **0.16.2** in `cli/package.json` and `cli/package-lock.json`, the files the 0.16.0 → 0.16.1 bump touched, with a `0.16.2` line under `cli v0.16.xx` in `ChangeLog`. No schema or runtime change. `refresh-goldens.mjs`, run on the built 0.16.2 CLI, leaves an **empty diff**.

## Suites, before and after (one at a time)

| Suite | Before (`0274f6a`) | After (`8e44904`) |
|---|---|---|
| Home-path guard | self-test 11/11; clean | self-test 11/11; clean |
| CLI `npm test` | 2750 passed, 23 skipped (130 files) | the same |
| CLI lint and tsc | clean | clean |
| Goldens (`test/generator`) | 279 passed | 279 passed |
| C++ (Debug) | 515/515, 1 skipped (`SizeOfReport.ThirtyTwoBitTarget`); 0 warnings | the same |
| Wasm editor build; snapshot, placeholder, last-error | pass | pass |
| `build:e2e` | builds | builds |
| Designer unit | 163 passed | 187 passed |
| Designer e2e | 85 passed | 92 passed |
| Production build: no-hook grep / `test:e2e:production` | clean / 3 passed | clean / 3 passed |
| `check-package.mjs` | PASS, 0.16.1, 15,348,185 bytes, 771 files | PASS, 0.16.2, 15,349,735 bytes, 771 files |

- **No e2e failure or flake** in any full run: 85 at baseline (16:51), 89 at WO2 (17:06), 92 at WO3 (17:20) and 92 final (17:28).
- **Timing runs.** `pmset -g log` shows the last Wake at 08:00:11 and no Sleep, DarkWake or Wake after it, so none is void.

## Decisions under the rulings

- **WO1.** The view list moved to a pure `ui/activity-views.ts` so the unit test can call `resolveIcon` without a bundler. The palette spec waited for the Lucide sprite after clicking Palette; the activity bar now loads it with the shell, so the wait starts before `openShell`.
- **WO2.**
  - The canvas's file is a new `Workspace.canvasFile`, derived from the drawn frame's hit targets. It notifies only when the file changes, so the toolbar's Save (`ui/canvas-save-button.tsx`, memoised) never renders per frame.
  - The status-bar button (`UnsavedSave`) reads only the dirty set. Its text and the ⌘S target choice are pure, in `ui/save-status.ts`.
  - Save-all is sequential and sorted, each file through `ProjectDocuments.save`. Output is shown once if any failed.
  - ⌘⌥S matches `event.code === 'KeyS'` as well as the key, because Option+S on a Mac yields `ß`.
  - The Explorer's ● is now a real element outside the label's ellipsis, in the accent colour.
- **WO3, anchoring.** For a circle or ellipse, whether `x`/`y` is the centre or a corner is read from the resolver's `drawnExtent()`: an edge whose `from` list includes the radius coordinate reaches past the centre by it. That gives a `reach` of `[before, after]` per axis, so `segments` quadrants come out right.
  - The radius changes by the edge's delta over `before + after`.
  - The centre moves by `before` (end edge) or `after` (start edge) times the radius change, so the opposite edge stays exactly put.
  - A whole circle's moving edge therefore lands in two-pixel steps.
- **WO3, the circle's "larger of the two".** Only axes the pointer actually moved ask for a radius. Because `DragEdit` maps a side handle to `end` on the other axis (its Shift rule), a circle's side handle grows the other axis from its end edge, as a box's Shift-side does.
- **WO3, other choices.**
  - A line or triangle whose points share one coordinate on an axis refuses that axis ("…has no width to scale"). Its vertex handles still work.
  - Vertex handles are round and filled, so they read apart from the box's squares. A vertex snaps as a 1×1 move.
  - The property-panel line is a new `PanelSummary.resize`, built from `resizeRefusalReasons()` with both corners' handles.
- **WO3, cli/src/core.** **No change was needed.** `drawnExtent()`, `SEGMENT_EXTENTS` and the resolved extras were enough.
- **WO4 review (readability-reviewer).** No P1 or P2 findings.
  - All three P3s are fixed: a workspace-document citation in two new headers, the stale ⌘S comment in `app.tsx`, and a misplaced sentence in the Explorer header.
  - P4s taken: the overlay's "Step 2b" is renumbered, and `Workspace.save()` gains `@param`.
  - P4 declined: moving `saveTarget` out of `ui/`. `workspace.ts` pulls in Monaco through `ProjectDocuments`, so the pure helper would lose its browser-free unit test.
  - P4 declined: sharing `Point` with `canvas-view.ts`. The canvas keeps local shape types by design, so it does not depend on `editing/`, as its `Box` alias already says.

## Left open, and a deviation from ruling 3

**Circles, ellipses, hlines and vlines cannot be selected on the canvas, so their resize is not reachable.**
- `rectangleOf()` in `designer/src/pipeline/live-pipeline.ts` builds hit rectangles from `x/y/width/height`, or from point extras. It does not use `drawnExtent()`, which the ruling assumed.
- A circle (a `length` extra) and an hline (no `height`) therefore get no hit target, no bounds and no placement.
- `pipeline/` is outside this PR's boundary, so I did not change it.

What is done for these elements:
- The rules for a circle's and an ellipse's radii, quadrants included, are implemented in `editing/shape-resize-rules.ts`.
- Those rules, and the hline's axis behaviour, are unit-tested with placements built by the same resolver.
- The circle e2e ("resize a circle") is **not** written, and its WO3 box stays unticked.
- `docs/ui_spec.md` §8 and the ChangeLog say plainly that these are not yet reachable.

The fix is small:
- Box `rectangleOf()` by `drawnExtent()`, falling back to a one-pixel span on an axis the element only starts on (an hline's `y`).
- Add a circle e2e.

That needs the PA's go-ahead, because it changes hit-testing for every shape.

Screenshots are in `tmp/e2g/`: `activity-bar.png`, `status-save.png`, `shell-unsaved.png`, `triangle-vertex-handles.png` and `resize-refusal.png`.
