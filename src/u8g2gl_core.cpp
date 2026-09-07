#include "u8g2gl/u8g2gl_core.h"

#if __has_include(<U8G2lib.h>)
#include <U8G2lib.h>
#elif __has_include(<U8g2lib.h>)
#include <U8g2lib.h>
#elif __has_include("U8G2lib.h")
#include "U8G2lib.h"
#elif __has_include("U8g2lib.h")
#include "U8g2lib.h"
#endif

static u8g2gl_tick_cb_t s_tick_cb = nullptr;
static u8g2gl_screen* s_active_screen = nullptr;

void u8g2gl_set_tick_cb(u8g2gl_tick_cb_t cb) {
    s_tick_cb = cb;
}

uint32_t u8g2gl_tick_now() {
    return s_tick_cb ? s_tick_cb() : 0;
}

void u8g2gl_set_active_screen(u8g2gl_screen* screen) {
    if (s_active_screen && s_active_screen->deactivate_fn) {
        s_active_screen->deactivate_fn();
    }
    s_active_screen = screen;
    if (screen) {
        screen->dirty = true;  // force first frame
        if (screen->activate_fn) {
            screen->activate_fn();
        }
    }
}

u8g2gl_screen* u8g2gl_get_active_screen() {
    return s_active_screen;
}

void u8g2gl_mark_dirty() {
    if (s_active_screen) {
        s_active_screen->dirty = true;
    }
}

uint32_t ui_handler(U8G2& display) {
    if (!s_active_screen) {
        return U8G2GL_IDLE;
    }

    uint32_t now = u8g2gl_tick_now();
    uint32_t next_deadline = U8G2GL_IDLE;

    // Phase 1: tick all widgets, collect deadlines
    if (s_active_screen->tick_fn) {
        next_deadline = s_active_screen->tick_fn(now);
    }

    // Phase 2: render if dirty
    if (s_active_screen->dirty) {
        display.clearBuffer();
        if (s_active_screen->render_fn) {
            s_active_screen->render_fn(display);
        }
        display.sendBuffer();
        s_active_screen->dirty = false;
    }

    // Phase 3: compute sleep time
    if (next_deadline == U8G2GL_IDLE) {
        return U8G2GL_IDLE;
    }
    uint32_t elapsed = u8g2gl_tick_now() - now;
    if (next_deadline <= elapsed) {
        return 0;
    }
    return next_deadline - elapsed;
}

uint32_t ui_handler_run_in_period(U8G2& display, uint32_t period_ms) {
    static uint32_t s_last_period_tick = 0;
    static bool s_period_initialized = false;

    uint32_t now = u8g2gl_tick_now();
    if (!s_period_initialized || (now - s_last_period_tick) >= period_ms) {
        s_period_initialized = true;
        s_last_period_tick = now;
        return ui_handler(display);
    }
    return 0;
}
