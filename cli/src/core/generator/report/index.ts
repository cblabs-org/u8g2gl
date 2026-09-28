/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/report/index.ts
 * Purpose: Public entry point for §18's reporting — the last step of §13.11's
 *          pipeline ("emit → report"). It is a module of its own, beside `emit/`
 *          rather than inside it, because the report is not output the compiler
 *          reads: it is what §1.3 obliges the tool to tell the author about the
 *          cost of what was just emitted, and the designer will render the same
 *          data without any C++ in sight.
 * Description: Re-exports model.ts (the shapes, including the `Figure` union that
 *              makes "unmeasured" a value rather than a blank) and budget.ts (the
 *              projection). Isomorphic — the human rendering lives in
 *              `src/node/format-budget.ts`, with the other formatters.
 *
 * Exports:
 * - MEASURED_KIND, UNMEASURED_KIND, Measured, Unmeasured, Figure,
 *   BudgetLine, BudgetReport, CapacityEntry, CapacityReport,
 *   ElementRealisation, ScreenRealisation, DemotionStatus, RealisationReport,
 *   GenerateReport (model.ts)
 * - buildGenerateReport, ReportInput (budget.ts)
 */

export {
  MEASURED_KIND,
  UNMEASURED_KIND,
  type Measured,
  type Unmeasured,
  type Figure,
  type BudgetLine,
  type BudgetReport,
  type CapacityEntry,
  type CapacityReport,
  type ElementRealisation,
  type ScreenRealisation,
  type DemotionStatus,
  type RealisationReport,
  type GenerateReport,
} from './model.js';
export { buildGenerateReport, type ReportInput } from './budget.js';
