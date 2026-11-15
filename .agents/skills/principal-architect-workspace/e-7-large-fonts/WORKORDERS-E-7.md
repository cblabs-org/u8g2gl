---
name: e-7-wo1-wo4
description: Work Orders of E-7 — U8G2's large fonts extracted from u8g2_fonts.c, a generated compile-time #error where they're missing, the picker's badge and filter, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work: nothing in either foundation repository, nothing from E-3.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-7-large-fonts` ([PROJECT.md](PROJECT.md)). Rulings 1–6 bind this PR, with
L1 **no validator warning**, L2 **shown and marked, filter off** and L3 **CLI 0.22.0**. Read the
whole of PROJECT.md first, especially "What the code says". The owner's approval is recorded in its
status log (rule 00). Read `.agents/rules/03-versioning.md` before WO2.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e7/wo1-large-font-data` (based on main at
  `0e5f1ab`, upstream unset). Cut each later branch from the previous tip with
  `git checkout -b <name>`: `u8g2gl-e7/wo2-generated-check`, then `u8g2gl-e7/wo3-picker`, then
  `u8g2gl-e7/wo4-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit (`d66b49a`). Don't touch
  it, and don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build
  in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles. Any CLI `--out` path stays inside the worktree's `tmp/`.
- **Searching U8G2's sources:** the shell's default `grep` gives unreliable results on the 40 MB
  `u8g2_fonts.c`. Use `/usr/bin/grep -a` for any count you report.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`.
  - The host C++ tests: `cmake -B build && cmake --build build -j8 && ctest --test-dir build
    --output-on-failure`.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - Known load flakes, still to be reported if they fail: `design-hidden.spec.ts:144` (e2e) and
    `generate-editor.test.ts` hitting vitest's 5 s limit under a full parallel run.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind
  them, never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to
  pass.
- **Versions:** never tag, never publish. Bump only the CLI, to 0.22.0, in WO4. No schema or
  runtime change.

# WO1 — large-font data (`u8g2gl-e7/wo1-large-font-data`)

- [ ] **Extraction** (ruling 1). Beside `parseFontSymbols()` (`cli/src/node/font-symbol-builder.ts`),
      find every font *defined* inside an `#ifdef U8G2_USE_LARGE_FONTS` … `#endif` block of
      `csrc/u8g2_fonts.c`.
      - Handle the blocks as U8G2 writes them, and fail loudly on anything unexpected: a nested
        conditional, or an unterminated block.
      - `build-catalogue.ts` writes the result, sorted, to `cli/src/data/u8g2-large-fonts.json`
        beside `u8g2-fonts.json`.
      - A name that isn't in the font list is a build error.
- [ ] **Regenerate** with the existing catalogue script. The diff must be the new file and nothing
      else; check it.
- [ ] **Tests:** the file has 63 names, every one in `u8g2-fonts.json`. A test recounts the
      gated definitions from `extern/u8g2/csrc/u8g2_fonts.c` with a separate, simple reading,
      not the builder's. A synthetic source with a nested or unterminated block is a builder
      error.

# WO2 — the generated check (`u8g2gl-e7/wo2-generated-check`)

- [ ] **Emit** (ruling 2). In `cli/src/core/generator/emit/fonts.ts`, after `#include <U8g2lib.h>`,
      emit the guard from PROJECT.md for each large built-in the project uses, in the file's
      existing font order, with the font's own name in the message. Keep the message's wording in
      one constant. It cites `u8g2.h` and names no platforms.
      - The large-font set comes from WO1's data, through core: no node import in the emitter.
      - A project with no large font must emit exactly what it does today.
- [ ] **Goldens.** Run `refresh-goldens.mjs`. If no fixture uses a large font, the diff is empty.
      If one does, only the guard lines move; report which.
- [ ] **Compile-fail test** (ruling 5), in the pattern of `test/version_guard/`
      (`test/CMakeLists.txt` around line 446): a `ui_fonts.cpp` generated for a large font, plus
      a control.
      - **It must behave the same on Linux CI and macOS.** On Linux, `u8g2.h` defines the macro
        itself, because `unix`/`__unix__` are predefined. The "without" case must therefore
        compile with those predefinitions removed (`-U__unix__ -Uunix`, and whatever else
        `u8g2.h:193` checks that the compiler predefines). Check it on this Mac, and reason about
        Linux from the compiler's predefined-macro list (`cc -dM -E - < /dev/null`), not by
        assumption. If it can't be made platform-independent, stop and report.
      - "Without the macro" must fail, with the font's name in the diagnostic. "With
        `-DU8G2_USE_LARGE_FONTS`" must compile. Wire both into ctest as the version-guard cases
        are.
- [ ] **Unit tests:** a large font gets the guard and a small one doesn't; two large fonts give two
      guards, in order; the message names the font.

# WO3 — picker (`u8g2gl-e7/wo3-picker`)

- [ ] **`fontFacts()` gains `large: boolean`** (ruling 4), read from WO1's data. It's true exactly
      for the 63 names, and a test covers all 2039.
- [ ] **The badge.** In the font picker's rows and current-font facts, a large font shows "large
      (over 32 KB): needs U8G2_USE_LARGE_FONTS", with a tooltip saying that U8G2 enables it on
      unix, ARM and ESP targets (`u8g2.h`) and that a build without it stops with an error naming
      the font.
- [ ] **The filter.** "Hide large fonts", off by default, in the picker's filters. Put the logic in
      `font-picker-model.ts`, with unit tests.
- [ ] **e2e:** searching for a known large font (take one from the data) shows the badge; ticking
      "Hide large fonts" removes it from the results; unticking brings it back.

# WO4 — docs and review (`u8g2gl-e7/wo4-docs-review`)

- [ ] **design_spec §14.1:** large fonts, the generated check, and the extraction ([D-14]'s
      pattern).
- [ ] **ui_spec §6.4:** the badge and the filter.
- [ ] **`ChangeLog`:** `cli v0.22.0`.
- [ ] **CLI 0.22.0** in `cli/package.json` and the lockfile.
- [ ] Run a readability review against `u8g2gl-standards` over every changed file, and fix what
      it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - host C++ build and ctest, including the new compile-fail cases;
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.22.0).
- [ ] **Completion report** appended below:
      - commits per WO;
      - suite results, with baselines;
      - the large-font count and how it was recounted;
      - how the compile-fail test stays platform-independent;
      - any golden lines that moved;
      - anything found outside scope;
      - any deviation, and why.

# Completion report

*(worker: append here)*
