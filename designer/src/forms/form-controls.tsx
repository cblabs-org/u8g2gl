/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-controls.tsx
 * Purpose: One control per vocabulary value type, so a project-file field is
 *          edited the way the property panel edits a prop (ui_spec §9.1):
 *          the type decides the control, never the attribute's name. Every
 *          control commits the way the panel's do: Enter, blur, a toggle or a
 *          choice commits as one undo stop; typing alone writes nothing.
 * Description: `FieldControl` is one field: its name, an ⓘ that opens its
 *              help and facts (principle 6), its control, *reset* once it is
 *              written, and beneath it what needs acting on: its Problems rows
 *              with their code, and any spelling written that the parser does
 *              not read. The controls:
 *              - `string`, and a `path` reference: a text field (a path offers
 *                the project's files);
 *              - `int`: a text field checked as typed;
 *              - `bool`: a toggle;
 *              - `enum`: a segmented control for up to three values, a
 *                dropdown above that;
 *              - a font, subject, style or image reference: a dropdown of what
 *                the project declares, keeping a written name it does not;
 *              - a display setup: a text field offering every catalogued setup
 *                (the display picker replaces it in the targets section).
 *              A read-only attribute shows its value, never a control.
 *              Pure components with no workspace: the coverage test renders
 *              them in Node.
 *
 * Exports:
 * - FieldControl:   One field
 */

import { useState, type ReactNode } from 'react';
import type { ProblemRow } from '../pipeline/diagnostics';
import { leftOf, Tooltip, tooltipTriggers, useTooltip, type TooltipAt } from '../ui/tooltip';
import type { FormField } from './form-model';
import { fieldFacts, type FormOptions } from './form-options';
import { vocabularyElement } from '@u8g2gl/core/schema/index.js';

// tagOf
// The tag a vocabulary element is written as, for a note that names where a
// value is.
function tagOf(id: string): string {
  return vocabularyElement(id)?.tag ?? id;
}

/** The most values a segmented control shows before a dropdown is used (ui_spec §9.1). */
const SEGMENTED_MAX = 3;

/** What a field's control is given. */
interface ControlProps {
  readonly field: FormField;
  readonly options: FormOptions;
  readonly disabled: boolean;
  /** Writes the value, or removes the attribute for undefined. */
  readonly commit: (value: string | undefined) => void;
}

// placeBesideForm
// A field's tooltip goes to the left of the form's field, level with it: the
// form fills the canvas half, and a tooltip over it would hide the fields.
function placeBesideForm(anchor: HTMLElement): TooltipAt {
  const row = (anchor.closest('.form-field') ?? anchor).getBoundingClientRect();
  return row.left > 320 ? leftOf({ left: row.left, right: row.right, top: row.top }) : { left: row.right + 6, top: row.top };
}

/** @brief One field: its name and ⓘ, its control, reset, and what needs acting on. */
export function FieldControl({
  field,
  options,
  readOnly,
  problems,
  note,
  control,
  commit,
}: {
  readonly field: FormField;
  readonly options: FormOptions;
  /** The whole form is read-only: its text cannot be read. */
  readonly readOnly: boolean;
  readonly problems: readonly ProblemRow[];
  /** A note shown beneath the control, such as a value that no longer applies. */
  readonly note?: ReactNode;
  /** A control in place of the type's own (the display picker); undefined for the type's. */
  readonly control?: ReactNode;
  readonly commit: (value: string | undefined) => void;
}): React.JSX.Element {
  const attribute = field.attribute;
  const tooltip = useTooltip(placeBesideForm);
  const { onPointerEnter, onPointerLeave, onFocus, onBlur } = tooltipTriggers(tooltip);
  const tooltipId = `form-tooltip-${field.key.replace(/[^\w-]/g, '_')}`;
  const disabled = readOnly || attribute.readOnly === true;
  const written = field.value !== undefined;
  return (
    <div className="form-field field" data-field={`${field.elementId}/${attribute.name}`} data-key={field.key} data-written={written}>
      <div className="field-label">
        <span className="field-name" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
          <label>
            {attribute.name}
            {attribute.required ? <span className="required" title="Required"> *</span> : null}
          </label>
          <button
            type="button"
            className="field-info"
            aria-label={`About ${attribute.name}`}
            aria-describedby={tooltip.at !== undefined ? tooltipId : undefined}
            onFocus={onFocus}
            onBlur={onBlur}
            onClick={(event) => tooltip.show(event.currentTarget)}
          >
            ⓘ
          </button>
        </span>
        {written && !attribute.required && !disabled && (
          <button type="button" className="reset" aria-label={`Reset ${attribute.name}`} title="Reset: remove the attribute, so the default applies" onClick={() => commit(undefined)}>
            ↺
          </button>
        )}
      </div>
      {attribute.readOnly === true ? (
        <div className="field-controls">
          <span className="field-value" data-readonly="true">
            {field.value ?? ''}
          </span>
        </div>
      ) : (
        (control ?? <Control field={field} options={options} disabled={disabled} commit={commit} />)
      )}
      {field.at !== undefined && field.at.name !== attribute.name && (
        <p className="field-reason">
          Written as <code>{field.at.name}</code>
          {field.at.elementId !== field.elementId ? (
            <>
              {' '}
              on <code>&lt;{tagOf(field.at.elementId)}&gt;</code>
            </>
          ) : null}
          ; edits keep it there.
        </p>
      )}
      {field.at !== undefined && field.at.name === attribute.name && field.at.elementId !== field.elementId && (
        <p className="field-reason">
          Written on <code>&lt;{tagOf(field.at.elementId)}&gt;</code>; edits keep it there.
        </p>
      )}
      {field.ignored.map((ignored) => (
        <p key={`${ignored.elementId}/${ignored.name}`} className="field-problem warning">
          {ignored.name}="{ignored.value}" on &lt;{tagOf(ignored.elementId)}&gt; is written but not read: the parser reads{' '}
          {field.at !== undefined ? `the one on <${tagOf(field.at.elementId)}>` : 'another place'} instead.
        </p>
      ))}
      {note}
      {problems.map((row) => (
        <p key={row.key} className={`field-problem ${row.severity}`} data-code={row.code}>
          <code>{row.code}</code> {row.message}
        </p>
      ))}
      {tooltip.at !== undefined && (
        <Tooltip id={tooltipId} at={tooltip.at} className="field-tooltip">
          <span className="field-tooltip-help">{attribute.help}</span>
          <span className="field-tooltip-facts">{fieldFacts(attribute)}</span>
        </Tooltip>
      )}
    </div>
  );
}

// Control
// The control for a field's type.
function Control(props: ControlProps): React.JSX.Element {
  const type = props.field.attribute.type;
  switch (type.kind) {
    case 'bool':
      return <ToggleControl {...props} />;
    case 'enum':
      return type.values.length <= SEGMENTED_MAX ? <SegmentedControl {...props} values={type.values} /> : <ChoiceControl {...props} values={type.values} />;
    case 'int':
      return <TextControl {...props} check={(draft) => (/^-?\d+$/.test(draft.trim()) || draft === '' ? undefined : `${props.field.attribute.name} is a whole number`)} />;
    case 'reference':
      switch (type.to) {
        case 'font':
          return <ChoiceControl {...props} values={props.options.fonts} />;
        case 'subject':
          return <ChoiceControl {...props} values={props.options.subjects} />;
        case 'style':
          return <ChoiceControl {...props} values={props.options.styles} />;
        case 'image':
          return <ChoiceControl {...props} values={props.options.images} />;
        case 'path':
          return <TextControl {...props} suggestions={props.options.paths} check={() => undefined} />;
        case 'display-setup':
          return <TextControl {...props} suggestions={props.options.setups} check={() => undefined} />;
      }
      return <TextControl {...props} check={() => undefined} />;
    case 'string':
      return <TextControl {...props} check={() => undefined} />;
  }
}

/**
 * @brief A text field that commits on Enter or blur and cancels on Escape; a
 *        draft its check refuses is flagged, not written. An empty draft of
 *        an optional field removes it.
 */
function TextControl({
  field,
  disabled,
  commit,
  check,
  suggestions,
}: ControlProps & { readonly check: (draft: string) => string | undefined; readonly suggestions?: readonly string[] }): React.JSX.Element {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const error = draft === undefined ? undefined : check(draft);
  const listId = suggestions !== undefined ? `form-list-${field.key.replace(/[^\w-]/g, '_')}` : undefined;
  const finish = (): void => {
    if (draft === undefined || error !== undefined) return;
    setDraft(undefined);
    if (draft === (field.value ?? '')) return;
    commit(draft === '' && !field.attribute.required ? undefined : draft);
  };
  return (
    <div className="field-controls">
      <input
        type="text"
        aria-label={field.attribute.name}
        aria-invalid={error !== undefined}
        className={field.value === undefined ? 'default' : ''}
        value={draft ?? field.value ?? ''}
        placeholder={field.attribute.default ?? ''}
        disabled={disabled}
        spellCheck={false}
        list={listId}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish();
          if (event.key === 'Escape') setDraft(undefined);
        }}
        onBlur={finish}
      />
      {listId !== undefined && (
        <datalist id={listId}>
          {suggestions?.map((value) => <option key={value} value={value} />)}
        </datalist>
      )}
      {error !== undefined && <p className="field-problem error draft">{error}</p>}
    </div>
  );
}

/** @brief A bool: a toggle that commits the other value. */
function ToggleControl({ field, disabled, commit }: ControlProps): React.JSX.Element {
  const value = field.value ?? field.attribute.default ?? 'false';
  const on = value === 'true';
  return (
    <div className="field-controls">
      <button
        type="button"
        role="switch"
        aria-label={field.attribute.name}
        aria-checked={on}
        className={`toggle${field.value === undefined ? ' default' : ''}`}
        disabled={disabled}
        onClick={() => commit(on ? 'false' : 'true')}
      />
      <span className={`field-value${field.value === undefined ? ' default' : ''}`}>{value}</span>
    </div>
  );
}

/** @brief Up to three values side by side; a click commits one. */
function SegmentedControl({ field, disabled, commit, values }: ControlProps & { readonly values: readonly string[] }): React.JSX.Element {
  const value = field.value ?? field.attribute.default;
  return (
    <div className="field-controls">
      <div className={`segmented${field.value === undefined ? ' default' : ''}`} role="group" aria-label={field.attribute.name}>
        {values.map((choice) => (
          <button key={choice} type="button" aria-pressed={choice === value} disabled={disabled} onClick={() => commit(choice)}>
            {choice}
          </button>
        ))}
      </div>
      {value !== undefined && !values.includes(value) && <span className="field-value">{value}</span>}
    </div>
  );
}

/**
 * @brief A dropdown; choosing commits. Its first entry, *not set*, removes an
 *        optional field; a written value that is not among the choices is kept
 *        as an entry of its own, so it is shown rather than silently replaced.
 */
function ChoiceControl({ field, disabled, commit, values }: ControlProps & { readonly values: readonly string[] }): React.JSX.Element {
  const written = field.value;
  const extra = written !== undefined && !values.includes(written) ? [written] : [];
  const unset = field.attribute.default !== undefined ? `not set (${field.attribute.default})` : 'not set';
  return (
    <div className="field-controls">
      <select
        aria-label={field.attribute.name}
        className={written === undefined ? 'default' : ''}
        value={written ?? ''}
        disabled={disabled}
        onChange={(event) => commit(event.target.value === '' ? undefined : event.target.value)}
      >
        <option value="" disabled={field.attribute.required}>
          {unset}
        </option>
        {[...values, ...extra].map((value) => (
          <option key={value} value={value}>
            {extra.includes(value) ? `${value} (not declared)` : value}
          </option>
        ))}
      </select>
    </div>
  );
}
