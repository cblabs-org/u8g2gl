/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-geometry.ts
 * Purpose: Pass 6 — Validates element geometry, layout anchor constraints,
 *          and containing-element bounding box limits (§7.2, §15.1, [D-20]).
 * Description: Identifies over-constrained anchors (when x, width, and right are all
 *              simultaneously specified) and detects literal element bounds that
 *              exceed their containing element's resolved size. Per [D-20], anchors
 *              resolve against the containing element at build time — the display is
 *              the reference only for a screen's top-level children; a node nested
 *              inside another node (a plain container or a composite's own template)
 *              is checked against that immediate parent's own literal bounds instead.
 *              Best-effort evaluation for literal integer coordinates.
 *
 * Exports:
 * - validateGeometry(input): Runs Pass 6 geometry and bounding validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { ValidateInput } from './validate.js';

function createGeomDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText?: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(offendingText ? { offendingText } : {}),
  };
}

function isLiteralInteger(val: unknown): val is string {
  if (typeof val !== 'string') {
    return false;
  }
  return /^-?\d+$/.test(val.trim());
}

/**
 * The resolved size of the element a node's geometry is measured against
 * ([D-20]). `label` names it in diagnostics: "display" at screen level, or
 * the containing element's own tag once nested.
 */
interface ContainingBounds {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Checks one node's own anchors and bounds, then recurses into its children
 * with an updated containing-bounds context.
 *
 * The container passed in is *this* node's parent; the container passed to
 * this node's own children is a new one derived from this node's own literal
 * `width`/`height`, if it declares them. A node with no resolvable size of
 * its own (a symbolic expression, or none at all) contributes no container,
 * so bounds checks are silently skipped for its descendants — the same
 * best-effort behaviour §7.2 already applies to a single node's own bounds.
 */
function checkNodes(
  nodes: readonly WidgetNodeChild[],
  container: ContainingBounds | undefined,
  diagnostics: Diagnostic[],
): void {
  for (const child of nodes) {
    if (!('tag' in child) || typeof child.tag !== 'string') {
      continue;
    }
    const node: WidgetNode = child;
    const { x, y, width, height, right, bottom } = node.attributes;

    // 1. Overconstrained horizontal anchors: x + width + right
    if (x !== undefined && width !== undefined && right !== undefined) {
      const loc =
        node.attributeLocs?.right ?? node.attributeLocs?.width ?? node.attributeLocs?.x ?? node.loc;
      diagnostics.push(
        createGeomDiagnostic(
          DIAGNOSTIC_CODES.OVERCONSTRAINED,
          `Element '<${node.tag}>' has over-constrained horizontal anchors: 'x', 'width', and 'right' are all specified.`,
          loc,
          'x, width, right',
        ),
      );
    }

    // 2. Overconstrained vertical anchors: y + height + bottom
    if (y !== undefined && height !== undefined && bottom !== undefined) {
      const loc =
        node.attributeLocs?.bottom ??
        node.attributeLocs?.height ??
        node.attributeLocs?.y ??
        node.loc;
      diagnostics.push(
        createGeomDiagnostic(
          DIAGNOSTIC_CODES.OVERCONSTRAINED,
          `Element '<${node.tag}>' has over-constrained vertical anchors: 'y', 'height', and 'bottom' are all specified.`,
          loc,
          'y, height, bottom',
        ),
      );
    }

    // 3. Out-of-bounds checks against the containing element ([D-20]) — the
    // display only when `container` is the screen-level one supplied by the
    // caller; a parent node's own resolved size otherwise.
    if (container !== undefined) {
      if (isLiteralInteger(x) && isLiteralInteger(width)) {
        const xVal = parseInt(x, 10);
        const wVal = parseInt(width, 10);
        const rightEdge = xVal + wVal;

        if (xVal < 0) {
          diagnostics.push(
            createGeomDiagnostic(
              DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
              `Element '<${node.tag}>' extends to x=${xVal}, ${container.label} is ${container.width}px wide (0..${container.width - 1}).`,
              node.attributeLocs?.x ?? node.loc,
              x,
            ),
          );
        } else if (rightEdge > container.width) {
          diagnostics.push(
            createGeomDiagnostic(
              DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
              `Element '<${node.tag}>' extends to x=${rightEdge}, ${container.label} is ${container.width}px wide (0..${container.width - 1}).`,
              node.attributeLocs?.width ?? node.attributeLocs?.x ?? node.loc,
              width,
            ),
          );
        }
      }

      if (isLiteralInteger(y) && isLiteralInteger(height)) {
        const yVal = parseInt(y, 10);
        const hVal = parseInt(height, 10);
        const bottomEdge = yVal + hVal;

        if (yVal < 0) {
          diagnostics.push(
            createGeomDiagnostic(
              DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
              `Element '<${node.tag}>' extends to y=${yVal}, ${container.label} is ${container.height}px high (0..${container.height - 1}).`,
              node.attributeLocs?.y ?? node.loc,
              y,
            ),
          );
        } else if (bottomEdge > container.height) {
          diagnostics.push(
            createGeomDiagnostic(
              DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
              `Element '<${node.tag}>' extends to y=${bottomEdge}, ${container.label} is ${container.height}px high (0..${container.height - 1}).`,
              node.attributeLocs?.height ?? node.attributeLocs?.y ?? node.loc,
              height,
            ),
          );
        }
      }
    }

    // This node becomes the containing element for its own children, if and
    // only if its own size is a resolvable literal — otherwise its
    // descendants get no absolute bounds check, the same best-effort
    // deferral applied to this node's own unresolved bounds.
    let childContainer: ContainingBounds | undefined;
    if (isLiteralInteger(width) && isLiteralInteger(height)) {
      childContainer = {
        label: `containing element '<${node.tag}>'`,
        width: parseInt(width, 10),
        height: parseInt(height, 10),
      };
    }

    if (node.children && node.children.length > 0) {
      checkNodes(node.children, childContainer, diagnostics);
    }
  }
}

/**
 * Validates layout geometry constraints and containing-element boundary limits.
 */
export function validateGeometry(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { project, screens, catalogue, manifests } = input;

  // Resolve target display dimensions if available
  let displayWidth: number | undefined;
  let displayHeight: number | undefined;

  if (project?.targets && project.targets.length > 0 && catalogue) {
    const firstTarget = project.targets[0];
    if (firstTarget?.setup) {
      const record = catalogue.find((d) => d.setup === firstTarget.setup);
      if (record) {
        displayWidth = record.width;
        displayHeight = record.height;
      }
    }
  }

  const displayContainer: ContainingBounds | undefined =
    displayWidth !== undefined && displayHeight !== undefined
      ? { label: 'display', width: displayWidth, height: displayHeight }
      : undefined;

  // Screen top-level children are measured against the display ([D-20]);
  // anything nested measures against its immediate parent's own bounds.
  for (const screen of screens ?? []) {
    checkNodes(screen.view?.children ?? [], displayContainer, diagnostics);
  }

  // A composite's own template has no display to check against — it is
  // instantiated at whatever size its caller gives it, which this manifest
  // does not know. Its top-level children therefore get no absolute bounds
  // check, but anything nested inside one of them still measures against
  // that element's own literal bounds, exactly as it would inside a screen.
  for (const component of manifests.declaredComposites) {
    checkNodes(component.view?.children ?? [], undefined, diagnostics);
  }

  return diagnostics;
}
