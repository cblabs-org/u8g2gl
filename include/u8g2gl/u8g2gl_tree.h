/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_tree.h
 * Description: Declarations for u8g2gl_tree.h
 *
 * Exported Classes:
 * - u8g2gl_rect: struct for clipping and bounds
 *
 *     Visibility & Clipping:
 *     - u8g2gl_is_effectively_visible(): Check if an object is effectively visible
 *     - u8g2gl_effective_clip(): Compute effective clip rect
 *     - u8g2gl_rect_intersect(): Intersect two rectangles
 */
#ifndef U8G2GL_TREE_H
#define U8G2GL_TREE_H

#include <cstdint>
#include "u8g2gl_types.h"

class u8g2gl_obj;

// Rectangle struct for clipping and bounds
struct u8g2gl_rect {
    int16_t x;
    int16_t y;
    int16_t w;
    int16_t h;
};

// Why a flat array with parent indices rather than a tree?
// See [A-3]: Rendering is full-frame in document order ([D-4]) and layout is
// resolved at build time ([D-7]). The only queries made are "am I visible" and
// "what is my clip", both of which walk *upward*. A child list would cost a
// vector per node to serve queries nobody makes.
//
// Check if an object is effectively visible (own flag AND all ancestors)
bool u8g2gl_is_effectively_visible(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

// Compute effective clip rect (intersection of all ancestor bounds)
u8g2gl_rect u8g2gl_effective_clip(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

// Intersect two rectangles (utility)
u8g2gl_rect u8g2gl_rect_intersect(const u8g2gl_rect& a, const u8g2gl_rect& b);

#endif // U8G2GL_TREE_H
