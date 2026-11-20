/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/fonts/font-browse.ts
 * Purpose: What a property panel font field's "Browse fonts…" hands the Fonts
 *          view (ui_spec §6.4): what the font is for, the font it has, and how
 *          to set it. Its own module, free of the view's React, because the
 *          workspace holds one and the workspace is also read outside a page.
 *
 * Exports:
 * - FontBrowseRequest:  A font field asking the Fonts view for its font
 */

/** A font field asking the Fonts view for its font, through "Browse fonts…". */
export interface FontBrowseRequest {
  /** What is being chosen for, as the view names it: `plat_label.font`. */
  readonly target: string;
  /** The field's font now. */
  readonly current: string | undefined;
  /** Sets the field: one edit in the field's own document. */
  readonly choose: (name: string) => void;
}
