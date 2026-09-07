#ifndef U8G2GL_OBJ_H
#define U8G2GL_OBJ_H

#include "u8g2gl_types.h"
#include "u8g2gl_tree.h"

// Forward declaration of U8G2
class U8G2;

class u8g2gl_obj {
public:
    u8g2gl_obj() = default;
    virtual ~u8g2gl_obj() = default;

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
    // mark_dirty() is intended to set a screen-level flag (WO5),
    // but for now, sets the per-object DIRTY flag as a placeholder.
    void mark_dirty();
    bool is_dirty() const;
    void clear_dirty();

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
};

#endif // U8G2GL_OBJ_H
