/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: tools/font-samples/font_samples.h
 * Purpose: The contract between the font table the node script generates
 *          (C, one entry per built-in font) and the renderer that draws each
 *          entry (font_samples.cpp). Kept in C so the generated table can
 *          name U8G2's font arrays through u8g2.h, which makes a font that
 *          U8G2 does not declare a compile error naming it.
 * Description: One entry is a font's symbol name, its data, and the text to
 *              draw. The table's order is u8g2-fonts.json's, and the renderer
 *              writes its output in the same order.
 *
 * Exported Types:
 * - font_sample_entry: one font to render
 *
 * Exported Data (defined by the generated table):
 * - font_sample_table: every entry, in u8g2-fonts.json's order
 * - font_sample_count: the number of entries
 */
#ifndef FONT_SAMPLES_H
#define FONT_SAMPLES_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** One built-in font to render. */
typedef struct font_sample_entry {
    const char* name;     /**< The font's symbol name, e.g. "u8g2_font_helvR08_tr". */
    const uint8_t* font;  /**< The font data, as u8g2_SetFont() takes it. */
    const char* text;     /**< ASCII text to draw; glyphs the font lacks are skipped. */
} font_sample_entry;

/** Every font, in u8g2-fonts.json's order. Defined by the generated table. */
extern const font_sample_entry font_sample_table[];
/** The number of entries in font_sample_table. */
extern const size_t font_sample_count;

#ifdef __cplusplus
}
#endif

#endif /* FONT_SAMPLES_H */
