/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_obj.h
 * Description: Declarations for u8g2gl_obj.h
 *
 * Exported Classes:
 * - u8g2gl_obj: base class for all widgets
 *
 *     Geometry:
 *     - set_coords():        Position and size in device pixels
 *     - get_x/y/w/h():       Individual accessors
 *
 *     Visibility & flags:
 *     - set_hidden():        Exclude from rendering
 *     - has_flag():          Test a U8G2GL_FLAG_* bit
 *
 *     Hierarchy:
 *     - set_parent_index():  Index into the screen's flat object array
 *
 *     Data binding:
 *     - bind_text():         Bind display text to a subject
 *     - bind_flag_if_*():    Conditional flag from a subject's value
 *
 *     Lifecycle (virtual):
 *     - tick():              Advance animation; returns next deadline
 *     - render():            Draw to the U8G2 buffer
 */
#ifndef U8G2GL_OBJ_H
#define U8G2GL_OBJ_H

#include "u8g2gl_types.h"
#include "u8g2gl_tree.h"
#include "u8g2gl_config.h"
#include "u8g2gl_subject.h"
#include "u8g2gl_style.h"

// Forward declaration of U8G2
class U8G2;

class u8g2gl_obj {
public:
    u8g2gl_obj() = default;
    virtual ~u8g2gl_obj();

    // --- Coordinates (set by generated init code) ---
    void set_coords(int16_t x, int16_t y, int16_t w, int16_t h);
    int16_t get_x() const;
    int16_t get_y() const;
    int16_t get_w() const;
    int16_t get_h() const;

    // --- Flags ---
    void set_flag(uint8_t flag);       // e.g. set_flag(U8G2GL_FLAG_HIDDEN)
    void clear_flag(uint8_t flag);
    bool has_flag(uint8_t flag) const;

    // Convenience
    void set_hidden(bool h);
    bool is_hidden() const;
    void set_disabled(bool d);
    bool is_disabled() const;

    // --- Parent index (for flat-array hierarchy) ---
    void set_parent_index(uint8_t idx);
    uint8_t get_parent_index() const;

    // --- Dirty tracking ---
    // mark_dirty() sets the per-object DIRTY flag and gates
    // the frame at screen level via u8g2gl_mark_dirty() (WO5).
    void mark_dirty();
    bool is_dirty() const;
    void clear_dirty();

    // --- Data Binding (§8, §13.8) ---
    // WO6 Round 2: parameters take the non-template `_base` types, not the
    // default-capacity aliases (u8g2gl_subject_int == u8g2gl_subject_int_n<>).
    // Any u8g2gl_subject_*_n<N> converts implicitly to its base, so a
    // right-sized subject (e.g. u8g2gl_subject_int_n<2>) can now actually be
    // bound through this API — Finding B's per-subject sizing was otherwise
    // unreachable. Existing call sites using the default aliases still
    // compile unchanged.
    /**
     * @brief Bind this object's text to an int subject.
     *
     * The object registers as an observer and re-renders when the subject changes.
     * Binding replaces any literal text; the two are mutually exclusive.
     * The two bind_text() overloads are mutually exclusive per object.
     *
     * @param subject Subject to observe. Must outlive this object — subjects are
     *                statically allocated by generated code, so this holds by
     *                construction for generated screens.
     * @param fmt     Optional printf format applied to the value. nullptr uses the
     *                raw string.
     *
     * Note: Silently fails to register if observer capacity is exhausted.
     */
    void bind_text(u8g2gl_subject_int_base* subject, const char* fmt = nullptr);

    /**
     * @brief Bind this object's text to a string subject.
     *
     * The object registers as an observer and re-renders when the subject changes.
     * Binding replaces any literal text; the two are mutually exclusive.
     * The two bind_text() overloads are mutually exclusive per object.
     *
     * @param subject Subject to observe. Must outlive this object.
     *
     * Note: Silently fails to register if observer capacity is exhausted.
     */
    void bind_text(u8g2gl_subject_string_base* subject);

    /**
     * @brief Conditionally set or clear a flag based on a subject's value.
     *
     * @param subject   Subject to observe. Must outlive this object.
     * @param ref_value Value to compare against.
     * @param flag      Flag to set/clear (e.g., U8G2GL_FLAG_HIDDEN).
     *
     * Note: Silently fails to register if observer capacity is exhausted.
     */
    void bind_flag_if_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);
    void bind_flag_if_not_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);
    void bind_flag_if_gt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);
    void bind_flag_if_lt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);

    void bind_flag_if_eq(u8g2gl_subject_bool_base* subject, int32_t ref_value, uint8_t flag);
    void bind_flag_if_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag);
    void bind_flag_if_not_eq(u8g2gl_subject_bool_base* subject, int32_t ref_value, uint8_t flag);
    void bind_flag_if_not_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag);

    void* get_bound_text_subject() const;
    const char* get_bound_text_fmt() const;
    u8g2gl_subject_type_t get_bound_text_type() const;

    // --- Style (§10, §13.7) ---
    void apply_style(const u8g2gl_style& style);
    const u8g2gl_style& get_resolved_style() const;

    // Individual style setters that generated code calls as inline overrides:
    void set_font(const uint8_t* font);
    void set_draw_color(u8g2gl_color_t c);
    void set_invert(bool v);
    void set_padding(int16_t p);
    void set_border(bool b);
    void set_radius(int16_t r);
    void set_align(u8g2gl_align_t a);
    void set_truncate(bool t);
    void set_font_mode(u8g2gl_font_mode_t m);
    void set_bitmap_mode(u8g2gl_bitmap_mode_t m);

    // --- Virtual lifecycle (overridden by concrete widgets in PR-03) ---
    virtual uint32_t tick(uint32_t now_ms);    // returns next deadline, default U8G2GL_IDLE
    virtual void render(U8G2& display);         // default: no-op

    // --- Escape hatch (§11.4, [D-5]) ---
    virtual void render_animation_update(U8G2& display, uint32_t now_ms);  // default: no-op

protected:
    int16_t x_ = 0;
    int16_t y_ = 0;
    int16_t w_ = 0;
    int16_t h_ = 0;
    uint8_t flags_ = 0;
    uint8_t parent_index_ = U8G2GL_NO_PARENT;
    u8g2gl_style style_;    // resolved style for this object

private:
    bool add_flag_binding(void* subject, u8g2gl_subject_type_t type, u8g2gl_binding_op_t op, int32_t ref_value, uint8_t flag);
};

#endif // U8G2GL_OBJ_H
