/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/format-budget.ts
 * Purpose: Renders §18's budget, §18.1's capacity table and §13.5's realisation
 *          report as the text `generate` prints. It is the human half of one
 *          report: the data is built once in `core/generator/report/`, and this
 *          module only lays it out, so the table an author reads and the JSON an
 *          agent reads can never state different figures.
 *
 *          Its whole job is to render an unmeasured cost as **visibly** unmeasured.
 *          §1.3 withdrew v0.1's "zero overhead" claim and made the report the
 *          enforcement; a layout that let a missing figure look like a small one —
 *          a blank column, a dash, a zero — would quietly undo that. So every
 *          line says either a byte count or the word `unmeasured`, and every
 *          `unmeasured` has its reason printed below the table where it can be
 *          read rather than guessed at.
 * Description: `formatBudgetReport()` returns the whole report as one string with
 *              no trailing newline, in §18's order: a title line, the flash
 *              table, the static-RAM table, the reasons, §18.1's capacities,
 *              §13.5's realisation per screen, and [D-18]'s demotion note last,
 *              where a reader finishes. Byte figures are printed exactly, in
 *              bytes: §18's example rounds to `3.2 KB`, but every figure this
 *              report can substantiate is small and exact, and rounding an exact
 *              number is a loss of information for no gain.
 *
 * Exports:
 * - FormatBudgetOptions:    Colour option, as the other formatters take it
 * - formatBudgetReport():   The whole §18 report as text
 */

import {
  MEASURED_KIND,
  type BudgetLine,
  type CapacityEntry,
  type Figure,
  type GenerateReport,
} from '../core/generator/report/index.js';

/** Options for formatting the budget report. */
export interface FormatBudgetOptions {
  /** Whether to enable ANSI colour codes in terminal output. Defaults to false. */
  readonly color?: boolean;
}

/** ANSI escape codes, matching `format-display.ts`. */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
} as const;

/** Column the cost figures are right-aligned to end at. */
const FIGURE_COLUMN = 52;

/** The word an unmeasured figure prints, in one place. */
const UNMEASURED_WORD = 'unmeasured';

// label
// One table row's left-hand text: the item, with its count and, for a short
// list, the names behind it. Names are the author's throughout (§13.4 prefixes
// are the emitter's business, not the report's).
//   line — the budget line
function label(line: BudgetLine): string {
  const count = line.count === undefined ? '' : ` (${line.count})`;
  return `${line.item}${count}`;
}

// figureText
// A figure as it appears in the column: exact bytes, or the word that says the
// generator does not know.
function figureText(figure: Figure, useColor: boolean): string {
  if (figure.kind === MEASURED_KIND) {
    return `${figure.bytes} bytes`;
  }
  return useColor ? `${ANSI.dim}${UNMEASURED_WORD}${ANSI.reset}` : UNMEASURED_WORD;
}

// row
// One right-aligned table row. Padding is computed from the *uncoloured* widths,
// so a coloured run's escape bytes do not push the column out of line.
//   left  — the row label
//   right — the figure as printed
//   rightPlain — the same figure with no escapes, for measuring
function row(left: string, right: string, rightPlain: string): string {
  const pad = Math.max(1, FIGURE_COLUMN - 4 - left.length - rightPlain.length);
  return `    ${left}${' '.repeat(pad)}${right}`;
}

// costTable
// One of §18's two tables, with a `derivable` total beneath it. The total is
// labelled `derivable`, never `total`: the true total is not known, and a line
// called "total" beside a column of `unmeasured` would be read as one (§1.3).
//   title    — the table's heading
//   lines    — its rows
//   useColor — whether to colour
function costTable(title: string, lines: readonly BudgetLine[], useColor: boolean): string[] {
  const out: string[] = ['', `  ${useColor ? `${ANSI.bold}${title}${ANSI.reset}` : title}`];
  for (const line of lines) {
    const plain = line.figure.kind === MEASURED_KIND ? `${line.figure.bytes} bytes` : UNMEASURED_WORD;
    out.push(row(label(line), figureText(line.figure, useColor), plain));
  }
  const derived = lines.reduce((sum, line) => (line.figure.kind === MEASURED_KIND ? sum + line.figure.bytes : sum), 0);
  out.push(`    ${'-'.repeat(FIGURE_COLUMN - 4)}`);
  out.push(row('derivable', `${derived} bytes`, `${derived} bytes`));

  // A caveat on a figure that *is* reported goes directly under its own table,
  // not with the unmeasured reasons below: the two say different things, and a
  // reader who finds "framebuffer" in a list headed NOT MEASURED has been told
  // the opposite of the truth.
  for (const line of lines) {
    if (line.note === undefined) {
      continue;
    }
    out.push(...wrapReason(`note — ${line.item}: ${line.note}`, '    '));
  }
  return out;
}

// wrapReason
// A reason wrapped to a readable width and indented under its item. Wrapping is
// done on whole words and is deterministic, so two runs print the same bytes.
//   text   — the reason
//   indent — the indent every line gets
function wrapReason(text: string, indent: string): string[] {
  const width = 88 - indent.length;
  const out: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      out.push(`${indent}${current}`);
      current = word;
    }
  }
  if (current !== '') {
    out.push(`${indent}${current}`);
  }
  return out;
}

// reasonList
// Every unmeasured line's reason, printed rather than summarised: "unmeasured"
// with no reason invites a reader to assume it means "small".
//
// Lines sharing a reason are listed together against it, because they genuinely
// share one — §13.7's rule about runtime class sizes is a single fact, and
// printing it five times in five slightly different places would read as five
// separate shortcomings rather than one boundary.
//   report   — the whole report
//   useColor — whether to colour
function reasonList(report: GenerateReport, useColor: boolean): string[] {
  // A Map, iterated in insertion order, so the grouping follows table order
  // rather than a hash (§13.9).
  const byReason = new Map<string, string[]>();
  for (const line of [...report.budget.flash, ...report.budget.ram]) {
    if (line.figure.kind === MEASURED_KIND) {
      continue;
    }
    const items = byReason.get(line.figure.reason);
    if (items === undefined) {
      byReason.set(line.figure.reason, [line.item]);
    } else {
      items.push(line.item);
    }
  }
  if (byReason.size === 0) {
    return [];
  }
  const title = 'NOT MEASURED — and why (§1.3: no figure the tooling cannot substantiate)';
  const out: string[] = ['', `  ${useColor ? `${ANSI.bold}${title}${ANSI.reset}` : title}`];
  for (const [reason, items] of byReason) {
    out.push(...wrapReason(`${items.join(', ')}:`, '    '));
    out.push(...wrapReason(reason, '      '));
  }
  return out;
}

// capacityRow
// One §18.1 row: the figure, its ceiling where one exists, and what it is about
// in the author's own names.
//   entry — the capacity entry
function capacityRow(entry: CapacityEntry): string {
  const value = entry.ceiling === undefined ? `${entry.value}` : `${entry.value} / ${entry.ceiling}`;
  const names = entry.names.length === 0 ? '' : `   ${entry.names.join(', ')}`;
  const left = entry.label.padEnd(30);
  return `    ${left}${value.padStart(9)}${names}`;
}

// capacityTable
// §18.1's table, naming the generated header the figures are emitted into so a
// reader can check the build they compile against rather than trust this table.
function capacityTable(report: GenerateReport, useColor: boolean): string[] {
  const title = `CAPACITY (generated — see ${report.capacity.header})`;
  const out: string[] = ['', `  ${useColor ? `${ANSI.bold}${title}${ANSI.reset}` : title}`];
  for (const entry of report.capacity.entries) {
    out.push(capacityRow(entry));
  }
  return out;
}

// realisationTable
// §13.5's outcome per element, grouped by screen, with each element's reason
// codes. An element whose object the rule does not require is marked, because
// that is the cost [D-18]'s amendment is paying and the note below refers to it.
function realisationTable(report: GenerateReport, useColor: boolean): string[] {
  const title = 'REALISATION (§13.5 — what each element became, and why)';
  const out: string[] = ['', `  ${useColor ? `${ANSI.bold}${title}${ANSI.reset}` : title}`];
  for (const screen of report.realisation.screens) {
    out.push(
      `    screen '${screen.screen}': ${screen.objects} object(s), ` +
        `${screen.drawCallElements} element(s) as draw calls`,
    );
    for (const element of screen.elements) {
      const outcome = element.realisation === 'object' ? 'object' : 'draw calls';
      const amendment = element.realisation === 'object' && !element.requiredByRule ? '  [amendment]' : '';
      // Trimmed at the end: an element with no reasons — which cannot happen in
      // a build that generated, but can in a partial model under test — would
      // otherwise leave trailing spaces, and trailing whitespace in output that
      // gets pasted into a report is noise nobody can see to remove.
      out.push(
        `      ${(element.name || '(unnamed)').padEnd(24)}${element.tag.padEnd(22)}` +
          `${outcome.padEnd(11)}${element.reasons.join(', ')}${amendment}`.trimEnd(),
      );
    }
  }
  out.push(
    `    ${report.realisation.totalObjects} object(s) and ` +
      `${report.realisation.totalDrawCallElements} draw-call element(s) across ` +
      `${report.realisation.screens.length} screen(s).`,
  );
  return out;
}

// demotionNote
// [D-18]'s amendment, last, where a reader finishes — and on every run, whether
// or not it cost this project anything. The amendment requires the statement
// precisely so that a project it did not bite is not read as the rule's full
// saving.
function demotionNote(report: GenerateReport, useColor: boolean): string[] {
  const { demotion } = report.realisation;
  const heading = useColor ? `${ANSI.yellow}NOTE${ANSI.reset}` : 'NOTE';
  const out: string[] = ['', `  ${heading} — [D-18]'s 2026-09-13 amendment:`];
  out.push(...wrapReason(demotion.statement, '      '));
  out.push(
    ...wrapReason(
      demotion.objectsNotRequiredByRule === 0
        ? 'No object in this project is due to the amendment alone.'
        : `${demotion.objectsNotRequiredByRule} object(s) here are marked [amendment] above and are due ` +
            `to it alone: ${demotion.names.join(', ')}.`,
      '      ',
    ),
  );
  return out;
}

/**
 * @brief Renders the whole §18 report as the text `generate` prints.
 *
 * @param report  The three reports, as `buildGenerateReport()` built them.
 * @param options Colour option.
 * @return The report, with no trailing newline. Deterministic: every list is in
 *         the order the report holds it, and the wrapping is computed, not
 *         locale-dependent (§13.9).
 */
export function formatBudgetReport(report: GenerateReport, options?: FormatBudgetOptions): string {
  const useColor = options?.color === true;
  const { budget } = report;

  // --- Step 1: The title line — what produced this, and what for (§18) ---
  const size = budget.display === undefined ? '' : ` ${budget.display.width}x${budget.display.height}`;
  const title = `u8g2gl ${budget.generator} — target '${budget.target}' (${budget.setup}${size})`;

  const lines: string[] = [useColor ? `${ANSI.bold}${title}${ANSI.reset}` : title];

  // --- Step 2: The two cost tables, then the reasons behind every unmeasured line ---
  lines.push(...costTable('FLASH', budget.flash, useColor));
  lines.push(...costTable('RAM (static)', budget.ram, useColor));

  // --- Step 3: The declared budget, stated without inventing a percentage ---
  if (budget.ramBudget !== undefined) {
    lines.push(
      '',
      `  Target RAM budget: ${budget.ramBudget} bytes. No percentage is reported, because the total ` +
        'static RAM is not measurable here (see below).',
    );
    if (budget.overBudget === true) {
      lines.push(
        `  warning: the ${budget.ramDerivedBytes} bytes this report can derive already exceed that budget.`,
      );
    }
  }

  lines.push(...reasonList(report, useColor));

  // --- Step 4: §18.1's capacities, §13.5's realisation, and [D-18]'s note last ---
  lines.push(...capacityTable(report, useColor));
  lines.push(...realisationTable(report, useColor));
  lines.push(...demotionNote(report, useColor));

  return lines.join('\n');
}
