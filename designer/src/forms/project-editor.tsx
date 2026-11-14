/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/project-editor.tsx
 * Purpose: What the `u8g2gl.xml` form adds to the generic one (ui_spec §6.4):
 *          the display picker in place of the bare `setup` field, with the
 *          impact preview before a new display is chosen; rotation shown with
 *          its angle or mirror axis, and previewed like a display when a
 *          quarter turn would resize the layout; the board-side constructor
 *          snippet, with Copy, where the pin fields were before schema 0.7
 *          removed them ([D-22]); the display's framebuffer beside
 *          `ram_budget`; and a live example of what `<output>` produces.
 *          Everything else in the file is the generic form's, so nothing is
 *          left without a control.
 * Description: `useProjectEditor` returns the hooks `FormView` takes for
 *              `u8g2gl.xml`. The picker (`DisplayPicker`) steps controller →
 *              size and variant → bus wiring, or searches the setup name; each
 *              option shows what the catalogue knows. Choosing a candidate
 *              shows the impact preview (`ImpactPreviewView`); only "Use this
 *              display" writes, as one edit and one undo stop. Every display
 *              is listed at its own size, with the size the target's rotation
 *              shows it at beside it when the two differ. A rotation that
 *              swaps the layout's width and height (`RotationField`) goes
 *              through the same preview and writes only on "Use this
 *              rotation"; one that keeps the size, a mirror included, applies
 *              at once. The mirrors are offered only at schema 0.7 or later,
 *              unless one is already written. Each target ends with its
 *              constructor snippet (`SnippetPanel`), which follows the display
 *              and rotation as they change and never writes to the project.
 *
 * Exports:
 * - ProjectEditorHooks:  The hooks the u8g2gl.xml form takes
 * - useProjectEditor():  Those hooks, for the session
 * - DisplayPicker:       The picker
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import type { DisplayRecord } from '@u8g2gl/core/schema/display-record.js';
import { blitFrame } from '../canvas/framebuffer';
import type { Workspace } from '../workspace';
import {
  controllerOptions,
  familyLabel,
  orientedNote,
  rotationLabel,
  rotationOptions,
  rotationResizes,
  searchSetups,
  U8G2_SETUP_WIKI,
  variantKey,
  variantOptions,
  wiringOptions,
} from './display-picker-model';
import { candidateTexts, renderImpact, type ImpactPreview, type ScreenPreview } from './impact-preview';
import type { FormField, FormNode, FormSection } from './form-model';
import type { SectionRenderer } from './form-view';
import { SNIPPET_LEAD, targetSnippet } from './snippet-panel-model';

/** Each setup's record, by name. */
const BY_SETUP: ReadonlyMap<string, DisplayRecord> = new Map(CATALOGUE.map((record) => [record.setup, record]));

/** The hooks the u8g2gl.xml form takes. */
export interface ProjectEditorHooks {
  readonly fieldControl: (field: FormField, node: FormNode, commit: (value: string | undefined) => void) => ReactNode;
  readonly nodeExtra: (node: FormNode) => ReactNode;
  readonly fieldNote: (field: FormField, node: FormNode) => ReactNode;
  readonly renderSection: SectionRenderer;
}

// setupOf
// The setup a display node reads, its record when the catalogue has one, and
// the rotation written beside it (as written; the layout reads it normalised).
function setupOf(node: FormNode): {
  readonly setup: string | undefined;
  readonly record: DisplayRecord | undefined;
  readonly rotation: string | undefined;
} {
  const setup = node.fields.find((field) => field.attribute.name === 'setup')?.value;
  const rotation = node.fields.find((field) => field.attribute.name === 'rotation')?.value;
  return { setup, record: setup === undefined ? undefined : BY_SETUP.get(setup), rotation };
}

// targetIndexOf
// Which target a node belongs to, from its key (`u8g2gl.xml>targets#1>display`).
function targetIndexOf(node: FormNode): number | undefined {
  const match = /targets#(\d+)/.exec(node.key);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * @brief A record's facts, as every option shows them: its own size first, then
 *        the size the target's rotation shows it at when that differs.
 */
function recordFacts(record: DisplayRecord, rotation: string | undefined): string {
  const shown = orientedNote(record, rotation);
  return `${record.width}×${record.height}${shown === undefined ? '' : ` · ${shown}`} · ${record.framebufferBytes} B framebuffer · ${familyLabel(record.bus.family)} ${record.bus.raw} · ${record.driver} · ${record.tiles.width}×${record.tiles.height} tiles`;
}

/**
 * @brief The u8g2gl.xml form's hooks, for this session.
 *
 * @param workspace The session: its documents, its last run and the spare
 *                  editor module the impact preview draws with.
 * @param schema    The schema the project declares, which decides whether the
 *                  rotation select offers the mirrors.
 */
export function useProjectEditor(workspace: Workspace, schema: string | undefined): ProjectEditorHooks {
  return useMemo<ProjectEditorHooks>(
    () => ({
      // --- The display picker for setup, and rotation with its angle ---
      fieldControl: (field, node, commit) => {
        const name = `${field.elementId}/${field.attribute.name}`;
        if (name === 'display/setup') return <DisplayPicker workspace={workspace} field={field} node={node} commit={commit} />;
        if (name === 'display/rotation') return <RotationField workspace={workspace} field={field} node={node} commit={commit} schema={schema} />;
        return undefined;
      },
      // --- Each target ends with the board-side code for its display ---
      nodeExtra: (node) => <SnippetPanel node={node} />,
      fieldNote: (field, node) => {
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
    [workspace, schema],
  );
}

/** How long the Copy button says "Copied" before it reads "Copy" again. */
const COPIED_MS = 1500;

/**
 * @brief A target's constructor snippet, with Copy (ui_spec §6.4, [D-22]).
 *
 * Shows nothing for a node that is not a target, or whose setup the catalogue
 * does not have (the setup field already says why). The text is selectable as
 * well as copied, and is never written to the project.
 */
function SnippetPanel({ node }: { readonly node: FormNode }): React.JSX.Element | null {
  const snippet = targetSnippet(node);
  const [copied, setCopied] = useState<'copied' | 'refused' | undefined>(undefined);
  // The confirmation is for the text that was copied: a new snippet clears it.
  const text = snippet?.text;
  useEffect(() => setCopied(undefined), [text]);
  useEffect(() => {
    if (copied !== 'copied') return undefined;
    const timer = setTimeout(() => setCopied(undefined), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  if (snippet === undefined) return null;

  const copy = (): void => {
    // The clipboard can refuse (no focus, no permission); say so rather than
    // claim a copy that did not happen.
    navigator.clipboard.writeText(snippet.text).then(
      () => setCopied('copied'),
      () => setCopied('refused'),
    );
  };
  return (
    <div className="constructor-snippet" data-snippet-setup={snippet.setup}>
      <p className="field-reason">{SNIPPET_LEAD}</p>
      <div className="snippet-head">
        <span className="field-reason">
          Board-side code for <code>{snippet.setup}</code>, also printed by <code>u8g2gl display {snippet.setup} --snippet</code>:
        </span>
        <button type="button" className="action" data-action="copy-snippet" onClick={copy}>
          {copied === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="snippet-status" role="status">
        {copied === 'copied' ? 'Copied to the clipboard.' : copied === 'refused' ? 'The clipboard refused the copy; select the text instead.' : ''}
      </span>
      <pre className="snippet-text" aria-label="Constructor snippet">
        {snippet.text}
      </pre>
    </div>
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
  const { rotation } = setupOf(node);
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
          <span className="display-facts">{recordFacts(record, rotation)}</span>
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
                <SetupOption key={match.setup} record={match} rotation={rotation} selected={match.setup === (candidate ?? current)} onChoose={choose} />
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
                    <SetupOption key={option.setup} record={option} rotation={rotation} selected={option.setup === (candidate ?? current)} onChoose={choose} />
                  ))}
                  {wirings.length === 0 && <p className="form-empty">Choose a controller and a size.</p>}
                </div>
              </div>
            </div>
          )}
          {chosen !== undefined && (
            <div className="display-candidate" data-candidate={chosen.setup}>
              <p>
                <code>{chosen.setup}</code>: {recordFacts(chosen, rotation)}
              </p>
              <ImpactPreviewView workspace={workspace} field={field} node={node} value={chosen.setup} candidate={chosen.setup} />
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
function SetupOption({
  record,
  rotation,
  selected,
  onChoose,
}: {
  readonly record: DisplayRecord;
  readonly rotation: string | undefined;
  readonly selected: boolean;
  readonly onChoose: (setup: string) => void;
}): React.JSX.Element {
  return (
    <button type="button" role="option" aria-selected={selected} className="display-option" data-setup={record.setup} onClick={() => onChoose(record.setup)}>
      <code>{record.setup}</code>
      <span className="display-facts">{recordFacts(record, rotation)}</span>
    </button>
  );
}

/**
 * @brief The impact preview of a candidate setup or rotation: every screen
 *        drawn at its geometry in a spare editor module, the elements it would
 *        not hold marked and named, and how long it took.
 *
 * @param field     The field the candidate would be written to.
 * @param value     The candidate value; undefined removes the attribute.
 * @param candidate What is previewed, as the preview names it.
 */
function ImpactPreviewView({
  workspace,
  field,
  node,
  value,
  candidate,
}: {
  readonly workspace: Workspace;
  readonly field: FormField;
  readonly node: FormNode;
  readonly value: string | undefined;
  readonly candidate: string;
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
        const texts = candidateTexts(workspace.documents.texts(), field.key, value);
        const screenFiles = run.result.model.screens.flatMap((screen) => (screen.loc?.file === undefined ? [] : [screen.loc.file]));
        const result = renderImpact(module, texts, screenFiles, workspace.canvasFile.get(), targetName, run.assets, candidate);
        workspace.log(`impact preview: ${candidate}, ${result.screens.length} screen${result.screens.length === 1 ? '' : 's'} in ${Math.round(result.ms)} ms${result.activeOnly ? ' (active screen only)' : ''}`);
        setPreview(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setPreview({ problem: `The preview could not start its editor module: ${error instanceof Error ? error.message : String(error)}` });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, field.key, index, value, candidate]);

  if (preview === undefined) return <p className="form-empty">Drawing the preview…</p>;
  if ('problem' in preview) return <p className="field-reason">{preview.problem}</p>;
  return (
    <div className="impact-preview" data-preview-ms={Math.round(preview.ms)} data-active-only={preview.activeOnly}>
      <p className="field-reason">
        Every screen at {candidate}: {preview.screens.length} drawn in {Math.round(preview.ms)} ms. Nothing is written until you use it.
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

/**
 * @brief The rotation select. A rotation that keeps the layout's size, a
 *        mirror included, applies at once; one that swaps width and height is
 *        previewed first, as a new display is, and written only on "Use this
 *        rotation" — one edit, one undo stop (ui_spec §6.4). The mirrors are
 *        offered from schema 0.7 (`rotationOptions()`).
 */
function RotationField({
  workspace,
  field,
  node,
  commit,
  schema,
}: {
  readonly workspace: Workspace;
  readonly field: FormField;
  readonly node: FormNode;
  readonly commit: (value: string | undefined) => void;
  readonly schema: string | undefined;
}): React.JSX.Element {
  const written = field.value;
  const { record } = setupOf(node);
  // Pending is the candidate awaiting confirmation; `{ value: undefined }` is
  // a pending "not set", distinct from nothing pending.
  const [pending, setPending] = useState<{ readonly value: string | undefined } | undefined>(undefined);

  const choose = (value: string | undefined): void => {
    if (value === written) {
      setPending(undefined);
    } else if (rotationResizes(record, written, value)) {
      setPending({ value });
    } else {
      setPending(undefined);
      commit(value);
    }
  };
  const label = (value: string | undefined): string => (value === undefined ? `not set (${rotationLabel(field.attribute.default ?? 'R0')})` : rotationLabel(value));
  const shown = pending === undefined || record === undefined ? undefined : orientedNote(record, pending.value);

  return (
    <div className="field-controls rotation-field">
      <select aria-label="rotation" className={written === undefined ? 'default' : ''} value={written ?? ''} onChange={(event) => choose(event.target.value === '' ? undefined : event.target.value)}>
        <option value="">{label(undefined)}</option>
        {rotationOptions(schema, written).map((value) => (
          <option key={value} value={value}>
            {rotationLabel(value)}
          </option>
        ))}
      </select>
      <p className="field-reason" data-help="rotation">
        Mirrored left–right or top–bottom is for a panel seen through reflective or head-up-display glass, and needs schema 0.7. Rotation is how the board
        constructs the display (<code>U8G2GL_TARGET_ROTATION</code>), not the controller's flip mode (<code>setFlipMode()</code>), which is your
        firmware's to use at run time.
      </p>
      {pending !== undefined && (
        <div className="display-candidate rotation-candidate" data-candidate={pending.value ?? ''}>
          <p>
            Rotation {label(pending.value)}
            {record !== undefined ? `: the ${record.width}×${record.height} panel is ${shown ?? `shown ${record.width}×${record.height}`}.` : '.'}
          </p>
          <ImpactPreviewView workspace={workspace} field={field} node={node} value={pending.value} candidate={`rotation ${label(pending.value)}`} />
          <div className="form-add">
            <button
              type="button"
              className="action primary"
              onClick={() => {
                commit(pending.value);
                setPending(undefined);
              }}
            >
              Use this rotation
            </button>
            <button type="button" className="action" onClick={() => setPending(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
