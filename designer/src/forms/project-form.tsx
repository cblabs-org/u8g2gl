/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/project-form.tsx
 * Purpose: Shows the project-file form in the canvas half of the editor area
 *          while `u8g2gl.xml` or `globals.xml` is the active file (ruling 1),
 *          so those two files read as form ∥ XML in the split, ratio and
 *          collapse the canvas already has. The XML beside it stays live, and
 *          every form change is a text edit on that same buffer.
 * Description: `ProjectFormHost` subscribes to the active file alone and lays
 *              the form over the canvas panel's body: the canvas stays mounted
 *              beneath, so the edit loop keeps its view and nothing of the
 *              canvas re-renders when the form shows or goes. `ProjectForm`
 *              owns one file's controller for as long as it is shown.
 *
 *              It scrolls, never focuses: to the section the Explorer asks
 *              for (`Workspace.formReveal`), and to the node the XML caret is
 *              in (`Workspace.formCaret`). A focused section, item or part
 *              reports its range to `Workspace.formHighlight`, which the XML
 *              highlights.
 *
 * Exports:
 * - ProjectFormHost:  The form over the canvas, while a project file is active
 * - ProjectForm:      One file's form
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { countRender } from '../perf/render-count';
import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';
import { ProjectFormController } from './form-controller';
import { isFormFile, type FormFile } from './form-model';
import { FormView, type FormActions, type SectionRenderer } from './form-view';
import './form.css';

/** @brief The form, over the canvas, while a project file is the active one. */
export function ProjectFormHost(): React.JSX.Element | null {
  countRender('ProjectFormHost');
  const workspace = useWorkspace();
  const active = useObservable(workspace.activeFile);
  if (!isFormFile(active)) return null;
  return (
    <div className="project-form-host">
      <ProjectForm key={active} file={active} />
    </div>
  );
}

/**
 * @brief One file's form, live.
 *
 * @param renderSection Replaces a section's generic body (the targets editor).
 */
export function ProjectForm({ file, renderSection, children }: { readonly file: FormFile; readonly renderSection?: SectionRenderer; readonly children?: ReactNode }): React.JSX.Element {
  countRender('ProjectForm');
  const workspace = useWorkspace();
  const controller = useMemo(() => new ProjectFormController(workspace, file), [workspace, file]);
  useEffect(() => controller.start(), [controller]);
  const state = useObservable(controller.state);
  const root = useRef<HTMLDivElement>(null);

  // --- The Explorer's section rows: scroll to the one asked for ---
  const reveal = useObservable(workspace.formReveal);
  const ready = state.model !== undefined;
  useEffect(() => {
    if (reveal === undefined || reveal.path !== file || !ready) return;
    const target = root.current?.querySelector(`[data-section="${CSS.escape(reveal.key)}"], [data-node="${CSS.escape(reveal.key)}"]`);
    target?.scrollIntoView({ block: 'start' });
    // Shown once: reopening the file later starts at the top, not here.
    workspace.formReveal.set(undefined);
  }, [reveal, file, ready, workspace]);

  // --- The XML caret's node: scrolled into view, focus left where it is ---
  const current = state.current;
  useEffect(() => {
    if (current === undefined) return;
    const target = root.current?.querySelector(`[data-node="${CSS.escape(current)}"], [data-section="${CSS.escape(current)}"]`);
    target?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  // --- Leaving the form clears its highlight in the XML ---
  useEffect(() => () => workspace.formHighlight.set(undefined), [workspace]);

  const actions = useMemo<FormActions>(
    () => ({
      set: (field, value) => void controller.apply({ kind: 'set', field, value }),
      add: (list, kind) => void controller.apply({ kind: 'add', list, itemKind: kind }),
      remove: (item) => void controller.apply({ kind: 'remove', item }),
      move: (item, delta) => void controller.apply({ kind: 'move', item, delta }),
      focusRange: (range) => workspace.formHighlight.set(range === undefined ? undefined : { path: file, ...range }),
    }),
    [controller, workspace, file],
  );

  return (
    <div className="project-form-scroll" ref={root}>
      {children}
      <FormView file={file} state={state} actions={actions} {...(renderSection !== undefined ? { renderSection } : {})} />
    </div>
  );
}
