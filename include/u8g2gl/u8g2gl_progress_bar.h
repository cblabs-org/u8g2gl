/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_progress_bar.h
 *
 * Purpose: Visual task progression widget with smooth animated interpolation
 *          and stipple fill patterns. Ports core behavior from legacy
 *          ProgressBarWidget while conforming to U8G2GL's strict zero-heap
 *          memory discipline ([D-1], [PD-3]). Supports integer-based linear
 *          interpolation between percent states, customizable fill style
 *          (checkered stipple or solid), and optional centered numeric
 *          percentage readouts.
 *
 * Description: Declarations for u8g2gl_progress_bar widget class, including
 *              percent manipulation, animation duration, fill style, percentage
 *              label toggle, and virtual lifecycle overrides.
 *
 * Exported Classes:
 * - u8g2gl_progress_bar: Graphical progress bar widget inheriting from u8g2gl_obj.
 *
 *     Configuration:
 *     - set_value():               Set target percentage (0-100, clamped)
 *     - set_animate_duration_ms(): Set transition animation duration (0 = instant)
 *     - set_fill_style():          Choose between solid or stipple fill pattern
 *     - set_show_percent_text():   Toggle display of numeric percentage text
 *
 *     Query:
 *     - get_value():               Retrieve current interpolated percentage
 *     - get_target_value():        Retrieve target percentage
 *     - get_animate_duration_ms(): Retrieve configured animation duration
 *     - get_fill_style():          Retrieve active fill style
 *     - get_show_percent_text():   Retrieve percentage text visibility
 *
 *     Lifecycle (overrides):
 *     - tick():                    Advance animation; return ~60 FPS or U8G2GL_IDLE
 *     - render():                  Draw track frame, fill pattern, and optional label
 *     - render_animation_update(): Targeted partial refresh during blocked loop
 *
 * Exported Types:
 * - u8g2gl_fill_style_t: Fill pattern enum (SOLID or STIPPLE), explicit uint8_t base
 */
#ifndef U8G2GL_PROGRESS_BAR_H
#define U8G2GL_PROGRESS_BAR_H

#include <cstdint>
#include "u8g2gl_obj.h"

// Forward declaration of U8G2 display class
class U8G2;

/// Fill pattern for the progress bar
enum u8g2gl_fill_style_t : uint8_t {
    U8G2GL_FILL_SOLID = 0,
    U8G2GL_FILL_STIPPLE = 1,
};

/**
 * @brief Progress bar widget with animated transitions and stipple fill.
 *
 * Renders a horizontal progress bar within its bounding box. Supports both
 * instant transitions and smooth linear interpolation over a configurable
 * duration. Two fill styles are supported: solid box fill and checkered
 * stipple pattern fill (which provides a classic shaded monochrome look).
 */
class u8g2gl_progress_bar : public u8g2gl_obj {
public:
    /**
     * @brief Default constructor.
     *
     * Constructs a progress bar with 0% progress, instant transition (0ms),
     * stipple fill style, and hidden percentage text.
     */
    u8g2gl_progress_bar() = default;

    // --- Configuration ---

    /**
     * @brief Set target progress percentage.
     *
     * Clamps the value to [0, 100]. If animation duration is 0, snaps immediately
     * to the target. If duration is greater than 0, begins smooth linear interpolation
     * from the current percentage on subsequent tick calls.
     *
     * @param percent Progress value in percent (clamped to 0..100).
     */
    void set_value(uint8_t percent);

    /**
     * @brief Set animation duration for value transitions.
     *
     * @param ms Duration in milliseconds (0 for instant snapping).
     */
    void set_animate_duration_ms(uint16_t ms);

    /**
     * @brief Set the fill style pattern for the progress indicator.
     *
     * @param s Fill style: U8G2GL_FILL_SOLID or U8G2GL_FILL_STIPPLE.
     */
    void set_fill_style(u8g2gl_fill_style_t s);

    /**
     * @brief Toggle rendering of the numeric percentage text (e.g. "45%").
     *
     * When enabled, the formatted percentage string is centered within the bar bounds.
     *
     * @param show True to render percentage text, false to hide.
     */
    void set_show_percent_text(bool show);

    // --- Query ---

    /**
     * @brief Retrieve current visual progress percentage.
     *
     * During an active animation transition, returns the current interpolated value.
     * When stationary, returns the target value.
     *
     * @return Current percentage in the range [0, 100].
     */
    uint8_t get_value() const;

    /**
     * @brief Retrieve the target percentage.
     *
     * @return Target percentage in the range [0, 100].
     */
    uint8_t get_target_value() const;

    /**
     * @brief Retrieve the configured animation duration.
     *
     * @return Animation duration in milliseconds.
     */
    uint16_t get_animate_duration_ms() const;

    /**
     * @brief Retrieve the active fill style pattern.
     *
     * @return Active u8g2gl_fill_style_t value.
     */
    u8g2gl_fill_style_t get_fill_style() const;

    /**
     * @brief Query whether numeric percentage text is enabled.
     *
     * @return True if percentage text is rendered, false otherwise.
     */
    bool get_show_percent_text() const;

    // --- Lifecycle ---

    /**
     * @brief Advance progress animation state and report next deadline.
     *
     * When animating toward a new target, interpolates current_percent_ using
     * integer arithmetic and requests a ~60 FPS update interval (16ms).
     * Returns U8G2GL_IDLE once the target percentage is reached.
     *
     * @param now_ms Current system timestamp in milliseconds.
     * @return Milliseconds until next tick deadline (16ms when animating, or U8G2GL_IDLE).
     */
    uint32_t tick(uint32_t now_ms) override;

    /**
     * @brief Render the progress bar into the U8G2 display buffer.
     *
     * Draws the outer track frame, fills the bar according to active fill style
     * (checkered stipple or solid), and optionally draws centered percentage text.
     *
     * @param display U8G2 display context to draw into.
     */
    void render(U8G2& display) override;

    /**
     * @brief Targeted partial refresh during blocked execution loops.
     *
     * Advances animation by calling tick(), and if the visual percentage has changed,
     * redraws the widget and pushes changed tiles via u8g2gl_partial_refresh().
     *
     * @param display U8G2 display context to draw into.
     * @param now_ms Current timestamp in milliseconds.
     */
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    // Members ordered largest-alignment-first to prevent struct padding holes:
    // uint32_t (4B) -> uint16_t (2B) -> uint8_t/bool/enum (1B)
    uint32_t anim_start_ms_ = 0;                          ///< Timestamp when active animation began
    uint16_t anim_duration_ms_ = 0;                       ///< Duration of animation in ms (0 = instant)
    uint8_t current_percent_ = 0;                         ///< Current visual percentage (0..100)
    uint8_t target_percent_ = 0;                          ///< Target percentage (0..100)
    uint8_t start_percent_ = 0;                           ///< Starting percentage at animation start
    u8g2gl_fill_style_t fill_style_ = U8G2GL_FILL_STIPPLE;///< Fill pattern (solid or checkered stipple)
    bool show_percent_text_ = false;                      ///< Whether to render numeric "NN%" text
    bool anim_started_ = false;                           ///< True if animation start timestamp initialized
};

#endif // U8G2GL_PROGRESS_BAR_H
