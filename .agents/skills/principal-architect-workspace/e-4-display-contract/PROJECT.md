# E-4 — Display contract: the board owns the wiring, U8G2GL owns the panel

*PA plan, drafted 2026-11-14 and approved by the owner the same day.
Follows the investigation `display-ownership.md` (option B, chosen by the owner
2026-11-14: "Plan option B").*

## Goal

`u8g2gl.xml` describes what the UI depends on: the **panel** (`setup`) and its
**orientation** (`rotation`). The firmware's board layer (`board.h` in the
foundation) owns construction and wiring. The two are tied by a **generated,
checked contract** rather than a hand-kept copy.

Two PRs, in order:

| PR | What | Schema | Runtime | CLI | Goldens |
|---|---|---|---|---|---|
| **E-4a** | Rotation honoured everywhere + the generated display contract | none | none | 0.17.0 → **0.18.0** | move (new emitted contract) |
| **E-4b** | Pin attributes and `<bus>` removed, with a specific error; a copyable constructor snippet takes their place; U8G2's two mirror orientations added | **0.6 → 0.7** (owner) | none | 0.18.0 → **0.19.0** | none expected |

*Revised 2026-11-14 after owner review:*
- *With no clients yet, the pins are **removed** rather than deprecated. The
  deprecation step is dropped.*
- *A **constructor snippet** replaces the pin fields (owner: "it may be useful
  to generate the sample init code").*
- *U8G2's `MIRROR` and `MIRROR_VERTICAL` are added to `rotation` (owner: "add
  it in, might as well be complete").*

## What the code says (main at `021ba54`, after #56)

- **One seam for geometry.** `findTargetDisplay()` (`cli/src/core/resolver/resolve.ts:376`)
  returns the catalogue record, and every geometry consumer reads its native
  `width`/`height`:
  - validation: `validator/validate.ts:248`, `validator/shared-model.ts:59`
    → `createResolverContext()` → bounds checks in `validate-geometry.ts`;
  - generation: `generator/generate.ts:300` → resolver, and the scene's
    `display` (`emit/scene.ts:374`), which the test-run harness reads
    (`node/design/test-run/screen-table.ts:97`);
  - CLI reporting: `node/cli.ts:748`;
  - designer: `pipeline/live-pipeline.ts:188` (canvas, scene),
    `editing/insert-element.ts:202`, the impact preview in `forms/project-editor.tsx`.
- **Rotation** is parsed (`parse-project.ts:67`) and validated
  (`validate-schema.ts:634`) and read nowhere else.
- **Rotation and flip mode are different mechanisms**, checked against the
  vendored U8G2 (`extern/u8g2/csrc`):
  - `U8G2_R0…R3`, `U8G2_MIRROR` and `U8G2_MIRROR_VERTICAL` (`u8g2.h:441–446`)
    are u8g2-layer software transforms. `u8g2_SetDisplayRotation()`
    (`u8g2_setup.c:111`) swaps the callback and recomputes the dimensions.
  - `setFlipMode()` (`u8x8_display.c:146`) is a controller command, 180° only,
    with its own column offset (`u8x8_d_ssd1322.c:314`).
  - Only R1/R3 change width and height. Our schema accepts R0–R3 only.
- **Schema versions coexist.** `ACCEPTED_SCHEMA_VERSIONS` is 0.4, 0.5 and 0.6
  (`validate-schema.ts:81`), and newer features are gated by version
  (`PALETTE_METADATA_SINCE = '0.5'`). Only 0.3 is refused, with its migration
  table.
- **The framebuffer budget** (`generator/report/budget.ts:330`) uses the record's
  `framebufferBytes`, which rotation does not change. It must stay native.
- **`ui.hpp`** (`emit/ui-hpp.ts`) is the umbrella header an application
  includes. It declares `ui_init()` and the render signatures, all taking
  `U8G2& display`. `ui.cpp` (`emit/ui-init.ts`) defines `ui_init()`. The
  version guards live in `u8g2gl_generated_config.h`, which the runtime's own
  build also includes.
- **No project in the repo or the foundation's integration branch writes a pin
  attribute or `<bus>`.** All 13 fixture `u8g2gl.xml` files use `rotation="R0"`.
  So E-4b breaks nobody today, and no fixture covers R1/R3 yet.

## Rulings

1. **One function decides the oriented size.** Add
   `orientedDisplay(record, rotation)` beside `findTargetDisplay()` in
   `core/resolver`. It returns `{ width, height }` swapped for R1/R3 (and their
   `90`/`270` spellings), unchanged for R0/R2/unset. Every *layout* consumer in
   the list above uses it. Nothing computes the swap anywhere else.
2. **The record itself is never rotated.** `findTargetDisplay()` keeps
   returning the catalogue record unchanged, so the framebuffer, tiles, bus and
   driver stay true to the hardware. Only layout geometry is oriented.
3. **Rotation spellings are normalised in one place.** A `normaliseRotation()`
   next to `ROTATION_VALUES` maps `0|90|180|270` to `R0…R3`. The parser keeps
   the text as written (the form still shows what the author wrote); consumers
   read the normalised value.
4. **R0/R2 are layout-neutral.** U8G2GL emits the rotation for the board to
   construct with. The foundation's runtime `setFlipMode()` is a controller-level
   flip on top of it and is untouched.
5. **The generated contract lives in `ui.hpp`.** That's the only file an
   application includes (§13.7). It doesn't go in `u8g2gl_generated_config.h`,
   which `u8g2gl_config.h` pulls into the runtime library's own build: the
   runtime's sizing must not depend on which target was built. `ui.hpp` gains:
   ```cpp
   #define U8G2GL_TARGET_WIDTH    64        // after rotation
   #define U8G2GL_TARGET_HEIGHT   256
   #define U8G2GL_TARGET_ROTATION U8G2_R1   // pass to the constructor
   #define U8G2GL_TARGET_SETUP    "U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI"
   ```
   `U8G2GL_TARGET_ROTATION` expands to U8G2's own `U8G2_Rn` macro, so it
   needs `U8g2lib.h` only where it's used: at the board's constructor, which
   includes it anyway. `ui.hpp` itself keeps only the forward-declared `U8G2`
   it has today, and adds no include. The setup string is
   for diagnostics only, never compared at compile time: the bus is part of the
   name, so the same panel on another bus would fail when it shouldn't.
6. **The runtime check.** `ui.hpp` declares, and `ui.cpp` defines,
   ```cpp
   bool ui_display_matches(U8G2& display);
   ```
   It returns `display.getDisplayWidth() == U8G2GL_TARGET_WIDTH &&
   display.getDisplayHeight() == U8G2GL_TARGET_HEIGHT`. It allocates nothing and
   logs nothing: what to do on a mismatch is the firmware's call (the
   foundation will report it loudly). It catches the wrong panel size and the
   wrong rotation. It cannot catch a same-size panel on a different
   controller; the doc comment says so.
7. **Generated for the target being built.** The contract describes the target
   `generate` builds (`--target`, or the first). Its values come from the same
   oriented geometry as the resolver, so the contract and the layout can't
   disagree.
8. **Test runs honour rotation.** The harness already sizes its virtual display
   from the scene's `display`, so once the scene is oriented, Run draws an R1
   project portrait. No harness change is expected. The WO verifies it.
9. **The designer shows the oriented panel.**
   - The canvas, insertion, hit-testing and the impact preview all use the
     oriented size.
   - Changing `rotation` in the form shows the impact preview, as changing
     `setup` does (an R0→R1 change can push elements off-screen), and applies as
     one undo step.
   - The picker keeps showing the panel's native size, with the oriented size
     beside it when they differ: `256×64 · shown 64×256 at R1`.
10. **Diagnostics name the oriented size.** An out-of-bounds message on an R1
    target says `64×256 (256×64 rotated 90°)`, so the author isn't left
    comparing against a size they never wrote.
11. **CLI 0.18.0 for E-4a.** New emitted API is a minor bump. Every golden moves
    (the config header gains the contract), the fixture inputs don't, so the
    §13.9 determinism condition requires the bump. No runtime change: the check
    is generated code that calls U8G2's existing getters.
12. **E-4b removes the pins.** `cs`, `dc`, `reset`, `address` and `<bus>`
    leave the parser, the `Target` type and the vocabulary.
    - A written one is an **error** at every schema version, with its own code
      `U8G2GL_REMOVED_ATTRIBUTE` and a message saying where it belongs: "'cs'
      is not a U8G2GL attribute: pins and bus are configured by your
      firmware's board (e.g. `board.h`); U8G2GL describes the panel. See
      `u8g2gl display <setup> --snippet`." It's never the generic
      unknown-attribute message.
    - **No project is refused for its version number.** 0.4–0.6 stay accepted.
      A pin never had any effect, so the only files that break are ones that
      write one, and each gets the exact fix. Refusing every 0.6 project to
      remove an attribute nobody writes would force 13 fixtures and the
      foundation to edit their version strings for nothing. This bends rule
      03's "refuse the old version" for a breaking change, so it's the owner's
      call (O3).
    - The #56 bus-field code, `busFieldApplies()`, `BUS_NOT_YET_USED` and the
      bus coverage cases are deleted, not hidden.
13. **The constructor snippet replaces the pin fields** (principle 8: say where
    it is, and show how).
    - **One core function**, `constructorSnippet(record, rotation, target)`,
      writes the board-side code: the `#include`s, the constructor with
      `U8G2GL_TARGET_ROTATION` and **named placeholders** for every pin the
      wiring takes (`DISPLAY_CS`, `DISPLAY_DC`, `DISPLAY_RESET`, with
      `U8X8_PIN_NONE` noted where U8G2 allows it), then `begin()`,
      `ui_display_matches()` and `ui_init()`. It never invents pin numbers:
      U8G2GL doesn't know the board's wiring, by design.
    - **The argument lists come from U8G2's own `U8g2lib.h`**, extracted when
      the catalogue is built, the same way setups and sizes are ([D-14]). The
      catalogue record gains `bus.pins: readonly string[]` (e.g.
      `['clock','data','cs','dc','reset']`). Nothing is typed by hand.
    - **Shown in two places:**
      - the designer's target section, in place of the bus fields, with Copy,
        updating as the display or rotation changes;
      - `u8g2gl display <setup> --snippet [--rotation R1]`.
    - **Never a file in `generated/`.** Generated code is compiled and
      committed, and a sample nothing compiles would go stale, or be compiled
      twice beside the board's real constructor.
14. **The mirrors are additive** (schema 0.7).
    - `rotation` accepts `MIRROR` and `MIRROR_VERTICAL`, gated
      `MIRROR_SINCE = '0.7'` as palette metadata is, so a 0.6 project writing
      one gets "needs schema 0.7".
    - Both are layout-neutral, like R0/R2: no size swap. They map to
      `U8G2_MIRROR` / `U8G2_MIRROR_VERTICAL` in `U8G2GL_TARGET_ROTATION`.
    - The designer draws the UI the right way round, as it does for R2. The
      rotation select labels them "mirrored left–right" and "mirrored
      top–bottom", and the help explains when to use them (reflective or
      head-up-display glass).
    - The rotation help also explains rotation vs the controller's flip mode,
      so the difference is discoverable.
    - The CST, form and coverage tests cover the two new values.
15. **Docs.**
    - design_spec §5.1: `rotation` is honoured (the layout is oriented, the
      contract emitted), and its six values are listed. The pins are removed,
      with the reason, replacing the [D-14] sentence that says bus parameters
      "remain the user's to set".
    - design_spec §15.4: schema 0.7's additions and the removed attributes.
    - design_spec §16: the contract macros and `ui_display_matches()`, with the
      one-line board-side use.
    - ui_spec §6.4: the rotation impact preview; the snippet in place of the
      bus fields.
    - ChangeLog for each PR.
    - A new decision record **[D-n] The board owns the wiring**, citing LVGL
      Pro, SquareLine and ESPHome as in the investigation.
16. **The foundation is out of scope (R10).** Its two lines (construct with
    `U8G2GL_TARGET_ROTATION`, call `ui_display_matches()` in `begin()`) belong
    to the held integration branch. E-4a's ChangeLog shows the snippet. No
    commit to either foundation repository.

## Decomposition

Worktree `../U8G2GL-e4` from `origin/main` (`021ba54`). One branch per WO,
stacked. The worker doesn't push. The PA verifies, pushes and opens each PR.

### E-4a — rotation and contract (branches `u8g2gl-e4a/wo*`)

| WO | Scope | Done when |
|---|---|---|
| **WO1** core geometry | `normaliseRotation()`, `orientedDisplay()`. All CLI layout consumers switched (validator, shared model, generator resolver, scene `display`, `cli.ts` report). Oriented sizes in out-of-bounds messages. New fixture `cli/test/validator/fixtures/rotated-r1/` (portrait layout that's in bounds at R1 and out at R0). | Unit tests for both helpers (all 8 spellings). Validator tests: R1 fixture clean, the same at R0 reports OUT_OF_BOUNDS naming the oriented size. Budget unchanged for R1 vs R0. |
| **WO2** generated contract | `ui.hpp` gains the four macros and declares `ui_display_matches()`; `ui.cpp` defines it. Goldens refreshed; CLI 0.18.0. | Golden diff shows only the contract lines (plus the stamp). C++ test under `test/` constructs a fake 256×64 and an R1 64×256 display and checks `ui_display_matches()` both ways. The host and wasm builds compile. Determinism check passes with the bump. |
| **WO3** designer | Live pipeline, insertion, hit-testing and the impact preview use the oriented size. Rotation change goes through the impact preview. Picker shows the oriented size beside the native one. | Designer unit tests. e2e: change R0→R1 on the demo copy, preview lists the elements that fall outside, apply resizes the canvas to 64×256, one undo restores it. A Run on the R1 fixture draws a 64×256 frame. |
| **WO4** docs and review | design_spec §5.1, §16, new [D-n]; ui_spec §6.4; ChangeLog with the foundation snippet; readability review of the branch. | All suites pass sequentially (the verify script), home-path guard clean, check-package PASS at 0.18.0. |

### E-4b — pins out, snippet and mirrors in (after E-4a merges; branches `u8g2gl-e4b/wo*`)

| WO | Scope | Done when |
|---|---|---|
| **WO1** catalogue pins | The catalogue builder extracts each wiring's constructor parameters from `U8g2lib.h` into `bus.pins`; the catalogue is regenerated; `constructorSnippet()` in core. | Every catalogue record has `pins`, and every distinct wiring is covered by a test against U8G2's source. A snippet golden for each wiring family. A host build compiles the HW SPI, SW SPI and HW I²C snippets against the vendored U8G2 with stub pin values. |
| **WO2** schema 0.7 | Pins and `<bus>` removed from the parser, `Target` and the vocabulary; `U8G2GL_REMOVED_ATTRIBUTE`; schema 0.7 accepted, with `MIRROR`/`MIRROR_VERTICAL` gated to it; `U8G2GL_TARGET_ROTATION` maps them. | Tests: each removed attribute on `<display>`, `<target>` and `<bus>` errors once at its line, naming the board; 0.4–0.6 projects without pins still pass; a mirror at 0.6 says "needs 0.7"; at 0.7 it validates and the contract emits `U8G2_MIRROR`. Goldens unchanged. |
| **WO3** designer and CLI | The bus fields and their code are deleted; the snippet panel with Copy; rotation select gains the mirrors, with flip-mode help; `display --snippet`. | Unit and e2e: the target section shows the snippet for the demo's SSD1322 and updates when the display or rotation changes; Copy puts it on the clipboard; choosing a mirror leaves the canvas size alone. The CLI snippet matches the designer's. |
| **WO4** docs and review | design_spec §5.1, §15.4, [D-n]; ui_spec; ChangeLog; CLI 0.19.0; readability review. | All suites pass sequentially; check-package PASS at 0.19.0. |

## For the owner to decide

- **O1. The macro names.** `U8G2GL_TARGET_WIDTH/HEIGHT/ROTATION/SETUP` as above,
  or `UI_DISPLAY_*` to match the `ui_` prefix of the generated functions? I
  recommend `U8G2GL_TARGET_*`: macros elsewhere in generated code use the
  `U8G2GL_` prefix, and "target" is the schema's word.
- **O2. The version numbers.** CLI 0.18.0 for E-4a and 0.19.0 for E-4b,
  as in rulings 11 and 12?
- **O3. Schema 0.7, and how the pins break.** The bump is yours to approve
  (rule 03). I recommend:
  - 0.7 for the mirrors (additive, gated as palette metadata was);
  - the pin attributes refused **at every version** with the specific
    message, while 0.4–0.6 projects without pins stay accepted.

  The alternative is the letter of rule 03: refuse every pre-0.7 project
  with a migration table, so all 13 fixtures and the foundation's project edit
  their version strings.
- **O4. Share 0.7 with E-3?** E-3's S2 (the `<data>`/`<field>` block) also
  needs 0.7. I recommend that E-4b takes 0.7 now and E-3 adds to it while 0.7
  is still current. That's additive, so no second breaking step. The
  alternative is holding E-4b until E-3 is ready.

## Status log

- 2026-11-14 — Drafted by the PA from the investigation, after the owner chose
  option B ("Plan option B").
- 2026-11-14 — Revised after owner review: the pins are removed rather than
  deprecated ("do we need a deprecation attribute if we have sero actual
  clients yet?"); the constructor snippet is added; the U8G2 mirrors are added
  ("add it in, might as well be complete").
- 2026-11-14 — **Approved by the owner.** Asked "Do you approve E-4 as
  revised, with my recommendations on O1–O4?", the owner replied, in their
  own words: **"Approve E-4"**. That settles O1–O4 as recommended:
  - O1: `U8G2GL_TARGET_*`;
  - O2: CLI 0.18.0 for E-4a, 0.19.0 for E-4b;
  - O3: schema 0.7 approved, with the pins refused at every version and 0.4–0.6
    still accepted;
  - O4: E-4b takes 0.7 and E-3 adds to it later.
  E-4a is worked first; E-4b's work orders are written after E-4a merges.
