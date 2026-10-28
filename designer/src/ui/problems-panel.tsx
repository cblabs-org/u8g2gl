/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/problems-panel.tsx
 * Purpose: The bottom panel's Problems list (ui_spec §6, §13): every
 *          diagnostic, located at file, line and column, with its stable code
 *          and suggestions. A row opens its file with the caret on the fault
 *          (F4: "click a row → land on the fault").
 * Description: Renders `Workspace.problems`, which the pipeline replaces only
 *              when the set of diagnostics changes, so typing that changes no
 *              diagnostic does not re-render this list.
 *
 * Exports:
 * - ProblemsPanel:  The component
 */

import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/** The glyph for each severity, as the CLI's own output marks them. */
const GLYPH = { error: '⛔', warning: '⚠', info: 'ⓘ' } as const;

/** @brief The Problems panel. */
export function ProblemsPanel(): React.JSX.Element {
  countRender('ProblemsPanel');
  const workspace = useWorkspace();
  const rows = useObservable(workspace.problems);
  if (rows.length === 0) {
    return <div className="panel-empty">No problems.</div>;
  }
  return (
    <ul className="problems" aria-label="Problems">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            className={`problem ${row.severity}`}
            data-code={row.code}
            onClick={() => workspace.openFile({ path: row.file, line: row.line, column: row.column })}
          >
            <span className="glyph">{GLYPH[row.severity]}</span>
            <span className="where">
              {row.file}:{row.line}:{row.column}
            </span>
            <span className="message">{row.message}</span>
            {row.suggestions.length > 0 && <span className="suggest">did you mean {row.suggestions.join(', ')}?</span>}
            <span className="code">{row.code}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
