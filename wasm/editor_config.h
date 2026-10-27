/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/editor_config.h
 * Purpose: The capacities the framework editor Wasm is built with: the test
 *          fixture's own generated configuration, so the editor build is sized
 *          exactly as the fixture's firmware is ([D-21]) rather than by
 *          constants of its own. A project editor Wasm names its project's
 *          `u8g2gl_generated_config.h` directly and does not use this header.
 *
 * Description: Named in U8G2GL_GENERATED_CONFIG by the framework editor build
 *              and the native parity test, which put the fixture's
 *              `generated/` directory on the include path. It defines nothing
 *              itself: every ceiling the runtime reads (objects per screen,
 *              bindings, styles) is the generator's count, and every subject
 *              capacity is the scene's, sized by the bridge at load.
 */
#ifndef U8G2GL_WASM_EDITOR_CONFIG_H
#define U8G2GL_WASM_EDITOR_CONFIG_H

#include "u8g2gl_generated_config.h"

#endif  // U8G2GL_WASM_EDITOR_CONFIG_H
