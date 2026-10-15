/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_obj.cpp
 *
 * Purpose: Implements the base object. Two thirds of this file is trivial
 *          accessor plumbing; the part worth reading is the data-binding system
 *          from "Data Binding System" onward, which is where objects and
 *          subjects are wired together and where the only non-obvious design
 *          decisions in the file live.
 *
 *          Binding is what makes the framework declarative: generated code says
 *          "this label shows that subject" once at init, and thereafter the
 *          subject notifies the object directly. Nothing polls.
 *
 * Description: Accessors for geometry, flags, parent index, dirty state and
 *              style; default no-op implementations of the virtual lifecycle;
 *              and the shared binding pool with its observer callbacks
 */
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_coord.h"
#include "u8g2gl/u8g2gl_core.h"

#include <cstdio>

// Geometry setters — set_coords() and the four per-axis setters below all
// guard mark_dirty() on the value actually changing. Without the guard, a
// caller that re-sets an unchanged coordinate every tick (an animation, or a
// binding observer re-notifying with the same value) would dirty the frame on
// every call and defeat §11.2's gate — the exact cost the gate exists to
// avoid. A real change is still marked immediately, so no repaint is lost.
// A change of width or height (never a pure move) also calls on_size_changed(),
// so a widget that caches a measurement against its size can discard it.

void u8g2gl_obj::on_size_changed() {}

void u8g2gl_obj::set_coords(int16_t x, int16_t y, int16_t w, int16_t h) {
    if (x == x_ && y == y_ && w == w_ && h == h_) {
        return;
    }
    const bool size_changed = (w != w_) || (h != h_);
    x_ = x;
    y_ = y;
    w_ = w;
    h_ = h;
    if (size_changed) {
        on_size_changed();
    }
    mark_dirty();
}

void u8g2gl_obj::set_x(int16_t x) {
    if (x == x_) {
        return;
    }
    x_ = x;
    mark_dirty();
}

void u8g2gl_obj::set_y(int16_t y) {
    if (y == y_) {
        return;
    }
    y_ = y;
    mark_dirty();
}

void u8g2gl_obj::set_w(int16_t w) {
    if (w == w_) {
        return;
    }
    w_ = w;
    on_size_changed();
    mark_dirty();
}

void u8g2gl_obj::set_h(int16_t h) {
    if (h == h_) {
        return;
    }
    h_ = h;
    on_size_changed();
    mark_dirty();
}

int16_t u8g2gl_obj::get_x() const {
    return x_;
}

int16_t u8g2gl_obj::get_y() const {
    return y_;
}

int16_t u8g2gl_obj::get_w() const {
    return w_;
}

int16_t u8g2gl_obj::get_h() const {
    return h_;
}

void u8g2gl_obj::set_flag(uint8_t flag) {
    flags_ |= flag;
}

void u8g2gl_obj::clear_flag(uint8_t flag) {
    flags_ &= static_cast<uint8_t>(~flag);
}

bool u8g2gl_obj::has_flag(uint8_t flag) const {
    return (flags_ & flag) != 0;
}

// u8g2gl_obj::set_hidden
// Live defect fix (PR-3R WO1): this is public API reachable from imperative
// code (obj->set_hidden(true)), not only from the flag-binding path, where
// u8g2gl_evaluate_binding() already calls mark_dirty() on every evaluation.
// Without the guard below, hiding or showing a static object left the frame
// dirty flag untouched, so §11.2's gate skipped sendBuffer() and the display
// never updated.
//   h — same value as is_hidden() would already report is a no-op: nothing
//       visible changed, so no frame is scheduled
void u8g2gl_obj::set_hidden(bool h) {
    if (h == is_hidden()) {
        return;
    }
    if (h) {
        set_flag(U8G2GL_FLAG_HIDDEN);
    } else {
        clear_flag(U8G2GL_FLAG_HIDDEN);
    }
    mark_dirty();
}

bool u8g2gl_obj::is_hidden() const {
    return has_flag(U8G2GL_FLAG_HIDDEN);
}

// u8g2gl_obj::set_disabled
// Same live-defect fix and reasoning as set_hidden() above.
void u8g2gl_obj::set_disabled(bool d) {
    if (d == is_disabled()) {
        return;
    }
    if (d) {
        set_flag(U8G2GL_FLAG_DISABLED);
    } else {
        clear_flag(U8G2GL_FLAG_DISABLED);
    }
    mark_dirty();
}

bool u8g2gl_obj::is_disabled() const {
    return has_flag(U8G2GL_FLAG_DISABLED);
}

void u8g2gl_obj::set_parent_index(uint8_t idx) {
    if (idx == parent_index_) {
        return;
    }
    parent_index_ = idx;
    mark_dirty();
}

uint8_t u8g2gl_obj::get_parent_index() const {
    return parent_index_;
}

void u8g2gl_obj::mark_dirty() {
    flags_ |= U8G2GL_FLAG_DIRTY;
    u8g2gl_mark_dirty();   // gate the frame
}

bool u8g2gl_obj::is_dirty() const {
    return has_flag(U8G2GL_FLAG_DIRTY);
}

void u8g2gl_obj::clear_dirty() {
    clear_flag(U8G2GL_FLAG_DIRTY);
}

uint32_t u8g2gl_obj::tick(uint32_t /*now_ms*/) {
    return U8G2GL_IDLE;
}

void u8g2gl_obj::render(U8G2& /*display*/) {
    // Default: no-op
}

void u8g2gl_obj::render_animation_update(U8G2& /*display*/, uint32_t /*now_ms*/) {
    // Default: no-op
}

// --- Style (§10, §13.7) ---

// u8g2gl_style_fields_equal
// Field-by-field equality over the properties that actually affect rendering,
// used only by apply_style()'s change guard below. Not memcmp: u8g2gl_style is
// laid out for packing (WO6 Finding C), which leaves compiler-inserted padding
// bytes between members whose contents are unspecified, so comparing the raw
// bytes of two independently-constructed instances is not reliable even when
// every named field matches.
//   a, b — styles to compare
static bool u8g2gl_style_fields_equal(const u8g2gl_style& a, const u8g2gl_style& b) {
    return a.font == b.font &&
           a.padding == b.padding &&
           a.radius == b.radius &&
           a.set_mask == b.set_mask &&
           a.draw_color == b.draw_color &&
           a.align == b.align &&
           a.font_mode == b.font_mode &&
           a.bitmap_mode == b.bitmap_mode &&
           a.invert == b.invert &&
           a.border == b.border;
}

// u8g2gl_obj::apply_style
// Merges a named style's explicitly-set properties over the resolved style,
// guarded on the merge actually changing anything — same change-guard pattern
// as the geometry and flag mutators (WO1) and the setters below (WO2). Without
// the guard, generated code re-running init() or rebinding to an unchanged
// named style would dirty the frame every time.
//   style — style to merge in; only its explicitly-set properties apply
void u8g2gl_obj::apply_style(const u8g2gl_style& style) {
    u8g2gl_style before = style_;
    style_.merge_from(style);
    if (!u8g2gl_style_fields_equal(before, style_)) {
        mark_dirty();
    }
}

const u8g2gl_style& u8g2gl_obj::get_resolved_style() const {
    return style_;
}

// The style setters below delegate to the embedded u8g2gl_style, each guarded
// on the call actually changing something before marking the frame dirty —
// the same change-guard pattern WO1 established for geometry and flags.
// Without the guard, a setter re-applied every tick (an animation, or a
// binding observer re-notifying with an unchanged value) would dirty the
// frame on every call and defeat §11.2's gate; a real change is still marked
// immediately, so no repaint is lost.
//
// The guard checks style_.has(PROP) as well as the value: a property's value
// can equal the struct's default (e.g. align defaulting to LEFT) without ever
// having been explicitly set, and u8g2gl_button and the label's scroll render
// path both branch on has(U8G2GL_STYLE_ALIGN) to tell "explicitly LEFT" apart
// from "never specified" (Button.RenderAlignmentOverride caught a
// value-only guard skipping the mask update entirely). Comparing the value
// alone would therefore have been a second, self-inflicted correctness bug
// while fixing the first one.
//
// This was a live defect, not a latent one: before PR-3R WO2 these called the
// style setter and returned, so changing a font, colour, padding or alignment
// at runtime produced no repaint on a static screen (surfaced by the Chief
// Architect after WO1 — see PROJECT.md).
void u8g2gl_obj::set_font(const uint8_t* font) {
    if (style_.has(U8G2GL_STYLE_FONT) && font == style_.font) {
        return;
    }
    style_.set_font(font);
    mark_dirty();
}

void u8g2gl_obj::set_draw_color(u8g2gl_color_t c) {
    if (style_.has(U8G2GL_STYLE_DRAW_COLOR) && c == style_.draw_color) {
        return;
    }
    style_.set_draw_color(c);
    mark_dirty();
}

void u8g2gl_obj::set_invert(bool v) {
    if (style_.has(U8G2GL_STYLE_INVERT) && v == style_.invert) {
        return;
    }
    style_.set_invert(v);
    mark_dirty();
}

void u8g2gl_obj::set_padding(int16_t p) {
    if (style_.has(U8G2GL_STYLE_PADDING) && p == style_.padding) {
        return;
    }
    style_.set_padding(p);
    mark_dirty();
}

void u8g2gl_obj::set_border(bool b) {
    if (style_.has(U8G2GL_STYLE_BORDER) && b == style_.border) {
        return;
    }
    style_.set_border(b);
    mark_dirty();
}

void u8g2gl_obj::set_radius(int16_t r) {
    if (style_.has(U8G2GL_STYLE_RADIUS) && r == style_.radius) {
        return;
    }
    style_.set_radius(r);
    mark_dirty();
}

void u8g2gl_obj::set_align(u8g2gl_align_t a) {
    if (style_.has(U8G2GL_STYLE_ALIGN) && a == style_.align) {
        return;
    }
    style_.set_align(a);
    mark_dirty();
}

void u8g2gl_obj::set_font_mode(u8g2gl_font_mode_t m) {
    if (style_.has(U8G2GL_STYLE_FONT_MODE) && m == style_.font_mode) {
        return;
    }
    style_.set_font_mode(m);
    mark_dirty();
}

void u8g2gl_obj::set_bitmap_mode(u8g2gl_bitmap_mode_t m) {
    if (style_.has(U8G2GL_STYLE_BITMAP_MODE) && m == style_.bitmap_mode) {
        return;
    }
    style_.set_bitmap_mode(m);
    mark_dirty();
}

// ---------------------------------------------------------------------------
// Data Binding System (§8, §13.8)
//
// DESIGN NOTE — one shared pool, not per-object storage
// ----------------------------------------------------
// Bindings live in a single file-scope pool rather than in each object. The
// alternative — an array of binding slots inside u8g2gl_obj — would multiply
// worst-case capacity by every element on the screen, when in practice only a
// handful of objects are bound to anything. A shared pool sizes for the total,
// which is what the generator actually knows at build time (§13).
//
// The cost is type erasure: one pool must hold bindings to several subject
// types, so the subject is stored as void* alongside a u8g2gl_subject_type_t
// saying what it really is. That tag is how u8g2gl_evaluate_binding() casts
// back safely. This is deliberate and contained — the public bind_* overloads
// are fully typed, so a caller never sees the erasure and cannot get it wrong.
//
// No allocation happens here or anywhere else in the runtime ([D-1]): the pool
// is static, and exhaustion is reported by returning false rather than growing.
// ---------------------------------------------------------------------------

struct u8g2gl_binding_desc {
    u8g2gl_obj* obj = nullptr;
    void* subject = nullptr;
    const char* fmt = nullptr;
    // One slot field, one stated meaning per binding kind (Chief Architect,
    // 2026-09-19): a flag binding (bind_flag_if_*) compares the subject against
    // `ref_value`; a position binding (bind_x/bind_y) adds `coord_origin`, its
    // container's build-time absolute origin, to the subject's value ([D-20]
    // amendment). Text bindings and every other value binding use neither. A
    // union rather than a second field, because this struct is one pool slot and
    // a second field would cost RAM in every slot for a value only position
    // bindings carry; the union costs nothing.
    union {
        int32_t ref_value = 0;   ///< Flag bindings only
        int16_t coord_origin;    ///< bind_x / bind_y only; set before the first read
    };
    u8g2gl_observer_cb cb = nullptr;
    u8g2gl_subject_type_t subject_type = U8G2GL_SUBJECT_INT;
    u8g2gl_binding_op_t op = U8G2GL_BIND_OP_EQ;
    uint8_t flag = 0;
    bool is_text = false;
    bool active = false;
};

static u8g2gl_binding_desc s_binding_pool[U8G2GL_MAX_TOTAL_BINDINGS] = {};

// u8g2gl_evaluate_binding
// Applies one flag binding: reads the subject's current value, compares it, and
// sets or clears the object's flag accordingly. This is where the pool's type
// erasure is undone — subject_type says what the void* really is, and the cast
// back must match it.
//   b — the binding slot; inactive or detached slots are ignored
static void u8g2gl_evaluate_binding(u8g2gl_binding_desc* b) {
    if (!b || !b->active || !b->obj) {
        return;
    }
    bool condition_met = false;
    if (b->subject_type == U8G2GL_SUBJECT_INT) {
        auto* s = static_cast<u8g2gl_subject_int_base*>(b->subject);
        int32_t val = s->get();
        switch (b->op) {
            case U8G2GL_BIND_OP_EQ: condition_met = (val == b->ref_value); break;
            case U8G2GL_BIND_OP_NOT_EQ: condition_met = (val != b->ref_value); break;
            case U8G2GL_BIND_OP_GT: condition_met = (val > b->ref_value); break;
            case U8G2GL_BIND_OP_LT: condition_met = (val < b->ref_value); break;
        }
    } else if (b->subject_type == U8G2GL_SUBJECT_BOOL) {
        auto* s = static_cast<u8g2gl_subject_bool_base*>(b->subject);
        int32_t val = s->get() ? 1 : 0;
        switch (b->op) {
            case U8G2GL_BIND_OP_EQ: condition_met = (val == b->ref_value); break;
            case U8G2GL_BIND_OP_NOT_EQ: condition_met = (val != b->ref_value); break;
            case U8G2GL_BIND_OP_GT: condition_met = (val > b->ref_value); break;
            case U8G2GL_BIND_OP_LT: condition_met = (val < b->ref_value); break;
        }
    }

    if (condition_met) {
        b->obj->set_flag(b->flag);
    } else {
        b->obj->clear_flag(b->flag);
    }

    // Marks dirty whenever the subject changed, even if the flag's value did
    // not — a subject going 5 -> 6 under an "if greater than 3" binding leaves
    // the flag set but still schedules a frame. Comparing the previous flag
    // state would avoid that redraw; it is not done because the check costs a
    // branch on every notification to save a redraw that only occurs when a
    // bound value is changing anyway, and a changing value usually means
    // something else on screen needs repainting too.
    b->obj->mark_dirty();
}

// u8g2gl_on_binding_flag_change
// Observer callback for flag bindings. Subjects deliver a void* context rather
// than a std::function, so the binding slot itself is passed as the context and
// recovered here.
//   user_data — the u8g2gl_binding_desc registered with the subject
static void u8g2gl_on_binding_flag_change(void* user_data) {
    auto* b = static_cast<u8g2gl_binding_desc*>(user_data);
    u8g2gl_evaluate_binding(b);
}

// u8g2gl_obj::on_text_bound
// Observer callback for text bindings. Unlike a flag binding there is nothing to
// evaluate: the widget reads the subject through bound_text() when it renders.
// What a change does need is the object's hook, not a bare mark_dirty(): a
// label caches its text's measured width, and a hook that only scheduled a
// frame would draw the new text against the old width (PR-04 WO10b).
//   binding — the u8g2gl_binding_desc registered with the subject
void u8g2gl_obj::on_text_bound(void* binding) {
    auto* b = static_cast<u8g2gl_binding_desc*>(binding);
    if (b && b->active && b->obj) {
        b->obj->on_text_binding_changed();
    }
}

// u8g2gl_find_text_binding
// The object's active text binding, or nullptr. An object has at most one: both
// bind_text() overloads reuse an existing text slot rather than claim a second.
//   obj — the object whose text binding is wanted
static u8g2gl_binding_desc* u8g2gl_find_text_binding(const u8g2gl_obj* obj) {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == obj && s_binding_pool[i].is_text) {
            return &s_binding_pool[i];
        }
    }
    return nullptr;
}

// u8g2gl_allocate_binding
// Claims a free slot in the shared pool for an object, subject to a per-object
// cap. Returns nullptr rather than growing when either limit is reached — the
// runtime never allocates ([D-1]), so exhaustion is a reportable outcome, not an
// error to recover from.
//   obj — the object the binding belongs to
static u8g2gl_binding_desc* u8g2gl_allocate_binding(u8g2gl_obj* obj) {
    if (!obj) {
        return nullptr;
    }

    // --- Step 1: Enforce the per-object cap ---
    // The pool is shared, so without this one object could consume every slot
    // and starve the rest of the screen. Capping per object turns exhaustion
    // into a local, diagnosable failure instead of an unrelated widget silently
    // losing its binding.
    uint8_t count = 0;
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == obj) {
            count++;
        }
    }
    if (count >= U8G2GL_MAX_BINDINGS_PER_OBJ) {
        return nullptr;
    }

    // --- Step 2: Take the first free slot ---
    // Both passes scan the whole pool, so binding is O(pool) per call. That is
    // acceptable because binding happens once per object during init, never in
    // the render path.
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (!s_binding_pool[i].active) {
            s_binding_pool[i] = u8g2gl_binding_desc{};
            s_binding_pool[i].obj = obj;
            s_binding_pool[i].active = true;
            return &s_binding_pool[i];
        }
    }
    return nullptr;
}

// u8g2gl_remove_binding_observer
// Unregisters a binding slot's observer from its subject, casting back via
// subject_type. Idempotent: clears the subject's observer slot without altering
// the binding pool slot itself.
//   slot — the binding slot to detach from its subject
static void u8g2gl_remove_binding_observer(u8g2gl_binding_desc* slot) {
    if (!slot || !slot->subject || !slot->cb) {
        return;
    }
    switch (slot->subject_type) {
        case U8G2GL_SUBJECT_INT:
            static_cast<u8g2gl_subject_int_base*>(slot->subject)->remove_observer(slot, slot->cb);
            break;
        case U8G2GL_SUBJECT_STRING:
            static_cast<u8g2gl_subject_string_base*>(slot->subject)->remove_observer(slot, slot->cb);
            break;
        case U8G2GL_SUBJECT_BOOL:
            static_cast<u8g2gl_subject_bool_base*>(slot->subject)->remove_observer(slot, slot->cb);
            break;
        case U8G2GL_SUBJECT_TIME:
            static_cast<u8g2gl_subject_time_base*>(slot->subject)->remove_observer(slot, slot->cb);
            break;
    }
}

// u8g2gl_obj::~u8g2gl_obj
// Releases every pool slot belonging to this object and removes all observer
// registrations from the bound subjects.
//
// This is the counterpart to u8g2gl_allocate_binding and it is not optional:
// slots hold a raw u8g2gl_obj*, so a destroyed object leaving its observers
// registered would leave the subject firing into freed memory or dangling slots.
// For each active slot belonging to this object, remove the observer from the
// subject first, then deactivate the pool slot.
u8g2gl_obj::~u8g2gl_obj() {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this) {
            u8g2gl_remove_binding_observer(&s_binding_pool[i]);
            s_binding_pool[i].active = false;
            s_binding_pool[i].obj = nullptr;
            s_binding_pool[i].subject = nullptr;
            s_binding_pool[i].cb = nullptr;
        }
    }
}

// u8g2gl_obj::add_flag_binding
// Common implementation behind every bind_flag_if_* overload: claims a pool
// slot, registers as an observer on the subject, and evaluates once so the
// flag is correct before the first frame rather than after the first change.
//   subject   — the subject, type-erased; `type` says what it really is
//   type      — which subject type `subject` points to, for the cast back
//   op        — comparison applied against ref_value
//   ref_value — value compared against the subject's current value
//   flag      — flag set when the comparison holds, cleared when it does not
bool u8g2gl_obj::add_flag_binding(void* subject, u8g2gl_subject_type_t type, u8g2gl_binding_op_t op, int32_t ref_value, uint8_t flag) {
    if (!subject) {
        return false;
    }

    // --- Step 1: Claim a slot in the shared pool ---
    u8g2gl_binding_desc* slot = u8g2gl_allocate_binding(this);
    if (!slot) {
        return false;
    }

    slot->obj = this;
    slot->subject = subject;
    slot->subject_type = type;
    slot->op = op;
    slot->ref_value = ref_value;
    slot->flag = flag;
    slot->cb = u8g2gl_on_binding_flag_change;
    slot->is_text = false;
    slot->active = true;

    // --- Step 2: Register with the subject, casting back via the type tag ---
    bool added = false;
    if (type == U8G2GL_SUBJECT_INT) {
        added = static_cast<u8g2gl_subject_int_base*>(subject)->add_observer(slot, u8g2gl_on_binding_flag_change);
    } else if (type == U8G2GL_SUBJECT_BOOL) {
        added = static_cast<u8g2gl_subject_bool_base*>(subject)->add_observer(slot, u8g2gl_on_binding_flag_change);
    }

    // --- Step 3: Roll the slot back if the subject had no observer capacity ---
    // Both allocations must succeed together. Leaving a claimed-but-unobserved
    // slot behind would leak pool capacity permanently — the slot would never
    // fire and never be reclaimed — and the caller would have no way to tell.
    if (!added) {
        slot->active = false;
        slot->obj = nullptr;
        slot->subject = nullptr;
        slot->cb = nullptr;
        return false;
    }

    // --- Step 4: Evaluate immediately ---
    // Without this the flag stays at its default until the subject next
    // changes, so a screen bound to an already-correct value would render wrong
    // on its first frame and silently fix itself later.
    u8g2gl_evaluate_binding(slot);
    return true;
}

// The public bind_flag_if_* overloads below are type-safe entry points onto
// add_flag_binding(). They return its result rather than discarding it: before
// PR-04 WO2 they returned void, so a binding lost to an exhausted pool or
// subject was undetectable by the caller — including by tests, which had to
// infer success from a flag's value.
bool u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    return add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_EQ, ref_value, flag);
}

bool u8g2gl_obj::bind_flag_if_not_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    return add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_NOT_EQ, ref_value, flag);
}

bool u8g2gl_obj::bind_flag_if_gt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    return add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_GT, ref_value, flag);
}

bool u8g2gl_obj::bind_flag_if_lt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    return add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_LT, ref_value, flag);
}

// A bool subject's binding stores its reference as 0 or 1, the value its
// get() compares equal to (u8g2gl_evaluate_binding()).
bool u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag) {
    return add_flag_binding(subject, U8G2GL_SUBJECT_BOOL, U8G2GL_BIND_OP_EQ, ref_value ? 1 : 0, flag);
}

bool u8g2gl_obj::bind_flag_if_not_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag) {
    return add_flag_binding(subject, U8G2GL_SUBJECT_BOOL, U8G2GL_BIND_OP_NOT_EQ, ref_value ? 1 : 0, flag);
}

// u8g2gl_obj::bind_text (int subject)
// Binds display text to an integer subject, optionally formatted. Stores the
// subject in the pool rather than evaluating anything: the widget reads and
// formats the value at render time (bound_text()), so this only has to arrange
// for on_text_binding_changed() to run when the value changes — and once now,
// so a widget that measured a literal text re-measures the bound one.
//   subject — subject to observe; must outlive this object
//   fmt     — printf format applied at render time, or nullptr for "%d"
bool u8g2gl_obj::bind_text(u8g2gl_subject_int_base* subject, const char* fmt) {
    if (!subject) {
        return false;
    }
    u8g2gl_binding_desc* slot = u8g2gl_find_text_binding(this);
    if (slot) {
        u8g2gl_remove_binding_observer(slot);
    } else {
        slot = u8g2gl_allocate_binding(this);
    }
    if (!slot) {
        return false;
    }

    slot->obj = this;
    slot->subject = subject;
    slot->fmt = fmt;
    slot->cb = &u8g2gl_obj::on_text_bound;
    slot->subject_type = U8G2GL_SUBJECT_INT;
    slot->is_text = true;
    slot->active = true;

    if (!subject->add_observer(slot, &u8g2gl_obj::on_text_bound)) {
        slot->active = false;
        slot->obj = nullptr;
        slot->subject = nullptr;
        slot->cb = nullptr;
        return false;
    }
    on_text_binding_changed();
    return true;
}

// u8g2gl_obj::bind_text (string subject)
// As the int overload, without formatting. The two are mutually exclusive per
// object — binding one replaces the other, because an object has a single text
// source.
//   subject — subject to observe; must outlive this object
bool u8g2gl_obj::bind_text(u8g2gl_subject_string_base* subject) {
    if (!subject) {
        return false;
    }
    u8g2gl_binding_desc* slot = u8g2gl_find_text_binding(this);
    if (slot) {
        u8g2gl_remove_binding_observer(slot);
    } else {
        slot = u8g2gl_allocate_binding(this);
    }
    if (!slot) {
        return false;
    }

    slot->obj = this;
    slot->subject = subject;
    slot->fmt = nullptr;
    slot->cb = &u8g2gl_obj::on_text_bound;
    slot->subject_type = U8G2GL_SUBJECT_STRING;
    slot->is_text = true;
    slot->active = true;

    if (!subject->add_observer(slot, &u8g2gl_obj::on_text_bound)) {
        slot->active = false;
        slot->obj = nullptr;
        slot->subject = nullptr;
        slot->cb = nullptr;
        return false;
    }
    on_text_binding_changed();
    return true;
}

// u8g2gl_obj::bound_text
// The text an active text binding shows now: a string subject's own buffer, or
// an int subject formatted into the caller's buffer. nullptr when unbound, which
// is how a widget knows to fall back to its literal text.
//   buffer, capacity — scratch for an int subject's formatted value
const char* u8g2gl_obj::bound_text(char* buffer, size_t capacity) const {
    const u8g2gl_binding_desc* b = u8g2gl_find_text_binding(this);
    if (b == nullptr || b->subject == nullptr) {
        return nullptr;
    }
    if (b->subject_type == U8G2GL_SUBJECT_STRING) {
        return static_cast<const u8g2gl_subject_string_base*>(b->subject)->get();
    }
    if (buffer == nullptr || capacity == 0) {
        return "";
    }
    // The value is passed as int because a format is written for one — "%d°C"
    // (§8.4) — and passing an int32_t where "%d" expects int is undefined on a
    // toolchain whose int32_t is long. Every target this runtime supports has a
    // 32-bit int (cpp.md §7), so nothing is lost. snprintf() truncates to
    // `capacity` and always terminates.
    const int value = static_cast<int>(static_cast<const u8g2gl_subject_int_base*>(b->subject)->get());
    std::snprintf(buffer, capacity, b->fmt != nullptr ? b->fmt : "%d", value);
    return buffer;
}

// u8g2gl_obj::on_text_binding_changed
// Default hook: the object draws its text afresh every frame, so scheduling one
// is all a change needs. See the header for when to override.
void u8g2gl_obj::on_text_binding_changed() {
    mark_dirty();
}

// u8g2gl_register_value_binding
// Steps 1-3 of add_value_binding(), apart so a position binding can store its
// origin in the slot before the first callback reads it. Returns the slot, or
// nullptr having consumed nothing.
//   obj, subject, type, cb — as add_value_binding()
static u8g2gl_binding_desc* u8g2gl_register_value_binding(u8g2gl_obj* obj, void* subject,
                                                          u8g2gl_subject_type_t type, u8g2gl_observer_cb cb) {
    if (!subject || !cb) {
        return nullptr;
    }

    // --- Step 1: Claim a slot in the shared pool ---
    u8g2gl_binding_desc* slot = u8g2gl_allocate_binding(obj);
    if (!slot) {
        return nullptr;
    }
    slot->subject = subject;
    slot->subject_type = type;
    slot->cb = cb;
    slot->is_text = false;

    // --- Step 2: Register with the subject, casting back via the type tag ---
    bool added = false;
    switch (type) {
        case U8G2GL_SUBJECT_INT:
            added = static_cast<u8g2gl_subject_int_base*>(subject)->add_observer(slot, cb);
            break;
        case U8G2GL_SUBJECT_STRING:
            added = static_cast<u8g2gl_subject_string_base*>(subject)->add_observer(slot, cb);
            break;
        case U8G2GL_SUBJECT_BOOL:
            added = static_cast<u8g2gl_subject_bool_base*>(subject)->add_observer(slot, cb);
            break;
        case U8G2GL_SUBJECT_TIME:
            added = static_cast<u8g2gl_subject_time_base*>(subject)->add_observer(slot, cb);
            break;
    }

    // --- Step 3: Roll the slot back if the subject had no observer capacity ---
    // Same reasoning as add_flag_binding(): a claimed-but-unobserved slot would
    // leak pool capacity permanently and break the one-slot-one-observer count.
    if (!added) {
        slot->active = false;
        slot->obj = nullptr;
        slot->subject = nullptr;
        slot->cb = nullptr;
        return nullptr;
    }
    return slot;
}

// u8g2gl_obj::add_value_binding
// Claims one pool slot and one observer slot for a widget's own value binding,
// rolling the pool slot back if the subject has no observer capacity, then runs
// the widget's callback once so the current value is shown from the first frame.
//   subject — the subject, type-erased; `type` says what it really is
//   type    — which subject type `subject` points to, for the add_observer cast
//   cb      — the widget's observer callback, called with the slot as its handle
bool u8g2gl_obj::add_value_binding(void* subject, u8g2gl_subject_type_t type, u8g2gl_observer_cb cb) {
    u8g2gl_binding_desc* slot = u8g2gl_register_value_binding(this, subject, type, cb);
    if (!slot) {
        return false;
    }

    // --- Step 4: Apply the current value immediately ---
    cb(slot);
    return true;
}

// u8g2gl_bind_position
// A position binding: one value binding whose slot also carries the container
// origin, stored before the first callback applies the current value.
//   obj     — the object being bound
//   subject — an int subject
//   origin  — the container's absolute origin along this axis
//   cb      — on_x_bound or on_y_bound
static bool u8g2gl_bind_position(u8g2gl_obj* obj, u8g2gl_subject_int_base* subject, int16_t origin,
                                 u8g2gl_observer_cb cb) {
    u8g2gl_binding_desc* slot = u8g2gl_register_value_binding(obj, subject, U8G2GL_SUBJECT_INT, cb);
    if (!slot) {
        return false;
    }
    slot->coord_origin = origin;
    cb(slot);
    return true;
}

// Geometry bindings ([D-20]). Each consumes exactly one pool slot and one
// observer — the invariant the generator counts capacities against ([D-21]).
// The callbacks route through the per-axis setters rather than writing
// x_/y_/w_/h_ directly, so the change guard and mark_dirty() stay in one place.
// Only the two positions carry an origin: a bound coordinate is
// container-relative like a literal one (§7.2), and a size is a length.
bool u8g2gl_obj::bind_x(u8g2gl_subject_int_base* subject, int16_t origin) {
    return u8g2gl_bind_position(this, subject, origin, &u8g2gl_obj::on_x_bound);
}

bool u8g2gl_obj::bind_y(u8g2gl_subject_int_base* subject, int16_t origin) {
    return u8g2gl_bind_position(this, subject, origin, &u8g2gl_obj::on_y_bound);
}

bool u8g2gl_obj::bind_width(u8g2gl_subject_int_base* subject) {
    return add_value_binding(subject, U8G2GL_SUBJECT_INT, &u8g2gl_obj::on_width_bound);
}

bool u8g2gl_obj::bind_height(u8g2gl_subject_int_base* subject) {
    return add_value_binding(subject, U8G2GL_SUBJECT_INT, &u8g2gl_obj::on_height_bound);
}

// u8g2gl_bound_coord
// Reads an int subject for a geometry axis and adds an origin, clamping the sum
// into int16_t with u8g2gl_coord_bound() (u8g2gl_coord.h, where the reasoning
// lives). The clamp is shared with generated draw calls, which spell each bound
// integer argument through the same helper, so an object and a draw call
// bound to one subject are placed identically (§13.5, [D-18], PR-4R WO4).
//   obj     — binding_object() of the handle; nullptr once the slot is inactive
//   subject — binding_subject() of the handle, an int subject by construction
//   origin  — added to the value; 0 for a size
//   out     — receives the clamped sum
// Returns obj, or nullptr if the binding is no longer active.
static u8g2gl_obj* u8g2gl_bound_coord(u8g2gl_obj* obj, void* subject, int16_t origin, int16_t& out) {
    if (!obj || !subject) {
        return nullptr;
    }
    out = u8g2gl_coord_bound(origin, static_cast<u8g2gl_subject_int_base*>(subject)->get());
    return obj;
}

// u8g2gl_position_origin
// A position binding's container origin, read only from an active slot:
// u8g2gl_bind_position() stored it before the first callback.
//   binding — the u8g2gl_binding_desc registered with the subject
static int16_t u8g2gl_position_origin(void* binding) {
    auto* b = static_cast<u8g2gl_binding_desc*>(binding);
    return (b && b->active) ? b->coord_origin : 0;
}

void u8g2gl_obj::on_x_bound(void* binding) {
    int16_t v = 0;
    if (u8g2gl_obj* obj = u8g2gl_bound_coord(binding_object(binding), binding_subject(binding),
                                             u8g2gl_position_origin(binding), v)) {
        obj->set_x(v);
    }
}

void u8g2gl_obj::on_y_bound(void* binding) {
    int16_t v = 0;
    if (u8g2gl_obj* obj = u8g2gl_bound_coord(binding_object(binding), binding_subject(binding),
                                             u8g2gl_position_origin(binding), v)) {
        obj->set_y(v);
    }
}

void u8g2gl_obj::on_width_bound(void* binding) {
    int16_t v = 0;
    if (u8g2gl_obj* obj = u8g2gl_bound_coord(binding_object(binding), binding_subject(binding), 0, v)) {
        obj->set_w(v);
    }
}

void u8g2gl_obj::on_height_bound(void* binding) {
    int16_t v = 0;
    if (u8g2gl_obj* obj = u8g2gl_bound_coord(binding_object(binding), binding_subject(binding), 0, v)) {
        obj->set_h(v);
    }
}

// u8g2gl_obj::binding_object / binding_subject
// Undo the handle's type erasure for a widget's observer callback. Both return
// nullptr for an inactive slot, which is how a notification arriving after the
// widget was destroyed (the destructor deactivates its slots) becomes a no-op.
//   binding — the u8g2gl_binding_desc registered with the subject
u8g2gl_obj* u8g2gl_obj::binding_object(void* binding) {
    auto* b = static_cast<u8g2gl_binding_desc*>(binding);
    return (b && b->active) ? b->obj : nullptr;
}

void* u8g2gl_obj::binding_subject(void* binding) {
    auto* b = static_cast<u8g2gl_binding_desc*>(binding);
    return (b && b->active) ? b->subject : nullptr;
}

void* u8g2gl_obj::get_bound_text_subject() const {
    const u8g2gl_binding_desc* b = u8g2gl_find_text_binding(this);
    return b != nullptr ? b->subject : nullptr;
}

const char* u8g2gl_obj::get_bound_text_fmt() const {
    const u8g2gl_binding_desc* b = u8g2gl_find_text_binding(this);
    return b != nullptr ? b->fmt : nullptr;
}

u8g2gl_subject_type_t u8g2gl_obj::get_bound_text_type() const {
    const u8g2gl_binding_desc* b = u8g2gl_find_text_binding(this);
    return b != nullptr ? b->subject_type : U8G2GL_SUBJECT_INT;
}
