/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-widget-manifest.ts
 * Purpose: Transforms raw XML AST into typed WidgetManifest models (§6.4, §13.1).
 * Description: Parses widget metadata (`name`, `extends`), public property descriptors —
 *              each resolving to a `setter=` or `draw=` emission target ([D-18]) — reactive
 *              binding slots, and child collection element definitions. A manifest's
 *              widget-level `animated` attribute is a [D-18] fossil: recognised for backward
 *              compatibility but silently ignored, not read into the model and never a parse
 *              error, since realisation is now decided per instance by the generator (§6.1)
 *              rather than declared by the manifest.
 *
 *              PR-3R WO9 folded the former `parse-component.ts` in here: [D-18]
 *              leaves one element vocabulary, so a composite is parsed by this
 *              same function, distinguished only by an optional `<view>` child
 *              — not by a second root tag or a second parser. A `<component>`
 *              root (the tag this replaces) is a hard, named error rather than
 *              a generic "unexpected root element" diagnostic, because the
 *              fix is always the same three-step migration and the CLI can
 *              say so instead of making the author work it out.
 *
 *              Schema 0.5's palette metadata — `label`, `category` and
 *              `description` on `<api>` — is read here, trimmed, and nothing
 *              else: whether a value is allowed (its length, an empty value,
 *              a 0.4 project using it at all) is the schema pass's question,
 *              so this parser keeps whatever was written for that pass to
 *              judge.
 *
 * Exports:
 * - parseWidgetManifest: Transform a parsed RawXmlElement into a WidgetManifest model
 * - parseWidgetManifestFile: Parse a raw XML string into a ParseResult<WidgetManifest>
 */

import {
  PALETTE_METADATA_KEYS,
  type ApiBlock,
  type BindDef,
  type ElementArgDef,
  type ElementDef,
  type PaletteMetadataKey,
  type PaletteMetadataLocations,
  type PropDef,
  type PropType,
  type WidgetManifest,
} from '../schema/widget-manifest.js';
import type { View } from '../schema/screen.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import {
  getAttributeLocation,
  getAttributeValue,
  getBooleanAttribute,
  getChild,
  getNumberAttribute,
  requireAttribute,
  type RawXmlElement,
} from './raw-xml.js';
import { parseWidgetTree } from './parse-widget-tree.js';
import type { ParseOptions, SourceEdit } from './name-policy.js';
import { parseFocusRing } from './parse-screen.js';
import { tokenizeXml } from './cst-adapter.js';
import type { ParseResult } from './index.js';

/**
 * The specific, named fix for both `<component>`-removal hard errors ([D-18],
 * design_spec §15.4). Shared by the root-tag check below and by
 * `read-project.ts`'s `components/`-directory check, so the two diagnostics
 * a migrating author can hit read as one instruction rather than two
 * independently-worded guesses.
 */
export const COMPONENT_REMOVED_MIGRATION =
  "move 'components/x/' to 'widgets/x/', change its root element to " +
  "'<widget>', and give it a '<view>' ([D-18])";

/**
 * Transforms a raw XML root element into a typed WidgetManifest model.
 *
 * A composite (§6.4) is not a second parse path: it is this same function,
 * recognising an optional `<view>` child on the `<widget>` root. `extends`
 * is left unset when a `<view>` is present, because a composite has no C++
 * class of its own to extend (widget-manifest.ts) — `validate-schema.ts`
 * still requires `extends` on the plain-widget path only.
 */
export function parseWidgetManifest(
  root: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
  options?: ParseOptions,
): WidgetManifest | undefined {
  if (root.name === 'component') {
    // Named hard error, not a generic "unexpected root" — §15.4 requires the
    // 0.4 vocabulary's removal to be diagnosable at the point of use, not
    // just in the one-time 0.3 schema-version refusal (validate-schema.ts).
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `'<component>' is removed: ${COMPONENT_REMOVED_MIGRATION}.`,
      offendingText: root.name,
    });
    return undefined;
  }

  if (root.name !== 'widget') {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Expected root element <widget>, found <${root.name}>`,
      offendingText: root.name,
    });
    return undefined;
  }

  const nameAttr = requireAttribute(root, 'name', filename, diagnostics);
  const name = nameAttr?.value ?? '';

  // [D-18]: `animated` is gone from the widget-level contract — realisation is
  // decided per instance by the generator (§6.1), not declared by the
  // manifest. A manifest still carrying the attribute (pre-[D-18] fixtures,
  // or a hand-authored widget nobody has migrated yet) is not an error: the
  // attribute is simply not read into the model. See WO4 Completion Report
  // for why "ignored" was chosen over "parse error".

  const props: PropDef[] = [];
  const bindings: BindDef[] = [];
  const elements: ElementDef[] = [];

  // A composite's own `<api>` props are template parameters (§6.4, §13.6):
  // expansion substitutes them into the `<view>`, and the container is a plain
  // `u8g2gl_obj` with no such method, so nothing may call a setter for one.
  const isComposite = getChild(root, 'view') !== undefined;

  const apiEl = getChild(root, 'api');
  if (apiEl) {
    for (const child of apiEl.children) {
      if (child.name === 'prop') {
        const propNameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const propTypeAttr = requireAttribute(child, 'type', filename, diagnostics);
        const propName = propNameAttr?.value ?? '';
        const propType = (propTypeAttr?.value ?? 'string') as PropType;
        // [D-18]: a property reaches the display through exactly one emission
        // target — `setter=` (a method on the element's class) or `draw=` (a
        // free `u8g2gl_draw_*` function for a classless drawing element,
        // §6.2). A plain widget's prop naming neither keeps the pre-[D-18]
        // `set_<name>` default rather than silently becoming a draw call. A
        // composite's template parameter gets no invented setter at all (PR-04
        // WO11b, WO10 finding 1): emission used to have to filter
        // `set_title_subject(…)` back out, because it would not compile.
        const setterAttr = getAttributeValue(child, 'setter');
        const drawAttr = getAttributeValue(child, 'draw');
        const setter = setterAttr ?? (drawAttr || isComposite ? undefined : `set_${propName}`);
        const defaultVal = getAttributeValue(child, 'default');
        const required = getBooleanAttribute(child, 'required');
        const isAnimated = getBooleanAttribute(child, 'animated');
        const emit = getAttributeValue(child, 'emit');
        const values = getAttributeValue(child, 'values');
        const help = getAttributeValue(child, 'help');

        props.push({
          name: propName,
          type: propType,
          setter,
          draw: drawAttr,
          default: defaultVal,
          required,
          animated: isAnimated,
          emit,
          values,
          help,
          loc: child.loc,
        });
      } else if (child.name === 'bind') {
        const bindNameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const bindTypeAttr = requireAttribute(child, 'type', filename, diagnostics);
        const bindName = bindNameAttr?.value ?? '';
        const bindType = bindTypeAttr?.value ?? 'string';
        const setter = getAttributeValue(child, 'setter') ?? bindName;
        const fmt = getAttributeValue(child, 'fmt');
        const nameLoc = getAttributeLocation(child, 'name');
        const typeLoc = getAttributeLocation(child, 'type');
        const setterLoc = getAttributeLocation(child, 'setter');

        bindings.push({
          name: bindName,
          type: bindType,
          setter,
          fmt,
          loc: child.loc,
          attributeLocs: {
            ...(nameLoc ? { name: nameLoc } : {}),
            ...(typeLoc ? { type: typeLoc } : {}),
            ...(setterLoc ? { setter: setterLoc } : {}),
          },
        });
      } else if (child.name === 'element') {
        const elemNameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const elemName = elemNameAttr?.value ?? '';
        const access = getAttributeValue(child, 'access') ?? 'add';
        const help = getAttributeValue(child, 'help');

        const args: ElementArgDef[] = [];
        for (const argChild of child.children) {
          if (argChild.name === 'arg') {
            const argNameAttr = requireAttribute(argChild, 'name', filename, diagnostics);
            const argTypeAttr = requireAttribute(argChild, 'type', filename, diagnostics);
            const maxLen =
              getNumberAttribute(argChild, 'max_len', filename, diagnostics) ??
              getNumberAttribute(argChild, 'maxLen', filename, diagnostics);

            args.push({
              name: argNameAttr?.value ?? '',
              type: (argTypeAttr?.value ?? 'string') as PropType,
              maxLen,
              loc: argChild.loc,
            });
          } else {
            diagnostics.push({
              code: DIAGNOSTIC_CODES.MALFORMED_XML,
              severity: 'error',
              file: filename,
              line: argChild.loc.line,
              column: argChild.loc.column,
              message: `Unknown element '<${argChild.name}>' in <element> definition`,
              offendingText: argChild.name,
            });
          }
        }

        elements.push({
          name: elemName,
          access,
          args,
          help,
          loc: child.loc,
        });
      } else {
        diagnostics.push({
          code: DIAGNOSTIC_CODES.MALFORMED_XML,
          severity: 'error',
          file: filename,
          line: child.loc.line,
          column: child.loc.column,
          message: `Unknown element '<${child.name}>' in <widget> <api>`,
          offendingText: child.name,
        });
      }
    }
  }

  const apiBlock: ApiBlock = {
    props,
    bindings,
    elements,
    ...(apiEl ? parsePaletteMetadata(apiEl) : {}),
    loc: apiEl?.loc,
  };

  // --- Composite view (§6.4, [D-18]) ---
  // One element vocabulary means a composite is this same `<widget>` root
  // with a `<view>` child, not a second tag. Both shapes keep `extends`
  // exactly as written (PR-04 WO7). A composite normally declares none — it
  // has no C++ class of its own — but one that does is claiming a class, which
  // Pass 8 refuses until PR-08. Dropping it here made that refusal unreachable
  // from real XML (PR-04 WO5b F1): the author's `extends` vanished silently.
  //
  // No default is filled in here (PR-04 WO2, F2). Defaulting a missing
  // `extends` to 'u8g2gl_obj' made validate-schema.ts's "missing required
  // 'extends'" diagnostic unreachable and made u8g2gl_obj appear to extend
  // itself. The one legitimate default — a composite realises as u8g2gl_obj
  // (§13.12) — is applied by the manifest registry, where it is visible.
  const extendsLoc = getAttributeLocation(root, 'extends');
  const extendsVal = getAttributeValue(root, 'extends');
  const declaredExtends =
    extendsVal !== undefined && extendsLoc !== undefined ? { extends: extendsVal, extendsLoc } : {};
  const viewEl = getChild(root, 'view');
  if (!viewEl) {
    return {
      name,
      ...declaredExtends,
      api: apiBlock,
      loc: root.loc,
    };
  }

  const viewFocusRingEl = getChild(viewEl, 'focus_ring');
  const focusRing = viewFocusRingEl
    ? parseFocusRing(viewFocusRingEl, filename, diagnostics)
    : undefined;

  const visualChildren = viewEl.children.filter((child) => child.name !== 'focus_ring');
  const widgetChildren = parseWidgetTree(visualChildren, filename, diagnostics, options);

  const view: View = {
    children: widgetChildren,
    focusRing,
    loc: viewEl.loc,
  };

  return {
    name,
    ...declaredExtends,
    api: apiBlock,
    view,
    loc: root.loc,
  };
}

/** An `<api>`'s palette metadata as parsed: the values written, and where. */
type ParsedPaletteMetadata = { -readonly [K in PaletteMetadataKey]?: string } & {
  metadataLocs?: PaletteMetadataLocations;
};

// parsePaletteMetadata
// Reads schema 0.5's `label`, `category` and `description` from an `<api>`,
// each trimmed, with where each was written. An attribute that is absent
// leaves its field absent; one written empty (or only whitespace) is kept as
// '' so the schema pass can say the author wrote it and meant nothing by it,
// rather than the parser quietly treating it as never written.
//   apiEl — the `<api>` element
function parsePaletteMetadata(apiEl: RawXmlElement): ParsedPaletteMetadata {
  const parsed: ParsedPaletteMetadata = {};
  const locs: { -readonly [K in PaletteMetadataKey]?: PaletteMetadataLocations[K] } = {};
  for (const key of PALETTE_METADATA_KEYS) {
    const value = getAttributeValue(apiEl, key);
    const loc = getAttributeLocation(apiEl, key);
    if (value === undefined || loc === undefined) continue;
    parsed[key] = value.trim();
    locs[key] = loc;
  }
  if (Object.keys(locs).length > 0) parsed.metadataLocs = locs;
  return parsed;
}

/**
 * Parses a widget manifest XML file from raw text into a ParseResult<WidgetManifest>.
 *
 * `options` matters only for a composite's `<view>` tree — a plain widget
 * manifest has no instantiated elements to name — but is threaded through
 * unconditionally so a caller need not know in advance which shape a file
 * will turn out to be, the same reasoning `parseScreenFile` uses.
 */
export function parseWidgetManifestFile(
  xml: string,
  filename: string,
  options?: ParseOptions,
): ParseResult<WidgetManifest> {
  const rawDoc = tokenizeXml(xml, filename);
  const diagnostics = [...rawDoc.diagnostics];

  const nameEdits: SourceEdit[] = options?.nameEdits ?? [];

  if (!rawDoc.root) {
    return { diagnostics, nameEdits };
  }

  const manifest = parseWidgetManifest(rawDoc.root, filename, diagnostics, {
    ...options,
    nameEdits,
  });
  const hasError = diagnostics.some((d) => d.severity === 'error');

  if (hasError || !manifest) {
    return { diagnostics, nameEdits };
  }

  return {
    value: manifest,
    diagnostics,
    nameEdits,
  };
}
