/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/data/catalogue.ts
 * Purpose: Pre-built U8G2 display catalogue compiled from U8G2 2.36.18 (§5.2, [D-14]).
 * Description: Exports CATALOGUE as a strongly typed, immutable array of DisplayRecord
 *              for isomorphic queries in both Node and browser environments.
 *
 * Exports:
 * - CATALOGUE: Complete immutable list of supported full-buffer display records
 */

import catalogueData from './catalogue.json' with { type: 'json' };
import type { DisplayRecord } from '../core/schema/display-record.js';

export const CATALOGUE: readonly DisplayRecord[] =
  catalogueData as unknown as readonly DisplayRecord[];
