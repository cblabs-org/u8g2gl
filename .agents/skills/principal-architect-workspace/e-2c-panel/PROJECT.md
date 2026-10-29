# E-2c: The Property Panel

**Parent:** E-2 ([e-2-canvas-editing/PROJECT.md](../e-2-canvas-editing/PROJECT.md)), whose
owner approval (2026-10-28) covers this PR's scope as its third row. **Base:** stacked on E-2a,
`u8g2gl-e2a/wo5-readability` @ `e2bbb4f` (PR #36). **Worktree:** `../U8G2GL-e2c`. **Runs
alongside E-2b** (`../U8G2GL-e2b`), which builds direct manipulation. **Checkpoint C4 follows
this PR:** the PA stops and shows the owner the panel.

## Purpose

ui_spec §9's differentiator: a panel generated **entirely** from `<api>` manifests ([UD-5]) that
teaches as it edits — without the schema features §8 defers, so that C4 can judge which of them
the panel needs by looking at it.

## Decomposition

| WO | Topic | Branch | Status |
|---|---|---|---|
| WO1 | The panel model: props from the manifest registry, order, the inherited group | `u8g2gl-e2c/wo1-panel-model` | ✅ `13c44bf` |
| WO2 | Editors by type (§9.1); committing through CST edits | `u8g2gl-e2c/wo2-editors` | ✅ `f585bc1` |
| WO3 | Guidance (§9.2), constraints, Q-19's cost rule, Detach | `u8g2gl-e2c/wo3-guidance` | ✅ `c8f445c` |
| WO4 | Multi-selection (§9.4); screen properties; the render rule and the shell budget | `u8g2gl-e2c/wo4-multi-budget` | ✅ `4a0f92f` |
| WO5 | Readability review, C4 screenshots, PA verification | `u8g2gl-e2c/wo5-readability` | ✅ `e174c99` |
| WO6 | The drag gate with the panel present (ruling 11) | `u8g2gl-e2c/wo5-readability` (#38's head) | ⏳ |

## PA rulings

1. **Generated, never hand-written.** The panel reads the manifest registry
   (`cli/src/core/manifest/`); there is no per-widget code and no rule naming a widget or a prop
   other than the generic ones in rulings 2 and 5. No `visible_when` behaviour ([Q-7]). If the
   effective manifest does not record whether a prop is the element's own or inherited, add that
   as an **additive** field in the registry, with tests.
2. **Order** (EDITOR-DESIGN §8): declaration order, with geometry (`x`, `y`, `width`, `height`,
   and `right`/`bottom` where the manifest has them) pinned first, in pairs. Props inherited
   from `u8g2gl_obj` go in a **collapsed** group headed *From u8g2gl_obj*, with their help text
   ([Q-10]). Drawing elements, which do not extend `u8g2gl_obj` ([D-18]), have no such group.
3. **Editors** (ui_spec §9.1): `int` a number field with steppers; `bool` a toggle; `string` a
   text field (multiline where the manifest says so); `enum` a segmented control for up to 3
   options, a dropdown above; `font` a dropdown with each option's pixel height (rendering each
   option in its own face is **optional**: do it if the project's fonts can be drawn cheaply in
   the browser, else report); `image` a picker with 1:1 thumbnails; `subject` a dropdown filtered
   to type-compatible subjects; `style` a dropdown of styles in scope.
4. **Committing.** Enter, blur or a stepper click commits; each commit is **one undo stop**
   through the CST edit functions (`replaceAttributeValue`, `insertAttribute`, and
   `removeAttribute` for reset) on the current CST, looked up by name. Typing in a field does not
   write the text until it commits.
5. **Guidance** (ui_spec §9.2): `help` rendered inline beneath the control, never only on hover;
   live validation from the validator's diagnostics located at that attribute (E-1b gives them
   attribute ranges) plus the field's own type check; a prop at its default greyed, with reset
   once set. Two generic constraints: `right` set disables `x` (and `bottom` disables `y`) with
   the reason; a `bind_<prop>` set disables `<prop>` with the reason.
6. **Memory cost ([Q-19])**: shown only where §18's budget model computes one (framework
   capacity props, ui_spec §9.2's `max_rows 16 → 2.3 KB`). Project widgets' capacity props get
   none, and a muted line *RAM cost not reported for project widgets ([Q-19])*. The author's own
   `help` text renders as written.
7. **Detach** (EDITOR-DESIGN §3.5): for a geometry prop whose value is an expression or constant,
   the panel offers **Detach** (replace with the literal the scene computed) and **Edit in XML**
   (reveal, as E-2a's selection does). Detach is one undo stop. Bound values offer only Edit in
   XML.
8. **Multi-selection** (§9.4): shared props show a common value or *mixed*; a commit applies to
   all as one undo stop. Geometry shows the bounding box (read-only for several; align is E-2d's).
   Nothing selected: the screen's own properties.
9. **The per-frame rule** (EDITOR-DESIGN §3.3): a field re-renders only when its value changes.
   E-2b's drag does not exist on this branch, so the shell budget is measured with a scripted
   stand-in — the selected element's `x` rewritten every frame for 300 frames, Chromium 4×
   throttle — and the panel's share must stay inside the 8 ms shell slice. E-2a's render counter
   shows only the changed field re-rendering. The real drag is re-measured once E-2b and E-2c
   are together (in E-2d).
10. **Boundary:** `designer/src/panel/` (new), its wiring in the shell, `designer/e2e/`, designer
    tests; additive changes in `cli/src/core/manifest/` (ruling 1) and any budget-model export
    ruling 6 needs. **Keep edits to shared shell files (`ui/app.tsx`, `workspace.ts`,
    `ui/status-bar.tsx`) small:** E-2b edits them in parallel. No canvas gesture work, no new
    dependency.

11. **The drag gate with the panel present** (PA, 2026-10-28). With E-2b merged into this branch
    (`8d6a952`), E-2b's §3.4 drag gate fails: input→blit p95 15.1–16.5 ms on departures and
    16.7–19.0 ms on 20 elements (E-2b alone: 13.0 / 14.6), every move still in its first frame.
    The panel costs 2–4 ms per drag frame, against ruling 9's stand-in figure of 1.3 ms. WO6
    finds where the time goes (a profile of one drag frame with the panel open: React commits,
    the panel controller's update, anything run per frame that the stand-in did not exercise)
    and brings **both screens under 16 ms p95 with the panel open on the dragged element**,
    without loosening the gate or its self-test. EDITOR-DESIGN §3.3's rule is the guide: during
    a drag only the dragged element's geometry fields, the status bar's readout and the canvas
    re-render. Commits go on `u8g2gl-e2c/wo5-readability` (PR #38's head). Boundary: designer
    code, both PRs' specs, and nothing in `cli/` without a report first.

    **Amended 2026-10-29 by the owner's decision** on WO6's diagnosis. The panel is not the cost
    (about 0.5 ms a frame). Its column narrows the canvas, so fit zoom drops from 2× to 1×, and
    at 1× the 3-screen-px snap window holds runs of 1 px moves at one position: they write no
    edit, so E-2b ruling 10's "latest move that edited the text" is an older move than the frame
    shows, and editToFrame grows. Offered (a) count snapped moves, or (b) pin the gate at 2×,
    the owner chose: **"Count snapped moves"** — *measure from the latest pointer move the frame
    reflects, counting moves that snapped to the same place; gate at both 1× and 2×; also turn
    off Playwright tracing for the timing specs.* This **replaces E-2b ruling 10's measurement
    point**: a move is reflected by a frame once the gesture has processed it, whether it wrote
    an edit or snapped to where the element already was; a move processed after the run began is
    not. Thresholds unchanged (p95 under 16 ms, at most 1% of moves missing their first frame),
    the self-test must still fail the gate, and the gate runs at both 1× and 2× on both screens.
    Tracing off for `drag-performance`, `performance` and `panel-budget` only. The layout and
    the scripted step size do not change.

## Status log

- **2026-10-28.** Worktree created from E-2a's tip `e2bbb4f`, `extern/u8g2` checked out. WO1–WO5
  issued to one worker in order.
- **2026-10-28.** The worker stopped at the usage limit during WO4; resumed by message, tree
  untouched in between.
- **2026-10-28. WO1–WO5 complete** (report at the end of WORKORDERS.md). Accepted: [Q-19]'s line
  sits once in a project widget's header, since manifests do not mark capacity props and a `max_*`
  rule would break ruling 1, and no framework manifest declares one (so no cost figure shows
  anywhere yet); `right`, `bottom` and `style` are common attributes, not manifest props, so they
  show only as the reason `x`/`y` are disabled; strings are single-line (no multiline flag
  exists); bindings are fields with type-filtered subject dropdowns; panel commits refused while
  not well-formed; `overlays.spec.ts`'s render rule now admits the panel's own components. The
  readability review's P2 (a binding's section went to the root-most declarer) is fixed.
- **Open for C4:** font options show pixel heights for `<bdf>` fonts only. Built-in fonts' heights
  need a name → height table generated by `build-catalogue.ts` from U8G2's font data, or a Wasm
  export; both are outside ruling 10. Faces are not drawn. Also found, outside the boundary: with
  no toolchain the framework editor Wasm refuses any scene using a project image.
- **2026-10-28. PA verification** on `e174c99`, suites one at a time, Emscripten on PATH, no other
  worker running: guard clean; CLI 2523, lint and tsc clean; no generator golden changed; C++
  512/512; designer unit 63; e2e 46 passed. **Panel share** of a 300-frame stand-in drag p95
  1.3 ms (8 ms slice); its self-test fails the gate at 11.2 ms; only the changed field
  re-renders. Keystroke gate 300/300 and 298/300 in the first frame (within 1%). Production 3/3,
  no hook. C4 screenshots reviewed.
- **2026-10-28. C4** (EDITOR-DESIGN §10): the owner accepted the PA's three recommendations —
  no schema features now (palette metadata and `<previews>` judged at E-2d's end), a generated
  built-in font height table in E-2d, and E-2b's ruling 10. Recorded in
  `e-2-canvas-editing/PROJECT.md`.
- **2026-10-28.** #36 and #37 merged; E-2b merged into this branch (`8d6a952`, conflicts in
  `live-pipeline.ts` and `test-hooks.ts`, both sides kept). On the combined tree the drag gate
  fails (ruling 11); WO6 issued. Owner told not to merge #38 until it passes. A CLI test failed
  once and did not reproduce.
- **2026-10-29.** WO6's diagnosis (nothing committed): zoom, not panel cost — see ruling 11's
  amendment. The owner chose "Count snapped moves"; WO6 resumed on that.
- **2026-10-29. WO6 complete** (`759b140`, report `30a4de6`). Runs that overlapped a sleep or
  dark-wake in `pmset -g log` were voided and repeated. **PA verification** on `30a4de6`, suites
  one at a time, Emscripten on PATH, the machine awake (battery, Low Power Mode off): guard clean;
  CLI 2523, lint and tsc clean; no golden changed against `e2bbb4f` or main; C++ 512/512;
  designer unit 98; e2e 58 passed. **Drag gate** with the panel open, 300/300 in the first frame
  at every screen and zoom: departures p95 9.5 ms (1×) and 7.7 ms (2×), 20 elements 9.1 / 8.5 ms;
  self-test fails it (4 missed, p95 56.6 ms). Keystroke gate 300/300 both, run→blit p95
  3.9 / 4.0 ms; panel share p95 1.1 ms. Production 3/3, no hook.
