# [D-22] The board owns the wiring; U8G2GL owns the panel

**Status**: Decided
**Date**: 2026-11-14
**Decision**: `u8g2gl.xml` describes what the UI depends on: the **panel** (`setup`)
and its **orientation** (`rotation`). The firmware's board layer (in
`esp32-app-foundation`, `board.h`) owns constructing the display and wiring it.
The two are tied by a **generated, checked contract** in `ui.hpp` rather than by
a hand-kept copy of the same facts in two places.

## Context

A U8G2 display has two kinds of fact.

- **What the UI is laid out against**: the panel's width and height, and the
  rotation it is constructed at, which can swap them. Every bound, anchor and
  `#screen_width` in a project depends on these, so U8G2GL must know them.
  `setup` gives the panel, and the catalogue derives its geometry from U8G2's
  own tables ([D-14]).
- **How this board reaches the panel**: the bus, and which pins carry chip
  select, data/command and reset, or the I²C address. Nothing in the layout
  depends on them, and U8G2GL never constructs the display (§13.10), so it
  cannot use them.

Before this decision the schema accepted both. `rotation` was parsed and
validated and then read by nothing, so a portrait project was laid out
landscape. The pin attributes were accepted and recorded but had no effect, and
their help said so. The board that actually constructs the display kept its own
copy of the setup and rotation, with nothing to say when the two disagreed.

## Decision

1. **The panel and its rotation belong to the UI project.** `rotation` is
   honoured in every layout reader: the validator, the resolver, the scene
   description, the designer's canvas and the test-run harness (design_spec
   §5.1). The catalogue record is never rotated: framebuffer, tiles, bus and
   driver stay the hardware's.
2. **The wiring belongs to the board.** One UI project serves every board that
   carries the same panel, whatever pins each uses. The pin attributes and
   `<bus>` are removed with schema 0.7 (E-4b), each written one refused with an
   error that names the board as their place; a constructor snippet with named
   placeholders for the pins shows the board what to write.
3. **A generated contract ties the two** (design_spec §16). `ui.hpp` states
   `U8G2GL_TARGET_WIDTH` and `U8G2GL_TARGET_HEIGHT` (after rotation),
   `U8G2GL_TARGET_ROTATION` (U8G2's own `U8G2_Rn`, to construct with) and
   `U8G2GL_TARGET_SETUP` (for diagnostics), and declares
   `bool ui_display_matches(U8G2&)`, which compares the constructed display's
   reported size with the contract. The board constructs with the rotation and
   checks after `begin()`; what it does on a mismatch is its own call.

## Alternatives rejected

- **Keep the pins in the UI project and generate the constructor.** U8G2GL
  would then own construction, which §13.10 leaves with the application, and
  one UI project would be tied to one board's wiring. A second board with the
  same panel would need a second project, or a target per board, for facts the
  layout never reads.
- **Keep both copies by hand.** That is the state this replaces: the setup and
  rotation written in the UI project and again in the board, agreeing only by
  care. A portrait layout on a board constructed at `R0` drew off the panel with
  nothing to say why.
- **Compare the setup at compile time.** The bus is part of a U8G2 setup name,
  so the same panel on another bus would fail a check it should pass. The setup
  is carried as a string for diagnostics only; the size is what is checked.

## Prior art

A tool owns the pins only when it owns the whole firmware. UI tools that plug
into someone else's firmware declare the panel and leave construction to the
board layer:

- **LVGL Pro.** A project's `project.xml` declares each target's display
  (`<display width height color_format>`, plus optional `<memory>`) and no
  pins. The hardware is the ecosystem's: a Zephyr board's devicetree, a
  desktop backend, or the user's own driver code.
- **SquareLine Studio.** Project settings hold the resolution, colour depth and
  rotation. The driver and pins live in the exported template project (for
  example TFT_eSPI's `User_Setup.h`), not in the UI it exports.
- **ESPHome** is the exception that proves the rule. Its YAML does own
  `cs_pin`, `dc_pin` and `reset_pin` on the display, and the bus on an `spi:`
  block, because ESPHome generates and constructs the entire firmware.
  U8G2GL is a library inside the firmware, so it is in LVGL Pro's position.
- **The foundation itself.** `esp32-app-foundation` already has a hardware
  owner: `hardware/<board>/board.h` defines `U8G2_DISPLAY_TYPE` and the
  display pins, and `board_contract.h` checks them at compile time. One UI
  project per panel serves both `esp32dev` and `esp32s3nano`, whose display
  pins differ (chip select is 26 on one and 10 on the other).

Sources: [LVGL Pro Quick Start](https://docs.pro.lvgl.io/quick_start.html),
[SquareLine project settings](https://docs.squareline.io/docs/dev_env/project_settings),
[SquareLine Open Board Platform](https://docs.squareline.io/docs/obp),
[ESPHome SSD1322](https://esphome.io/components/display/ssd1322/).

## Consequences

- A portrait project lays out, validates, generates, previews and runs
  portrait. Bounds messages on a rotated target name the oriented size and how
  it came by it.
- The board's integration is two lines: construct with
  `U8G2GL_TARGET_ROTATION`, and call `ui_display_matches()` after `begin()`.
- `ui_display_matches()` catches the wrong panel size and the wrong rotation.
  It cannot catch a same-size panel on a different controller; that would need
  a check U8G2 does not offer.
- The contract is per build: it describes the target `generate` built, so a
  project with several targets has one contract per generated tree.
- Removing the pins is breaking schema surface. It lands as its own schema
  minor (0.7) with a specific error per attribute, never silently (§15.4).

## Trigger to revisit

A board that must drive two panels from one UI build, or a display U8G2 cannot
construct, would need the contract to describe more than one panel.
