/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/generated_fixture/support/fixture_u8g2_fonts.h
 *
 * Purpose: Declares the three U8G2 built-in fonts the generated fixture names, so
 *          its fonts unit compiles on the host. A `<builtin>` font is a
 *          reference to U8G2's own array (§14.1): generated code writes
 *          `ui_font_u8g2_font_6x10_mr = u8g2_font_6x10_mr`, and real U8G2
 *          declares that array in u8g2.h. The host stub (test/stubs/U8g2lib.h)
 *          models the U8G2 class, not its font tables, so without this the
 *          generated unit would not compile against the stub.
 *
 *          Forced into the fixture's fonts unit only (test/CMakeLists.txt), and
 *          deliberately not added to the authoritative stub: every other test
 *          target compiles against that stub, and none of them needs a font
 *          table.
 *
 * Description: `extern` declarations matching real U8G2's own spelling. The
 *              bytes are defined in fixture_u8g2_fonts.cpp.
 *
 * Exported Symbols:
 * - u8g2_font_6x10_mr:      stand-in for U8G2's 6x10 font table
 * - u8g2_font_5x7_mr:       stand-in for U8G2's 5x7 font table
 * - u8g2_font_helvR08_tr:   stand-in for a font whose U8G2 name carries capitals
 */
#ifndef U8G2GL_FIXTURE_U8G2_FONTS_H
#define U8G2GL_FIXTURE_U8G2_FONTS_H

#include <cstdint>

extern const uint8_t u8g2_font_6x10_mr[];
extern const uint8_t u8g2_font_5x7_mr[];

// PR-04 WO14: one of the 522 U8G2 fonts whose name carries capitals. Spelled
// here exactly as U8G2 spells it, because the generated alias names it verbatim
// -- a case-folded alias would fail to link against this declaration, which is
// what makes this the end-to-end proof of the mangling rule.
extern const uint8_t u8g2_font_helvR08_tr[];

#endif // U8G2GL_FIXTURE_U8G2_FONTS_H
