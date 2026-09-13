/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/component.ts
 * Purpose: Defines the document model for composite elements — a `<component>`
 *          whose body is a `<view>` of other elements (§6.4, [D-18]).
 * Description: [D-18] removed the separate `components/` tier as an authoring
 *              *category*: a composite is conceptually just a `WidgetManifest`
 *              whose `<api>` carries a `view`, and `widget-manifest.ts` now
 *              declares that `view?` field for exactly this reason. `Component`
 *              stays a distinct interface here rather than becoming a literal
 *              `WidgetManifest` alias for one specific, disclosed reason:
 *              `WidgetManifest.api` is an `ApiBlock` (props + bindings +
 *              elements), while `validate-identifiers.ts`,
 *              `validate-references.ts`, `validate-schema.ts` and
 *              `validate-widget-props.ts` — all reserved for WO6 by the
 *              pr-3r-remediation decomposition, out of this work order's
 *              Strict Boundary Box — read a composite's `.api` as the bare
 *              property array it has always been. Wrapping it in `ApiBlock`
 *              here is the structurally complete final state, but doing so
 *              is also a breaking change only WO6 is authorized to absorb.
 *              `ComponentProp` receives the real merge WO5 was scoped for: it
 *              is retired outright in favour of `PropDef`, so a composite prop
 *              now carries every field a widget prop does, `help` included —
 *              see the WO5 Completion Report for the full account.
 *
 * Exports:
 * - Component: Composite element descriptor model (name, api, view)
 * - ComponentProp: @deprecated alias for PropDef — see widget-manifest.ts
 */

import type { SourceLocation } from './source-location.js';
import type { PropDef } from './widget-manifest.js';
import type { View } from './screen.js';

/**
 * Composite element descriptor parsed from a `<component>` document (§6.3, §6.4).
 *
 * A composite is, conceptually, a `WidgetManifest` whose `<api>` carries a
 * `view` ([D-18]) — see the file header for why this is not (yet) a literal
 * alias of `WidgetManifest`.
 */
export interface Component {
  /** Component identifier, matching its containing directory name. */
  readonly name: string;
  /** Declared properties accepted by this component. */
  readonly api: readonly PropDef[];
  /** Subtree template instantiated upon component expansion. */
  readonly view: View;
  /** Source location where this component was declared. */
  readonly loc?: SourceLocation;
}

/**
 * @deprecated Alias for {@link PropDef}. The pre-[D-18] `ComponentProp` had no
 * `help` field, so a composite's props could carry no description text; WO5
 * retired the type in favour of `PropDef`, which already had one.
 */
export type ComponentProp = PropDef;
