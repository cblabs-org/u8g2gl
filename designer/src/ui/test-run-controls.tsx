/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/test-run-controls.tsx
 * Purpose: Run and its verdict in the canvas toolbar (EDITOR-DESIGN §2.2), and
 *          the mismatch's detail over the canvas: the only places a test run
 *          shows itself. There is no second canvas and no mode: Live is always
 *          on, and Run is an action whose result is one line of the toolbar
 *          (§4.3).
 * Description: `TestRunControls` is the button, disabled with its reason as
 *              the tooltip when Run is unavailable, and the verdict, which
 *              re-renders once a second while it shows an age. On a mismatch
 *              it says that a mismatch is a framework bug and offers *Save bug
 *              report*, then shows the path written. `TestRunDiffInfo` is the
 *              overlay's legend: both frames' SHA-256 hashes and the time,
 *              shown while the overlay is, so the pixels it marks are tied to
 *              the hashes a report would quote.
 *
 * Exports:
 * - RUN_SHORTCUT:     The shortcut's label for this platform
 * - TestRunControls:  The toolbar's Run and verdict
 * - TestRunDiffInfo:  The mismatch overlay's legend
 */

import { useEffect, useState } from 'react';
import { verdictText } from '../test-run/verdict';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/** ⌘↵ on a Mac, Ctrl+Enter elsewhere, as the button's tooltip names it. */
export const RUN_SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'Ctrl+Enter';

/** @brief Run and the last run's verdict, for the canvas toolbar. */
export function TestRunControls(): React.JSX.Element {
  countRender('TestRunControls');
  const testRun = useWorkspace().testRun;
  const view = useObservable(testRun.view);
  const availability = useObservable(testRun.availability);
  const reportPath = useObservable(testRun.reportPath);
  const [now, setNow] = useState(() => performance.now());

  // --- The age: once a second while a finished verdict is shown ---
  const ageing = view.kind === 'parity';
  useEffect(() => {
    if (!ageing) return undefined;
    setNow(performance.now());
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ageing, view]);

  const disabled = availability.state === 'unavailable';
  const title = disabled
    ? `Run is unavailable: ${availability.reason}`
    : `Run the firmware build and compare it with the canvas (${RUN_SHORTCUT}; overrides the editor's Insert Line Below)`;
  const text = verdictText(view, view.kind === 'parity' ? Math.max(now, view.finishedAt) : now);
  return (
    <span className="test-run">
      <button
        type="button"
        className="run-button"
        disabled={disabled}
        title={title}
        data-availability={availability.state}
        data-reason={availability.state === 'ready' ? '' : availability.reason}
        onClick={() => testRun.run()}
      >
        ▶ Run
      </button>
      {text !== '' && (
        <span className={`verdict verdict-${view.kind}`} data-verdict={view.kind} title={view.kind === 'mismatch' ? 'A mismatch is a framework bug' : undefined}>
          {text}
        </span>
      )}
      {view.kind === 'mismatch' && (
        <>
          <span className="verdict-note">a framework bug:</span>
          {reportPath === undefined ? (
            <button type="button" className="save-report" onClick={() => void testRun.saveReport()}>
              Save bug report
            </button>
          ) : (
            <span className="report-path" title={reportPath}>
              saved to {reportPath}
            </span>
          )}
        </>
      )}
    </span>
  );
}

/** @brief The mismatch overlay's legend: both hashes, while the overlay is shown. */
export function TestRunDiffInfo(): React.JSX.Element | null {
  countRender('TestRunDiffInfo');
  const mismatch = useObservable(useWorkspace().testRun.mismatch);
  if (mismatch === undefined) return null;
  return (
    <div className="diff-info" data-pixels={mismatch.pixels.length}>
      <div>
        {mismatch.pixels.length} px differ at {mismatch.time} ms
      </div>
      <div className="hash">
        live <code data-hash="live">{mismatch.liveSha256}</code>
      </div>
      <div className="hash">
        firmware <code data-hash="harness">{mismatch.harnessSha256}</code>
      </div>
    </div>
  );
}
