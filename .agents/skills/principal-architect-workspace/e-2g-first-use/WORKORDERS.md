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

- [ ] Ruling 3 in `resize-rules.ts`, or beside it, in the style of `placement-rules.ts`:
      - line and triangle box handles scale the vertices about the opposite edge, rounded;
      - circle `radius` and ellipse `rx`/`ry` follow the handles, with the anchor derived from
        the resolver;
      - `hline`/`vline` keep resizing on the axis they have.
- [ ] Vertex handles for a single selected line or triangle: drawn by the canvas and hit-tested
      before the box handles. Dragging one moves that vertex alone. The cursor and snapping
      behave like the existing handles.
- [ ] Refusals follow the existing rule (integer literals only; bindings and expressions refuse
      with a reason), and clamps keep each size at least one pixel.
- [ ] The property panel says "Can't resize: <reason>" for a selected element whose resize is
      refused on an axis.
- [ ] Each gesture is one undo step, through the existing edit path.
- [ ] Unit tests and e2e, as ruling 4 lists. The existing resize and move specs stay green.
- [ ] If a resolver helper is needed in `cli/src/core`, keep it minimal, test it, and report it.

# WO4 — docs, version, review, evidence (`u8g2gl-e2g/wo4-docs-review`)

- [ ] Ruling 5's docs: the save affordances in `docs/ui_spec.md`, with §4's "save (debounced)"
      corrected; the resize behaviour for point and radius shapes; and a `ChangeLog` line.
- [ ] CLI 0.16.1 → 0.16.2, in the files the 0.16.0 → 0.16.1 bump touched. No schema or runtime
      change. Show that no golden moved.
- [ ] Spawn the `readability-reviewer` on E-2g's diff against `60a4202`. Resolve P1–P3, and
      decide P4 with reasons.
- [ ] Screenshots under `tmp/e2g/`: the activity bar, the status Save, a triangle with its
      vertex handles, and a refusal line in the property panel.
- [ ] A final run of every suite, one at a time: guard; CLI, lint and tsc; goldens; C++; Wasm,
      then `build:e2e`; designer unit; e2e; production and its no-hook grep;
      `check-package.mjs`. Then write a completion report at the end of this file: commits,
      suite counts, decisions, and anything left open.
