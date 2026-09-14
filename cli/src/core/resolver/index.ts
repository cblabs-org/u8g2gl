/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/index.ts
 * Purpose: Public entry point for the resolver — coordinate arithmetic and
 *          anchors to literal integers (§7.2, §13.11 step 3). One module the
 *          validator, `generate` and, later, the editor all use.
 * Description: Re-exports expression.ts (the evaluator) and resolve.ts (anchors
 *              and the resolved model). Isomorphic.
 *
 * Exports:
 * - INT32_MIN, INT32_MAX, BUILTIN_CONSTANTS, ContainerSize, EvaluationScope,
 *   ExpressionSite, Evaluation, buildConstantTable, evaluateExpression (expression.ts)
 * - Provenance, ResolvedCoordinate, ResolvedGeometry, Container, ResolvedElement,
 *   ResolvedScreen, ResolverContext, ResolveInput, ResolveResult, isCentringOn,
 *   findTargetDisplay, createResolverContext, displayContainer, resolveElements,
 *   resolveScreens (resolve.ts)
 */

export {
  INT32_MIN,
  INT32_MAX,
  BUILTIN_CONSTANTS,
  buildConstantTable,
  evaluateExpression,
  type ContainerSize,
  type EvaluationScope,
  type ExpressionSite,
  type Evaluation,
} from './expression.js';
export {
  isCentringOn,
  findTargetDisplay,
  createResolverContext,
  displayContainer,
  resolveElements,
  resolveScreens,
  type Provenance,
  type ResolvedCoordinate,
  type ResolvedGeometry,
  type Container,
  type ResolvedElement,
  type ResolvedScreen,
  type ResolverContext,
  type ResolveInput,
  type ResolveResult,
} from './resolve.js';
