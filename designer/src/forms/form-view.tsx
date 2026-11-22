/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-view.tsx
 * Purpose: The project-file form itself: every section, list, item and field
 *          of a `u8g2gl.xml` or `globals.xml` form, drawn from the form model
 *          and nothing else, so it covers every element and attribute the
 *          vocabulary declares (ui_spec §2 principle 8). Later editors replace
 *          a section with a richer one through `renderSection`; until one
 *          does, the generic section is shown, so nothing is left XML-only.
 * Description: A pure component over its props: the form, the Problems rows
 *              placed on it, the options reference fields offer, and the
 *              actions it calls. Repeating elements are lists with add,
 *              remove and reorder; each item is a group headed by its kind and
 *              name, holding its fields and its parts (a target's display).
 *              While the text cannot be read the last good form is shown,
 *              disabled, under a banner naming the problem.
 *
 *              Focus inside a section, item or part reports its range, which
 *              the XML highlights; `current` marks the node the XML caret is
 *              in. Neither moves focus.
 *
 *              Adding a kind that names a file or a font can open a chooser
 *              first (`AddChooser`, ui_spec §6.4): its "+" shows the file's
 *              own chooser below the list, choosing adds the item with the
 *              chosen values as one edit, and cancelling adds nothing. A kind
 *              with no chooser is added at once, as before. A file's editor
 *              can add buttons to each item's header (`itemActions`, the
 *              globals form's Rename…).
 *
 * Exports:
 * - FormActions:     What the form asks of its host
 * - FormViewState:   What the form draws
 * - SectionRenderer: A replacement for one section's generic body
 * - AddChooser:      A chooser that runs before an item of a kind is added
 * - FormView:        The component
 */

import { useState, type ReactNode } from 'react';
import type { ProblemRow } from '../pipeline/diagnostics';
import { FieldControl } from './form-controls';
import type { FormOptions } from './form-options';
import type { FormField, FormList, FormModel, FormNode, FormSection } from './form-model';
import type { FormProblems } from './form-problems';

/** What the form asks of its host. */
export interface FormActions {
  /** Sets a field, or removes it for undefined. */
  readonly set: (field: string, value: string | undefined) => void;
  /** Adds an item of a kind at the end of a list, with any values a chooser picked. */
  readonly add: (list: string, kind: string, values?: Readonly<Record<string, string>>) => void;
  readonly remove: (item: string) => void;
  readonly move: (item: string, delta: -1 | 1) => void;
  /** A section, item or part took focus: its range, for the XML to highlight. */
  readonly focusRange: (range: { readonly start: number; readonly end: number } | undefined) => void;
}

/** What the form draws. */
export interface FormViewState {
  /** The last form that could be read; undefined before the first. */
  readonly model: FormModel | undefined;
  /** Why the current text cannot be read, when it cannot. */
  readonly unreadable?: { readonly problem: string; readonly line: number; readonly column: number };
  readonly problems: FormProblems;
  readonly options: FormOptions;
  /** The key of the node the XML caret is in. */
  readonly current?: string;
  /** Why the last change was refused, until the next one. */
  readonly refusal?: string;
}

/**
 * A replacement for one section's generic body: given the section and the
 * generic body, the body to show instead, or undefined to keep the generic one.
 */
export type SectionRenderer = (section: FormSection, generic: ReactNode, readOnly: boolean) => ReactNode | undefined;

/**
 * A chooser that runs before an item is added: the file's own editor supplies
 * one per kind (the font picker for `font-builtin`), and the generic list
 * calls it in place of adding at once.
 */
export interface AddChooser {
  /** Whether adding an item of this kind opens a chooser first. */
  readonly has: (kind: string) => boolean;
  /**
   * The chooser for a kind, drawn below the list's "+" buttons.
   *
   * @param list    The list the item will join.
   * @param kind    The kind's vocabulary id.
   * @param choose  Adds the item with these values, as one edit, and closes.
   * @param cancel  Closes, adding nothing.
   */
  readonly render: (list: FormList, kind: string, choose: (values: Readonly<Record<string, string>>) => void, cancel: () => void) => ReactNode;
}

/** No rows. */
const NONE: readonly ProblemRow[] = [];

/** The props every part of the form passes down. */
interface Context {
  readonly state: FormViewState;
  readonly actions: FormActions;
  readonly readOnly: boolean;
  /** Extra content for a field, such as a note; undefined for none. */
  readonly fieldNote?: (field: FormField, node: FormNode) => ReactNode;
  /** Content after a node's fields, parts and lists (a target's constructor snippet); undefined for none. */
  readonly nodeExtra?: (node: FormNode) => ReactNode;
  /** A control to use in place of a field's generic one (the display picker); undefined for the generic. */
  readonly fieldControl?: (field: FormField, node: FormNode, commit: (value: string | undefined) => void) => ReactNode;
  /** Choosers that run before an item of a kind is added; undefined for none. */
  readonly addChooser?: AddChooser;
  /** Extra buttons in an item's header (Rename…); undefined for none. */
  readonly itemActions?: (item: FormNode) => ReactNode;
}

// NodeProblems
// The Problems rows on a node that name none of its fields.
function NodeProblems({ rows }: { readonly rows: readonly ProblemRow[] }): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <p key={row.key} className={`field-problem ${row.severity}`} data-code={row.code}>
          <code>{row.code}</code> {row.message}
        </p>
      ))}
    </>
  );
}

// NodeBody
// A node's fields, then each of its parts as a group, then its lists, then
// anything the file's own editor adds after them.
function NodeBody({ node, context }: { readonly node: FormNode; readonly context: Context }): React.JSX.Element {
  const { state, actions, readOnly } = context;
  return (
    <>
      {node.fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          options={state.options}
          readOnly={readOnly}
          problems={state.problems.byField.get(field.key) ?? NONE}
          note={context.fieldNote?.(field, node)}
          control={context.fieldControl?.(field, node, (value) => actions.set(field.key, value))}
          commit={(value) => actions.set(field.key, value)}
        />
      ))}
      <NodeProblems rows={state.problems.byNode.get(node.key) ?? NONE} />
      {node.parts.map((part) => (
        <fieldset
          key={part.key}
          className="form-part"
          data-node={part.key}
          data-element={part.element.id}
          data-current={state.current === part.key}
          onFocus={(event) => {
            event.stopPropagation();
            actions.focusRange(part.range ?? node.range);
          }}
        >
          <legend title={part.element.help}>{part.element.label}</legend>
          <NodeBody node={part} context={context} />
        </fieldset>
      ))}
      {node.lists.map((list) => (
        <ListBody key={list.key} list={list} context={context} />
      ))}
      {context.nodeExtra?.(node)}
    </>
  );
}

// itemName
// What an item's header calls it: its name, if it has one.
function itemName(item: FormNode): string | undefined {
  return item.fields.find((field) => field.attribute.name === 'name')?.value;
}

// atMinimum
// Whether removing an item would leave fewer of its kind than the vocabulary's
// minimum: the last target.
function atMinimum(list: FormList, item: FormNode): boolean {
  const minimum = item.element.minimum ?? 0;
  return minimum > 0 && list.items.filter((other) => other.element.id === item.element.id).length <= minimum;
}

// ListBody
// A list's items, each with move and remove, then an Add per kind, and the
// chooser of the kind being added while one is open.
function ListBody({ list, context }: { readonly list: FormList; readonly context: Context }): React.JSX.Element {
  const { state, actions, readOnly } = context;
  const [choosing, setChoosing] = useState<string | undefined>(undefined);
  const chooser = context.addChooser;
  const startAdd = (kind: string): void => {
    if (chooser?.has(kind) === true) setChoosing(kind);
    else actions.add(list.key, kind);
  };
  return (
    <div className="form-list" data-list={list.key} data-element={list.container.id}>
      {list.items.length === 0 && <p className="form-empty">None yet.</p>}
      {list.items.map((item, i) => {
        const name = itemName(item);
        const before = list.items[i - 1];
        const after = list.items[i + 1];
        const label = `${item.element.label}${name !== undefined ? ` ${name}` : ''}`;
        return (
          <div
            key={item.key}
            className="form-item"
            data-node={item.key}
            data-element={item.element.id}
            data-current={state.current === item.key}
            onFocus={(event) => {
              event.stopPropagation();
              actions.focusRange(item.range);
            }}
          >
            <div className="form-item-header">
              <span className="form-item-kind" title={item.element.help}>
                {item.element.label}
              </span>
              <span className="form-item-name">{name ?? ''}</span>
              <span className="spacer" />
              {!readOnly && context.itemActions?.(item)}
              <button
                type="button"
                aria-label={`Move ${label} up`}
                title="Move up"
                disabled={readOnly || before === undefined || before.parentStart !== item.parentStart}
                onClick={() => actions.move(item.key, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${label} down`}
                title="Move down"
                disabled={readOnly || after === undefined || after.parentStart !== item.parentStart}
                onClick={() => actions.move(item.key, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                title={atMinimum(list, item) ? (item.element.minimumReason ?? 'It cannot be removed') : 'Remove'}
                disabled={readOnly || atMinimum(list, item)}
                onClick={() => actions.remove(item.key)}
              >
                ✕
              </button>
            </div>
            <NodeBody node={item} context={context} />
          </div>
        );
      })}
      <div className="form-add">
        {list.kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className="action"
            disabled={readOnly}
            title={kind.help}
            aria-expanded={chooser?.has(kind.id) === true ? choosing === kind.id : undefined}
            onClick={() => startAdd(kind.id)}
          >
            + {kind.label}
          </button>
        ))}
      </div>
      {choosing !== undefined &&
        !readOnly &&
        chooser?.render(
          list,
          choosing,
          (values) => {
            setChoosing(undefined);
            actions.add(list.key, choosing, values);
          },
          () => setChoosing(undefined),
        )}
    </div>
  );
}

/**
 * @brief The form: a banner when its text cannot be read, then every section.
 *
 * @param renderSection Replaces a section's generic body, for a richer editor.
 * @param fieldNote     Extra content beneath a field.
 * @param nodeExtra     Content after a node's body (a target's constructor snippet).
 * @param fieldControl  A control in place of a field's generic one (the display picker).
 * @param addChooser    Choosers that run before an item of a kind is added (the font picker).
 * @param itemActions   Extra buttons in each item's header (Rename…).
 */
export function FormView({
  file,
  state,
  actions,
  renderSection,
  fieldNote,
  nodeExtra,
  fieldControl,
  addChooser,
  itemActions,
}: {
  readonly file: string;
  readonly state: FormViewState;
  readonly actions: FormActions;
  readonly renderSection?: SectionRenderer;
  readonly fieldNote?: Context['fieldNote'];
  readonly nodeExtra?: Context['nodeExtra'];
  readonly fieldControl?: Context['fieldControl'];
  readonly addChooser?: AddChooser;
  readonly itemActions?: Context['itemActions'];
}): React.JSX.Element {
  const readOnly = state.unreadable !== undefined;
  const context: Context = {
    state,
    actions,
    readOnly,
    ...(fieldNote !== undefined ? { fieldNote } : {}),
    ...(nodeExtra !== undefined ? { nodeExtra } : {}),
    ...(fieldControl !== undefined ? { fieldControl } : {}),
    ...(addChooser !== undefined ? { addChooser } : {}),
    ...(itemActions !== undefined ? { itemActions } : {}),
  };
  return (
    <div className="project-form" data-form-file={file} data-readonly={readOnly} aria-label={`${file} form`}>
      {state.unreadable !== undefined && (
        <div className="form-banner" role="alert">
          {file}:{state.unreadable.line}:{state.unreadable.column} cannot be read: {state.unreadable.problem}. The form shows the last text that could be
          read, and cannot be edited until the XML is fixed.
        </div>
      )}
      {state.refusal !== undefined && (
        <div className="form-banner refusal" role="status">
          {state.refusal}
        </div>
      )}
      {state.model === undefined ? (
        <p className="form-empty">Nothing to show yet.</p>
      ) : (
        state.model.sections.map((section) => {
          const count = section.list !== undefined ? ` (${section.list.items.length})` : '';
          const generic = section.list !== undefined ? <ListBody list={section.list} context={context} /> : section.node !== undefined ? <NodeBody node={section.node} context={context} /> : null;
          return (
            <section
              key={section.key}
              className="form-section"
              data-section={section.key}
              data-current={state.current === section.key}
              onFocus={() => actions.focusRange(section.range)}
            >
              <h3>
                {section.title}
                {count}
              </h3>
              {renderSection?.(section, generic, readOnly) ?? generic}
            </section>
          );
        })
      )}
    </div>
  );
}
