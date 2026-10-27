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

*(Worker fills in per WO: baselines, commits, test counts C++ and CLI, d1 lit pixels, d2 timing,
which goldens moved and why, any stop-and-report, anything not done.)*
