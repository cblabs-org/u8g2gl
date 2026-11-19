/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/fill_guard/include/wd_tally.hpp
 * Purpose: A synthetic collection widget for the fill guard (test/CMakeLists.txt):
 *          its access method takes an int16_t, so a manifest declaring that
 *          field as an int compiles, and one declaring it as a string must
 *          fail the editor build with the generated static_assert's message.
 *          Declarations only: the guard compiles, never links.
 *
 * Exported Classes:
 * - wd_tally: begin(), add_mark(), commit() over no storage
 */
#ifndef WD_TALLY_HPP
#define WD_TALLY_HPP

#include <cstdint>
#include "u8g2gl/u8g2gl_obj.h"

/** @brief A widget whose rows are single marks. */
class wd_tally : public u8g2gl_obj {
public:
    /** @brief Start a batch. */
    void begin() {}
    /** @brief Stage one mark; false past capacity. */
    bool add_mark(int16_t at) { return at >= 0; }
    /** @brief Publish the batch. */
    void commit() {}
};

#endif  // WD_TALLY_HPP
