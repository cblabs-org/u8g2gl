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

## 2026-11-14 — Tier-3 worker, WO1–WO4

**Authorisation.** This file names its parent `e-4-display-contract`, and that
project's status log records the owner's own words, "Approve E-4" (rule 00).
All work was on the four named branches in `../U8G2GL-e4`, each cut from the
previous tip. Nothing was pushed, tagged or published. `check-package` tagged
only its own throwaway clone (`cli-v0.18.0-dev.1`); this repository has no new
tag.

### Commits

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-e4a/wo1-core-geometry` | `ded6000` feat(cli): lay out against the rotated display |
| WO2 | `u8g2gl-e4a/wo2-contract` | `532b90e` feat(cli): emit the display contract in ui.hpp; CLI 0.18.0 |
| WO3 | `u8g2gl-e4a/wo3-designer` | `e357aba` feat(designer): show and preview the oriented panel |
| WO4 | `u8g2gl-e4a/wo4-docs-review` | `9490694` docs: rotation, the display contract and [D-22]; readability fixes |

This report is a further commit on `u8g2gl-e4a/wo4-docs-review`.

### Suites, baseline (at `e981756`) → final (at `9490694`), one at a time

| Suite | Baseline | Final |
|---|---|---|
| Framework Wasm build | OK, 0 warnings | OK, 0 warnings |
| Wasm tests (4) | 4 pass | 4 pass |
| Host C++ build, ctest | 515/515 pass (1 skipped: `SizeOfReport.ThirtyTwoBitTarget`) | 519/519 pass (same skip), 0 warnings |
| CLI `npm test` (no Emscripten on PATH) | 2812 pass, 23 skipped | 2871 pass, 23 skipped |
| CLI `npm test` (Emscripten on PATH) | not run | first run: 2893 pass, **1 timeout** (`generate-editor.test.ts` "is up to date under --check…", 5168 ms against vitest's 5000 ms, suite at 55 s under the toolchain tests' load); the test alone: 5/5 pass; the whole suite again: **2894/2894 pass** |
| CLI lint (eslint + test tsc), tsc | clean | clean |
| Designer typecheck | clean | clean |
| Designer unit | 252 pass | 258 pass |
| Designer e2e (after `build:e2e`) | 118 pass, **2 fail**: `performance.spec.ts:168` and `:224` (frame gates) while I ran tsc and lint alongside; both pass alone (2/2) | **124 pass**, 0 fail (run with nothing else on the machine) |
| `design-hidden.spec.ts:144` (known flake) | pass | pass |
| Designer production build, `test:e2e:production` | 3 pass | 3 pass |
| `refresh-goldens.mjs` after the last change | — | empty diff |
| `check-home-paths.mjs` | clean | clean |
| `check-package.mjs` | — | **PASS** at 0.18.0: generate stamps `0.18.0-dev.1`, design served, editor-wasm and test-run succeeded; tarball 15.4 MB, unpacked 55.0 MB, 775 files |

Determinism (§13.9): the goldens that moved are
`emit-project/expected/ui.hpp` and `ui.cpp` only; no file of that fixture
outside `expected/` changed; `cli/package.json` is 0.18.0 against 0.17.0 at
`021ba54`. Lockfile bumped with it (root and `packages[""]` only).

### What was built, and the choices made inside the box

**WO1.** `normaliseRotation()` and the `Rotation` type beside `ROTATION_VALUES`;
`orientedDisplay()` beside `findTargetDisplay()`, plus `findOrientedDisplay()`
(find, then orient) so no consumer can find a record and forget to orient it.
*Where the orientation is applied:* `PipelineInput.display` and
`createResolverContext()` now take an `OrientedDisplay`, not a `DisplayRecord`.
`OrientedDisplay` carries `rotation` and `native` as well as ruling 1's
`{ width, height }`, so a raw record does not type-check there; forgetting the
rotation is a compile error, not a review item. The native size and rotation
also give ruling 10's wording without a second lookup. Consumers switched:
validator (`validate.ts` `checkedTarget.display`, `shared-model.ts`), generator
(`generate.ts`; the scene's `display` follows, since it reads the resolved
container). `node/cli.ts:748` is the §18 budget, so it **stays native**, with a
comment saying why; a test shows the framebuffer line identical at R0 and R1.
Messages: `display 64×256 (256×64 rotated 90°) is 64px wide (0..63).` (R0/R2
unchanged). Fixture `cli/test/validator/fixtures/rotated-r1/`. No golden moved.

The type change made the designer's two pipeline callers
(`live-pipeline.ts`, `insert-element.ts`) fail to type-check, so WO1 switched
them to `findOrientedDisplay()` too, to keep each commit building. WO3's canvas
orientation therefore landed in WO1's commit; WO3 added the rest.

**WO2.**
- *The four macros* are emitted from the pipeline's own `OrientedDisplay`
  (rotation already normalised), each with a one-line comment, not
  `#ifndef`-guarded. No existing generated header gives a reason to guard
  them.
- *No include in `ui.hpp`.* It keeps the forward-declared `U8G2` from
  `u8g2gl_core.h`.
- *A target not in the catalogue:* validation refuses it before emission
  (`U8G2GL_UNKNOWN_DISPLAY`, or `U8G2GL_MISSING_REQUIRED` with no `setup`;
  checked through the CLI). `ui.hpp`/`ui.cpp` throw without a contract, and
  `generate` throws if a pipeline passes validation with no display, so empty
  macros cannot be written.
- *Editor emission:* `emitEditorFiles` takes the input without the contract.
- *The name is reserved:* `ui_display_matches` is in mangle.ts's fixed table.

**WO3.** The rotation select goes through the impact preview when the size
swaps, and is written only on *Use this rotation*, as one edit (Cancel writes
nothing). R0↔R2 and R1↔R3 apply directly. The picker reads
`256×64 · shown 64×256 at R1`. The impact preview now takes any target field,
not just `setup`. Ruling 8 held: `wasm/bridge.cpp` and `wasm/harness.cpp` are
untouched, and the Run e2e gets a 64×256 frame (2048 bytes) at parity.

### Designer readers of a display's size

| Reader | Decision |
|---|---|
| `pipeline/live-pipeline.ts` (canvas size, scene, bounds, `run.display`) | **Oriented** (`findOrientedDisplay`) |
| `editing/insert-element.ts` (seeding a draft's points and radii) | **Oriented** |
| Hit-testing (`selection/hit-test.ts`, reads `run.targets`/`bounds`) | Oriented by construction: device boxes from the oriented resolution |
| `editing/snapping.ts` display guides (`run.display`) | Oriented by construction |
| `ui/canvas-panel.tsx` fit and `.dim` (`run.display`) | Oriented by construction |
| `panel/panel-controller.ts` "Display W×H" note (`run.result.display`) | Oriented by construction |
| `ui/status-bar.tsx:91` frame size (Wasm `displaySize()`) | Oriented by construction (the scene sizes the module) |
| `forms/impact-preview.ts` outside test and thumbnails | Oriented (its own pipeline run on the candidate texts) |
| `forms/project-editor.tsx` `recordFacts` (picker current/options/candidate) | **Native**, plus the oriented size beside it when they differ |
| `forms/display-picker-model.ts` variant list (`option.width/height`, framebuffer, tiles) | **Native**: catalogue facts of the part being chosen |
| `ui/status-bar.tsx:167` target switcher (`controller W×H`) | **Native**, plus `· shown 64×256 at R1` when they differ (same helper as the picker) |
| `ram_budget` note (framebuffer bytes) | **Native**: hardware |

### Left open, or found outside the boundary (not fixed)

1. **`ui.cpp` gained `#include <U8g2lib.h>`.** It is the one golden line that
   is neither a contract macro nor `ui_display_matches()`. The function calls
   `getDisplayWidth()`/`getDisplayHeight()` on what `ui.hpp` only
   forward-declares, so it needs the complete type, and the include goes in
   `ui.cpp`, not `ui.hpp`. I took it as part of the function rather than stop.
   Please confirm. Scratch-compiled against the vendored real U8G2 (not
   committed): the fixture's `ui.cpp`, and a board file constructing
   `U8G2_SSD1306_128X64_NONAME_F_HW_I2C display(U8G2GL_TARGET_ROTATION,
   U8X8_PIN_NONE)` and calling `ui_display_matches()`, both compile clean under
   `-Wall -Wextra -Wpedantic`.
2. **The WO describes `test/generated_fixture` as 256×64; it is 128×64**
   (SSD1306, sized to the stub). The C++ test checks that it matches at
   128×64, and refuses 64×128 (the same panel at R1), 256×64 and 128×32.
   - *Stub change:* the stub's size is now settable through
     `display_width_val`/`display_height_val`, defaulting to 128×64, after
     `ascent_val`'s pattern.
   - *R1:* covered by `cli/test/generator/display-contract.test.ts` (R1, 90,
     R3, 270), not by a second compiled fixture.
3. **The investigation `display-ownership.md` is not committed anywhere**, so
   [D-22]'s prior-art lines (LVGL's editors, SquareLine, ESPHome) are written
   from general knowledge, in deliberately general terms. Please check them
   against the investigation.
4. **The readability review was done inline**, against `u8g2gl-standards`,
   not by the `readability-reviewer` agent. It found and fixed:
   - export lists missing from the `resolver/index.ts` and `emit/index.ts`
     headers;
   - a changed comment line citing `PR-04 WO10`;
   - an unwrapped doc comment in `pipeline.ts`;
   - a `display!` non-null assertion, replaced by narrowing.

   Every new non-exported function has a banner, and every new file has a
   header and SPDX.
5. *Outside the boundary:*
   - `cli/test/fixtures/departures-project/generated/` has been stale since
     0.13.1 (schema 0.4 stamp). Nothing regenerates or checks it, and this PR
     moves it further from current output. Not refreshed.
   - `validator/validate-schema.ts` keeps its own `VALID_ROTATIONS` set, a
     second copy of `ROTATION_VALUES`. It computes no swap, so I left it. It
     is a candidate for E-4b, which edits that list anyway.
   - With Emscripten on PATH the CLI suite runs two more test files (+23
     tests), and the run takes about 5× as long. Under that load one 5 s
     vitest timeout was missed once (above).
