/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_probe_box/wd_probe_box.hpp
 * Purpose: Minimal custom C++ widget to prove the end-to-end custom widget path
 *          (G-PROBE-2 WO1). Inherits from u8g2gl_obj and draws a filled box
 *          inside its bounds up to fill_height pixels tall.
 *
 * Description: Declarations for the wd_probe_box widget class. Provides accessors
 *              for fill_height and overrides render().
 *
 * Exported Classes:
 * - wd_probe_box: Minimal custom box widget extending u8g2gl_obj.
 */
#ifndef WD_PROBE_BOX_HPP
#define WD_PROBE_BOX_HPP

#include "u8g2gl/u8g2gl_obj.h"

class U8G2;

/**
 * @brief Minimal probe widget extending u8g2gl_obj.
 */
class wd_probe_box : public u8g2gl_obj {
public:
    wd_probe_box() = default;
    ~wd_probe_box() override = default;

    /**
     * @brief Set the filled inner box height in pixels.
     * @param h Height in pixels.
     */
    void set_fill_height(int16_t h);

    /**
     * @brief Get the filled inner box height.
     * @return Height in pixels.
     */
    int16_t get_fill_height() const;

    /**
     * @brief Draw the widget into the U8G2 display buffer.
     * @param display The U8G2 display instance.
     */
    void render(U8G2& display) override;

private:
    int16_t fill_height_{8};
};

#endif // WD_PROBE_BOX_HPP
