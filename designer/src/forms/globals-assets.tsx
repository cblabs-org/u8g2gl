/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/globals-assets.tsx
 * Purpose: What globals.xml's fonts and images sections show beyond each
 *          item's attributes (ui_spec §12): its size in bytes, who uses it
 *          (click to list them), an image at 1:1 with a `<convert>`'s choice
 *          beside it, and, on a `<bdf>`'s `range`, the presets with what each
 *          would cost. And the guard that refuses Remove while an item is
 *          still used, naming the users, through the form's own refusal
 *          banner. The form's generic controls know none of this, because it
 *          needs the compiled assets and the whole project, which only the
 *          run has.
 * Description: Sizes are the bytes the firmware links: a `<bdf>`'s compiled
 *              array, a built-in's array (fetched from the design server, as
 *              the editor Wasm is given it), an image's XBM bytes. A preset's
 *              cost is bdfconv run in the page on the file's bytes with that
 *              range, so it is exactly what `generate` would emit; each
 *              compile is kept by file contents and range. Choosing a preset
 *              writes `range` (or removes it, for All) as one undo stop, through
 *              the same commit the text box uses. The Remove guard itself is
 *              `asset-usage.ts`'s `removeRefusal()`.
 *
 * Exports:
 * - BdfRangeField:   A `<bdf>`'s `range` field, with its presets and their costs
 * - AssetItemFacts:  A font's or image's size and users, after its fields
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { compileBdf } from '@u8g2gl/core/fonts/index.js';
import { DEFAULT_THRESHOLD } from '@u8g2gl/core/images/index.js';
import { FieldTextControl } from './form-controls';
import type { FormField, FormNode } from './form-model';
import { fontUsers, imageUsers, projectPreset, RANGE_PRESETS, usersLine, type AssetUsers, type RangePreset } from './asset-usage';
import { useObservable } from '../ui/use-observable';
import type { Workspace } from '../workspace';

/** Lit and unlit pixels, RGBA, as the canvas draws them. */
const LIT = [0xe8, 0xe8, 0xe8, 0xff] as const;
const UNLIT = [0x14, 0x14, 0x14, 0xff] as const;

/** Every bdfconv compile's size, by the file's bytes and then the range ('' for none). */
const COSTS = new WeakMap<Uint8Array, Map<string, Promise<number | undefined>>>();

// valueOf
// A node's attribute value, by name.
function valueOf(node: FormNode, attribute: string): string | undefined {
  return node.fields.find((field) => field.attribute.name === attribute)?.value;
}

// compiledSize
// The bytes bdfconv makes of a BDF at a range, compiled once per file and range.
//   bdf   — the file's bytes
//   range — the range value, or undefined for every glyph
function compiledSize(bdf: Uint8Array, range: string | undefined): Promise<number | undefined> {
  let byRange = COSTS.get(bdf);
  if (byRange === undefined) COSTS.set(bdf, (byRange = new Map()));
  const key = range ?? '';
  let cost = byRange.get(key);
  if (cost === undefined) {
    cost = compileBdf({ bdf, identifier: 'ui_fontdata_preset', ...(range !== undefined ? { range } : {}) }).then((result) => (result.ok ? result.declaredLength : undefined));
    byRange.set(key, cost);
  }
  return cost;
}

/**
 * @brief A `<bdf>`'s `range` field: the text box, then each preset with its
 *        compiled size, the current one marked, and "Only what this project
 *        uses" flagged when an element bound to a string subject draws in it.
 *
 * @param workspace The session: the BDF's bytes, the project model.
 * @param field     The `range` field.
 * @param node      The `<bdf>`, for its name and `src`.
 * @param commit    Writes the range, or removes it, as one edit.
 */
export function BdfRangeField({
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
  const run = useObservable(workspace.loop.lastRun);
  const font = valueOf(node, 'name') ?? '';
  const src = valueOf(node, 'src');
  const derived = useMemo(() => (run === undefined ? { preset: undefined, unsafeFor: [] } : projectPreset(run.result.model, font)), [run, font]);
  const presets: readonly RangePreset[] = derived.preset === undefined ? RANGE_PRESETS : [...RANGE_PRESETS, derived.preset];
  const [costs, setCosts] = useState<ReadonlyMap<string, number | undefined>>(new Map());

  // --- Each preset's compiled size, from the file's bytes ---
  const ranges = presets.map((preset) => preset.range ?? '').join('\n');
  useEffect(() => {
    if (src === undefined || src === '') return undefined;
    let live = true;
    void (async () => {
      const read = await workspace.documents.fileSystem.readBytes(src);
      if (!read.ok || !live) return;
      const sizes = await Promise.all(presets.map(async (preset) => [preset.id, await compiledSize(read.bytes, preset.range)] as const));
      if (live) setCosts(new Map(sizes));
    })();
    return () => {
      live = false;
    };
    // Keyed by the presets' ranges, not the array, which is rebuilt every render.
  }, [workspace, src, ranges]);

  return (
    <div className="bdf-range" data-font={font}>
      <FieldTextControl field={field} disabled={false} commit={commit} />
      <div className="range-presets" role="group" aria-label={`Range presets for ${font}`}>
        {presets.map((preset) => {
          const cost = costs.get(preset.id);
          const current = (field.value ?? undefined) === preset.range;
          return (
            <button
              key={preset.id}
              type="button"
              className="range-preset"
              data-preset={preset.id}
              data-bytes={cost ?? ''}
              aria-pressed={current}
              title={preset.range === undefined ? preset.help : `${preset.help} range="${preset.range}"`}
              onClick={() => {
                if (!current) commit(preset.range);
              }}
            >
              {preset.label}
              <span className="range-cost">{costs.has(preset.id) ? (cost === undefined ? 'does not compile' : `${cost} bytes`) : '…'}</span>
            </button>
          );
        })}
      </div>
      {derived.preset === undefined && <p className="field-reason">No static text in the project draws in this font, so there is no range to derive.</p>}
      {derived.preset !== undefined && derived.unsafeFor.length > 0 && (
        <p className="field-problem warning" data-unsafe-for={derived.unsafeFor.join(' ')}>
          “Only what this project uses” is unsafe here: {derived.unsafeFor.join(', ')} {derived.unsafeFor.length === 1 ? 'is' : 'are'} bound to a string subject, and live
          text can need characters the project’s static text does not use.
        </p>
      )}
    </div>
  );
}

// Users
// Who uses an item: the count, and the names behind a disclosure.
function Users({ users }: { readonly users: AssetUsers | undefined }): React.JSX.Element {
  const names = [...(users?.elements ?? []), ...(users?.styles ?? []).map((style) => `style ${style}`)];
  if (names.length === 0) return <span className="asset-users" data-users="0">not used</span>;
  return (
    <details className="asset-users" data-users={names.length}>
      <summary>used by {usersLine(users)}</summary>
      <ul>
        {names.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ImagePreview
// An image's XBM bytes drawn at 1:1, in the canvas's colours.
function ImagePreview({ name, width, height, bytes }: { readonly name: string; readonly width: number; readonly height: number; readonly bytes: readonly number[] }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context == null || width === 0 || height === 0) return;
    // XBM rows are ceil(width / 8) bytes, least-significant bit leftmost.
    const pixels = context.createImageData(width, height);
    const stride = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const lit = ((bytes[y * stride + (x >> 3)] ?? 0) >> (x & 7)) & 1;
        pixels.data.set(lit ? LIT : UNLIT, (y * width + x) * 4);
      }
    }
    context.putImageData(pixels, 0, 0);
  }, [width, height, bytes]);
  return <canvas ref={canvas} className="image-preview" width={Math.max(1, width)} height={Math.max(1, height)} data-image={name} aria-label={`${name} at 1:1`} />;
}

/**
 * @brief A font's or image's size in bytes and its users; for an image, its
 *        1:1 preview, and a `<convert>`'s mode and threshold beside it.
 *
 * @param workspace The session: the run's model and compiled assets.
 * @param node      The `<builtin>`, `<bdf>`, `<xbm>` or `<convert>`.
 * @return Nothing for any other node.
 */
export function AssetItemFacts({ workspace, node }: { readonly workspace: Workspace; readonly node: FormNode }): React.JSX.Element | null {
  const run = useObservable(workspace.loop.lastRun);
  const kind = node.element.id;
  const name = valueOf(node, 'name') ?? '';
  const isFont = kind === 'font-builtin' || kind === 'font-bdf';
  const isImage = kind === 'image-xbm' || kind === 'image-convert';
  const [builtinSize, setBuiltinSize] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (kind !== 'font-builtin' || name === '') return undefined;
    let live = true;
    void workspace.loop.injector.fontBytes('builtin', name, undefined).then((bytes) => live && setBuiltinSize(bytes?.length));
    return () => {
      live = false;
    };
  }, [workspace, kind, name]);
  const users = useMemo(() => (run === undefined ? undefined : (isFont ? fontUsers : imageUsers)(run.result.model).get(name)), [run, isFont, name]);
  if (!isFont && !isImage) return null;

  const image = isImage ? run?.assets?.images.get(name) : undefined;
  const size = kind === 'font-builtin' ? builtinSize : kind === 'font-bdf' ? run?.assets?.fonts.get(name)?.declaredLength : image?.bytes.length;
  return (
    <div className="asset-facts" data-asset={name}>
      <span className="asset-size" data-bytes={size ?? ''}>
        {size === undefined ? 'size unknown' : `${size} bytes`}
      </span>
      <Users users={users} />
      {image !== undefined && (
        <div className="asset-image">
          <ImagePreview name={name} width={image.width} height={image.height} bytes={image.bytes} />
          {kind === 'image-convert' && (
            <span className="convert-choice" data-mode={valueOf(node, 'mode') ?? 'threshold'}>
              {(valueOf(node, 'mode') ?? 'threshold') === 'dither'
                ? 'dithered'
                : `threshold ${valueOf(node, 'threshold') ?? DEFAULT_THRESHOLD}`}
              , {image.width}×{image.height}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
