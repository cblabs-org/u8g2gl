/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/display-record.ts
 * Purpose: Defines the schema for U8G2 display catalogue records (§5.2, [D-14]).
 *          The display catalogue is derived from U8G2's own display descriptor tables,
 *          providing exact pixel dimensions, tile sizes, buffer byte requirements,
 *          bus families, and driver function names.
 * Description: Immutable interfaces and union types for DisplayRecord, DisplayBus,
 *              DisplayTiles, DisplayXOffset, and BusFamily.
 *
 * Exports:
 * - BusFamily: Normalized bus communication family ('spi' | 'i2c' | 'parallel')
 * - DisplayBus: Bus interface connection descriptor
 * - DisplayTiles: Display dimensions measured in 8-pixel tiles
 * - DisplayXOffset: Horizontal column shift offsets for normal and flipped orientations
 * - DisplayRecord: Complete catalogued display record derived from U8G2 tables
 */

/**
 * Normalized bus interface family (§5.2).
 */
export type BusFamily = 'spi' | 'i2c' | 'parallel';

/**
 * Physical communication bus metadata for a display constructor.
 */
export interface DisplayBus {
  /** Normalized protocol family. */
  readonly family: BusFamily;
  /** Wiring mode descriptor (e.g. "4W_HW_SPI", "HW_I2C"). */
  readonly wiring: string;
  /** Full raw constructor suffix extracted from U8G2 source. */
  readonly raw: string;
}

/**
 * Display dimensions measured in 8-pixel tiles.
 */
export interface DisplayTiles {
  /** Width in 8-pixel tiles. */
  readonly width: number;
  /** Height in 8-pixel tiles. */
  readonly height: number;
}

/**
 * Hardware column offset adjustments required by specific controller variants (§5.2).
 */
export interface DisplayXOffset {
  /** Default column offset in pixels. */
  readonly default: number;
  /** Column offset when flip mode (180-degree rotation) is active. */
  readonly flipmode: number;
}

/**
 * Catalogue entry representing a single supported U8G2 display setup (§5.2).
 */
export interface DisplayRecord {
  /** Full U8G2 constructor name (e.g. "U8G2_SSD1306_128X64_NONAME_F_HW_I2C"). */
  readonly setup: string;
  /** Display controller chip identifier (e.g. "SSD1306", "SH1106", "ST7565"). */
  readonly controller: string;
  /** Hardware and electrical variant tokens (e.g. ["128X64", "NONAME"]). */
  readonly variant: readonly string[];
  /** Usable display width in pixels. */
  readonly width: number;
  /** Usable display height in pixels. */
  readonly height: number;
  /** Tile dimensions for the framebuffer. */
  readonly tiles: DisplayTiles;
  /**
   * Exact static RAM required for the full frame buffer (tiles.width * tiles.height * 8).
   * Per §5.2 and [D-14], derived directly from U8G2 allocator tables.
   */
  readonly framebufferBytes: number;
  /** Bus interface details. */
  readonly bus: DisplayBus;
  /** Controller-specific horizontal shift offsets. */
  readonly xOffset: DisplayXOffset;
  /** Low-level U8x8 driver function symbol name from u8x8_d_*.c. */
  readonly driver: string;
}
