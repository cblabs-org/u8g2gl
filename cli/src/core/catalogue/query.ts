/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/catalogue/query.ts
 * Purpose: Isomorphic query engine for the U8G2 display catalogue (§5.2, [D-14]).
 *          Implements the four query modes: identify, source, compare, and enumerate.
 * Description: Pure in-memory queries over DisplayRecord arrays. Supports free-text
 *              tokenized search with fuzzy edit-distance fallback, constraint-based
 *              filtering with board RAM classification, difference-only record comparison,
 *              and catalogue enumeration. Runs in both Node.js and browser environments.
 *
 * Exports:
 * - FitsTarget: Target microcontroller RAM budget specification
 * - RamClassification: Classification tier ('comfortable' | 'significant' | 'check')
 * - SourceConstraints: Query filters for display sourcing
 * - SourcedDisplay: Sourced display record paired with optional RAM classification
 * - SourceResult: Complete result of a source query
 * - IdentifyResult: Result of free-text display identification with notes and suggestions
 * - CompareResult: Difference-focused comparison between multiple display setups
 * - identifyDisplay(catalogue, query): Identify a physical device or part from free text
 * - sourceDisplay(catalogue, constraints): Filter and rank displays meeting design constraints
 * - compareDisplays(catalogue, setups): Compare multiple display configurations
 * - enumerateDisplays(catalogue): Returns the complete catalogue of displays
 */

import type { BusFamily, DisplayRecord } from '../schema/display-record.js';
import { findClosest } from './edit-distance.js';

/**
 * Target microcontroller board specification for memory headroom evaluation (§5.2, §18).
 */
export interface FitsTarget {
  /** Total internal SRAM capacity in bytes. */
  readonly boardRam: number;
}

/**
 * Qualitative classification of display framebuffer impact on board SRAM (§5.2).
 * - 'comfortable': < 10% of board RAM
 * - 'significant': 10% - 25% of board RAM
 * - 'check': > 25% of board RAM
 */
export type RamClassification = 'comfortable' | 'significant' | 'check';

/**
 * Filter constraints for the source query mode (§5.2).
 */
export interface SourceConstraints {
  /** Minimum usable display width in pixels. */
  readonly minWidth?: number;
  /** Maximum usable display width in pixels. */
  readonly maxWidth?: number;
  /** Exact required display height in pixels. */
  readonly height?: number;
  /** Normalized communication bus family. */
  readonly bus?: BusFamily;
  /** Maximum acceptable static framebuffer size in bytes. */
  readonly maxFramebuffer?: number;
  /** Prefix match for controller family (e.g. "SSD" matches SSD1306, SSD1322). */
  readonly controllerFamily?: string;
  /** Target hardware platform for RAM headroom budgeting. */
  readonly fitsTarget?: FitsTarget;
}

/**
 * A display record matched by sourceDisplay, annotated with RAM evaluation.
 */
export interface SourcedDisplay {
  readonly record: DisplayRecord;
  readonly classification?: RamClassification;
  readonly ramUsagePercent?: number;
}

/**
 * Complete result of a sourceDisplay query.
 */
export interface SourceResult {
  readonly constraints: SourceConstraints;
  readonly matches: readonly SourcedDisplay[];
}

/**
 * Result of identifyDisplay free-text query.
 */
export interface IdentifyResult {
  /** Original search query. */
  readonly query: string;
  /** Ranked list of matched display records. */
  readonly matches: readonly DisplayRecord[];
  /** Helpful disambiguation notes for electrical variants and symptoms. */
  readonly notes: readonly string[];
  /** Actionable explanation if no matches were found. */
  readonly message?: string;
  /** Structured near-match suggestions for controllers or geometries. */
  readonly suggestions: readonly string[];
}

/**
 * Comparative breakdown of differing attributes across selected displays (§5.2).
 */
export interface CompareResult {
  /** Requested setup names. */
  readonly setups: readonly string[];
  /** Setup names that were not found in the catalogue. */
  readonly notFound: readonly string[];
  /** Found DisplayRecord entries corresponding to setups. */
  readonly records: readonly DisplayRecord[];
  /** Map of field names to values across records, containing only fields that differ. */
  readonly differences: Record<string, readonly unknown[]>;
}

/**
 * Noise tokens in free-text queries that should not penalize scoring.
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'inch',
  'in',
  'oled',
  'lcd',
  'display',
  'screen',
  'module',
  'panel',
]);

/**
 * @brief Tokenizes a free-text search query.
 *
 * Strips punctuation, isolates dimension patterns (e.g. 128x64), and normalizes casing.
 *
 * @param query Free-text input string.
 * @return Extracted uppercase tokens.
 */
function tokenizeQuery(query: string): string[] {
  return query
    .replace(/[,/]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * @brief Parses dimension strings like "128x64" or "128X64" into width and height numbers.
 *
 * @param token Candidate token.
 * @return Parsed width and height, or null if token is not a dimension specification.
 */
function parseGeometryToken(token: string): { width: number; height: number } | null {
  const match = token.match(/^(\d+)[xX](\d+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}

/**
 * @brief Mode (a): Identifies candidate displays from free-text descriptions (§5.2).
 *
 * Matches tokens against controller chip names, hardware variants, display geometry,
 * and bus interfaces. Employs fuzzy edit-distance matching for controller typos
 * and generates actionable diagnostic messages on query misses.
 *
 * @param catalogue Complete catalogue of displays.
 * @param query Free-text query string (e.g. "1.3 inch SH1106 128x64 i2c").
 * @return Ranked IdentifyResult with matches, notes, and suggestions.
 */
export function identifyDisplay(
  catalogue: readonly DisplayRecord[],
  query: string
): IdentifyResult {
  // --- Step 1: Collect known controllers and tokenize query ---
  const allControllers = Array.from(new Set(catalogue.map((d) => d.controller))).sort();
  const rawTokens = tokenizeQuery(query);
  const meaningfulTokens = rawTokens.filter((t) => !STOP_WORDS.has(t.toLowerCase()));

  // Extract explicit geometry if present in tokens
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;
  for (const token of meaningfulTokens) {
    const geom = parseGeometryToken(token);
    if (geom) {
      targetWidth = geom.width;
      targetHeight = geom.height;
      break;
    }
  }

  // Identify target bus family if mentioned
  let targetBusFamily: BusFamily | undefined;
  for (const token of meaningfulTokens) {
    const lower = token.toLowerCase();
    if (lower === 'i2c') {
      targetBusFamily = 'i2c';
    } else if (lower === 'spi') {
      targetBusFamily = 'spi';
    } else if (lower === 'parallel' || lower === '8080' || lower === '6800') {
      targetBusFamily = 'parallel';
    }
  }

  // Find exact or fuzzy controller matches
  let matchedController: string | undefined;
  let isFuzzyController = false;

  for (const token of meaningfulTokens) {
    const upper = token.toUpperCase();
    if (allControllers.includes(upper)) {
      matchedController = upper;
      break;
    }
  }

  if (!matchedController) {
    for (const token of meaningfulTokens) {
      // Avoid fuzzy matching dimensions or tiny tokens
      if (parseGeometryToken(token) || token.length < 4) {
        continue;
      }
      const closest = findClosest(token, allControllers, 2);
      if (closest[0] !== undefined) {
        matchedController = closest[0];
        isFuzzyController = true;
        break;
      }
    }
  }

  // --- Step 2: Check for controller supported with unsupported geometry ---
  if (matchedController && targetWidth !== undefined && targetHeight !== undefined) {
    const controllerRecords = catalogue.filter((d) => d.controller === matchedController);
    const hasGeometry = controllerRecords.some(
      (d) => d.width === targetWidth && d.height === targetHeight
    );

    if (!hasGeometry) {
      const geometries = Array.from(
        new Set(controllerRecords.map((d) => `${d.width}x${d.height}`))
      ).sort();

      return {
        query,
        matches: [],
        notes: [],
        message: `${matchedController} is supported at ${geometries.join(', ')}, but not at ${targetWidth}x${targetHeight}. Supported: ${geometries.join(', ')}`,
        suggestions: geometries,
      };
    }
  }

  // --- Step 3: Score records against query tokens ---
  interface ScoredRecord {
    readonly record: DisplayRecord;
    readonly score: number;
  }

  const scored: ScoredRecord[] = [];

  for (const record of catalogue) {
    let score = 0;

    // Controller scoring
    if (matchedController) {
      if (record.controller === matchedController) {
        score += isFuzzyController ? 70 : 100;
      }
    }

    // Geometry scoring
    if (targetWidth !== undefined && targetHeight !== undefined) {
      if (record.width === targetWidth && record.height === targetHeight) {
        score += 60;
      } else if (record.width === targetWidth) {
        score += 15;
      } else if (record.height === targetHeight) {
        score += 15;
      }
    }

    // Bus family scoring
    if (targetBusFamily && record.bus.family === targetBusFamily) {
      score += 30;
    }

    // Meaningful token matches in setup, variant, or bus raw
    for (const token of meaningfulTokens) {
      const upperToken = token.toUpperCase();

      // Variant token match
      if (record.variant.some((v) => v.toUpperCase() === upperToken)) {
        score += 25;
      }

      // Bus raw match
      if (record.bus.raw.toUpperCase().includes(upperToken)) {
        score += 20;
      }

      // Entire setup name substring
      if (record.setup.toUpperCase().includes(upperToken)) {
        score += 15;
      }
    }

    // Minimum relevance threshold
    const minimumThreshold = matchedController ? 60 : 30;
    if (score >= minimumThreshold) {
      scored.push({ record, score });
    }
  }

  // --- Step 3: Sort deterministically by score descending, then setup ascending ---
  scored.sort((first, second) => {
    if (first.score !== second.score) {
      return second.score - first.score;
    }
    return first.record.setup.localeCompare(second.record.setup);
  });

  const matches = scored.map((item) => item.record);

  // --- Step 4: Formulate notes and negative diagnostics ---
  const notes: string[] = [];
  const suggestions: string[] = [];
  let message: string | undefined;

  if (matches.length === 0) {
    // Negative result handling
    if (matchedController) {
      // Find what geometries are supported for this controller
      const geometries = Array.from(
        new Set(
          catalogue
            .filter((d) => d.controller === matchedController)
            .map((d) => `${d.width}x${d.height}`)
        )
      ).sort();

      if (targetWidth !== undefined && targetHeight !== undefined) {
        message = `${matchedController} is supported at ${geometries.join(', ')}, but not at ${targetWidth}x${targetHeight}. Supported: ${geometries.join(', ')}`;
        suggestions.push(...geometries);
      } else {
        message = `No matching configuration found for ${matchedController}. Supported geometries: ${geometries.join(', ')}`;
        suggestions.push(...geometries);
      }
    } else {
      // Controller not in U8G2 at all
      const candidateTokens = meaningfulTokens.filter(
        (t) => !parseGeometryToken(t) && t.length >= 3
      );

      for (const token of candidateTokens) {
        const closest = findClosest(token, allControllers, 3);
        if (closest.length > 0) {
          message = `No driver for ${token}. Closest family: ${closest.slice(0, 5).join(', ')}. Check the controller marking on the module.`;
          suggestions.push(...closest.slice(0, 5));
          break;
        }
      }

      if (!message) {
        message = `No matching displays found for "${query}".`;
      }
    }
  } else {
    // Check for electrical variant disambiguation (§5.2)
    const firstMatch = matches[0];
    if (firstMatch) {
      if (firstMatch.controller === 'SH1106' && firstMatch.width === 128 && firstMatch.height === 64) {
        notes.push(
          'SH1106 128x64 has 4 electrical variants. NONAME suits most generic modules. If the display is shifted horizontally by 2px, try VCOMH0.'
        );
      } else {
        // General disambiguation check across top matches
        const variantsInTop = new Set<string>();
        for (const m of matches.slice(0, 5)) {
          if (m.controller === firstMatch.controller && m.width === firstMatch.width) {
            for (const v of m.variant) {
              variantsInTop.add(v);
            }
          }
        }
        if (variantsInTop.size > 1) {
          notes.push(
            `Multiple variants found (${Array.from(variantsInTop).join(', ')}). Check default column shift (xOffset) or initialization if image is shifted or blank.`
          );
        }
      }
    }
  }

  return {
    query,
    matches,
    notes,
    ...(message ? { message } : {}),
    suggestions,
  };
}

/**
 * @brief Mode (b): Filters and sources displays satisfying design constraints (§5.2).
 *
 * Constrains displays by pixel geometry, bus interface, and memory budget.
 * When `fitsTarget` is provided, classifies static SRAM consumption against
 * internal MCU memory headroom.
 *
 * @param catalogue Complete catalogue of displays.
 * @param constraints Desired hardware constraints.
 * @return SourceResult containing matched displays and optional RAM classifications.
 */
export function sourceDisplay(
  catalogue: readonly DisplayRecord[],
  constraints: SourceConstraints
): SourceResult {
  // --- Step 1: Filter displays matching constraints ---
  const matches: SourcedDisplay[] = [];

  for (const record of catalogue) {
    if (constraints.minWidth !== undefined && record.width < constraints.minWidth) {
      continue;
    }
    if (constraints.maxWidth !== undefined && record.width > constraints.maxWidth) {
      continue;
    }
    if (constraints.height !== undefined && record.height !== constraints.height) {
      continue;
    }
    if (constraints.bus !== undefined && record.bus.family !== constraints.bus) {
      continue;
    }
    if (
      constraints.maxFramebuffer !== undefined &&
      record.framebufferBytes > constraints.maxFramebuffer
    ) {
      continue;
    }
    if (constraints.controllerFamily !== undefined) {
      const prefix = constraints.controllerFamily.toLowerCase();
      if (!record.controller.toLowerCase().startsWith(prefix)) {
        continue;
      }
    }

    // --- Step 2: Compute RAM headroom classification if target provided ---
    let classification: RamClassification | undefined;
    let ramUsagePercent: number | undefined;

    if (constraints.fitsTarget && constraints.fitsTarget.boardRam > 0) {
      ramUsagePercent = (record.framebufferBytes / constraints.fitsTarget.boardRam) * 100;
      if (ramUsagePercent < 10) {
        classification = 'comfortable';
      } else if (ramUsagePercent <= 25) {
        classification = 'significant';
      } else {
        classification = 'check';
      }
    }

    matches.push({
      record,
      ...(classification !== undefined ? { classification } : {}),
      ...(ramUsagePercent !== undefined ? { ramUsagePercent } : {}),
    });
  }

  return {
    constraints,
    matches,
  };
}

/**
 * @brief Mode (c): Compares two or more display setup configurations (§5.2).
 *
 * Discovers setup records and tabulates only those attributes that differ
 * across the selected displays (e.g. electrical variant, driver symbol, wiring mode).
 *
 * @param catalogue Complete catalogue of displays.
 * @param setups Array of U8G2 constructor class names to compare.
 * @return CompareResult showing differing fields and missing setups.
 */
export function compareDisplays(
  catalogue: readonly DisplayRecord[],
  setups: readonly string[]
): CompareResult {
  const records: DisplayRecord[] = [];
  const notFound: string[] = [];

  // --- Step 1: Resolve records for each setup name ---
  for (const setup of setups) {
    const found = catalogue.find((d) => d.setup === setup);
    if (found) {
      records.push(found);
    } else {
      notFound.push(setup);
    }
  }

  // --- Step 2: Extract comparison fields and find differences ---
  const differences: Record<string, readonly unknown[]> = {};

  if (records.length > 1) {
    const fieldExtractors: Array<{
      name: string;
      extract: (d: DisplayRecord) => unknown;
    }> = [
      { name: 'setup', extract: (d) => d.setup },
      { name: 'controller', extract: (d) => d.controller },
      { name: 'variant', extract: (d) => d.variant.join(', ') },
      { name: 'width', extract: (d) => d.width },
      { name: 'height', extract: (d) => d.height },
      { name: 'tiles', extract: (d) => `${d.tiles.width}x${d.tiles.height}` },
      { name: 'framebufferBytes', extract: (d) => d.framebufferBytes },
      { name: 'bus.family', extract: (d) => d.bus.family },
      { name: 'bus.wiring', extract: (d) => d.bus.wiring },
      { name: 'bus.raw', extract: (d) => d.bus.raw },
      { name: 'xOffset.default', extract: (d) => d.xOffset.default },
      { name: 'xOffset.flipmode', extract: (d) => d.xOffset.flipmode },
      { name: 'driver', extract: (d) => d.driver },
    ];

    for (const extractor of fieldExtractors) {
      const values = records.map(extractor.extract);
      const firstValue = values[0];
      const hasDifference = values.some((v) => v !== firstValue);

      if (hasDifference) {
        differences[extractor.name] = values;
      }
    }
  }

  return {
    setups,
    notFound,
    records,
    differences,
  };
}

/**
 * @brief Mode (d): Enumerates all displays in the catalogue (§5.2).
 *
 * @param catalogue Complete catalogue of displays.
 * @return The unmodified list of all catalogued DisplayRecord entries.
 */
export function enumerateDisplays(
  catalogue: readonly DisplayRecord[]
): readonly DisplayRecord[] {
  return catalogue;
}
