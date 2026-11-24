/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/samples-view.tsx
 * Purpose: The Sample data view (ruling 7, ui_spec §11): the one place an
 *          author manages the project's sample sets and edits everything they
 *          hold, so no sample value needs the JSON typed by hand. It keeps the
 *          three kinds of value apart: the initial values are shown as
 *          compiled in, a set's values beside them, and every collection
 *          instance's rows as a typed grid.
 * Description: Four parts, top to bottom:
 *              - **Sets:** pick the active set (or none, the initial values);
 *                create, duplicate, rename and delete sets. Delete asks first,
 *                here in the view. Save and undo act on the active set's file.
 *              - **Values:** one row per subject, one column per set, beside
 *                the initial value. A value a set leaves out is inherited.
 *              - **Collections:** every collection instance on every screen,
 *                its rows in the active set as a typed grid with the capacity
 *                shown (`8 / 12`): add, remove and reorder rows, and paste a
 *                JSON array or CSV with a header row. Selecting a collection
 *                element on the canvas opens its grid and scrolls to it.
 *              Every change goes through `SampleSets`, one undo step each, and
 *              never touches the project's XML.
 *
 * Exports:
 * - SamplesView:   The view, for the primary sidebar
 */

import { useEffect, useRef, useState } from 'react';
import { countRender } from '../perf/render-count';
import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';
import type { Workspace } from '../workspace';
import { capacityLabel, newRow } from './grid-rules';
import { pasteRows, type PasteResult } from './paste-rows';
import { FieldCell, SubjectValueCell } from './sample-cells';
import { rowsIn, withRows, withValue } from './sample-sets';
import type { SampleCollection, SampleShape } from './sample-shape';
import './samples.css';

/** A shape with nothing in it, until the first run. */
const NO_SHAPE: SampleShape = { subjects: [], collections: [], screenFiles: new Set(), elements: new Map() };

/** A collection's key in the view: its file and element. */
const keyOf = (collection: Pick<SampleCollection, 'file' | 'element'>): string => `${collection.file}#${collection.element}`;

/** @brief The Sample data view. */
export function SamplesView(): React.JSX.Element {
  countRender('SamplesView');
  const workspace = useWorkspace();
  // A run follows every edit to any document, a set's included: re-reading
  // the sets then keeps the view on their current text.
  const run = useObservable(workspace.loop.lastRun);
  const names = useObservable(workspace.samples.names);
  const active = useObservable(workspace.activeSampleSet.name);
  useObservable(workspace.documents.dirty);
  const shape = run?.result.sampleShape ?? NO_SHAPE;
  const activeName = active !== undefined && names.includes(active) ? active : undefined;

  return (
    <aside className="sidebar samples-view" aria-label="Sample data">
      <header className="sidebar-title">Sample data</header>
      <SetBar workspace={workspace} names={names} active={activeName} />
      <ValuesTable workspace={workspace} shape={shape} names={names} />
      <Collections workspace={workspace} shape={shape} active={activeName} />
    </aside>
  );
}

/** What the set bar's name field is for, while it is open. */
type NameMode = 'new' | 'duplicate' | 'rename';

// SetBar
// The sets: the active one chosen, and the file operations on them.
function SetBar({ workspace, names, active }: { readonly workspace: Workspace; readonly names: readonly string[]; readonly active: string | undefined }): React.JSX.Element {
  const [mode, setMode] = useState<NameMode | undefined>(undefined);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const samples = workspace.samples;

  const open = (next: NameMode): void => {
    setMode(next);
    setConfirming(false);
    setMessage(undefined);
    setName(next === 'new' ? '' : next === 'duplicate' ? `${active ?? 'set'} copy` : (active ?? ''));
  };
  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    const refused =
      mode === 'new'
        ? await samples.create(trimmed)
        : mode === 'duplicate' && active !== undefined
          ? await samples.duplicate(active, trimmed)
          : mode === 'rename' && active !== undefined
            ? await samples.rename(active, trimmed)
            : 'choose a set first';
    if (refused !== undefined) {
      setMessage(refused);
      return;
    }
    if (mode !== 'rename') workspace.activeSampleSet.choose(trimmed);
    setMode(undefined);
    setMessage(undefined);
  };

  return (
    <section className="samples-section samples-sets" aria-label="Sample sets">
      <h3>Sets</h3>
      <ul className="samples-set-list" role="radiogroup" aria-label="Active sample set">
        <li>
          <button type="button" role="radio" aria-checked={active === undefined} data-set="" className="sample-set" onClick={() => workspace.activeSampleSet.choose(undefined)}>
            None <span className="sample-set-note">initial values</span>
          </button>
        </li>
        {names.map((set) => (
          <li key={set}>
            <button type="button" role="radio" aria-checked={active === set} data-set={set} className="sample-set" onClick={() => workspace.activeSampleSet.choose(set)}>
              {set}
              {samples.isDirty(set) && (
                <span className="sample-set-dirty" title="Unsaved">
                  ●
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {names.length === 0 && <p className="samples-hint">No sets yet: the canvas shows the initial values. A set is a file in samples/, shared with the project.</p>}
      <div className="samples-actions">
        <button type="button" className="action" onClick={() => open('new')}>
          New…
        </button>
        <button type="button" className="action" disabled={active === undefined} onClick={() => open('duplicate')}>
          Duplicate…
        </button>
        <button type="button" className="action" disabled={active === undefined} onClick={() => open('rename')}>
          Rename…
        </button>
        <button
          type="button"
          className="action"
          disabled={active === undefined}
          onClick={() => {
            setMode(undefined);
            setConfirming(true);
          }}
        >
          Delete…
        </button>
        <button type="button" className="action" disabled={active === undefined || !samples.isDirty(active)} onClick={() => active !== undefined && void samples.save(active)}>
          Save
        </button>
        <button type="button" className="action" aria-label="Undo the last change to the set" disabled={active === undefined} onClick={() => active !== undefined && samples.undo(active)}>
          Undo
        </button>
        <button type="button" className="action" aria-label="Redo the last undone change to the set" disabled={active === undefined} onClick={() => active !== undefined && samples.redo(active)}>
          Redo
        </button>
      </div>
      {mode !== undefined && (
        <form
          className="samples-name"
          aria-label={mode === 'new' ? 'New set' : mode === 'duplicate' ? 'Duplicate set' : 'Rename set'}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            {mode === 'new' ? 'New set' : mode === 'duplicate' ? `Copy of ${active ?? ''} as` : `Rename ${active ?? ''} to`}{' '}
            <input type="text" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" className="action primary" disabled={name.trim() === ''}>
            {mode === 'rename' ? 'Rename' : 'Create'}
          </button>
          <button type="button" className="action" onClick={() => setMode(undefined)}>
            Cancel
          </button>
        </form>
      )}
      {confirming && active !== undefined && (
        <div className="samples-confirm" role="alertdialog" aria-label={`Delete ${active}`}>
          <p>
            Delete <code>{workspace.samples.pathOf(active)}</code>? The file is removed from the project{samples.isDirty(active) ? ', with its unsaved changes' : ''}.
          </p>
          <button
            type="button"
            className="action danger"
            onClick={() => {
              setConfirming(false);
              void samples.remove(active);
            }}
          >
            Delete
          </button>
          <button type="button" className="action" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {message !== undefined && (
        <p className="field-problem warning" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

// ValuesTable
// The subjects' values: the initial value as compiled in, and one column per set.
function ValuesTable({ workspace, shape, names }: { readonly workspace: Workspace; readonly shape: SampleShape; readonly names: readonly string[] }): React.JSX.Element {
  const documents = new Map(names.map((name) => [name, workspace.samples.documentOf(name)]));
  return (
    <section className="samples-section" aria-label="Sample values">
      <h3>Values</h3>
      {shape.subjects.length === 0 ? (
        <p className="samples-hint">globals.xml declares no subjects.</p>
      ) : (
        <div className="samples-table-wrap">
          <table className="samples-values">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col" data-column="initial" title="Compiled into the firmware: the device boots with it">
                  Initial value <span className="sample-set-note">compiled in</span>
                </th>
                {names.map((name) => (
                  <th key={name} scope="col" data-set={name}>
                    {name} <span className="sample-set-note">sample</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shape.subjects.map((subject) => (
                <tr key={subject.name} data-subject={subject.name}>
                  <th scope="row">
                    <code>{subject.name}</code> <span className="sample-set-note">{subject.type}</span>
                  </th>
                  <td data-column="initial">{subject.initial ?? <span className="sample-set-note">none</span>}</td>
                  {names.map((name) => {
                    const document = documents.get(name);
                    return (
                      <td key={name} data-set={name}>
                        {document === undefined ? (
                          <span className="sample-set-note">not valid JSON</span>
                        ) : (
                          <SubjectValueCell
                            subject={subject}
                            set={name}
                            value={document.values[subject.name]}
                            onCommit={(value) => void workspace.samples.edit(name, (d) => withValue(d, subject.name, value))}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Collections
// Every collection instance, its grid open on request or when it is selected
// on the canvas.
function Collections({ workspace, shape, active }: { readonly workspace: Workspace; readonly shape: SampleShape; readonly active: string | undefined }): React.JSX.Element {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const sections = useRef(new Map<string, HTMLElement>());
  const collections = shape.collections;

  // --- Canvas link: a collection selected on the canvas opens its grid ---
  useEffect(() => {
    const follow = (): void => {
      const selection = workspace.selection.current.get();
      if (selection.names.length !== 1 || selection.file === undefined) return;
      const key = keyOf({ file: selection.file, element: selection.names[0] ?? '' });
      if (!collections.some((c) => keyOf(c) === key)) return;
      setOpen((current) => (current.has(key) ? current : new Set([...current, key])));
      // After the grid has rendered open.
      requestAnimationFrame(() => sections.current.get(key)?.scrollIntoView({ block: 'nearest' }));
    };
    follow();
    return workspace.selection.current.subscribe(follow);
  }, [workspace, collections]);

  const toggle = (key: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="samples-section" aria-label="Collections">
      <h3>Collections</h3>
      {collections.length === 0 && <p className="samples-hint">No screen has a collection widget: an element whose manifest declares &lt;data&gt;.</p>}
      {collections.length > 0 && active === undefined && <p className="samples-hint">Choose a set, or create one, to edit its rows. With none, the canvas shows no rows.</p>}
      {collections.map((collection) => {
        const key = keyOf(collection);
        const isOpen = open.has(key);
        return (
          <section
            key={key}
            className="sample-collection"
            data-collection={collection.element}
            data-file={collection.file}
            data-open={isOpen}
            ref={(element) => {
              if (element === null) sections.current.delete(key);
              else sections.current.set(key, element);
            }}
          >
            <button type="button" className="sample-collection-head" aria-expanded={isOpen} onClick={() => toggle(key)}>
              <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> <code>{collection.element}</code>{' '}
              <span className="sample-set-note">
                {collection.label} · {collection.screen}
              </span>
              {active !== undefined && collection.blocks.length === 1 && (
                <span className="sample-capacity" data-capacity={collection.blocks[0]?.capacity ?? ''}>
                  {capacityLabel(rowsIn(workspace.samples.documentOf(active), collection.file, collection.element).length, collection.blocks[0]?.capacity)}
                </span>
              )}
            </button>
            {isOpen && active !== undefined && <CollectionGrid workspace={workspace} collection={collection} set={active} />}
          </section>
        );
      })}
    </section>
  );
}

// CollectionGrid
// One collection's rows in one set, as a typed grid, with paste.
function CollectionGrid({ workspace, collection, set }: { readonly workspace: Workspace; readonly collection: SampleCollection; readonly set: string }): React.JSX.Element {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [report, setReport] = useState<PasteResult | undefined>(undefined);
  const block = collection.blocks[0];
  const document = workspace.samples.documentOf(set);
  if (block === undefined || collection.blocks.length > 1) {
    return <p className="samples-hint">&lt;{collection.tag}&gt; declares {collection.blocks.length} &lt;data&gt; blocks; a sample set fills only an element with one.</p>;
  }
  if (document === undefined) {
    return <p className="field-problem warning">{workspace.samples.pathOf(set)} is not valid JSON: fix it in its editor tab first.</p>;
  }
  const rows = rowsIn(document, collection.file, collection.element);
  const full = block.capacity !== undefined && rows.length >= block.capacity;
  // write
  // The collection's rows replaced, as one undo step.
  const write = (next: readonly unknown[]): void => void workspace.samples.edit(set, (d) => withRows(d, collection.file, collection.element, next));
  const rowOf = (row: unknown): Record<string, unknown> => (typeof row === 'object' && row !== null && !Array.isArray(row) ? (row as Record<string, unknown>) : {});

  return (
    <div className="sample-grid-wrap">
      <table className="sample-grid" aria-label={`${collection.element} rows in ${set}`}>
        <thead>
          <tr>
            <th scope="col">#</th>
            {block.fields.map((field) => (
              <th key={field.name} scope="col" title={field.help} data-field={field.name}>
                {field.name}
                {field.repeated && <span className="sample-set-note"> ×{field.repeat ?? '…'}</span>}
              </th>
            ))}
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} data-row={index}>
              <th scope="row">{index + 1}</th>
              {block.fields.map((field) => (
                <td key={field.name} data-field={field.name}>
                  <FieldCell
                    field={field}
                    row={index}
                    value={rowOf(row)[field.name]}
                    onCommit={(value) => write(rows.map((r, i) => (i === index ? { ...rowOf(r), [field.name]: value } : r)))}
                  />
                </td>
              ))}
              <td className="sample-row-actions">
                <button type="button" aria-label={`Move row ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => write(moved(rows, index, -1))}>
                  ↑
                </button>
                <button type="button" aria-label={`Move row ${index + 1} down`} title="Move down" disabled={index === rows.length - 1} onClick={() => write(moved(rows, index, 1))}>
                  ↓
                </button>
                <button type="button" aria-label={`Remove row ${index + 1}`} title="Remove" onClick={() => write(rows.filter((_, i) => i !== index))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="samples-hint">No rows: the widget draws empty.</p>}
      <div className="samples-actions">
        <button type="button" className="action" disabled={full} title={full ? `At its capacity of ${block.capacity}` : 'Add a row of defaults'} onClick={() => write([...rows, newRow(block)])}>
          + Row
        </button>
        <button
          type="button"
          className="action"
          aria-expanded={pasting}
          onClick={() => {
            setPasting(!pasting);
            setReport(undefined);
          }}
        >
          Paste…
        </button>
      </div>
      {pasting && (
        <div className="sample-paste">
          <label>
            Rows as a JSON array, or CSV with a header row naming the fields
            <textarea aria-label={`Paste rows into ${collection.element}`} rows={5} value={pasted} onChange={(event) => setPasted(event.target.value)} />
          </label>
          <button
            type="button"
            className="action primary"
            disabled={pasted.trim() === ''}
            onClick={() => {
              const room = block.capacity === undefined ? undefined : Math.max(0, block.capacity - rows.length);
              const result = pasteRows(pasted, block, room);
              setReport(result);
              if (result.rows.length > 0) write([...rows, ...result.rows]);
            }}
          >
            Add rows
          </button>
        </div>
      )}
      {report !== undefined && <PasteReport result={report} />}
    </div>
  );
}

// PasteReport
// What a paste did: the rows that landed, every refused value by row and
// field, and the mapping's notes.
function PasteReport({ result }: { readonly result: PasteResult }): React.JSX.Element {
  return (
    <div className="sample-paste-report" role="status" data-added={result.rows.length} data-rejected={result.rejected.length}>
      {result.failure !== undefined ? (
        <p className="field-problem warning">{result.failure}</p>
      ) : (
        <p>
          {result.rows.length} row{result.rows.length === 1 ? '' : 's'} added{result.rejected.length > 0 ? `; ${result.rejected.length} refused` : ''}.
        </p>
      )}
      {result.rejected.length > 0 && (
        <ul className="sample-paste-rejected">
          {result.rejected.map((r, i) => (
            <li key={i} className="field-problem warning" data-row={r.row} data-field={r.field ?? ''}>
              row {r.row}
              {r.field !== undefined ? `, ${r.field}` : ''}: {r.reason}
            </li>
          ))}
        </ul>
      )}
      {result.notes.length > 0 && (
        <ul className="sample-paste-notes">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// moved
// The rows with one moved by `by` places.
function moved(rows: readonly unknown[], index: number, by: number): unknown[] {
  const next = [...rows];
  const [row] = next.splice(index, 1);
  next.splice(index + by, 0, row);
  return next;
}
