/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/align.ts
 * Purpose: The align and distribute commands of the canvas toolbar (ui_spec
 *          §8): line the selection up on one edge or centre of its bounding
 *          box, or space three or more evenly. Each element moves by the same
 *          placement rules a drag uses (`placement-rules.ts`), so an aligned
 *          element's literal is rewritten, an anchor inverted, and an
 *          expression or a binding refuses — the element stays, and the
 *          command says which and why.
 * Description: From the drawn rectangles (device pixels) and the text's CST:
 *              - **left, h-centre, right / top, v-centre, bottom:** each
 *                element's delta on the axis is the bounding box's edge or
 *                centre less its own, rounded to an integer;
 *              - **distribute horizontally / vertically:** the elements in
 *                order of their start edge keep the first and last where they
 *                are, and those between are placed so the gaps between
 *                neighbours are equal, each position rounded.
 *              The box is the whole selection's, refusing elements included,
 *              since that is what the user sees outlined. A command is
 *              available with at least two elements that can move on its axis
 *              (three to distribute); one with no rectangle drawn neither moves
 *              nor counts. An element already in place writes nothing.
 *
 * Exports:
 * - AlignCommand:        The eight commands
 * - ALIGN_COMMANDS:      Each command's label and axis, in toolbar order
 * - AlignOutcome:        A command's edits and the reasons elements stayed
 * - alignAvailability(): Which commands the selection can take
 * - alignEdits():        One command's edits
 */

import type { CstDocument, TextEdit } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import type { Rect } from '../pipeline/live-pipeline';
import { moveEdits, planMove, type Axis, type MovePlan } from './placement-rules';

/** One align or distribute command. */
export type AlignCommand = 'left' | 'hcentre' | 'right' | 'top' | 'vcentre' | 'bottom' | 'distribute-h' | 'distribute-v';

/** Each command's toolbar label, axis and what it lines up, in toolbar order. */
export const ALIGN_COMMANDS: readonly { readonly command: AlignCommand; readonly label: string; readonly glyph: string; readonly axis: Axis }[] = [
  { command: 'left', label: 'Align left edges', glyph: '⇤', axis: 'horizontal' },
  { command: 'hcentre', label: 'Align horizontal centres', glyph: '↔', axis: 'horizontal' },
  { command: 'right', label: 'Align right edges', glyph: '⇥', axis: 'horizontal' },
  { command: 'top', label: 'Align top edges', glyph: '⤒', axis: 'vertical' },
  { command: 'vcentre', label: 'Align vertical centres', glyph: '↕', axis: 'vertical' },
  { command: 'bottom', label: 'Align bottom edges', glyph: '⤓', axis: 'vertical' },
  { command: 'distribute-h', label: 'Distribute horizontally', glyph: '⋯', axis: 'horizontal' },
  { command: 'distribute-v', label: 'Distribute vertically', glyph: '⋮', axis: 'vertical' },
];

/** What a command writes, and each element that stayed on its axis, with why. */
export interface AlignOutcome {
  readonly edits: readonly TextEdit[];
  readonly refusals: readonly string[];
}

/** An element of the selection, its plan and its rectangle. */
interface Subject {
  readonly plan: MovePlan;
  readonly rect: Rect;
}

// subjects
// The selected elements with a plan and a drawn rectangle, in selection order.
function subjects(cst: CstDocument, names: readonly string[], bounds: ReadonlyMap<string, Rect>, placements: ReadonlyMap<string, Placement>): Subject[] {
  const found: Subject[] = [];
  for (const name of names) {
    const rect = bounds.get(name);
    const plan = planMove(cst, name, placements.get(name));
    if (rect !== undefined && plan !== undefined) found.push({ plan, rect });
  }
  return found;
}

// axisOf
// A command's axis.
function axisOf(command: AlignCommand): Axis {
  return ALIGN_COMMANDS.find((entry) => entry.command === command)?.axis ?? 'horizontal';
}

/**
 * @brief Which commands the selection can take: at least two elements movable
 *        on the command's axis, three to distribute.
 *
 * @param cst        The current text's CST.
 * @param names      The selected names.
 * @param bounds     The drawn rectangles by name.
 * @param placements The drawn placements by name.
 * @return The available commands, in toolbar order.
 */
export function alignAvailability(
  cst: CstDocument,
  names: readonly string[],
  bounds: ReadonlyMap<string, Rect>,
  placements: ReadonlyMap<string, Placement>,
): AlignCommand[] {
  if (names.length < 2) return [];
  const all = subjects(cst, names, bounds, placements);
  const movable = (axis: Axis): number => all.filter((s) => s.plan[axis].kind === 'move').length;
  return ALIGN_COMMANDS.filter(({ command, axis }) => movable(axis) >= (command.startsWith('distribute') ? 3 : 2)).map((entry) => entry.command);
}

// span
// A rectangle's start and size on an axis.
function span(rect: Rect, axis: Axis): { start: number; size: number } {
  return axis === 'horizontal' ? { start: rect.x, size: rect.width } : { start: rect.y, size: rect.height };
}

// targetDeltas
// Each subject's integer delta on the command's axis, in subject order.
function targetDeltas(all: readonly Subject[], command: AlignCommand, axis: Axis): number[] {
  // --- Step 1: The selection's bounding box on the axis ---
  const spans = all.map((s) => span(s.rect, axis));
  const low = Math.min(...spans.map((s) => s.start));
  const high = Math.max(...spans.map((s) => s.start + s.size));

  // --- Step 2: Align: to an edge or the centre ---
  if (!command.startsWith('distribute')) {
    return spans.map(({ start, size }) => {
      if (command === 'left' || command === 'top') return low - start;
      if (command === 'right' || command === 'bottom') return high - (start + size);
      return Math.round((low + high) / 2 - (start + size / 2));
    });
  }

  // --- Step 3: Distribute: first and last stay, equal gaps between ---
  const order = spans.map((s, i) => ({ ...s, i })).sort((a, b) => a.start - b.start || a.i - b.i);
  const gap = (high - low - order.reduce((sum, s) => sum + s.size, 0)) / Math.max(1, order.length - 1);
  const deltas = new Array<number>(all.length).fill(0);
  let at = low;
  order.forEach((s, k) => {
    // The last keeps its far edge exactly, whatever rounding did before it.
    const target = k === order.length - 1 ? high - s.size : Math.round(at);
    deltas[s.i] = target - s.start;
    at += s.size + gap;
  });
  return deltas;
}

/**
 * @brief One command's edits to the current text.
 *
 * @param cst        The current text's CST.
 * @param names      The selected names.
 * @param bounds     The drawn rectangles by name.
 * @param placements The drawn placements by name.
 * @param command    The command.
 * @return Disjoint edits against `cst.text`, and `name: reason` for each element
 *         that had to move on a refusing axis and stayed.
 */
export function alignEdits(
  cst: CstDocument,
  names: readonly string[],
  bounds: ReadonlyMap<string, Rect>,
  placements: ReadonlyMap<string, Placement>,
  command: AlignCommand,
): AlignOutcome {
  const axis = axisOf(command);
  const all = subjects(cst, names, bounds, placements);
  if (all.length === 0) return { edits: [], refusals: [] };
  const deltas = targetDeltas(all, command, axis);
  const edits: TextEdit[] = [];
  const refusals: string[] = [];
  all.forEach((subject, i) => {
    const delta = deltas[i] ?? 0;
    if (delta === 0) return;
    const plan = subject.plan[axis];
    if (plan.kind === 'refused') {
      refusals.push(`${subject.plan.name}: ${plan.reason}`);
      return;
    }
    edits.push(...moveEdits(cst, [subject.plan], axis === 'horizontal' ? delta : 0, axis === 'vertical' ? delta : 0));
  });
  return { edits, refusals };
}
