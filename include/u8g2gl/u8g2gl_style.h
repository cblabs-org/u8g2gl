/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_style.h
 * Purpose: The complete visual vocabulary for a 1-bit display. Monochrome
 *          collapses styling to nine properties — there is no colour, no
 *          gradient, no opacity and no shadow to describe — so this is a flat
 *          struct rather than the cascade a colour framework needs. (`truncate`
 *          was the tenth; PR-3R WO2 deleted it — [D-19]'s long_mode="clip" on
 *          u8g2gl_label replaces what it did.)
 *
 *          A set_mask bitfield records which properties were explicitly set, so
 *          merging a named style over an object's own overrides can tell "set to
 *          the default value" apart from "never set". Without that distinction a
 *          style could not selectively override.
 *
 * Description: The monochrome property set, the per-property set_mask,
 *              merge_from() which composes a style over another, and
 *              clear_except() which undoes a merge while keeping chosen
 *              properties
 *
 * Exported Classes:
 * - u8g2gl_style: struct holding the 9 style properties
 *
 *     Style API:
 *     - set_font(), etc.: Individual property setters, recording set_mask
 *     - merge_from():     Compose another style's set properties over this one,
 *                         optionally leaving some untouched (§10 precedence)
 *     - clear_except():   Reset every property but the ones kept to unset
 */
#ifndef U8G2GL_STYLE_H
#define U8G2GL_STYLE_H

#include "u8g2gl_types.h"
#include <cstdint>

// Bitmask for which properties are set in a style
enum u8g2gl_style_prop_t : uint16_t {
    U8G2GL_STYLE_FONT         = (1 << 0),
    U8G2GL_STYLE_DRAW_COLOR   = (1 << 1),
    U8G2GL_STYLE_INVERT       = (1 << 2),
    U8G2GL_STYLE_PADDING      = (1 << 3),
    U8G2GL_STYLE_BORDER       = (1 << 4),
    U8G2GL_STYLE_RADIUS       = (1 << 5),
    U8G2GL_STYLE_ALIGN        = (1 << 6),
    // (1 << 7) was U8G2GL_STYLE_TRUNCATE, deleted by [D-19] — long_mode="clip"
    // on u8g2gl_label replaces it (PR-3R WO2). Bit left unused rather than
    // renumbered so a stale serialized set_mask from before this change reads
    // as harmless noise instead of silently meaning a different property.
    U8G2GL_STYLE_FONT_MODE    = (1 << 8),
    U8G2GL_STYLE_BITMAP_MODE  = (1 << 9),
};

struct u8g2gl_style {
    // Properties — ordered largest-alignment-first (WO6 Finding C) to avoid
    // padding: pointer, then 16-bit fields, then 8-bit enums/bools. Behaviour
    // is unchanged; only layout is.
    const uint8_t* font = nullptr;        // U8G2 font pointer
    int16_t padding = 0;
    int16_t radius = 0;

    // Which properties are explicitly set
    uint16_t set_mask = 0;

    u8g2gl_color_t draw_color = U8G2GL_COLOR_1;
    u8g2gl_align_t align = U8G2GL_ALIGN_LEFT;
    u8g2gl_font_mode_t font_mode = U8G2GL_FONT_MODE_SOLID;
    u8g2gl_bitmap_mode_t bitmap_mode = U8G2GL_BITMAP_MODE_SOLID;
    bool invert = false;
    bool border = false;

    // --- Setters that also mark the property as set ---
    void set_font(const uint8_t* f);
    void set_draw_color(u8g2gl_color_t c);
    void set_invert(bool v);
    void set_padding(int16_t p);
    void set_border(bool b);
    void set_radius(int16_t r);
    void set_align(u8g2gl_align_t a);
    void set_font_mode(u8g2gl_font_mode_t m);
    void set_bitmap_mode(u8g2gl_bitmap_mode_t m);

    // --- Query ---
    bool has(u8g2gl_style_prop_t prop) const;

    /**
     * @brief Compose @p other's explicitly-set properties over this style.
     *
     * Properties @p other leaves unset do not overwrite. Neither do the
     * properties named in @p keep_mask, whatever @p other says: that is how an
     * object's own setters win over a named style applied after them, which
     * §10 requires of a `focus_style` applied at run time.
     *
     * @param other     Style to merge in.
     * @param keep_mask u8g2gl_style_prop_t bits left untouched; 0 merges all.
     */
    void merge_from(const u8g2gl_style& other, uint16_t keep_mask = 0);

    /**
     * @brief Reset every property not in @p keep_mask to its default, and
     *        clear its set_mask bit.
     *
     * Undoes merges while keeping chosen properties: an object losing focus
     * keeps the properties it set itself and drops everything its styles
     * contributed, before its base style is merged in again.
     *
     * @param keep_mask u8g2gl_style_prop_t bits whose value and set bit stay.
     */
    void clear_except(uint16_t keep_mask);

    // --- Reset ---
    void clear();
};

#endif // U8G2GL_STYLE_H
