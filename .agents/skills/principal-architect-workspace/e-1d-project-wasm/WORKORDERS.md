---
name: e-1d-wo1-wo4
description: Work Orders 1–4 of E-1d — toolchain, project-driven bridge, build job, Wasm CI
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the four named here, do not push, do
not start other work. Execute WO1 to WO4 in order.

**Parent project:** `e-1d-project-wasm` ([PROJECT.md](PROJECT.md)). Its PA rulings are binding,
especially ruling 1 (**never download Emscripten; never run the real installer**). Read it and
the provenance it cites (rule 00). The specification is
`.agents/skills/principal-architect-workspace/e-d-editor-design/E1-DECOMPOSITION.md` §1 E-1d, with
`EDITOR-DESIGN.md` §5 (custom widgets: the build, `-O1`/`-O3`, the platform-header rule,
placeholders) and `LOOP-BUDGET.md` §4 and F6–F10. E-D's own working build of the probe project's
Wasm is `evidence/wo1/build-probe-wasm.sh` beside them: read it, it is the proven recipe.

# Where you work

- Worktree `/Users/mcneillm/Documents/Projects/U8G2GL-e1d`, starting on `u8g2gl-e1d/wo1-toolchain`.
  Each later WO: `git checkout -b u8g2gl-e1d/woN-<name>` from the previous WO's tip (names in
  PROJECT.md). `git branch --show-current` before every commit. Commit as you go; **do not
  push**. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Scratch in `tmp/`.
- `extern/u8g2` is checked out. Baseline: CLI **1545** passing; C++ via
  `cmake -B build && cmake --build build -j && (cd build && ctest)`, expected **512** with one
  known skip. Record both before starting.
- Emscripten: `source /Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`
  in the same shell command as any `em++`/`emcmake` call.
- Load `u8g2gl-standards` before writing code (C++ and TypeScript sections). No workspace
  pointers in source comments: keep the fact, drop the pointer.

# WO1 — the managed toolchain (`u8g2gl-e1d/wo1-toolchain`)

- [ ] `cli/src/node/toolchain/`: `u8g2gl toolchain install | status | path`, registered in `cli.ts`.
  `status` reports which Emscripten would be used (managed, `PATH` at exactly 5.0.3, or none, and
  why a `PATH` one at another version is not used). `path` prints the env script or `em++` to use.
  `install` follows PA ruling 2: consent prompt with the size (`--yes` to skip it), clone at the
  pinned tag, verify the commit, `emsdk install`/`activate`, into the cache directory.
- [ ] All external effects behind an injected runner (process spawn, fs root, network/clone), so
  tests run entirely against fakes in temp dirs. Tests: consent refused does nothing; wrong
  commit after clone aborts and cleans up; an existing user emsdk is never modified; `PATH` 5.0.3
  is detected; `PATH` 4.0.6 is reported and not used (the lvgl-editor one on this machine is
  4.0.6 — useful for a manual check only, do not modify it).
- [ ] Manual check, read-only: `status` on this machine with the departures-board emsdk sourced
  reports it as usable. Paste the output.

# WO2 — the bridge driven by the project (`u8g2gl-e1d/wo2-bridge`)

- [ ] The generator's editor registry emits a **font and image table** (name → data pointer) for
  the project's fonts and images, plus the U8G2 built-in fonts the project references. The bridge
  reads that table; `bridge.cpp` names no font or image (d8).
- [ ] Subject string capacity, the display buffer size and every ceiling come from the project's
  `u8g2gl_generated_config.h` ([D-21]) at compile time. Remove the 128-byte string cap, the 2 KB
  buffer cap and `editor_config.h`'s fixed constants (d8: no capacity literal in `bridge.cpp`).
- [ ] **Placeholders (d3):** for an element whose class is not in the registry, `applyScene()`
  builds everything else, draws a placeholder in that element's rectangle as EDITOR-DESIGN §5.4
  describes, and lists it in `getPlaceholders()`. It no longer fails the whole scene. Test: a
  scene with an unknown class renders every other pixel identically to the scene without that
  element, apart from the placeholder's rectangle.
- [ ] The framework editor Wasm (`wasm/CMakeLists.txt`, the fixture) still builds, and
  `wasm/test/snapshot.test.mjs` still passes with its existing hash, or explain exactly why it
  moved (it must not, unless a fixture-name change is unavoidable — report before changing it).
- [ ] CLI patch bump to 0.13.2 and the editor-target goldens it moves; **no firmware golden
  moves** (d5). Run the C++ suite: 512, one skip, and the "firmware carries no editor code"
  check passes.

# WO3 — the build job (`u8g2gl-e1d/wo3-build-job`)

- [ ] `cli/src/node/design/build/`: a job registered with E-1c's queue
  (`server.builds.register`). Steps: generate the editor and firmware targets into a build cache
  (not into the project); compile the registry, the project's widget `.cpp` files and its font and
  image units; the runtime and U8G2 compiled **once per U8G2GL version** and cached; link at
  `-O1`, or `-O3` when the job's params ask for a test run; embed a **build hash** of every input
  (widget sources, manifests, fonts, images, the generated config), readable from the Wasm.
- [ ] **d4:** the build hash changes when, and only when, one of those inputs changes. Tests.
- [ ] **d6:** a widget including `Arduino.h`, an ESP-IDF header or a FreeRTOS header gets **one**
  diagnostic naming the header and the rule, located at the `#include` line, before compiling.
- [ ] **d1:** a test builds `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project`
  **unmodified** (copy it to a temp dir) and renders its scene with the real widgets.
  `message_text max_len="256"` is accepted. Report lit pixels (E-D measured the service lists at 0
  lit pixels for lack of rows; that is expected and is PR-08's to fix).
- [ ] **d2:** time a widget edit's rebuild (touch one widget `.cpp`, rebuild at `-O1`); report it
  against the 2 s target. The test reports and does not fail on time.
- [ ] Wasm-dependent tests skip with a clear message when no Emscripten is available, so the CLI
  suite still passes on a machine without one.

# WO4 — Wasm in CI (`u8g2gl-e1d/wo4-ci`)

- [ ] A job in `.github/workflows/ci.yml` (ubuntu): install Emscripten 5.0.3 per PA ruling 5,
  cached; build the framework editor Wasm; run `wasm/test/snapshot.test.mjs`; run the CLI's
  Wasm-dependent tests with Emscripten present. Validate the YAML without installing anything
  (careful reading, and `python3` with `yaml` if it is already available).
- [ ] You cannot run CI. Say so, and list exactly what the PA should check on the PR.

# Completion report

**Worker, 2026-10-27. Status: WO1 done; WO2 done except the font and image table; STOPPED
before WO3 on a stop-and-report (a file outside PA ruling 6's boundary must change). WO3 and
WO4 not started, and their branches not created.**

Provenance checked (rule 00): this file names `e-1d-project-wasm`; its PROJECT.md records the
owner's standing instruction of 2026-10-27, with its own note that the owner did not review this
breakdown, resting on the E-1 decomposition approval recorded in `e-d-editor-design/PROJECT.md`.

**Baselines** (worktree at `a95c1fb`, after `npm ci && npm run build`): CLI **1545** passing;
C++ **512**, one skip (`SizeOfReport.ThirtyTwoBitTarget`). The very first parallel C++ build
reported three `gtest_discover_tests` errors (`test_bound_child_clip`, `test_wasm_parity`, …)
that did not recur on the next build; recorded in case CI sees the same flake.

### WO1 — `u8g2gl-e1d/wo1-toolchain`, commit `3753dec`

- `cli/src/node/toolchain/`: `toolchain-paths.ts` (pin: 5.0.3, emsdk repository, commit
  `a620cf1d…`, size, cache directories, managed layout `<cache>/emsdk-5.0.3/`),
  `toolchain-host.ts` (the injected host: spawn, fs, env), `detect-toolchain.ts`,
  `install-toolchain.ts`, `toolchain-command.ts`; registered in `cli.ts` with usage text.
- Selection: the first `em++` on `PATH` if it is exactly 5.0.3 (version read from the
  `emscripten-version.txt` beside it, else `em++ --version`); else the managed install, usable
  only once its completion marker exists. A `PATH` one at another version is reported with the
  reason and not used.
- `install`: detection first (nothing to do if usable); consent with the size (`--yes` skips;
  no terminal means no); `git clone --depth 1 --branch 5.0.3`; `rev-parse HEAD` must equal the
  pinned commit; `emsdk install` / `emsdk activate`; marker written last. Any failure deletes the
  partial checkout. It writes only beneath `<cache>/emsdk-5.0.3`, and strips `EMSDK`,
  `EM_CONFIG`, `EMSDK_NODE`, `EMSDK_PYTHON`, `EM_CACHE` from the child environment so a user's
  emsdk is never consulted. **Never run for real** (ruling 1).
- Tests (22, all against a fake host in `tmp/`): consent refused runs nothing and creates no
  directory; wrong commit aborts and removes the checkout; clone/install/activate failures clean
  up; an interrupted install is replaced; a user emsdk (on `PATH` and named by `EMSDK`) is
  byte-and-mtime identical afterwards and no command touches it; `PATH` 5.0.3 detected; `PATH`
  4.0.6 reported and not used; first-on-PATH wins; `--version` fallback; managed env; command
  parsing, `status`, `path` and `--json`.
- Counts: CLI **1545 → 1567**; C++ 512 unchanged.
- Manual check (read-only), departures-board emsdk sourced:
  ```
  $ node cli/dist/node/cli.js toolchain status
  Emscripten 5.0.3: using em++ on PATH, /Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk/upstream/emscripten/em++
    PATH:    /Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk/upstream/emscripten/em++ (5.0.3)
    managed: not installed (/Users/mcneillm/Library/Caches/u8g2gl/emsdk-5.0.3)
  $ node cli/dist/node/cli.js toolchain path
  /Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk/upstream/emscripten/em++
  ```
  And with only the lvgl-editor emsdk's `upstream/emscripten` prepended to `PATH` (exit 1):
  ```
  Emscripten 5.0.3: none available. Run 'u8g2gl toolchain install', or put Emscripten 5.0.3's em++ on PATH.
    PATH:    /Users/mcneillm/Library/Application Support/lvgl-editor/emsdk/upstream/emscripten/em++ (4.0.6)
    managed: not installed (/Users/mcneillm/Library/Caches/u8g2gl/emsdk-5.0.3)
    note: em++ on PATH (…/lvgl-editor/emsdk/upstream/emscripten/em++) is 4.0.6, not 5.0.3; it is not used, because the designer must compile with exactly the pinned version.
  ```

### WO2 — `u8g2gl-e1d/wo2-bridge`, commit `f506628` (partial)

Done:
- [x] **No capacity literal in `bridge.cpp`** (d8, capacities half). The display buffer is
  allocated for the scene's display behind a memory-only U8X8 display callback reporting that
  geometry (any size up to U8X8's 8-bit tile counts; the 2 KB cap is gone). The object arena is
  sized for the classes the active screen constructs (the 64 KB arena is gone). String subjects
  take the scene's `max_len`, or `U8G2GL_MAX_STRING_LEN` (the same default firmware uses) when
  none is declared — `max_len="256"` is accepted (the 128 cap is gone). Each subject's observer
  slots are counted from the bindings and flag directives naming it. These use host subject
  classes deriving from the runtime's `u8g2gl_subject_*_base` (protected constructors that
  take storage), so **no runtime change** was needed.
- [x] `editor_config.h` has no constants: it includes the fixture's `u8g2gl_generated_config.h`,
  so the runtime's binding pool is the generator's count. It is kept as a file because
  `test/CMakeLists.txt` (outside the boundary) names it for the native parity test.
- [x] **Placeholders (d3).** An unknown class builds an `editor_placeholder` object at the
  element's rectangle (1-px border, 45° hatch at 25%, tag in `u8g2_font_4x6_tr` where it fits,
  a badge), drawn by `u8g2gl_render_object()` in draw order, so clip, overlap and flag
  directives behave as for the widget; its bindings are skipped. `getPlaceholders()` (exported,
  and in `u8g2gl_editor.mjs`) lists `{ name, tag, class, rect }`. `wasm/test/placeholder.test.mjs`:
  for `bar_clock` (a child, with later objects renumbered), `msg` (last object) and
  `bar_wifi_icon` (hidden by its flag), the unknown-class scene renders **0 differing pixels**
  outside the rectangle against the scene with the element removed; 205 and 609 pixels lit
  inside; 0 for the hidden one; `getPlaceholders()` names exactly it.
- [x] The framework editor Wasm builds (zero warnings) and `wasm/test/snapshot.test.mjs`
  passes with its **existing hash** `bca55545…03ef`. The native `test_wasm_parity` passes.
- [x] The registry emitter can emit `ui_editor_asset(type, name)` (font and image table, names
  in the scene's order, symbols from the firmware emitters' own declaration lists); tested and
  syntax-checked against the fixture. **It is not wired into `generate`** — see stop item 1.

Not done:
- [ ] **The font and image table in generated output, and `bridge.cpp` naming no font or image
  (d8, assets half)** — blocked, stop item 1. The bridge still names the fixture's fonts.
- [ ] **CLI 0.13.2.** No generator output changed, so no golden moved and no bump was taken
  (0.13.1 stands). The bump belongs with the wiring below.

Counts: CLI **1567 → 1568**; C++ **512**, one skip; the three `EditorSymbols.*` checks pass
("firmware carries no editor code"). **No golden moved, firmware or editor.**

### Stop-and-report items

1. **`cli/src/core/generator/emit/index.ts` must change, and it is outside ruling 6's
   boundary.** `emitEditorRegistryUnit()` is called only from `emitEditorFiles()` there, with
   `{ manifests, stamp }`. Manifests carry no fonts or images, so `editor-registry.ts` alone
   cannot emit a table. The change needed is one call site: `emitEditorFiles()` already builds
   the `ProjectEmitInput` it hands `emitSceneFile()`; hoist it and pass
   `assets: editorAssetsOf(projectInput)` to `emitEditorRegistryUnit()`. After that, inside the
   boundary: `bridge.cpp` declares `ui_editor_asset()` and drops `register_default_assets()`
   and its externs; the fixture's committed `generated_editor/ui_editor_registry.cpp` and the
   CLI's editor-target goldens regenerate (each gains only the lookup; firmware goldens cannot
   move, since firmware emission is untouched); CLI 0.13.1 → 0.13.2. The native parity test
   already links the fixture's `ui_fonts.cpp`/`ui_images.cpp`, so `test/CMakeLists.txt` needs
   nothing. **WO3 depends on it**: building the probe project without the fixture's font
   symbols is exactly what the table is for, so WO3 and WO4 were not started.
2. **Contradiction, recorded:** the WO says string capacity and the display buffer come from
   `u8g2gl_generated_config.h`, but that header defines only four ceilings
   (`MAX_OBJECTS_PER_SCREEN`, `MAX_BINDINGS_PER_OBJ`, `MAX_TOTAL_BINDINGS`, `MAX_STYLES`).
   Per-subject `max_len` and the display size are in the scene, so the bridge takes them from
   the scene at load. The intent (no constant of the bridge's own, F6) is met; the source differs.
3. **For WO3's design (PA to rule):** "runtime and U8G2 compiled once per U8G2GL version" and
   "every ceiling from the project's config at compile time" conflict for one file: the binding
   pool is sized inside `src/u8g2gl_obj.cpp` from `U8G2GL_MAX_TOTAL_BINDINGS`. Either the runtime
   cache is keyed by version **and** the generated config's hash, or `u8g2gl_obj.cpp` is compiled
   per project with the rest cached.
4. **Pre-existing defect, not fixed: the bridge never draws draw-call elements.** `renderFrame()`
   tests `realisation == "draw"`, but the scene emits `"draw_calls"` (`realise/model.ts`,
   `emit/scene.ts`); `test/editor_host/editor_host.cpp` handles it correctly. So `u8g2gl_hline`,
   `_box`, `_pixel`, `_circle` and the other drawing elements are missing from every bridge
   frame, and the D-9 golden `bca55545…` (48 lit pixels) encodes a frame without the home
   screen's `rule` line. Fixing it moves that golden in `wasm/test/snapshot.test.mjs` (inside the
   boundary) and `U8G2GL_PARITY_SHA256` in `test/CMakeLists.txt` (outside), so it is reported
   before changing, as WO2 asks. It would also undercount d1's lit pixels.

### For the PA to check

- `git diff a95c1fb..f506628 --stat` touches only `cli/src/node/toolchain/**`, `cli/src/node/cli.ts`,
  `cli/src/core/generator/emit/editor-registry.ts`, `wasm/**` and their tests.
- Wasm built locally with `emcmake cmake -B build-wasm` (the default directory
  `u8g2gl_editor.mjs` loads; git-ignored by `build-*/`). Both `wasm/test/*.test.mjs` pass.
- Nothing pushed. Branches created: `u8g2gl-e1d/wo2-bridge` only (`wo1-toolchain` existed).
