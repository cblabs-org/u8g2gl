/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/session-status.ts
 * Purpose: The words the designer uses when its design session ends or a
 *          save fails, kept apart from the components that show them so they
 *          can be tested without a browser. A page that keeps looking alive
 *          after `u8g2gl design` has stopped is the failure this answers: the
 *          user must learn that the server is gone, that their edits are
 *          still here, and the one command that gets them going again.
 * Description: Pure functions from the dirty and failed paths to text. The
 *              banner's text is in three parts, so the component can set the
 *              command in code type.
 *
 * Exports:
 * - DESIGN_COMMAND:       The command that opens a new session
 * - SessionEndedText:     The banner's three parts
 * - describeSessionEnded(): The banner's text for the unsaved files
 * - describeNotSaved():   The status bar's "not saved" text, if any
 */

/** The command that starts, or reopens, a design session. */
export const DESIGN_COMMAND = 'npx u8g2gl design';

/** The session banner's text. */
export interface SessionEndedText {
  /** What happened. */
  readonly lead: string;
  /** Where the user's unsaved changes are, naming the files, or that there are none. */
  readonly changes: string;
  /** What to do next; it names {@link DESIGN_COMMAND}, which the banner sets in code type. */
  readonly next: string;
}

/**
 * @brief The banner's text while the design server cannot be reached.
 *
 * @param dirty The paths with unsaved changes, in any order; they are listed sorted.
 */
export function describeSessionEnded(dirty: Iterable<string>): SessionEndedText {
  const files = [...dirty].sort();
  let changes: string;
  if (files.length === 0) {
    changes = 'There are no unsaved changes.';
  } else if (files.length === 1) {
    changes = `Your unsaved changes to ${files[0]} are still in this tab.`;
  } else {
    changes = `Your unsaved changes to ${files.length} files are still in this tab: ${files.join(', ')}.`;
  }
  return {
    lead: 'The design server has stopped.',
    changes,
    next: `To continue, run ${DESIGN_COMMAND} in the project folder, which opens a new session. Until then, saving is not possible.`,
  };
}

/**
 * @brief The status bar's text for saves that failed.
 *
 * @param failed The paths whose last save failed, in any order.
 * @return "✕ not saved: <file>", the files sorted and comma-separated, or
 *         undefined when there are none.
 */
export function describeNotSaved(failed: Iterable<string>): string | undefined {
  const files = [...failed].sort();
  return files.length === 0 ? undefined : `✕ not saved: ${files.join(', ')}`;
}
