/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/real_u8g2/Arduino.h
 * Purpose: The Arduino platform half of the host shim that lets the runtime be
 *          compiled against U8G2's own headers (extern/u8g2) rather than the
 *          test stub. U8g2lib.h and U8x8lib.h include <Arduino.h> when ARDUINO
 *          is defined, which is how every firmware build sees them; the
 *          real-header target defines ARDUINO so the runtime is checked against
 *          that same view of the U8G2 class.
 *
 *          This file supplies Arduino platform declarations only. It must never
 *          declare any U8G2 or U8X8 API: the point of the target is that U8G2's
 *          own declarations are the ones compiled against, so a shim that
 *          re-declared one would reintroduce exactly the stub problem the target
 *          exists to catch (WO4c).
 *
 * Description: The fixed-width and size types the Arduino core makes available
 *              to every sketch. Nothing is defined, so the real-header target is
 *              compile-only and is never linked.
 */
#ifndef U8G2GL_REAL_U8G2_ARDUINO_H
#define U8G2GL_REAL_U8G2_ARDUINO_H

#include <stddef.h>
#include <stdint.h>

#endif // U8G2GL_REAL_U8G2_ARDUINO_H
