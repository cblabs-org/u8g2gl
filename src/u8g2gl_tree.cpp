/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_tree.cpp
 *
 * Purpose: Implements the ancestry walks declared in u8g2gl_tree.h. Everything
 *          here runs once per object per frame inside the render loop, so the
 *          shape of this file is dictated by two constraints: no allocation, and
 *          no unbounded loop. A malformed hierarchy must degrade to drawing
 *          nothing rather than hanging or dereferencing null — on this target a
 *          crash is a reboot, not a stack trace.
 *
 * Description: Rectangle intersection, effective visibility, effective clip.
 *              Contracts for all three are on the declarations in the header;
 *              the banners below describe the implementations.
 */
#include "u8g2gl/u8g2gl_tree.h"
#include "u8g2gl/u8g2gl_obj.h"

// u8g2gl_rect_intersect
// Overlap of two rectangles, with a deliberate convention for the empty case:
// the result keeps the position where the overlap would have started instead of
// collapsing to the origin.
//   a — first rectangle; an empty input short-circuits the result
//   b — second rectangle; likewise
u8g2gl_rect u8g2gl_rect_intersect(const u8g2gl_rect& a, const u8g2gl_rect& b) {
    // --- Step 1: Propagate emptiness, preserving position ---
    // An empty input yields an empty result. The position is carried through
    // rather than zeroed because this result is often fed straight into another
    // intersection while walking up the ancestor chain; collapsing to {0,0}
    // would move the clip region to the top-left of the display instead of
    // leaving it empty where it was.
    if (a.w <= 0 || a.h <= 0) {
        return {a.x, a.y, 0, 0};
    }
    if (b.w <= 0 || b.h <= 0) {
        return {b.x, b.y, 0, 0};
    }

    // --- Step 2: Compute edges in 32-bit ---
    // x + w can exceed int16_t for a large coordinate and a large extent even
    // though both operands are valid. Widening here keeps the comparisons below
    // correct; the result is narrowed again in Step 4, by which point it is
    // bounded by the smaller of the two inputs and therefore back in range.
    int32_t a_right = static_cast<int32_t>(a.x) + a.w;
    int32_t a_bottom = static_cast<int32_t>(a.y) + a.h;
    int32_t b_right = static_cast<int32_t>(b.x) + b.w;
    int32_t b_bottom = static_cast<int32_t>(b.y) + b.h;

    // --- Step 3: Overlap is the later start and the earlier end, per axis ---
    int32_t x1 = a.x > b.x ? a.x : b.x;
    int32_t y1 = a.y > b.y ? a.y : b.y;
    int32_t x2 = a_right < b_right ? a_right : b_right;
    int32_t y2 = a_bottom < b_bottom ? a_bottom : b_bottom;

    // --- Step 4: Reject a non-overlap, else narrow back to int16_t ---
    if (x2 <= x1 || y2 <= y1) {
        return {static_cast<int16_t>(x1), static_cast<int16_t>(y1), 0, 0};
    }

    return {
        static_cast<int16_t>(x1),
        static_cast<int16_t>(y1),
        static_cast<int16_t>(x2 - x1),
        static_cast<int16_t>(y2 - y1)
    };
}

// u8g2gl_is_effectively_visible
// Walks from `index` up to a root, returning false at the first hidden or null
// object. Reaching a root without finding one means visible.
//   objs    — flat object array in document order; null entry means not visible
//   parents — parallel index array, or nullptr to use each object's own index
//   index   — object being tested
bool u8g2gl_is_effectively_visible(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
) {
    if (objs == nullptr) {
        return false;
    }

    // --- Walk upward: any hidden ancestor hides this object ---
    uint8_t curr = index;
    while (curr != U8G2GL_NO_PARENT) {
        const u8g2gl_obj* obj = objs[curr];

        // A null entry means a partially constructed screen. Treat it as not
        // visible: drawing nothing is recoverable, dereferencing null is not.
        if (obj == nullptr) {
            return false;
        }
        if (obj->has_flag(U8G2GL_FLAG_HIDDEN)) {
            return false;
        }

        // The parent array is authoritative when supplied (generated screens),
        // otherwise fall back to the object's own index (tests, ad-hoc trees).
        uint8_t next = (parents != nullptr) ? parents[curr] : obj->get_parent_index();

        // Guard against an object listed as its own parent. That would be a
        // malformed hierarchy, but it must not become an infinite loop inside
        // the render path — bail out and treat what we have walked as the whole
        // chain.
        if (next == curr) {
            break;
        }
        curr = next;
    }
    return true;
}

// u8g2gl_effective_clip
// Starts from the object's own bounds and intersects with each ancestor while
// walking upward, stopping early once the region is empty.
//   objs    — flat object array in document order; null entry yields empty
//   parents — parallel index array, or nullptr to use each object's own index
//   index   — object whose drawable region is wanted
u8g2gl_rect u8g2gl_effective_clip(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
) {
    if (objs == nullptr || objs[index] == nullptr) {
        return {0, 0, 0, 0};
    }

    // --- Step 1: Start from the object's own bounds ---
    const u8g2gl_obj* self = objs[index];
    u8g2gl_rect clip{self->get_x(), self->get_y(), self->get_w(), self->get_h()};

    // --- Step 2: Intersect with each ancestor in turn, walking upward ---
    uint8_t curr = (parents != nullptr) ? parents[index] : self->get_parent_index();
    while (curr != U8G2GL_NO_PARENT) {
        // Once the region is empty no ancestor can reopen it, so stop early
        // rather than walking a chain whose result is already decided.
        if (clip.w <= 0 || clip.h <= 0) {
            return clip;
        }

        const u8g2gl_obj* ancestor = objs[curr];
        if (ancestor == nullptr) {
            return {0, 0, 0, 0};
        }

        u8g2gl_rect ancestor_rect{
            ancestor->get_x(), ancestor->get_y(), ancestor->get_w(), ancestor->get_h()
        };
        clip = u8g2gl_rect_intersect(clip, ancestor_rect);

        uint8_t next = (parents != nullptr) ? parents[curr] : ancestor->get_parent_index();

        // Same self-parent guard as u8g2gl_is_effectively_visible().
        if (next == curr) {
            break;
        }
        curr = next;
    }
    return clip;
}
