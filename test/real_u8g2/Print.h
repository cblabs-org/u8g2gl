/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/real_u8g2/Print.h
 * Purpose: The Arduino Print base class, reduced to what U8G2's headers derive
 *          from. With ARDUINO defined, U8G2, U8X8 and U8G2LOG all inherit from
 *          Print and override its write() pair, so the real-header target needs
 *          the base class to exist. See Arduino.h beside this file for why the
 *          shim holds platform declarations only and never a U8G2 API.
 *
 * Description: Print with the two write() virtuals the Arduino core declares.
 *              No print()/println() overloads: nothing in U8G2's headers or the
 *              runtime calls them.
 *
 * Exported Classes:
 * - Print: Arduino character-output base class (write() pair only)
 */
#ifndef U8G2GL_REAL_U8G2_PRINT_H
#define U8G2GL_REAL_U8G2_PRINT_H

#include <stddef.h>
#include <stdint.h>

/**
 * @brief Arduino's character-output base class, as far as U8G2 uses it.
 *
 * No virtual destructor, matching the Arduino core: subclasses such as U8G2 are
 * never deleted through a Print pointer.
 */
class Print {
public:
    /** @brief Write one byte; returns the number of bytes written. */
    virtual size_t write(uint8_t value) = 0;

    /** @brief Write a buffer byte by byte; returns the number of bytes written. */
    virtual size_t write(const uint8_t* buffer, size_t size) {
        size_t written = 0;
        while (size > 0) {
            written += write(*buffer++);
            --size;
        }
        return written;
    }
};

#endif // U8G2GL_REAL_U8G2_PRINT_H
