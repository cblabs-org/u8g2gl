/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/pipeline.ts
 * Purpose: §13.11's step 3, run **once** per command. Composite expansion and
 *          geometry resolution are not cheap, but the reason this module exists
 *          is correctness rather than cost: when four validator passes each
 *          expanded the document for themselves and `generate` resolved a
 *          *different*, unexpanded tree (PR-04 WO7 F2/F3, WO7b 1/7), nothing
 *          guaranteed they were all judging the same model. WO8b's realisation
 *          consumes one expanded, fully resolved, collision-checked model, and
 *          this is where that model is built.
 * Description: Holds one expansion and one resolution for a document, each
 *              computed on first use and then reused. The expansion is the tree
 *              every pass walks; the resolution is that tree's geometry against
 *              one display — the target `generate` builds, or the one `validate`
 *              checks — so `validate` and `generate` cannot disagree about where
 *              an element is.
 *
 *              Resolution diagnostics are kept **paired with the node they are
 *              about** rather than annotated here, because only the geometry
 *              pass knows how to place one: a diagnostic inside a composite
 *              instance names the instance, unless the template already said the
 *              same thing word for word. Keeping the pair lets the resolution be
 *              shared without moving that judgement out of Pass 6.
 *
 *              Isomorphic, and deterministic: document order throughout, and the
 *              node index is a lookup that is never iterated.
 *
 * Exports:
 * - RaisedDiagnostic:      One resolution diagnostic and the node it is about
 * - PipelineResolution:    The expanded tree's geometry, and what resolving it raised
 * - ScreenPipeline:        One document's expansion and resolution, each computed once
 * - PipelineInput:         What building a pipeline needs
 * - createScreenPipeline(): Build one
 */

import type { Diagnostic } from '../schema/diagnostic.js';
import type { DisplayRecord } from '../schema/display-record.js';
import type { Globals } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { WidgetNode } from '../schema/widget-node.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import { expandScreens, walkExpanded, type ExpandedElement, type ExpansionResult } from './expand.js';
import {
  createResolverContext,
  displayContainer,
  resolveElements,
  type ResolvedScreen,
  type ResolverContext,
} from './resolve.js';

/**
 * One diagnostic raised while resolving, and the element it is about — enough
 * for a caller to attach an instantiation chain, or to drop it as something a
 * composite's template already reported.
 */
export interface RaisedDiagnostic {
  readonly node: WidgetNode;
  readonly diagnostic: Diagnostic;
}

/** The expanded tree's geometry against one display. */
export interface PipelineResolution {
  /** One per expanded screen, in the same order. */
  readonly screens: readonly ResolvedScreen[];
  /** What resolution raised, in document order, each with its node. */
  readonly raised: readonly RaisedDiagnostic[];
}

/**
 * One document's expansion and resolution, each computed at most once however
 * many passes ask for it.
 */
export interface ScreenPipeline {
  /** Constants, registry and display shared by this resolution. */
  readonly context: ResolverContext;
  /** The screens with every composite instance expanded (§13.6 steps 1–3). */
  readonly expansion: ExpansionResult;
  /** That tree's geometry, resolved against the display (§7.2, [D-7]). */
  readonly resolution: PipelineResolution;
  /**
   * The expanded element a resolved node came from — its source location,
   * instantiation chain and arguments. A lookup only; nothing iterates it, so
   * its order never reaches output.
   */
  expandedOf(node: WidgetNode): ExpandedElement | undefined;
}

/** Everything {@link createScreenPipeline} needs. */
export interface PipelineInput {
  readonly globals: Globals;
  readonly screens: readonly Screen[];
  readonly manifests: ManifestRegistry;
  /**
   * The display to resolve against — the selected target's catalogue record.
   * Absent when the target has no record, or the project declares no target:
   * `#screen_*` and screen-level anchors then stay deferred rather than guessed,
   * and Pass 3 reports the display.
   */
  readonly display?: DisplayRecord;
}

/**
 * @brief Builds a pipeline over one document.
 *
 * Nothing is computed here. The expansion runs when a pass first reads
 * {@link ScreenPipeline.expansion}, the resolution when one first reads
 * {@link ScreenPipeline.resolution}, and each is then reused — so a caller that
 * needs only the expanded tree never pays for geometry, and no caller can
 * accidentally produce a second, subtly different model.
 *
 * A pipeline is built for **one display**. Sharing one across two targets would
 * be a defect, not a saving: `generate` builds its own for the target it is
 * generating, and hands that same one to validation.
 *
 * @param input Globals, screens, the registry and the target's display record.
 * @return The pipeline.
 */
export function createScreenPipeline(input: PipelineInput): ScreenPipeline {
  const context = createResolverContext(input.globals, input.manifests, input.display);

  let expansion: ExpansionResult | undefined;
  let resolution: PipelineResolution | undefined;
  let index: Map<WidgetNode, ExpandedElement> | undefined;

  // expandedScreens
  // The one expansion, computed on first use (§13.6 steps 1–3).
  const expandedScreens = (): ExpansionResult => {
    expansion ??= expandScreens({ globals: input.globals, screens: input.screens, manifests: input.manifests });
    return expansion;
  };

  // resolveExpanded
  // The one resolution of that tree, computed on first use. Each diagnostic is
  // captured with its node and dropped from the resolver's own list, so the
  // caller places it (see the file header).
  const resolveExpanded = (): PipelineResolution => {
    if (resolution !== undefined) {
      return resolution;
    }
    const container = displayContainer(context);
    const raised: RaisedDiagnostic[] = [];
    const screens = expandedScreens().screens.map((expanded): ResolvedScreen => {
      const resolved = resolveElements(
        expanded.elements.map((element) => element.node),
        container,
        context,
        (node, diagnostic) => {
          raised.push({ node, diagnostic });
          return undefined;
        },
      );
      return { screen: expanded.screen, container, elements: resolved.elements };
    });
    resolution = { screens, raised };
    return resolution;
  };

  return {
    context,
    get expansion() {
      return expandedScreens();
    },
    get resolution() {
      return resolveExpanded();
    },
    expandedOf(node) {
      if (index === undefined) {
        index = new Map<WidgetNode, ExpandedElement>();
        for (const screen of expandedScreens().screens) {
          walkExpanded(screen.elements, (element) => index?.set(element.node, element));
        }
      }
      return index.get(node);
    },
  };
}
