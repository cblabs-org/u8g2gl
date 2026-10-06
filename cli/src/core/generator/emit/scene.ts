/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/scene.ts
 * Purpose: The scene description (ui_spec §4.1 step 6): what the editor host
 *          hands the Wasm runtime so it can construct, tick and render a screen
 *          through the registry ([UD-4]) without a compiler. It is emitted from
 *          the **same resolved, flattened model** the firmware screen units are —
 *          realisation's objects, parent table and draw order (WO8b), the
 *          resolver's literals moved into device space (`placement.ts`), and the
 *          screen model's answers to which properties, styles, overrides and
 *          flag comparisons each element has (`screen-model.ts`). A scene is the
 *          firmware screen unit's content as data, so building it through the
 *          registry must draw exactly what the firmware draws; WO11's parity test
 *          checks that against the U8G2 stub.
 *
 *          Subjects are **described, not valued**: their names, types and string
 *          capacities are here, but no value is — the editor host supplies values
 *          (sample data, [UD-6], is out of scope for PR-04).
 *
 * Description: `describeScenes()` builds the description as a plain object;
 *              `emitSceneFile()` serialises it as `ui_scene.json`, two-space
 *              indented, keys in a fixed order, so an unchanged project
 *              regenerates byte-identically (§13.9). Values keep their §13.2
 *              type as JSON types: an `int` prop is a number, a `bool` a boolean,
 *              everything else the text the author wrote, which the host maps
 *              through the registry entry's declared type.
 *
 *              Format, version 3 (version 3 added a draw call's `clip`; version
 *              2 added `origin`; version 1 had neither):
 *              - `u8g2gl_generated`: the marker the **writer** recognises the file
 *                by. A host reads nothing from it, and it is not part of the
 *                format a host checks, so adding it did not bump the version —
 *                every host already ignores keys it does not read (WO12).
 *              - `generated`: the stamp fields every generated C++ file carries
 *              - `display`: the target's width and height
 *              - `init`: the order objects are configured in after construction
 *                (`styles`, `properties`, `bindings`), as the firmware init does
 *              - `subjects`: `{ name, type, max_len? }` — never a value
 *              - `styles`: `{ name, properties: [{ name, value }] }` in applied order
 *              - `fonts`, `images`: the names the host must resolve to data
 *              - `screens[]`: `{ name, objects, parents, elements }`, where
 *                `elements` is the draw order ([D-4]) and each element is either
 *                an **object** — `class`, `object`, `parent`, `rect`,
 *                `properties`, `styles`, `style_overrides`, `bindings`, `flags` —
 *                or a **draw call** — `arguments` (bound ones name a subject;
 *                absent ones take the manifest default), `visibility`, and,
 *                only when the call is clipped, `clip`: the object index whose
 *                effective clip it is drawn inside, as firmware draws it inside
 *                a `u8g2gl_clip_scope` (§13.5). Absent means unclipped.
 *              - A binding or bound argument that sets a position (`bind_x`,
 *                `bind_y`) carries `origin`: its container's absolute corner on
 *                that axis, which the host adds to the subject's value as
 *                firmware does (§7.2).
 *
 * Exports:
 * - SCENE_FILE:            `ui_scene.json`
 * - SCENE_FORMAT_VERSION:  The format's version, bumped on any change a host sees
 * - SceneInput:            What describing the scenes needs
 * - describeScenes():      The description as an object
 * - emitSceneFile():       The description as `ui_scene.json`
 */

import { styleProperties } from '../../schema/globals.js';
import type { PropDef } from '../../schema/widget-manifest.js';
import { namedStyles } from '../../schema/widget-node.js';
import type { ManifestRegistry } from '../../manifest/index.js';
import type { ResolvedScreen } from '../../resolver/index.js';
import { U8G2GL_NO_PARENT, type RealisedBinding, type RealisedElement, type RealisedScreen } from '../../realise/index.js';
import { drawArgumentSources, drawClipObject } from './draw-args.js';
import { boundPositionOrigin } from './placement.js';
import { fontDeclarations } from './fonts.js';
import { imageDeclarations } from './images.js';
import {
  classOf,
  flagComparison,
  INIT_STEPS,
  placeScreen,
  rectangleOf,
  styleOverridesOf,
  writtenProperties,
  type FlagComparison,
  type Placement,
} from './screen-model.js';
import { styleIdentifiers } from './styles.js';
import { GENERATED_JSON_MARKER_KEY, GENERATED_JSON_MARKER_VALUE } from '../header.js';
import type { ProjectEmitInput } from './unit.js';

/** The scene description's file name. */
export const SCENE_FILE = 'ui_scene.json';

/**
 * The format version. A host checks it before reading anything else; bump it
 * for any change a host would read differently.
 */
export const SCENE_FORMAT_VERSION = 3;

/** Everything describing the scenes needs. */
export interface SceneInput {
  /** Project, globals, screens and capacities — the project units' own input. */
  readonly project: ProjectEmitInput;
  /** Realisation's answer per screen, in load order (WO8b). */
  readonly realised: readonly RealisedScreen[];
  /** Each screen resolved against the target's display, in the same order. */
  readonly resolved: readonly ResolvedScreen[];
  readonly manifests: ManifestRegistry;
  /** The stamp's fields (§13.9). */
  readonly generated: {
    readonly source: string;
    readonly schema: string;
    readonly generator: string;
    readonly target: string;
  };
}

/** A JSON value, as the description holds it. */
type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

// jsonValue
// A resolved value as its §13.2 type in JSON: `int` a number, `bool` a boolean,
// everything else the text the author wrote. The host reads the type from the
// registry entry it fills, so the text is never re-parsed as an expression.
//   type — the declaring prop's type
//   text — the value as the resolver or the author settled it
function jsonValue(type: PropDef['type'], text: string): Json {
  if (type === 'int') {
    return Number(text);
  }
  if (type === 'bool') {
    return text === 'true';
  }
  return text;
}

// flagJson
// One understood directive as data: the method and subject select the registry
// entry, `ref` keeps the type firmware spells it as (screen-model.ts).
function flagJson(binding: RealisedBinding, comparison: FlagComparison): { [key: string]: Json } {
  return {
    directive: comparison.method,
    subject: binding.subject,
    subject_type: binding.subjectType ?? null,
    ref: jsonValue(comparison.refType, comparison.ref),
    flag: comparison.flag,
  };
}

// understood
// A directive's comparison. Firmware emission has already refused any directive
// that has none, and the scene is only described for a build it accepted.
function understood(binding: RealisedBinding, element: RealisedElement): FlagComparison {
  const comparison = flagComparison(binding, element.identifier, element.element.node.tag);
  if ('code' in comparison) {
    throw new Error(
      `The scene describes '${element.identifier}', whose ${binding.attribute} firmware emission refuses ` +
        `(${comparison.message}); a scene is only described for a build that generated.`,
    );
  }
  return comparison;
}

// source
// Where an element came from, so the editor can map a canvas hit back to the
// text (ui_spec §4.3).
function source(element: RealisedElement): Json {
  const loc = element.element.node.loc;
  return loc === undefined ? null : { file: loc.file, line: loc.line, column: loc.column };
}

// objectJson
// An object as the firmware's init builds it (§13.7): its class, place in the
// flat model, rectangle, written properties, styles, overrides, then bindings.
//   element   — the realised object
//   placement — its manifest and device-space model
function objectJson(element: RealisedElement, placement: Placement): { [key: string]: Json } {
  const rectangle = rectangleOf(element, placement);
  const bindings: Json[] = [];
  const flags: Json[] = [];
  for (const binding of element.bindings) {
    if (binding.kind === 'flag') {
      flags.push(flagJson(binding, understood(binding, element)));
      continue;
    }
    const declaration = binding.declaration;
    if (declaration === undefined) {
      throw new Error(`'${element.identifier}' binds '${binding.subject}' with no chosen overload.`);
    }
    // The format is passed exactly when firmware passes it: the overload names
    // one and the author wrote it.
    const fmt = declaration.fmt === undefined ? undefined : placement.absolute.node.attributes[declaration.fmt];
    // A position binding carries its container's origin, exactly as firmware
    // passes it to bind_x/bind_y (§7.2).
    const origin = boundPositionOrigin(binding.attribute, placement.origin);
    bindings.push({
      name: declaration.name,
      subject: binding.subject,
      subject_type: binding.subjectType ?? null,
      ...(typeof fmt === 'string' ? { fmt } : {}),
      ...(origin === undefined ? {} : { origin }),
    });
  }
  return {
    name: element.identifier,
    tag: element.element.node.tag,
    realisation: 'object',
    source: source(element),
    class: classOf(placement.manifest).name,
    object: element.objectIndex ?? null,
    parent: element.parentIndex === U8G2GL_NO_PARENT ? null : element.parentIndex,
    // A bound axis is passed as 0, exactly as firmware passes it; its binding
    // sets the real value when registered.
    rect: rectangle === undefined ? null : rectangle.axes.map((axis) => axis.value ?? 0),
    properties: writtenProperties(placement).map(({ prop, literal }) => ({
      name: prop.name,
      value: jsonValue(prop.type, literal),
    })),
    styles: namedStyles(placement.absolute.node),
    style_overrides: styleOverridesOf(placement).applied.map(({ prop, value }) => ({
      name: prop.name,
      value: jsonValue(prop.type, value),
    })),
    bindings,
    flags,
  };
}

// drawCallJson
// A draw-call element as the firmware's render function draws it: each argument
// from the one precedence rule (draw-args.ts) — a bound one names its subject,
// read at draw time; a default is left to the registry thunk, which spells it as
// the firmware does — its build-time visibility as terms, and the object whose
// clip it is drawn inside, by the rule firmware emission reads.
//   element   — the realised draw-call element
//   placement — its manifest and device-space model
function drawCallJson(element: RealisedElement, placement: Placement): { [key: string]: Json } {
  const args: Json[] = [];
  const sources = drawArgumentSources({
    manifest: placement.manifest,
    resolved: placement.absolute,
    bindings: element.bindings,
    origin: placement.origin,
  });
  for (const argument of sources) {
    if (argument.kind === 'bound') {
      args.push({
        name: argument.prop.name,
        subject: argument.binding.subject,
        subject_type: argument.binding.subjectType ?? null,
        ...(argument.origin === undefined ? {} : { origin: argument.origin }),
      });
    } else if (argument.kind === 'written') {
      args.push({ name: argument.prop.name, value: jsonValue(argument.prop.type, argument.literal) });
    }
  }
  const visibility: Json[] = (element.visibility ?? []).map((term): Json => {
    if (term.kind === 'ancestor_visible') {
      return { ancestor: term.objectIndex };
    }
    const binding = element.bindings.find((candidate) => candidate.directive === term.directive);
    if (binding === undefined) {
      throw new Error(`A visibility term of '${element.identifier}' names a directive it does not carry.`);
    }
    const comparison = understood(binding, element);
    return {
      directive: comparison.method,
      subject: binding.subject,
      subject_type: binding.subjectType ?? null,
      ref: jsonValue(comparison.refType, comparison.ref),
    };
  });
  const clip = drawClipObject(element, sources);
  return {
    name: element.identifier,
    tag: element.element.node.tag,
    realisation: 'draw_calls',
    source: source(element),
    arguments: args,
    visibility,
    ...(clip === undefined ? {} : { clip }),
  };
}

// screenJson
// One screen: its object count, parent table and elements in draw order.
function screenJson(realised: RealisedScreen, resolved: ResolvedScreen, manifests: ManifestRegistry): Json {
  const { placements, diagnostics } = placeScreen(realised, resolved, manifests);
  if (diagnostics.length > 0) {
    throw new Error(`Screen '${realised.screen.name}' cannot be placed; firmware emission refuses it.`);
  }
  const placed = (element: RealisedElement): Placement => {
    const placement = placements.get(element);
    if (placement === undefined) {
      throw new Error(`'${element.identifier}' was not placed.`);
    }
    return placement;
  };
  return {
    name: realised.screen.name,
    objects: realised.objects.length,
    parents: realised.parents.map((parent) => (parent === U8G2GL_NO_PARENT ? null : parent)),
    elements: realised.drawOrder.map((step) =>
      step.kind === 'object' ? objectJson(step.element, placed(step.element)) : drawCallJson(step.element, placed(step.element)),
    ),
  };
}

/**
 * @brief The scene description, as an object (ui_spec §4.1 step 6).
 *
 * @param input The project, its realisation and resolution, the manifests and
 *              the stamp's fields.
 * @return The description. Deterministic: every list is in document or
 *         declaration order (§13.9).
 * @throws Error for a model firmware emission would have refused — describe a
 *         scene only for a build that generated.
 */
export function describeScenes(input: SceneInput): { readonly [key: string]: Json } {
  const { project } = input;
  const display = input.resolved[0]?.container;

  // --- Step 1: Subjects — described, never valued ---
  const subjects: Json[] = (project.globals.subjects ?? []).map((subject) => ({
    name: subject.name,
    type: subject.type,
    ...(subject.type === 'string' && subject.maxLen !== undefined ? { max_len: subject.maxLen } : {}),
  }));

  // --- Step 2: Styles, fonts and images the host must supply ---
  const styles: Json[] = styleIdentifiers(project).map(({ name, declaration }) => ({
    name,
    properties: declaration === undefined ? [] : styleProperties(declaration).map(({ attribute, value }) => ({ name: attribute, value })),
  }));
  const fonts: Json[] = fontDeclarations(project).map((font) => font.font.name);
  const images: Json[] = imageDeclarations(project).map((image) => image.image.name);

  // --- Step 3: Every screen, in load order ---
  const screens = input.realised.map((realised, index) => {
    const resolved = input.resolved[index];
    if (resolved?.screen !== realised.screen) {
      throw new Error(`Screen '${realised.screen.name}' has no matching resolved model at position ${index}.`);
    }
    return screenJson(realised, resolved, input.manifests);
  });

  return {
    // First key, so the marker is in the first bytes of the file, as the C++
    // marker is the first line of a unit. It is the writer's, not a host's:
    // JSON carries no comment, so without it the writer cannot tell this file
    // from one a person wrote and would never delete a stale one (WO11 f2).
    [GENERATED_JSON_MARKER_KEY]: GENERATED_JSON_MARKER_VALUE,
    format: 'u8g2gl-scene',
    version: SCENE_FORMAT_VERSION,
    generated: { ...input.generated },
    display: { width: display?.width ?? null, height: display?.height ?? null },
    // The order the host configures objects in after constructing them — the
    // firmware init's own order, from the one constant both targets read.
    init: [...INIT_STEPS],
    subjects,
    styles,
    fonts,
    images,
    screens,
  };
}

/**
 * @brief The scene description as `ui_scene.json` text.
 *
 * @param input As {@link describeScenes}.
 * @return Two-space-indented JSON ending in a newline.
 */
export function emitSceneFile(input: SceneInput): string {
  return `${JSON.stringify(describeScenes(input), null, 2)}\n`;
}
