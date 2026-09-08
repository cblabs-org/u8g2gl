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
#include "u8g2gl/u8g2gl_core.h"

void u8g2gl_obj::set_coords(int16_t x, int16_t y, int16_t w, int16_t h) {
    x_ = x;
    y_ = y;
    w_ = w;
    h_ = h;
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

void u8g2gl_obj::set_hidden(bool h) {
    if (h) {
        set_flag(U8G2GL_FLAG_HIDDEN);
    } else {
        clear_flag(U8G2GL_FLAG_HIDDEN);
    }
}

bool u8g2gl_obj::is_hidden() const {
    return has_flag(U8G2GL_FLAG_HIDDEN);
}

void u8g2gl_obj::set_disabled(bool d) {
    if (d) {
        set_flag(U8G2GL_FLAG_DISABLED);
    } else {
        clear_flag(U8G2GL_FLAG_DISABLED);
    }
}

bool u8g2gl_obj::is_disabled() const {
    return has_flag(U8G2GL_FLAG_DISABLED);
}

void u8g2gl_obj::set_parent_index(uint8_t idx) {
    parent_index_ = idx;
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

void u8g2gl_obj::apply_style(const u8g2gl_style& style) {
    style_.merge_from(style);
}

const u8g2gl_style& u8g2gl_obj::get_resolved_style() const {
    return style_;
}

// The style setters below are one-line delegations to the embedded u8g2gl_style.
// They exist so generated code can emit an inline override without constructing
// a whole style object, and carry no logic of their own — their contracts are on
// the declarations in u8g2gl_obj.h.
void u8g2gl_obj::set_font(const uint8_t* font) {
    style_.set_font(font);
}

void u8g2gl_obj::set_draw_color(u8g2gl_color_t c) {
    style_.set_draw_color(c);
}

void u8g2gl_obj::set_invert(bool v) {
    style_.set_invert(v);
}

void u8g2gl_obj::set_padding(int16_t p) {
    style_.set_padding(p);
}

void u8g2gl_obj::set_border(bool b) {
    style_.set_border(b);
}

void u8g2gl_obj::set_radius(int16_t r) {
    style_.set_radius(r);
}

void u8g2gl_obj::set_align(u8g2gl_align_t a) {
    style_.set_align(a);
}

void u8g2gl_obj::set_truncate(bool t) {
    style_.set_truncate(t);
}

void u8g2gl_obj::set_font_mode(u8g2gl_font_mode_t m) {
    style_.set_font_mode(m);
}

void u8g2gl_obj::set_bitmap_mode(u8g2gl_bitmap_mode_t m) {
    style_.set_bitmap_mode(m);
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
    int32_t ref_value = 0;
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

// u8g2gl_on_text_binding_change
// Observer callback for text bindings. Unlike a flag binding there is nothing to
// evaluate: the widget reads the subject directly when it renders, so the only
// thing needed on change is to schedule a frame.
//   user_data — the u8g2gl_binding_desc registered with the subject
static void u8g2gl_on_text_binding_change(void* user_data) {
    auto* b = static_cast<u8g2gl_binding_desc*>(user_data);
    if (b && b->active && b->obj) {
        b->obj->mark_dirty();
    }
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

// u8g2gl_obj::~u8g2gl_obj
// Releases every pool slot belonging to this object.
//
// This is the counterpart to u8g2gl_allocate_binding and it is not optional:
// slots hold a raw u8g2gl_obj*, so a destroyed object leaving its slots active
// would leave the pool pointing at freed memory, and the next subject
// notification would evaluate a binding against it. Generated screens use static
// objects that outlive the program, so this rarely runs in production — but
// tests construct and destroy objects freely, which is exactly where a dangling
// slot would surface as an unrelated failure.
u8g2gl_obj::~u8g2gl_obj() {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this) {
            s_binding_pool[i].active = false;
            s_binding_pool[i].obj = nullptr;
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
        return false;
    }

    // --- Step 4: Evaluate immediately ---
    // Without this the flag stays at its default until the subject next
    // changes, so a screen bound to an already-correct value would render wrong
    // on its first frame and silently fix itself later.
    u8g2gl_evaluate_binding(slot);
    return true;
}

void u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_EQ, ref_value, flag);
}

void u8g2gl_obj::bind_flag_if_not_eq(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_NOT_EQ, ref_value, flag);
}

void u8g2gl_obj::bind_flag_if_gt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_GT, ref_value, flag);
}

void u8g2gl_obj::bind_flag_if_lt(u8g2gl_subject_int_base* subject, int32_t ref_value, uint8_t flag) {
    add_flag_binding(subject, U8G2GL_SUBJECT_INT, U8G2GL_BIND_OP_LT, ref_value, flag);
}

void u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base* subject, int32_t ref_value, uint8_t flag) {
    add_flag_binding(subject, U8G2GL_SUBJECT_BOOL, U8G2GL_BIND_OP_EQ, ref_value, flag);
}

void u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag) {
    bind_flag_if_eq(subject, ref_value ? 1 : 0, flag);
}

void u8g2gl_obj::bind_flag_if_not_eq(u8g2gl_subject_bool_base* subject, int32_t ref_value, uint8_t flag) {
    add_flag_binding(subject, U8G2GL_SUBJECT_BOOL, U8G2GL_BIND_OP_NOT_EQ, ref_value, flag);
}

void u8g2gl_obj::bind_flag_if_not_eq(u8g2gl_subject_bool_base* subject, bool ref_value, uint8_t flag) {
    bind_flag_if_not_eq(subject, ref_value ? 1 : 0, flag);
}

// u8g2gl_obj::bind_text (int subject)
// Binds display text to an integer subject, optionally formatted. Stores the
// subject on the object rather than evaluating anything: the widget reads and
// formats the value at render time, so this only has to arrange for a frame to
// be scheduled when the value changes.
//   subject — subject to observe; must outlive this object
//   fmt     — printf format applied at render time, or nullptr for the raw value
void u8g2gl_obj::bind_text(u8g2gl_subject_int_base* subject, const char* fmt) {
    if (!subject) {
        return;
    }
    u8g2gl_binding_desc* slot = nullptr;
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this && s_binding_pool[i].is_text) {
            slot = &s_binding_pool[i];
            break;
        }
    }
    if (!slot) {
        slot = u8g2gl_allocate_binding(this);
    }
    if (!slot) {
        return;
    }

    slot->obj = this;
    slot->subject = subject;
    slot->fmt = fmt;
    slot->subject_type = U8G2GL_SUBJECT_INT;
    slot->is_text = true;
    slot->active = true;

    if (!subject->add_observer(slot, u8g2gl_on_text_binding_change)) {
        slot->active = false;
        slot->obj = nullptr;
        return;
    }
    mark_dirty();
}

// u8g2gl_obj::bind_text (string subject)
// As the int overload, without formatting. The two are mutually exclusive per
// object — binding one replaces the other, because an object has a single text
// source.
//   subject — subject to observe; must outlive this object
void u8g2gl_obj::bind_text(u8g2gl_subject_string_base* subject) {
    if (!subject) {
        return;
    }
    u8g2gl_binding_desc* slot = nullptr;
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this && s_binding_pool[i].is_text) {
            slot = &s_binding_pool[i];
            break;
        }
    }
    if (!slot) {
        slot = u8g2gl_allocate_binding(this);
    }
    if (!slot) {
        return;
    }

    slot->obj = this;
    slot->subject = subject;
    slot->fmt = nullptr;
    slot->subject_type = U8G2GL_SUBJECT_STRING;
    slot->is_text = true;
    slot->active = true;

    if (!subject->add_observer(slot, u8g2gl_on_text_binding_change)) {
        slot->active = false;
        slot->obj = nullptr;
        return;
    }
    mark_dirty();
}

void* u8g2gl_obj::get_bound_text_subject() const {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this && s_binding_pool[i].is_text) {
            return s_binding_pool[i].subject;
        }
    }
    return nullptr;
}

const char* u8g2gl_obj::get_bound_text_fmt() const {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this && s_binding_pool[i].is_text) {
            return s_binding_pool[i].fmt;
        }
    }
    return nullptr;
}

u8g2gl_subject_type_t u8g2gl_obj::get_bound_text_type() const {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this && s_binding_pool[i].is_text) {
            return s_binding_pool[i].subject_type;
        }
    }
    return U8G2GL_SUBJECT_INT;
}
