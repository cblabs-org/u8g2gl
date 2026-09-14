/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/index.ts
 * Purpose: Public entry point for the isomorphic U8G2GL validator API (§15.1).
 * Description: Re-exports the validate function and its input/result types, as well
 *              as individual validation pass functions for fine-grained testing.
 *
 * Exports:
 * - validate: Main multi-pass validation function
 * - ValidateInput: Parameter contract for validation
 * - ValidateResult: Return contract containing diagnostics and counts
 * - Individual pass functions: validateSchema, validateReferences, validateDisplay,
 *   validateWidgetProps, validateTypes, validateGeometry, validateIdentifiers
 */

export { validate, type ValidateInput, type ValidateResult } from './validate.js';
export { validateSchema } from './validate-schema.js';
export { validateReferences } from './validate-references.js';
export { validateDisplay } from './validate-display.js';
export { validateWidgetProps } from './validate-widget-props.js';
export { validateTypes } from './validate-types.js';
export { validateGeometry } from './validate-geometry.js';
export { validateIdentifiers } from './validate-identifiers.js';
export {
  validateNotYetSupported,
  DEFAULT_NOT_YET_SUPPORTED_POLICY,
  type NotYetSupportedPolicy,
} from './validate-not-yet-supported.js';
