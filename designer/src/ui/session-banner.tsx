/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/session-banner.tsx
 * Purpose: Says, across the top of the window, that the design server has
 *          stopped. Without it the page looks fully alive after the server
 *          goes, and the first sign is a save failing. Editing stays possible
 *          while it shows, so nothing is taken away: the banner only tells the
 *          user where their changes are and how to start a new session.
 * Description: Shown while the workspace's connection is `lost`, and gone again
 *              on `connected`. While connected it reads only the connection,
 *              so it renders on neither a keystroke nor a drag; while it
 *              shows, it also reads the dirty set, which changes only when a
 *              file becomes dirty or clean. The text comes from
 *              `session-status.ts`.
 *
 * Exports:
 * - SessionBanner:  The component
 */

import { countRender } from '../perf/render-count';
import { DESIGN_COMMAND, describeSessionEnded } from './session-status';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** @brief The "session ended" banner, or nothing while the server is reachable. */
export function SessionBanner(): React.JSX.Element | null {
  countRender('SessionBanner');
  const connection = useObservable(useWorkspace().connection);
  return connection === 'lost' ? <SessionEnded /> : null;
}

// SessionEnded
// The banner itself. A component of its own so the dirty set is read only
// while the banner shows: while connected, a buffer turning dirty renders
// nothing here.
function SessionEnded(): React.JSX.Element {
  const dirty = useObservable(useWorkspace().documents.dirty);
  const text = describeSessionEnded(dirty);
  // The command is set in code type where `next` names it.
  const [before, after] = text.next.split(DESIGN_COMMAND);
  return (
    <div className="session-banner conflict-bar" role="alert">
      <span className="text">
        <strong>{text.lead}</strong> {text.changes} {before}
        <code>{DESIGN_COMMAND}</code>
        {after}
      </span>
    </div>
  );
}
