---
name: e-4b-wo1-wo4
description: Work Orders of E-4b — constructor pins extracted into the catalogue and constructorSnippet(), schema 0.7 removing the pin attributes and adding the U8G2 mirrors, the designer snippet panel and `u8g2gl display`, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work, including anything from E-3 (`<data>`/`<field>`).

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-4-display-contract` ([PROJECT.md](PROJECT.md)). Rulings 12–16 bind this
PR, **as amended by corrections C1–C3** in the section "Corrections before E-4b". Where a
correction and a ruling disagree, the correction wins. Read the whole of PROJECT.md first. The
owner's approval of E-4 and of C1–C3 is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO2. E-4a (rulings 1–11) is merged; build on it, don't
rework it.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e4b/wo1-catalogue-pins` (based on main at
  `bd88e30`, upstream unset). Cut each later branch from the previous tip with
  `git checkout -b <name>`: `u8g2gl-e4b/wo2-schema-07`, then `u8g2gl-e4b/wo3-designer-cli`, then
  `u8g2gl-e4b/wo4-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit (`d66b49a`). Don't touch
  it, and don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build
  in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
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
    `generate-editor.test.ts` hitting vitest's 5 s limit under a full parallel run (0.9 s alone).
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399. Never bind them,
  never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to
  pass.
- **Versions:** never tag, never publish. Bump exactly what C1 and WO2/WO4 name: schema 0.7,
  runtime 0.13.0, CLI 0.19.0. Nothing else.

# WO1 — catalogue pins and the snippet (`u8g2gl-e4b/wo1-catalogue-pins`)

- [ ] **`DisplayPin`** in `cli/src/core/schema/display-record.ts`: `{ readonly name: string;
      readonly optional: boolean }`, and `DisplayBus` gains `readonly pins: readonly DisplayPin[]`
      (C3). Doxygen: the names are U8G2's own parameter names, in constructor order, without the
      leading `rotation`; `optional` means U8G2 gives the parameter a default
      (`= U8X8_PIN_NONE`).
- [ ] **Extraction** in `cli/src/node/catalogue-builder.ts`. `parseConstructors()` already
      matches each class; also capture its constructor's parameter list (for example
      `(const u8g2_cb_t *rotation, uint8_t cs, uint8_t dc, uint8_t reset = U8X8_PIN_NONE)`) and
      turn it into `DisplayPin[]`. Drop the first `rotation` parameter. Any parameter that isn't
      `uint8_t <name>` with an optional `= U8X8_PIN_NONE` default is a builder error naming the
      class, never silently skipped: a future U8G2 must fail loudly here.
- [ ] **Regenerate** `cli/src/data/catalogue.json` with the existing build-catalogue script
      against `extern/u8g2`. The diff must be the added `pins` arrays and nothing else; check it.
- [ ] **`constructorSnippet(record, rotation, targetName)`** in core (a new
      `cli/src/core/catalogue/snippet.ts`, exported from the catalogue index; it must not import
      node modules, because the designer bundles it). It returns the board-side text (ruling 13):
      - `#include <U8g2lib.h>` and `#include "ui.hpp"`, with a comment on where `ui.hpp` is
        (the project's output directory);
      - `#define` placeholders for each pin, named `DISPLAY_<NAME>` in upper case
        (`DISPLAY_CS`, `DISPLAY_DC`, `DISPLAY_RESET`, `DISPLAY_CLOCK`, `DISPLAY_D0`…). Each value
        is a comment-marked placeholder that won't compile until filled in, never an invented
        number. An optional pin's placeholder says `U8X8_PIN_NONE` is allowed if it isn't wired;
      - the constructor: `<setup> display(U8G2GL_TARGET_ROTATION, DISPLAY_CS, …);` in U8G2's
        parameter order;
      - in a `setup()`-style block: `display.begin();`, `if (!ui_display_matches(display)) {
        /* the panel or rotation differs from target '<name>' */ }`, then `ui_init();`.
      - For I²C setups, a commented `display.setI2CAddress(0x3C * 2);` line explaining that
        U8G2 can't know the address (this replaces the old `address` attribute's help).
      - Rotation appears only as `U8G2GL_TARGET_ROTATION`; the `rotation` parameter is used only
        for the comment naming what the macro expands to, so the snippet stays right when the
        project changes.
- [ ] **Tests:**
      - Builder: every catalogue record has `pins`; each distinct `bus.raw` (the PA counts 14 at
        `d66b49a`, from `HW_I2C` to the bus-less `PARALLEL`) is checked against U8G2's source by
        a test that reads the matching class's parameter list from `extern/u8g2/cppsrc/U8g2lib.h`
        directly, not through the builder's own regex.
      - A malformed parameter in a synthetic header is a builder error naming the class.
      - Snippet goldens, one per wiring family: 4W HW SPI (the SSD1322 the demo uses), 4W SW SPI,
        3W SW SPI, HW I²C, SW I²C, 8080 parallel, and the bus-less KS0108.
      - **Compiles for real:** a host C++ test target in `test/` that builds the HW SPI, SW SPI and
        HW I²C snippets against the vendored U8G2 headers with the placeholders defined to stub
        values, and with a stub `ui.hpp` providing `U8G2GL_TARGET_ROTATION`, `ui_display_matches()`
        and `ui_init()`. It only needs to compile and link (U8G2's Arduino byte functions may need
        the same stubs `test/stubs/` already uses). If that turns out to need more than stubs, stop
        and report rather than vendoring anything.

# WO2 — schema 0.7 (`u8g2gl-e4b/wo2-schema-07`)

- [ ] **Versions (C1), exactly as `da220c7` did for 0.6:**
      - `CURRENT_SCHEMA` 0.7 in `cli/src/core/schema/schema-version.ts`; the validator accepts
        0.4, 0.5, 0.6 and 0.7;
      - runtime 0.13.0 in `include/u8g2gl/u8g2gl_version.h` (with
        `U8G2GL_SCHEMA_VERSION_MINOR 7`), `CMakeLists.txt` and `library.json`; restamp
        `cli/src/data/runtime-version.json` with the existing script;
      - fixtures and inline test projects to `schema="0.7"`. Keep at least one real project
        fixture at 0.6 with a test saying it stays there to prove 0.6 validates; the validator's
        0.4 and the integration 0.5 fixtures stay as they are;
      - the version-guard cases follow (`test/version_guard/schema_0_6.cpp` becomes `schema_0_7`,
        and `test/CMakeLists.txt`); the xtensa corpora and `test/generated_fixture/generated/`
        follow;
      - tokeniser records of edited fixtures regenerated as before.
      - Golden diffs must be version-stamp lines only. Check every changed golden line.
- [ ] **Pins removed** (ruling 12): `cs`, `dc`, `reset`, `address` and `<bus>` leave
      `parse-project.ts`, `Target`/`BusConfig` in `schema/project.ts`, the schema index and the
      vocabulary (`busAttribute()` and the `bus` element entry). `BusConfig` is deleted, not left
      unused.
- [ ] **`U8G2GL_REMOVED_ATTRIBUTE`**, an error at **every** schema version, once per occurrence,
      at its line: on `<display>`, `<target>` and `<bus>`, and for the `<bus>` element itself.
      The message as ruling 12 gives it, ending "See `u8g2gl display <setup> --snippet`." (with the
      target's setup filled in when it's known). It must not also raise the generic
      unknown-attribute or unknown-element diagnostic. Diagnostic codes are public API (§15.4):
      add it where the others are listed.
- [ ] **Mirrors** (ruling 14):
      - `ROTATION_VALUES` gains `MIRROR` and `MIRROR_VERTICAL`; `normaliseRotation()` returns them
        unchanged and the `Rotation` type includes them; `orientedDisplay()` treats them as
        layout-neutral.
      - Fold `validate-schema.ts`'s `VALID_ROTATIONS` copy into the vocabulary's list, so there
        is one list.
      - `MIRROR_SINCE = '0.7'`, gated as `PALETTE_METADATA_SINCE` is: a mirror at 0.4–0.6 is an
        error saying it needs `schema="0.7"`.
      - `U8G2GL_TARGET_ROTATION` emits `U8G2_MIRROR` / `U8G2_MIRROR_VERTICAL` (check
        `extern/u8g2/csrc/u8g2.h` spells them so; `ui-hpp.ts` already builds `U8G2_<value>`, so
        this may need only a test, but the degree spellings must still map to `R1…R3`).
- [ ] **Tests:** each removed attribute on each element errors once at its line and names the
      board; `<bus>` alone errors once; a 0.6 project without pins passes; a mirror at 0.6 says
      "needs 0.7"; at 0.7 it validates and `ui.hpp` emits `U8G2_MIRROR`; mirrors don't swap the
      size; the CST/vocabulary coverage tests include both new values and no longer include the
      pins. The schema-guard and version-guard tests pass at 0.7, and the stale-minor case still
      refuses.

# WO3 — designer and CLI (`u8g2gl-e4b/wo3-designer-cli`)

- [ ] **Bus fields deleted** (ruling 12): `busFieldApplies()`, `BUS_NOT_YET_USED`, the bus rows
      in `project-editor.tsx`, and their unit and e2e cases are deleted, not hidden.
- [ ] **Snippet panel** in the target section, where the bus fields were (ruling 13):
      - one line first: "Pins and bus are configured by your firmware's board (e.g. `board.h`);
        U8G2GL describes the panel.";
      - the `constructorSnippet()` text for the target's current setup and rotation, monospace and
        selectable, updating as the display or rotation changes; nothing when the setup is
        unknown (the setup field already says why);
      - a Copy button that writes it to the clipboard and confirms, as other copy controls in the
        designer do (follow the existing one, if any; otherwise the house pattern in ui_spec).
      - It never writes to the project.
- [ ] **Rotation select** (ruling 14): the two mirrors, labelled "mirrored left–right" and
      "mirrored top–bottom", offered only at schema 0.7 or later, or shown when written. The help
      explains when to use them (reflective or head-up-display glass) and that rotation is not the
      controller's flip mode (`setFlipMode()`), which is the firmware's. Choosing a mirror applies
      directly, like R0↔R2: no impact preview, the canvas size unchanged.
- [ ] **`u8g2gl display <setup>`** (C2), a new command in `cli/src/node/cli.ts` with its usage
      text:
      - prints the record: setup, controller, native size, bus family and wiring, the pins with
        the optional ones marked, framebuffer bytes;
      - `--snippet` prints only the snippet, and `--rotation <r>` (default R0, any accepted
        spelling) and `--target <name>` (default `main`) fill in its comment and condition;
      - an unknown setup exits 1 with the catalogue's near-miss suggestions, as `find` does;
      - `--json`: `{ "display": {...}, "snippet": "..." }`.
- [ ] **Tests:**
      - Unit: the panel's text equals `constructorSnippet()` for the same inputs; the rotation
        options at 0.6 vs 0.7.
      - e2e on a demo copy: the target section shows the SSD1322 snippet with `DISPLAY_CS`,
        `DISPLAY_DC` and `DISPLAY_RESET`; changing the setup to an HW I²C SSD1306 changes it;
        Copy puts it on the clipboard (grant the clipboard permission in Playwright); choosing
        "mirrored left–right" leaves the canvas 256×64; no bus field exists.
      - CLI integration: `display <setup> --snippet` output is byte-identical to
        `constructorSnippet()`; an unknown setup suggests near misses; `--json` shape.

# WO4 — docs and review (`u8g2gl-e4b/wo4-docs-review`)

- [ ] **design_spec:**
      - §5.1: the six rotation values; the mirrors are layout-neutral; the pins are removed,
        with the reason, replacing the [D-14] sentence saying bus parameters "remain the user's to
        set"; point at the snippet.
      - §15.4: schema 0.7 — the mirrors added, the pin attributes and `<bus>` removed, refused at
        every version with `U8G2GL_REMOVED_ATTRIBUTE`, and why older versions stay accepted (O3).
      - §16: the snippet as the board-side reference.
      - [D-22]'s record in `docs/decisions/` and its design_spec entry: the pins are now removed
        (E-4b), with the snippet as their replacement.
- [ ] **ui_spec §6.4:** the snippet panel and Copy in place of the bus fields; the mirror options.
- [ ] **README / CLI docs** wherever the commands are listed: `u8g2gl display`.
- [ ] **`ChangeLog`:** runtime 0.13.0 (schema minor only) and `cli v0.19.0`. Don't touch either
      foundation repository (ruling 16, R10).
- [ ] **CLI 0.19.0** in `cli/package.json` and the lockfile.
- [ ] Run a readability review against `u8g2gl-standards` over every changed file, and fix what
      it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - host C++ build and ctest (including WO1's snippet compile target);
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.19.0).
- [ ] **Completion report** appended below: commits per WO; suite results with baselines; the
      catalogue diff summary (records, distinct `bus.raw` values and their pin lists); every
      golden line that moved; anything you found outside scope; any deviation, and why.

# Completion report

*(worker: append here)*
