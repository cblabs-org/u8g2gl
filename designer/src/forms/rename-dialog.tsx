/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/rename-dialog.tsx
 * Purpose: Renaming a subject, constant, style, font or image everywhere it
 *          is used (ui_spec §6.4, §14): the dialog behind every item's
 *          "Rename…", and the question a name field asks when its name is
 *          referenced. Before anything is written it shows each file and how
 *          many changes it gets, the generated symbols whose names change,
 *          and that application code calling them is left for the author.
 * Description: The plan is `rename-plan.ts`'s, recomputed as the new name is
 *              typed, so a refusal shows before any write and the button
 *              stays disabled. Applying is one edit per document, each one
 *              undo stop in its own document's history, as "Browse fonts…"
 *              does across two documents; cross-file undo is out of scope, and
 *              the dialog says so. Every file is opened before the edits are
 *              planned, because opening a document can write the names [U-1]
 *              supplies, which moves offsets.
 *
 *              Asked from a name field (`ask`), it is headed "You're renaming
 *              *old*" and offers Rename everywhere, Only here (the one
 *              `globals.xml` edit, leaving the validator to flag the rest) and
 *              Cancel.
 *
 * Exports:
 * - RenameRequest:      What the dialog is asked to do
 * - renameTargetOf():   The rename target a globals.xml item declares
 * - hasReferences():    Whether anything uses a name
 * - applyRename():      Land a rename, one edit per document
 * - RenameDialog:       The dialog
 */

import { useMemo, useState } from 'react';
import type { ReferenceKind } from '@u8g2gl/core/references/find-references.js';
import { CanvasEditor } from '../editing/canvas-editor';
import { referencesOf, workspaceReferences } from '../project/project-references';
import type { Workspace } from '../workspace';
import type { FormNode } from './form-model';
import { planRename, type RenamePlan, type RenameTarget } from './rename-plan';

/** What the dialog is asked to do. */
export interface RenameRequest {
  readonly target: RenameTarget;
  /**
   * Asked from a name field: the name it committed, and how to make only the
   * declaration's edit. Absent for "Rename…".
   */
  readonly ask?: { readonly newName: string; readonly onlyHere: (name: string) => void };
}

/** The kind of name each renamable globals.xml item declares, by vocabulary id. */
const RENAMABLE: Readonly<Record<string, ReferenceKind>> = {
  'subject-int': 'subject',
  'subject-string': 'subject',
  'subject-bool': 'subject',
  'subject-time': 'subject',
  'const-int': 'const',
  'const-string': 'const',
  style: 'style',
  'font-builtin': 'font',
  'font-bdf': 'font',
  'image-xbm': 'image',
  'image-convert': 'image',
};

/** How the dialog names each kind. */
const NOUNS: Readonly<Record<ReferenceKind, string>> = { subject: 'subject', const: 'constant', style: 'style', font: 'font', image: 'image' };

/** @brief The rename target a globals.xml item declares, or undefined for one with no renamable name. */
export function renameTargetOf(node: FormNode): RenameTarget | undefined {
  const kind = RENAMABLE[node.element.id];
  const name = node.fields.find((field) => field.attribute.name === 'name')?.value;
  if (kind === undefined || name === undefined || name === '') return undefined;
  return { kind, name, ...(kind === 'font' ? { builtin: node.element.id === 'font-builtin' } : {}) };
}

/** @brief Whether anything in the project uses a name, now. */
export function hasReferences(workspace: Workspace, target: RenameTarget): boolean {
  return (workspaceReferences(workspace)?.of(target.kind, target.name).uses.length ?? 0) > 0;
}

/**
 * @brief Lands a rename: one undo stop in each document it changes.
 *
 * @return The plan it applied, or the refusal, in which case nothing changed.
 */
export function applyRename(workspace: Workspace, target: RenameTarget, newName: string): RenamePlan {
  const manifests = workspace.loop.lastRun.get()?.result.model.manifests;
  if (manifests === undefined) return { ok: false, reason: 'The project has not been read yet.' };
  const planNow = (): RenamePlan => {
    const texts = workspace.documents.texts();
    return planRename(referencesOf(texts, manifests), texts, target, newName);
  };
  // --- Step 1: Refused before any write ---
  const first = planNow();
  if (!first.ok) return first;
  // --- Step 2: Open every file it touches, then plan against their texts now ---
  // Opening a document can write the names [U-1] supplies, which moves offsets,
  // so the edits are planned once every model holds its text, and never again
  // part-way: after the first file the old name is no longer declared.
  for (const { file } of first.files) workspace.documents.open(file);
  const plan = planNow();
  if (!plan.ok) return plan;
  // --- Step 3: One undo stop in each document ---
  const editor = new CanvasEditor((path) => workspace.documents.open(path));
  for (const part of plan.files) {
    // The edits are offsets into the text planned against: should the model
    // hold anything else when they land, this file is left alone, not corrupted.
    const expected = workspace.documents.textOf(part.file);
    editor.apply(part.file, (text) => (text === expected ? part.edits : []));
  }
  return plan;
}

/**
 * @brief The rename dialog.
 *
 * @param workspace The session.
 * @param request   What to rename, and whether a name field is asking.
 * @param onClose   Closes it; called after a rename, Only here or Cancel.
 */
export function RenameDialog({ workspace, request, onClose }: { readonly workspace: Workspace; readonly request: RenameRequest; readonly onClose: () => void }): React.JSX.Element {
  const { target, ask } = request;
  const noun = NOUNS[target.kind];
  const [newName, setNewName] = useState(ask?.newName ?? target.name);
  const refs = workspaceReferences(workspace);
  const texts = workspace.documents.texts();
  const plan = useMemo<RenamePlan>(
    () => (refs === undefined ? { ok: false, reason: 'The project has not been read yet.' } : planRename(refs, texts, target, newName)),
    [refs, texts, target, newName],
  );
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const title = ask !== undefined ? `You're renaming ${target.name}. Rename it in the files that reference it too?` : `Rename ${noun} ${target.name}`;

  const renameEverywhere = (): void => {
    const done = applyRename(workspace, target, newName);
    if (done.ok) onClose();
    else setRefused(done.reason);
  };

  return (
    <div className="rename-dialog" role="dialog" aria-modal="false" aria-label={title} data-kind={target.kind} data-name={target.name}>
      <h4>
        {ask !== undefined ? (
          <>
            You're renaming <em>{target.name}</em>. Rename it in the files that reference it too?
          </>
        ) : (
          <>
            Rename {noun} <code>{target.name}</code>
          </>
        )}
      </h4>
      <label className="rename-name">
        New name
        <input
          type="text"
          aria-label="New name"
          value={newName}
          spellCheck={false}
          autoFocus
          onChange={(event) => {
            setNewName(event.target.value);
            setRefused(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && plan.ok) renameEverywhere();
            if (event.key === 'Escape') onClose();
          }}
        />
      </label>
      {newName.trim() === target.name && refused === undefined ? (
        <p className="field-reason">Type the new name. Every file that references {target.name} is listed here before anything changes.</p>
      ) : !plan.ok || refused !== undefined ? (
        <p className="field-problem error rename-refusal" role="alert">
          {refused ?? (plan.ok ? '' : plan.reason)}
        </p>
      ) : (
        <>
          <ul className="rename-files" aria-label="Files it changes">
            {plan.files.map((part) => (
              <li key={part.file} data-file={part.file} data-changes={part.edits.length}>
                <code>{part.file}</code> {part.edits.length} {part.edits.length === 1 ? 'change' : 'changes'}
              </li>
            ))}
          </ul>
          {plan.skipped.length > 0 && (
            <p className="field-reason rename-skipped" data-skipped={plan.skipped.join(' ')}>
              Not renamed in {plan.skipped.join(', ')}: {plan.skipped.length === 1 ? 'it declares' : 'each declares'} a style of its own called {target.name}, which is the one
              used there.
            </p>
          )}
          {plan.symbols.length > 0 && (
            <div className="rename-symbols">
              <p className="field-reason">Generated symbols that change:</p>
              <ul aria-label="Generated symbols that change">
                {plan.symbols.map((symbol) => (
                  <li key={symbol.from} data-from={symbol.from} data-to={symbol.to}>
                    <code>{symbol.from}</code> → <code>{symbol.to}</code>
                  </li>
                ))}
              </ul>
              <p className="field-problem warning">
                Application code that calls the old {plan.symbols.length === 1 ? 'symbol' : 'symbols'} is not changed, and will not compile until you update it by hand.
              </p>
            </div>
          )}
          <p className="field-reason">Each file is changed as its own edit, so undo takes the rename back one file at a time, in that file.</p>
        </>
      )}
      <div className="rename-actions">
        {ask !== undefined ? (
          <>
            <button type="button" className="action primary" disabled={!plan.ok} onClick={renameEverywhere}>
              Rename everywhere
            </button>
            <button
              type="button"
              className="action"
              onClick={() => {
                ask.onlyHere(newName);
                onClose();
              }}
            >
              Only here
            </button>
          </>
        ) : (
          <button type="button" className="action primary" disabled={!plan.ok} onClick={renameEverywhere}>
            Rename
          </button>
        )}
        <button type="button" className="action" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
