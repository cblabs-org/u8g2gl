---
name: e-2k2-wo1-wo4
description: Work Orders of E-2k2 (re-scoped) — fonts and images injected into the editor Wasm, the two-route widget asset rule, the Fonts view and "Browse fonts…", BDF range presets with the glyph warning, font and image sizes and usage, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work, including E-2k3 (subjects, styles, consts), E-3b (sample sets), the
  "Assets" activity view, or either foundation repository.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-2k-project-editors`.
- **Binding:** [RESCOPE-E-2k2.md](RESCOPE-E-2k2.md), its rulings 1–12 and K1–K5. It supersedes
  [PROJECT.md](PROJECT.md)'s rulings 11–17 where they differ.
- **Still in force from PROJECT.md:** the principle (ui_spec §2, "Everything is discoverable"),
  and rulings 1, 3, 4 and 23 for how the forms edit.
- **Approval:** the owner's own words are recorded in both status logs (rule 00).
- **Read first:** the whole of RESCOPE-E-2k2.md, and `.agents/rules/03-versioning.md`.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e2k2/wo1-injection` (main at `6cedfa6`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e2k2/wo2-fonts-view`, then `u8g2gl-e2k2/wo3-ranges-usage`, then
  `u8g2gl-e2k2/wo4-docs-review`.
- **Boundary.** It refines RESCOPE's:
  - `wasm/bridge.cpp`, `wasm/CMakeLists.txt` (new test targets only), `wasm/test/**`, and
    `.github/workflows/ci.yml` (to run the new Wasm tests);
  - `cli/src/core/generator/emit/editor-registry.ts`, for the editor target's asset table only;
  - `cli/src/node/design/**`, for the built-in font route, the build hash, and K5's check in the
    editor build;
  - `cli/src/core/validator/**` and `cli/src/core/schema/diagnostic.ts`, for ruling 9's warning and
    K5's widget-source check. Also the CLI command code that runs K5's check in `validate` and
    `generate`, and nothing else in it;
  - `designer/src/**` and `designer/e2e/**`;
  - tests, editor goldens and new test fixtures;
  - `docs/ui_spec.md`, `docs/design_spec.md`, `ChangeLog`, and the CLI version (WO4).

  **Not** `include/`, `src/`, the schema, or any firmware-target generated output. Anything else,
  stop and report.
- **Install:** `extern/u8g2` is checked out at the pinned `d66b49a`. Don't touch it, and don't
  run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as you
  go. **Do not push.**
- **Scratch:** keep scratch files in `tmp/`, and keep every CLI `--out` inside it. Fetch nothing from
  the network beyond `npm ci` from the lockfiles.
- **Baselines.** Record them first, running the suites one at a time:
  - Build the framework editor Wasm, then run `npm run build:e2e`:
    `emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm -j8`.
  - Host C++: `cmake -B build && cmake --build build -j8 && ctest --test-dir build --output-on-failure`.
  - **e2e:** run it against `npm run build:e2e`. A production `npm run build` overwrites that build,
    so rebuild `build:e2e` before every `test:e2e`.
  - **Production:** run `npm run build`, then `test:e2e:production`.
  - **Wasm tests:** run each as CI does, with `node wasm/test/<name>.test.mjs`.
  - **Emscripten:** `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - **Known flakes** (report them if they fail): `design-hidden.spec.ts:144` and
    `performance.spec.ts:168` (e2e), and `generate-editor.test.ts` hitting vitest's 5 s limit under a
    full parallel run.
- **Standards:** load `u8g2gl-standards` before writing code. C++ and TypeScript naming differ; check
  §2. Put no workspace pointers in source comments or test titles. The home-path guard must pass.
- **Searching `u8g2_fonts.c` (40 MB):** use `/usr/bin/grep -a`. The default `grep` is unreliable on
  it.
- **Browsers:** Playwright, headless, with `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** 5321 is the owner's demo server; 5399 and 5401 are the PA's. Never bind or stop them.
- **Flakes:** if a test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Versions:** never tag or publish. Bump only what WO4 names. Never bump the schema or the
  runtime.

# WO1 — Injection and the two-route rule (`u8g2gl-e2k2/wo1-injection`)

RESCOPE rulings 1–5, K1 and K5.

- [ ] **The bridge's injected table** (`wasm/bridge.cpp`).
  - New `extern "C"` exports to inject a font by name and bytes, to inject an image by name and
    bytes, and to clear both.
  - Each injected asset holds exactly the bytes, and any dimensions, that the generated
    `ui_fonts.cpp` and `ui_images.cpp` would compile for it. Read those emitters to match the layout.
  - `value_for()` tries the injected table first, then `ui_editor_asset()`.
  - **Clearing.** The table is cleared by its own call, never by `applyScene`. The designer
    re-injects before applying, and the next frame uses the new table.
  - **A missing font** draws in `u8g2_font_4x6_tr`, and `lastError` carries a warning naming the
    font, so the designer can show it.
  - Copy the file's documentation pattern: its header's export list, and a step breakdown per
    routine.
- [ ] **The editor target's asset table (K1).** In the editor target, `editor-registry.ts` emits
  `ui_editor_asset()` with no project fonts or images; it always returns `nullptr`.
  - The editor build stops compiling `ui_fonts.cpp` and `ui_images.cpp`.
  - `prepare-build.ts` stops hashing them, and its header comment says why.
  - The firmware target is unchanged.
  - Editor goldens move only in that table. Refresh them with `refresh-goldens.mjs`, and report the
    moved lines.
- [ ] **The framework Wasm** keeps the fixture fonts that its own Wasm tests draw. Make whatever
  change keeps those tests meaningful, inside the boundary, and report what it was.
- [ ] **The built-in font route.** `GET /api/font/builtin?name=<u8g2_font_…>`, behind the session
  token, in `cli/src/node/design/`.
  - It parses the packaged `u8g2_fonts.c` once, lazily, into a name → bytes index, and keeps it.
    Large fonts are included, so the `#ifdef U8G2_USE_LARGE_FONTS` blocks are read.
  - An unknown name returns 404 with a JSON reason.
  - Put the parser in its own module with unit tests, including byte-equality on a few fonts against
    what U8G2 compiles.
  - Report the first-request time and the index's memory.
- [ ] **The designer injects** (`designer/src/wasm/`, `designer/src/pipeline/`).
  - Before each `applyScene`, inject every declared font and image:
    - `<bdf>` fonts and images: the bytes `project-assets.ts` already compiles;
    - built-ins: fetched from the route once per session, then cached by name.
  - `affectsEditorBuild()` no longer counts `globals.xml`, `fonts/` or `images/` as build inputs.
    Read `prepare-build.ts` to decide which paths still can change the build, and say which you
    kept.
  - **A Wasm without the exports** (a cached build from an older CLI) is handled as `designHiding`
    handles one: detect it, fall back to that module's own table, and say so in the status bar.
- [ ] **K5's widget-source check**, in one module in `cli/src/core/validator/`, run by `validate`,
  `generate` and the editor build.
  - It reports `U8G2GL_WIDGET_ASSET_SYMBOL` (an error) wherever widget source (`.cpp`, `.cc`, `.h`,
    `.hpp` in a widget's directory) names a generated font or image symbol.
  - The message names the symbol and tells the author to take it through a `type="font"` or
    `type="image"` prop.
  - Comments and string literals are skipped.
  - Application code is never scanned.
  - Find the generated symbols' exact spelling from the emitters, not from this work order.
- [ ] **Tests.**
  - **Wasm:** a new `wasm/test/asset-injection.test.mjs`. An injected built-in font, an injected
    BDF and an injected image each render pixel-identically to the same asset compiled in, and
    clearing leaves nothing behind. Add it to CI.
  - **CLI:** K5's check reports each symbol kind, ignores comments and strings, and ignores
    non-widget code. The route's parser is unit tested.
  - **e2e:**
    - adding a `<builtin>` font and using it on a label renders without a build being requested;
    - a widget-free project draws a font that isn't one of the fixture's, on the framework Wasm.
- [ ] **Measure** a font change's time to canvas before and after the change, and report both.

# WO2 — The Fonts view and "Browse fonts…" (`u8g2gl-e2k2/wo2-fonts-view`)

RESCOPE rulings 6–7, K2 and K3.

- [ ] **Enable `fonts` in `activity-views.ts`.** The view has two lists: the project's declared
  fonts, and every built-in.
  - The built-in list reuses E-6's `FontPicker` model, samples and filters. Don't write a second
    search.
  - **Selecting a font** shows a glyph grid and a string ruler (ui_spec §12), drawn by the real
    renderer through injection.
  - **The ruler:** type text, and see its width in pixels and its height.
  - **Add to project** writes `<builtin>` through the form's existing edit path, as one undo step.
- [ ] **"Browse fonts…" ends the property panel's font field** (`panel/editors.tsx`, `FontEditor`).
  It opens the view and returns the choice to that field.
  - **An undeclared font (K3)** is two edits: `<builtin>` in `globals.xml`, then the field. Each
    is undone in its own document, and the view says so before the choice is made.
- [ ] **Tests.**
  - **Unit:** the ruler's measurement.
  - **e2e:**
    - browse, Add to project, then undo;
    - the ruler's width matches the width of the same text on the canvas;
    - "Browse fonts…" from a label, choosing an undeclared font: two documents change, and one
      undo in each restores it.
- [ ] **Performance:** the view loads fonts lazily, as they scroll into view. The render-count and
  performance tests stay green.

# WO3 — Ranges, sizes and usage (`u8g2gl-e2k2/wo3-ranges-usage`)

RESCOPE rulings 8–10.

- [ ] **Range presets on a `<bdf>`** in `globals.xml`'s form: All (no `range`), Printable ASCII,
  Latin-1, Digits and time, and Only what this project uses.
  - Each preset shows its compiled byte cost, from the browser's bdfconv.
  - **"Only what this project uses"** is derived from static text and format strings.
    - Write the derivation so that sample values can join it later.
    - It's flagged as unsafe for any font used by an element bound to a string subject, naming
      those elements.
  - Choosing a preset writes `range` as one undo step.
- [ ] **The validator warning.** Static text that uses a glyph outside its font's declared range is
  a warning, with a new code.
  - It covers `<bdf>` ranges only. Built-in fonts have fixed sets, so don't guess theirs.
  - It changes no generated output.
- [ ] **The fonts and images sections** show each item's size in bytes, and how many elements and
  styles use it (click to list them).
  - **Images** also get a 1:1 preview, and a `<convert>` shows its threshold or dither choice beside
    its result.
  - **Remove** is refused while an item is still used, naming the users. Use the form's existing
    refusal banner.
- [ ] **Tests.**
  - **Unit:** range derivation, preset costs, and usage counting.
  - **CLI:** the warning: it fires, it doesn't fire for an unranged font, and it ignores built-ins.
  - **e2e:**
    - a preset writes `range`, and one undo removes it;
    - removing a used font is refused, naming its users;
    - removing an unused font works.

# WO4 — Docs and review (`u8g2gl-e2k2/wo4-docs-review`)

- [ ] **ui_spec:**
  - §6.4, the pickers and "Browse fonts…";
  - §12, the glyph grid, the ruler and the range presets;
  - the activity bar's Fonts view.
- [ ] **design_spec:**
  - §9: the editor resolves fonts and images by injection, not by compiling them in;
  - §14.1: the range presets and the warning;
  - the widget manifest section: K5's two-route rule and its diagnostic;
  - §15's diagnostic list: both new codes.
- [ ] **ChangeLog.** CLI **0.23.0 → 0.24.0**, everywhere `check-package` checks.
- [ ] **Readability review** of the branch against `u8g2gl-standards`, with the findings fixed.
- [ ] **All suites, one at a time.**
  - The golden refresh moves only the editor asset table.
  - `check-package` passes at 0.24.0.
  - The home-path guard is clean.
- [ ] **Completion report,** appended to this file:
  - per WO, the commits, the deviations and the open items;
  - WO1's measurements;
  - the moved golden lines.

# Stop and report if

- Anything outside the boundary needs to change.
- An injected asset can't be made pixel-identical to the compiled one.
- K1 can't remove the fonts from the editor build without breaking a widget that uses a prop.
- Any approved ruling turns out to be wrong in the code.
