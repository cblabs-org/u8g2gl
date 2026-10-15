/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_tree.h
 *
 * Purpose: Gives the render loop the two ancestry answers it needs, so that no
 *          widget has to know a hierarchy exists. Hiding a container must hide
 *          everything inside it, and a child must not paint outside its parent.
 *          Both follow from walking parent indices upward, which is why this
 *          module exists as the single place that walk is implemented.
 *
 *          Sits between the screen render loop (u8g2gl_core) and the objects
 *          themselves (u8g2gl_obj): core asks these questions per object per
 *          frame; obj supplies the geometry and flags they read. Implements the
 *          flat-hierarchy decision [A-3] — see the design note below.
 *
 * Description: Two upward ancestry walks — effective visibility and effective
 *              clip — plus the rectangle intersection they share. Every walk is
 *              bounded and null-tolerant because it runs inside the render loop,
 *              where a bad pointer means a reboot rather than an exception.
 *
 * Exported Types:
 * - u8g2gl_rect: axis-aligned rectangle, used for bounds and clip regions
 *
 * Exported Functions:
 *
 *     Ancestry queries (walk upward from an object):
 *     - u8g2gl_is_effectively_visible(): own visibility AND every ancestor's
 *     - u8g2gl_effective_clip():         intersection of self and all ancestor bounds
 *
 *     Geometry utility:
 *     - u8g2gl_rect_intersect():         overlap of two rectangles
 */
#ifndef U8G2GL_TREE_H
#define U8G2GL_TREE_H

#include <cstdint>
#include "u8g2gl_types.h"

class u8g2gl_obj;

/**
 * @brief Axis-aligned rectangle in device pixels.
 *
 * Used both for object bounds and for clip regions. A rectangle with `w <= 0`
 * or `h <= 0` is empty; see u8g2gl_rect_intersect() for how emptiness is
 * represented, because the convention is deliberate and not the obvious one.
 */
struct u8g2gl_rect {
    int16_t x;  ///< Left edge, device pixels
    int16_t y;  ///< Top edge, device pixels
    int16_t w;  ///< Width; <= 0 means empty
    int16_t h;  ///< Height; <= 0 means empty
};

/*
 * DESIGN NOTE — why a flat array with parent indices, and not a tree [A-3]
 * ------------------------------------------------------------------------
 * LVGL keeps a real runtime tree: a parent pointer plus a child vector per
 * object. It needs one because it does runtime layout, dirty-region
 * invalidation and dynamic add/remove — all of which require walking *down*
 * from a node to its children.
 *
 * U8G2GL does none of those. Rendering is a full-frame redraw in document
 * order ([D-4]) and layout is resolved at build time ([D-7]), so the render
 * loop never asks "what are my children?". The only ancestry questions it asks
 * are the two functions below, and both walk *upward*.
 *
 * So the hierarchy is stored as one parent index per object — a single byte —
 * rather than a child vector per node. Serving upward queries costs a short
 * walk (depth is 2–4 in practice); serving downward queries would cost a
 * container per object to answer questions nobody asks.
 *
 * The trade to be aware of: "iterate my children" requires scanning the whole
 * array. If a future feature needs that in a hot path, this is the decision to
 * revisit.
 */

/**
 * @brief Test whether an object is visible once its ancestors are considered.
 *
 * An object is effectively visible only if neither it nor any ancestor carries
 * U8G2GL_FLAG_HIDDEN — hiding a container must hide everything inside it, which
 * is the semantic a real tree would give us for free and which this walk
 * reproduces.
 *
 * @param objs    Flat array of object pointers, in document order. A null entry
 *                anywhere on the ancestry chain is treated as not visible rather
 *                than as an error, so a partially constructed screen degrades to
 *                drawing nothing instead of dereferencing null.
 * @param parents Parallel array of parent indices, one per entry in @p objs,
 *                terminated by U8G2GL_NO_PARENT at a root. May be nullptr, in
 *                which case each object's own get_parent_index() is used
 *                instead — generated screens pass the array, ad-hoc and test
 *                construction can rely on the objects themselves.
 * @param index   Index into @p objs of the object being tested.
 * @return true if this object and every ancestor are visible.
 */
bool u8g2gl_is_effectively_visible(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

/**
 * @brief Compute the region an object may actually draw into.
 *
 * The result is the object's own bounds intersected with the bounds of every
 * ancestor, so a child cannot paint outside its container. The framework applies
 * this as the clip window before calling a widget's render() (§11.3), which is
 * what makes a widget that miscalculates a text width unable to corrupt its
 * neighbours.
 *
 * @param objs    Flat array of object pointers, in document order.
 * @param parents Parallel array of parent indices; may be nullptr, as for
 *                u8g2gl_is_effectively_visible().
 * @param index   Index of the object whose clip region is wanted.
 * @return The clip rectangle. Empty (`w` or `h` <= 0) when the object lies
 *         wholly outside an ancestor — callers should skip drawing rather than
 *         treat this as an error, since it is a normal outcome for an
 *         off-screen element.
 */
u8g2gl_rect u8g2gl_effective_clip(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

/**
 * @brief Intersect two rectangles.
 *
 * @param a First rectangle.
 * @param b Second rectangle.
 * @return The overlapping region, or an empty rectangle if they do not overlap.
 *         An empty result keeps the position where the overlap would have begun
 *         rather than collapsing to the origin — that position is meaningful
 *         when the result is fed back into a further intersection, and
 *         collapsing to {0,0} would silently move a clip region to the top-left
 *         of the display.
 */
u8g2gl_rect u8g2gl_rect_intersect(const u8g2gl_rect& a, const u8g2gl_rect& b);

#endif // U8G2GL_TREE_H
