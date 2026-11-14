---
name: e-4a-wo1-wo4
description: Work Orders of E-4a — rotation honoured in every layout consumer, the generated display contract in ui.hpp, the designer showing the oriented panel, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work, including anything from E-4b (pin removal, the constructor snippet,
  the mirrors, schema 0.7) or E-3.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-4-display-contract` ([PROJECT.md](PROJECT.md)). Its rulings 1–11 and
15–16 bind this PR (15 only for what concerns E-4a). Read the whole of PROJECT.md first,
especially "What the code says", because it lists every call site. The owner's approval is
recorded in its status log (rule 00). Read `.agents/rules/03-versioning.md` before WO2.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e4a/wo1-core-geometry` (based on `021ba54`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e4a/wo2-contract`, then `u8g2gl-e4a/wo3-designer`, then `u8g2gl-e4a/wo4-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit (`d66b49a`). Don't touch
  it, and don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build
  in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`. This PR should not change
    `wasm/bridge.cpp` or `wasm/harness.cpp` (ruling 8). If you find you must, stop and report.
  - The host C++ tests: `cmake -B build && cmake --build build -j8 && ctest --test-dir build
    --output-on-failure`.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - `design-hidden.spec.ts:144` is a known pre-existing flake (it failed in E-2k1's baseline and
    passed alone). Still report it if it fails.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399. Never bind them,
  never stop them.
- **Flakes:** if any e2e fails, re-run it alone and report both runs. Do not weaken a test to
  pass.
- **Versions:** never tag, never publish. Bump only what WO2 names. No schema or runtime version
  change.

# WO1 — core geometry (`u8g2gl-e4a/wo1-core-geometry`)

- [ ] **`normaliseRotation(rotation)`** beside `ROTATION_VALUES` in
      `cli/src/core/schema/project-vocabulary.ts` (ruling 3). It maps `R0…R3` and `0/90/180/270`
      to `'R0' | 'R1' | 'R2' | 'R3'`, unset to `'R0'`, and anything else to undefined (the
      validator already reports it). Export it from the schema index.
- [ ] **`orientedDisplay(record, rotation)`** beside `findTargetDisplay()` in
      `cli/src/core/resolver/resolve.ts` (ruling 1). It returns `{ width, height }`, swapped for
      R1/R3 and unchanged otherwise. Export it from the resolver index. Doxygen, including why
      the record itself is never rotated (ruling 2).
- [ ] **Every layout consumer uses it**, and nothing else computes the swap:
      - `validator/validate.ts:248` and `validator/shared-model.ts:59`;
      - `generator/generate.ts:300` (the resolver context) and `emit/scene.ts:374` (the scene's
        `display`, which the test-run harness reads);
      - `node/cli.ts:748`: check what it reports, and orient it only if it is layout;
      - `createScreenPipeline()`/`createResolverContext()` keep taking a size. Choose the
        cleanest place to apply the orientation so callers can't forget it (for example, the
        pipeline input taking the oriented size rather than the record), and document it.
      - The budget's framebuffer line stays native (ruling 2): prove it with a test.
- [ ] **Messages name the oriented size** (ruling 10): an out-of-bounds diagnostic on an R1/R3
      target says `64×256 (256×64 rotated 90°)` or the closest wording the existing message
      shape allows. R0/R2 messages are unchanged.
- [ ] **Fixture** `cli/test/validator/fixtures/rotated-r1/`: a portrait layout on SSD1322
      256×64 at `rotation="R1"`, in bounds at R1 and out of bounds at R0.
- [ ] **Tests:**
      - both helpers, all eight spellings plus unset and invalid;
      - the fixture validates clean at R1, and the same with `R0` reports OUT_OF_BOUNDS naming
        the oriented size;
      - R2 and `180` behave exactly as R0;
      - the scene's `display` is 64×256 at R1;
      - the budget's framebuffer bytes are equal at R0 and R1.
- [ ] CLI suite and lint green. **No golden moves in WO1**: every existing fixture is R0. If one
      does, stop and report.

# WO2 — generated contract (`u8g2gl-e4a/wo2-contract`)

- [ ] **`ui.hpp`** (`emit/ui-hpp.ts`) gains, for the target being built (rulings 5 and 7):
      ```cpp
      #define U8G2GL_TARGET_WIDTH    <oriented width>
      #define U8G2GL_TARGET_HEIGHT   <oriented height>
      #define U8G2GL_TARGET_ROTATION U8G2_R<n>
      #define U8G2GL_TARGET_SETUP    "<setup>"
      ```
      - The values come from `orientedDisplay()` and `normaliseRotation()`, never computed
        again.
      - Each macro gets a one-line comment (rotated size; pass to the constructor; diagnostics
        only, never compared at compile time, because the bus is part of the name).
      - Guard each with `#ifndef`? **No**: the contract must not be overridable. If the
        existing generated headers have a reason to guard, follow it and say why in the report.
      - Add no `#include`. `ui.hpp` keeps its forward-declared `U8G2`; the board's constructor
        site includes `U8g2lib.h` itself.
      - **When the target's setup isn't in the catalogue,** say what happens. `generate`
        should already refuse; confirm it, and never emit macros with no value.
- [ ] **`bool ui_display_matches(U8G2& display);`** declared in `ui.hpp` and defined in `ui.cpp`
      (`emit/ui-init.ts`) (ruling 6). It returns `display.getDisplayWidth() ==
      U8G2GL_TARGET_WIDTH && display.getDisplayHeight() == U8G2GL_TARGET_HEIGHT`, with no
      allocation and no logging. The Doxygen says what it catches (the wrong size or rotation)
      and what it can't (a same-size panel on another controller), and that the response is the
      firmware's.
- [ ] **C++ test** under `test/`, built by the host CMake. Use the existing generated fixture
      (`test/generated_fixture`, R0, 256×64) and the stub `U8G2`
      (`test/stubs/U8g2lib.h` has `getDisplayWidth/Height`):
      - matches at 256×64; doesn't at 64×256 or 128×64;
      - the four macros have the expected values.
      Add an R1 case if the fixture machinery allows it cheaply (a second generated fixture or a
      compiled golden). Otherwise cover R1 in the TypeScript emitter tests and say so in the
      report.
- [ ] **Goldens:** refresh with `node cli/test/generator/refresh-goldens.mjs`. The diff should
      contain only the contract lines and `ui_display_matches()`. Anything else is a finding:
      stop and report.
- [ ] **CLI 0.17.0 → 0.18.0** in `cli/package.json` and its lock (ruling 11, PROJECT.md O2).
      Confirm that the §13.9 determinism condition is satisfied: goldens moved, fixture inputs
      unchanged, and the CLI version differs from the merge base.
- [ ] Wasm build and tests, host C++ tests, CLI suite and lint green.

# WO3 — designer (`u8g2gl-e4a/wo3-designer`)

- [ ] **The oriented size everywhere layout is shown** (ruling 9): `pipeline/live-pipeline.ts:188`
      (canvas and scene), `editing/insert-element.ts:202`, hit-testing, and the impact preview
      in `forms/project-editor.tsx`. Find any other designer reader of a record's
      `width`/`height` and decide each one: layout means oriented, hardware facts stay native.
      List them in the report.
- [ ] **Rotation through the impact preview.** Changing `rotation` in the form previews as
      changing `setup` does: elements that would fall outside are listed, and nothing is written
      until it's applied. It applies as one undo step. A change between layout-neutral values
      (R0↔R2) applies directly, with no preview.
- [ ] **The picker shows both sizes** when they differ: `256×64 · shown 64×256 at R1`.
- [ ] **Run on an R1 project draws a 64×256 frame** (ruling 8). Prove it with an e2e on the R1
      fixture, or a scratch copy of it.
- [ ] **Tests:** designer unit for the reader decisions above. e2e on a scratch copy of the demo:
      R0→R1 shows the preview with the elements outside listed; applying resizes the canvas to
      64×256; one undo restores 256×64; R0→R2 changes no canvas size.
- [ ] Designer typecheck, unit, e2e (after `build:e2e`) and production green.

# WO4 — docs and review (`u8g2gl-e4a/wo4-docs-review`)

- [ ] **design_spec:**
      - §5.1: `rotation` is honoured. The layout is oriented for R1/R3; R0/R2 are
        layout-neutral; rotation (u8g2's software transform) is not the controller's flip mode
        (`setFlipMode()`), with the source references in PROJECT.md. Leave the pin text alone:
        that is E-4b's.
      - §16: the contract macros and `ui_display_matches()`, with the board-side use:
        construct with `U8G2GL_TARGET_ROTATION`, call `ui_display_matches()` after `begin()`.
      - A new **[D-22] The board owns the wiring; U8G2GL owns the panel**: the decision, and why
        (one UI project per panel serves boards with different pins; LVGL Pro, SquareLine and
        ESPHome as in PROJECT.md). Say that the pin attributes are removed in E-4b.
- [ ] **ui_spec §6.4:** the rotation impact preview and the oriented size in the picker.
- [ ] **`ChangeLog`** entry for `cli v0.18.0`, including the two-line board-side snippet for
      firmware authors. Don't touch either foundation repository (ruling 16, R10).
- [ ] Run a readability review against `u8g2gl-standards` over every changed file, and fix what
      it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - host C++ build and ctest;
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.18.0).
- [ ] **Completion report** appended below: commits per WO, suite results with baselines, the
      designer readers you oriented or left native, and anything left open or found outside the
      boundary. Do not fix things outside the boundary; report them.

# Completion report

*(Worker appends here.)*
