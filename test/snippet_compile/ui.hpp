/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/snippet_compile/ui.hpp
 * Purpose: Stands in for a project's generated ui.hpp, so the constructor
 *          snippets (cli/test/catalogue/snippets/) can be compiled as a board
 *          would compile them. It provides exactly what a snippet uses from
 *          the generated header: the rotation macro of the display contract,
 *          the contract check, and ui_init() (design_spec §16, §13.7).
 *
 * Description: The same declarations the generator emits, with the rotation
 *              fixed at U8G2_R0. Defined in ui_stub.cpp.
 *
 * Exported:
 * - U8G2GL_TARGET_ROTATION: The rotation the snippet constructs with
 * - ui_display_matches():   The contract check the snippet calls after begin()
 * - ui_init():              The UI's one boot call
 */
#ifndef UI_HPP
#define UI_HPP

class U8G2;

#define U8G2GL_TARGET_ROTATION U8G2_R0

/** @brief Whether a constructed display is the one the UI was laid out for. */
bool ui_display_matches(U8G2& display);

/** @brief Initialise the UI; called once, after the display is constructed. */
void ui_init();

#endif // UI_HPP
