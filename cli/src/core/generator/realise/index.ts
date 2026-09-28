/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/realise/index.ts
 * Purpose: Public entry point for realisation — §13.5's per-instance decision,
 *          §13.3's flattening, and [D-21]'s generated capacities. One module
 *          `generate()` consumes today and both emitters (WO10 firmware, WO11
 *          editor) consume tomorrow, so neither re-derives what an element
 *          became or how many observers a subject needs.
 * Description: Re-exports model.ts (the shapes), realise.ts (the analysis) and
 *              capacities.ts (the counting). Isomorphic.
 *
 * Exports:
 * - U8G2GL_NO_PARENT, MAX_OBJECTS_PER_SCREEN, REALISATION_REASONS,
 *   RealisationReason, Realisation, RealisedBinding, VisibilityTerm,
 *   RealisedElement, DrawStep, RealisedScreen, RealisationResult (model.ts)
 * - realiseScreens, walkRealised, RealiseInput (realise.ts)
 * - computeCapacities, Capacities, CapacitiesInput, SubjectObservers (capacities.ts)
 */

export {
  U8G2GL_NO_PARENT,
  MAX_OBJECTS_PER_SCREEN,
  REALISATION_REASONS,
  type RealisationReason,
  type Realisation,
  type RealisedBinding,
  type VisibilityTerm,
  type RealisedElement,
  type DrawStep,
  type RealisedScreen,
  type RealisationResult,
} from './model.js';
export { realiseScreens, walkRealised, type RealiseInput } from './realise.js';
export {
  computeCapacities,
  type Capacities,
  type CapacitiesInput,
  type SubjectObservers,
} from './capacities.js';
