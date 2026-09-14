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
 * - CommonAttributes: Identity, anchor and style attributes every element accepts
 * - WidgetNode: Instantiated visual element in a view tree
 * - WidgetNodeChild: Union of valid child elements under a widget node
 * - BindingChild: Reactive data binding or conditional flag directive
 * - EventTrigger: Input interaction trigger ('press' | 'long_press' | 'value_changed')
 * - EventChild: Action handler attached to an element
 * - StyleChild: Inline style reference child element
 */

import type { SourceLocation } from './source-location.js';

/**
 * Identity, anchor and style attributes every element accepts (§7.2, §10, [U-1]).
 *
 * Deliberately **not** here: `x`, `y`, `width`, `height` and `hidden`. They are
 * properties that exist only where an element's effective manifest declares
 * them (PR-04 WO3) — `<u8g2gl_line>` has no `x`, and a drawing element has no
 * literal `hidden`. Typing them as common let code read geometry off any node
 * as if it were guaranteed; they are reached through the index signature on
 * {@link WidgetNode.attributes} instead, so a reader must narrow, and the
 * resolver reads them only where the manifest declares them (PR-04 WO6). This
 * mirrors `COMMON_ATTRIBUTES` in validate-widget-props.ts.
 */
export interface CommonAttributes {
  /** Required identifier for the instance. Used as C++ variable name by the
   *  generator (§13.3) and as stable element identity for the editor.
   *  Per [U-1], every element must have a name. The parser auto-generates
   *  one from {tag}_{index} if omitted, with a warning diagnostic. */
  readonly name: string;
  /** Anchor offset from parent right edge (§7.2). */
  readonly right?: string;
  /** Anchor offset from parent bottom edge (§7.2). */
  readonly bottom?: string;
  /** Horizontally centre within parent bounds if "true" (§7.2). */
  readonly hcenter?: string;
  /** Vertically centre within parent bounds if "true" (§7.2). */
  readonly vcenter?: string;
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
