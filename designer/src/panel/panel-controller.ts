/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/panel-controller.ts
 * Purpose: The property panel's state, kept outside React for the same reason
 *          the edit loop's is: it is recomputed after every pipeline run, at
 *          frame rate, and the per-frame rule (EDITOR-DESIGN §3.3) allows a
 *          React render only where data changed. So the controller splits
 *          what it publishes by how often it changes — the panel's structure
 *          (which fields, in what order) almost never; each field's state on
 *          the edits that touch it; the dropdowns' choices when the globals
 *          change — and each piece is an observable that stays silent while
 *          its value is the same.
 * Description: After each run (`EditLoop.lastRun`) and on each selection
 *              change, the controller reads the selected file's current text
 *              into a CST (once per text), finds the selected elements by
 *              name, lays the panel out from their effective manifests
 *              (`panel-layout.ts`), and updates each field's state
 *              (`field-state.ts`). With nothing selected it shows the drawn
 *              screen's own properties (ui_spec §6).
 *
 *              A committed field is written by `commit()`: the edits
 *              (`commit-edits.ts`) are computed from the document's text at
 *              that moment and land on its Monaco model as **one undo stop**
 *              (EDITOR-DESIGN §3.6), on every selected element at once.
 *              Nothing is written until a field commits.
 *
 * Exports:
 * - PanelSummary:     The header's lines: tag, names, notes and element problems
 * - PanelOptions:     The choices the dropdowns and pickers offer
 * - FontOption, SubjectOption, ImageOption: One choice each
 * - PanelView:        What the panel shows: nothing, a screen, or elements
 * - PanelController:  The state
 *
 *     - view:          The panel's structure, observable
 *     - options:       The dropdowns' choices, observable
 *     - start(), dispose()
 *     - commit():      Write a field's value, or remove it (reset), as one undo stop
 *     - detach():      Replace an expression with the literal the scene computed
 *     - editInXml():   Show the attribute behind a field in the XML editor
 */

import { parseCst, type CstDocument } from '@u8g2gl/core/cst/index.js';
import type { EffectiveManifest } from '@u8g2gl/core/manifest/index.js';
import type { Rect } from '../pipeline/live-pipeline';
import type { CompletedRun } from '../pipeline/edit-loop';
import { Observable } from '../state/observable';
import type { Workspace } from '../workspace';
import { monaco } from '../monaco/monaco';
import { panelUpdateEnded, panelUpdateStarted } from '../perf/panel-probe';
import { attributeEdits, ROOT_TARGET } from './commit-edits';
import { ELEMENT_PROBLEMS, elementFacts, namedCstElements, type ElementFacts, type FieldProblem } from './element-facts';
import { fieldState, sameFieldState, type FieldState } from './field-state';
import { panelLayout, sharedLayout, type FieldSpec, type PanelLayout } from './panel-layout';

/** The header: what is selected, and anything said about it as a whole. */
export interface PanelSummary {
  /** The tag, or "N elements". */
  readonly title: string;
  /** The selected names, or the screen's name. */
  readonly subtitle: string;
  /** Muted notes about the element as a whole. */
  readonly notes: readonly string[];
  /** Diagnostics about the element rather than one attribute (a missing required prop). */
  readonly problems: readonly FieldProblem[];
}

/** A font the project declares, and its pixel height where the browser can know it. */
export interface FontOption {
  readonly name: string;
  /** Height in pixels, or undefined when the designer has no glyph data for it. */
  readonly height: number | undefined;
}

/** A subject and its type. */
export interface SubjectOption {
  readonly name: string;
  readonly type: string;
}

/** An image the project declares, and its bitmap once compiled. */
export interface ImageOption {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** XBM bytes: rows of ceil(width / 8), least-significant bit leftmost; empty if not compiled. */
  readonly bytes: readonly number[];
}

/** The choices the typed editors offer, from the globals and the screen. */
export interface PanelOptions {
  readonly fonts: readonly FontOption[];
  readonly subjects: readonly SubjectOption[];
  /** Styles in scope: the globals' and the drawn screen's. */
  readonly styles: readonly string[];
  readonly images: readonly ImageOption[];
}

/** What the panel shows. A new view means a new structure; its observables carry the rest. */
export type PanelView =
  | { readonly kind: 'empty'; readonly message: string }
  | {
      readonly kind: 'elements' | 'screen';
      /** The file the fields' attributes are written in. */
      readonly file: string;
      /** The edited elements by name; for a screen, `ROOT_TARGET`. */
      readonly names: readonly string[];
      readonly layout: PanelLayout;
      readonly summary: Observable<PanelSummary>;
      /** One observable per field, by attribute name. */
      readonly fields: ReadonlyMap<string, Observable<FieldState>>;
    };

/** The screen root's one property, which no manifest declares: its name ([U-1]). */
const SCREEN_NAME_FIELD: FieldSpec = {
  key: 'name',
  kind: 'prop',
  type: 'string',
  subjectTypes: [],
  options: [],
  default: undefined,
  required: true,
  help: "The screen's name: generated code's identifier for it, and what a screen_load_event names (§13.3).",
  source: 'screen',
};

/** The [Q-19] rule's line: no figure for a cost §18 cannot compute. */
const PROJECT_COST_NOTE = 'RAM cost not reported for project widgets ([Q-19])';

/**
 * Said once when a font field's choices include a font whose height the page
 * cannot know: a `<builtin>` font's glyph data is compiled into the editor
 * Wasm, and the page has no copy of it to measure.
 */
const FONT_HEIGHT_NOTE = 'Font heights are shown for <bdf> fonts; a built-in font’s glyphs are in the renderer, not the page.';

/** Nothing to show yet. */
const WAITING: PanelView = { kind: 'empty', message: 'Waiting for the first frame…' };

/** The property panel's state. */
export class PanelController {
  /** The panel's structure; replaced only when the fields shown change. */
  readonly view = new Observable<PanelView>(WAITING);
  /** The choices the dropdowns offer. */
  readonly options = new Observable<PanelOptions>({ fonts: [], subjects: [], styles: [], images: [] }, sameOptions);

  private readonly workspace: Workspace;
  private readonly subscriptions: Array<() => void> = [];
  /** The view's structure key, so an unchanged structure keeps its observables. */
  private viewKey = '';
  /** The last CST parsed, and the text it was of. */
  private parsed: { readonly text: string; readonly file: string; readonly cst: CstDocument } | undefined;

  /** @param workspace The session: selection, documents and the edit loop. */
  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  /** @brief Follows the selection and each pipeline run, and updates once. */
  start(): void {
    const update = (): void => this.update();
    this.subscriptions.push(this.workspace.selection.current.subscribe(update), this.workspace.loop.lastRun.subscribe(update));
    update();
  }

  /** @brief Stops following. */
  dispose(): void {
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
  }

  /**
   * @brief Writes a field on every element the panel shows, as one undo stop.
   *
   * The edits are computed from the document's current text, with each
   * element found by name, so a commit made while the canvas edits the same
   * element lands in the text as it is now. A commit that changes nothing
   * makes no edit and no undo stop.
   *
   * @param key   The field's attribute.
   * @param value The decoded value to write, or undefined to remove the
   *              attribute and fall back to the manifest's default (reset).
   * @return True if the text changed.
   */
  commit(key: string, value: string | undefined): boolean {
    const view = this.view.get();
    if (view.kind === 'empty' || this.workspace.loop.lastRun.get()?.result.wellFormed === false) return false;
    const model = this.workspace.documents.open(view.file);
    if (model === undefined) return false;
    const edits = attributeEdits(model.getValue(), view.file, view.names, key, value);
    if (edits.length === 0) return false;
    // One stop on each side, so neither the edit before nor the one after
    // joins it: undo takes back exactly this commit.
    model.pushStackElement();
    model.pushEditOperations(
      [],
      edits.map((edit) => ({ range: monaco.Range.fromPositions(model.getPositionAt(edit.start), model.getPositionAt(edit.end)), text: edit.text })),
      () => null,
    );
    model.pushStackElement();
    return true;
  }

  /**
   * @brief Detach (EDITOR-DESIGN §3.5): replaces a geometry value written as an
   *        expression or constant with the literal the scene computed for it,
   *        as one undo stop. Explicit, because the author's expression is a
   *        decision the panel cannot see the reason for.
   *
   * @param key The geometry field.
   * @return True if the text changed.
   */
  detach(key: string): boolean {
    const literal = this.fieldOf(key)?.detach;
    return literal !== undefined && this.commit(key, literal);
  }

  /**
   * @brief Edit in XML: shows the attribute a field's state names in the
   *        editor, caret on its value, for an edit the panel does not make
   *        itself — a binding, an anchor, an expression.
   *
   * @param key The field whose `reveal` attribute to show.
   */
  editInXml(key: string): void {
    const view = this.view.get();
    const attribute = this.fieldOf(key)?.reveal;
    if (view.kind === 'empty' || attribute === undefined) return;
    const cst = this.cstOf(view.file);
    const name = view.names[0];
    if (cst === undefined || name === undefined) return;
    const element = name === ROOT_TARGET ? cst.root : namedCstElements(cst).get(name);
    const target = element?.attributes.find((a) => a.name === attribute);
    if (target === undefined) return;
    const { line, column } = cst.lines.locate(target.valueRange.start);
    this.workspace.openFile({ path: view.file, line, column });
  }

  // fieldOf
  // A field's current state in the current view.
  private fieldOf(key: string): FieldState | undefined {
    const view = this.view.get();
    return view.kind === 'empty' ? undefined : view.fields.get(key)?.get();
  }

  // update
  // Recomputes the view, measured by the test build's panel probe.
  private update(): void {
    panelUpdateStarted();
    this.recompute();
    panelUpdateEnded();
  }

  // recompute
  // The view for the selection, the current text and the last run.
  private recompute(): void {
    // --- Step 1: Nothing to read before the first run ---
    const run = this.workspace.loop.lastRun.get();
    if (run === undefined) {
      this.publish('waiting', WAITING);
      return;
    }
    this.options.set(optionsOf(run));

    // --- Step 2: The selected elements, or the drawn screen with none ---
    const selection = this.workspace.selection.current.get();
    if (selection.file === undefined || selection.names.length === 0) {
      this.showScreen(run);
    } else {
      this.showElements(run, selection.file, selection.names);
    }
  }

  // showElements
  // The selected elements' fields: their shared layout, and each field's state.
  //   run   — the last pipeline run
  //   file  — the selection's file
  //   names — the selected names
  private showElements(run: CompletedRun, file: string, names: readonly string[]): void {
    // --- Step 1: The elements in the current text, and their manifests ---
    const cst = this.cstOf(file);
    const facts = cst === undefined ? [] : elementFacts(cst, names, run.result.diagnostics, run.result.placed);
    if (facts.length === 0) {
      this.publish(`none:${file}`, { kind: 'empty', message: 'The selection is not in the text.' });
      return;
    }
    const manifests: EffectiveManifest[] = [];
    for (const fact of facts) {
      const manifest = run.result.model.manifests.get(fact.tag);
      if (manifest === undefined) {
        this.publish(`unknown:${fact.tag}`, {
          kind: 'empty',
          message: `No manifest declares <${fact.tag}>, so the panel has nothing to show for it (§6.4).`,
        });
        return;
      }
      manifests.push(manifest);
    }

    // --- Step 2: The layout, kept when its fields are the same ---
    const layout = sharedLayout(manifests.map(panelLayout));
    const view = this.ensureView('elements', file, facts.map((fact) => fact.name), layout);

    // --- Step 3: The header and each field's state ---
    const project = manifests.some((manifest) => manifest.origin === 'project');
    const hasFont = layout.sections.some((section) => section.rows.flat().some((spec) => spec.type === 'font'));
    const heightUnknown = hasFont && this.options.get().fonts.some((font) => font.height === undefined);
    view.summary.set({
      title: facts.length === 1 ? layout.tag : `${facts.length} elements`,
      subtitle: facts.map((fact) => fact.name).join(', '),
      notes: [...(project && !layout.drawing ? [PROJECT_COST_NOTE] : []), ...(heightUnknown ? [FONT_HEIGHT_NOTE] : [])],
      problems: facts.flatMap((fact) => fact.problems.get(ELEMENT_PROBLEMS) ?? []),
    });
    const context = { wellFormed: run.result.wellFormed, box: boxOf(facts.map((fact) => run.result.bounds.get(fact.name))) };
    this.updateFields(view.layout, view.fields, facts, context);
  }

  // showScreen
  // With nothing selected, the drawn screen's own properties.
  //   run — the last pipeline run
  private showScreen(run: CompletedRun): void {
    const file = run.result.screenFile;
    const cst = file === undefined ? undefined : this.cstOf(file);
    if (file === undefined || cst?.root === undefined) {
      this.publish('no-screen', { kind: 'empty', message: 'The project has no screen to show.' });
      return;
    }
    const layout: PanelLayout = {
      tag: cst.root.name,
      origin: undefined,
      drawing: false,
      sections: [{ id: 'element', title: 'Screen', rows: [[SCREEN_NAME_FIELD]] }],
    };
    const view = this.ensureView('screen', file, [ROOT_TARGET], layout);
    const root: ElementFacts = {
      name: ROOT_TARGET,
      tag: cst.root.name,
      attributes: new Map(cst.root.attributes.map((attribute) => [attribute.name, attribute.value])),
      problems: new Map(),
      placed: undefined,
    };
    const display = run.result.display;
    view.summary.set({
      title: `<${cst.root.name}>`,
      subtitle: run.result.screen ?? '',
      notes: [
        ...(display === undefined ? [] : [`Display ${display.width}×${display.height}`]),
        `${namedCstElements(cst).size} elements. Select one on the canvas or in the XML to edit it.`,
      ],
      problems: [],
    });
    this.updateFields(layout, view.fields, [root], { wellFormed: run.result.wellFormed, box: undefined });
  }

  // updateFields
  // Sets each field's state; a field whose state is unchanged stays silent.
  private updateFields(
    layout: PanelLayout,
    fields: ReadonlyMap<string, Observable<FieldState>>,
    facts: readonly ElementFacts[],
    context: Parameters<typeof fieldState>[2],
  ): void {
    for (const section of layout.sections) {
      for (const spec of section.rows.flat()) fields.get(spec.key)?.set(fieldState(spec, facts, context));
    }
  }

  // ensureView
  // The current view if its structure is the same, else a new one with fresh
  // observables, published.
  private ensureView(kind: 'elements' | 'screen', file: string, names: readonly string[], layout: PanelLayout): Extract<PanelView, { kind: 'elements' | 'screen' }> {
    const key = `${kind}\n${file}\n${names.join(',')}\n${layoutKey(layout)}`;
    const current = this.view.get();
    if (key === this.viewKey && current.kind !== 'empty') return current;
    const fields = new Map<string, Observable<FieldState>>();
    for (const spec of layout.sections.flatMap((section) => section.rows.flat())) {
      fields.set(spec.key, new Observable<FieldState>(EMPTY_FIELD, sameFieldState));
    }
    const view = { kind, file, names, layout, summary: new Observable<PanelSummary>(EMPTY_SUMMARY, sameSummary), fields };
    this.viewKey = key;
    this.view.set(view);
    return view;
  }

  // publish
  // Shows a view with no fields, once per distinct key.
  private publish(key: string, view: PanelView): void {
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.view.set(view);
  }

  // cstOf
  // The file's current text as a CST, parsed once per text.
  private cstOf(file: string): CstDocument | undefined {
    const text = this.workspace.documents.textOf(file);
    if (text === undefined) return undefined;
    if (this.parsed?.text !== text || this.parsed.file !== file) {
      this.parsed = { text, file, cst: parseCst(text, file).cst };
    }
    return this.parsed.cst;
  }
}

/** A field before its first state. */
const EMPTY_FIELD: FieldState = {
  value: undefined,
  mixed: false,
  written: false,
  problems: [],
  disabled: undefined,
  detach: undefined,
  shown: undefined,
  reveal: undefined,
};

/** A header before its first summary. */
const EMPTY_SUMMARY: PanelSummary = { title: '', subtitle: '', notes: [], problems: [] };

// layoutKey
// A layout's identity: its tag and every section's fields with their types.
function layoutKey(layout: PanelLayout): string {
  return [layout.tag, ...layout.sections.map((section) => `${section.id}:${section.rows.map((row) => row.map((spec) => `${spec.key}/${spec.type}`).join('+')).join(',')}`)].join('|');
}

// boxOf
// The box around the rectangles drawn; undefined if none was.
function boxOf(rects: readonly (Rect | undefined)[]): Rect | undefined {
  const drawn = rects.filter((rect): rect is Rect => rect !== undefined);
  if (drawn.length === 0) return undefined;
  const left = Math.min(...drawn.map((r) => r.x));
  const top = Math.min(...drawn.map((r) => r.y));
  const right = Math.max(...drawn.map((r) => r.x + r.width));
  const bottom = Math.max(...drawn.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// optionsOf
// The editors' choices from a run's globals, drawn screen and compiled assets.
// A compiled `<bdf>` font's height is its glyph box's (byte 10 of a U8G2 font
// header, max_char_height); a `<builtin>` font's glyphs are in the editor Wasm,
// not in the page, so its height is not known here.
function optionsOf(run: CompletedRun): PanelOptions {
  const { globals, screens } = run.result.model;
  const screen = screens.find((s) => s.name === run.result.screen);
  return {
    fonts: globals.fonts.map((font) => ({ name: font.name, height: run.assets?.fonts.get(font.name)?.bytes[10] })),
    subjects: globals.subjects.map((subject) => ({ name: subject.name, type: subject.type })),
    styles: [...globals.styles.map((style) => style.name), ...(screen?.styles ?? []).map((style) => style.name)],
    images: globals.images.map((image) => {
      const compiled = run.assets?.images.get(image.name);
      return { name: image.name, width: compiled?.width ?? 0, height: compiled?.height ?? 0, bytes: compiled?.bytes ?? [] };
    }),
  };
}

// sameSummary
// Two headers that read the same.
function sameSummary(a: PanelSummary, b: PanelSummary): boolean {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.notes.join('\n') === b.notes.join('\n') &&
    a.problems.map((p) => p.message).join('\n') === b.problems.map((p) => p.message).join('\n')
  );
}

// sameOptions
// Two sets of choices that offer the same. Images compare by their compiled
// bytes' identity: an asset is recompiled into a new array when it changes,
// and is the same array on every run until then.
function sameOptions(a: PanelOptions, b: PanelOptions): boolean {
  const fonts = (o: PanelOptions): string => o.fonts.map((f) => `${f.name}:${f.height ?? ''}`).join(',');
  const subjects = (o: PanelOptions): string => o.subjects.map((s) => `${s.name}:${s.type}`).join(',');
  const sameImages =
    a.images.length === b.images.length &&
    a.images.every((image, i) => image.name === b.images[i]?.name && image.bytes === b.images[i]?.bytes);
  return fonts(a) === fonts(b) && subjects(a) === subjects(b) && a.styles.join(',') === b.styles.join(',') && sameImages;
}
