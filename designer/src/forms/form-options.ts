/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-options.ts
 * Purpose: What a project-file form's reference fields offer, and the facts
 *          line every field's ⓘ shows, apart from the controls so the
 *          controller and the tests can use them without React.
 * Description: Plain data and one pure function.
 *
 * Exports:
 * - FormOptions:    What reference fields offer
 * - NO_OPTIONS:     Offers nothing
 * - fieldFacts():   A field's facts line: type, values, default
 */

import type { VocabularyAttribute } from '@u8g2gl/core/schema/index.js';

/** What a reference field offers: the project's declarations, files and the catalogue's setups. */
export interface FormOptions {
  readonly fonts: readonly string[];
  readonly subjects: readonly string[];
  readonly styles: readonly string[];
  readonly images: readonly string[];
  readonly paths: readonly string[];
  readonly setups: readonly string[];
}

/** Offers nothing. */
export const NO_OPTIONS: FormOptions = { fonts: [], subjects: [], styles: [], images: [], paths: [], setups: [] };

/** @brief A field's facts line, as the property panel's tooltip gives one: type, values, default. */
export function fieldFacts(attribute: VocabularyAttribute): string {
  const type = attribute.type;
  const parts: string[] = [];
  if (type.kind === 'enum') parts.push(`enum · ${type.values.join(' | ')}`);
  else if (type.kind === 'reference') parts.push(type.to === 'display-setup' ? 'display setup' : type.to);
  else parts.push(type.kind);
  if (attribute.required) parts.push('required');
  if (attribute.default !== undefined) parts.push(`default ${attribute.default}`);
  if (attribute.busFamilies !== undefined) parts.push(`bus ${attribute.busFamilies.join(' | ')}`);
  return parts.join(' · ');
}
