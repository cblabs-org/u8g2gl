---
name: e-2c-wo1-wo5
description: Work Orders 1–5 of E-2c — the property panel generated from manifests
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the five named here, do not push, do not
start other work. Execute WO1 to WO5 in order.

**Parent project:** `e-2c-panel` ([PROJECT.md](PROJECT.md)); its rulings are binding, especially
ruling 1 (generated, never hand-written) and ruling 10 (the boundary). Its parent,
`e-2-canvas-editing/PROJECT.md`, holds the owner's approval (rule 00) and the programme rulings.
The design is `docs/ui_spec.md` §6 (the panel region) and §9, and
`e-d-editor-design/EDITOR-DESIGN.md` §3.3, §3.5, §7 ([Q-10], [Q-19], [Q-7]) and §8. E-2a's
records (`e-2a-selection/`) describe the selection you build on.

**Another worker is building direct manipulation (E-2b) at the same time,** in another worktree
from the same base. Do not touch canvas gesture code; keep shared shell files' changes small.

# Where you work

- Worktree `../U8G2GL-e2c`, starting on `u8g2gl-e2c/wo1-panel-model`. Each later WO:
  `git checkout -b u8g2gl-e2c/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Record baselines first, suites one at a time. Build the framework editor Wasm before
  `npm run build:e2e` (as CI's `designer-e2e` job does).
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles. The home-path guard must pass.
- Never open a browser window on the owner's desktop: Playwright headless, `--no-open`.

# WO1 — the panel model (`u8g2gl-e2c/wo1-panel-model`)

- [x] A pure model (no React) from the selection and the manifest registry to panel rows:
      order and pinned geometry (ruling 2), the *From u8g2gl_obj* group, own vs inherited
      (ruling 1's additive field if needed). Unit tests on framework, project and drawing
      elements of the departures project.
- [x] The panel region in the shell (ui_spec §6, right side), showing the rows read-only.

# WO2 — editors and committing (`u8g2gl-e2c/wo2-editors`)

- [x] One editor per type (ruling 3); report on font faces.
- [x] Committing (ruling 4), with tests: each commit one undo stop, reset removes the attribute,
      typing alone writes nothing.

# WO3 — guidance (`u8g2gl-e2c/wo3-guidance`)

- [x] Inline help, live validation, defaults greyed with reset (ruling 5).
- [x] The two generic constraints (ruling 5), with their reasons.
- [x] [Q-19]'s cost rule (ruling 6).
- [x] Detach and Edit in XML (ruling 7), with e2e cases.

# WO4 — multi-selection and the budget (`u8g2gl-e2c/wo4-multi-budget`)

- [x] Multi-selection and the screen's properties (ruling 8).
- [x] Ruling 9: the scripted 300-frame stand-in, the panel's share of the frame, and the render
      count showing only the changed field re-renders. Report the numbers.
- [x] Every manifest prop of the departures project is editable from the panel (an e2e walk).

# WO5 — review and C4's evidence (`u8g2gl-e2c/wo5-readability`)

- [x] Spawn the `readability-reviewer` on E-2c's diff (against `e2bbb4f`); resolve P1–P3,
      decide P4 with reasons.
- [x] Screenshots for checkpoint C4, saved under `tmp/c4/`: the panel on the departures project
      with a framework element, a project widget (its *From u8g2gl_obj* group open and closed), a
      drawing element, a multi-selection, nothing selected.
- [x] Final run of every suite, one at a time; a completion report at the end of this file.

# Completion report

**Commits** (one per WO, each on its own branch, stacked): WO1 `13c44bf`, WO2 `f585bc1`, WO3
`c8f445c`, WO4 `4a0f92f`, WO5 is the commit carrying this report. Nothing pushed.

**Suites, before → after** (run one at a time; Chromium, Firefox and WebKit for `@cross-browser`):

| Suite | Before (`e2bbb4f`) | After |
|---|---:|---:|
| CLI `vitest` | 2515 passed, 6 skipped | 2517 passed, 6 skipped |
| CLI lint (`eslint` + `tsc`) | clean | clean |
| Designer unit | 40 | 63 |
| Designer e2e | 30 | 46 |
| Designer e2e, production build | (not recorded) | 3; production `dist` carries no test hook |
| Home-path guard | clean | clean |

**Ruling 9** (stand-in: row0's `x` rewritten every frame, 300 frames after 30 warm-up, Chromium
4× throttle, the E-2b worker's tests running on the same machine): the panel's share, its
controller update plus the React render and commit that follows, was **p95 1.2–1.3 ms**,
median 0.5–0.7 ms, max 2–6 ms, in three runs, against the 8 ms shell slice. The update alone
was p95 0.7–0.8 ms. Render counts over the 300 frames: `PanelField:x` 300, and **no other panel
component rendered**. Outside the panel, `StatusBar`, `SelectionGeometry` and `CanvasPanel`
each rendered 300 times. `CanvasPanel` and `StatusBar` re-render every frame because
`frameState` changes on every run; that is not the panel's doing, but E-2b's drag measurement
should know about it. The gate's self-test (a 10 ms block inside each update) failed the gate
at p95 11.3–11.6 ms, as it should.

**Font faces** (ruling 3, optional): not done. The `<builtin>` fonts' glyph data is compiled into
the editor Wasm and the page holds no copy of it, so drawing an option in its own face would
need a new Wasm export, which ruling 10's boundary excludes. **Pixel heights are partly
blocked, too:** the panel shows a height for a `<bdf>` font (byte 10 of the compiled U8G2 font
header) but has none for a built-in font, so the departures project, which uses only built-ins,
shows no heights. The panel says so once in its header. Built-in heights need a name → height
table generated beside `u8g2-fonts.json` by `build-catalogue.ts` from `u8g2_fonts.c` (or a
Wasm export), and both are outside ruling 10. **This is the one place ruling 3 and ruling 10
conflict, so it needs the PA's decision.**

**C4 screenshots** (`tmp/c4/`, at 1440×1400):
`1-framework-element-sys_clock.png`, `2a-project-widget-row0-inherited-closed.png`,
`2b-project-widget-row0-inherited-open.png`, `3-drawing-element-plat_box.png`,
`4-multi-selection-plat_label-row0.png`, `5-nothing-selected.png`.

**Readings and deviations, with reasons:**
1. **The [Q-19] line goes on the element, not on its "capacity props".** The manifest does not
   mark which props are capacities. A rule like "props named `max_*`" would be a prop-naming rule
   of the kind ruling 1 forbids. So a project widget's header carries *RAM cost not reported for
   project widgets ([Q-19])* once, and its authors' `help` renders as written. No framework
   manifest declares a capacity prop, and §18 computes no per-prop cost for any framework prop,
   so the panel shows no figure anywhere. Nothing new was exported from the budget model,
   because nothing needed one. Ruling 6's example (`max_rows 16 → 2.3 KB`) is a project widget's
   prop, which [Q-19] says §18 cannot cost.
2. **`right`/`bottom` and `style` are not manifest props.** They are common attributes
   (`validate-widget-props.ts`), so they are never panel fields. A written `right` still disables
   `x`, with its reason and Edit in XML. The `style` editor exists for `type="style"` props, and
   no manifest declares one today.
3. **Multiline strings:** the schema has no flag for it, so every `string` field is single-line.
4. **Bindings are fields:** one per `<bind>` attribute, with a subject dropdown filtered to the
   types its overloads accept. A binding sits in the section of the nearest manifest that
   declared it. The generic `bind_<prop>` rule therefore also disables `time` while `bind_time`
   is set, which is correct.
5. **Commits are refused while the text is not well-formed**, as canvas edits are. Every field
   shows why.
6. **Shared files:** `ui/app.tsx` (+2 lines), `styles.css` (one grid column), `edit-loop.ts`
   (publishes `lastRun`), `live-pipeline.ts` (an additive `placed` map for Detach), and
   `test-hooks.ts`. `e2e/overlays.spec.ts`'s render-count test now also allows the panel's own
   components on a selection change, because the panel shows the selection.
7. **A finding outside the boundary:** with no toolchain, the framework editor Wasm refuses any
   scene that uses a project image (*the project declares no image*). A project's images are
   compiled only into its own Wasm. The image-picker e2e therefore runs without a live frame.
   Recorded for the PA, not changed.

**Readability review:** no P1 findings. The one P2 was a real mismatch: a binding's section went
to the root-most declarer rather than the nearest. Both the code and its comment were fixed,
with a unit test. All four P3s were fixed: a phase tag and a checkpoint reference reworded, a
misplaced comment moved, and two re-flowed paragraphs. P4s taken: the repeated `boundBy` and
`anchoredBy` calls, two nested ternaries, named thumbnail colours, the probe's split doc
comment, and two long lines. P4s not taken: a named alias for `ensureView`'s return type, which
`Extract<>` already states. Observations: `EDITOR-DESIGN §x` cites are kept, as in the existing
designer code, and the standards should say whether that document is citable.

# WO6 — the drag gate with the panel present (on `u8g2gl-e2c/wo5-readability`, ruling 11)

- [ ] Profile one drag frame with the panel open on the dragged element; report where the
      2–4 ms goes.
- [ ] Bring E-2b's drag gate under 16 ms p95 on both screens with the panel open (and add the
      panel to the gate's setup if it does not already open it), self-test intact; E-1e's
      keystroke gate and ruling 9's panel gate still pass.
- [ ] Every suite, one at a time; an addendum to the completion report.
