/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/widget-node.ts
 * Purpose: Defines the AST node representations for visual elements, bindings,
 *          and event handlers declared inside screen `<view>` subtrees (§5.4, §6).
 * Description: Immutable models representing widget instances, positioning
 *              attributes, anchor relationships, style overrides, reactive binding
 *              slots, and input event handlers.
 *
 * Exports:
 * - CommonAttributes: Standard positioning, visibility, and style properties
 * - WidgetNode: Instantiated visual element in a view tree
 * - WidgetNodeChild: Union of valid child elements under a widget node
 * - BindingChild: Reactive data binding or conditional flag directive
 * - EventTrigger: Input interaction trigger ('press' | 'long_press' | 'value_changed')
 * - EventChild: Action handler attached to an element
 * - StyleChild: Inline style reference child element
 */

import type { SourceLocation } from './source-location.js';

/**
 * Standard positioning, sizing, anchor, and style attributes common across widgets.
 * Per §7.2, coordinate values may be integers or compile-time arithmetic expressions.
 */
export interface CommonAttributes {
  /** Optional identifier for the instance, enabling bindings and focus references. */
  readonly name?: string;
  /** X coordinate or expression relative to parent left edge. */
  readonly x?: string;
  /** Y coordinate or expression relative to parent top edge. */
  readonly y?: string;
  /** Width or expression in pixels. */
  readonly width?: string;
  /** Height or expression in pixels. */
  readonly height?: string;
  /** Anchor offset from parent right edge (§7.2). */
  readonly right?: string;
  /** Anchor offset from parent bottom edge (§7.2). */
  readonly bottom?: string;
  /** Horizontally centre within parent bounds if "true" (§7.2). */
  readonly hcenter?: string;
  /** Vertically centre within parent bounds if "true" (§7.2). */
  readonly vcenter?: string;
  /** Visibility toggle. Hidden elements are omitted from rendering. */
  readonly hidden?: boolean;
  /** Name of a style defined in `<styles>`. */
  readonly style?: string;
  /** Style applied while this element holds focus (§12.2). */
  readonly focusStyle?: string;
}

/**
 * An instantiated widget or component element within a screen view tree.
 */
export interface WidgetNode {
  /** Element tag name (e.g. "u8g2gl_label", "u8g2gl_box", "wd_service_list"). */
  readonly tag: string;
  /** All XML attributes, combining standard common attributes and custom widget props. */
  readonly attributes: CommonAttributes & {
    readonly [key: string]: string | boolean | undefined;
  };
  /**
   * Inline style overrides matching the `style_*` attribute prefix (§10).
   * E.g. `style_invert="true"` -> `{ invert: "true" }`.
   */
  readonly styleOverrides: Readonly<Record<string, string>>;
  /** Nested visual children, data bindings, event handlers, or style tags. */
  readonly children: readonly WidgetNodeChild[];
  /** Source location where this widget node began. */
  readonly loc?: SourceLocation;
  /** Source locations for individual XML attributes on this element. */
  readonly attributeLocs?: Readonly<Record<string, SourceLocation>>;
}

/**
 * Union of valid child nodes within a widget element.
 */
export type WidgetNodeChild = WidgetNode | BindingChild | EventChild | StyleChild;

/**
 * Reactive subject binding child element (e.g. `<bind_flag_if_eq>`, §8.4).
 */
export interface BindingChild {
  /** Discriminated kind. */
  readonly kind: 'binding';
  /** Binding type identifier (e.g. "bind_flag_if_eq", "bind_flag_if_not_eq"). */
  readonly type: string;
  /** Target subject name. */
  readonly subject: string;
  /** Reference comparison value. */
  readonly value?: string;
  /** Alias for reference comparison value matching XML ref_value attribute. */
  readonly refValue?: string;
  /** Target flag to toggle (e.g. "hidden", "disabled"). */
  readonly flag?: string;
  /** Source location where this binding was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Semantic user input interaction trigger (§12.3).
 */
export type EventTrigger = 'press' | 'long_press' | 'value_changed';

/**
 * Action handler child element attached to a widget (§12.3).
 */
export interface EventChild {
  /** Discriminated kind. */
  readonly kind: 'event';
  /** Event action type: load a screen, navigate back, or call a C++ callback. */
  readonly type: 'screen_load_event' | 'screen_back_event' | 'event_cb';
  /** Trigger condition. */
  readonly trigger: EventTrigger;
  /** Target screen identifier for 'screen_load_event'. */
  readonly screen?: string;
  /** C++ callback function name for 'event_cb'. */
  readonly callback?: string;
  /** Source location where this event child was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Inline style reference child element (`<style name="..." />`, §10).
 */
export interface StyleChild {
  /** Discriminated kind. */
  readonly kind: 'style';
  /** Referenced style name. */
  readonly name: string;
  /** Source location where this style child was declared. */
  readonly loc?: SourceLocation;
}
