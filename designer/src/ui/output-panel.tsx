/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/output-panel.tsx
 * Purpose: The bottom panel's Output log: what the designer and the design
 *          server did — the editor Wasm builds, saves, reloads — in the order it
 *          happened, so the status bar's one-word state always has its story
 *          one click away.
 * Description: Renders `Workspace.output`, newest last, keeping the end in view.
 *
 * Exports:
 * - OutputPanel:  The component
 */

import { useEffect, useRef } from 'react';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/** @brief The Output panel. */
export function OutputPanel(): React.JSX.Element {
  countRender('OutputPanel');
  const workspace = useWorkspace();
  const lines = useObservable(workspace.output);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braced, not an expression body: scrollIntoView() returns a promise in
    // current Chromium, and an effect may only return its clean-up function.
    void end.current?.scrollIntoView({ block: 'end' });
  }, [lines]);
  return (
    <pre className="output" aria-label="Output">
      {lines.join('\n')}
      <div ref={end} />
    </pre>
  );
}
