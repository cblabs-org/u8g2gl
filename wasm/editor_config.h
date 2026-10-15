/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/editor_config.h
 * Purpose: Static capacities for the Wasm editor target ([UD-4], PR-06 WO5).
 *          Generously sized to support interactive scene reloads and live
 *          canvas edits without exhausting static pools.
 *
 * Exported Constants:
 * - U8G2GL_DEFAULT_OBSERVERS: Capacity for unspecialised subject observers (16)
 * - U8G2GL_MAX_OBJECTS_PER_SCREEN: Max objects in one screen's flat array (128)
 * - U8G2GL_MAX_STYLES: Max styles in the static pool (32)
 * - U8G2GL_MAX_STRING_LEN: Max length of a string subject (128)
 * - U8G2GL_MAX_BINDINGS_PER_OBJ: Max bindings per object (16)
 * - U8G2GL_MAX_TOTAL_BINDINGS: Max total active bindings across the screen (512)
 */
#ifndef U8G2GL_WASM_EDITOR_CONFIG_H
#define U8G2GL_WASM_EDITOR_CONFIG_H

#ifndef U8G2GL_DEFAULT_OBSERVERS
#define U8G2GL_DEFAULT_OBSERVERS 16
#endif

#ifndef U8G2GL_MAX_OBJECTS_PER_SCREEN
#define U8G2GL_MAX_OBJECTS_PER_SCREEN 128
#endif

#ifndef U8G2GL_MAX_STYLES
#define U8G2GL_MAX_STYLES 32
#endif

#ifndef U8G2GL_MAX_STRING_LEN
#define U8G2GL_MAX_STRING_LEN 128
#endif

#ifndef U8G2GL_MAX_BINDINGS_PER_OBJ
#define U8G2GL_MAX_BINDINGS_PER_OBJ 16
#endif

#ifndef U8G2GL_MAX_TOTAL_BINDINGS
#define U8G2GL_MAX_TOTAL_BINDINGS 512
#endif

#endif  // U8G2GL_WASM_EDITOR_CONFIG_H
