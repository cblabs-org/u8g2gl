# E-7 — U8G2's large fonts: say so before the linker does

*PA plan, drafted 2026-11-15 and approved by the owner the same day. Follows the finding in
PR #60 ("63 built-in fonts exist only under `U8G2_USE_LARGE_FONTS`"), which
the owner asked to plan ("Plan it").*

## Goal

A project that uses one of U8G2's large fonts, built for a platform where U8G2
leaves them out, fails with a clear message naming the font and the fix,
not an unexplained link error. The font picker shows which fonts are large
before you choose one.

One PR from main at `0e5f1ab` (after #60). No schema or runtime change. CLI
0.21.0 → **0.22.0**: generated output changes for projects that use a large
font.

## What the code says (main at `0e5f1ab`, U8G2 `d66b49a` = 2.36.18)

- **How U8G2 gates them.**
  - `csrc/u8g2.h:191–197` defines `U8G2_USE_LARGE_FONTS` only when `unix`,
    `__unix__`, `__arm__`, `__arc__`, `ESP8266`, `ESP_PLATFORM` or
    `__LUATOS__` is defined. It lets a project define the macro itself.
  - `csrc/u8g2_fonts.c` wraps the **definitions** of 63 fonts (those over
    32 KB) in `#ifdef U8G2_USE_LARGE_FONTS`, 126 lines in all.
  - Their **declarations** in `u8g2.h` are not gated. So code naming one
    compiles everywhere, and on AVR, for example, fails only at link time,
    with a bare "undefined reference to `u8g2_font_…`".
  - *Tooling note:* the shell's default `grep` gives unreliable counts on this
    40 MB file; `/usr/bin/grep -a` gives the figures above.
- **The font list.** `u8g2-fonts.json` (2039 names) and
  `u8g2-font-heights.json` are written by `node/build-catalogue.ts` from
  `parseFontSymbols()`/`parseFontHeights()`, which read U8G2's sources
  ([D-14]). Nothing records which fonts are large.
- **Generated code.** `emit/fonts.ts` writes `ui_fonts.cpp`, which includes
  `<U8g2lib.h>` (and so `u8g2.h`, where the macro is decided) and then
  references each built-in by name:
  `const uint8_t* const ui_font_X = X;`.
- **The picker** (E-6) shows each font's height, character set and glyph box
  from `fontFacts()` in `core/catalogue/font-facts.ts`. The sample renderer
  defines the macro, so large fonts have samples like any other.
- **The validator** knows a target's display `setup`, not its MCU or board, so
  it can't tell whether a target has the macro.

## Rulings

1. **The large fonts are extracted, never listed by hand.** The catalogue
   build finds every font defined inside an `#ifdef U8G2_USE_LARGE_FONTS`
   block of `u8g2_fonts.c`.
   - It writes them to `cli/src/data/u8g2-large-fonts.json` beside the font
     list, as the heights are.
   - A name in it that isn't in `u8g2-fonts.json` is a build error.
   - A test checks the count against the source, read independently of the
     builder.
2. **The check is generated where it can be answered: at compile time, on
   the real platform.**
   - For each large built-in a project uses, `ui_fonts.cpp` emits, after
     `#include <U8g2lib.h>`:
     ```cpp
     #ifndef U8G2_USE_LARGE_FONTS
     #error "u8g2_font_X is one of U8G2's large fonts (over 32 KB), which U8G2 compiles only where U8G2_USE_LARGE_FONTS is defined (see u8g2.h). Choose a smaller font, or define U8G2_USE_LARGE_FONTS if this platform supports arrays over 32 KB."
     #endif
     ```
   - The board then gets a message naming the font and both fixes, instead of
     a link error.
   - Projects that use no large font generate exactly what they do today, so
     no golden moves unless a fixture uses one.
   - The message cites `u8g2.h` and lists no platforms, so it can't go stale
     when U8G2 changes the list.
3. **The validator doesn't warn** (L1). It doesn't know the platform. On the
   boards U8G2 already covers (ESP32 and ARM, the foundation's included), a
   warning would be wrong every time. The generated `#error` fires exactly
   where the font is missing.
4. **The picker marks them.**
   - `fontFacts()` gains `large: boolean`, read from the extracted list.
   - Each large font's row and current-font facts say "large (over 32 KB):
     needs U8G2_USE_LARGE_FONTS", with a tooltip saying U8G2 enables it on
     unix, ARM and ESP targets (`u8g2.h`).
   - A "Hide large fonts" filter is off by default (L2). They stay listed,
     because ESP32 users can use them.
5. **Test the failure, not just the text.**
   - A compile-fail case under `test/`, in the pattern of
     `test/version_guard/`: a generated `ui_fonts.cpp` using a large font,
     compiled without `U8G2_USE_LARGE_FONTS`, must fail with the font's name
     in the error.
   - The same file compiled with the macro defined must compile.
6. **Versions and docs.**
   - CLI 0.22.0: generated output changes for some inputs without an input
     change, so §13.9 requires a generator bump.
   - design_spec §14.1: large fonts, the generated check and the extraction.
   - ui_spec §6.4: the badge and filter.
   - ChangeLog.

## For the owner to decide

- **L1. A validator warning as well?** I recommend **no**, for the reason in
  ruling 3. The alternative is an `info` note on every use of a large font.
- **L2. Show large fonts by default in the picker, marked?** I recommend
  **yes**, with "Hide large fonts" off. The alternative is hiding them by
  default.
- **L3. CLI 0.22.0?**

## Decomposition

Worktree `../U8G2GL-e4` from `origin/main` (`0e5f1ab`). One branch per WO,
stacked. The worker doesn't push. The PA verifies, pushes and opens the PR.

| WO | Branch | Scope | Done when |
|---|---|---|---|
| **WO1** | `u8g2gl-e7/wo1-large-font-data` | Ruling 1. | `u8g2-large-fonts.json` has 63 names, all in the font list. A test recounts them from `u8g2_fonts.c` independently. Regenerating the data gives no diff elsewhere. |
| **WO2** | `u8g2gl-e7/wo2-generated-check` | Rulings 2 and 5. | Emitter unit tests: a large font gets the guard, a small one doesn't. The compile-fail case fails with the font's name, and compiles with the macro. Goldens unchanged (or, if a fixture uses a large font, only the guard lines move, and the report says which). |
| **WO3** | `u8g2gl-e7/wo3-picker` | Ruling 4. | Unit: `fontFacts().large` matches the list for all 2039 names; the filter. e2e: a large font's row shows the badge, and "Hide large fonts" removes it from the results. |
| **WO4** | `u8g2gl-e7/wo4-docs-review` | Ruling 6; CLI 0.22.0; readability review. | All suites one at a time; golden refresh empty; check-package PASS at 0.22.0; home-path guard clean. |

## Status log

- 2026-11-15 — Drafted by the PA after the owner asked to plan the large-fonts
  fix ("Plan it").
- 2026-11-15 — **Approved by the owner.** Asked "Do you approve E-7, with my
  recommendations on L1–L3?", the owner replied, in their own words:
  **"Approve E-7"**. That settles L1–L3 as recommended:
  - L1: no validator warning;
  - L2: large fonts shown in the picker, marked, with "Hide large fonts" off;
  - L3: CLI 0.22.0.
