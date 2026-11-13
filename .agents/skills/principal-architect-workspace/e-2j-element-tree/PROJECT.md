# E-2j: Element tree in the Explorer, with designer-only hiding

**Base:** `origin/main` @ `909a32e` (#54 merged). CLI 0.16.4, runtime 0.12.0, schema 0.6.
**Worktree:** `../U8G2GL-e2j`. The PR targets `main`.

## Owner decisions and approval

On 2026-11-13 the owner wrote, in their own words:

> "ok good - so on the designer.  I think in the tree on the right under the screen we should
> show the individual elements so they are clickable and easy to see.  We should add a show/hide
> shortcut to the rigth of each element line so it is really easy to show hide elements that are
> layered on top of each other.  WDYT?"

The PA agreed and proposed that hiding be a designer-only view setting, never written to the
XML. It asked where the tree should live. The owner answered, in their own words:

> "1) let's put the elements in the explorer nested under the screen entry - we have plenty of
> space there.
> 2) with the hidden toggle - I think the difference between designer and exported views is an
> important one - please think it through and then go ahead."

That is the approval of this plan. The PA's thinking on point 2 is the "Two kinds of hidden"
section below, and its rulings are binding.

## Findings (confirmed 2026-11-13 at `909a32e`)

| # | Topic | Today |
|---|---|---|
| 1 | Explorer | `designer/src/ui/explorer.tsx` + `explorer-groups.ts`: files only, grouped Project / Screens / Widgets / Assets / Other files. No element rows anywhere in the designer |
| 2 | Names | Every element has a name: `documents/generated-names.ts` writes one into the buffer for an unnamed element on open ([U-1]). The selection is a set of names in one file (`selection/selection-model.ts`) and follows renames |
| 3 | Render path | The designer builds a scene and hands it to the editor Wasm (`wasm/bridge.cpp`). `renderFrame()` walks the screen's flat `elements` list in draw order. An element is either an `object` (rendered through `u8g2gl_render_object`, which honours the runtime `hidden` flag) or `draw_calls` (a standard shape drawn directly, with its own `visibility` guards and **no object, so no flag to set**) |
| 4 | Runtime `hidden` | Exists only as a runtime flag set by `bind_flag_if_eq` and its variants (design_spec §8.4: `Flags: hidden, disabled`). There is no static `hidden` attribute in the schema |
| 5 | Bounds and hits | `pipeline/edit-loop.ts` `bounds` (name → rect) feeds hit-testing, selection overlay and the E-2h outlines. Bounds come from the pipeline run, not from the frame |
| 6 | Test runs | `test-run/test-run-controller.ts` renders its live frames with a **fresh** `applyScene` on the loaded editor Wasm, then compares them with the real build's frames |
| 7 | Project Wasm cache | `cli/src/node/design/build/prepare-build.ts`: the build hash covers the project's widget files and generated units **but not the framework sources** (`bridge.cpp`, runtime). A project editor Wasm cached under an older CLI is reused after an upgrade, so it would lack any new bridge export, and any framework fix |

## Two kinds of hidden (PA's thinking on the owner's point 2)

The canvas promises one thing above all: **it draws what the device draws** (ui_spec principle;
test runs check exactly that). A designer "hide" breaks that promise on purpose, so the design
has to keep the break contained, visible and impossible to export.

| | **Hidden in the designer** (new, the eye) | **Hidden on the device** (exists) |
|---|---|---|
| Who sets it | The author, with the eye toggle | A binding (`bind_flag_if_eq … flag="hidden"`) and the sample data |
| Where it lives | This browser only. Never in the XML, the buffer, undo, generated code, the scene on disk, a test run or a bug report | The XML; it is part of the exported UI |
| What the canvas does | Does not draw it, cannot click it | Does not draw it (the device would not either) |
| How it reads in the tree | Eye-off, row dimmed | A separate "hidden by data" marker; the eye still shows |

Consequences, each a ruling below:

1. **Nothing exportable can see the designer's hide.** It never touches document text, so Save,
   `u8g2gl build`, generated code and the dirty marker are unaffected by construction. The
   bridge forgets it on every `applyScene`/`teardown`, so a test run — which always applies
   fresh — renders the exported view and can never report a false mismatch. The live loop
   re-applies it after its own apply.
2. **The canvas says when it is not the exported view.** Whenever anything on the active screen
   is hidden in the designer, the canvas toolbar shows a badge `N hidden · Show all`. The rows
   are dimmed. That is the guard against comparing pixels with a frame the device never draws.
3. **Hiding happens in the renderer, not as an overlay.** Covering pixels would be wrong where
   elements overlap; skipping the element at draw time leaves exactly the pixels the rest of the
   screen draws. Because shapes have no runtime object (finding 3), the runtime `hidden` flag
   cannot be the mechanism, and reusing it would also fight the bindings that set it. So it is
   a separate, editor-host-only set in the bridge.
4. **The two kinds never mix.** The designer's set never changes a runtime flag, and a binding
   never clears the designer's set. The tree shows both, distinctly.

## One PR: E-2j

**Versions:** CLI 0.16.4 → **0.16.5** (patch, as E-2h and E-2i). No schema change. No runtime
(`include/`, `src/`) change, so the runtime stays 0.12.0 and no C++ golden moves. `wasm/bridge.cpp`
is editor-host code shipped by the CLI.

| WO | Branch | Topic |
|---|---|---|
| WO1 | `u8g2gl-e2j/wo1-element-tree` | Element rows under each screen in the Explorer, selection both ways |
| WO2 | `u8g2gl-e2j/wo2-design-hidden` | Bridge exports, build-hash fix, the eye, the badge, hit-testing and outlines, the "hidden by data" marker |
| WO3 | `u8g2gl-e2j/wo3-docs-review` | ui_spec, ChangeLog, version, review, report |

### PA rulings

1. **Tree shape (WO1).**
   - Each Screens entry gets a disclosure ▸. Expanded, it lists that screen's elements as a
     nested tree: containers and widget views nest their children. Clicking the screen's own
     label still opens the screen as today; the disclosure only expands.
   - Rows are in **document order, which is draw order**: a later row draws over an earlier one.
     Say so in ui_spec. No reversal.
   - A row shows the tag's Palette icon (`palette/palette-icons.ts`), the element's name, and the
     tag in quieter text. Indented by depth.
   - The tree is built from the screen's **current buffer** (unsaved text), refreshed on each
     pipeline run, built by a pure, unit-tested function. Text that does not parse keeps the last
     good tree, as the selection does.
   - Widget manifests are **not** expanded in this PR (screens only, as the owner asked).
   - Which screens are expanded is remembered per browser (`localStorage`, every access in
     try/catch; a failure leaves them collapsed and working). The screen open on the canvas
     expands when first shown.
2. **Selection both ways (WO1).**
   - Click a row: open its screen on the canvas if it is not the active one, and select the
     element. Shift- or Cmd/Ctrl-click adds or removes it, within one file, as on the canvas.
   - A selection made on the canvas or in the XML highlights its rows and scrolls the first into
     view, without stealing focus.
   - Selecting from the tree is never an edit. It goes through the existing `SelectionModel`.
3. **Keyboard and accessibility (WO1).** `role="tree"` / `treeitem` with `aria-level`,
   `aria-expanded`, `aria-selected`; Up/Down move, Left/Right collapse and expand, Enter selects.
   The existing Explorer context menu and its keys are unchanged on file rows.
4. **Bridge exports (WO2).** In `wasm/bridge.cpp`, editor-host code only:
   - `setDesignHidden(json)`: a JSON array of element names. `renderFrame()` skips every element
     in the set, whether `object` or `draw_calls`. Unknown names are ignored. Returns 1, or 0 with
     `getLastError()` for malformed JSON.
   - The set is cleared by `teardown()` (so by `applyScene`). `selectScreen` keeps it (names are
     per file; unknown names are ignored).
   - `getRuntimeHidden()`: a JSON array of the names the **last frame** did not draw because of
     the runtime's own rules (the object's or an ancestor's `hidden` flag, or a shape's
     `visibility` guards). Never includes the designer's set.
   - Both export lists, the header block and `editor-module.ts`'s wrapper updated. In the
     wrapper both are **optional**, like `_getBuildHash`.
   - Tests in `wasm/test/` (the existing `.test.mjs` style): a hidden object and a hidden shape
     each leave the frame as if absent, overlapping pixels underneath intact; `applyScene` clears
     the set; a bound-hidden element is reported by `getRuntimeHidden()` and a designer-hidden
     one is not.
5. **Build-hash fix (WO2).** Fold the framework sources the project build compiles
   (`framework-sources.ts`'s list) into the build hash in `prepare-build.ts`, so a CLI upgrade
   rebuilds a cached project editor Wasm. Unit-test that changing a framework source changes the
   hash. If the loaded Wasm still lacks `setDesignHidden` (defensive), the eyes are disabled with
   the tooltip reason "Hiding needs the project's editor Wasm to be rebuilt".
6. **Designer-hidden model (WO2).**
   - One model outside React (like `SelectionModel`): per file, a set of element names the author
     hid. The **effective** set passed to the bridge adds every descendant of a hidden element,
     computed from the WO1 tree. A descendant of a hidden row shows as hidden-by-parent: dimmed,
     its eye disabled and labelled so.
   - Remembered per browser, keyed by project file, in `localStorage` (try/catch; a failure means
     not remembered, and everything still works). Names no longer in the file are dropped on the
     next pipeline run. A rename shows the element again (acceptable; noted in ui_spec).
   - Toggling is never an edit: no text change, no undo entry, no dirty marker.
   - The live loop re-applies the effective set after each of its own `applyScene`. The test-run
     path must **not** apply it; an e2e proves a run with a hidden element still reports parity.
7. **The eye (WO2).**
   - A button at the right of every element row, always visible (faint), stronger on row hover
     or focus. `aria-pressed`, accessible name "Hide <name>" / "Show <name>". Enter/Space toggle
     it; a click on it never changes the selection. A Lucide `eye` / `eye-off` from the existing
     sprite.
   - On the screen row, the context menu gains **Show all elements**, enabled when any is hidden.
8. **Canvas while hidden (WO2).**
   - Hit-testing, marquee and the E-2h outlines ignore effectively hidden elements, so a click
     lands on what is underneath.
   - A hidden element can still be selected from the tree or the XML; the canvas then shows its
     selection rectangle **dashed and without handles**, and the property panel edits it
     normally.
   - The canvas toolbar badge `N hidden · Show all` whenever the active screen has any designer-
     hidden element (N counts the rows the author hid, not descendants). Show all clears that
     screen's set.
9. **Hidden by data (WO2).** After each pipeline run and each sample-data change (not per
   frame), read `getRuntimeHidden()` and mark those rows with a distinct, quiet marker (not the
   eye) whose tooltip says "Hidden by its bindings with the current sample data — the device
   would not draw it". Absent export → no marker.
10. **Testing.**
    - **Unit:** the tree builder (nesting, order, unparsable text keeps the last tree), the
      effective set (descendants), persistence failure, the build hash.
    - **Wasm:** ruling 4's tests.
    - **e2e:** rows appear under the screen; clicking a row selects on the canvas and the panel;
      canvas selection highlights the row; hiding an element removes its pixels and lets a click
      select the element beneath; the badge appears and Show all restores; hidden state survives
      a reload; toggling leaves the file clean (no ●) and Save writes nothing; a test run with an
      element hidden still reports parity; keyboard toggling of the eye.
    - Render-count and performance tests stay green; the tree must not re-render on every frame.
11. **Docs (WO3).** `ui_spec`: the Explorer section (element rows, order, selection), a new
    subsection for designer hiding with the two-kinds table, and the canvas toolbar badge.
    `ChangeLog` for `cli v0.16.5`; CLI version in `cli/package.json` and its lock file.
12. **Boundary.** `designer/src/**` and `designer/e2e/**`; `wasm/bridge.cpp` and `wasm/test/**`
    (and `wasm/CMakeLists.txt` only for the export list); `.github/workflows/ci.yml`, only to run a new `wasm/test/*.test.mjs` beside the existing three; `cli/src/node/design/build/prepare-build.ts`
    and its tests; `docs/ui_spec.md`; `ChangeLog`; the CLI version. **No** runtime (`include/`,
    `src/`), schema, generator or golden change.

## Status log

| Date | Entry |
|---|---|
| 2026-11-13 | Owner approved: "please think it through and then go ahead" (quoted in full above), with the tree placed in the Explorer under each screen. PA created worktree `../U8G2GL-e2j` from `909a32e`, branch `u8g2gl-e2j/wo1-element-tree` (upstream unset). `extern/u8g2` checked out at the pinned `d66b49a` from the main checkout's local module clone, with no network and no config written. Worker spawned on WO1, WO2 and WO3, in that order. |
