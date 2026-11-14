/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/status-bar.tsx
 * Purpose: The status bar of ui_spec §6, with one addition for served mode:
 *          the editor Wasm indicator, which says whether the canvas is drawing
 *          with this project's own widgets — and, when it is not, why and what
 *          to do. Clicking it opens Output, where the builds are logged.
 * Description: Each item reads its own observable, so a change to one does not
 *              re-render the others. The selection geometry is its own
 *              component for that reason: a selection change, or a drag that
 *              moves the selection, re-renders it and nothing else here
 *              (EDITOR-DESIGN §3.3). It shows one element's `x,y w×h`, or for
 *              several the box around them with how many there are. The
 *              "not saved" item is its own component too, for the same reason,
 *              and so is the Save button, which shows while anything is
 *              unsaved and saves it all: it reads only the dirty set, which
 *              changes when a file becomes dirty or clean, not on every
 *              keystroke. The active target (D1) is its own component as
 *              well: it re-renders only when the project's targets or the
 *              choice change, never on a keystroke that changes neither.
 *
 * Exports:
 * - StatusBar:          The component
 * - describeWasm():     The indicator's text for a state
 * - SelectionGeometry:  Its selection readout
 * - NotSaved:           Its failed-save item
 * - UnsavedSave:        Its "● N unsaved · Save" button
 * - TargetSwitcher:     The active target, and the switch between targets
 */

import type { WasmStatus } from '../wasm/editor-wasm-controller';
import { useSyncExternalStore } from 'react';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';
import { describeNotSaved } from './session-status';
import { describeUnsaved } from './save-status';

/**
 * @brief The indicator's text: a glyph, the state, and the hash or reason.
 *
 * @param status       The controller's state.
 * @param placeholders How many elements the canvas shows as placeholders.
 */
export function describeWasm(status: WasmStatus, placeholders: number): string {
  const shown = placeholders > 0 ? ` · ${placeholders} placeholder${placeholders === 1 ? '' : 's'}` : '';
  switch (status.kind) {
    case 'loading':
      return '◌ editor Wasm: loading';
    case 'building':
      return `◐ editor Wasm: building the project renderer${shown}`;
    case 'current':
      return `● editor Wasm: current ${status.hash.slice(0, 8)}${shown}`;
    case 'stale':
      return `◐ editor Wasm: stale ${status.hash.slice(0, 8)}, rebuilding${shown}`;
    case 'none':
      return `○ editor Wasm: no toolchain, project widgets are placeholders. Run 'u8g2gl toolchain install'`;
    case 'failed':
      return `✕ editor Wasm: build failed${status.hash !== undefined ? `, showing ${status.hash.slice(0, 8)}` : ''}${shown}`;
  }
}

/** @brief The status bar. */
export function StatusBar({ onShowOutput }: { readonly onShowOutput: () => void }): React.JSX.Element {
  countRender('StatusBar');
  const workspace = useWorkspace();
  const status = useObservable(workspace.wasm.status);
  const frame = useObservable(workspace.loop.frameState);
  const problems = useObservable(workspace.problems);
  const errors = problems.filter((row) => row.severity === 'error').length;
  const warnings = problems.filter((row) => row.severity === 'warning').length;
  const reason = status.kind === 'none' || status.kind === 'failed' ? status.reason : undefined;
  return (
    <footer className="status-bar">
      <button type="button" className="status-item wasm" data-wasm={status.kind} title={reason ?? 'Open Output'} onClick={onShowOutput}>
        {describeWasm(status, frame.placeholders.length)}
      </button>
      <span className="status-item problems-count">
        ⛔ {errors} ⚠ {warnings}
      </span>
      <UnsavedSave />
      <NotSaved onShowOutput={onShowOutput} />
      <span className="status-spacer" />
      <SelectionGeometry />
      <TargetSwitcher />
      {frame.display !== undefined && (
        <span className="status-item">
          {frame.screen} · {frame.display.width}×{frame.display.height}
        </span>
      )}
    </footer>
  );
}

/**
 * @brief The files whose last save failed, as "✕ not saved: <file>", until
 *        each saves or its buffer is clean; nothing while there are none.
 *        Clicking it opens Output, which holds the reason.
 */
export function NotSaved({ onShowOutput }: { readonly onShowOutput: () => void }): React.JSX.Element | null {
  countRender('NotSaved');
  const text = describeNotSaved(useObservable(useWorkspace().documents.notSaved));
  if (text === undefined) return null;
  return (
    <button type="button" className="status-item not-saved" title="Open Output" onClick={onShowOutput}>
      {text}
    </button>
  );
}

/**
 * @brief "● N unsaved · Save" while any file is unsaved; nothing otherwise.
 *        A click saves every unsaved file; its tooltip lists them and the
 *        shortcuts.
 */
export function UnsavedSave(): React.JSX.Element | null {
  countRender('UnsavedSave');
  const workspace = useWorkspace();
  const text = describeUnsaved(useObservable(workspace.documents.dirty));
  if (text === undefined) return null;
  return (
    <button type="button" className="status-item unsaved-save" title={text.title} onClick={() => void workspace.saveAll()}>
      {text.label}
    </button>
  );
}

/**
 * @brief The selection's geometry (ui_spec §6): one element's rectangle, or the
 *        box around several, in device pixels. Nothing while nothing drawn is
 *        selected.
 */
export function SelectionGeometry(): React.JSX.Element | null {
  countRender('SelectionGeometry');
  const workspace = useWorkspace();
  const rect = useObservable(workspace.loop.selectionRect);
  const count = useObservable(workspace.loop.selectionCount);
  if (rect === undefined) return null;
  return (
    <span className="status-item selection-geometry" data-count={count}>
      sel {count > 1 ? `${count} · ` : ''}
      {rect.x},{rect.y} {rect.width}×{rect.height}
    </span>
  );
}

/** What the switcher shows: the targets' names, the active one, and its display. */
interface TargetsShown {
  readonly names: readonly string[];
  readonly active: string | undefined;
  readonly display: string | undefined;
}

// targetsKey
// The switcher's snapshot as one string, so a run that changed no target,
// which is nearly every run, re-renders nothing.
function targetsKey(workspace: ReturnType<typeof useWorkspace>): string {
  const result = workspace.loop.lastRun.get()?.result;
  if (result === undefined) return '';
  const record = result.target === undefined ? undefined : result.model.catalogue.find((d) => d.setup === result.target?.setup);
  const shown: TargetsShown = {
    names: result.model.project.targets.map((target) => target.name),
    active: result.target?.name,
    display: record === undefined ? undefined : `${record.controller} ${record.width}×${record.height}`,
  };
  return JSON.stringify(shown);
}

/**
 * @brief The active target ([U-3], D1): always named, as ui_spec §6's status
 *        bar lists it, with its controller and size; with more than one target,
 *        a switch between them. Switching is never an edit: the choice is this
 *        browser's (`project/active-target.ts`), and the canvas redraws at the
 *        chosen target's display.
 */
export function TargetSwitcher(): React.JSX.Element | null {
  countRender('TargetSwitcher');
  const workspace = useWorkspace();
  const key = useSyncExternalStore(
    (onChange) => workspace.loop.lastRun.subscribe(onChange),
    () => targetsKey(workspace),
  );
  if (key === '') return null;
  const shown = JSON.parse(key) as TargetsShown;
  if (shown.active === undefined) return null;
  const display = shown.display === undefined ? '' : ` · ${shown.display}`;
  if (shown.names.length < 2) {
    return (
      <span className="status-item target" data-target={shown.active} title="The target the canvas shows">
        {shown.active}
        {display}
      </span>
    );
  }
  return (
    <label className="status-item target" data-target={shown.active} title="The target the canvas shows; switching it changes no file">
      <select aria-label="Target" value={shown.active} onChange={(event) => workspace.activeTarget.choose(event.target.value)}>
        {shown.names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {display}
    </label>
  );
}
