/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-geometry.ts
 * Purpose: Pass 6 — Validates element geometry, layout anchor constraints,
 *          and display bounding box limits (§7.2, §15.1).
 * Description: Identifies over-constrained anchors (when x, width, and right are all
 *              simultaneously specified) and detects literal element bounds that
 *              exceed the catalogued display resolution. Best-effort evaluation for
 *              literal integer coordinates.
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

function walkNodes(
  children: readonly WidgetNodeChild[],
  visitor: (node: WidgetNode) => void,
): void {
  for (const child of children) {
    if ('tag' in child && typeof child.tag === 'string') {
      visitor(child);
      if (child.children && child.children.length > 0) {
        walkNodes(child.children, visitor);
      }
    }
  }
}

function isLiteralInteger(val: unknown): val is string {
  if (typeof val !== 'string') {
    return false;
  }
  return /^-?\d+$/.test(val.trim());
}

/**
 * Validates layout geometry constraints and target display boundary limits.
 */
export function validateGeometry(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { project, screens, catalogue } = input;

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

  for (const screen of screens ?? []) {
    walkNodes(screen.view?.children ?? [], (node) => {
      const { x, y, width, height, right, bottom } = node.attributes;

      // 1. Overconstrained horizontal anchors: x + width + right
      if (x !== undefined && width !== undefined && right !== undefined) {
        const loc =
          node.attributeLocs?.right ??
          node.attributeLocs?.width ??
          node.attributeLocs?.x ??
          node.loc;
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

      // 3. Out-of-bounds checks against target display dimensions
      if (displayWidth !== undefined) {
        if (isLiteralInteger(x) && isLiteralInteger(width)) {
          const xVal = parseInt(x, 10);
          const wVal = parseInt(width, 10);
          const rightEdge = xVal + wVal;

          if (xVal < 0) {
            diagnostics.push(
              createGeomDiagnostic(
                DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
                `Element '<${node.tag}>' extends to x=${xVal}, display is ${displayWidth}px wide (0..${displayWidth - 1}).`,
                node.attributeLocs?.x ?? node.loc,
                x,
              ),
            );
          } else if (rightEdge > displayWidth) {
            diagnostics.push(
              createGeomDiagnostic(
                DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
                `Element '<${node.tag}>' extends to x=${rightEdge}, display is ${displayWidth}px wide (0..${displayWidth - 1}).`,
                node.attributeLocs?.width ?? node.attributeLocs?.x ?? node.loc,
                width,
              ),
            );
          }
        }
      }

      if (displayHeight !== undefined) {
        if (isLiteralInteger(y) && isLiteralInteger(height)) {
          const yVal = parseInt(y, 10);
          const hVal = parseInt(height, 10);
          const bottomEdge = yVal + hVal;

          if (yVal < 0) {
            diagnostics.push(
              createGeomDiagnostic(
                DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
                `Element '<${node.tag}>' extends to y=${yVal}, display is ${displayHeight}px high (0..${displayHeight - 1}).`,
                node.attributeLocs?.y ?? node.loc,
                y,
              ),
            );
          } else if (bottomEdge > displayHeight) {
            diagnostics.push(
              createGeomDiagnostic(
                DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
                `Element '<${node.tag}>' extends to y=${bottomEdge}, display is ${displayHeight}px high (0..${displayHeight - 1}).`,
                node.attributeLocs?.height ?? node.attributeLocs?.y ?? node.loc,
                height,
              ),
            );
          }
        }
      }
    });
  }

  return diagnostics;
}
