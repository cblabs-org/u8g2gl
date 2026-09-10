/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_scrolling_label.h
 *
 * Purpose: Animated marquee text widget for strings exceeding widget width.
 *          Provides u8g2gl_scrolling_label, porting the robust marquee logic
 *          from legacy ScrollingTextWidget while adhering to U8G2GL's strict
 *          zero-allocation memory discipline ([D-1], [PD-3]). Holds only a
 *          const char* pointer to literal or subject storage. Dynamically
 *          evaluates whether scrolling is required based on font metrics,
 *          supporting configurable scroll speed, initial pause delay, and
 *          static text dwell timeouts before signaling completion.
 *
 * Description: Declarations for u8g2gl_scrolling_label, including text
 *              assignment, scroll configuration accessors, cycle queries,
 *              and full/partial render lifecycles.
 *
 * Exported Classes:
 * - u8g2gl_scrolling_label: Marquee scrolling text widget inheriting from u8g2gl_obj.
 *
 *     Content:
 *     - set_text():              Set pointer to text string (zero-copy)
 *     - get_text():              Retrieve current text pointer
 *
 *     Scroll configuration:
 *     - set_scroll_px_per_sec(): Set scroll speed in pixels per second
 *     - get_scroll_px_per_sec(): Query configured scroll speed
 *     - set_initial_delay_ms():  Set delay before scrolling starts
 *     - get_initial_delay_ms():  Query initial delay
 *     - set_static_dwell_ms():   Set dwell duration for non-scrolling text
 *     - get_static_dwell_ms():   Query static dwell duration
 *
 *     Query:
 *     - is_scroll_finished():    Whether a full scroll cycle or dwell has elapsed
 *     - reset_scroll():          Rewind scroll offset and reset timers
 *
 *     Lifecycle (overrides):
 *     - tick():                  Advance scroll offset; return next tick deadline
 *     - render():                Draw text with clipping or centered statically
 *     - render_animation_update(): Targeted partial refresh during blocked loop
 */
#ifndef U8G2GL_SCROLLING_LABEL_H
#define U8G2GL_SCROLLING_LABEL_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/**
 * @brief Animated marquee text display widget.
 *
 * Automatically scrolls text horizontally when its rendered width exceeds the
 * widget bounds. When text fits within the widget, it is drawn centered and
 * held for a configurable dwell period before signaling completion.
 *
 * Operates zero-copy via pointer reference without internal string buffers.
 */
class u8g2gl_scrolling_label : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a scrolling label with default timing parameters:
     * 25 px/sec scroll speed, 3000 ms initial delay, 5000 ms static dwell.
     */
    u8g2gl_scrolling_label() = default;

    // --- Content ---

    /**
     * @brief Set the text string to be displayed.
     *
     * Stores the pointer directly without copying or allocating memory.
     * If the pointer changes, invalidates layout metrics, resets scroll
     * completion state, and marks the widget dirty.
     *
     * @param text Pointer to null-terminated UTF-8 string, or nullptr to clear.
     */
    void set_text(const char* text);

    /**
     * @brief Retrieve the current text pointer.
     *
     * @return Pointer to null-terminated UTF-8 string, or nullptr if none set.
     */
    const char* get_text() const;

    // --- Scroll configuration ---

    /**
     * @brief Set scroll speed in pixels per second.
     *
     * @param px Speed in pixels per second (default: 25).
     */
    void set_scroll_px_per_sec(uint8_t px);

    /**
     * @brief Query configured scroll speed.
     *
     * @return Speed in pixels per second.
     */
    uint8_t get_scroll_px_per_sec() const;

    /**
     * @brief Set initial pause delay before scrolling animation begins.
     *
     * @param ms Delay in milliseconds (default: 3000).
     */
    void set_initial_delay_ms(uint16_t ms);

    /**
     * @brief Query initial pause delay.
     *
     * @return Initial delay in milliseconds.
     */
    uint16_t get_initial_delay_ms() const;

    /**
     * @brief Set dwell timeout for static (non-scrolling) text before completion.
     *
     * @param ms Dwell timeout in milliseconds past initial delay (default: 5000).
     */
    void set_static_dwell_ms(uint16_t ms);

    /**
     * @brief Query static dwell timeout.
     *
     * @return Dwell timeout in milliseconds.
     */
    uint16_t get_static_dwell_ms() const;

    // --- Query ---

    /**
     * @brief Query whether a complete scroll cycle or static dwell has completed.
     *
     * For scrolling text, becomes true once the text has fully exited off the
     * left edge. For static text, becomes true after the dwell timeout expires.
     *
     * @return true if scroll or dwell cycle finished, false otherwise.
     */
    bool is_scroll_finished() const;

    /**
     * @brief Rewind scroll offset to origin and restart timing delays.
     */
    void reset_scroll();

    // --- Lifecycle ---

    /**
     * @brief Advance scroll animation state and report next deadline.
     *
     * Evaluates initial delay, static dwell, and marquee pixel stepping.
     * Marks the widget dirty whenever scroll_x_ changes.
     *
     * @param now_ms Current timestamp in milliseconds.
     * @return Milliseconds until next tick deadline, or U8G2GL_IDLE.
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the scrolling label into the U8G2 display buffer.
     *
     * Computes text width on first render following layout invalidation.
     * If scrolling is needed, configures hardware clip window and draws
     * with current scroll offset. If text fits, renders centered.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

    /**
     * @brief Targeted redraw for marquee animation while the main loop is blocked.
     *
     * Advances tick state, clears own bounding box, re-renders, and pushes
     * updated pixels to the display via u8g2gl_partial_refresh().
     *
     * @param display U8G2 display context to draw into.
     * @param now_ms  Current timestamp in milliseconds.
     */
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    // Members ordered largest-alignment-first to prevent struct padding holes:
    // pointer (8B) -> uint32_t (4B) -> int16_t/uint16_t (2B) -> uint8_t/bool (1B)
    const char* text_ = nullptr;          ///< Zero-copy string pointer
    uint32_t last_scroll_ms_ = 0;         ///< Timestamp of last or next scheduled tick step
    int16_t scroll_x_ = 0;                ///< Current marquee horizontal pixel offset
    int16_t message_width_ = 0;           ///< Measured text pixel width under active font
    uint16_t initial_delay_ms_ = 3000;    ///< Milliseconds before scroll begins
    uint16_t static_dwell_ms_ = 5000;     ///< Milliseconds before static text finishes
    uint8_t scroll_px_per_sec_ = 25;      ///< Marquee speed in pixels per second
    bool needs_scroll_ = false;           ///< True if text width > widget width
    bool needs_layout_ = true;            ///< True if text measurement is required
    bool scroll_finished_ = false;        ///< True when cycle or dwell completes
};

#endif // U8G2GL_SCROLLING_LABEL_H
