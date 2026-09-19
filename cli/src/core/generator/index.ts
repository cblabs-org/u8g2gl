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
 * - checkProject, finaliseDiagnostics, ProjectModel (check-project.ts)
 * - GENERATED_MARKER, HeaderStamp, formatHeaderStamp, isGeneratedContent (header.ts)
 * - generate, GenerateInput, GenerateResult, GeneratedFile,
 *   GENERATE_REFUSAL_POLICY (generate.ts)
 * - Realisation and capacities — §13.5, §13.3, [D-21] (realise/)
 * - Emission — §13.2's value spelling, the draw-argument order and the
 *   project-level units (emit/). WO10 and WO11 emit through these helpers
 *   rather than spelling a setter call or an argument list of their own.
 */

export { checkProject, finaliseDiagnostics, type ProjectModel } from './check-project.js';
export {
  GENERATED_MARKER,
  formatHeaderStamp,
  isGeneratedContent,
  type HeaderStamp,
} from './header.js';
export {
  generate,
  GENERATE_REFUSAL_POLICY,
  type GenerateInput,
  type GenerateResult,
  type GeneratedFile,
} from './generate.js';
export * from './realise/index.js';
export * from './emit/index.js';
