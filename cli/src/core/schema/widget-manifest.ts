/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/widget-manifest.ts
 * Purpose: Defines the schema model for widget API manifests (`<widget>`, §6.4, §13.1).
 *          Per [D-17], the `<api>` manifest is the generator's build-time contract:
 *          it declares accepted properties, binding slots, and child collection elements,
 *          allowing built-in and custom widgets to be handled uniformly without generator changes.
 *          Per [D-18] a property reaches the display through exactly one of two emission
 *          targets — `setter=` (a method on the element's own class) or `draw=` (a free
 *          `u8g2gl_draw_*` function for a drawing element with no class, §13.1) — and the
 *          widget-level `animated` flag is gone: realisation is decided per instance by the
 *          generator, not declared by the manifest.
 * Description: Immutable interfaces for WidgetManifest, ApiBlock, property definitions,
 *              binding slots, and collection element arguments.
 *
 * Exports:
 * - WidgetManifest: Root widget manifest model parsed from widget XML declarations
 * - ApiBlock: Public API declaration block defining properties, bindings, and elements
 * - PropType: Property data type union per design_spec §13.2
 * - PropDef: Individual property descriptor and C++ setter mapping
 * - BindDef: Reactive subject binding slot descriptor
 * - ElementDef: Child collection element descriptor (for declared-capacity collections, §9)
 * - ElementArgDef: Parameter definition for a collection element
 */

import type { SourceLocation } from './source-location.js';

/**
 * Root `<widget>` descriptor model for built-in and custom C++-backed widgets (§6.4, §13.1).
 */
export interface WidgetManifest {
  /** Widget class tag name (e.g. "u8g2gl_label", "wd_service_list"). */
  readonly name: string;
  /** C++ base class extended by this widget (e.g. "u8g2gl_obj"). */
  readonly extends: string;
  /** Public API manifest defining accepted properties, bindings, and elements. */
  readonly api: ApiBlock;
  /** Source location where the widget manifest was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Public API definition block inside a widget manifest (§13.1).
 */
export interface ApiBlock {
  /** Configurable widget properties and attributes. */
  readonly props: readonly PropDef[];
  /** Reactive subject binding slots. */
  readonly bindings: readonly BindDef[];
  /** Child collection elements (e.g. `<column>`, §9). */
  readonly elements: readonly ElementDef[];
  /** Source location where the API block was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Supported widget property types from design_spec §13.2.
 */
export type PropType =
  | 'int'
  | 'bool'
  | 'string'
  | 'enum'
  | 'font'
  | 'image'
  | 'subject'
  | 'style'
  | 'color';

/**
 * Widget property definition mapping an XML attribute to its emission target (§13.1).
 *
 * Exactly one of `setter` and `draw` applies to a given property ([D-18]):
 * `setter` names a method on the element's own class; `draw` names a free
 * `u8g2gl_draw_*` function for a drawing element that has no class at all
 * (§6.2). A manifest that specifies neither defaults to `set_<name>`, so
 * both fields are optional on the type even though every real property
 * resolves to one of them.
 */
export interface PropDef {
  /** Attribute name used in XML. */
  readonly name: string;
  /** Data type of the property. */
  readonly type: PropType;
  /**
   * C++ setter method name called during initialization (e.g. "set_font").
   * Mutually exclusive with `draw` — see design_spec §13.1.
   */
  readonly setter?: string;
  /**
   * Free function name handling this property via a direct draw call rather
   * than a class setter (e.g. "u8g2gl_draw_box", §6.2). Mutually exclusive
   * with `setter` — design_spec §13.1, [D-18].
   */
  readonly draw?: string;
  /** Optional default value when the attribute is omitted. */
  readonly default?: string;
  /** If true, the attribute is mandatory on every instance. */
  readonly required?: boolean;
  /** If true, the property may be modified dynamically during runtime. */
  readonly animated?: boolean;
  /** Enumerator macro pattern for enum types (e.g. "U8G2GL_ALIGN_{VALUE^^}"). */
  readonly emit?: string;
  /** Comma-separated list of valid values for 'enum' type. */
  readonly values?: string;
  /** Human-readable explanation of the property's role or RAM cost. */
  readonly help?: string;
  /** Source location where this property was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Binding slot definition for connecting reactive subjects to widget state (§13.1).
 */
export interface BindDef {
  /** Attribute name used in XML (e.g. "bind_text", "bind_value"). */
  readonly name: string;
  /** Accepted subject type (e.g. "string", "int", "bool", "time"). */
  readonly type: string;
  /** C++ method name registering the binding (e.g. "bind_text"). */
  readonly setter: string;
  /** Optional format string setter method name (e.g. "bind_text_fmt"). */
  readonly fmt?: string;
  /** Source location where this binding definition was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Child element definition for declared-capacity collection widgets (§9, §13.1).
 */
export interface ElementDef {
  /** Child element XML tag name (e.g. "column"). */
  readonly name: string;
  /** Access method pattern for appending items (e.g. "add"). */
  readonly access: string;
  /** Ordered list of arguments accepted by this element. */
  readonly args: readonly ElementArgDef[];
  /** Optional documentation string. */
  readonly help?: string;
  /** Source location where this element was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Argument definition for a collection child element.
 */
export interface ElementArgDef {
  /** Argument attribute name. */
  readonly name: string;
  /** Data type of the argument. */
  readonly type: PropType;
  /** Maximum character capacity for string arguments. */
  readonly maxLen?: number;
  /** Source location where this argument was declared. */
  readonly loc?: SourceLocation;
}
