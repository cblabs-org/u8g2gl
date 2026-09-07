#ifndef U8G2GL_CORE_H
#define U8G2GL_CORE_H

#include "u8g2gl_types.h"
#include "u8g2gl_obj.h"
#include <cstdint>

// Forward declare
class U8G2;

// --- Tick time source ---
// Pull-only: the framework calls this to get the current time.
// The user registers their millis() function once at startup.
using u8g2gl_tick_cb_t = uint32_t(*)();
void u8g2gl_set_tick_cb(u8g2gl_tick_cb_t cb);
uint32_t u8g2gl_tick_now();   // calls the registered callback

// --- Screen structure ---
// Represents a complete screen: its widget array, parent table, and lifecycle.
// Generated code creates one of these per screen (§13.12).
struct u8g2gl_screen {
    u8g2gl_obj* const* objs;          // flat array of widget pointers
    const uint8_t* parents;            // parent index array (parallel to objs)
    uint8_t obj_count;                 // number of objects in the arrays

    // Screen lifecycle function pointers (set by generated code)
    void (*init_fn)();
    void (*activate_fn)();
    void (*deactivate_fn)();
    uint32_t (*tick_fn)(uint32_t now_ms);
    void (*render_fn)(U8G2& display);

    // Screen-level dirty flag (gates sendBuffer)
    bool dirty;
};

// --- Screen management ---
void u8g2gl_set_active_screen(u8g2gl_screen* screen);
u8g2gl_screen* u8g2gl_get_active_screen();

// --- Mark the active screen dirty ---
// Called by subjects on value change, by widgets on state change.
// This replaces the per-object mark_dirty() placeholder from WO2.
void u8g2gl_mark_dirty();

// --- The main handler ---
// Per [D-15] and §11.1:
// 1. Get current time via tick callback
// 2. Tick all widgets in the active screen, collecting deadlines
// 3. If dirty: render all visible widgets (with state saver + clip), sendBuffer
// 4. Return ms until next work needed (minimum deadline - now)
//
// The caller puts this in their loop:
//   uint32_t idle_ms = ui_handler(u8g2);
//   delay(idle_ms);  // or feed to RTOS sleep
uint32_t ui_handler(U8G2& display);

// --- Convenience: run-in-period wrapper ---
// Calls ui_handler and returns immediately if nothing to do,
// or returns the sleep duration. Useful for simple loops.
// §11 says this is optional sugar.
uint32_t ui_handler_run_in_period(U8G2& display, uint32_t period_ms);

#endif // U8G2GL_CORE_H
