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
 *     - bind_x/y():          Bind a position, container-relative, to an int subject ([D-20])
 *     - bind_width/height(): Bind a size to an int subject ([D-20])
 *     - bind_flag_if_*():    Conditional flag from a subject's value
 *     - add_value_binding(): (protected) pool slot + observer for a widget's
 *                            own bind_* method
 *     - bound_text():        (protected) a text binding's current text, read at
 *                            render time
 *     - on_text_binding_changed(): (protected, virtual) the hook a bound
 *                            subject's change calls
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

/**
 * @brief Bytes of stack a text-drawing widget reserves to format an int-bound
 *        text (bind_text with an int subject), terminator included.
 *
 * A bound int has no string of its own to point at, so it is formatted at render
 * time into a buffer on the stack of render() — never a per-object buffer, which
 * would cost this much RAM in every label whether bound or not. The longest
 * int32_t is 11 characters, leaving room for a unit such as "°C" (3 bytes in
 * UTF-8). A longer format result is truncated by snprintf(), never overflowed.
 * Define it before including this header to change it.
 */
#ifndef U8G2GL_BOUND_TEXT_BUFFER_SIZE
#define U8G2GL_BOUND_TEXT_BUFFER_SIZE 32
#endif

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
     * Marks the frame dirty if the index actually changes — reparenting affects
     * effective visibility and clipping (u8g2gl_tree.h), so it is a mutator that
     * changes what is drawn just as much as set_hidden() is (§11.2). This gap
     * was latent rather than live (generated init() code sets this once, before
     * the first frame), but PR-3R WO2 closes it anyway: WO1 established the rule
     * for every such mutator, and an undocumented exception here would read as
     * an oversight.
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
    // Binding capacity contract (PR-04 WO2): a successful first binding call
    // consumes exactly one slot of the shared binding pool and exactly one
    // observer slot on the subject, and a call that cannot have both consumes
    // neither and returns false. The generator counts capacities against this
    // invariant ([D-21]), so a method that consumed two of either would make
    // generated capacities silently too small.

    /**
     * @brief Bind this object's text to an int subject.
     *
     * The object registers as an observer; each change calls
     * on_text_binding_changed(), and a text-drawing widget formats the subject's
     * value when it renders (bound_text()). **An active binding wins over a
     * literal text** whichever was set first (the manifests: "Overridden when
     * bind_text is active"). The two bind_text() overloads are mutually
     * exclusive per object: binding one replaces the other.
     *
     * @param subject Subject to observe. Must outlive this object — subjects are
     *                statically allocated by generated code, so this holds by
     *                construction for generated screens.
     * @param fmt     Optional printf format for the value, given it as an `int`
     *                (e.g. "%d°C"); must outlive this object. nullptr means "%d".
     *                The result is truncated to U8G2GL_BOUND_TEXT_BUFFER_SIZE - 1
     *                bytes.
     * @return false if @p subject is null, or the binding pool or the subject's
     *         observer capacity is exhausted; no binding is registered.
     */
    bool bind_text(u8g2gl_subject_int_base* subject, const char* fmt = nullptr);

    /**
     * @brief Bind this object's text to a string subject.
     *
     * As the int overload, unformatted: a text-drawing widget draws the
     * subject's own buffer, so nothing is copied. An active binding wins over a
     * literal text whichever was set first.
     *
     * @param subject Subject to observe. Must outlive this object.
     * @return false if @p subject is null, or the binding pool or the subject's
     *         observer capacity is exhausted; no binding is registered.
     */
    bool bind_text(u8g2gl_subject_string_base* subject);

    /**
     * @brief Bind the left edge to an int subject, relative to a container
     *        ([D-20] and its 2026-09-19 amendment, §7.2).
     *
     * A bound coordinate means what a literal one means: a position inside the
     * element's container. The runtime stores absolute coordinates, so the
     * container's absolute origin — fixed at build time, and emitted by the
     * generator as a literal — is passed here and added to every value: a child
     * of a container at x=40 bound to 5 is at x=45. A screen-level element
     * passes 0.
     *
     * Each change calls set_x(origin + value), so the frame is marked dirty only
     * when the position actually changes — a moved element on an otherwise
     * static screen is redrawn (§11.2). The current value is applied
     * immediately. This is the whole of runtime layout: nothing re-resolves
     * anchors, and a container whose own position is bound may have no children
     * in schema 0.4 (§7.2). **The sum is clamped to int16_t, not each term**, so
     * a large origin plus a large value pins the element at the edge of the
     * coordinate space instead of wrapping.
     *
     * @param subject Subject to observe. Must outlive this object.
     * @param origin  The container's absolute left edge; 0 at screen level.
     * @return false if @p subject is null, or the binding pool or the subject's
     *         observer capacity is exhausted; no binding is registered.
     */
    bool bind_x(u8g2gl_subject_int_base* subject, int16_t origin);

    /** @brief Bind the top edge, relative to a container's top @p origin; see bind_x(). */
    bool bind_y(u8g2gl_subject_int_base* subject, int16_t origin);

    /**
     * @brief Bind the width to an int subject ([D-20]).
     *
     * A size is a length, not a position, so it takes no origin. Each change
     * calls set_w(); values outside the int16_t range are clamped to it.
     */
    bool bind_width(u8g2gl_subject_int_base* subject);

    /** @brief Bind the height to an int subject; see bind_width(). */
    bool bind_height(u8g2gl_subject_int_base* subject);

    /**
     * @brief Conditionally set or clear a flag based on a subject's value.
     *
     * Evaluated once immediately, so the flag is correct before the first frame.
     *
     * @param subject   Subject to observe. Must outlive this object.
     * @param ref_value Value to compare against.
     * @param flag      Flag to set/clear (e.g., U8G2GL_FLAG_HIDDEN).
     * @return false if @p subject is null, or the binding pool or the subject's
     *         observer capacity is exhausted; no binding is registered.
     */
    bool bind_flag_if_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);
    bool bind_flag_if_not_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);
    bool bind_flag_if_gt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);
    bool bind_flag_if_lt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag);

    /**
     * @brief The same comparisons on a bool subject, against a bool.
     *
     * One overload per subject type, so a call resolves on every target. A
     * second, int32_t overload made `bind_flag_if_eq(&b, 0, flag)` ambiguous
     * wherever int32_t is not int — on xtensa (ESP32) it is long, and a
     * literal 0 converts to long and to bool at the same rank. An integer
     * argument now converts to bool: 0 is false, any other value true.
     */
    bool bind_flag_if_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag);
    bool bind_flag_if_not_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag);

    void* get_bound_text_subject() const;
    const char* get_bound_text_fmt() const;
    u8g2gl_subject_type_t get_bound_text_type() const;

    // --- Style (§10, §13.7) ---

    /**
     * @brief Layer a named style's explicitly-set properties over this object's
     *        resolved style.
     *
     * Changes everything the style sets at once, so — like the setters below —
     * this marks the frame dirty whenever the resulting resolved style actually
     * differs from what it was before the merge. Re-applying an identical style
     * (a generated screen re-running init(), or a rebind to an unchanged named
     * style) is therefore not a repaint.
     *
     * @param style Style to merge in; only its explicitly-set properties apply.
     */
    void apply_style(const u8g2gl_style& style);
    const u8g2gl_style& get_resolved_style() const;

    // Individual style setters that generated code calls as inline overrides.
    // Each delegates to the embedded u8g2gl_style and marks the frame dirty,
    // guarded on the value actually changing — the same change-guard pattern
    // WO1 established for geometry and flags (§11.2). This was a live defect,
    // not a latent one: before PR-3R WO2 these called the style setter and
    // returned, so changing a font, colour, padding or alignment at runtime
    // produced no repaint on a static screen (surfaced by the Chief Architect
    // after WO1 — see PROJECT.md).
    void set_font(const uint8_t* font);
    void set_draw_color(u8g2gl_color_t c);
    void set_invert(bool v);
    void set_padding(int16_t p);
    void set_border(bool b);
    void set_radius(int16_t r);
    void set_align(u8g2gl_align_t a);
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
     * An implementation repaints through `u8g2gl_repaint_object(display, *this)`
     * (u8g2gl_core.h). That call clips to the object's own bounds, clears them
     * (the buffer was not cleared on this path), calls render(), and runs inside
     * the same state guard as u8g2gl_render_object() (§11.3, [D-5]), so the
     * caller's U8G2 state survives. Do not hand-roll the clear: it would skip the
     * clip and the guard. The implementation then pushes the same bounds with
     * u8g2gl_partial_refresh() rather than computing tile coordinates itself.
     *
     * @see u8g2gl_repaint_object
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

    // --- Value bindings for subclasses (§8.4, PR-04 WO2) ---

    /**
     * @brief Register a value binding in the shared binding pool.
     *
     * The common implementation behind a widget's own bind_* method (for example
     * u8g2gl_clock::bind_time()). The widget supplies the observer callback,
     * which receives an opaque binding handle; binding_object() and
     * binding_subject() turn that handle back into the widget and the subject.
     * On success @p cb is invoked once immediately, so the widget shows the
     * subject's current value on its first frame rather than after the first
     * change.
     *
     * The handle, not the widget, is what the subject holds: the destructor
     * deactivates the pool slot, so a subject notifying after the widget is
     * destroyed reaches an inactive slot instead of freed memory.
     *
     * @param subject Subject to observe, type-erased. Must outlive this object.
     * @param type    Which subject type @p subject actually points to.
     * @param cb      Observer callback; called with the binding handle.
     * @return false if @p subject or @p cb is null, or the binding pool or the
     *         subject's observer capacity is exhausted. Nothing is consumed then.
     */
    bool add_value_binding(void* subject, u8g2gl_subject_type_t type, u8g2gl_observer_cb cb);

    /**
     * @brief The object a binding handle belongs to.
     * @param binding Handle passed to a value-binding observer callback.
     * @return The bound object, or nullptr if the binding is no longer active.
     */
    static u8g2gl_obj* binding_object(void* binding);

    /**
     * @brief The subject a binding handle observes, type-erased.
     * @param binding Handle passed to a value-binding observer callback.
     * @return The subject, or nullptr if the binding is no longer active.
     */
    static void* binding_subject(void* binding);

    // --- Text binding, for text-drawing widgets (§8.4) ---

    /**
     * @brief The text an active text binding shows now, or nullptr when this
     *        object has no text binding.
     *
     * Read at render time — the promise bind_text() makes — so nothing is
     * stored per object: a string subject's own buffer is returned as it is,
     * and an int subject is formatted into @p buffer through its format ("%d"
     * when none was given), truncated to fit. A widget draws this in preference
     * to its literal text, which is what makes a binding win over a literal
     * whichever was set first.
     *
     * Costs one scan of the binding pool (U8G2GL_MAX_TOTAL_BINDINGS slots, which
     * the generator sizes to the document) and, for an int subject, one
     * snprintf().
     *
     * @param buffer   Scratch for an int subject's formatted value; normally a
     *                 U8G2GL_BOUND_TEXT_BUFFER_SIZE array on the caller's stack.
     * @param capacity Bytes at @p buffer.
     * @return The bound text, valid until the subject next changes or @p buffer
     *         goes out of scope; nullptr when no text binding is active.
     */
    const char* bound_text(char* buffer, size_t capacity) const;

    /**
     * @brief Called when a bound text subject changes, and when the binding is
     *        made.
     *
     * The default marks the frame dirty. A widget that caches anything derived
     * from its text — a label's measured width, which its dots and scroll modes
     * depend on — overrides it to invalidate that cache too, and must still mark
     * dirty.
     */
    virtual void on_text_binding_changed();

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

    // Observer callback behind both bind_text() overloads: calls the bound
    // object's on_text_binding_changed().
    static void on_text_bound(void* binding);

    // Observer callbacks behind bind_x/y/width/height(); each forwards the
    // subject's value to the matching per-axis setter, x and y after adding the
    // binding's container origin.
    static void on_x_bound(void* binding);
    static void on_y_bound(void* binding);
    static void on_width_bound(void* binding);
    static void on_height_bound(void* binding);
};

#endif // U8G2GL_OBJ_H
