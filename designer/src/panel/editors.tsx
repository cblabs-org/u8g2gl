/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/editors.tsx
 * Purpose: One control per `<prop>` type, as ui_spec §9.1 tabulates them, so
 *          the panel can be generated from a manifest without knowing any
 *          widget: the type decides the control, never the prop's name
 *          ([UD-5]). Every control commits the same way (EDITOR-DESIGN §3.6):
 *          Enter, blur, a stepper, a toggle or a choice commits, as one undo
 *          stop; typing alone writes nothing to the document.
 * Description: `FieldEditor` picks the control:
 *              - `int`: a text field with − and + steppers, type-checked as
 *                typed (an integer, or an expression over `#constants`);
 *              - `bool`: a toggle;
 *              - `string`: a text field (the schema has no multiline flag);
 *              - `enum` and `color`: a segmented control for up to three
 *                options, a dropdown above that;
 *              - `font`: a dropdown, each option with its pixel height where
 *                the designer knows it;
 *              - `image`: a picker of thumbnails at 1:1;
 *              - `subject`: a dropdown filtered to the subject types the
 *                binding accepts;
 *              - `style`: a dropdown of the styles in scope.
 *              A draft being typed lives in the control's own state — it is
 *              not document state, and nothing reads it but the control.
 *
 * Exports:
 * - SEGMENTED_MAX:  The most options a segmented control shows
 * - CommitField:    How a control writes its field
 * - FieldEditor:    The control for a field's type
 */

import { useEffect, useRef, useState } from 'react';
import { BOOLEAN_VALUES } from '@u8g2gl/core/validator/value-rules.js';
import type { Observable } from '../state/observable';
import { useObservable } from '../ui/use-observable';
import { intDraftError, isIntegerLiteral, type FieldState } from './field-state';
import type { FieldSpec } from './panel-layout';
import type { ImageOption, PanelOptions } from './panel-controller';

/** The most options a segmented control shows before a dropdown is used instead (ui_spec §9.1). */
export const SEGMENTED_MAX = 3;

/** Writes the field's value, or removes the attribute for undefined; true if the text changed. */
export type CommitField = (value: string | undefined) => boolean;

/** What every control is given. */
interface EditorProps {
  readonly spec: FieldSpec;
  readonly field: FieldState;
  readonly commit: CommitField;
  /** True when the field must not be edited (its state carries why). */
  readonly disabled: boolean;
}

/** @brief The control for a field's type. */
export function FieldEditor(props: EditorProps & { readonly options: Observable<PanelOptions> }): React.JSX.Element {
  const { spec } = props;
  switch (spec.type) {
    case 'int':
      return <IntEditor {...props} />;
    case 'bool':
      return <BoolEditor {...props} />;
    case 'enum':
    case 'color':
      return spec.options.length <= SEGMENTED_MAX ? <SegmentedEditor {...props} choices={spec.options} /> : <ChoiceEditor {...props} choices={spec.options.map((o) => ({ value: o, label: o }))} />;
    case 'font':
      return <FontEditor {...props} />;
    case 'subject':
      return <SubjectEditor {...props} />;
    case 'style':
      return <StyleEditor {...props} />;
    case 'image':
      return <ImageEditor {...props} />;
    case 'string':
      return <TextEditor {...props} check={() => undefined} />;
  }
}

// --- Typed text: int and string -------------------------------------------

/**
 * @brief A text field that commits on Enter or blur, cancels on Escape, and
 *        flags a draft its type would refuse instead of writing it.
 */
function TextEditor({ spec, field, commit, disabled, check, steppers }: EditorProps & { readonly check: (draft: string) => string | undefined; readonly steppers?: React.ReactNode }): React.JSX.Element {
  // Undefined while not being typed in; a refused draft stays, so its reason does.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const error = draft === undefined ? undefined : check(draft);

  const finish = (): void => {
    if (draft === undefined || error !== undefined) return;
    if (draft === (field.value ?? '') && (field.written || draft === '')) {
      setDraft(undefined);
      return;
    }
    commit(draft);
    setDraft(undefined);
  };
  return (
    <div className="field-controls">
      <input
        type="text"
        aria-label={spec.key}
        aria-invalid={error !== undefined}
        className={field.written ? '' : 'default'}
        value={draft ?? (field.shown ?? field.value ?? '')}
        placeholder={field.mixed ? 'mixed' : (spec.default ?? '')}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish();
          if (event.key === 'Escape') setDraft(undefined);
        }}
        onBlur={finish}
      />
      {steppers}
      {error !== undefined && <p className="field-problem error draft">{error}</p>}
    </div>
  );
}

/** @brief An int: the typed field, with ±1 steppers that each commit. */
function IntEditor(props: EditorProps): React.JSX.Element {
  const { spec, field, commit, disabled } = props;
  // Steps from the written value, else the default, else 0; an expression has no step.
  const current = field.value ?? spec.default ?? '0';
  const literal = isIntegerLiteral(current) ? Number(current) : undefined;
  const why = literal === undefined ? `${spec.key} is not a literal; edit it as text` : undefined;
  const step = (delta: number): void => {
    if (literal !== undefined) commit(String(literal + delta));
  };
  const steppers = (
    <>
      <button type="button" className="stepper" aria-label={`${spec.key} − 1`} title={why} disabled={disabled || literal === undefined || field.mixed} onClick={() => step(-1)}>
        −
      </button>
      <button type="button" className="stepper" aria-label={`${spec.key} + 1`} title={why} disabled={disabled || literal === undefined || field.mixed} onClick={() => step(1)}>
        +
      </button>
    </>
  );
  return <TextEditor {...props} check={intDraftError} steppers={steppers} />;
}

// --- Choices ----------------------------------------------------------------

/** @brief A bool: a toggle that commits the other value. */
function BoolEditor({ spec, field, commit, disabled }: EditorProps): React.JSX.Element {
  const value = field.value ?? spec.default ?? 'false';
  const on = value === 'true';
  const known = BOOLEAN_VALUES.includes(value);
  return (
    <div className="field-controls">
      <button
        type="button"
        role="switch"
        aria-label={spec.key}
        aria-checked={field.mixed ? 'mixed' : on}
        className={`toggle${field.written ? '' : ' default'}`}
        disabled={disabled}
        onClick={() => commit(on ? 'false' : 'true')}
      />
      <span className={`field-value${field.written ? '' : ' default'}`}>{field.mixed ? 'mixed' : known ? value : `${value} (written)`}</span>
    </div>
  );
}

/** @brief Up to three options, side by side; a click commits one. */
function SegmentedEditor({ spec, field, commit, disabled, choices }: EditorProps & { readonly choices: readonly string[] }): React.JSX.Element {
  const value = field.mixed ? undefined : (field.value ?? spec.default);
  return (
    <div className="field-controls">
      <div className={`segmented${field.written ? '' : ' default'}`} role="group" aria-label={spec.key}>
        {choices.map((choice) => (
          <button key={choice} type="button" aria-pressed={choice === value} disabled={disabled} onClick={() => commit(choice)}>
            {choice}
          </button>
        ))}
      </div>
      {value !== undefined && !choices.includes(value) && <span className="field-value">{value}</span>}
    </div>
  );
}

/** One dropdown entry. */
interface Choice {
  readonly value: string;
  readonly label: string;
}

/**
 * @brief A dropdown; choosing commits. The first entry, *not set*, resets the
 *        field; a written value that is not among the choices is kept as an
 *        entry of its own, so it is shown rather than silently replaced.
 */
function ChoiceEditor({ spec, field, commit, disabled, choices }: EditorProps & { readonly choices: readonly Choice[] }): React.JSX.Element {
  const value = field.mixed ? MIXED : (field.value ?? '');
  const unset = spec.default !== undefined ? `not set (${spec.default})` : spec.kind === 'binding' ? 'not bound' : 'not set';
  const extra = field.value !== undefined && !choices.some((choice) => choice.value === field.value) ? [{ value: field.value, label: `${field.value} (not declared)` }] : [];
  return (
    <div className="field-controls">
      <select
        aria-label={spec.key}
        className={field.written ? '' : 'default'}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const chosen = event.target.value;
          if (chosen !== MIXED) commit(chosen === '' ? undefined : chosen);
        }}
      >
        {field.mixed && <option value={MIXED}>mixed</option>}
        <option value="">{unset}</option>
        {[...choices, ...extra].map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The dropdown value standing for a mixed selection; no name can contain a newline. */
const MIXED = '\n(mixed)';

/** @brief A font: the project's fonts, each with its pixel height where known. */
function FontEditor(props: EditorProps & { readonly options: Observable<PanelOptions> }): React.JSX.Element {
  const { fonts } = useObservable(props.options);
  return <ChoiceEditor {...props} choices={fonts.map((font) => ({ value: font.name, label: font.height === undefined ? font.name : `${font.name} · ${font.height} px` }))} />;
}

/** @brief A binding: the subjects of a type it accepts (§8.4). */
function SubjectEditor(props: EditorProps & { readonly options: Observable<PanelOptions> }): React.JSX.Element {
  const { subjects } = useObservable(props.options);
  const accepted = props.spec.subjectTypes;
  const compatible = subjects.filter((subject) => accepted.length === 0 || accepted.includes(subject.type));
  return <ChoiceEditor {...props} choices={compatible.map((subject) => ({ value: subject.name, label: `${subject.name} · ${subject.type}` }))} />;
}

/** @brief A style: the styles in scope, the globals' and the screen's. */
function StyleEditor(props: EditorProps & { readonly options: Observable<PanelOptions> }): React.JSX.Element {
  const { styles } = useObservable(props.options);
  return <ChoiceEditor {...props} choices={styles.map((style) => ({ value: style, label: style }))} />;
}

/** @brief An image: a thumbnail per declared image, at 1:1; a click commits it. */
function ImageEditor({ spec, field, commit, disabled, options }: EditorProps & { readonly options: Observable<PanelOptions> }): React.JSX.Element {
  const { images } = useObservable(options);
  return (
    <div className="image-picker" role="group" aria-label={spec.key}>
      {images.map((image) => (
        <button key={image.name} type="button" aria-pressed={field.value === image.name} disabled={disabled} title={`${image.name}, ${image.width}×${image.height}`} onClick={() => commit(image.name)}>
          <Thumbnail image={image} />
          <span>{image.name}</span>
        </button>
      ))}
      {images.length === 0 && <span className="field-value default">The project declares no images.</span>}
    </div>
  );
}

/** @brief An XBM image drawn 1:1, one canvas pixel per image pixel (ui_spec §9.1). */
function Thumbnail({ image }: { readonly image: ImageOption }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context == null || image.width === 0 || image.height === 0) return;
    // XBM rows are ceil(width / 8) bytes, least-significant bit leftmost.
    const pixels = context.createImageData(image.width, image.height);
    const stride = Math.ceil(image.width / 8);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const lit = ((image.bytes[y * stride + (x >> 3)] ?? 0) >> (x & 7)) & 1;
        const i = (y * image.width + x) * 4;
        pixels.data.set(lit ? [230, 230, 230, 255] : [5, 5, 5, 255], i);
      }
    }
    context.putImageData(pixels, 0, 0);
  }, [image]);
  return <canvas ref={canvas} width={Math.max(1, image.width)} height={Math.max(1, image.height)} data-image={image.name} />;
}
