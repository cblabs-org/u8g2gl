/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/fonts/fonts-view.tsx
 * Purpose: The activity bar's Fonts view (ui_spec §12): where an author finds
 *          a font, sees every glyph it has, measures text against a width, and
 *          adds it to the project. It is also where a property panel's
 *          "Browse fonts…" sends the author to choose a field's font, and the
 *          choice goes back to that field.
 * Description: Two lists. The project's own fonts, from the last run's
 *              globals; and every U8G2 built-in, through E-6's `FontPicker`
 *              (its model, filters and samples) in its browse mode, which
 *              draws each sample only as its row scrolls into view. Selecting
 *              either shows `FontDetail`: the glyph grid and a string ruler,
 *              both drawn by the real renderer. Each is a one-screen project of
 *              its own (`font-view-model.ts`) run through the canvas's text
 *              pipeline and drawn in the editor Wasm's spare instance, with the
 *              font injected as the canvas's are, so what the view shows is
 *              what the device draws, and the ruler's width is the canvas's.
 *
 *              "Add to project" writes `<builtin name="…">` into globals.xml
 *              through the form's own edit path, as one undo stop. A
 *              "Browse fonts…" request (`workspace.fontBrowse`) adds a "Use"
 *              button for its field. Choosing a font the project has not
 *              declared is two edits in two documents — the `<builtin>` in
 *              globals.xml, then the field — and each is undone in its own
 *              document (ui_spec §14), which the view says before the choice.
 *
 * Exports:
 * - FontsView:          The view
 * - Drawing:            A drawn view project's frame, or why there is none
 * - NO_ASSETS:          Compiled assets with nothing in them
 * - drawProject():      Draw a view project through the real renderer
 * - paint():            Put a frame, or part of it, on a canvas
 *                       (the style cards' previews draw through these too)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import FONT_NAMES from '@u8g2gl/data/u8g2-fonts.json' with { type: 'json' };
import type { FontDecl } from '@u8g2gl/core/schema/globals.js';
import { blitFrame } from '../canvas/framebuffer';
import { FontPicker } from '../forms/font-picker';
import { ProjectFormController } from '../forms/form-controller';
import { buildFormModel, type FormList, type FormNode } from '../forms/form-model';
import { countRender } from '../perf/render-count';
import { runTextPipeline, type CompiledAssets } from '../pipeline/live-pipeline';
import { ProjectModelCache } from '../project/project-model';
import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';
import type { Workspace } from '../workspace';
import { fontEncodings, fontMetrics, glyphGridTexts, inkBox, rulerTexts, VIEW_SCREEN, type InkBox } from './font-view-model';
import type { FontBrowseRequest } from './font-browse';
import './fonts.css';


/** A font the view shows the detail of. */
interface Selected {
  readonly name: string;
  readonly kind: 'builtin' | 'bdf';
}

/** The glyph grid's CSS zoom (`.glyph-grid` in fonts.css); the two must agree. */
const GRID_ZOOM = 2;

// contentWidth
// An element's width inside its padding, in CSS pixels, or undefined before it
// is laid out.
//   element — the element, if mounted
function contentWidth(element: HTMLElement | null | undefined): number | undefined {
  if (element === null || element === undefined || element.clientWidth === 0) return undefined;
  const style = getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** What a drawn view project produced: a frame and its size, or why there is none. */
export type Drawing = { readonly frame: Uint8Array; readonly width: number; readonly height: number } | { readonly problem: string };

/** Compiled assets with nothing in them, for a view project of a built-in alone. */
export const NO_ASSETS: CompiledAssets = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() };

/** The ruler's text until the author types their own. */
const DEFAULT_RULER = 'Platform 9 12:34';

// builtinGlobals
// A globals.xml declaring one built-in font and nothing else.
//   name — the font
function builtinGlobals(name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<globals>\n    <fonts>\n        <builtin name="${name}" />\n    </fonts>\n</globals>\n`;
}

// fontsList
// The form's fonts list in globals.xml: the list whose kinds include
// `<builtin>`, which "Add to project" adds to.
//   text — globals.xml's text
function fontsList(text: string): FormList | undefined {
  const reading = buildFormModel('globals.xml', text);
  if (reading.kind !== 'form') return undefined;
  const lists: FormList[] = [];
  const visit = (node: FormNode): void => {
    lists.push(...node.lists);
    node.parts.forEach(visit);
    node.lists.forEach((list) => list.items.forEach(visit));
  };
  for (const section of reading.model.sections) {
    if (section.list !== undefined) lists.push(section.list);
    if (section.node !== undefined) visit(section.node);
  }
  return lists.find((list) => list.kinds.some((kind) => kind.id === 'font-builtin'));
}

/**
 * @brief Adds `<builtin name="…">` to globals.xml as one undo stop, through
 *        the form's edit path.
 *
 * @return False, logged, when globals.xml cannot take it (unreadable, say).
 */
function addBuiltin(workspace: Workspace, name: string): boolean {
  const list = fontsList(workspace.documents.textOf('globals.xml') ?? '');
  const added =
    list !== undefined && new ProjectFormController(workspace, 'globals.xml').apply({ kind: 'add', list: list.key, itemKind: 'font-builtin', values: { name } });
  if (!added) workspace.log(`fonts: '${name}' could not be added to globals.xml`);
  return added;
}

/**
 * @brief Draws a view project in the spare editor module, with its fonts
 *        injected as the canvas's are, and returns its frame.
 *
 * @param workspace The session.
 * @param texts     The project's files (`viewProjectTexts()` and its kin).
 * @param assets    The compiled fonts, for a `<bdf>`.
 */
export async function drawProject(workspace: Workspace, texts: ReadonlyMap<string, string>, assets: CompiledAssets): Promise<Drawing> {
  const spare = workspace.wasm.spareInstance();
  if (spare === undefined) return { problem: 'The editor Wasm has not loaded yet.' };
  const module = await spare;
  const run = runTextPipeline({ texts, cache: new ProjectModelCache(), assets, activeFile: VIEW_SCREEN, targetName: 'view' });
  if (run.scene === undefined || run.screen === undefined) return { problem: 'This font cannot be drawn here.' };
  await workspace.loop.injector.ready(module, run.model.globals, assets);
  const frame = module.applyScene(run.scene) && module.selectScreen(run.screen) ? module.renderFrame(0) : undefined;
  if (frame === undefined) return { problem: module.lastError() };
  const { width, height } = module.displaySize();
  // Copied: the view is valid only until the next call into the module.
  return { frame: frame.slice(), width, height };
}

/**
 * @brief Draws one frame, or its part `crop`, into a canvas, 1 bit to the pixel.
 *
 * @param canvas  The canvas; resized to the crop.
 * @param drawing The frame.
 * @param crop    The part to show.
 */
export function paint(canvas: HTMLCanvasElement | null, drawing: Drawing | undefined, crop: InkBox | undefined): void {
  const context = canvas?.getContext('2d');
  if (canvas === null || context === null || context === undefined || drawing === undefined || 'problem' in drawing || crop === undefined) return;
  const pixels = new Uint32Array(drawing.width * drawing.height);
  blitFrame(drawing.frame, drawing.width, drawing.height, pixels);
  const image = new ImageData(new Uint8ClampedArray(pixels.buffer), drawing.width, drawing.height);
  canvas.width = Math.max(1, crop.width);
  canvas.height = Math.max(1, crop.height);
  context.putImageData(image, -crop.x, -crop.y);
}

/** @brief The Fonts view. */
export function FontsView(): React.JSX.Element {
  countRender('FontsView');
  const workspace = useWorkspace();
  const run = useObservable(workspace.loop.lastRun);
  const request = useObservable(workspace.fontBrowse);
  const fonts: readonly FontDecl[] = run?.result.model.globals.fonts ?? [];
  const declared = useMemo(() => new Set(fonts.filter((font) => font.kind === 'builtin').map((font) => font.name)), [fonts]);
  const [selected, setSelected] = useState<Selected | undefined>(() =>
    request?.current === undefined ? undefined : { name: request.current, kind: fonts.find((font) => font.name === request.current)?.kind ?? 'builtin' },
  );
  const isDeclared = (name: string): boolean => fonts.some((font) => font.name === name);

  // use
  // Returns the chosen font to the requesting field: declaring it first, as its
  // own edit in globals.xml, when the project has not.
  const use = (name: string): void => {
    if (request === undefined) return;
    if (!isDeclared(name) && !addBuiltin(workspace, name)) return;
    request.choose(name);
    workspace.fontBrowse.set(undefined);
  };

  return (
    <aside className="sidebar fonts-view" aria-label="Fonts">
      <header className="sidebar-title">Fonts</header>
      {request !== undefined && (
        <div className="fonts-request" role="status">
          Choosing the font for <code>{request.target}</code>.{' '}
          <button type="button" className="action" onClick={() => workspace.fontBrowse.set(undefined)}>
            Cancel
          </button>
        </div>
      )}
      <section className="fonts-section" aria-label="Project fonts">
        <h3>In this project ({fonts.length})</h3>
        <ul className="fonts-project">
          {fonts.map((font) => (
            <li key={font.name}>
              <button
                type="button"
                className="font-project-row"
                data-font={font.name}
                aria-pressed={selected?.name === font.name}
                onClick={() => setSelected({ name: font.name, kind: font.kind })}
              >
                <code>{font.name}</code> <span className="font-kind">{font.kind === 'bdf' ? 'BDF' : 'built-in'}</span>
              </button>
            </li>
          ))}
          {fonts.length === 0 && <li className="form-empty">globals.xml declares no fonts.</li>}
        </ul>
      </section>
      {selected !== undefined && (
        <FontDetail
          key={selected.name}
          font={selected}
          declared={isDeclared(selected.name)}
          assets={run?.assets}
          request={request}
          onAdd={() => addBuiltin(workspace, selected.name)}
          onUse={() => use(selected.name)}
        />
      )}
      <section className="fonts-section" aria-label="Built-in fonts">
        <FontPicker label="Built-in fonts" current={selected?.name} declared={declared} onChoose={(name) => setSelected({ name, kind: 'builtin' })} browse />
      </section>
    </aside>
  );
}

// FontDetail
// One font: its glyph grid and the string ruler, both drawn by the editor Wasm,
// and the actions that add it to the project or return it to a field.
function FontDetail({
  font,
  declared,
  assets,
  request,
  onAdd,
  onUse,
}: {
  readonly font: Selected;
  readonly declared: boolean;
  readonly assets: CompiledAssets | undefined;
  readonly request: FontBrowseRequest | undefined;
  readonly onAdd: () => void;
  readonly onUse: () => void;
}): React.JSX.Element {
  const workspace = useWorkspace();
  const grid = useRef<HTMLCanvasElement>(null);
  const ruler = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState(DEFAULT_RULER);
  const [gridDrawing, setGridDrawing] = useState<{ drawing: Drawing; cells: number; total: number } | undefined>(undefined);
  const [rulerDrawing, setRulerDrawing] = useState<{ drawing: Drawing; box: InkBox | undefined } | undefined>(undefined);
  const known = font.kind === 'bdf' || (FONT_NAMES as readonly string[]).includes(font.name);

  // The view projects declare the font as the project would: its own
  // globals.xml when declared there, else one with this built-in alone.
  const globals = declared ? (workspace.documents.textOf('globals.xml') ?? '') : builtinGlobals(font.name);

  // --- The glyph grid: the font's table read for its glyphs, then drawn ---
  useEffect(() => {
    let live = true;
    void (async () => {
      const bytes = await workspace.loop.injector.fontBytes(font.kind, font.name, assets);
      if (bytes === undefined) {
        if (live) setGridDrawing({ drawing: { problem: `The font '${font.name}' could not be loaded.` }, cells: 0, total: 0 });
        return;
      }
      const codes = fontEncodings(bytes).filter((code) => code > 0);
      // The grid wraps at the view's width, in device pixels at the CSS zoom.
      const available = contentWidth(grid.current?.parentElement);
      const maxWidth = available === undefined ? undefined : Math.floor(available / GRID_ZOOM);
      const { texts, cells } = glyphGridTexts(globals, font.name, codes, fontMetrics(bytes), maxWidth);
      const drawing = await drawProject(workspace, texts, assets ?? NO_ASSETS);
      if (live) setGridDrawing({ drawing, cells: cells.length, total: codes.length });
    })();
    return () => {
      live = false;
    };
  }, [workspace, font.name, font.kind, assets, globals]);

  // --- The ruler: the typed text, drawn, then its lit pixels measured ---
  useEffect(() => {
    let live = true;
    void (async () => {
      const drawing = await drawProject(workspace, rulerTexts(globals, font.name, text), assets ?? NO_ASSETS);
      if (live) setRulerDrawing({ drawing, box: 'problem' in drawing ? undefined : inkBox(drawing.frame, drawing.width, drawing.height) });
    })();
    return () => {
      live = false;
    };
  }, [workspace, font.name, font.kind, assets, globals, text]);

  useEffect(() => {
    const drawing = gridDrawing?.drawing;
    const box = drawing === undefined || 'problem' in drawing ? undefined : inkBox(drawing.frame, drawing.width, drawing.height);
    paint(grid.current, drawing, box === undefined ? undefined : { x: 0, y: 0, width: box.x + box.width, height: box.y + box.height });
  }, [gridDrawing]);
  useEffect(() => paint(ruler.current, rulerDrawing?.drawing, rulerDrawing?.box), [rulerDrawing]);

  const box = rulerDrawing?.box;
  return (
    <section className="fonts-section font-detail" aria-label={`Font ${font.name}`} data-font={font.name}>
      <h3>
        <code>{font.name}</code>
      </h3>
      {!known && <p className="field-problem warning">U8G2 bundles no font of this name.</p>}
      <div className="font-actions">
        {font.kind === 'builtin' && !declared && (
          <button type="button" className="action" data-action="add-font" onClick={onAdd}>
            Add to project
          </button>
        )}
        {declared && <span className="font-declared">in this project</span>}
        {request !== undefined && (
          <button type="button" className="action primary" data-action="use-font" onClick={onUse}>
            Use for {request.target}
          </button>
        )}
      </div>
      {request !== undefined && !declared && (
        <p className="field-reason" data-note="two-edits">
          The project does not declare this font. Using it is two edits: a {'<builtin>'} in globals.xml, then {request.target}. Each is undone
          in its own file.
        </p>
      )}
      <h4>Glyphs</h4>
      {gridDrawing !== undefined && 'problem' in gridDrawing.drawing ? (
        <p className="field-problem">{gridDrawing.drawing.problem}</p>
      ) : (
        <>
          <canvas ref={grid} className="glyph-grid" aria-label={`Glyphs of ${font.name}`} data-cells={gridDrawing?.cells ?? 0} />
          {gridDrawing !== undefined && gridDrawing.cells < gridDrawing.total && (
            <p className="field-reason">
              The first {gridDrawing.cells} of {gridDrawing.total} glyphs.
            </p>
          )}
        </>
      )}
      <h4>Ruler</h4>
      <label className="font-ruler-input">
        Text <input type="text" aria-label="Ruler text" value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} />
      </label>
      <p className="font-ruler-reading" role="status" data-width={box?.width ?? 0} data-height={box?.height ?? 0}>
        {box === undefined ? 'Nothing drawn.' : `${box.width} × ${box.height} px, as drawn`}
      </p>
      {rulerDrawing !== undefined && 'problem' in rulerDrawing.drawing ? (
        <p className="field-problem">{rulerDrawing.drawing.problem}</p>
      ) : (
        <canvas ref={ruler} className="font-ruler" aria-label={`${text} in ${font.name}`} />
      )}
    </section>
  );
}
