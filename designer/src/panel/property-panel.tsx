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
 *              there only when the manifest gives help, opens it on focus
 *              and on a click, and hovering the name or the ⓘ opens it too.
 *              It shows the help, then the facts line (`field-facts.ts`). It
 *              sits beside the panel, to its left, level with the field. Its
 *              state is the
 *              field's own, so opening it re-renders that field alone. What
 *              a user must act on stays inline: why a field is disabled, its
 *              problems, and the computed-value note with Detach and Edit in
 *              XML.
 *
 *              An element whose manifest declares `<element>`s ends with a
 *              table of its static children (`<column>`, design_spec §6.5):
 *              a row per child with each argument's own typed control, and
 *              add, remove and move up/down. Each change is one undo stop.
 *
 *              Input (§12) is authored here too, so nothing in it is XML-only.
 *              One selected element ends with its **Input** section: its place
 *              in the screen's ring, its `focus_style` picked from the named
 *              styles, and its events, each a trigger then an action — load a
 *              screen picked from the project's, back, or a callback by name —
 *              with add, remove and move up/down, each event two lines so it
 *              fits the panel. With nothing selected the
 *              screen's **Focus ring** follows its fields: the members in
 *              order, each with move and remove, `wrap`, and an add that offers
 *              only the named elements written in the screen and not yet in
 *              it. Nothing joins the ring unless picked. Each event row and
 *              member shows the problems located inside it, and each of these
 *              controls has an ⓘ for its help, as a field does.
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
import type { StaticChildTable } from './static-children';
import { EVENT_ACTIONS, type EventAction } from './element-events';
import { EVENT_TRIGGERS } from '@u8g2gl/core/schema/input-model.js';
import type { EventTrigger } from '@u8g2gl/core/schema/widget-node.js';
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
          <StaticChildren controller={controller} />
          <ElementInputSection controller={controller} />
          <FocusRingSection controller={controller} />
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
              // Safari does not focus a button it clicks, and a touch has no
              // hover: without this a click there would open nothing.
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

/**
 * @brief The selected element's static children (§6.5): a table per
 *        `<element>` its manifest declares, or nothing.
 */
function StaticChildren({ controller }: { readonly controller: PanelController }): React.JSX.Element | null {
  countRender('PanelStaticChildren');
  const tables = useObservable(controller.staticChildren);
  if (tables.length === 0) return null;
  return (
    <>
      {tables.map((table) => (
        <StaticChildTableView key={table.tag} table={table} controller={controller} />
      ))}
    </>
  );
}

/** A static child's field state: written as it is, or absent; never mixed. */
function cellState(value: string | undefined): FieldState {
  return {
    value,
    mixed: false,
    written: value !== undefined,
    problems: [],
    disabled: undefined,
    detach: undefined,
    shown: undefined,
    reveal: undefined,
  };
}

/** @brief One `<element>` kind: a row per child, a column per argument. */
function StaticChildTableView({ table, controller }: { readonly table: StaticChildTable; readonly controller: PanelController }): React.JSX.Element {
  const { tag } = table;
  return (
    <section className="panel-section static-children" data-section="static-children" data-static-tag={tag}>
      <h3 title={table.help}>{`<${tag}> children`}</h3>
      <table className="static-child-table">
        <thead>
          <tr>
            {table.args.map((arg) => (
              <th key={arg.key} scope="col" title={arg.help}>
                {arg.key}
              </th>
            ))}
            <th scope="col" aria-label="Order" />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} data-row={index}>
              {table.args.map((arg) => (
                <td key={arg.key} data-arg={arg.key}>
                  <FieldEditor
                    spec={arg}
                    field={cellState(row.values.get(arg.key))}
                    commit={(value) => value !== undefined && controller.editStaticChildren({ kind: 'set', tag, row: index, arg: arg.key, value })}
                    disabled={false}
                    options={controller.options}
                  />
                </td>
              ))}
              <td className="row-actions">
                <button type="button" aria-label={`Move ${tag} ${index + 1} up`} disabled={index === 0} onClick={() => controller.editStaticChildren({ kind: 'move', tag, row: index, by: -1 })}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${tag} ${index + 1} down`}
                  disabled={index === table.rows.length - 1}
                  onClick={() => controller.editStaticChildren({ kind: 'move', tag, row: index, by: 1 })}
                >
                  ↓
                </button>
                <button type="button" aria-label={`Remove ${tag} ${index + 1}`} onClick={() => controller.editStaticChildren({ kind: 'remove', tag, row: index })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="action" onClick={() => controller.editStaticChildren({ kind: 'add', tag })}>
        {`Add <${tag}>`}
      </button>
    </section>
  );
}

/** @brief A row's problems, as the panel shows a field's. */
function RowProblems({ problems }: { readonly problems: readonly { readonly severity: string; readonly message: string }[] }): React.JSX.Element {
  return (
    <>
      {problems.map((problem) => (
        <p key={problem.message} className={`field-problem ${problem.severity}`}>
          {problem.message}
        </p>
      ))}
    </>
  );
}

/** The help shown for the Input and Focus ring controls (ui_spec §9.2), with a facts line. */
const INPUT_HELP = {
  focus_style: {
    help: 'The named style applied while this element has focus, and removed when it loses focus. A property the element sets itself still wins over it (§10).',
    facts: 'named style · optional',
  },
  trigger: {
    help: 'What fires the event. press: an encoder click or the press button. long_press: their long variants, which your firmware times. value_changed: input changed the element\'s value, as a press toggles a switch; a binding or your own ui_set_… call never fires it.',
    facts: 'press · long_press · value_changed',
  },
  action: {
    help: 'What the event does. Load screen shows another screen and pushes this one, with its focus, onto the back stack. Back returns to the last screen pushed, restoring its focus. Callback calls your C function. An element\'s events run in the order listed.',
    facts: 'Load screen · Back · Callback',
  },
  target: {
    help: 'For Load screen, the screen to show. For Callback, the function to call: ui.hpp declares it as void name(u8g2gl_obj& target, u8g2gl_trigger_t trigger), and your application defines it. One callback may serve many elements.',
    facts: 'screen · or a C identifier outside u8g2gl_',
  },
  ring: {
    help: 'The elements input moves focus through, in this order. Membership is opt-in: only an element added here ever takes focus, and a screen with no ring ignores input. Hidden and disabled members are skipped.',
    facts: 'named elements written in this screen',
  },
  wrap: {
    help: 'On, moving past the last member returns to the first, and back from the first goes to the last. Off, focus stops at either end.',
    facts: 'bool',
  },
} as const satisfies Record<string, { readonly help: string; readonly facts: string }>;

/**
 * @brief A control's name with an ⓘ that opens its help, as a field's
 *        (`FieldRow`): on hover, focus and click, beside the panel.
 */
function InfoLabel({ name, topic, htmlFor }: { readonly name: string; readonly topic: keyof typeof INPUT_HELP; readonly htmlFor?: string }): React.JSX.Element {
  const tooltip = useTooltip(placeBesidePanel);
  const { onPointerEnter, onPointerLeave, onFocus, onBlur } = tooltipTriggers(tooltip);
  const tooltipId = `input-tooltip-${topic}`;
  const { help, facts } = INPUT_HELP[topic];
  return (
    <span className="field-name" data-help={topic} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <label htmlFor={htmlFor}>{name}</label>
      <button
        type="button"
        className="field-info"
        aria-label={`About ${name}`}
        aria-describedby={tooltip.at !== undefined ? tooltipId : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        // As FieldRow's: Safari does not focus a button it clicks.
        onClick={(event) => tooltip.show(event.currentTarget)}
      >
        <Icon name="info" size={INFO_ICON_SIZE} />
      </button>
      {tooltip.at !== undefined && (
        <Tooltip id={tooltipId} at={tooltip.at} className="field-tooltip">
          <span className="field-tooltip-help">{help}</span>
          <span className="field-tooltip-facts">{facts}</span>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * @brief A row's move up, move down and remove, each titled with what it does.
 *
 * @param what   What the row is, for the buttons' names ("event 2", "go").
 * @param remove The remove button's name.
 */
function RowActions({
  what,
  remove,
  first,
  last,
  move,
  onRemove,
}: {
  readonly what: string;
  readonly remove: string;
  readonly first: boolean;
  readonly last: boolean;
  readonly move: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  return (
    <span className="row-actions">
      <button type="button" aria-label={`Move ${what} up`} title="Move up" disabled={first} onClick={() => move(-1)}>
        ↑
      </button>
      <button type="button" aria-label={`Move ${what} down`} title="Move down" disabled={last} onClick={() => move(1)}>
        ↓
      </button>
      <button type="button" aria-label={remove} title={remove} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

/**
 * @brief The selected element's input (§12): its ring position, its
 *        focus_style, and its events.
 *
 * Each event is two lines, so it fits the panel at any width: its trigger, its
 * action and its row actions, then its target across the panel.
 */
function ElementInputSection({ controller }: { readonly controller: PanelController }): React.JSX.Element | null {
  countRender('PanelInput');
  const input = useObservable(controller.input);
  const options = useObservable(controller.options);
  const [adding, setAdding] = useState<EventAction>('callback');
  if (input === undefined) return null;
  const defaultTarget = (action: EventAction): string => (action === 'screen_load' ? (options.screens[0] ?? '') : action === 'callback' ? 'on_event' : '');
  return (
    <section className="panel-section element-input" data-section="input">
      <h3>Input</h3>
      <p className="panel-note" data-ring-position={input.ringPosition ?? ''}>
        {input.ringPosition === undefined
          ? "Not in this screen's focus ring, so it never takes focus. Add it from the screen's Focus ring (select nothing)."
          : `Focus ring stop ${input.ringPosition}.`}
      </p>
      <div className="field" data-field="focus_style">
        <div className="field-label">
          <InfoLabel name="focus_style" topic="focus_style" htmlFor="input-focus-style" />
        </div>
        <div className="field-controls">
          <select
            id="input-focus-style"
            aria-label="focus_style"
            value={input.focusStyle ?? ''}
            onChange={(event) => controller.commit('focus_style', event.target.value === '' ? undefined : event.target.value)}
          >
            <option value="">(none)</option>
            {[...new Set([...options.styles, ...(input.focusStyle === undefined ? [] : [input.focusStyle])])].map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </div>
      </div>
      {input.events.length > 0 && (
        <div className="event-legend field-label">
          <InfoLabel name="trigger" topic="trigger" />
          <InfoLabel name="action" topic="action" />
          <InfoLabel name="target" topic="target" />
        </div>
      )}
      <ol className="event-list">
        {input.events.map((event, index) => (
          <li key={index} className="event-row" data-row={index} data-action={event.action}>
            <div className="event-head">
              <select
                aria-label={`Event ${index + 1} trigger`}
                value={event.trigger}
                onChange={(change) => controller.editEvents({ kind: 'trigger', row: index, trigger: change.target.value as EventTrigger })}
              >
                {[...new Set([...EVENT_TRIGGERS, event.trigger])].map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {trigger}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Event ${index + 1} action`}
                value={event.action}
                onChange={(change) => {
                  const action = change.target.value as EventAction;
                  controller.editEvents({ kind: 'action', row: index, action, target: defaultTarget(action) });
                }}
              >
                {EVENT_ACTIONS.map((entry) => (
                  <option key={entry.action} value={entry.action}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <RowActions
                what={`event ${index + 1}`}
                remove={`Remove event ${index + 1}`}
                first={index === 0}
                last={index === input.events.length - 1}
                move={(by) => controller.editEvents({ kind: 'move', row: index, by })}
                onRemove={() => controller.editEvents({ kind: 'remove', row: index })}
              />
            </div>
            {event.action !== 'screen_back' && (
              <div className="event-target">
                <span className="event-target-kind">{event.action === 'screen_load' ? 'screen' : 'callback'}</span>
                {event.action === 'screen_load' && (
                  <select
                    aria-label={`Event ${index + 1} screen`}
                    value={event.screen}
                    onChange={(change) => controller.editEvents({ kind: 'target', row: index, target: change.target.value })}
                  >
                    {[...new Set([...options.screens, event.screen])].map((screen) => (
                      <option key={screen} value={screen}>
                        {screen === '' ? '(none)' : screen}
                      </option>
                    ))}
                  </select>
                )}
                {event.action === 'callback' && (
                  <CallbackInput
                    label={`Event ${index + 1} callback`}
                    value={event.callback}
                    commit={(value) => controller.editEvents({ kind: 'target', row: index, target: value })}
                  />
                )}
              </div>
            )}
            <RowProblems problems={event.problems} />
          </li>
        ))}
      </ol>
      <div className="field-actions">
        <select aria-label="New event action" value={adding} onChange={(event) => setAdding(event.target.value as EventAction)}>
          {EVENT_ACTIONS.map((entry) => (
            <option key={entry.action} value={entry.action}>
              {entry.label}
            </option>
          ))}
        </select>
        <button type="button" className="action" onClick={() => controller.editEvents({ kind: 'add', action: adding, trigger: 'press', target: defaultTarget(adding) })}>
          Add event
        </button>
      </div>
    </section>
  );
}

/**
 * @brief A callback's name: committed on Enter or on leaving the field, so a
 *        name is written whole, never a keystroke at a time.
 */
function CallbackInput({ label, value, commit }: { readonly label: string; readonly value: string; readonly commit: (value: string) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = (): void => {
    if (draft !== value) commit(draft.trim());
  };
  return (
    <input
      type="text"
      aria-label={label}
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={done}
      onKeyDown={(event) => {
        if (event.key === 'Enter') done();
        if (event.key === 'Escape') setDraft(value);
      }}
    />
  );
}

/**
 * @brief The shown screen's focus ring (§12.2): the members in order, wrap, and
 *        an add offering only named elements written in the screen.
 */
function FocusRingSection({ controller }: { readonly controller: PanelController }): React.JSX.Element | null {
  countRender('PanelFocusRing');
  const ring = useObservable(controller.ring);
  const [picked, setPicked] = useState('');
  if (ring === undefined) return null;
  const choice = ring.candidates.includes(picked) ? picked : (ring.candidates[0] ?? '');
  return (
    <section className="panel-section focus-ring" data-section="focus-ring">
      <h3>Focus ring</h3>
      <p className="panel-note">
        {ring.exists
          ? 'Focus moves through these, in this order, skipping hidden and disabled ones (§12.2).'
          : 'No focus ring: this screen ignores input. Add a member to start one; nothing joins it on its own.'}
      </p>
      <div className="ring-legend field-label">
        <InfoLabel name="members" topic="ring" />
        {ring.exists && (
          <span className="ring-wrap">
            <input
              id="ring-wrap"
              type="checkbox"
              aria-label="wrap"
              checked={ring.wrap}
              onChange={(event) => controller.editRing({ kind: 'wrap', wrap: event.target.checked })}
            />
            <InfoLabel name="wrap" topic="wrap" htmlFor="ring-wrap" />
          </span>
        )}
      </div>
      <ol className="ring-members">
        {ring.members.map((member, index) => (
          <li key={`${member}:${index}`} data-member={member}>
            <span className="ring-member-name">{member === '' ? '(no name)' : member}</span>
            <RowActions
              what={member}
              remove={`Remove ${member} from the ring`}
              first={index === 0}
              last={index === ring.members.length - 1}
              move={(by) => controller.editRing({ kind: 'move', row: index, by })}
              onRemove={() => controller.editRing({ kind: 'remove', row: index })}
            />
            <RowProblems problems={ring.problems[index] ?? []} />
          </li>
        ))}
      </ol>
      <div className="field-actions">
        <select aria-label="Element to add to the ring" value={choice} disabled={ring.candidates.length === 0} onChange={(event) => setPicked(event.target.value)}>
          {ring.candidates.length === 0 && <option value="">(every named element is in the ring)</option>}
          {ring.candidates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" className="action" disabled={choice === ''} onClick={() => controller.editRing({ kind: 'add', name: choice })}>
          Add to ring
        </button>
      </div>
    </section>
  );
}
