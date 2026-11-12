# E-2h: Element outlines and line end handles

**Base:** `main` @ `0655a79` (#49 merged). CLI 0.16.2. **Worktree:** `../U8G2GL-e2h`.

## Owner decisions and approval

On 2026-11-12 the owner reviewed the served demo and noticed that project widgets first appear
with a yellow hatched background, which then disappears. The PA explained that the hatch is the
framework Wasm's placeholder for a class it lacks, and that it goes once the project's own
editor Wasm is built and swapped in. The owner had found the boxes useful, and the PA proposed a
toggle that outlines every element. The owner answered, in their own words: "Yes, plan it".

The PA presented the outlines plan in chat. The owner answered, in their own words:

> "Approve"

The owner then raised the line handles in chat:

> "Also - with the designer, when laying out a line (horiz, vertical) having a full bounding box
> is pretty redundant (and actually makes adjusting the ends hard to grab the handles) wdyt?"

The PA agreed, proposed end handles only for line-shaped elements, and offered it as a third
work order in E-2h, because it touches the same overlay and handle code. The owner answered, in
their own words:

> "Add as WO3"

**Numbering.** In that chat, "WO3" meant the third work order added to E-2h. The line handles
are WO3 here, as the owner said. Docs, version and review are WO2 in name but run **last**,
after WO3, so they cover both changes.

## Findings (confirmed 2026-11-12 on `main`)

| # | Topic | Today |
|---|---|---|
| 1 | Element boxes | Visible only as the Wasm's placeholder hatch (`wasm/bridge.cpp`), for project widgets, until the project's Wasm loads. `EditLoop.bounds` already holds every drawn element's rectangle |
| 2 | `u8g2gl_line` | Selected, it shows the eight box handles **and** two vertex handles. A horizontal or vertical line has a flat box, so the box handles sit on the ends and win the grab, and the panel says "Can't resize: … no height to scale" |
| 3 | `u8g2gl_hline` / `u8g2gl_vline` | Selected, they show only the box handles, stacked a pixel apart, and no end handles |

## One PR: E-2h, designer only

**Versions:** CLI 0.16.2 → **0.16.3** (patch, rule 03). No schema or runtime change, and no
golden moves.

| WO | Topic | Order |
|---|---|---|
| WO1 | The Outlines toggle | 1st |
| WO3 | Line end handles | 2nd |
| WO2 | Docs, version, readability review, evidence | 3rd (last) |

### PA rulings

1. **Outlines (WO1).**
   - **Toggle:** a canvas toolbar button beside the freeze toggle, "⬚ Outlines",
     `aria-pressed`, title "Show every element's box". Off by default. Remembered per browser in
     `localStorage`, every read and write in try/catch, the same pattern as the test-run
     controller's after-pause key. A storage failure leaves it off and working.
   - **What it draws:** every rectangle in `EditLoop.bounds`, as a new overlay kind `outline`:
     a 1 px dashed amber border and a faint amber fill. Amber matches the placeholder's
     colour family and stays apart from the selection's blue, the hatch's red, the guides'
     magenta and the diff's cyan.
   - **Overlay only:** never the frame's pixels. Parity, the diff and the lit count are
     unchanged.
   - **Draw order:** problem hatch, then outline, then placeholder, then selection.
   - **Live:** the outlines follow `bounds` as it changes, on drags and edits. A stale frame
     keeps the last outlines, as it keeps the selection.
   - **Re-renders:** toggling must not add a re-render of the Palette, the Explorer or the
     canvas panel on a keystroke or a drag. The existing render-count tests stay green.
2. **Line end handles (WO3).**
   - **Which elements:** `u8g2gl_line`, `u8g2gl_hline` and `u8g2gl_vline`, chosen by what the
     element is, never by whether its box happens to be flat. A diagonal `u8g2gl_line` is
     included.
   - **A single selected line** shows one round end handle at each end and **no box handles**.
     Its selection outline stays.
   - **`u8g2gl_line`:** the end handles are its existing vertex handles (`vertexPoints()`,
     `planVertex()`). Only the box handles go.
   - **`u8g2gl_hline`:** dragging the left end moves `x` and changes `width` so the right end
     stays put. Dragging the right end changes `width`. `vline` is the same with `y` and
     `height`. Each end moves along the line's own axis only.
   - **Clamping:** a length stays at least one pixel. An end can't be dragged past the other.
   - **Refusals:** the rule is the same as move and resize today. Every attribute written must
     be an integer literal. A binding or expression refuses with its reason, and nothing is
     written.
   - **Moving:** dragging the line's body still moves the whole element, as now.
   - **The panel:** a selected line no longer shows "Can't resize: …" for an axis it has no
     handle on. A real refusal on an end, such as a bound `width`, is still shown.
   - **Several elements selected:** a line keeps the box handles of the group box, as now.
   - **One undo step:** an end drag lands through the existing edit path as one undo step.
3. **Testing:**
   - **Unit:** the overlay's composition and order with outlines; the toggle's stored value,
     including a storage that throws; the hline and vline end plans (each end, clamping,
     refusal by expression and by binding); which elements are line-shaped; no box handles for
     a single line.
   - **e2e:**
     - the toggle on draws one outline per bound element, and the frame's lit count is
       unchanged;
     - the toggle survives a reload, and off draws none;
     - drag an hline's left end and check that `x` and `width` are written with the right end
       held;
     - drag a vline's bottom end;
     - drag a horizontal `u8g2gl_line`'s end: only that vertex moves, and no box handle is hit;
     - a selected horizontal `u8g2gl_line` shows no "Can't resize" line.
   - The existing resize, move, vertex, saving and session specs still pass.
4. **Docs (WO2):**
   - `ui_spec` §4: the Outlines toggle;
   - §8: handles for line-shaped elements;
   - a `ChangeLog` entry for `cli v0.16.3`;
   - the CLI version in `cli/package.json` and its lock file.
5. **Boundary:**
   - `designer/src/{ui,editing,selection,canvas,pipeline,panel,styles.css}`, plus their unit and
     e2e tests;
   - `docs/ui_spec.md`, the CLI version and `ChangeLog`;
   - **no** `cli/src/core`, `wasm/` or runtime change.

## Status log

| Date | Entry |
|---|---|
| 2026-11-12 | Owner approved the outlines plan: "Approve". The owner then raised line handles, and approved adding them: "Add as WO3". PA created worktree `../U8G2GL-e2h` from `0655a79`, branch `u8g2gl-e2h/wo1-element-outlines`. `extern/u8g2` is checked out at the pinned `d66b49a` from the main checkout's local module clone, with no network and no config written. Worker spawned on WO1, WO3 and WO2, in that order. |
| 2026-11-12 | Worker completed WO1 (`15c4f30`), WO3 (`fb2fee5`) and WO2 (`ffebeca`). PA verified the tip, running the suites one at a time: CLI 2773, lint and tsc clean, designer unit 206, production 3, `check-package` PASS (0.16.3, 771 files). e2e: 99/99 on a re-run, and 1 failure on the first run that was not captured. A further run failed `structure.spec.ts:63` (a Shift-click loses `row0` from the selection). Repeated 30 times, that spec failed 5/30 at the tip and 8/30 at `0655a79` on main, so it is an existing flake, not E-2h's, and is left out of this PR. In a browser, on the production build through the built CLI with a scratch copy of the demo project and an added `hline` and `vline` (port 5399): the project Wasm loaded; Outlines on boxed every element and showed the pressed state; a selected `hline` and the horizontal `u8g2gl_line` showed no "Can't resize"; dragging the `hline`'s right end wrote `width` 40 → 50 with `x` held, and its left end `x="56" width="54"` with the right end held; dragging the line's left end wrote `x1="32"` with `x2` unchanged. Left open: on an `hline` of `width="1"` both ends share a pixel and the start end wins, as the worker reported. PA pushed `u8g2gl-e2h/wo2-docs-review` and opened the PR. |
