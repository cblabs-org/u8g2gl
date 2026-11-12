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
 *              A field's help is in a tooltip (`ui/tooltip.tsx`, ui_spec
 *              §9.2), not beneath its control: an ⓘ after the property's name,
 *              there only when the manifest gives help, opens it on focus,
 *              and hovering the name or the ⓘ opens it too. It shows the help,
 *              then the facts line (`field-facts.ts`). It sits beside the
 *              panel, to its left, level with the field. Its state is the
 *              field's own, so opening it re-renders that field alone. What
 *              a user must act on stays inline: why a field is disabled, its
 *              problems, and the computed-value note with Detach and Edit in
 *              XML.
 *
 * Exports:
 * - PropertyPanel:  The region
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import { Icon } from '../icons/icon';
import { panelCommitted, panelRenderStarted } from '../perf/panel-probe';
import { countRender } from '../perf/render-count';
import { leftOf, Tooltip, tooltipTriggers, useTooltip, type TooltipAt } from '../ui/tooltip';
import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';
import type { Observable } from '../state/observable';
import { PanelController, type PanelSummary } from './panel-controller';
import { FieldEditor } from './editors';
import { fieldFacts } from './field-facts';
import type { FieldState } from './field-state';
import type { FieldSpec, PanelSection } from './panel-layout';
import './panel.css';

/** @brief The property panel region. */
export function PropertyPanel(): React.JSX.Element {
  countRender('PropertyPanel');
  panelRenderStarted();
  useLayoutEffect(panelCommitted);
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
            <Section key={`${view.file}:${view.names.join(',')}:${section.id}`} section={section} fields={view.fields} controller={controller} />
          ))}
        </>
      )}
    </aside>
  );
}

/**
 * @brief The header: the tag and names, notes about the whole element, why a
 *        handle cannot resize it, and its own problems.
 */
function PanelHeader({ summary }: { readonly summary: Observable<PanelSummary> }): React.JSX.Element {
  countRender('PanelHeader');
  panelRenderStarted();
  useLayoutEffect(panelCommitted);
  const { title, subtitle, notes, resize, problems } = useObservable(summary);
  return (
    <div className="panel-header">
      <div className="panel-title">{title}</div>
      <div className="panel-subtitle">{subtitle}</div>
      {notes.map((note) => (
        <p key={note} className="panel-note">
          {note}
        </p>
      ))}
      {resize !== undefined && <p className="panel-note resize-refusal">{resize}</p>}
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
  controller,
}: {
  readonly section: PanelSection;
  readonly fields: ReadonlyMap<string, Observable<FieldState>>;
  readonly controller: PanelController;
}): React.JSX.Element {
  const rows = section.rows.map((row) => (
    <div key={row.map((spec) => spec.key).join('+')} className={`field-row${row.length > 1 ? ' pair' : ''}`}>
      {row.map((spec) => {
        const state = fields.get(spec.key);
        return state === undefined ? null : <FieldRow key={spec.key} spec={spec} state={state} controller={controller} />;
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

/** The ⓘ's size, in CSS pixels: no taller than the name it follows. */
const INFO_ICON_SIZE = 12;

// placeBesidePanel
// A field's tooltip goes to the left of the panel, level with the field: the
// panel is at the shell's right, so there is no room to its right, and over
// the panel it would hide the fields beneath.
//   anchor — the property's name or its ⓘ
function placeBesidePanel(anchor: HTMLElement): TooltipAt {
  const row = (anchor.closest('.field') ?? anchor).getBoundingClientRect();
  const panel = anchor.closest('.property-panel')?.getBoundingClientRect() ?? row;
  return leftOf({ left: panel.left, right: panel.right, top: row.top });
}

/**
 * @brief One field: its name, with an ⓘ for its help when it has some
 *        (ui_spec §9.2), its control, and *reset* once it is written.
 */
function FieldRow({
  spec,
  state,
  controller,
}: {
  readonly spec: FieldSpec;
  readonly state: Observable<FieldState>;
  readonly controller: PanelController;
}): React.JSX.Element {
  countRender(`PanelField:${spec.key}`);
  panelRenderStarted();
  useLayoutEffect(panelCommitted);
  const field = useObservable(state);
  const tooltip = useTooltip(placeBesidePanel);
  const disabled = field.disabled !== undefined;
  const commit = (value: string | undefined): boolean => controller.commit(spec.key, value);
  const tooltipId = `field-tooltip-${spec.key}`;
  const { onPointerEnter, onPointerLeave, onFocus, onBlur } = tooltipTriggers(tooltip);
  const hasHelp = spec.help !== undefined;
  return (
    <div className="field" data-field={spec.key} data-written={field.written} data-mixed={field.mixed} data-disabled={disabled}>
      <div className="field-label">
        {/* The name and the ⓘ hover as one, so moving between them keeps it open. */}
        <span className="field-name" onPointerEnter={hasHelp ? onPointerEnter : undefined} onPointerLeave={hasHelp ? onPointerLeave : undefined}>
          <label>
            {spec.key}
            {spec.required ? <span className="required" title="Required"> *</span> : null}
          </label>
          {hasHelp && (
            <button
              type="button"
              className="field-info"
              aria-label={`About ${spec.key}`}
              aria-describedby={tooltip.at !== undefined ? tooltipId : undefined}
              onFocus={onFocus}
              onBlur={onBlur}
              onClick={(event) => tooltip.show(event.currentTarget)}
            >
              <Icon name="info" size={INFO_ICON_SIZE} />
            </button>
          )}
        </span>
        {field.written && !disabled && (
          <button type="button" className="reset" aria-label={`Reset ${spec.key}`} title="Reset: remove the attribute, so the default applies" onClick={() => commit(undefined)}>
            ↺
          </button>
        )}
      </div>
      <FieldEditor spec={spec} field={field} commit={commit} disabled={disabled} options={controller.options} />
      {field.disabled !== undefined && <p className="field-reason">{field.disabled}</p>}
      {field.detach !== undefined && (
        <p className="field-reason">
          {spec.key} is computed from <code>{field.value}</code>, which the canvas will not rewrite. Detach replaces it with the {field.detach} it
          computes to.
        </p>
      )}
      {field.reveal !== undefined && (
        <div className="field-actions">
          {field.detach !== undefined && (
            <button type="button" className="action" onClick={() => controller.detach(spec.key)}>
              Detach
            </button>
          )}
          <button type="button" className="action" onClick={() => controller.editInXml(spec.key)}>
            Edit in XML
          </button>
        </div>
      )}
      {field.problems.map((problem) => (
        <p key={problem.message} className={`field-problem ${problem.severity}`}>
          {problem.message}
        </p>
      ))}
      {tooltip.at !== undefined && spec.help !== undefined && (
        <Tooltip id={tooltipId} at={tooltip.at} className="field-tooltip">
          <span className="field-tooltip-help">{spec.help}</span>
          <span className="field-tooltip-facts">{fieldFacts(spec)}</span>
        </Tooltip>
      )}
    </div>
  );
}
