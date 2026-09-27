/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/globals.ts
 * Purpose: Defines the document model for globals.xml (§5.3). Globals encompass
 *          reusable layout constants (§7.2), reactive data subjects (§8),
 *          monochrome styling descriptors (§10), font declarations (§14.1),
 *          and monochrome image assets (§14.2).
 * Description: Immutable interfaces and union types covering global declarations,
 *              supporting static memory calculation and cross-reference validation.
 *
 * Exports:
 * - Globals: Container for all declarations in globals.xml
 * - ConstDecl: Named compile-time constant integer or string
 * - SubjectType: Scalar subject data type ('int' | 'string' | 'bool' | 'time')
 * - SubjectDecl: Reactive observable subject declaration
 * - DrawColor: Monochrome pixel drawing mode ('0' | '1' | 'xor')
 * - TextAlign: Horizontal text alignment ('left' | 'center' | 'right')
 * - FontMode: Font rendering background mode ('solid' | 'transparent')
 * - BitmapMode: Bitmap rendering background mode ('solid' | 'transparent')
 * - StyleDecl: Named style properties definition
 * - StylePropertyKey, StyleProperty, STYLE_PROPERTIES: §10's style properties, the one list
 * - FontDecl: Discriminated union of font definitions (BDF or U8G2 built-in)
 * - BdfFontDecl: Custom BDF font definition with optional glyph range
 * - BuiltinFontDecl: Direct U8G2 C font identifier definition
 * - ImageDecl: Discriminated union of image asset declarations (XBM or auto-converted)
 * - XbmImageDecl: Native XBM 1-bit monochrome bitmap asset
 * - ConvertImageDecl: Image converted at build-time with threshold or dither
 */

import type { SourceLocation } from './source-location.js';

/**
 * Top-level container representing parsed contents of `globals.xml`.
 */
export interface Globals {
  /** Compile-time layout and text constants (§7.2). */
  readonly consts: readonly ConstDecl[];
  /** Reactive observable subjects (§8). */
  readonly subjects: readonly SubjectDecl[];
  /** Shared style definitions (§10). */
  readonly styles: readonly StyleDecl[];
  /** Font definitions (BDF and built-in U8G2 fonts, §14.1). */
  readonly fonts: readonly FontDecl[];
  /** Image asset declarations (XBM and converted graphics, §14.2). */
  readonly images: readonly ImageDecl[];
  /** Source location where the globals root element was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Compile-time constant integer or string declaration (§7.2).
 * Resolved at build time; used in layout arithmetic and text templates.
 */
export interface ConstDecl {
  /** Constant name referenced via `#name`. */
  readonly name: string;
  /** Primitive constant type. */
  readonly type: 'int' | 'string';
  /** Literal string representation of the constant value. */
  readonly value: string;
  /** Source location where the constant was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Primitive scalar data type supported by reactive subjects (§8.1).
 */
export type SubjectType = 'int' | 'string' | 'bool' | 'time';

/**
 * Reactive data subject declaration (§8).
 * Subjects hold framework-allocated static storage and notify bound observers when modified.
 */
export interface SubjectDecl {
  /** Subject identifier referenced by widgets and bound setters. */
  readonly name: string;
  /** Data type of the subject value. */
  readonly type: SubjectType;
  /** Optional initial default value. */
  readonly default?: string;
  /**
   * Maximum usable string characters for 'string' subjects (excluding null terminator).
   * Per §8.2, framework allocates `maxLen + 1` bytes of static storage.
   */
  readonly maxLen?: number;
  /** Source location where the subject was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Monochrome pixel draw colour modes (§10).
 * - '0': Clear pixels (black on standard OLED)
 * - '1': Set pixels (white on standard OLED)
 * - 'xor': Invert underlying framebuffer pixels
 */
export type DrawColor = '0' | '1' | 'xor';

/**
 * Text alignment options (§10).
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Font background rendering mode (§10).
 * - 'solid': Overwrites background pixels with complementary colour
 * - 'transparent': Leaves underlying framebuffer pixels intact
 */
export type FontMode = 'solid' | 'transparent';

/**
 * Bitmap background rendering mode (§10).
 */
export type BitmapMode = 'solid' | 'transparent';

/**
 * Named style declaration for monochrome UI elements (§10).
 */
export interface StyleDecl {
  /** Unique style identifier referenced via `style="name"`. */
  readonly name: string;
  /** Font name declared in `<fonts>`. */
  readonly font?: string;
  /** Pixel draw mode. */
  readonly drawColor?: DrawColor;
  /** If true, inverts the element's bounding box region. */
  readonly invert?: boolean;
  /** Internal padding in pixels. */
  readonly padding?: number;
  /** 1px outline border flag. */
  readonly border?: boolean;
  /** Corner radius in pixels for rounded boxes. */
  readonly radius?: number;
  /** Text alignment within element width. */
  readonly align?: TextAlign;
  /** Font drawing mode. */
  readonly fontMode?: FontMode;
  /** Bitmap drawing mode. */
  readonly bitmapMode?: BitmapMode;
  /**
   * Attributes written on the `<style>` that are neither `name` nor a style
   * property ({@link STYLE_PROPERTIES}), with where each is written. The parser
   * records them rather than reporting them, so a mistyped attribute cannot
   * discard the whole of `globals.xml`; Pass 1 reports each (PR-04 WO11b).
   */
  readonly unknownAttributes?: readonly { readonly name: string; readonly loc?: SourceLocation }[];
  /**
   * Every style property the `<style>` writes, **as written**, with the spelling
   * used and where it is: the text a value check needs, which the typed members
   * above have already lost. Pass 1 holds each to its `u8g2gl_obj` prop, exactly
   * as it holds an element's attribute (PR-04 WO11b, finding 12) — `invert="yes"`
   * used to become `false` with nothing said.
   */
  readonly written?: readonly {
    /** The style property's canonical attribute, as {@link STYLE_PROPERTIES} spells it. */
    readonly attribute: string;
    /** The spelling the author used, which may be a camelCase alias. */
    readonly spelled: string;
    readonly value: string;
    readonly loc?: SourceLocation;
  }[];
  /** Source location where this style was declared. */
  readonly loc?: SourceLocation;
}

/** The `StyleDecl` members that are style properties (§10). */
export type StylePropertyKey = 'font' | 'drawColor' | 'invert' | 'padding' | 'border' | 'radius' | 'align' | 'fontMode' | 'bitmapMode';

/** One style property of §10's table. */
export interface StyleProperty {
  /** The `StyleDecl` member. */
  readonly key: StylePropertyKey;
  /**
   * The attribute as `<style>` spells it, which is also the element `<prop>` of
   * the same name (§10). The editor applies a style through those props, and
   * the value is spelled through that prop's declaration.
   */
  readonly attribute: string;
  /** The `u8g2gl_style` setter that applies it. */
  readonly setter: string;
  /** How the parser reads it: text, a `true`/`false` switch, or an integer. */
  readonly kind: 'text' | 'bool' | 'int';
  /** camelCase spellings the parser has always also accepted. */
  readonly aliases?: readonly string[];
}

/**
 * §10's style properties — **the one list** of what a `<style>` may set. The
 * parser reads a style through it, Pass 1 reports any other attribute against
 * it, and the styles unit emits each property through it (PR-04 WO11b; moved
 * here from `emit/styles.ts`, where it was the emitter's alone and the parser
 * kept a second, implicit list). `truncate` is not here: [D-19] deleted it.
 */
export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  { key: 'font', attribute: 'font', setter: 'set_font', kind: 'text' },
  { key: 'drawColor', attribute: 'draw_color', setter: 'set_draw_color', kind: 'text', aliases: ['drawColor'] },
  { key: 'invert', attribute: 'invert', setter: 'set_invert', kind: 'bool' },
  { key: 'padding', attribute: 'padding', setter: 'set_padding', kind: 'int' },
  { key: 'border', attribute: 'border', setter: 'set_border', kind: 'bool' },
  { key: 'radius', attribute: 'radius', setter: 'set_radius', kind: 'int' },
  { key: 'align', attribute: 'align', setter: 'set_align', kind: 'text' },
  { key: 'fontMode', attribute: 'font_mode', setter: 'set_font_mode', kind: 'text', aliases: ['fontMode'] },
  { key: 'bitmapMode', attribute: 'bitmap_mode', setter: 'set_bitmap_mode', kind: 'text', aliases: ['bitmapMode'] },
];

/**
 * Discriminated union of font declarations supported in `<fonts>`.
 */
export type FontDecl = BdfFontDecl | BuiltinFontDecl;

/**
 * Custom BDF font source declaration compiled via u8g2 font tooling (§14.1).
 */
export interface BdfFontDecl {
  /** Discriminated font kind. */
  readonly kind: 'bdf';
  /** Font symbol name used in styles and widgets. */
  readonly name: string;
  /** Relative path to the `.bdf` font file. */
  readonly src: string;
  /** Optional Unicode codepoint filter range (e.g. "0x20-0x7F"). */
  readonly range?: string;
  /** Source location where this font was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Built-in U8G2 font declaration referencing U8G2 PROGMEM font arrays (§14.1).
 */
export interface BuiltinFontDecl {
  /** Discriminated font kind. */
  readonly kind: 'builtin';
  /** U8G2 font array identifier (e.g. "u8g2_font_6x10_mr"). */
  readonly name: string;
  /** Source location where this font was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Discriminated union of image asset declarations in `<images>`.
 */
export type ImageDecl = XbmImageDecl | ConvertImageDecl;

/**
 * Native XBM monochrome 1-bit bitmap declaration (§14.2).
 */
export interface XbmImageDecl {
  /** Discriminated image kind. */
  readonly kind: 'xbm';
  /** Image identifier used in widgets and components. */
  readonly name: string;
  /** Relative path to the `.xbm` source file. */
  readonly src: string;
  /** Source location where this image was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Graphic asset automatically converted to 1-bit bitmap at build time (§14.2).
 */
export interface ConvertImageDecl {
  /** Discriminated image kind. */
  readonly kind: 'convert';
  /** Image identifier used in widgets. */
  readonly name: string;
  /** Path to source image file (e.g. PNG). */
  readonly src: string;
  /** Target width in pixels. */
  readonly width: number;
  /** Target height in pixels. */
  readonly height: number;
  /** Conversion algorithm: fixed threshold or error diffusion dither. */
  readonly mode?: 'threshold' | 'dither';
  /** Luminance cutoff value (0..255) when mode is 'threshold'. */
  readonly threshold?: number;
  /** Source location where this image was declared. */
  readonly loc?: SourceLocation;
}
