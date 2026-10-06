/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/manifest/manifest-registry.ts
 * Purpose: The single answer to "what is <tag>, and what does it accept?" for
 *          every element a document may use. Framework and project manifests,
 *          plain widgets and composites, go into one namespace ([D-18]: one
 *          element vocabulary) with `extends` resolved once, here, into an
 *          effective manifest. The validator, resolver, realisation and both
 *          emitters all read manifests; without this each would invent its own
 *          lookup and its own idea of inheritance ([D-17], §13.1).
 * Description: Registers declarations (framework first), rejects a project
 *              manifest that redeclares a framework tag, then resolves each
 *              element's `extends` chain — merging props by name and bindings by
 *              (name, type), parent order first, a child's override keeping its
 *              parent's position — and diagnoses unknown `extends` targets (with
 *              §6.5's remedy), cycles, and an `extends` that names a drawing
 *              element, which has no class to inherit (§6.5, [D-18]).
 *
 * Exports:
 * - ManifestOrigin:          Where a manifest came from ('framework' | 'project')
 * - EffectiveManifest:       A manifest with its inherited props and bindings merged in
 * - ManifestRegistryInput:   Framework and project manifest lists
 * - ManifestRegistry:        Lookup by tag, declaration lists, and registry diagnostics
 * - buildManifestRegistry(): Build a registry from framework and project manifests
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { BindDef, PropDef, WidgetManifest } from '../schema/widget-manifest.js';
import { findClosest } from '../catalogue/edit-distance.js';

/**
 * Where a manifest was declared. Framework manifests ship with the CLI; project
 * manifests come from the project's `widgets/` directory.
 */
export type ManifestOrigin = 'framework' | 'project';

/**
 * A manifest as consumers should see it: its `api.props` and `api.bindings`
 * include everything inherited through `extends`.
 *
 * Declaration order is a contract, not an accident — later stages emit setter
 * calls in this order. Inherited declarations come first in the parent's order;
 * a child's own additions follow in the child's order; a child declaration with
 * the same key as an inherited one replaces it **in the parent's position**.
 * A prop's key is its `name`. A binding's key is its `name` **and** `type`: one
 * binding attribute may accept several subject types (`bind_text` takes a
 * string or an int subject, §8.4), each declared as its own `<bind>`, so the
 * effective list can hold several bindings with one `name` — one per accepted
 * type (PR-04 WO5a).
 * `api.elements` is the element's own list only; inheritance of collection
 * elements is not defined by this registry.
 */
export interface EffectiveManifest extends WidgetManifest {
  /** Where this element's manifest was declared. */
  readonly origin: ManifestOrigin;
  /** The manifest exactly as declared, before inheritance was merged in. */
  readonly declared: WidgetManifest;
  /**
   * This element's tag followed by each ancestor's, nearest first — e.g.
   * `['u8g2gl_label', 'u8g2gl_obj']`. Stops at an unknown or cyclic `extends`.
   */
  readonly chain: readonly string[];
}

/**
 * Manifests to register, split by origin because origin decides the shadowing
 * rule.
 */
export interface ManifestRegistryInput {
  /** Manifests shipped with the framework (bundled from include/u8g2gl/manifests/). */
  readonly framework: readonly WidgetManifest[];
  /** Manifests found in the project's own widgets/ directory. */
  readonly project: readonly WidgetManifest[];
}

/**
 * Every element known to a document, looked up by tag.
 */
export interface ManifestRegistry {
  /** Effective manifest for `tag`, or undefined if no manifest declares it. */
  get(tag: string): EffectiveManifest | undefined;
  /** Whether any manifest declares `tag`. */
  has(tag: string): boolean;
  /** Every known tag, framework first, then project, each in input order. */
  readonly tags: readonly string[];
  /**
   * Declared (un-merged) composites — manifests carrying a `<view>` — in input
   * order, for checks about a declaration's own content. Includes duplicate
   * declarations of one tag; excludes project copies rejected as shadowing.
   */
  readonly declaredComposites: readonly WidgetManifest[];
  /** Declared (un-merged) plain widgets — no `<view>` — on the same terms. */
  readonly declaredWidgets: readonly WidgetManifest[];
  /** Shadowing, unknown-`extends` and `extends`-cycle diagnostics. */
  readonly diagnostics: readonly Diagnostic[];
}

/** A registered declaration awaiting resolution. */
interface Registration {
  readonly manifest: WidgetManifest;
  readonly origin: ManifestOrigin;
}

// mergeByKey
// Merges inherited declarations with an element's own, by a declaration key.
// Inherited order is kept; an own declaration either replaces the inherited one
// with the same key in place or is appended.
//   inherited — the parent's effective list, already fully merged
//   own       — the element's own declarations, in declaration order
//   keyOf     — the identity two declarations must share to be one declaration
function mergeByKey<T>(inherited: readonly T[], own: readonly T[], keyOf: (decl: T) => string): T[] {
  const merged = [...inherited];
  const indexByKey = new Map<string, number>();
  merged.forEach((decl, index) => indexByKey.set(keyOf(decl), index));
  for (const decl of own) {
    const key = keyOf(decl);
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(decl);
    } else {
      merged[index] = decl;
    }
  }
  return merged;
}

/** A prop is identified by its attribute name. */
const propKey = (prop: PropDef): string => prop.name;

/**
 * A binding is identified by its attribute name and subject type, so that
 * `<bind name="bind_text" type="string">` and `type="int"` are two overloads of
 * one attribute rather than one overriding the other (PR-04 WO5a). A child that
 * redeclares `bind_text` as a string replaces only the inherited string form.
 * Newline-separated because neither an XML name nor a type can contain one.
 */
const bindingKey = (binding: BindDef): string => `${binding.name}\n${binding.type}`;

/**
 * The root class manifest: the base every generated object is reached through
 * (§13.7's `u8g2gl_obj* const` object arrays), so the one class-backed manifest
 * that declares no `extends`. It is also what a composite inherits, since a
 * composite has no class of its own and realises as a `u8g2gl_obj` (§13.12).
 * A contract constant, not an element list: the schema pass uses it to exempt
 * the root from the `extends` requirement, and nothing else is special-cased.
 */
export const ROOT_CLASS_MANIFEST = 'u8g2gl_obj';

/**
 * @brief Whether a manifest describes a **drawing element**: it has no `<view>`,
 *        its own props declare `draw=`, and none declares `setter=` ([D-18], §6.2).
 *
 * A drawing element compiles to a free `u8g2gl_draw_*` call and never has a
 * class, so it has no base to `extends`, no object, and nothing to disable.
 * Decided from the manifest, never from a list of tags ([D-17]) — a custom
 * element becomes one simply by declaring only `draw=` props.
 *
 * Pass the manifest **as declared**: on an `EffectiveManifest` that is
 * `.declared`. Inherited props would answer a different question, because a
 * manifest that wrongly declares `extends` (which the schema pass reports)
 * would inherit `u8g2gl_obj`'s setters and stop looking like what it is.
 *
 * Before PR-04 WO8a this was spelled three times — the schema pass, the prop
 * pass and the manifest cross-test — which is exactly where WO5a finding 2 said
 * the next defect would hide.
 *
 * @param manifest A declared manifest, or undefined for an unknown tag.
 * @return True when the manifest is a drawing element.
 */
export function isDrawingElement(manifest: WidgetManifest | undefined): boolean {
  const props = manifest?.api?.props ?? [];
  return (
    manifest !== undefined &&
    manifest.view === undefined &&
    props.some((prop) => prop.draw !== undefined) &&
    !props.some((prop) => prop.setter !== undefined)
  );
}

/**
 * The flags a `<bind_flag_if_*>` directive may set (§8.4). Fixed by the spec for
 * every element rather than declared per manifest (PR-04 WO3 PA decision), so it
 * names the binding contract, not elements ([D-17]).
 *
 * It lives beside {@link isDrawingElement} because the two are read together:
 * which flags exist, and which of them a given element can actually carry.
 * Before PR-04 WO8a the set was spelled in two passes (WO7 F8).
 */
export const BINDING_FLAGS: readonly string[] = ['hidden', 'disabled'];

/**
 * The flags that need an object to live on. `hidden` applies to every element —
 * an object flag, or a draw-time guard on a drawing element (§13.5) — but a
 * drawing element has no object, so there is nothing to disable (PR-04 WO5a).
 */
export const OBJECT_ONLY_FLAGS: readonly string[] = ['disabled'];

// parentTagOf
// The tag a manifest inherits from, or undefined for a root. A manifest that
// names itself is not a root — it falls through to the cycle diagnostic.
//   manifest     — a declared manifest
//   isRegistered — whether a tag has a registered manifest
function parentTagOf(
  manifest: WidgetManifest,
  isRegistered: (tag: string) => boolean,
): string | undefined {
  if (manifest.extends === undefined) {
    // A composite has no class of its own but realises as a u8g2gl_obj, so it
    // inherits that manifest (PR-04 WO2, F2). Only a composite: a drawing
    // element has no class to inherit ([D-18]), and a class-backed widget
    // without `extends` is reported by the schema pass. When no u8g2gl_obj is
    // registered — hand-built registries in unit tests; never a real project,
    // which always has the framework bundle — the default is skipped rather
    // than reported, because the author wrote no `extends` to point at.
    if (
      manifest.view !== undefined &&
      manifest.name !== ROOT_CLASS_MANIFEST &&
      isRegistered(ROOT_CLASS_MANIFEST)
    ) {
      return ROOT_CLASS_MANIFEST;
    }
    return undefined;
  }
  return manifest.extends;
}

function manifestDiagnostic(
  code: string,
  message: string,
  manifest: WidgetManifest,
  offendingText: string,
  suggestions: readonly string[] = [],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: manifest.loc?.file ?? '',
    line: manifest.loc?.line ?? 1,
    column: manifest.loc?.column ?? 1,
    message,
    offendingText,
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

/**
 * Builds the element registry from framework and project manifests.
 *
 * Never throws for a user error: a shadowing copy, an unknown `extends` target
 * or an `extends` cycle becomes a diagnostic, and the registry is still usable.
 * A shadowing project manifest is excluded outright, so its tag resolves to the
 * framework manifest. An element whose chain breaks keeps whatever it resolved
 * up to the break.
 *
 * Deterministic for a given input order: the same manifests in the same order
 * produce the same registry and diagnostics (§13.9).
 *
 * @param input Framework and project manifests.
 * @return The registry, carrying its own diagnostics.
 */
export function buildManifestRegistry(input: ManifestRegistryInput): ManifestRegistry {
  const diagnostics: Diagnostic[] = [];
  const registrations = new Map<string, Registration>();
  const declaredComposites: WidgetManifest[] = [];
  const declaredWidgets: WidgetManifest[] = [];

  const declare = (manifest: WidgetManifest): void => {
    (manifest.view ? declaredComposites : declaredWidgets).push(manifest);
  };

  // --- Step 1: Register framework manifests ---
  for (const manifest of input.framework) {
    if (!registrations.has(manifest.name)) {
      registrations.set(manifest.name, { manifest, origin: 'framework' });
    }
    declare(manifest);
  }

  // --- Step 2: Register project manifests, rejecting framework shadows ---
  for (const manifest of input.project) {
    const existing = registrations.get(manifest.name);
    if (existing?.origin === 'framework') {
      // A hard error rather than letting the project copy win: a local copy of
      // a framework manifest silently goes stale when the framework changes —
      // exactly how four test fixtures came to carry `animated="false"` after
      // [D-18] removed it. The framework manifest ships with the CLI, so the
      // copy has no reason to exist.
      const projectFile = manifest.loc?.file ?? manifest.name;
      const frameworkFile = existing.manifest.loc?.file ?? existing.manifest.name;
      diagnostics.push(
        manifestDiagnostic(
          DIAGNOSTIC_CODES.SHADOWED_FRAMEWORK_MANIFEST,
          `Project manifest '${projectFile}' redeclares framework element <${manifest.name}>, ` +
            `already declared by '${frameworkFile}'. Framework manifests ship with the CLI; ` +
            `delete '${projectFile}'.`,
          manifest,
          manifest.name,
        ),
      );
      continue;
    }
    // Duplicate project declarations of one tag: the first wins lookup; both
    // stay in the declared lists so existing per-declaration checks still see them.
    if (!existing) {
      registrations.set(manifest.name, { manifest, origin: 'project' });
    }
    declare(manifest);
  }

  // --- Step 3: Resolve every element's extends chain, memoised ---
  const tags = Array.from(registrations.keys());
  const effective = new Map<string, EffectiveManifest>();
  const reportedCycles = new Set<string>();

  const resolveTag = (tag: string, inProgress: readonly string[]): EffectiveManifest | undefined => {
    const cached = effective.get(tag);
    if (cached) {
      return cached;
    }
    const registration = registrations.get(tag);
    if (!registration) {
      return undefined;
    }
    const { manifest, origin } = registration;
    const path = [...inProgress, tag];
    const parentTag = parentTagOf(manifest, (candidate) => registrations.has(candidate));

    let parent: EffectiveManifest | undefined;
    if (parentTag !== undefined) {
      if (path.includes(parentTag)) {
        // Cycle. Keyed by its sorted member set so `a -> b -> a` is reported
        // once, not once per member the resolution happens to start from.
        const cycle = [...path.slice(path.indexOf(parentTag)), parentTag];
        const key = [...new Set(cycle)].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          diagnostics.push(
            manifestDiagnostic(
              DIAGNOSTIC_CODES.CIRCULAR_REFERENCE,
              `Manifest 'extends' cycle: ${cycle.join(' -> ')}.`,
              manifest,
              parentTag,
            ),
          );
        }
      } else if (!registrations.has(parentTag)) {
        // The remedy is part of the message (Chief Architect ruling on WO1 F3):
        // the likeliest cause is not a typo but a real C++ class that has no
        // manifest, and §6.5 says exactly what fixes that. The near-miss
        // suggestions still cover the typo case.
        diagnostics.push(
          manifestDiagnostic(
            DIAGNOSTIC_CODES.UNKNOWN_WIDGET,
            `Manifest <${tag}> extends unknown element '${parentTag}'. 'extends' must name an ` +
              `element that has a manifest (§6.5). If '${parentTag}' is a C++ class, give it a ` +
              `manifest — an <api> with no new props is enough.`,
            manifest,
            parentTag,
            findClosest(parentTag, tags),
          ),
        );
      } else {
        parent = resolveTag(parentTag, path);
        // §6.5: a drawing element has no class to inherit from. The test reads
        // the parent's declared manifest, and skips a manifest that is itself a
        // drawing element, which the schema pass already reports as declaring
        // `extends` — there the child, not the parent, is at fault.
        if (
          isDrawingElement(registrations.get(parentTag)?.manifest) &&
          !isDrawingElement(manifest)
        ) {
          diagnostics.push(
            manifestDiagnostic(
              DIAGNOSTIC_CODES.EXTENDS_DRAWING_ELEMENT,
              `Manifest <${tag}> extends drawing element '${parentTag}'. A drawing element has ` +
                `no class — it is drawn by free functions ([D-18]) — so there is nothing to ` +
                `inherit, and the generated code would call methods on a type with no such ` +
                `members (§6.5). Declare a drawing element of your own (props with draw=, no ` +
                `'extends'), or use extends="u8g2gl_obj" and draw from your own class.`,
              manifest,
              parentTag,
            ),
          );
          // The result keeps the parent's props deliberately: dropping them would add an
          // "unknown attribute" error for every instance attribute on top of
          // this one, burying the cause under its consequences.
        }
      }
    }

    const result: EffectiveManifest = {
      ...manifest,
      api: {
        ...manifest.api,
        props: mergeByKey(parent?.api.props ?? [], manifest.api.props, propKey),
        bindings: mergeByKey(parent?.api.bindings ?? [], manifest.api.bindings, bindingKey),
      },
      origin,
      declared: manifest,
      chain: [tag, ...(parent?.chain ?? [])],
    };
    effective.set(tag, result);
    return result;
  };

  for (const tag of tags) {
    resolveTag(tag, []);
  }

  return {
    get: (tag) => effective.get(tag),
    has: (tag) => effective.has(tag),
    tags,
    declaredComposites,
    declaredWidgets,
    diagnostics,
  };
}
