/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/file-chooser.tsx
 * Purpose: The chooser for a project file a `globals.xml` element names — a
 *          `<bdf>` font, an `<xbm>` image, a `<convert>` PNG (ui_spec §6.4) —
 *          on that kind's "+" and behind its `src` field's "Choose file…". It
 *          lists the project's files of the kind, and imports one from the
 *          author's computer into the project, so a font or image no longer
 *          has to be copied in by hand and its path typed.
 * Description: `FileChooser` is inline, as the font and display pickers are.
 *              The list is the project listing the session already follows
 *              (`documents.files`), filtered by extension; `/api/files`
 *              carries no sizes, so none are shown. "Import from your
 *              computer…" opens the browser's own file dialog, limited to the
 *              kind's extensions; the file is proposed at `fonts/<file>` or
 *              `images/<file>`, the author may change the path, and the write
 *              goes through the project file system's `writeBytes` — the
 *              design server's existing `PUT /api/file` — with "must not
 *              exist", so an import never replaces a file. A path that exists
 *              is refused before the write and, should one appear meanwhile,
 *              by the server. An import is a file write, not a document edit,
 *              and the chooser says so: undo removes the element that names
 *              the file, never the file.
 *              `SourceFileField` is a `src` field's control: the text box,
 *              still typeable, and the chooser behind "Choose file…".
 *
 * Exports:
 * - FileChooser:      The chooser: the project's files of a kind, and Import
 * - SourceFileField:  A `src` field, with the chooser behind a toggle
 */

import { useRef, useState } from 'react';
import type { Workspace } from '../workspace';
import { useObservable } from '../ui/use-observable';
import { FieldTextControl } from './form-controls';
import type { FormField } from './form-model';
import { filesOfKind, importPath, importRefusal, type FileKind } from './file-chooser-model';

/** A file picked in the browser's dialog, waiting for its path to be confirmed. */
interface PendingImport {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly path: string;
}

/**
 * @brief The file chooser: the project's files of a kind, and Import.
 *
 * @param workspace  The session: the project listing and file system.
 * @param kind       What the chooser lists and imports.
 * @param current    The file named now, selected in the list.
 * @param label      What the chooser is for, as its heading says.
 * @param onChoose   Called once with the file chosen, and its bytes when it
 *                   was just imported (so a PNG's size need not be read back).
 * @param onCancel   Closes the chooser without choosing.
 */
export function FileChooser({
  workspace,
  kind,
  current,
  label,
  onChoose,
  onCancel,
}: {
  readonly workspace: Workspace;
  readonly kind: FileKind;
  readonly current: string | undefined;
  readonly label: string;
  readonly onChoose: (path: string, bytes?: Uint8Array) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const files = useObservable(workspace.documents.files);
  const offered = filesOfKind(files, kind);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [writing, setWriting] = useState(false);
  const refusal = pending === undefined ? undefined : importRefusal(pending.path, kind, files);

  // --- The browser's dialog gave a file: read it and propose a path ---
  const picked = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFailure(undefined);
    setPending({ name: file.name, bytes, path: importPath(file.name, kind) });
  };

  // --- Import: write with "must not exist", then choose what was written ---
  const write = async (): Promise<void> => {
    if (pending === undefined || refusal !== undefined) return;
    setWriting(true);
    const result = await workspace.documents.fileSystem.writeBytes(pending.path, pending.bytes, { expectedVersion: null });
    setWriting(false);
    if (!result.ok) {
      setFailure(
        result.code === 'conflict'
          ? `${pending.path} already exists, and an import never replaces a file. Rename it to import it.`
          : `${pending.path} could not be written: ${result.message}`,
      );
      return;
    }
    setPending(undefined);
    onChoose(result.path, pending.bytes);
  };

  return (
    <div className="file-chooser" role="group" aria-label={label} data-kind={kind.element}>
      <div className="font-picker-head">
        <span className="font-picker-title">{label}</span>
        <span className="spacer" />
        <button type="button" className="action" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="font-options" role="listbox" aria-label={`${kind.noun} files`}>
        {offered.map((path) => (
          <button key={path} type="button" role="option" className="file-option" aria-selected={path === current} data-path={path} onClick={() => onChoose(path)}>
            <code>{path}</code>
          </button>
        ))}
        {offered.length === 0 && (
          <p className="form-empty">
            No {kind.extensions.join(' or ')} file in the project yet. Import one from your computer.
          </p>
        )}
      </div>
      <div className="file-import">
        <input
          ref={input}
          type="file"
          hidden
          accept={kind.extensions.join(',')}
          aria-label={`${kind.noun} to import`}
          onChange={(event) => {
            void picked(event.target.files?.[0]);
            // Cleared, so choosing the same file again still fires a change.
            event.target.value = '';
          }}
        />
        <button type="button" className="action" data-action="import-file" onClick={() => input.current?.click()}>
          Import from your computer…
        </button>
        <p className="field-reason">Importing writes the file into the project at once. Undo does not remove it: it undoes only the element that names the file.</p>
        {pending !== undefined && (
          <div className="file-import-path">
            <label className="display-search">
              Import {pending.name} as{' '}
              <input
                type="text"
                aria-label="Import path"
                value={pending.path}
                spellCheck={false}
                onChange={(event) => {
                  setFailure(undefined);
                  setPending({ ...pending, path: event.target.value });
                }}
              />
            </label>
            <div className="form-add">
              <button type="button" className="action primary" disabled={refusal !== undefined || writing} onClick={() => void write()}>
                Import
              </button>
              <button
                type="button"
                className="action"
                onClick={() => {
                  setPending(undefined);
                  setFailure(undefined);
                }}
              >
                Don’t import
              </button>
            </div>
            {(refusal ?? failure) !== undefined && (
              <p className="field-problem error" role="alert">
                {refusal ?? failure}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @brief A `src` field: the text box, still typeable, and the chooser behind
 *        "Choose file…". Choosing writes the path, as one edit.
 *
 * @param workspace  The session.
 * @param field      The `src` field.
 * @param kind       Its element's chooser.
 * @param commit     Writes the path.
 */
export function SourceFileField({
  workspace,
  field,
  kind,
  commit,
}: {
  readonly workspace: Workspace;
  readonly field: FormField;
  readonly kind: FileKind;
  readonly commit: (value: string | undefined) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const files = useObservable(workspace.documents.files);
  return (
    <div className="font-field" data-src={field.value ?? ''}>
      <FieldTextControl field={field} disabled={false} commit={commit} suggestions={filesOfKind(files, kind)} />
      <div className="display-current">
        <button type="button" className="action" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Choose file…'}
        </button>
      </div>
      {open && (
        <FileChooser
          workspace={workspace}
          kind={kind}
          current={field.value}
          label={`Choose the ${kind.noun}`}
          onCancel={() => setOpen(false)}
          onChoose={(path) => {
            setOpen(false);
            if (path !== field.value) commit(path);
          }}
        />
      )}
    </div>
  );
}
