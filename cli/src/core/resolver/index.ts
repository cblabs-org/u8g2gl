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
 * - INT32_MIN, INT32_MAX, INT16_MIN, INT16_MAX, integerLiteralValue, BUILTIN_CONSTANTS,
 *   ContainerSize, EvaluationScope, ExpressionSite, Evaluation, buildConstantTable,
 *   evaluateExpression (expression.ts)
 * - Provenance, ResolvedCoordinate, ResolvedGeometry, Container, DeferredCoordinate,
 *   AxisOutcome, ResolvedExtra, ResolvedElement, ResolvedScreen, ResolverContext, ResolveInput,
 *   ResolveResult, DiagnosticAnnotator, isCentringOn, isRectangular, findTargetDisplay,
 *   createResolverContext, displayContainer,
 *   resolveElements, resolveScreens (resolve.ts)
 * - InstantiationSite, formatLocation, formatInstantiation, withInstantiation (provenance.ts)
 * - PropArgument, Substitution, ExpandedElement, ExpandedScreen, ExpansionInput, ExpansionResult,
 *   expandScreens, walkExpanded, STYLE_CHILD_VALUE (expand.ts)
 * - RaisedDiagnostic, PipelineResolution, ScreenPipeline, PipelineInput,
 *   createScreenPipeline (pipeline.ts) — one expansion and one resolution per command
 * - RESERVED_IDENTIFIER_PREFIXES, CPP_KEYWORDS, SCREEN_FUNCTIONS, SCREEN_TABLES,
 *   IdentifierKind, IdentifierSource, MangledIdentifier, ScreenIdentifiers,
 *   IdentifierTable, MangleInput, the per-kind spelling helpers and
 *   mangleIdentifiers (mangle.ts)
 */

export {
  INT32_MIN,
  INT32_MAX,
  INT16_MIN,
  INT16_MAX,
  integerLiteralValue,
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
  isRectangular,
  findTargetDisplay,
  createResolverContext,
  displayContainer,
  resolveElements,
  resolveScreens,
  type Provenance,
  type ResolvedCoordinate,
  type ResolvedGeometry,
  type Container,
  type DeferredCoordinate,
  type AxisOutcome,
  type ResolvedExtra,
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
  STYLE_CHILD_VALUE,
  type PropArgument,
  type Substitution,
  type ExpandedElement,
  type ExpandedScreen,
  type ExpansionInput,
  type ExpansionResult,
} from './expand.js';
export {
  createScreenPipeline,
  type RaisedDiagnostic,
  type PipelineResolution,
  type ScreenPipeline,
  type PipelineInput,
} from './pipeline.js';
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
