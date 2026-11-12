/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/save-status.ts
 * Purpose: The words and the choices behind the designer's save affordances,
 *          kept apart from the components so they can be tested without a
 *          browser. Saving is explicit (there is no autosave), so it has to be
 *          obvious: the status bar says how many files are unsaved and offers
 *          to save them, and ⌘S always has something sensible to save, even
 *          in a layout with no editor tab, where the canvas is all there is.
 * Description: Pure functions from the dirty paths to text, and from the active
 *              editor file and the canvas's file to what ⌘S saves.
 *
 * Exports:
 * - SAVE_SHORTCUT:        ⌘S, as the tooltips write it
 * - SAVE_ALL_SHORTCUT:    ⌘⌥S, as the tooltips write it
 * - UnsavedText:          The status bar's Save button: its label and tooltip
 * - describeUnsaved():    That text for the dirty paths, if any
 * - saveTarget():         The file ⌘S saves
 */

/** The shortcut that saves one file, both platforms' spellings. */
export const SAVE_SHORTCUT = '⌘S / Ctrl-S';

/** The shortcut that saves every unsaved file, both platforms' spellings. */
export const SAVE_ALL_SHORTCUT = '⌘⌥S / Ctrl-Alt-S';

/** The status bar's Save button. */
export interface UnsavedText {
  /** "● N unsaved · Save". */
  readonly label: string;
  /** The unsaved files, one per line, then the shortcuts. */
  readonly title: string;
}

/**
 * @brief The status bar's Save button, while anything is unsaved.
 *
 * @param dirty The paths with unsaved changes, in any order; they are listed sorted.
 * @return The button's text, or undefined when nothing is unsaved, so the
 *         button is not shown at all.
 */
export function describeUnsaved(dirty: Iterable<string>): UnsavedText | undefined {
  const files = [...dirty].sort();
  if (files.length === 0) return undefined;
  return {
    label: `● ${files.length} unsaved · Save`,
    title: [
      `Save ${files.length === 1 ? 'the unsaved file' : `all ${files.length} unsaved files`}:`,
      ...files.map((file) => `  ${file}`),
      `Save all: ${SAVE_ALL_SHORTCUT}. Save the active file: ${SAVE_SHORTCUT}.`,
    ].join('\n'),
  };
}

/**
 * @brief The file ⌘S saves: the active editor tab's, else the canvas's.
 *
 * A layout with no editor tab still has the canvas, and an edit made there is
 * an edit to the screen it draws, so that is the file a save means.
 *
 * @param activeFile The file of the active editor tab, if there is one.
 * @param canvasFile The file of the screen the canvas draws, if any.
 * @return The path to save, or undefined when there is neither.
 */
export function saveTarget(activeFile: string | undefined, canvasFile: string | undefined): string | undefined {
  return activeFile ?? canvasFile;
}
