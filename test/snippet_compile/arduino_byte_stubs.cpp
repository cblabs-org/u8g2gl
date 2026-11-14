/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/snippet_compile/arduino_byte_stubs.cpp
 * Purpose: The Arduino half of U8G2's hardware layer, stubbed so the snippet
 *          executable links on the host. U8G2's constructors pass these
 *          callbacks to its C setup functions and record their pins through
 *          the u8x8_SetPin_* helpers; the real definitions of both are in
 *          cppsrc/U8x8lib.cpp, which needs the Arduino core (SPI, Wire,
 *          digitalWrite) and is never built here.
 *
 * Description: Each function, declared by U8G2's own U8x8lib.h, defined to
 *              do nothing (a callback reports success). Only what the HW SPI,
 *              SW SPI and HW I2C snippets reference is defined, so a snippet
 *              that starts needing more fails this link, visibly.
 */
#include <U8x8lib.h>

extern "C" {

// The GPIO and delay callback every Arduino constructor uses.
uint8_t u8x8_gpio_and_delay_arduino(u8x8_t*, uint8_t, uint8_t, void*) { return 1; }

// The byte transports of the three compiled wirings.
uint8_t u8x8_byte_arduino_hw_spi(u8x8_t*, uint8_t, uint8_t, void*) { return 1; }
uint8_t u8x8_byte_arduino_4wire_sw_spi(u8x8_t*, uint8_t, uint8_t, void*) { return 1; }
uint8_t u8x8_byte_arduino_hw_i2c(u8x8_t*, uint8_t, uint8_t, void*) { return 1; }

} // extern "C"

// The pin setters the three compiled constructors call. Real U8G2 stores the
// pins in u8x8_t for the transports above; with stub transports nothing reads them.
void u8x8_SetPin_4Wire_HW_SPI(u8x8_t*, uint8_t, uint8_t, uint8_t) {}
void u8x8_SetPin_4Wire_SW_SPI(u8x8_t*, uint8_t, uint8_t, uint8_t, uint8_t, uint8_t) {}
void u8x8_SetPin_HW_I2C(u8x8_t*, uint8_t, uint8_t, uint8_t) {}
