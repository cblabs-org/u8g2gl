/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/index.ts
 * Purpose: Public entry point for the resolver — §13.11 step 3: composite
 *          expansion, identifier mangling, and coordinate arithmetic and anchors
 *          to literal integers (§7.2, §13.4, §13.6). One module the validator,
 *          `generate` and, later, the editor all use.
 * Description: Re-exports expression.ts (the evaluator), resolve.ts (anchors and
 *              the resolved model), expand.ts (composite expansion), mangle.ts
 *              (§13.4 identifiers) and provenance.ts (instantiation chains).
 *              Isomorphic.
 *
 * Exports:
 * - INT32_MIN, INT32_MAX, BUILTIN_CONSTANTS, ContainerSize, EvaluationScope,
 *   ExpressionSite, Evaluation, buildConstantTable, evaluateExpression (expression.ts)
 * - Provenance, ResolvedCoordinate, ResolvedGeometry, Container, ResolvedElement,
 *   ResolvedScreen, ResolverContext, ResolveInput, ResolveResult, DiagnosticAnnotator,
 *   isCentringOn, findTargetDisplay, createResolverContext, displayContainer,
 *   resolveElements, resolveScreens (resolve.ts)
 * - InstantiationSite, formatLocation, formatInstantiation, withInstantiation (provenance.ts)
 * - PropArgument, ExpandedElement, ExpandedScreen, ExpansionInput, ExpansionResult,
 *   expandScreens, walkExpanded (expand.ts)
 * - RESERVED_IDENTIFIER_PREFIXES, CPP_KEYWORDS, SCREEN_FUNCTIONS, SCREEN_TABLES,
 *   IdentifierKind, IdentifierSource, MangledIdentifier, ScreenIdentifiers,
 *   IdentifierTable, MangleInput, the per-kind spelling helpers and
 *   mangleIdentifiers (mangle.ts)
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
  type DiagnosticAnnotator,
} from './resolve.js';
export {
  formatLocation,
  formatInstantiation,
  withInstantiation,
  type InstantiationSite,
} from './provenance.js';
export {
  expandScreens,
  walkExpanded,
  type PropArgument,
  type ExpandedElement,
  type ExpandedScreen,
  type ExpansionInput,
  type ExpansionResult,
} from './expand.js';
export {
  RESERVED_IDENTIFIER_PREFIXES,
  CPP_KEYWORDS,
  SCREEN_FUNCTIONS,
  SCREEN_TABLES,
  screenFunctionIdentifier,
  screenTableIdentifier,
  subjectIdentifier,
  subjectSetterIdentifier,
  fontIdentifier,
  imageIdentifier,
  styleIdentifier,
  childIdentifier,
  mangleIdentifiers,
  type IdentifierKind,
  type IdentifierSource,
  type MangledIdentifier,
  type ScreenIdentifiers,
  type IdentifierTable,
  type MangleInput,
} from './mangle.js';
