/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/globals-subjects.tsx
 * Purpose: globals.xml's subjects as a table (ui_spec §6.4): one row per
 *          subject with its name, type, the value the firmware boots with,
 *          a string's `max_len` with what it costs, and who binds it, so the
 *          author sees at a glance what each subject is for and what it
 *          costs, and can go straight to a binding.
 * Description: Replaces the generic list through `renderSection`. Every cell
 *              that edits is the generic form's own `FieldControl`, so each
 *              field still commits on Enter or blur as one undo stop and shows
 *              its own problems. A row's problems that name no field follow
 *              the row. "Used by" is the reference finder's answer; a click
 *              selects that element on its screen. Remove goes through the
 *              form's own guard, which refuses a subject still bound.
 *
 * Exports:
 * - SubjectsTable:    The table, for the subjects section
 * - stringCost():     The bytes a string subject's buffer takes
 */

import type { ReactNode } from 'react';
import type { ProblemRow } from '../pipeline/diagnostics';
import type { Workspace } from '../workspace';
import { goToReference, workspaceReferences } from '../project/project-references';
import { nameUsers } from './asset-usage';
import { FieldControl } from './form-controls';
import type { FormField, FormList, FormNode } from './form-model';
import type { FormActions, FormViewState } from './form-view';

/** No rows. */
const NONE: readonly ProblemRow[] = [];

/** What the "Initial value" heading's ⓘ says. */
const INITIAL_VALUE_HELP = 'The value the firmware boots with. It is compiled in: the device starts with it until the application calls ui_set_<name>().';

/**
 * @brief The bytes a string subject's buffer takes: `max_len` characters and
 *        the terminator (§8.2). Undefined for a value that is not a count.
 *
 * @param maxLen The `max_len` as written, or the vocabulary's default.
 */
export function stringCost(maxLen: string | undefined): number | undefined {
  const count = maxLen === undefined ? Number.NaN : Number(maxLen.trim());
  return Number.isInteger(count) && count >= 0 ? count + 1 : undefined;
}

// fieldOf
// An item's field for an attribute.
function fieldOf(item: FormNode, attribute: string): FormField | undefined {
  return item.fields.find((field) => field.attribute.name === attribute);
}

/**
 * @brief The subjects table.
 *
 * @param workspace The session: its references, and where a user goes.
 * @param list      The subjects list.
 * @param state     The form, for each field's problems and options.
 * @param actions   The form's edits, and Remove's guard.
 * @param readOnly  The text cannot be read: nothing edits.
 * @param rowExtra  Anything to add to a row's actions (Rename…).
 */
export function SubjectsTable({
  workspace,
  list,
  state,
  actions,
  readOnly,
  rowExtra,
}: {
  readonly workspace: Workspace;
  readonly list: FormList;
  readonly state: FormViewState;
  readonly actions: FormActions;
  readonly readOnly: boolean;
  readonly rowExtra?: (item: FormNode) => ReactNode;
}): React.JSX.Element {
  const refs = workspaceReferences(workspace);
  // cell
  // One field's generic control, or nothing for an attribute this kind lacks.
  const cell = (item: FormNode, attribute: string): ReactNode => {
    const field = fieldOf(item, attribute);
    if (field === undefined) return <span className="subject-none">—</span>;
    return <FieldControl field={field} options={state.options} readOnly={readOnly} problems={state.problems.byField.get(field.key) ?? NONE} commit={(value) => actions.set(field.key, value)} />;
  };
  return (
    <div className="subjects-table-wrap" data-list={list.key}>
      {list.items.length === 0 ? (
        <p className="form-empty">None yet.</p>
      ) : (
        <table className="subjects-table" aria-label="Subjects">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col" data-column="value">
                Initial value{' '}
                <span className="field-info" role="img" aria-label={INITIAL_VALUE_HELP} title={INITIAL_VALUE_HELP}>
                  ⓘ
                </span>
                <span className="subject-heading-note">boots with</span>
              </th>
              <th scope="col">max_len</th>
              <th scope="col">Used by</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item, i) => {
              const name = fieldOf(item, 'name')?.value ?? '';
              const maxLen = fieldOf(item, 'max_len');
              const cost = maxLen === undefined ? undefined : stringCost(maxLen.value ?? maxLen.attribute.default);
              const users = refs === undefined || name === '' ? [] : nameUsers(refs, 'subject', name);
              const label = `${item.element.label} ${name}`;
              const before = list.items[i - 1];
              const after = list.items[i + 1];
              return (
                <tr
                  key={item.key}
                  className="form-item"
                  data-node={item.key}
                  data-element={item.element.id}
                  data-subject={name}
                  data-current={state.current === item.key}
                  onFocus={(event) => {
                    event.stopPropagation();
                    actions.focusRange(item.range);
                  }}
                >
                  <td data-column="name">{cell(item, 'name')}</td>
                  <td data-column="type">
                    <span className="subject-type" title={item.element.help}>
                      {item.element.tag}
                    </span>
                  </td>
                  <td data-column="value">{cell(item, 'value')}</td>
                  <td data-column="max_len">
                    {cell(item, 'max_len')}
                    {cost !== undefined && (
                      <span className="subject-cost" data-bytes={cost} title="max_len characters and the terminator, in RAM (§8.2)">
                        {cost} bytes
                      </span>
                    )}
                  </td>
                  <td data-column="users">
                    {users.length === 0 ? (
                      <span className="asset-users" data-users="0">
                        not used
                      </span>
                    ) : (
                      <ul className="subject-users" data-users={users.length}>
                        {users.map((user) => (
                          <li key={user.label}>
                            <button type="button" className="link" data-user={user.label} title={`Go to ${user.label}`} onClick={() => goToReference(workspace, user.reference)}>
                              {user.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(state.problems.byNode.get(item.key) ?? NONE).map((row) => (
                      <p key={row.key} className={`field-problem ${row.severity}`} data-code={row.code}>
                        <code>{row.code}</code> {row.message}
                      </p>
                    ))}
                  </td>
                  <td data-column="actions" className="subject-actions">
                    {rowExtra?.(item)}
                    <button type="button" aria-label={`Move ${label} up`} title="Move up" disabled={readOnly || before === undefined || before.parentStart !== item.parentStart} onClick={() => actions.move(item.key, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${label} down`} title="Move down" disabled={readOnly || after === undefined || after.parentStart !== item.parentStart} onClick={() => actions.move(item.key, 1)}>
                      ↓
                    </button>
                    <button type="button" aria-label={`Remove ${label}`} title="Remove" disabled={readOnly} onClick={() => actions.remove(item.key)}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="form-add">
        {list.kinds.map((kind) => (
          <button key={kind.id} type="button" className="action" disabled={readOnly} title={kind.help} onClick={() => actions.add(list.key, kind.id)}>
            + {kind.label}
          </button>
        ))}
      </div>
    </div>
  );
}
