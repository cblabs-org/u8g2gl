/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/field-types.ts
 * Purpose: The one convention for the C++ types a `<data>` row's fields reach
 *          the widget's access method as (§9.2). The editor's fill thunk
 *          passes them (`editor-registry.ts`) and the generated collection
 *          facade declares them as `add_row()`'s parameters (`facades.ts`), so
 *          the two call the same method the same way and overload resolution
 *          cannot differ between the canvas and the device.
 * Description: A single field of each type, and a repeated (string) field as
 *              a pointer to its texts and their count.
 *
 * Exports:
 * - FIELD_ARGUMENT_TYPES:    The C++ type each single field type is passed as
 * - REPEATED_ARGUMENT_TYPES: The two C++ types a repeated field is passed as
 */

import type { PropType } from '../../schema/widget-manifest.js';

/** The C++ type each single field type is passed as. */
export const FIELD_ARGUMENT_TYPES: Readonly<Partial<Record<PropType, string>>> = {
  int: 'int32_t',
  bool: 'bool',
  string: 'const char*',
  // A data enum is run-time data, so it reaches the method as its text, which
  // the widget interprets (`add_carriage(…, const char* class_type, …)`).
  enum: 'const char*',
};

/** A repeated field: its texts, then how many (`add_row(const char* const* cells, size_t n)`). */
export const REPEATED_ARGUMENT_TYPES: readonly [string, string] = ['const char* const*', 'size_t'];
