/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/source-location.ts
 * Purpose: Provides source position tracking types across all U8G2GL XML files
 *          so parser errors, schema validation diagnostics, and codegen warnings
 *          can pinpoint the exact file, line, and column of offending text.
 * Description: Defines 1-based source coordinate, range span, and a generic
 *              Located<T> container wrapping arbitrary values with source locations.
 *
 * Exports:
 * - SourceLocation: 1-based line and column coordinates within a source file
 * - SourceRange: Start and end source location span
 * - Located: Wrapper attaching source location metadata to any value
 */

/**
 * A specific position in an XML or asset source file.
 * Line and column numbers are 1-based, matching IDE and compiler conventions.
 */
export interface SourceLocation {
  /** File path relative to project root, or absolute path. */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column number. */
  readonly column: number;
}

/**
 * A contiguous range between two source locations in the same file.
 */
export interface SourceRange {
  /** Starting location of the span (inclusive). */
  readonly start: SourceLocation;
  /** Ending location of the span (inclusive). */
  readonly end: SourceLocation;
}

/**
 * Wrapper that attaches source location metadata to any parsed AST value.
 * Used during parsing to preserve coordinate origins through AST transformations.
 */
export interface Located<T> {
  /** The wrapped value or AST node. */
  readonly value: T;
  /** Source location where the value was encountered. */
  readonly loc: SourceLocation;
}
