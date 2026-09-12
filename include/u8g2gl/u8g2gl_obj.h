/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_obj.h
 *
 * Purpose: The base class every visual element inherits. It exists so that the
 *          render loop, the hierarchy walks and the binding system can all work
 *          against one type without knowing what a widget actually draws —
 *          a label, a clock and a custom gauge are interchangeable to
 *          everything outside their own render().
 *
 *          Carries only what every element needs: geometry, flags, a parent
 *          index, a resolved style, and the tick/render lifecycle. Anything a
 *          single widget needs belongs in that widget, not here — this type is
 *          instantiated once per element on a constrained target, so every byte
 *          added here is multiplied across the screen.
 *
 *          Implements the virtual-base decision [PD-3] and the flat-hierarchy
 *          model [A-3]. Widgets in PR-03 subclass this; generated screen code
 *          constructs and configures it via the setters below.
 *
 * Description: Geometry, flags, parent index, dirty tracking, subject bindings,
 *              style, and the two-phase tick/render lifecycle with the blocked-
 *              loop escape hatch
 *
 * Exported Classes:
 * - u8g2gl_obj: base class for all widgets
 *
 *     Geometry:
 *     - set_coords():        Position and size in device pixels
 *     - set_x/y/w/h():       Per-axis setters, for binding a single axis
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

    // --- Coordinates ---

    /**
     * @brief Set position and size, in device pixels.
     *
     * Coordinates are absolute, not relative to a parent — layout is fully
     * resolved at build time ([D-7]), so the generator emits final values here
     * and nothing recomputes them at runtime. The parent relationship affects
     * clipping and visibility only (see u8g2gl_tree.h), never position.
     *
     * Marks the frame dirty if any of the four values actually changes.
     *
     * @param x Left edge.
     * @param y Top edge.
     * @param w Width; the element occupies x .. x+w-1 inclusive.
     * @param h Height; the element occupies y .. y+h-1 inclusive.
     */
    void set_coords(int16_t x, int16_t y, int16_t w, int16_t h);

    /**
     * @brief Set the left edge alone, in device pixels.
     *
     * Exists so a `bind_width`-style observer bound to a single geometry
     * subject ([D-20]) has a setter to call — it receives one value and has
     * nothing sensible to pass for the other three axes that set_coords()
     * requires. Marks the frame dirty if the value actually changes.
     *
     * @param x Left edge.
     */
    void set_x(int16_t x);

    /**
     * @brief Set the top edge alone, in device pixels.
     *
     * See set_x() for why a per-axis setter exists ([D-20]). Marks the frame
     * dirty if the value actually changes.
     *
     * @param y Top edge.
     */
    void set_y(int16_t y);

    /**
     * @brief Set the width alone, in device pixels.
     *
     * See set_x() for why a per-axis setter exists ([D-20]). Marks the frame
     * dirty if the value actually changes.
     *
     * @param w Width; the element occupies x .. x+w-1 inclusive.
     */
    void set_w(int16_t w);

    /**
     * @brief Set the height alone, in device pixels.
     *
     * See set_x() for why a per-axis setter exists ([D-20]). Marks the frame
     * dirty if the value actually changes.
     *
     * @param h Height; the element occupies y .. y+h-1 inclusive.
     */
    void set_h(int16_t h);

    int16_t get_x() const;  ///< @brief Left edge in device pixels.
    int16_t get_y() const;  ///< @brief Top edge in device pixels.
    int16_t get_w() const;  ///< @brief Width in device pixels.
    int16_t get_h() const;  ///< @brief Height in device pixels.

    // --- Flags ---

    /**
     * @brief Set a flag bit.
     * @param flag One of the U8G2GL_FLAG_* constants, e.g. U8G2GL_FLAG_HIDDEN.
     */
    void set_flag(uint8_t flag);

    /**
     * @brief Clear a flag bit.
     * @param flag One of the U8G2GL_FLAG_* constants.
     */
    void clear_flag(uint8_t flag);

    /**
     * @brief Test a flag bit on this object only.
     *
     * This does not consider ancestors. An object whose own HIDDEN flag is clear
     * may still be invisible because a container above it is hidden — use
     * u8g2gl_is_effectively_visible() when the answer must account for the
     * hierarchy, which is what the render loop does.
     *
     * @param flag One of the U8G2GL_FLAG_* constants.
     * @return true if the bit is set on this object.
     */
    bool has_flag(uint8_t flag) const;

    // Convenience wrappers over the two flags widgets use most
    /**
     * @brief Set or clear U8G2GL_FLAG_HIDDEN.
     *
     * Public API called imperatively (`obj->set_hidden(true)`), not only via a
     * binding — so unlike the flag-binding path, nothing else guarantees a
     * repaint here. Marks the frame dirty if the flag's value actually changes.
     *
     * @param h true to hide the object, false to show it.
     */
    void set_hidden(bool h);
    bool is_hidden() const;       ///< @brief This object's own hidden flag; ignores ancestors.

    /**
     * @brief Set or clear U8G2GL_FLAG_DISABLED.
     *
     * Public API called imperatively, same reasoning as set_hidden(). Marks the
     * frame dirty if the flag's value actually changes.
     *
     * @param d true to disable the object, false to enable it.
     */
    void set_disabled(bool d);
    bool is_disabled() const;     ///< @brief This object's own disabled flag.

    // --- Parent index ---

    /**
     * @brief Record this object's parent as an index into the screen's array.
     *
     * The hierarchy is a flat array with one parent index per object rather than
     * a tree — see the design note in u8g2gl_tree.h for why. Generated code sets
     * this during init; U8G2GL_NO_PARENT marks a root.
     *
     * @param idx Index of the parent within the same screen's object array, or
     *            U8G2GL_NO_PARENT for a top-level element.
     */
    void set_parent_index(uint8_t idx);

    /**
     * @brief This object's parent index.
     *
     * Used as a fallback by the ancestry walks when no parallel parent array is
     * supplied — see u8g2gl_is_effectively_visible().
     *
     * @return Parent index, or U8G2GL_NO_PARENT if this is a root.
     */
    uint8_t get_parent_index() const;

    // --- Dirty tracking ---

    /**
     * @brief Signal that this object's appearance has changed.
     *
     * Sets the per-object dirty flag and raises the screen-level flag that gates
     * the whole frame. Dirty tracking here decides whether a frame is drawn at
     * all — it never skips an individual object, because a full-frame redraw
     * follows clearBuffer() and skipping one object would simply leave a hole
     * ([D-4]). What it saves is the sendBuffer(), which is the expensive part.
     *
     * Widgets call this from tick() when animation state advances, and the
     * binding system calls it when an observed subject changes.
     */
    void mark_dirty();

    bool is_dirty() const;   ///< @brief Whether this object has changed since the last clear.
    void clear_dirty();      ///< @brief Reset the dirty flag; called by the framework after a frame.

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

    // --- Virtual lifecycle ---

    /**
     * @brief Advance animation state and report when attention is next needed.
     *
     * Called once per frame before rendering. A widget updates its own timing
     * here — scroll offset, blink phase, interpolation — and calls mark_dirty()
     * if anything visible changed.
     *
     * The return value is what lets the application sleep precisely rather than
     * poll: ui_handler() takes the minimum across every object and hands that to
     * the caller ([D-15]). A clock blinking at 500 ms returns the remainder to
     * its next toggle; a static label returns U8G2GL_IDLE.
     *
     * @param now_ms Current time in milliseconds, from the application's clock.
     * @return Milliseconds until this object next needs a tick, or U8G2GL_IDLE
     *         if it is not animating. Returning U8G2GL_IDLE is always safe —
     *         it costs only the sleep hint, never correctness.
     */
    virtual uint32_t tick(uint32_t now_ms);

    /**
     * @brief Draw this object into the display buffer.
     *
     * The framework has already set the clip window to this object's effective
     * bounds and saved the U8G2 state, so an implementation may set font and
     * draw colour freely without restoring them, and cannot paint outside its
     * own region (§11.3).
     *
     * Called every frame for every visible object — there is no per-object skip
     * ([D-4]). Implementations should therefore be cheap and must not allocate.
     *
     * @param display The U8G2 instance owned by the application.
     */
    virtual void render(U8G2& display);

    // --- Escape hatch ---

    /**
     * @brief Redraw and push this object alone while the main loop is blocked.
     *
     * Exists only for the case where the application is stuck in a long
     * synchronous operation — a firmware download, a slow HTTP fetch — and the
     * display must still move. It is not the normal animation path ([D-5]);
     * tick() plus the next full frame is.
     *
     * An implementation must clear its own bounding box first, because the
     * buffer was not cleared on this path, and should push via
     * u8g2gl_partial_refresh() rather than computing tile coordinates itself.
     *
     * @param display The U8G2 instance owned by the application.
     * @param now_ms  Current time in milliseconds.
     */
    virtual void render_animation_update(U8G2& display, uint32_t now_ms);

protected:
    // Members are ordered largest-alignment-first and kept deliberately few:
    // this type is instantiated once per element, so its size is multiplied
    // across every screen. See PD-3 for the measured budget.
    int16_t x_ = 0;
    int16_t y_ = 0;
    int16_t w_ = 0;
    int16_t h_ = 0;
    uint8_t flags_ = 0;
    uint8_t parent_index_ = U8G2GL_NO_PARENT;
    u8g2gl_style style_;    ///< Resolved style — embedded, not referenced, so no indirection per draw

private:
    /**
     * @brief Register a conditional flag binding in the shared binding pool.
     *
     * Common implementation behind every bind_flag_if_* overload; the public
     * overloads exist to give each comparison a type-safe signature.
     *
     * @param subject   Subject to observe, as an opaque pointer — the pool is
     *                  shared across subject types, so the concrete type is
     *                  carried separately in @p type.
     * @param type      Which subject type @p subject actually points to; used to
     *                  cast back when the binding is evaluated.
     * @param op        Comparison to apply against @p ref_value.
     * @param ref_value Value compared against the subject's current value.
     * @param flag      Flag set when the comparison holds, cleared when it does not.
     * @return false if the binding pool or the subject's observer capacity is
     *         exhausted, in which case no binding is registered.
     */
    bool add_flag_binding(void* subject, u8g2gl_subject_type_t type, u8g2gl_binding_op_t op, int32_t ref_value, uint8_t flag);
};

#endif // U8G2GL_OBJ_H
