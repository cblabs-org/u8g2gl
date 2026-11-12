---
name: e-2h-wo1-wo3
description: Work Orders of E-2h — the Outlines toggle, line end handles, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the three named here.
- Do not push.
- Do not start other work.

Execute **WO1, then WO3, then WO2**. That is the order the parent project's numbering note sets.

**Parent project:** `e-2h-outlines-lines` ([PROJECT.md](PROJECT.md)). Its rulings are binding.
The owner's approval is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO2.

# Where you work

- **Worktree:** `../U8G2GL-e2h`, starting on `u8g2gl-e2h/wo1-element-outlines` (based on
  `0655a79`). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e2h/wo3-line-ends`, then `u8g2gl-e2h/wo2-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm before `npm run build:e2e`.
  - The e2e suite needs `npm run build:e2e`, never the production build.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
- **Standards:** load `u8g2gl-standards` before writing code. No workspace pointers in source
  comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Timing runs:** after each one, read `pmset -g log` (read only). A run that overlaps a Sleep
  or DarkWake is void and must be repeated. Change no power setting.
- **Known flake:** `drag-performance.spec.ts:256` ("forced move 9") fails intermittently on CI
  and on main. Do not change it. If it fails locally, re-run it alone and report both runs.
- **Versions:** never tag, never publish. Bump only what WO2 names.

# WO1 — the Outlines toggle (`u8g2gl-e2h/wo1-element-outlines`)

- [x] Ruling 1: a new overlay kind `outline` in `canvas-view.ts`, with its colour, dashed
      border, faint fill and place in the draw order.
- [x] `EditLoop` composes outline rectangles from `bounds` while outlines are on, apart from
      the selection and problem rectangles, so each can change alone.
- [x] The toolbar toggle in `canvas-panel.tsx`, beside freeze, remembered in `localStorage`
      through try/catch.
- [x] Unit tests (ruling 3) and e2e (ruling 3's first two items). Render counts unchanged.

# WO3 — line end handles (`u8g2gl-e2h/wo3-line-ends`)

- [x] Ruling 2: one rule says which elements are line-shaped, by element, not by box shape.
- [x] A single selected line draws end handles only, with no box handles. `u8g2gl_line` keeps
      its vertex handles. `hline` and `vline` gain two end handles each.
- [x] Plan the hline and vline end drags (`x`/`width`, `y`/`height`), with clamping and the
      literal-only refusal, through the existing edit path as one undo step.
- [x] The property panel shows no "Can't resize" line for an axis a line has no handle on.
      Real refusals on an end still show.
- [x] Unit tests and e2e (ruling 3). The existing resize, move and vertex specs still pass.

# WO2 — docs, version, review, evidence (`u8g2gl-e2h/wo2-docs-review`)

- [x] Ruling 4: `ui_spec` §4 and §8, the `ChangeLog`, and CLI 0.16.3 in `cli/package.json` and
      its lock file.
- [x] Run the readability review (the `readability-reviewer` agent, or the standards skill's
      checklist) over the E-2h diff, and fix its findings.
- [x] Re-run every suite one at a time. Run `scripts/check-package.mjs` from the repository
      root with Emscripten sourced.
- [x] Write a completion report at the end of this file. It covers the commits per WO, the
      suites before and after, decisions taken under the rulings, and anything left open.

# Completion report (worker, 2026-11-12)

**Provenance.** `WORKORDERS.md` names its parent, `e-2h-outlines-lines`, and that project's status log records the owner's own words: "Approve" for the outlines plan, and "Add as WO3" for the line handles. Rule 00 is satisfied.

## Commits

None is pushed, tagged or published.

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e2h/wo1-element-outlines` | `15c4f30` |
| WO3 | `u8g2gl-e2h/wo3-line-ends` (cut from `15c4f30`) | `fb2fee5` |
| WO2 | `u8g2gl-e2h/wo2-docs-review` (cut from `fb2fee5`) | `82dabb5` (docs, version), `2f17454` (review fixes), and this report |

## Versions

CLI 0.16.2 → **0.16.3** in `cli/package.json` and `cli/package-lock.json`, with a `0.16.3` line under `cli v0.16.xx` in `ChangeLog`. No `cli-v0.16.*` tag exists, so 0.16.3 is the next unreleased PATCH. `release-version.mjs next cli dev` now prints `cli-v0.16.3-dev.1`; nothing was tagged.

There is no schema or runtime change. `refresh-goldens.mjs`, run on the built 0.16.3 CLI, leaves an **empty diff**.

## Suites, before and after (one at a time)

| Suite | Before (`2855379`) | After (`2f17454`) |
|---|---|---|
| Home-path guard | self-test 11/11; clean | self-test 11/11; clean |
| CLI `npm test` | 2750 passed, 23 skipped (130 files) | the same |
| CLI lint and tsc | clean | clean |
| Goldens (`test/generator`) | 279 passed | 279 passed; refresh leaves an empty diff |
| C++ (Debug) | 515/515, 1 skipped (`SizeOfReport.ThirtyTwoBitTarget`); 0 warnings | the same |
| Wasm editor build; snapshot, placeholder, last-error | pass | pass |
| Designer typecheck / `build:e2e` | clean / builds | clean / builds |
| Designer unit | 191 passed | 206 passed (+5 outlines, +10 line ends) |
| Designer e2e | 94 passed | 99 passed (+2 outlines, +3 line ends) |
| Production build: no-hook grep / `test:e2e:production` | clean / 3 passed | clean / 3 passed |
| `check-package.mjs` | PASS, 0.16.2, 15,349,786 bytes, 771 files | PASS, 0.16.3, 15,350,686 bytes, 771 files |

- **No e2e failure or flake** in either full run: 13:05 to 13:09 at baseline, and 13:26 to 13:30 final. `drag-performance.spec.ts:256` passed both times.
- **Timing runs.** `pmset -g log` shows the last Wake at 2026-11-11 08:00:11 and no Sleep, DarkWake or Wake after it, so no run is void.

## Decisions under the rulings

**WO1, the Outlines toggle.**
- The pure parts are in a new `canvas/outlines.ts`, so they are unit-tested without a browser:
  - the stored setting, `u8g2gl.canvas.outlines`, read and written through try/catch, the getter of `localStorage` included;
  - `outlineRects()`, which builds the outlines from `bounds`.
- The draw order is now a pure `overlayOrder()` in `canvas-view.ts`: problem, outline, placeholder, selection. It is a stable sort, so each kind keeps its order.
- The outline colour is amber, `rgba(255, 191, 0, 0.8)`.
  - It has a `[2, 2]` dash, against the placeholder's `[3, 3]`, so the two read apart.
  - The fill is `rgba(255, 191, 0, 0.1)`.
  - When pressed, the toggle shows the same amber in its border and text, because its label never changes.
- `EditLoop.outlines` is the observable. `EditLoop` keeps `outlineOverlay` apart from the selection and problem rectangles.
  - When `bounds` changes, the outlines are recomposed before the selection draws, so a run redraws the overlay once, not twice.
- `EditLoop.overlay` (a getter) exposes the composed rectangles, so the e2e counts outlines exactly. The e2e also checks the overlay canvas: the pixel at each box's centre is blank with the toggle off and tinted with it on.
- The two new outline e2e run with `toolchain: false`, so the framework Wasm stays loaded throughout and the lit-count comparison is stable.

**WO3, the line end handles.**
- **Line-shaped is read from the manifest and placement, not from a list of tags ([D-17]).**
  - An element is line-shaped if it is placed by exactly two points: `u8g2gl_line`, diagonal or not.
  - It is also line-shaped if it is placed by `x`, `y` and a size on one axis only: `u8g2gl_hline` (`width`) and `u8g2gl_vline` (`height`).
  - Among the built-in manifests, this picks out exactly the three elements the ruling names. The unit test checks it against a one-pixel-tall box, a triangle, a pixel, a circle and a progress bar.
- **An hline or vline end is a new `DragKind` `end`.** It plans through the existing `planResize()` with only that axis's edge (`planLineEnd()`). It is snapped on its own axis and clamped by `clampResize()`, so the line keeps at least one pixel and an end cannot pass the other. Shift is ignored, so the line never gains a ratio on its other axis.
- **The overlay.** `OverlayRect` gains an optional `handles` flag. `selectionOverlay()`, a new pure function in `edit-loop.ts`, sets it false for a single drawn line-shaped selection. The round handles come from `endPoints()`: a span's first and last pixel, or a shape's vertices.
- **Hit-testing.** For a single selected line, `handleAt` returns its ends and never the box's squares.
- **The panel.** It now calls `handleRefusalReasons()`.
  - A line-shaped element is asked only about its ends, by vertex plans or end plans. Anything else is asked about its box, as before.
  - A selected hline or horizontal line therefore shows no "Can't resize". A bound `width`, or an expression on an end, still shows.
- **One existing e2e changed, as ruling 2 requires.** In `shape-resize.spec.ts`, the hline test dragged the right box handle and expected "Can't resize: <u8g2gl_hline> has no height".
  - It now drags the right end, gets the same `width="36"`, and expects no refusal line.
  - The triangle test gains a positive control: a box handle is white on the overlay. That shows the new "no handle drawn here" checks can fail.

**WO2.**
- **ui_spec.** A new §4.5, "Element outlines", follows §4.4. Numbering it there avoided renumbering §4.3, which source comments cite. §8 covers the end handles, a "Drag end" row in the movement table, and the panel's rule.
- **Readability review** (the `readability-reviewer` agent). It found no P1 or P2. All four P3s are fixed: stale "vertex-only" comments in `canvas-view.ts` and `canvas-gestures.ts`. All three P4s are taken:
  - the "as before" in `line-ends.ts` is dropped;
  - the edit loop's field is renamed `outlineOverlay`, so it no longer shadows `outlineRects()`;
  - two header paragraphs are re-wrapped.

## Left open

**Nothing from E-2h.**

**One observation.** A one-pixel hline (`width="1"`) has both end handles on the same pixel. The first, `start`, wins the hit, so that end can only be dragged outwards to the left. The line can still be moved and edited in the panel. The fix would be to pick the end by drag direction, which is a design choice for the PA.
