/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/font-picker.tsx
 * Purpose: The chooser for a built-in U8G2 font (ui_spec §6.4), used where
 *          `globals.xml` names one: on "+ Built-in font", so a new `<builtin>`
 *          starts from a real font rather than an empty name, and in place of
 *          a `<builtin>`'s bare `name` box, behind "Change font…". It is
 *          inline, not modal, as the display picker is (project-editor.tsx).
 * Description: `FontPicker` lists the fonts `font-picker-model.ts` offers,
 *              searched and filtered, each with its height, character set and
 *              a sample U8G2 itself drew (`FontSampleCanvas`, from the samples
 *              file `font-samples.ts` fetches when a picker first opens).
 *              Choosing a font calls `onChoose` once, and the caller makes it
 *              one edit. `BuiltinFontField` is the `name` field's control:
 *              the current font, its facts, a text box that stays typeable,
 *              and the picker behind "Change font…".
 *
 * Exports:
 * - FontSampleCanvas:  One font's sample, drawn 1-bit with crisp pixels
 * - FontPicker:        The picker: search, filters, rows
 * - BuiltinFontField:  A `<builtin>`'s name field, with the picker behind a toggle
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import FONT_NAMES from '@u8g2gl/data/u8g2-fonts.json' with { type: 'json' };
import FONT_HEIGHTS from '@u8g2gl/data/u8g2-font-heights.json' with { type: 'json' };
import { fontFacts } from '@u8g2gl/core/catalogue/index.js';
import { FieldTextControl } from './form-controls';
import type { FormField } from './form-model';
import { decodeSampleBits, loadedFontSamples, loadFontSamples, samplePixel, type FontSamples } from './font-samples';
import {
  factsLine,
  filterFonts,
  fontRows,
  heightRange,
  LARGE_FONT_BADGE,
  LARGE_FONT_TOOLTIP,
  NO_FILTER,
  setOptions,
  U8G2_FONT_LIST_WIKI,
  type FontFilter,
  type FontRow,
} from './font-picker-model';

/** The heights table, typed. */
const HEIGHTS: Readonly<Record<string, number>> = FONT_HEIGHTS;

/** Lit pixels in the designer's canvas colours, so a sample reads like the display. */
const LIT = [0xe8, 0xe8, 0xe8, 0xff] as const;
const UNLIT = [0x14, 0x14, 0x14, 0xff] as const;

// useFontSamples
// The samples, once they have arrived. Only a hook that is asked to load
// fetches them, so a form that merely names a font costs nothing.
//   load — whether this caller may start the fetch
function useFontSamples(load: boolean): { readonly samples: FontSamples | undefined; readonly failed: boolean } {
  const [samples, setSamples] = useState<FontSamples | undefined>(() => loadedFontSamples());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!load || samples !== undefined) return undefined;
    let live = true;
    loadFontSamples().then(
      (loaded) => live && setSamples(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [load, samples]);
  return { samples, failed };
}

/**
 * @brief One font's sample, drawn 1-bit and scaled up with crisp pixels.
 *
 * @param name     The font.
 * @param samples  The samples file, or undefined while it loads.
 * @param scale    CSS pixels per sample pixel; by default 2, or 1 for a font
 *                 already 24 or more high, which is legible as it is.
 */
export function FontSampleCanvas({ name, samples, scale }: { readonly name: string; readonly samples: FontSamples | undefined; readonly scale?: number }): React.JSX.Element | null {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sample = samples?.[name];
  const zoom = scale ?? (sample !== undefined && sample.h >= 24 ? 1 : 2);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context === null || context === undefined || sample === undefined) return;
    // --- Step 1: Unpack the bits into an image at the sample's own size ---
    const bytes = decodeSampleBits(sample);
    const image = context.createImageData(sample.w, sample.h);
    for (let y = 0; y < sample.h; y++) {
      for (let x = 0; x < sample.w; x++) {
        image.data.set(samplePixel(bytes, sample.w, x, y) ? LIT : UNLIT, (y * sample.w + x) * 4);
      }
    }
    // --- Step 2: Put it; CSS scales it, pixelated, so no pixel is smoothed ---
    context.putImageData(image, 0, 0);
  }, [sample]);
  if (sample === undefined) return null;
  return (
    <canvas
      ref={canvas}
      className="font-sample"
      data-sample-font={name}
      width={sample.w}
      height={sample.h}
      style={{ width: sample.w * zoom, height: sample.h * zoom }}
      aria-label={`Sample of ${name}`}
    />
  );
}

// LargeFontBadge
// The mark on one of U8G2's large fonts, its reason in the tooltip.
function LargeFontBadge(): React.JSX.Element {
  return (
    <span className="font-large" title={LARGE_FONT_TOOLTIP}>
      {LARGE_FONT_BADGE}
    </span>
  );
}

// parseBound
// A height bound as typed: a whole number, or undefined for none.
function parseBound(text: string): number | undefined {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
}

/**
 * @brief The font picker: a search, filters for height, set, box and size,
 *        and the matching fonts, each with its facts and sample.
 *
 * @param current   The font chosen now, marked in the list.
 * @param declared  The `<builtin>` fonts the project declares, marked.
 * @param onChoose  Called once with the font chosen.
 * @param onCancel  Closes the picker without choosing.
 * @param label     What the picker is for, as its heading says.
 */
export function FontPicker({
  current,
  declared,
  onChoose,
  onCancel,
  label,
}: {
  readonly current: string | undefined;
  readonly declared: ReadonlySet<string>;
  readonly onChoose: (name: string) => void;
  readonly onCancel: () => void;
  readonly label: string;
}): React.JSX.Element {
  const { samples, failed } = useFontSamples(true);
  const rows = useMemo(() => fontRows(FONT_NAMES, HEIGHTS, declared), [declared]);
  const range = useMemo(() => heightRange(rows), [rows]);
  const sets = useMemo(() => setOptions(rows), [rows]);
  const [query, setQuery] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [set, setSet] = useState('');
  const [box, setBox] = useState('');
  const [hideLarge, setHideLarge] = useState(false);
  const filter = useMemo<FontFilter>(() => {
    const min = parseBound(minText);
    const max = parseBound(maxText);
    return {
      ...NO_FILTER,
      ...(min !== undefined ? { minHeight: min } : {}),
      ...(max !== undefined ? { maxHeight: max } : {}),
      ...(set !== '' ? { set } : {}),
      ...(box !== '' ? { box: box as NonNullable<FontFilter['box']> } : {}),
      ...(hideLarge ? { hideLarge } : {}),
    };
  }, [minText, maxText, set, box, hideLarge]);
  const found = useMemo(() => filterFonts(rows, query, filter), [rows, query, filter]);

  return (
    <div className="font-picker" role="group" aria-label={label}>
      <div className="font-picker-head">
        <span className="font-picker-title">{label}</span>
        <a className="display-wiki" href={U8G2_FONT_LIST_WIKI} target="_blank" rel="noreferrer noopener" title="U8G2's gallery of every font">
          U8G2's full font gallery
        </a>
        <span className="spacer" />
        <button type="button" className="action" data-action="cancel-font" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <label className="display-search">
        Search the font name{' '}
        <input type="text" aria-label="Search fonts" placeholder="helv 10" value={query} spellCheck={false} autoFocus onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="font-filters">
        <label>
          Height{' '}
          <input type="text" inputMode="numeric" aria-label="Minimum height" placeholder={String(range.min)} value={minText} onChange={(event) => setMinText(event.target.value)} />
          {' – '}
          <input type="text" inputMode="numeric" aria-label="Maximum height" placeholder={String(range.max)} value={maxText} onChange={(event) => setMaxText(event.target.value)} /> px
        </label>
        <label>
          Characters{' '}
          <select aria-label="Character set" value={set} onChange={(event) => setSet(event.target.value)}>
            <option value="">any</option>
            {sets.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          Glyphs{' '}
          <select aria-label="Glyph box" value={box} onChange={(event) => setBox(event.target.value)}>
            <option value="">any</option>
            <option value="monospace">monospace (m, 8)</option>
            <option value="proportional">proportional (t, h)</option>
            <option value="t">transparent (t)</option>
            <option value="h">common height (h)</option>
            <option value="m">monospace (m)</option>
            <option value="8">8×8 (8)</option>
          </select>
        </label>
        <label title={LARGE_FONT_TOOLTIP}>
          <input type="checkbox" checked={hideLarge} onChange={(event) => setHideLarge(event.target.checked)} /> Hide large fonts
        </label>
      </div>
      {failed && <p className="field-problem warning">The font samples could not be loaded; the names and facts are still shown.</p>}
      <p className="field-reason" role="status">
        {found.total === found.rows.length ? `${found.total} fonts` : `${found.rows.length} of ${found.total} fonts; narrow the search to see the rest`}
      </p>
      <div className="font-options" role="listbox" aria-label="Fonts">
        {found.rows.map((row) => (
          <FontOption key={row.name} row={row} samples={samples} selected={row.name === current} onChoose={onChoose} />
        ))}
        {found.rows.length === 0 && <p className="form-empty">No font matches.</p>}
      </div>
    </div>
  );
}

// FontOption
// One font as a row: its name, whether the project declares it, whether it is
// one of U8G2's large fonts, its facts and its sample. A click chooses it.
function FontOption({
  row,
  samples,
  selected,
  onChoose,
}: {
  readonly row: FontRow;
  readonly samples: FontSamples | undefined;
  readonly selected: boolean;
  readonly onChoose: (name: string) => void;
}): React.JSX.Element {
  return (
    <button type="button" role="option" className="font-option" aria-selected={selected} data-font={row.name} data-declared={row.declared} data-large={row.large} onClick={() => onChoose(row.name)}>
      <span className="font-option-name">
        <code>{row.name}</code>
        {row.declared && <span className="font-declared">declared</span>}
        {row.large && <LargeFontBadge />}
      </span>
      <span className="display-facts">{factsLine(row)}</span>
      <FontSampleCanvas name={row.name} samples={samples} />
    </button>
  );
}

/**
 * @brief A `<builtin>`'s `name` field: the font, its facts, a text box that
 *        stays typeable, and the picker behind "Change font…".
 *
 * @param field     The `name` field.
 * @param declared  The `<builtin>` fonts the project declares.
 * @param commit    Writes the name, as one edit.
 */
export function BuiltinFontField({
  field,
  declared,
  commit,
}: {
  readonly field: FormField;
  readonly declared: ReadonlySet<string>;
  readonly commit: (value: string | undefined) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const current = field.value;
  const { samples } = useFontSamples(open);
  const known = current !== undefined && (FONT_NAMES as readonly string[]).includes(current);
  const facts = current === undefined ? undefined : fontFacts(current);
  return (
    <div className="font-field" data-font={current ?? ''}>
      <FieldTextControl field={field} disabled={false} commit={commit} />
      <div className="display-current">
        {known && facts !== undefined ? (
          <>
            <span className="display-facts">{factsLine({ height: HEIGHTS[current], set: facts.set, box: facts.box })}</span>
            {facts.large && <LargeFontBadge />}
          </>
        ) : current !== undefined && current !== '' ? (
          <span className="field-problem warning">U8G2 bundles no font of this name.</span>
        ) : null}
        {known && <FontSampleCanvas name={current} samples={samples} />}
        <button type="button" className="action" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Change font…'}
        </button>
      </div>
      {open && (
        <FontPicker
          label="Change font"
          current={current}
          declared={declared}
          onCancel={() => setOpen(false)}
          onChoose={(name) => {
            setOpen(false);
            if (name !== current) commit(name);
          }}
        />
      )}
    </div>
  );
}
