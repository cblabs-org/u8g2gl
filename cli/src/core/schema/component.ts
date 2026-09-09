/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/component.ts
 * Purpose: Defines the document model for Tier 3 reusable XML components (§6.3).
 *          Components are pure XML compositions inlined at build time with zero
 *          runtime overhead, parameterized via declared `<api>` properties.
 * Description: Immutable interfaces for Component definitions and ComponentProp
 *              declarations used during component expansion and argument validation.
 *
 * Exports:
 * - Component: Reusable pure-XML component descriptor model
 * - ComponentProp: Parameter declaration accepted by a component
 */

import type { SourceLocation } from './source-location.js';
import type { PropType } from './widget-manifest.js';
import type { View } from './screen.js';

/**
 * Reusable component descriptor model parsed from `components/*\/*.xml` (§6.3).
 */
export interface Component {
  /** Component identifier, matching its containing directory name. */
  readonly name: string;
  /** Declared properties accepted by this component. */
  readonly api: readonly ComponentProp[];
  /** Subtree template instantiated upon component expansion. */
  readonly view: View;
  /** Source location where this component was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Parameter property accepted by a component (§6.3).
 */
export interface ComponentProp {
  /** Property attribute name. */
  readonly name: string;
  /** Data type of the property value. */
  readonly type: PropType;
  /** Optional default value when omitted at invocation. */
  readonly default?: string;
  /** If true, the caller must supply this property. */
  readonly required?: boolean;
  /** Source location where this property was declared. */
  readonly loc?: SourceLocation;
}
