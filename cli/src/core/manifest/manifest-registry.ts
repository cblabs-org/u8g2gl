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
 *              element's `extends` chain — merging props and bindings by name,
 *              parent order first, a child's override keeping its parent's
 *              position — and diagnoses unknown `extends` targets and cycles.
 *
 * Exports:
 * - ManifestOrigin:          Where a manifest came from ('framework' | 'project')
 * - EffectiveManifest:       A manifest with its inherited props and bindings merged in
 * - ManifestRegistryInput:   Framework and project manifest lists
 * - ManifestRegistry:        Lookup by tag, declaration lists, and registry diagnostics
 * - buildManifestRegistry(): Build a registry from framework and project manifests
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { WidgetManifest } from '../schema/widget-manifest.js';
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
 * the same `name` as an inherited one replaces it **in the parent's position**.
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

// mergeByName
// Merges inherited declarations with an element's own, by `name`. Inherited
// order is kept; an own declaration either replaces its namesake in place or is
// appended.
//   inherited — the parent's effective list, already fully merged
//   own       — the element's own declarations, in declaration order
function mergeByName<T extends { readonly name: string }>(
  inherited: readonly T[],
  own: readonly T[],
): T[] {
  const merged = [...inherited];
  const indexByName = new Map<string, number>();
  merged.forEach((decl, index) => indexByName.set(decl.name, index));
  for (const decl of own) {
    const index = indexByName.get(decl.name);
    if (index === undefined) {
      indexByName.set(decl.name, merged.length);
      merged.push(decl);
    } else {
      merged[index] = decl;
    }
  }
  return merged;
}

// parentTagOf
// The tag a manifest inherits from, or undefined for a root.
//   manifest — a declared manifest
function parentTagOf(manifest: WidgetManifest): string | undefined {
  // The parser defaults a missing `extends` to 'u8g2gl_obj' (parse-widget-
  // manifest.ts), so u8g2gl_obj's own manifest arrives claiming to extend
  // itself. That is the root of the hierarchy, not a cycle; treating it as one
  // would put a cycle error on every project. The cost: an explicit
  // `extends` naming the element itself is indistinguishable and also reads
  // as a root.
  if (manifest.extends === undefined || manifest.extends === manifest.name) {
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
    const parentTag = parentTagOf(manifest);

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
        diagnostics.push(
          manifestDiagnostic(
            DIAGNOSTIC_CODES.UNKNOWN_WIDGET,
            `Manifest <${tag}> extends unknown element '${parentTag}'.`,
            manifest,
            parentTag,
            findClosest(parentTag, tags),
          ),
        );
      } else {
        parent = resolveTag(parentTag, path);
      }
    }

    const result: EffectiveManifest = {
      ...manifest,
      api: {
        ...manifest.api,
        props: mergeByName(parent?.api.props ?? [], manifest.api.props),
        bindings: mergeByName(parent?.api.bindings ?? [], manifest.api.bindings),
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
