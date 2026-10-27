/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/project/project-model.ts
 * Purpose: Turns the project's source texts — open buffers where there are
 *          any, disk text otherwise — into the `ProjectModel` the CLI's
 *          validator and resolver take. It is the designer's counterpart of
 *          the CLI's `loadProject()`, which reads a directory with `node:fs`
 *          and so cannot run here; the parsing, the registry and the model are
 *          the CLI's own `core/` functions, so the designer and `generate`
 *          cannot disagree about what a document means.
 * Description: Files are classified by the project layout (design_spec §19):
 *              `u8g2gl.xml`, `globals.xml`, `screens/screen_*.xml`, and widget
 *              manifests under `widgets/`. Screens and manifests parse under
 *              the `'generate'` missing-name policy ([U-1]): the editor
 *              supplies a name the author has not written yet, the same name
 *              opening the file writes into its buffer, so a file that is not
 *              open and one that is describe the same elements.
 *
 *              The model is rebuilt on every pipeline run, so each document's
 *              parse is cached by its exact text: a keystroke re-parses only
 *              the document it changed, and the manifest registry is rebuilt
 *              only when a manifest's parse changed.
 *
 * Exports:
 * - ProjectFileKind:        How the project layout reads a file
 * - classifyProjectFile():  A path's kind, or undefined if no document reads it
 * - ProjectModelCache:      Text-keyed parses, and the model built from them
 *
 *     - build():            The model for a set of texts
 */

import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import { FRAMEWORK_MANIFESTS } from '@u8g2gl/data/manifests.js';
import type { ProjectModel } from '@u8g2gl/core/generator/check-project.js';
import { buildManifestRegistry, parseFrameworkManifests, type ManifestRegistry } from '@u8g2gl/core/manifest/index.js';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
  type ParseResult,
} from '@u8g2gl/core/parser/index.js';
import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import type { Globals } from '@u8g2gl/core/schema/globals.js';
import type { U8g2glProject } from '@u8g2gl/core/schema/project.js';
import type { Screen } from '@u8g2gl/core/schema/screen.js';
import type { WidgetManifest } from '@u8g2gl/core/schema/widget-manifest.js';

/** How the project layout reads a file. */
export type ProjectFileKind = 'project' | 'globals' | 'screen' | 'widget';

/** `screens/screen_*.xml`, exactly as the CLI's `read-project.ts` matches it. */
const SCREEN_PATH = /^screens\/screen_[^/]*\.xml$/;
/** A widget manifest: `widgets/<name>/<file>.xml`, or `widgets/<file>.xml`. */
const WIDGET_PATH = /^widgets\/(?:[^/]+\/)?[^/]+\.xml$/;

/**
 * @brief The kind of document a project path is, or undefined if the project
 *        layout reads no document from it (a `.cpp`, an asset, a stray file).
 */
export function classifyProjectFile(path: string): ProjectFileKind | undefined {
  if (path === 'u8g2gl.xml') return 'project';
  if (path === 'globals.xml') return 'globals';
  if (SCREEN_PATH.test(path)) return 'screen';
  if (WIDGET_PATH.test(path)) return 'widget';
  return undefined;
}

/** One cached parse: the text it was of, and the result. */
interface CachedParse<T> {
  readonly text: string;
  readonly result: ParseResult<T>;
}

/** The framework manifests never change during a session: parsed once. */
const FRAMEWORK = parseFrameworkManifests(FRAMEWORK_MANIFESTS);

/** The parses, keyed by path and text, and the model they last made. */
export class ProjectModelCache {
  private readonly parses = new Map<string, CachedParse<unknown>>();
  private registry: { readonly key: readonly WidgetManifest[]; readonly value: ManifestRegistry } | undefined;

  /**
   * @brief The project model for these texts.
   *
   * @param texts Every project document's current text by project-relative
   *              path; paths that are not documents are ignored.
   * @return The model, ready for `checkProject()` and the resolver.
   */
  build(texts: ReadonlyMap<string, string>): ProjectModel {
    // --- Step 1: Parse each document, reusing any parse of the same text ---
    const loadDiagnostics: Diagnostic[] = [...FRAMEWORK.diagnostics];
    let project: U8g2glProject = { schema: '', name: 'unnamed', version: '1.0.0', targets: [] };
    let globals: Globals = { consts: [], subjects: [], styles: [], fonts: [], images: [] };
    let hasProjectManifest = false;
    const screens: Screen[] = [];
    const manifests: WidgetManifest[] = [];
    // Sorted by code unit, as `read-project.ts` sorts: load order reaches the
    // scene, and a different order would render a different default screen.
    const paths = [...texts.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const seen = new Set<string>();
    for (const path of paths) {
      const kind = classifyProjectFile(path);
      const text = texts.get(path);
      if (kind === undefined || text === undefined) {
        continue;
      }
      seen.add(path);
      if (kind === 'project') {
        const result = this.parse(path, text, () => parseProjectFile(text, path));
        loadDiagnostics.push(...result.diagnostics);
        project = result.value ?? project;
        hasProjectManifest = true;
      } else if (kind === 'globals') {
        const result = this.parse(path, text, () => parseGlobalsFile(text, path));
        loadDiagnostics.push(...result.diagnostics);
        globals = result.value ?? globals;
      } else if (kind === 'screen') {
        const result = this.parse(path, text, () => parseScreenFile(text, path, { missingNamePolicy: 'generate' }));
        loadDiagnostics.push(...result.diagnostics);
        if (result.value !== undefined) screens.push(result.value);
      } else {
        const result = this.parse(path, text, () => parseWidgetManifestFile(text, path, { missingNamePolicy: 'generate' }));
        loadDiagnostics.push(...result.diagnostics);
        if (result.value !== undefined) manifests.push(result.value);
      }
    }
    for (const path of [...this.parses.keys()]) {
      if (!seen.has(path)) this.parses.delete(path);
    }

    // --- Step 2: The registry, rebuilt only when a manifest parse changed ---
    // Parses are cached objects, so an unchanged manifest is the same object
    // and identity comparison is enough to know nothing moved.
    const registry =
      this.registry !== undefined &&
      this.registry.key.length === manifests.length &&
      this.registry.key.every((manifest, i) => manifest === manifests[i])
        ? this.registry.value
        : buildManifestRegistry({ framework: FRAMEWORK.manifests, project: manifests });
    this.registry = { key: manifests, value: registry };

    return { project, globals, screens, manifests: registry, catalogue: CATALOGUE, loadDiagnostics, hasProjectManifest };
  }

  // parse
  // The cached parse of this exact text, or a fresh one cached in its place.
  //   path  — project-relative path, the cache key
  //   text  — the document's current text
  //   parse — the CLI parser for its kind
  private parse<T>(path: string, text: string, parse: () => ParseResult<T>): ParseResult<T> {
    const cached = this.parses.get(path) as CachedParse<T> | undefined;
    if (cached !== undefined && cached.text === text) {
      return cached.result;
    }
    const result = parse();
    this.parses.set(path, { text, result });
    return result;
  }
}
