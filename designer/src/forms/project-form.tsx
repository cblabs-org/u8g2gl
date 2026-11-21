/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/project-form.tsx
 * Purpose: Shows the project-file form in the canvas half of the editor area
 *          while `u8g2gl.xml` or `globals.xml` is the active file (ui_spec §6.4),
 *          so those two files read as form ∥ XML in the split, ratio and
 *          collapse the canvas already has. The XML beside it stays live, and
 *          every form change is a text edit on that same buffer.
 * Description: `ProjectFormHost` subscribes to the active file alone and lays
 *              the form over the canvas panel's body: the canvas stays mounted
 *              beneath, so the edit loop keeps its view and nothing of the
 *              canvas re-renders when the form shows or goes. `ProjectForm`
 *              owns one file's controller for as long as it is shown.
 *
 *              `globals.xml` takes its own editor's hooks
 *              (`useGlobalsEditor`): the font picker on a `<builtin>`'s name
 *              and on "+ Built-in font", and the file chooser on a `<bdf>`,
 *              `<xbm>` or `<convert>` `src` and on adding one.
 *
 *              Each named item has "Rename…", and a name field whose old name
 *              is referenced asks before it commits (`rename-dialog.tsx`); the
 *              dialog shows above the form while it is open.
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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { countRender } from '../perf/render-count';
import type { Workspace } from '../workspace';
import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';
import { ProjectFormController } from './form-controller';
import { isFormFile, type FormFile, type FormModel, type FormNode } from './form-model';
import { FormView, type FormActions, type SectionRenderer } from './form-view';
import { useGlobalsEditor } from './globals-editor';
import { useProjectEditor } from './project-editor';
import { projectSchema } from './snippet-panel-model';
import { hasReferences, RenameDialog, renameTargetOf, type RenameRequest } from './rename-dialog';
import type { RenameTarget } from './rename-plan';
import './form.css';

// seedFor
// What a new item starts with beyond its required name: a new target copies
// the first target's display, so it draws from the moment it is added.
function seedFor(workspace: Workspace, kind: string): Readonly<Record<string, string>> {
  const setup = workspace.loop.lastRun.get()?.result.model.project.targets[0]?.setup;
  return kind === 'target' && setup !== undefined && setup !== '' ? { setup } : {};
}

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
  // The remove guard, read when Remove is pressed: the actions are made before the hooks.
  const globalsRefusal = useRef<((node: FormNode) => string | undefined) | undefined>(undefined);
  // The rename dialog, while one is open: from "Rename…", or a name field asking.
  const [renaming, setRenaming] = useState<RenameRequest | undefined>(undefined);

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
      set: (field, value) => {
        // A globals.xml name that something references asks first (ui_spec §6.4):
        // rename everywhere, only here, or not at all.
        const node = file === 'globals.xml' && value !== undefined && field.endsWith('/name') ? findItem(controller.state.get().model, field.split('|')[0] ?? '') : undefined;
        const target = node === undefined ? undefined : renameTargetOf(node);
        if (target !== undefined && value !== undefined && value !== target.name && hasReferences(workspace, target)) {
          setRenaming({ target, ask: { newName: value, onlyHere: (name) => void controller.apply({ kind: 'set', field, value: name }) } });
          return;
        }
        controller.apply({ kind: 'set', field, value });
      },
      add: (list, kind, values) => void controller.apply({ kind: 'add', list, itemKind: kind, values: { ...seedFor(workspace, kind), ...values } }),
      remove: (item) => {
        // An item still in use is refused, naming its users (globals.xml's subjects, fonts and images).
        const node = file === 'globals.xml' ? findItem(controller.state.get().model, item) : undefined;
        const refusal = node === undefined ? undefined : globalsRefusal.current?.(node);
        if (refusal !== undefined) controller.refuse(refusal);
        else controller.apply({ kind: 'remove', item });
      },
      move: (item, delta) => void controller.apply({ kind: 'move', item, delta }),
      focusRange: (range) => workspace.formHighlight.set(range === undefined ? undefined : { path: file, ...range }),
    }),
    [controller, workspace, file],
  );

  // u8g2gl.xml's own editors: the display picker, the constructor snippet, the output example.
  const project = useProjectEditor(workspace, projectSchema(state.model));
  const hooks = file === 'u8g2gl.xml' ? project : undefined;
  const sectionsFor = renderSection ?? hooks?.renderSection;
  // globals.xml's: the font picker and the file chooser, on a field and on adding.
  const openRename = useCallback((target: RenameTarget) => setRenaming({ target }), []);
  const globalsHooks = useGlobalsEditor(workspace, state.model, state, actions, openRename);
  const globals = file === 'globals.xml' ? globalsHooks : undefined;
  globalsRefusal.current = globals?.removeRefusal;
  const sections = sectionsFor ?? globals?.renderSection;

  return (
    <div className="project-form-scroll" ref={root}>
      {children}
      {renaming !== undefined && file === 'globals.xml' && (
        <RenameDialog key={`${renaming.target.kind}:${renaming.target.name}:${renaming.ask?.newName ?? ''}`} workspace={workspace} request={renaming} onClose={() => setRenaming(undefined)} />
      )}
      <FormView
        file={file}
        state={state}
        actions={actions}
        {...(sections !== undefined ? { renderSection: sections } : {})}
        {...(hooks !== undefined ? { fieldControl: hooks.fieldControl, nodeExtra: hooks.nodeExtra, fieldNote: hooks.fieldNote } : {})}
        {...(globals !== undefined ? { fieldControl: globals.fieldControl, addChooser: globals.addChooser, nodeExtra: globals.nodeExtra, itemActions: globals.itemActions, fieldNote: globals.fieldNote } : {})}
      />
    </div>
  );
}

// findItem
// The form node with a key, anywhere in the form.
//   model — the form, or undefined before the first read
//   key   — the node's key
function findItem(model: FormModel | undefined, key: string): FormNode | undefined {
  let found: FormNode | undefined;
  const visit = (node: FormNode): void => {
    if (found !== undefined) return;
    if (node.key === key) found = node;
    node.parts.forEach(visit);
    node.lists.forEach((list) => list.items.forEach(visit));
  };
  for (const section of model?.sections ?? []) {
    if (section.node !== undefined) visit(section.node);
    section.list?.items.forEach(visit);
  }
  return found;
}
