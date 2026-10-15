/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl.cpp
 * Purpose: Library-level entry point. Deliberately almost empty — U8G2GL has no
 *          global initialisation, no registry to populate and no boot sequence,
 *          because generated code declares everything statically and the
 *          application owns the loop. This file exists so the library has a
 *          translation unit of its own rather than as a home for logic.
 *
 * Description: Library-scope definitions
 */
#include "u8g2gl/u8g2gl_types.h"
#include "u8g2gl/u8g2gl_config.h"

// Placeholder translation unit for U8G2GL runtime library (WO2+)
