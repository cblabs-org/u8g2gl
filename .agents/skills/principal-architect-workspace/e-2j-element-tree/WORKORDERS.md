---
name: e-2j-wo1-wo3
description: Work Orders of E-2j — element tree in the Explorer, designer-only hiding, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the three named here.
- Do not push.
- Do not start other work.

Execute **WO1, then WO2, then WO3**.

**Parent project:** `e-2j-element-tree` ([PROJECT.md](PROJECT.md)). Its rulings are binding,
and its "Two kinds of hidden" section is the reason for most of them: read it first. The owner's
approval is recorded in its status log (rule 00). Read `.agents/rules/03-versioning.md` before
WO3.

# Where you work

- **Worktree:** `../U8G2GL-e2j`, starting on `u8g2gl-e2j/wo1-element-tree` (based on
  `909a32e`, upstream unset). Cut each later branch from the previous tip with
  `git checkout -b <name>`: `u8g2gl-e2j/wo2-design-hidden`, then `u8g2gl-e2j/wo3-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`, and again after every
    `bridge.cpp` change.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build: always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Flakes:** the two known ones were fixed (#53, #54). If any e2e fails, re-run it alone and
  report both runs; do not weaken a test to pass.
- **Versions:** never tag, never publish. Bump only what WO3 names.

# WO1 — element tree (`u8g2gl-e2j/wo1-element-tree`)

- [x] Ruling 1: element rows under each Screens entry, nested, in document order, from the
      current buffer, built by a pure unit-tested function; expand state remembered per browser.
- [x] Ruling 2: selection both ways through `SelectionModel`; opening another screen on row click.
- [x] Ruling 3: tree roles and keyboard; file rows' context menu unchanged.
- [x] Ruling 10's WO1 tests (tree builder unit tests; e2e for rows, row → canvas, canvas → row,
      keyboard). Render counts unchanged.

# WO2 — designer-only hiding (`u8g2gl-e2j/wo2-design-hidden`)

- [x] Ruling 4: `setDesignHidden` and `getRuntimeHidden` in `wasm/bridge.cpp`, the export list,
      the header block, the optional wrapper in `editor-module.ts`, and the Wasm tests (added to
      `ci.yml` beside the existing three).
- [x] Ruling 5: framework sources in the build hash, with its unit test; the disabled-eye
      fallback.
- [x] Ruling 6: the hidden model, effective set with descendants, persistence, re-applied by the
      live loop and **never** by the test-run path.
- [x] Rulings 7–9: the eye, Show all, hit-testing / marquee / outlines, the dashed selection,
      the toolbar badge, the "hidden by data" marker.
- [x] Ruling 10's WO2 tests, including: a test run with an element hidden still reports parity,
      and toggling leaves the file clean.

# WO3 — docs, version, review, evidence (`u8g2gl-e2j/wo3-docs-review`)

- [x] Ruling 11: `ui_spec`, the `ChangeLog`, and CLI 0.16.5 in `cli/package.json` and its lock
      file.
- [x] Run the readability review (the `readability-reviewer` agent, or the standards skill's
      checklist) over the E-2j diff, and fix its findings.
- [x] Re-run every suite one at a time, including the three existing Wasm tests and yours, and
      `scripts/refresh-goldens.mjs` on the built CLI (it must leave an empty diff). Run
      `scripts/check-package.mjs` from the repository root with Emscripten sourced.
- [x] Write a completion report at the end of this file: commits per WO, suites before and after,
      decisions taken under the rulings, and anything left open.

# Completion report (worker, 2026-11-13)

## Commits

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e2j/wo1-element-tree` | `e865ab7` feat(designer): element rows under each screen in the Explorer |
| WO2 | `u8g2gl-e2j/wo2-design-hidden` | `c292ec1` feat(designer): hide elements in the designer only, never in the export |
| WO3 | `u8g2gl-e2j/wo3-docs-review` | `a1fdbc1` docs + CLI 0.16.5; `973e616` readability review fixes; this report |

Nothing pushed, nothing tagged. Runtime (`include/`, `src/`), schema, generator and goldens untouched.

## Suites, one at a time

| Suite | Baseline (`941f91e`) | Final (WO3 tip) |
|---|---|---|
| Wasm `snapshot` / `placeholder` / `last-error` | pass / pass / pass | pass / pass / pass |
| Wasm `design-hidden` (new) | — | pass |
| Native build + ctest | not run at baseline | 0 warnings, 515/515 (1 skipped, as configured) |
| CLI `npm test` | 2772/2773: one 5 s timeout in `generate-editor.test.ts`, passes alone | 2772/2774: two 5 s timeouts in the same file, which passes alone (5/5, 0.8 s); it does not use `prepareBuild` |
| CLI `npm run lint` | pass | pass |
| Designer `test:unit` | 213 | 226 |
| Designer `test:e2e` | 99 pass, 1 fail: drag-performance gate (5 moves missed), passes alone | 108 pass, 1 fail: the same gate (10 moves missed), passes alone (both drag tests). During WO2 the full run was 109/109 |
| Designer `test:e2e:production` | 3 | 3 |
| `refresh-goldens.mjs` on the built CLI | — | empty diff |
| `scripts/check-package.mjs` (Emscripten sourced) | — | PASS (0.16.5 tarball; editor-wasm and test-run builds succeed) |
| Home-path guard | pass | pass |

Flakes, reported as runs: the drag-performance gate failed in a full run at baseline and at WO3, and in a WO1 run of the spec alone its self-test once counted an unforced move at 2 frames; every other re-run alone passed (four in WO1, one in WO3). No test was weakened.

## Decisions taken under the rulings

- **Tree source (ruling 1).** Built by `elementTree()` from `namedElements()`, the selection's own lookup, nesting each element under its nearest *named* ancestor; an unnamed wrapper (`<view>`, a binding's child tag) adds no row. The trees are rebuilt inside each pipeline run, before the Wasm apply, so the rows, the effective hidden set and the frame come from the same text; an unchanged tree keeps its identity, so the Explorer does not re-render on a keystroke or drag.
- **Selection origin (ruling 2).** A third `SelectionOrigin`, `'tree'`, behaves as `'canvas'` does for opening the file and revealing in the XML; only a non-tree selection scrolls the tree.
- **Render counts.** The tree view subscribes to its own screen's selection and counts as `ElementTree`; `overlays.spec.ts`'s allow-list of components that may re-render on a selection change gains `ElementTree` (it shows the selection, per ruling 2). The Explorer itself does not re-render on selection.
- **Expansion keys.** Element rows inside a container collapse and expand with Left/Right; that per-row state is not remembered. Screen expansion is remembered per browser *and project name*; the canvas screen expands only when its state was never set, so a collapsed screen stays collapsed.
- **Bridge (ruling 4).** `renderFrame()` also skips anything drawn inside a hidden object (child objects; shapes clipped to or guarded by it), so hiding a container is complete even without the designer's descendant set. The designer still sends the effective set, plus each hidden composite instance's expanded parts (their scene names differ from the instance's), through a new `drawnBy` map on the pipeline result.
- **Build hash (ruling 5).** `prepareBuild()` takes an optional `frameworkRoot` (default `locateFrameworkRoot()`, `null` for none) and hashes `frameworkFiles()` under `framework/<relative path>` labels, so a staged copy and the source tree hash alike. 85 files, 43.6 MB, about 40 ms.
- **Canvas (ruling 8).** Hit targets are filtered; the loop publishes `shownBounds` / `shownPlacements` (without hidden elements) for the gestures, so a hidden selected element offers no handles or vertices and is not moved by a drag; `bounds` stays whole for the dashed selection box and the status bar.
- **Disabled-eye fallback.** With a module lacking `setDesignHidden`, the loop treats nothing as hidden (so hit-testing matches what is drawn), the eyes are disabled with the ruling's tooltip, and the badge is not shown.
- **Menu.** `MenuItem` gained `disabled`, drawn `aria-disabled` and not chosen, for the screen row's Show all elements.
- **Persistence helper.** `state/setting-storage.ts` holds the guarded `localStorage` access both new settings use.

## Open points

- **Finding 4 is not quite right.** `u8g2gl_obj`'s manifest has a static `<prop name="hidden" type="bool">`, and the parity fixture's `ghost` label uses `hidden="true"`. `getRuntimeHidden()` reports such an element, as the ruling's "the object's hidden flag" says, so its row gets the "hidden by data" mark, whose ruled tooltip says *by its bindings*. Wording the tooltip to cover a static `hidden` is a PA decision.
- **`editor-wasm-build.ts` is outside the boundary**, so it calls `prepareBuild()` without its own `frameworkRoot` option; the hash therefore covers `locateFrameworkRoot()`'s framework, which is the one compiled in every real session. A test that overrides `frameworkRoot` would hash a different tree than it compiles. Passing it through is a one-line change outside this PR's box.
- Runtime-hidden marks match scene names exactly, so a part of a composite that a binding hides does not mark the instance's row.
- The CLI's `generate-editor.test.ts` 5 s timeouts under full parallel load predate this work.

