/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/screen.ts
 * Purpose: Defines the document model for screen XML files (`screens/screen_*.xml`).
 *          Per §5.4, a screen defines local styles, a visual `<view>` tree sized to
 *          the active target display, and an optional ordered `<focus_ring>` (§12.2).
 * Description: Immutable interfaces for Screen, View, FocusRing, and FocusEntry
 *              elements, establishing the document model for screen rendering units.
 *
 * Exports:
 * - Screen: Top-level screen descriptor model
 * - View: Root visual container sized by the active target
 * - FocusRing: Explicit cyclic input navigation ring
 * - FocusEntry: Named focusable target in a focus ring
 */

import type { SourceLocation } from './source-location.js';
import type { StyleDecl } from './globals.js';
import type { WidgetNode } from './widget-node.js';

/**
 * Screen file descriptor model parsed from `screens/screen_*.xml` (§5.4).
 */
export interface Screen {
  /** Screen identifier (e.g. "home", "settings"). */
  readonly name: string;
  /** Optional screen-scoped style declarations overriding or augmenting globals. */
  readonly styles?: readonly StyleDecl[];
  /** Root visual view container for the screen. */
  readonly view: View;
  /** Source location where the screen root element was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Root visual container of a screen (§5.4).
 * Sized implicitly by the display dimensions of the active target.
 */
export interface View {
  /** Visual child widgets declared within this view. */
  readonly children: readonly WidgetNode[];
  /** Optional explicit focus navigation ring (§12.2). */
  readonly focusRing?: FocusRing;
  /** Source location where the view element was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Explicit focus ring ordering user input navigation across widgets (§12.2).
 */
export interface FocusRing {
  /** If true, advancing past the last entry wraps back to the first. */
  readonly wrap: boolean;
  /** Ordered list of named focusable elements in navigation sequence. */
  readonly entries: readonly FocusEntry[];
  /** Source location where the focus ring was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Entry within a focus ring referencing a named, focusable widget (§12.2).
 */
export interface FocusEntry {
  /** Name of the target focusable widget. */
  readonly name: string;
  /** Source location where this focus entry was declared. */
  readonly loc?: SourceLocation;
}
