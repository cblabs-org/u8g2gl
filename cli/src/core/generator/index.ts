/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/index.ts
 * Purpose: Public entry point for the generator — the shared validation both
 *          journeys run, the header stamp, and `generate()` itself. Isomorphic:
 *          no Node imports, no I/O; files are returned, never written.
 * Description: Re-exports check-project.ts, header.ts and generate.ts.
 *
 * Exports:
 * - checkProject, ProjectModel (check-project.ts)
 * - GENERATED_MARKER, HeaderStamp, formatHeaderStamp, isGeneratedContent (header.ts)
 * - generate, GenerateInput, GenerateResult, GeneratedFile,
 *   GENERATE_NOT_YET_SUPPORTED_POLICY (generate.ts)
 */

export { checkProject, type ProjectModel } from './check-project.js';
export {
  GENERATED_MARKER,
  formatHeaderStamp,
  isGeneratedContent,
  type HeaderStamp,
} from './header.js';
export {
  generate,
  GENERATE_NOT_YET_SUPPORTED_POLICY,
  type GenerateInput,
  type GenerateResult,
  type GeneratedFile,
} from './generate.js';
