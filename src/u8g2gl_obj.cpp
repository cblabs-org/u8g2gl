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

// --- Data Binding System (§8, §13.8) ---

struct u8g2gl_binding_desc {
    u8g2gl_obj* obj = nullptr;
    void* subject = nullptr;
    const char* fmt = nullptr;
    int32_t ref_value = 0;
    uint8_t flag = 0;
    u8g2gl_binding_op_t op = U8G2GL_BIND_OP_EQ;
    u8g2gl_subject_type_t subject_type = U8G2GL_SUBJECT_INT;
    bool is_text = false;
    bool active = false;
};

static u8g2gl_binding_desc s_binding_pool[U8G2GL_MAX_TOTAL_BINDINGS] = {};

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
    b->obj->mark_dirty();
}

static void u8g2gl_on_binding_flag_change(void* user_data) {
    auto* b = static_cast<u8g2gl_binding_desc*>(user_data);
    u8g2gl_evaluate_binding(b);
}

static void u8g2gl_on_text_binding_change(void* user_data) {
    auto* b = static_cast<u8g2gl_binding_desc*>(user_data);
    if (b && b->active && b->obj) {
        b->obj->mark_dirty();
    }
}

static u8g2gl_binding_desc* u8g2gl_allocate_binding(u8g2gl_obj* obj) {
    if (!obj) {
        return nullptr;
    }
    uint8_t count = 0;
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == obj) {
            count++;
        }
    }
    if (count >= U8G2GL_MAX_BINDINGS_PER_OBJ) {
        return nullptr;
    }
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

u8g2gl_obj::~u8g2gl_obj() {
    for (size_t i = 0; i < U8G2GL_MAX_TOTAL_BINDINGS; ++i) {
        if (s_binding_pool[i].active && s_binding_pool[i].obj == this) {
            s_binding_pool[i].active = false;
            s_binding_pool[i].obj = nullptr;
        }
    }
}

bool u8g2gl_obj::add_flag_binding(void* subject, u8g2gl_subject_type_t type, u8g2gl_binding_op_t op, int32_t ref_value, uint8_t flag) {
    if (!subject) {
        return false;
    }
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

    bool added = false;
    if (type == U8G2GL_SUBJECT_INT) {
        added = static_cast<u8g2gl_subject_int_base*>(subject)->add_observer(slot, u8g2gl_on_binding_flag_change);
    } else if (type == U8G2GL_SUBJECT_BOOL) {
        added = static_cast<u8g2gl_subject_bool_base*>(subject)->add_observer(slot, u8g2gl_on_binding_flag_change);
    }

    if (!added) {
        slot->active = false;
        slot->obj = nullptr;
        return false;
    }

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
