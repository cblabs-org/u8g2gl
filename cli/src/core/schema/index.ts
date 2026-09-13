/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/index.ts
 * Purpose: Central barrel export for the U8G2GL schema version 0.3 document model.
 *          Provides the complete TypeScript type system used across parser, validator,
 *          resolver, code generator, and visual designer tooling.
 * Description: Re-exports all immutable AST types, manifest contracts, display catalogue
 *              models, diagnostic representations, and source tracking structures.
 *
 * Exports:
 * - Source tracking:
 *   - SourceLocation: Line and column coordinates in a source file
 *   - SourceRange: Span between two source locations
 *   - Located: Wrapper pairing any value with its source location
 *
 * - Diagnostics (§15, [D-16]):
 *   - Severity: Diagnostic severity classification ('error' | 'warning' | 'info')
 *   - Diagnostic: Structured diagnostic carrying code, location, and suggestions
 *   - DIAGNOSTIC_CODES: Stable programmatic error code constants
 *   - DiagnosticCode: Union type of diagnostic codes
 *
 * - Project configuration (§5.1):
 *   - U8g2glProject: Document model for u8g2gl.xml
 *   - Target: Hardware target display specification
 *   - BusConfig: Hardware bus pin and address mappings
 *   - OutputConfig: Emitted C++ directory and prefix settings
 *
 * - Global declarations (§5.3):
 *   - Globals: Document model for globals.xml
 *   - ConstDecl: Named compile-time constant
 *   - SubjectType: Scalar subject type union ('int' | 'string' | 'bool' | 'time')
 *   - SubjectDecl: Reactive observable subject declaration
 *   - DrawColor: Monochrome pixel draw mode ('0' | '1' | 'xor')
 *   - TextAlign: Horizontal text alignment ('left' | 'center' | 'right')
 *   - FontMode: Font background mode ('solid' | 'transparent')
 *   - BitmapMode: Bitmap background mode ('solid' | 'transparent')
 *   - StyleDecl: Named style properties definition
 *   - FontDecl: Discriminated union of font declarations (BDF or builtin)
 *   - BdfFontDecl: Custom BDF font definition
 *   - BuiltinFontDecl: Built-in U8G2 font reference
 *   - ImageDecl: Discriminated union of image asset declarations
 *   - XbmImageDecl: Native XBM 1-bit monochrome bitmap
 *   - ConvertImageDecl: Image converted at build-time with threshold or dither
 *
 * - Screen views (§5.4, §12):
 *   - Screen: Document model for screens/screen_*.xml
 *   - View: Root visual container sized by the active target
 *   - FocusRing: Explicit cyclic input navigation ring
 *   - FocusEntry: Named focusable target in a focus ring
 *
 * - Widget instances & AST nodes:
 *   - CommonAttributes: Positioning, anchor, sizing, and styling attributes
 *   - WidgetNode: Instantiated visual element in a view tree
 *   - WidgetNodeChild: Child element union (widget, binding, event, style)
 *   - BindingChild: Reactive data binding or conditional flag directive
 *   - EventTrigger: Interaction trigger ('press' | 'long_press' | 'value_changed')
 *   - EventChild: Action handler attached to an element
 *   - StyleChild: Inline style reference element
 *
 * - Widget manifests (§6.4, §13.1) — also the composite model (§6.3, §6.4):
 *   - WidgetManifest: Document model for `<widget>` API declarations. Carries
 *     an optional `view` for the composite case ([D-18]). WO5b retired the
 *     separate `Component`/`ComponentProp` pair: a composite is now literally
 *     a `WidgetManifest` whose `<api>` carries a `view`, not a second type
 *     with the same shape — see widget-manifest.ts for why `extends` is
 *     optional as a result.
 *   - ApiBlock: Public API declaration block
 *   - PropType: Widget property data type union
 *   - PropDef: Property descriptor mapping to C++ setter method
 *   - BindDef: Reactive subject binding slot descriptor
 *   - ElementDef: Child collection element descriptor
 *   - ElementArgDef: Collection element argument descriptor
 *
 * - Display catalogue (§5.2):
 *   - BusFamily: Normalized bus protocol family ('spi' | 'i2c' | 'parallel')
 *   - DisplayBus: Physical bus interface configuration
 *   - DisplayTiles: Framebuffer dimensions in 8-pixel tiles
 *   - DisplayXOffset: Horizontal column shift offsets
 *   - DisplayRecord: Catalogued display record derived from U8G2 tables
 */

export type {
  SourceLocation,
  SourceRange,
  Located,
} from './source-location.js';

export {
  DIAGNOSTIC_CODES,
  type Severity,
  type DiagnosticCode,
  type Diagnostic,
} from './diagnostic.js';

export type {
  U8g2glProject,
  Target,
  BusConfig,
  OutputConfig,
} from './project.js';

export type {
  Globals,
  ConstDecl,
  SubjectType,
  SubjectDecl,
  DrawColor,
  TextAlign,
  FontMode,
  BitmapMode,
  StyleDecl,
  FontDecl,
  BdfFontDecl,
  BuiltinFontDecl,
  ImageDecl,
  XbmImageDecl,
  ConvertImageDecl,
} from './globals.js';

export type {
  Screen,
  View,
  FocusRing,
  FocusEntry,
} from './screen.js';

export type {
  CommonAttributes,
  WidgetNode,
  WidgetNodeChild,
  BindingChild,
  EventTrigger,
  EventChild,
  StyleChild,
} from './widget-node.js';

export type {
  WidgetManifest,
  ApiBlock,
  PropType,
  PropDef,
  BindDef,
  ElementDef,
  ElementArgDef,
} from './widget-manifest.js';

export type {
  BusFamily,
  DisplayBus,
  DisplayTiles,
  DisplayXOffset,
  DisplayRecord,
} from './display-record.js';
