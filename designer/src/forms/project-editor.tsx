/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/project-editor.tsx
 * Purpose: What the `u8g2gl.xml` form adds to the generic one (ui_spec §6.4):
 *          the display picker in place of the bare `setup` field, with the
 *          impact preview before a new display is chosen; bus fields that
 *          follow the display's bus family; rotation shown with its angle;
 *          the display's framebuffer beside `ram_budget`; and a live example
 *          of what `<output>` produces. Everything else in the file is the
 *          generic form's, so nothing is left without a control.
 * Description: `useProjectEditor` returns the hooks `FormView` takes for
 *              `u8g2gl.xml`. The picker (`DisplayPicker`) steps controller →
 *              size and variant → bus wiring, or searches the setup name; each
 *              option shows what the catalogue knows. Choosing a candidate
 *              shows the impact preview (`ImpactPreviewView`); only "Use this
 *              display" writes, as one edit and one undo stop. A bus field the
 *              wiring does not use is hidden, unless the file writes it, when
 *              it is shown and flagged: it is never dropped.
 *
 * Exports:
 * - ProjectEditorHooks:  The hooks the u8g2gl.xml form takes
 * - useProjectEditor():  Those hooks, for the session
 * - DisplayPicker:       The picker
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import { ROTATION_VALUES } from '@u8g2gl/core/schema/index.js';
import type { DisplayRecord } from '@u8g2gl/core/schema/display-record.js';
import { blitFrame } from '../canvas/framebuffer';
import type { Workspace } from '../workspace';
import { busFieldApplies, controllerOptions, familyLabel, rotationLabel, searchSetups, U8G2_SETUP_WIKI, variantKey, variantOptions, wiringOptions } from './display-picker-model';
import { candidateTexts, renderImpact, type ImpactPreview, type ScreenPreview } from './impact-preview';
import type { FormField, FormNode, FormSection } from './form-model';
import type { SectionRenderer } from './form-view';

/** Each setup's record, by name. */
const BY_SETUP: ReadonlyMap<string, DisplayRecord> = new Map(CATALOGUE.map((record) => [record.setup, record]));

/** The hooks the u8g2gl.xml form takes. */
export interface ProjectEditorHooks {
  readonly fieldControl: (field: FormField, node: FormNode, commit: (value: string | undefined) => void) => ReactNode;
  readonly fieldShown: (field: FormField, node: FormNode) => boolean;
  readonly fieldNote: (field: FormField, node: FormNode) => ReactNode;
  readonly renderSection: SectionRenderer;
}

// setupOf
// The setup a display node reads, and its record when the catalogue has one.
function setupOf(node: FormNode): { readonly setup: string | undefined; readonly record: DisplayRecord | undefined } {
  const setup = node.fields.find((field) => field.attribute.name === 'setup')?.value;
  return { setup, record: setup === undefined ? undefined : BY_SETUP.get(setup) };
}

// targetIndexOf
// Which target a node belongs to, from its key (`u8g2gl.xml>targets#1>display`).
function targetIndexOf(node: FormNode): number | undefined {
  const match = /targets#(\d+)/.exec(node.key);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** @brief A record's facts, as every option shows them. */
function recordFacts(record: DisplayRecord): string {
  return `${record.width}×${record.height} · ${record.framebufferBytes} B framebuffer · ${familyLabel(record.bus.family)} ${record.bus.raw} · ${record.driver} · ${record.tiles.width}×${record.tiles.height} tiles`;
}

/**
 * @brief The u8g2gl.xml form's hooks, for this session.
 *
 * @param workspace The session: its documents, its last run and the spare
 *                  editor module the impact preview draws with.
 */
export function useProjectEditor(workspace: Workspace): ProjectEditorHooks {
  return useMemo<ProjectEditorHooks>(
    () => ({
      // --- The display picker for setup, and rotation with its angle ---
      fieldControl: (field, node, commit) => {
        const name = `${field.elementId}/${field.attribute.name}`;
        if (name === 'display/setup') return <DisplayPicker workspace={workspace} field={field} node={node} commit={commit} />;
        if (name === 'display/rotation') {
          const written = field.value;
          return (
            <div className="field-controls">
              <select aria-label="rotation" className={written === undefined ? 'default' : ''} value={written ?? ''} onChange={(event) => commit(event.target.value === '' ? undefined : event.target.value)}>
                <option value="">not set ({rotationLabel(field.attribute.default ?? 'R0')})</option>
                {[...ROTATION_VALUES, ...(written !== undefined && !ROTATION_VALUES.includes(written) ? [written] : [])].map((value) => (
                  <option key={value} value={value}>
                    {rotationLabel(value)}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return undefined;
      },
      // --- Bus fields follow the family; one written for another family stays, flagged ---
      fieldShown: (field, node) => {
        const bus = setupOf(node).record?.bus;
        return field.value !== undefined || busFieldApplies(field.attribute, bus?.family, bus?.wiring);
      },
      fieldNote: (field, node) => {
        const { record } = setupOf(node);
        if (field.value !== undefined && record !== undefined && !busFieldApplies(field.attribute, record.bus.family, record.bus.wiring)) {
          return (
            <p className="field-problem warning" data-flag="not-applicable">
              This display ({familyLabel(record.bus.family)}, {record.bus.raw}) has no {field.attribute.name}. It is kept in the file; remove it if it no
              longer applies.
            </p>
          );
        }
        if (field.elementId === 'target' && field.attribute.name === 'ram_budget') {
          const display = node.parts.find((part) => part.element.id === 'display');
          const shown = display === undefined ? undefined : setupOf(display).record;
          return shown === undefined ? null : (
            <p className="field-reason" data-figure="framebuffer">
              This display's framebuffer is {shown.framebufferBytes} bytes of it (§18). The rest of the budget is in the generate report.
            </p>
          );
        }
        return null;
      },
      // --- Output: a live example of what it produces ---
      renderSection: (section, generic) =>
        section.key === 'u8g2gl.xml>output' ? (
          <>
            {generic}
            <OutputExample workspace={workspace} section={section} />
          </>
        ) : undefined,
    }),
    [workspace],
  );
}

/** @brief The paths and symbols `<output>` produces, from the fields as they are now. */
function OutputExample({ workspace, section }: { readonly workspace: Workspace; readonly section: FormSection }): React.JSX.Element {
  const value = (name: string): string | undefined => section.node?.fields.find((field) => field.attribute.name === name)?.value;
  const dir = value('dir') ?? 'generated';
  const prefix = value('prefix') ?? 'ui_';
  const screen = workspace.loop.lastRun.get()?.result.model.screens[0]?.name ?? 'home';
  const subject = workspace.loop.lastRun.get()?.result.model.globals.subjects[0]?.name ?? 'temperature';
  return (
    <div className="output-example" data-example="output">
      <p className="field-reason">
        Writes <code>{dir}/{prefix}screen_{screen}.cpp</code>, <code>{dir}/{prefix}subjects.cpp</code>, <code>{dir}/u8g2gl_generated_config.h</code> and{' '}
        <code>{dir}/{prefix.replace(/_$/, '')}.hpp</code>; the editor target writes to <code>{dir}_editor/</code>.
      </p>
      <p className="field-reason">
        Symbols read <code>{prefix}screen_{screen}_init()</code>, <code>{prefix}subject_{subject}</code>.
      </p>
    </div>
  );
}

/** @brief The display picker: the current display, then controller, size and wiring, or a search. */
export function DisplayPicker({
  workspace,
  field,
  node,
  commit,
}: {
  readonly workspace: Workspace;
  readonly field: FormField;
  readonly node: FormNode;
  readonly commit: (value: string | undefined) => void;
}): React.JSX.Element {
  const current = field.value;
  const record = current === undefined ? undefined : BY_SETUP.get(current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [controller, setController] = useState<string | undefined>(record?.controller);
  const [variant, setVariant] = useState<string | undefined>(record === undefined ? undefined : variantKey(record));
  const [candidate, setCandidate] = useState<string | undefined>(undefined);
  const controllers = useMemo(() => controllerOptions(CATALOGUE), []);
  const variants = useMemo(() => (controller === undefined ? [] : variantOptions(CATALOGUE, controller)), [controller]);
  const wirings = useMemo(() => (controller === undefined || variant === undefined ? [] : wiringOptions(CATALOGUE, controller, variant)), [controller, variant]);
  const found = useMemo(() => searchSetups(CATALOGUE, query), [query]);
  const chosen = candidate === undefined ? undefined : BY_SETUP.get(candidate);

  const choose = (setup: string): void => {
    const picked = BY_SETUP.get(setup);
    if (picked !== undefined) {
      setController(picked.controller);
      setVariant(variantKey(picked));
    }
    setCandidate(setup === current ? undefined : setup);
  };

  return (
    <div className="display-picker" data-setup={current ?? ''}>
      <div className="display-current">
        <code className="display-setup">{current ?? 'no display'}</code>
        {record !== undefined ? (
          <span className="display-facts">{recordFacts(record)}</span>
        ) : current !== undefined ? (
          <span className="field-problem warning">The catalogue has no setup of this name.</span>
        ) : null}
        <button type="button" className="action" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Change display…'}
        </button>
      </div>
      {open && (
        <div className="display-steps">
          <label className="display-search">
            Search the setup name{' '}
            <input type="text" aria-label="Search displays" placeholder="ssd1306 128x64 i2c" value={query} spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {query.trim() !== '' ? (
            <div className="display-options" role="listbox" aria-label="Matching displays">
              {found.matches.map((match) => (
                <SetupOption key={match.setup} record={match} selected={match.setup === (candidate ?? current)} onChoose={choose} />
              ))}
              {found.matches.length === 0 && <p className="form-empty">No setup matches.</p>}
              {found.notes.map((note) => (
                <p key={note} className="field-reason">
                  {note}
                </p>
              ))}
            </div>
          ) : (
            <div className="display-columns">
              <div className="display-column">
                <h4>1 · Controller</h4>
                <select aria-label="Controller" size={8} value={controller ?? ''} onChange={(event) => {
                  setController(event.target.value);
                  setVariant(undefined);
                }}>
                  {controllers.map((option) => (
                    <option key={option.controller} value={option.controller}>
                      {option.controller} ({option.setups})
                    </option>
                  ))}
                </select>
                {controller !== undefined && (
                  <a className="display-wiki" href={U8G2_SETUP_WIKI} target="_blank" rel="noreferrer noopener" title="U8G2's list of setup constructors">
                    {controller} in U8G2's setup reference
                  </a>
                )}
              </div>
              <div className="display-column">
                <h4>2 · Size and variant</h4>
                <select aria-label="Size and variant" size={8} value={variant ?? ''} onChange={(event) => setVariant(event.target.value)}>
                  {variants.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.width}×{option.height} {option.key} · {option.framebufferBytes} B · {option.tiles.width}×{option.tiles.height} tiles
                    </option>
                  ))}
                </select>
              </div>
              <div className="display-column wide">
                <h4>3 · Bus wiring</h4>
                <div className="display-options" role="listbox" aria-label="Bus wirings">
                  {wirings.map((option) => (
                    <SetupOption key={option.setup} record={option} selected={option.setup === (candidate ?? current)} onChoose={choose} />
                  ))}
                  {wirings.length === 0 && <p className="form-empty">Choose a controller and a size.</p>}
                </div>
              </div>
            </div>
          )}
          {chosen !== undefined && (
            <div className="display-candidate" data-candidate={chosen.setup}>
              <p>
                <code>{chosen.setup}</code>: {recordFacts(chosen)}
              </p>
              <ImpactPreviewView workspace={workspace} field={field} node={node} setup={chosen.setup} />
              <div className="form-add">
                <button
                  type="button"
                  className="action primary"
                  onClick={() => {
                    commit(chosen.setup);
                    setCandidate(undefined);
                    setOpen(false);
                  }}
                >
                  Use this display
                </button>
                <button type="button" className="action" onClick={() => setCandidate(undefined)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** @brief One setup as an option: its name and every fact the catalogue holds. */
function SetupOption({ record, selected, onChoose }: { readonly record: DisplayRecord; readonly selected: boolean; readonly onChoose: (setup: string) => void }): React.JSX.Element {
  return (
    <button type="button" role="option" aria-selected={selected} className="display-option" data-setup={record.setup} onClick={() => onChoose(record.setup)}>
      <code>{record.setup}</code>
      <span className="display-facts">{recordFacts(record)}</span>
    </button>
  );
}

/**
 * @brief The impact preview of a candidate setup: every screen drawn at its
 *        geometry in a spare editor module, the elements it would not hold
 *        marked and named, and how long it took.
 */
function ImpactPreviewView({
  workspace,
  field,
  node,
  setup,
}: {
  readonly workspace: Workspace;
  readonly field: FormField;
  readonly node: FormNode;
  readonly setup: string;
}): React.JSX.Element {
  const [preview, setPreview] = useState<ImpactPreview | { readonly problem: string } | undefined>(undefined);
  // The target by position, not the node: the node is read afresh on every
  // run, and the preview must not be redrawn for that.
  const index = targetIndexOf(node);
  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    const spare = workspace.wasm.spareInstance();
    const run = workspace.loop.lastRun.get();
    const targetName = index === undefined ? undefined : run?.result.model.project.targets[index]?.name;
    if (spare === undefined || run === undefined || targetName === undefined) {
      setPreview({ problem: 'The preview needs the editor Wasm and a first run of the project.' });
      return undefined;
    }
    spare
      .then((module) => {
        if (cancelled) return;
        const texts = candidateTexts(workspace.documents.texts(), field.key, setup);
        const screenFiles = run.result.model.screens.flatMap((screen) => (screen.loc?.file === undefined ? [] : [screen.loc.file]));
        const result = renderImpact(module, texts, screenFiles, workspace.canvasFile.get(), targetName, run.assets, setup);
        workspace.log(`impact preview: ${setup}, ${result.screens.length} screen${result.screens.length === 1 ? '' : 's'} in ${Math.round(result.ms)} ms${result.activeOnly ? ' (active screen only)' : ''}`);
        setPreview(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setPreview({ problem: `The preview could not start its editor module: ${error instanceof Error ? error.message : String(error)}` });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, field.key, index, setup]);

  if (preview === undefined) return <p className="form-empty">Drawing the preview…</p>;
  if ('problem' in preview) return <p className="field-reason">{preview.problem}</p>;
  return (
    <div className="impact-preview" data-preview-ms={Math.round(preview.ms)} data-active-only={preview.activeOnly}>
      <p className="field-reason">
        Every screen at {setup}: {preview.screens.length} drawn in {Math.round(preview.ms)} ms. Nothing is written until you use this display.
      </p>
      {preview.note !== undefined && <p className="field-reason">{preview.note}</p>}
      <div className="impact-screens">
        {preview.screens.map((screen) => (
          <ScreenThumbnail key={screen.screen} preview={screen} />
        ))}
      </div>
    </div>
  );
}

/** Pixels per device pixel in a thumbnail. */
const THUMBNAIL_SCALE = 2;

/** @brief One screen of the preview: its frame, the outside elements outlined, and named. */
function ScreenThumbnail({ preview }: { readonly preview: ScreenPreview }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context == null || preview.buffer === undefined || preview.width === 0) return;
    // --- Step 1: The frame, one canvas pixel per device pixel ---
    const image = context.createImageData(preview.width, preview.height);
    blitFrame(preview.buffer, preview.width, preview.height, new Uint32Array(image.data.buffer));
    context.putImageData(image, 0, 0);
  }, [preview]);
  const names = preview.outside.map((element) => element.name);
  return (
    <figure className="impact-screen" data-screen={preview.screen} data-outside={names.join(' ')}>
      <div className="impact-frame" style={{ width: preview.width * THUMBNAIL_SCALE, height: preview.height * THUMBNAIL_SCALE }}>
        <canvas ref={canvas} width={Math.max(1, preview.width)} height={Math.max(1, preview.height)} />
        {/* --- Step 2: Each outside element's box, clipped by the frame --- */}
        {preview.outside.map((element) => (
          <span
            key={element.name}
            className="impact-outside"
            title={`${element.name} is outside the display`}
            style={{
              left: element.rect.x * THUMBNAIL_SCALE,
              top: element.rect.y * THUMBNAIL_SCALE,
              width: element.rect.width * THUMBNAIL_SCALE,
              height: element.rect.height * THUMBNAIL_SCALE,
            }}
          />
        ))}
      </div>
      <figcaption>
        {preview.screen} · {preview.width}×{preview.height}
        {preview.problem !== undefined ? ` · ${preview.problem}` : ''}
        {names.length > 0 ? ` · outside: ${names.join(', ')}` : ''}
      </figcaption>
    </figure>
  );
}
