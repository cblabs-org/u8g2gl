/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/sample-cells.tsx
 * Purpose: The typed cells a sample value is edited in, shared by the Sample
 *          data view and the subjects table so a value looks and commits the
 *          same in both: a subject's value with its inherited state, and a
 *          row field's control by type (ruling 7) — a checkbox for a bool, a
 *          dropdown for an enum, a number held to `min`/`max`, a string
 *          counted against `max_len`.
 * Description: Text and number cells keep a draft while typed and commit on
 *              Enter or blur, so one edit is one undo step rather than one per
 *              keystroke; Escape restores the committed value. A checkbox or a
 *              dropdown commits on change. A subject value the set leaves out
 *              shows the initial value as a placeholder, marked inherited, and
 *              clearing a value (↺) makes it inherited again. A value that does
 *              not check (a type the field does not take) is still shown, so
 *              the author can see what to fix. A number typed outside its
 *              field's `min`..`max` is marked invalid, says why, and is not
 *              written (not clamped to a value the author did not type).
 *
 * Exports:
 * - DraftInput:        A text or number input that commits on Enter or blur
 * - SubjectValueCell:  One subject's value in one set
 * - FieldCell:         One field of one row
 */

import { useEffect, useState } from 'react';
import { heldInteger, numberProblem, repeatedCells, stringCount, withRepeatedCell } from './grid-rules';
import { subjectValueProblem } from './sample-set';
import type { SampleField, SampleSubject } from './sample-shape';
import './samples.css';

/**
 * @brief An input holding a draft until Enter or blur commits it; Escape
 *        restores the committed text.
 */
export function DraftInput({
  value,
  onCommit,
  label,
  type = 'text',
  placeholder,
  className,
  min,
  max,
}: {
  readonly value: string;
  readonly onCommit: (text: string) => void;
  readonly label: string;
  readonly type?: 'text' | 'number';
  readonly placeholder?: string;
  readonly className?: string;
  readonly min?: number;
  readonly max?: number;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      type={type}
      className={className}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          setDraft(value);
        }
      }}
    />
  );
}

/**
 * @brief One subject's value in one set: the set's own, or the initial value
 *        shown as inherited when the set leaves the subject out.
 *
 * @param subject  The subject.
 * @param set      The set's name, for the accessible label.
 * @param value    The set's value, as written; undefined when inherited.
 * @param onCommit A new value, or undefined to inherit again.
 */
export function SubjectValueCell({
  subject,
  set,
  value,
  onCommit,
}: {
  readonly subject: SampleSubject;
  readonly set: string;
  readonly value: unknown;
  readonly onCommit: (value: unknown) => void;
}): React.JSX.Element {
  // --- Step 1: Inherited or the set's own, and whether it checks ---
  const inherited = value === undefined;
  const problem = inherited ? undefined : subjectValueProblem(subject, value);
  const label = `${subject.name} in ${set}`;
  // --- Step 2: The control, by the subject's type ---
  const control =
    subject.type === 'bool' ? (
      <input type="checkbox" aria-label={label} checked={inherited ? subject.initial === 'true' : value === true} onChange={(event) => onCommit(event.target.checked)} />
    ) : (
      <DraftInput
        label={label}
        type={subject.type === 'string' ? 'text' : 'number'}
        value={inherited ? '' : String(value)}
        placeholder={inherited ? (subject.initial ?? '') : undefined}
        onCommit={(text) => {
          if (subject.type === 'string') onCommit(text);
          else if (text.trim() === '') onCommit(undefined);
          else if (Number.isFinite(Number(text))) onCommit(Math.round(Number(text)));
        }}
      />
    );
  // --- Step 3: The control, its inherited mark or reset, and any problem ---
  return (
    <span className="sample-value" data-inherited={inherited} data-set={set} data-subject={subject.name} data-problem={problem !== undefined}>
      {control}
      {inherited ? (
        <span className="sample-inherited" title="This set leaves the subject out, so it has its initial value">
          inherited
        </span>
      ) : (
        <button type="button" className="sample-reset" aria-label={`Inherit the initial value of ${label}`} title="Inherit the initial value" onClick={() => onCommit(undefined)}>
          ↺
        </button>
      )}
      {problem !== undefined && (
        <span className="field-problem warning" role="note">
          {problem}
        </span>
      )}
    </span>
  );
}

/**
 * @brief One field of one row, by the field's type.
 *
 * @param field    The field, its bounds resolved for the instance.
 * @param value    The row's value for it, as written.
 * @param row      The row's index, for the accessible label.
 * @param onCommit The field's new value.
 */
export function FieldCell({
  field,
  value,
  row,
  onCommit,
}: {
  readonly field: SampleField;
  readonly value: unknown;
  readonly row: number;
  readonly onCommit: (value: unknown) => void;
}): React.JSX.Element {
  const label = `${field.name} of row ${row + 1}`;
  // --- Step 1: A repeated field is its cells, each a string cell ---
  if (field.repeated) {
    return (
      <span className="sample-repeat">
        {repeatedCells(field, value).map((text, i) => (
          <StringCell key={i} field={field} text={text} label={`${field.name}[${i}] of row ${row + 1}`} onCommit={(next) => onCommit(withRepeatedCell(value, i, next))} />
        ))}
      </span>
    );
  }
  // --- Step 2: A single field's control, by its type ---
  switch (field.type) {
    case 'bool':
      return <input type="checkbox" aria-label={label} checked={value === true} onChange={(event) => onCommit(event.target.checked)} />;
    case 'enum': {
      const current = typeof value === 'string' ? value : '';
      const options = field.values.includes(current) ? field.values : [current, ...field.values];
      return (
        <select aria-label={label} value={current} onChange={(event) => onCommit(event.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option === '' ? '—' : option}
            </option>
          ))}
        </select>
      );
    }
    case 'int':
      return <NumberCell field={field} text={typeof value === 'number' ? String(value) : String(value ?? '')} label={label} onCommit={onCommit} />;
    default:
      return <StringCell field={field} text={typeof value === 'string' ? value : String(value ?? '')} label={label} onCommit={onCommit} />;
  }
}

// NumberCell
// An int field's input. A typed value outside the field's bounds is marked
// invalid, as the panel marks an invalid field, says why, and is not written:
// the draft stays, so the author sees what was refused. Escape restores the
// written value.
function NumberCell({
  field,
  text,
  label,
  onCommit,
}: {
  readonly field: SampleField;
  readonly text: string;
  readonly label: string;
  readonly onCommit: (value: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const problem = numberProblem(field, draft);
  const commit = (): void => {
    if (draft === text || problem !== undefined || draft.trim() === '') return;
    const held = heldInteger(field, Number(draft));
    if (held !== undefined) onCommit(held);
  };
  return (
    <span className="sample-number-cell" data-invalid={problem !== undefined}>
      <input
        type="number"
        className="sample-number"
        aria-label={label}
        aria-invalid={problem !== undefined}
        min={field.min}
        max={field.max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            setDraft(text);
          }
        }}
      />
      {problem !== undefined && (
        <span className="field-problem error" role="note">
          {problem}
        </span>
      )}
    </span>
  );
}

// StringCell
// A string field's input, with its count against max_len beside it.
function StringCell({
  field,
  text,
  label,
  onCommit,
}: {
  readonly field: SampleField;
  readonly text: string;
  readonly label: string;
  readonly onCommit: (text: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const count = stringCount(field, draft);
  return (
    <span className="sample-string" data-over={count.over}>
      <input
        type="text"
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== text && onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (draft !== text) onCommit(draft);
          } else if (event.key === 'Escape') {
            setDraft(text);
          }
        }}
      />
      <span className="sample-count" title={field.maxLen === undefined ? 'Characters' : `Characters, against the max_len of ${field.maxLen}`}>
        {count.label}
      </span>
    </span>
  );
}
