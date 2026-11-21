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

# Completion report (worker, 2026-11-21)

Authorization checked from the committed records: both RESCOPE-E-2k2.md's and PROJECT.md's
status logs record the owner's own words, "Approve E-2k2". Worktree `../U8G2GL-e4`, nothing pushed,
tagged or published.

## Commits

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-e2k2/wo1-injection` | `5e458f8` feat(e2k2): fonts and images reach the editor Wasm by injection |
| WO2 | `u8g2gl-e2k2/wo2-fonts-view` | `5a7b6d5` feat(e2k2): the Fonts view and "Browse fonts…" |
| WO3 | `u8g2gl-e2k2/wo3-ranges-usage` | `43e5b84` feat(e2k2): range presets, glyph-range warning, sizes and usage |
| WO4 | `u8g2gl-e2k2/wo4-docs-review` | `19b7215` docs, ChangeLog, CLI 0.24.0, review; then this report |

## Suites, run one at a time

| Suite | Baseline (`ea2a0ff`) | Final (WO4 tip) |
|---|---|---|
| Framework Wasm build | ok | ok, 0 warnings (plus the new `u8g2gl_editor_compiled_assets`) |
| Wasm tests | 5/5 | 6/6 (`asset-injection` added) |
| Host C++ | 530/530 (1 skipped) | 530/530 (1 skipped), 0 warnings |
| CLI vitest | 3177, 1 known flake (`generate-editor.test.ts` 5 s limit; passes alone) | 3208/3208 |
| CLI lint | clean | clean |
| `refresh-goldens.mjs` | — | empty diff |
| Designer typecheck / unit | clean / 291 | clean / 301 |
| e2e (`build:e2e`) | 138/138 | 146/147: known flake `design-hidden.spec.ts:144` (canvas hash); passed alone, and 3 more whole-file runs |
| Production build, hook grep, `test:e2e:production` | 3/3 | clean, 3/3 |
| `check-package` | — | PASS at 0.24.0 (821 files, tarball 15.8 MB) |
| Home-path guard | clean | clean (self-test passes) |

Per WO: WO1 e2e 141/141 and production 3/3; WO2 e2e 144/144, production 3/3; WO3 CLI 3208,
e2e 147/147, production 3/3.

Flakes seen: `drag-performance.spec.ts:189` failed once in a WO1 rerun (5 missed frames, 3
allowed), then passed twice alone. Two `test-run.spec.ts` failures in the first WO1 run were
my fault: I ran the unit suite concurrently, which deleted Playwright's trace artefacts; both
passed when rerun alone.

## WO1 measurements

- **A font change's time to canvas** (departures project; the IDE writes globals.xml with a
  new `<builtin name="u8g2_font_ncenB08_tr">` and the screen using it; from the write to the
  first non-stale frame showing it; headless Chromium):
  - before, with Emscripten: **2114, 1596, 2096 ms**. The canvas went stale at ~65 ms (the
    Wasm refused the undeclared-in-Wasm font) until the rebuilt project Wasm was swapped in;
  - before, without a toolchain: **never**. Stale, the framework Wasm having no such font;
  - after, with Emscripten: **97, 94, 90 ms**; without: **88 ms**. No build is requested.
    The figure includes the file watcher and the buffer reload.
- **Built-in font route:** first request 92–111 ms (the parse is 92–101 ms of it), later
  requests 1–2 ms. The index holds 2,039 fonts in **13.3 MiB** of array buffer plus 0.5 MiB of
  heap. Every font decodes to exactly its declared length, and its U8G2 structure ends there.

## Moved golden lines

Only the five editor registries (`test/generated_fixture`, `test/static_children`,
`test/collection_data`, `test/fill_guard/{match,mismatch}`), only in the asset lookup:

- `#include <cstring>` removed. It existed only for the lookup's `strcmp`.
- The lookup's two comment lines replaced.
- Its `extern const uint8_t* const ui_font_*;` / `extern const uint8_t ui_image_*[];` lines
  removed (7 in the fixture), and its `strcmp` branches removed (7).
- Its body is now `(void)type; (void)name; return nullptr;`.

No firmware golden moved.

## Deviations and decisions

1. **Framework Wasm and its fixture fonts.** Its target is unchanged (wasm/CMakeLists.txt gained
   only a new test target), so its fixture registry's lookup is now empty. Its Wasm tests
   inject the fixture's assets as the designer does (`wasm/test/inject-assets.mjs`, through
   the built CLI's own loaders). `test/test_wasm_parity.cpp` injects the compiled fixture
   symbols, with each font's length taken from its U8G2 structure. The D-9 golden hash did
   not move. The compiled-in reference is the new target `u8g2gl_editor_compiled_assets`,
   with `wasm/test/compiled_assets_registry.cpp`: the generated registry, its empty lookup
   renamed by the preprocessor, and the old table hand-written.
2. **CI:** the wasm-tests job now installs and builds the CLI *before* the Wasm tests, which
   need it, and builds and runs the new target and test.
3. **Exports:** the framework export list is unchanged. `EMSCRIPTEN_KEEPALIVE` exports
   `_injectFont`, `_injectImage` and `_clearInjected` on the module; verified in both the
   framework and the project builds. `wasm/u8g2gl_editor.mjs` is untouched; the tests use
   `_module`.
4. **Bridge behaviour beyond the WO:** an injected font is refused when its U8G2 structure runs
   past its bytes. A missing image still refuses the scene; only fonts fall back. Replaced or
   cleared bytes are kept until the next screen build, because live objects may point at them.
   `renderFrame()` repeats a missing-font warning, so it survives `applySampleData()` clearing
   the last error.
5. **`affectsEditorBuild()`** keeps `widgets/` and `u8g2gl.xml`. `globals.xml` was dropped,
   though its style count reaches the generated config's `U8G2GL_MAX_STYLES`: no runtime
   source the editor compiles reads that ceiling, so it is the same case as a screen's object
   count, which was already not a trigger.
6. **Designer:** while a built-in's fetch is in flight, the edit loop draws nothing and keeps
   the last frame, rather than flashing the fallback, and `settled()` waits for the run after
   it. Injection is keyed per module, so an unchanged project costs a reference comparison.
7. **e2e `test-run.spec.ts:104`:** its "last good frame" case typed an unknown font, which now
   draws in the fallback (ruling 1). It now inserts an undeclared image instead. Same assertion.
8. **Docs:** design_spec §9 is "Collection Data", so injection is a new §9.5; the widget-manifest
   section is §6.5. One stale §14.1 sentence, which said the editor Wasm links only the
   project's fonts, was corrected.
9. **Fonts view:**
   - "Loads fonts lazily" is implemented as each row's sample drawn only as it nears the view
     (e2e-checked), with font bytes fetched for the selected font only.
   - The ruler reads the lit box of the drawn text, not U8G2's advance width.
   - The glyph grid draws at most 192 glyphs (object indices are a byte) and says how many
     the font has.
   - The view's projects draw in the editor Wasm's spare instance, shared with the impact
     preview.
10. **Range presets:**
    - "Digits and time" is `0x20,0x2B-0x3A`.
    - The derivation and the warning share `cli/src/core/fonts/static-text.ts`.
    - "Static text" means string props' literals plus binding formats' literal parts.
11. **Readability review:** done by the worker against `u8g2gl-standards`, without a subagent.
    Two findings were fixed: an untyped injection state, and an undocumented decoder
    parameter. No workspace pointers are in source comments or test titles.

## Open items

- Per-glyph metrics (width, ascent, descent for a chosen glyph, ui_spec §12) are not in the Fonts
  view.
- "Only what this project uses" has no sample values yet (E-3b), and the derivation takes
  them through `codepointsByFont()`'s `extra` input.
- No e2e covers the 1:1 image preview or the `<convert>` choice (the departures project has no
  image); unit tests cover usage and refusal.
- A scene naming an undeclared font now draws in the fallback while the validator reports the
  error. Run is therefore available on such a frame, as it already was for any error the
  canvas can draw.
- The bridge records an injected image's width and height but does not read them yet.
- `drag-performance.spec.ts:189` is marginal on this machine under load.
