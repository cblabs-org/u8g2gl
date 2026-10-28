/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/property-panel.tsx
 * Purpose: The property panel region of ui_spec §6, on the shell's right: the
 *          selected element's fields, generated from its manifest ([UD-5]),
 *          or the screen's own with nothing selected. React renders the
 *          chrome; the state lives in `PanelController`, outside React.
 * Description: Three levels, each subscribed to only what it shows, so a drag
 *              that changes one field re-renders that field and nothing else
 *              (EDITOR-DESIGN §3.3): `PropertyPanel` renders on a new
 *              structure, `PanelHeader` on a new summary, and each `FieldRow`
 *              on its own field's state. The inherited group (*From
 *              u8g2gl_obj*, [Q-10]) starts collapsed.
 *
 * Exports:
 * - PropertyPanel:  The region
 */

import { useEffect, useState } from 'react';
import { countRender } from '../perf/render-count';
import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';
import type { Observable } from '../state/observable';
import { PanelController, type PanelSummary } from './panel-controller';
import type { FieldState } from './field-state';
import type { FieldSpec, PanelSection } from './panel-layout';
import './panel.css';

/** @brief The property panel region. */
export function PropertyPanel(): React.JSX.Element {
  countRender('PropertyPanel');
  const workspace = useWorkspace();
  const [controller] = useState(() => new PanelController(workspace));
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  const view = useObservable(controller.view);

  return (
    <aside className="property-panel" aria-label="Properties">
      <header className="sidebar-title">Properties</header>
      {view.kind === 'empty' ? (
        <p className="panel-empty">{view.message}</p>
      ) : (
        <>
          <PanelHeader summary={view.summary} />
          {view.layout.sections.map((section) => (
            <Section key={`${view.file}:${view.names.join(',')}:${section.id}`} section={section} fields={view.fields} />
          ))}
        </>
      )}
    </aside>
  );
}

/** @brief The header: the tag and names, notes about the whole element, and its own problems. */
function PanelHeader({ summary }: { readonly summary: Observable<PanelSummary> }): React.JSX.Element {
  countRender('PanelHeader');
  const { title, subtitle, notes, problems } = useObservable(summary);
  return (
    <div className="panel-header">
      <div className="panel-title">{title}</div>
      <div className="panel-subtitle">{subtitle}</div>
      {notes.map((note) => (
        <p key={note} className="panel-note">
          {note}
        </p>
      ))}
      {problems.map((problem) => (
        <p key={problem.message} className={`field-problem ${problem.severity}`} role="alert">
          {problem.message}
        </p>
      ))}
    </div>
  );
}

/** @brief One section; the inherited group is a collapsed disclosure. */
function Section({
  section,
  fields,
}: {
  readonly section: PanelSection;
  readonly fields: ReadonlyMap<string, Observable<FieldState>>;
}): React.JSX.Element {
  const rows = section.rows.map((row) => (
    <div key={row.map((spec) => spec.key).join('+')} className={`field-row${row.length > 1 ? ' pair' : ''}`}>
      {row.map((spec) => {
        const state = fields.get(spec.key);
        return state === undefined ? null : <FieldRow key={spec.key} spec={spec} state={state} />;
      })}
    </div>
  ));
  if (section.id === 'inherited') {
    return (
      <details className="panel-section inherited" data-section={section.id}>
        <summary>{section.title}</summary>
        {rows}
      </details>
    );
  }
  return (
    <section className="panel-section" data-section={section.id}>
      <h3>{section.title}</h3>
      {rows}
    </section>
  );
}

/** @brief One field: its label, its value, its help beneath (ui_spec §9.2). */
function FieldRow({ spec, state }: { readonly spec: FieldSpec; readonly state: Observable<FieldState> }): React.JSX.Element {
  countRender(`PanelField:${spec.key}`);
  const field = useObservable(state);
  const shown = field.shown ?? (field.mixed ? 'mixed' : (field.value ?? spec.default ?? ''));
  return (
    <div className="field" data-field={spec.key} data-written={field.written} data-mixed={field.mixed}>
      <label className="field-label">
        {spec.key}
        {spec.required ? <span className="required"> *</span> : null}
      </label>
      <span className={`field-value${field.written ? '' : ' default'}`}>{shown}</span>
      {spec.help !== undefined && <p className="field-help">{spec.help}</p>}
      {field.problems.map((problem) => (
        <p key={problem.message} className={`field-problem ${problem.severity}`}>
          {problem.message}
        </p>
      ))}
    </div>
  );
}
