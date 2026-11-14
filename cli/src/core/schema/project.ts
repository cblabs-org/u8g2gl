/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/project.ts
 * Purpose: Defines the document model for the root project descriptor (u8g2gl.xml).
 *          Per §5.1, the project file defines the schema version, application identity,
 *          compilation targets, their display setup and rotation, and output paths.
 *          It holds no pins or bus: the firmware's board owns the wiring and
 *          U8G2GL describes the panel ([D-22]).
 * Description: Immutable interfaces for U8g2glProject, Target display configurations,
 *              and code generation output parameters.
 *
 * Exports:
 * - U8g2glProject: Root project configuration representation for u8g2gl.xml
 * - Target: Hardware target display definition
 * - OutputConfig: Generation output directory and symbol prefix settings
 */

import type { SourceLocation } from './source-location.js';

/**
 * Root project descriptor model parsed from `u8g2gl.xml` per design_spec §5.1.
 */
export interface U8g2glProject {
  /** Schema specification version (e.g. "0.5"). */
  readonly schema: string;
  /** Human-readable project identifier (e.g. "departures-board"). */
  readonly name: string;
  /** Semantic version string of the project (e.g. "1.0"). */
  readonly version: string;
  /** Declared hardware targets and display setups. */
  readonly targets: readonly Target[];
  /** Optional code generation output directory and prefix settings. */
  readonly output?: OutputConfig;
  /** Source location where the project root element was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Hardware target configuration.
 * Per [D-14], `setup` names the U8G2 full-buffer constructor from which
 * geometry, controller, and bus family are derived.
 */
export interface Target {
  /** Target identifier (e.g. "default", "compact"). */
  readonly name: string;
  /** U8G2 C++ constructor name (e.g. "U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI"). */
  readonly setup: string;
  /** Optional display rotation: "R0", "R1", "R2", "R3", or "0", "90", "180", "270". */
  readonly rotation?: string;
  /** Optional target RAM budget limit in bytes for capacity verification. */
  readonly ramBudget?: number;
  /** Source location where this target was declared. */
  readonly loc?: SourceLocation;
}

/**
 * Code generator output configuration.
 */
export interface OutputConfig {
  /** Output directory for emitted C++ files (defaults to "generated"). */
  readonly dir?: string;
  /** Symbol prefix for emitted identifiers and screen files (defaults to "ui_"). */
  readonly prefix?: string;
  /** Source location where output configuration was declared. */
  readonly loc?: SourceLocation;
}
