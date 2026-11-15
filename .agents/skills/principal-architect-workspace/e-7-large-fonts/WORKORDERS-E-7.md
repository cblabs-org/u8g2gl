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

*Worker report, 2026-11-15.* Authorization was checked from the committed files before any change: this file names `e-7-large-fonts`, and that project's PROJECT.md status log records the owner's "Approve E-7".

## Commits per WO

All four branches are stacked from `ef977ec` (the plan commit on main `0e5f1ab`). Nothing was pushed, tagged or published.

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e7/wo1-large-font-data` | `fa35d0c` feat(catalogue): extract U8G2's large fonts from u8g2_fonts.c |
| WO2 | `u8g2gl-e7/wo2-generated-check` | `4ae3304` feat(generator): guard each large built-in font with a compile-time #error |
| WO3 | `u8g2gl-e7/wo3-picker` | `cddbe92` feat(designer): mark U8G2's large fonts in the font picker |
| WO4 | `u8g2gl-e7/wo4-docs-review` | `1a06aba` docs and CLI 0.22.0; `33a646e` readability review fixes; this report |

## Suite results against the baselines

Every suite was run one at a time, before any change and again at the WO4 tip.

| Suite | Baseline | Final |
|---|---|---|
| Wasm build and 4 Wasm tests | pass | pass |
| Host build and ctest | 520/520, 0 warnings | 522/522, 0 warnings (the 2 new LargeFontGuard cases) |
| CLI vitest | 3023 passed, 23 skipped (140 files) | 3047 passed, 23 skipped (142 files) |
| CLI lint and tsc | pass | pass |
| Designer typecheck | pass | pass |
| Designer unit | 283 passed | 285 passed |
| e2e (after `build:e2e`) | 121 passed, 1 failed, 12 skipped | 122 passed, 1 failed, 12 skipped |
| Production build and `test:e2e:production` | 3 passed | 3 passed |
| `refresh-goldens.mjs` | — | empty diff (every file unchanged) |
| `check-home-paths.mjs` | clean | clean |
| `check-package.mjs` | — | PASS at 0.22.0 (it stamped `0.22.0-dev.1` in its own throwaway clone; this repository is untagged) |

The e2e failures were different tests in the two runs:

- **Baseline:** `performance.spec.ts:168` (the 4× CPU-throttled keystroke gate) failed, with 12 frames missed against the 3 allowed. Re-run alone, it failed again with 13 missed. This happened before any change. The owner's demo servers on 5321 and 5399 were running throughout, so the failure looks like machine load. In the final run this test passed.
- **Final:** the known flake `design-hidden.spec.ts:144` failed, with a framebuffer hash mismatch after a 5 s poll. Re-run alone, it passed.

## The large-font count, and how it was recounted

There are **63 large fonts** at U8G2 2.36.18 (`d66b49a`).

- **The source.** `/usr/bin/grep -a` on `u8g2_fonts.c` finds 126 `U8G2_USE_LARGE_FONTS` lines: 63 `#ifdef U8G2_USE_LARGE_FONTS` and 63 `#endif /* U8G2_USE_LARGE_FONTS */`. Those, plus one `#include`, are the only preprocessor lines in the file.
- **The builder.** `findLargeFonts()` tracks the blocks line by line. It refuses any other conditional, a nested or unterminated block, a stray `#endif`, an empty block, a duplicate, or a name not in the font list.
- **The independent recount.** `cli/test/data/large-fonts.test.ts` shares no code with the builder. It finds each line that trims to `#ifdef U8G2_USE_LARGE_FONTS`, reads the font name from the next line by `indexOf`, and checks:
  - 63 names, and 63 closing `#endif` lines;
  - the same set as the committed JSON;
  - the builder's output equals the JSON.
- **Synthetic sources** cover each refusal: nested, unterminated, `#if`, `#ifndef`, `#else`, stray `#endif`, empty block, and an unknown name.
- **Regeneration.** Running `npm run build:catalogue` added only `u8g2-large-fonts.json`; no other data file changed. Every one of the 63 names is in `u8g2-fonts.json`.

## How the compile-fail test stays platform-independent

`u8g2.h:193` defines the macro when any of `unix`, `__unix__`, `__arm__`, `__arc__`, `ESP8266`, `ESP_PLATFORM` or `__LUATOS__` is defined. The predefined-macro lists show which ones each host sets:

- **This Mac:** `cc -dM -E` and `c++ -dM -E` predefine none of the seven.
- **Linux:** `clang -target … -dM -E` predefines `unix`, `__unix__` and `__unix` for x86_64-linux-gnu and aarch64-linux-gnu. arm-linux-gnueabihf adds `__arm__`.

So on Linux CI, a plain "without" build would get the macro from `u8g2.h` and compile, and the test would fail there while passing here.

**The fix.** Both CTest targets (`large_font_guard_without` and `large_font_guard_with`, in `test/CMakeLists.txt`) compile with all seven undefined: `-Uunix -U__unix__ -U__arm__ -U__arc__ -UESP8266 -UESP_PLATFORM -U__LUATOS__`. Undefining a name that was never defined is harmless, so the flags give the same result on any host.

**The control.** The "with" target carries the same `-U` flags plus `-DU8G2_USE_LARGE_FONTS`. If undefining `__unix__` ever broke a Linux system header, the control would fail visibly; the "without" case cannot pass for the wrong reason. CMake puts definitions before options on the command line, so the `-U` list never touches `U8G2_USE_LARGE_FONTS` itself.

**Checked on this Mac by passing Linux's predefinitions as `-D` flags:**

- (a) `-Dunix -D__unix__ -D__unix` and no `-U`: compiles. This is the false pass the `-U` list prevents.
- (b) The same plus `-D__arm__`, then the `-U` list: the `#error` names the font.
- (c) `-DU8G2_USE_LARGE_FONTS`, the predefinitions, then the `-U` list: compiles.
- (d) A plain host build: the `#error` names the font.

**What CTest checks.** Both targets compile the committed generated `test/large_font_guard/generated/ui_fonts.cpp` against U8G2's real headers (`cppsrc`, `csrc`, `ARDUINO=10819`, `test/real_u8g2`) with `-Wall -Wextra -Wpedantic`. "Without" passes only on `PASS_REGULAR_EXPRESSION "u8g2_font_unifont_t_gb2312 is one of U8G2's large fonts \(over 32 KB\)"`.

## Golden lines moved

**None.** No existing fixture uses a large font: the fixtures name only `u8g2_font_6x10_mr` and similar small fonts. `refresh-goldens.mjs` reports every file in `emit-project/expected`, `test/generated_fixture/generated` and `generated_editor` unchanged.

## Deviations, and why

1. **A new committed fixture, `test/large_font_guard/`.** The compile-fail test needs a real generated `ui_fonts.cpp` with its `ui.hpp` and generated config.
   - The fixture is a project with one small font and one large font, plus its generated output.
   - It was added to `refresh-goldens.mjs`, so it is regenerated with the other fixtures. Its first refresh created files rather than moving golden lines.
   - `emit-large-fonts.test.ts` fails if regenerating it changes a byte, as `compile-fixture.test.ts` does for the compile-layer fixture.
   - It sits outside `cli/test/generator/fixtures/*/expected/`, so CI's determinism check does not cover it. A later runtime bump will move its version-floor line, just as it does for `test/generated_fixture`.
2. **The guard has a two-line comment before it,** saying why it is there (§14.1). This is the reader-facing context the emitter gives every other block. The `#ifndef` / `#error` / `#endif` lines are exactly PROJECT.md's.
3. **The e2e test also chooses the large font** and checks that the badge appears in the current-font facts, because ruling 4 names both places.
4. **The badge's tooltip is also the `title` of the "Hide large fonts" label,** so the filter explains itself.

## Readability review

The `readability-reviewer` agent audited every changed file and found no P1 or P2 issues. All five lower-priority findings were fixed in `33a646e`:

- a work-order tag on a touched line of `refresh-goldens.mjs`;
- a duplicate `LARGE_FONTS_MACRO` in the node builder, which now imports core's;
- `DEFINITION_LINE` is now derived from `DEFINITION`;
- a 101-column header line in `build-catalogue.ts`;
- the `font-picker.tsx` header now mentions the badge and the filter.

The reviewer also noted the dated "*2026-11-15 (E-7).*" marker in design_spec. It follows the existing E-6 convention in both specs, so it was left.

## Found outside scope

- **`npm ci` warnings.** Both `npm ci` runs warned that the install scripts of `esbuild` and `fsevents` were not run, pending `npm install-scripts approve`. Nothing failed because of it: tsx, Vite and Playwright all worked.
- **The baseline performance gate.** `performance.spec.ts:168` failed twice at baseline on this machine while the owner's and the PA's servers were running. It may be worth a look if it recurs off-load.
