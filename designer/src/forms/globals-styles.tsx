/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/globals-styles.tsx
 * Purpose: What a style's card and a constant show after their fields
 *          (ui_spec §6.4, §10): a style's preview, drawn by the real renderer
 *          on a label and a button so each property looks as the device draws
 *          it, and says which element draws which; who uses it, by screen and element; and the largest
 *          radius its users allow. A constant's every reference, by file and
 *          attribute. Each user is a link to it.
 * Description: The card is the generic form's item, with its §10 fields
 *              driven by `STYLE_PROPERTIES`; these are its `nodeExtra`. The
 *              preview is a label and a button, each captioned with what the
 *              runtime draws of a style on it: `style-facts.ts`'s one-screen
 *              project over the
 *              current `globals.xml` text, drawn in the editor Wasm's spare
 *              instance as the Fonts view draws its ruler, and drawn again
 *              whenever that text changes. The facts are pure functions of the
 *              reference finder's index.
 *
 * Exports:
 * - StyleFacts:         A style's preview, users and radius bound
 * - ConstFacts:         A constant's references
 * - BORDER_UNDRAWN:     What a style's `border` field notes
 */

import { useEffect, useRef, useState } from 'react';
import { drawProject, NO_ASSETS, paint, type Drawing } from '../fonts/fonts-view';
import { goToReference, workspaceReferences } from '../project/project-references';
import { useObservable } from '../ui/use-observable';
import type { Workspace } from '../workspace';
import { nameUsers, type NameUser } from './asset-usage';
import type { FormNode } from './form-model';
import { constUses, radiusBound, STYLE_SAMPLES, styleSampleTexts, type StyleSample } from './style-facts';

/**
 * What a style's `border` field notes: no runtime element reads a style's
 * border. A button frames itself from its own `border_width`.
 */
export const BORDER_UNDRAWN = "No element draws a style's border yet: a label has no frame, and a button frames itself from its own border_width.";

// valueOf
// A node's attribute value, by name.
function valueOf(node: FormNode, attribute: string): string | undefined {
  return node.fields.find((field) => field.attribute.name === attribute)?.value;
}

// UserLinks
// A "Used by" list: each user a link that goes to it.
function UserLinks({ workspace, users }: { readonly workspace: Workspace; readonly users: readonly Pick<NameUser, 'label' | 'reference'>[] }): React.JSX.Element {
  if (users.length === 0) return <span className="asset-users" data-users="0">not used</span>;
  return (
    <ul className="globals-users" data-users={users.length}>
      {users.map((user) => (
        <li key={`${user.label}@${user.reference.range.start}`}>
          <button type="button" className="link" data-user={user.label} title={`Go to ${user.label}`} onClick={() => goToReference(workspace, user.reference)}>
            {user.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

// SamplePreview
// One sample of the preview, cut from the drawn frame with a margin, with its
// caption: what the runtime draws of a style on it.
//   style   — the style's name
//   sample  — the label or the button
//   drawing — the drawn frame, and how many times it has been drawn
function SamplePreview({ style, sample, drawing }: { readonly style: string; readonly sample: StyleSample; readonly drawing: { readonly drawing: Drawing; readonly seq: number } | undefined }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => paint(canvas.current, drawing?.drawing, { x: sample.x - 2, y: sample.y - 2, width: sample.width + 4, height: sample.height + 4 }), [drawing, sample]);
  return (
    <figure className="style-sample" data-part={sample.part}>
      <canvas ref={canvas} className="style-preview-canvas" data-style-preview={style} data-part={sample.part} data-drawn={drawing?.seq ?? 0} aria-label={`${style} preview, ${sample.part}`} />
      <figcaption className="field-reason">{sample.caption}</figcaption>
    </figure>
  );
}

/**
 * @brief A style's preview, its users and its radius bound.
 *
 * @param workspace The session: the documents, the run's assets and the spare module.
 * @param node      The `<style>`.
 */
export function StyleFacts({ workspace, node }: { readonly workspace: Workspace; readonly node: FormNode }): React.JSX.Element {
  const run = useObservable(workspace.loop.lastRun);
  const name = valueOf(node, 'name') ?? '';
  const styleFont = valueOf(node, 'font');
  const globals = workspace.documents.textOf('globals.xml') ?? '';
  const fallback = run?.result.model.globals.fonts[0]?.name;
  const assets = run?.assets;
  const [drawing, setDrawing] = useState<{ readonly drawing: Drawing; readonly seq: number } | undefined>(undefined);

  // --- The preview: drawn again whenever globals.xml's text changes ---
  useEffect(() => {
    if (name === '') return undefined;
    let live = true;
    void drawProject(workspace, styleSampleTexts(globals, name, fallback, styleFont), assets ?? NO_ASSETS).then((drawn) => {
      if (live) setDrawing((previous) => ({ drawing: drawn, seq: (previous?.seq ?? 0) + 1 }));
    });
    return () => {
      live = false;
    };
  }, [workspace, globals, name, fallback, styleFont, assets]);

  const refs = run === undefined ? undefined : workspaceReferences(workspace);
  const users = refs === undefined || name === '' ? [] : nameUsers(refs, 'style', name);
  const shadowing = refs === undefined || name === '' ? [] : refs.of('style', name).shadowingFiles;
  const bound = refs === undefined || name === '' ? undefined : radiusBound(refs, workspace.documents.texts(), name);
  const problem = drawing !== undefined && 'problem' in drawing.drawing ? drawing.drawing.problem : undefined;
  return (
    <div className="style-facts" data-style={name}>
      <div className="style-preview" data-drawn={drawing?.seq ?? 0}>
        {STYLE_SAMPLES.map((sample) => (
          <SamplePreview key={sample.part} style={name} sample={sample} drawing={drawing} />
        ))}
        {problem !== undefined && <p className="field-problem warning">The preview cannot be drawn: {problem}</p>}
      </div>
      <div className="style-users">
        <span className="field-reason">Used by</span>
        <UserLinks workspace={workspace} users={users} />
        {shadowing.length > 0 && (
          <p className="field-reason" data-shadowed={shadowing.join(' ')}>
            {shadowing.join(', ')} {shadowing.length === 1 ? 'declares' : 'each declare'} a style of {shadowing.length === 1 ? 'its' : 'their'} own called {name}, used there instead.
          </p>
        )}
      </div>
      <p className="field-reason style-radius" data-radius-bound={bound?.radius ?? ''}>
        {bound === undefined
          ? 'No element using it has a literal width and height, so its radius is checked where each user is placed.'
          : `Radius at most ${bound.radius}: ${bound.element} is ${bound.width}×${bound.height}, and a rounded box needs 2 × radius no more than its width and height (§10).`}
      </p>
    </div>
  );
}

/**
 * @brief A constant's references: every `#name`, by file and attribute.
 *
 * @param workspace The session.
 * @param node      The `<int>` or `<string>` constant.
 */
export function ConstFacts({ workspace, node }: { readonly workspace: Workspace; readonly node: FormNode }): React.JSX.Element {
  const run = useObservable(workspace.loop.lastRun);
  const name = valueOf(node, 'name') ?? '';
  const refs = run === undefined ? undefined : workspaceReferences(workspace);
  const uses = refs === undefined || name === '' ? [] : constUses(refs, name);
  return (
    <div className="const-facts" data-const={name}>
      <span className="field-reason">Used by</span>
      <UserLinks workspace={workspace} users={uses} />
    </div>
  );
}
