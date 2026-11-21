/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/globals-editor.tsx
 * Purpose: What the `globals.xml` form adds to the generic one (ui_spec §6.4):
 *          the font picker where a `<builtin>` names its font and on
 *          "+ Built-in font", and the file chooser where a `<bdf>`, `<xbm>` or
 *          `<convert>` names its file and on adding one — so a font or image
 *          is chosen, or imported, instead of typed into an empty box.
 *          Everything else in the file is the generic form's.
 * Description: `useGlobalsEditor` returns the hooks `FormView` takes for
 *              `globals.xml`, as `useProjectEditor` does for `u8g2gl.xml`: a
 *              `fieldControl` for `font-builtin/name` and for each `src`, and
 *              an `AddChooser` for those four kinds. The chooser's choice
 *              becomes the new item's values in the one add edit: a built-in
 *              font's `name`; a file's `src`, a `name` derived from it
 *              (file-chooser-model.ts) and, for `<convert>`, the PNG's
 *              `width` and `height`. The fonts the project already declares
 *              are read from the form itself, so the marks follow the text as
 *              it is typed, not the last run.
 *
 *              The fonts and images sections also show each item's size and
 *              users (`globals-assets.tsx`, after its fields), a `<bdf>`'s
 *              `range` field carries its presets, and `removeRefusal` names
 *              the users of an item that may not be removed yet. The
 *              subjects section is a table (`globals-subjects.tsx`), with
 *              each subject's cost and the bindings that use it. Every item
 *              that declares a name has "Rename…" (`rename-dialog.tsx`).
 *
 * Exports:
 * - GlobalsEditorHooks:  The hooks the globals.xml form takes
 * - useGlobalsEditor():  Those hooks, for a form
 */

import { useMemo, type ReactNode } from 'react';
import type { Workspace } from '../workspace';
import { FileChooser, SourceFileField } from './file-chooser';
import { derivedName, fileKindOf, fileKindOfField, pngSize, type FileKind } from './file-chooser-model';
import { BuiltinFontField, FontPicker } from './font-picker';
import { declaredBuiltins } from './font-picker-model';
import type { FormField, FormList, FormModel, FormNode } from './form-model';
import type { AddChooser, FormActions, FormViewState, SectionRenderer } from './form-view';
import { SubjectsTable } from './globals-subjects';
import { renameTargetOf } from './rename-dialog';
import type { RenameTarget } from './rename-plan';
import { AssetItemFacts, BdfRangeField } from './globals-assets';
import { removeRefusal } from './asset-usage';
import { workspaceReferences } from '../project/project-references';

/** The hooks the globals.xml form takes. */
export interface GlobalsEditorHooks {
  readonly fieldControl: (field: FormField, node: FormNode, commit: (value: string | undefined) => void) => ReactNode;
  readonly addChooser: AddChooser;
  /** A font's or image's size and users, after its fields. */
  readonly nodeExtra: (node: FormNode) => ReactNode;
  /** Why an item may not be removed now, or undefined when it may. */
  readonly removeRefusal: (node: FormNode) => string | undefined;
  /** The sections drawn their own way: the subjects table. */
  readonly renderSection: SectionRenderer;
  /** "Rename…" on each item that declares a name. */
  readonly itemActions: (item: FormNode) => ReactNode;
}

// RenameButton
// An item's "Rename…", for one that declares a renamable name.
function RenameButton({ item, onRename }: { readonly item: FormNode; readonly onRename: (target: RenameTarget) => void }): React.JSX.Element | null {
  const target = renameTargetOf(item);
  if (target === undefined) return null;
  return (
    <button type="button" className="rename-button" aria-label={`Rename ${item.element.label} ${target.name}`} title="Rename it here and everywhere it is used" onClick={() => onRename(target)}>
      Rename…
    </button>
  );
}

/** The subjects section's key. */
const SUBJECTS = 'globals.xml>subjects';

/** The vocabulary id of `<builtin>`. */
const BUILTIN = 'font-builtin';

// itemNames
// The names a list's items have now: a derived name must be none of them.
function itemNames(list: FormList): ReadonlySet<string> {
  return new Set(list.items.map((item) => item.fields.find((field) => field.attribute.name === 'name')?.value ?? '').filter((name) => name !== ''));
}

/**
 * @brief The values a file-naming element is added with: its `src`, a name
 *        derived from the file, and, for `<convert>`, the PNG's size.
 *
 * The size is read from the bytes an import already holds, or else from the
 * project file. When it cannot be read, width and height are written empty,
 * which the validator flags on those fields, for the author to fill in.
 *
 * @param workspace  The session, to read a project file's bytes.
 * @param list       The list the item joins, for the names already taken.
 * @param kind       The element's chooser.
 * @param path       The file chosen.
 * @param bytes      Its bytes, when it was just imported.
 */
async function addedValues(workspace: Workspace, list: FormList, kind: FileKind, path: string, bytes: Uint8Array | undefined): Promise<Readonly<Record<string, string>>> {
  const values = { name: derivedName(path, kind, itemNames(list)), src: path };
  if (kind.element !== 'image-convert') return values;
  let source = bytes;
  if (source === undefined) {
    const read = await workspace.documents.fileSystem.readBytes(path);
    source = read.ok ? read.bytes : undefined;
  }
  const size = source === undefined ? undefined : pngSize(source);
  return { ...values, width: size === undefined ? '' : String(size.width), height: size === undefined ? '' : String(size.height) };
}

/**
 * @brief The globals.xml form's hooks.
 *
 * @param workspace  The session: the project's files, for the file chooser.
 * @param model      The form as last read, for the fonts it declares.
 * @param state      What the form draws, for the tables' fields.
 * @param actions    The form's edits, which the tables make.
 * @param onRename   Opens the rename dialog for an item's name.
 */
export function useGlobalsEditor(
  workspace: Workspace,
  model: FormModel | undefined,
  state: FormViewState,
  actions: FormActions,
  onRename: (target: RenameTarget) => void,
): GlobalsEditorHooks {
  const declared = useMemo(() => declaredBuiltins(model), [model]);
  return useMemo<GlobalsEditorHooks>(
    () => ({
      fieldControl: (field, node, commit) => {
        // --- A <builtin>'s name: the font picker behind "Change font…" ---
        if (field.elementId === BUILTIN && field.attribute.name === 'name') return <BuiltinFontField field={field} declared={declared} commit={commit} />;
        // --- A <bdf>'s range: the presets, each with its compiled size ---
        if (field.elementId === 'font-bdf' && field.attribute.name === 'range') return <BdfRangeField workspace={workspace} field={field} node={node} commit={commit} />;
        // --- A <bdf>, <xbm> or <convert> src: the file chooser behind "Choose file…" ---
        const kind = fileKindOfField(field.elementId, field.attribute.name);
        return kind === undefined ? undefined : <SourceFileField workspace={workspace} field={field} kind={kind} commit={commit} />;
      },
      addChooser: {
        has: (kind) => kind === BUILTIN || fileKindOf(kind) !== undefined,
        render: (list, kindId, choose, cancel) => {
          // --- "+ Built-in font": the font picker; the choice is the new name ---
          if (kindId === BUILTIN) return <FontPicker label="Add a built-in font" current={undefined} declared={declared} onChoose={(name) => choose({ name })} onCancel={cancel} />;
          // --- "+ BDF font", "+ XBM image", "+ Converted image": the file chooser ---
          const kind = fileKindOf(kindId);
          if (kind === undefined) return null;
          return (
            <FileChooser
              workspace={workspace}
              kind={kind}
              current={undefined}
              label={`Add ${kind.article} ${kind.noun}`}
              onCancel={cancel}
              onChoose={(path, bytes) => void addedValues(workspace, list, kind, path, bytes).then(choose)}
            />
          );
        },
      },
      nodeExtra: (node) => <AssetItemFacts workspace={workspace} node={node} />,
      removeRefusal: (node) => removeRefusal(workspaceReferences(workspace), node),
      renderSection: (section, _generic, readOnly) =>
        section.key === SUBJECTS && section.list !== undefined ? (
          <SubjectsTable
            workspace={workspace}
            list={section.list}
            state={state}
            actions={actions}
            readOnly={readOnly}
            rowExtra={(item) => (readOnly ? null : <RenameButton item={item} onRename={onRename} />)}
          />
        ) : undefined,
      itemActions: (item) => <RenameButton item={item} onRename={onRename} />,
    }),
    [workspace, declared, state, actions, onRename],
  );
}
