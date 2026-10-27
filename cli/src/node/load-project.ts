/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/load-project.ts
 * Purpose: The one way the CLI turns a path into a project model. `validate` and
 *          `generate` both start here, so they parse the same files under the
 *          same [U-1] missing-name policy (`'error'` — the build never invents
 *          identity) and build the same manifest registry. Extracted from the
 *          `validate` handler in PR-04 WO5b; before that, a second command could
 *          only have copied it.
 * Description: Reads a project directory (u8g2gl.xml, globals.xml, screens/,
 *              widgets/) or a single XML file dispatched by its root tag, parses
 *              every document, and builds the registry from the bundled framework
 *              manifests plus the project's. A single file that *is* a bundled
 *              framework manifest stands in for its bundled copy (WO5a, WO1 F5).
 *              The file map it returns holds every source text a diagnostic can
 *              point into — project files and the bundled framework manifests
 *              (WO1 F9) — so human output can always print the source line.
 *
 *              For a project directory it also reads the asset bytes every
 *              `<xbm>`, `<convert>` and `<bdf>` `src` names (`assets`) and finds the
 *              licence files beside each `<bdf>` (`bdfLicenceFiles`). Both are done
 *              here because `src/core/` may not touch the filesystem or list a
 *              directory. A `src` that resolves outside the project root, by path
 *              or through a symlink, is left absent rather than read
 *              ([D-11], §13.10); `compileProjectAssets()` reports the absence
 *              against the declaration.
 *
 * Exports:
 * - LoadProjectOptions:  Display label and an injectable framework bundle
 * - LoadedProject:       Project model, project root, source texts, asset bytes and licence files
 * - loadProject():       Load a directory or single file
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { CATALOGUE } from '../data/catalogue.js';
import { compareCodeUnits } from '../core/order.js';
import { FRAMEWORK_MANIFESTS } from '../data/manifests.js';
import {
  buildManifestRegistry,
  parseFrameworkManifests,
  FRAMEWORK_MANIFEST_PATH,
  type ManifestText,
} from '../core/manifest/index.js';
import {
  parseProjectFile,
  parseGlobalsFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../core/parser/index.js';
import type { ProjectModel } from '../core/generator/index.js';
import type { Diagnostic } from '../core/schema/diagnostic.js';
import type { U8g2glProject } from '../core/schema/project.js';
import type { Globals } from '../core/schema/globals.js';
import type { Screen } from '../core/schema/screen.js';
import type { WidgetManifest } from '../core/schema/widget-manifest.js';
import { readProjectFiles, getProjectFileMap } from './read-project.js';
import { isInsideProject } from './project-path.js';

/**
 * Options for {@link loadProject}.
 */
export interface LoadProjectOptions {
  /**
   * How a single file is named in diagnostics and the file map — the path as
   * the user typed it. Defaults to the path given. Ignored for a directory,
   * whose files are always named project-relative.
   */
  readonly label?: string;
  /**
   * The framework manifest texts to load. Defaults to the bundle shipped with
   * the CLI; tests inject a doctored bundle to put a diagnostic inside one.
   */
  readonly frameworkManifests?: readonly ManifestText[];
}

/**
 * A loaded project.
 */
export interface LoadedProject {
  /** The model `checkProject()` and `generate()` take. */
  readonly model: ProjectModel;
  /** Absolute project directory, or undefined when a single file was loaded. */
  readonly projectRoot: string | undefined;
  /**
   * Source text by the path diagnostics use: project files, and every bundled
   * framework manifest under `u8g2gl/manifests/<file>` (WO1 F9).
   */
  readonly fileContents: ReadonlyMap<string, string>;
  /**
   * Asset file **bytes** by the `src` path its declaration names (§14.1,
   * §14.2), for the emitters and `compileProjectAssets()`
   * to compile into generated code. Covers an `<xbm>`'s, a `<convert>`'s and a
   * `<bdf>`'s `src`.
   *
   * Read here because `src/core/` may not touch the filesystem
   * (typescript.md §1): emission is isomorphic and takes the bytes as a
   * parameter, which is also what lets the designer supply them from editor
   * buffers instead of from disk. An asset that could not be read is simply
   * absent, and `compileProjectAssets()` reports it
   * against its own declaration.
   */
  readonly assets: ReadonlyMap<string, Uint8Array>;
  /**
   * Licence-like files found beside each `<bdf>`'s own source file, keyed by
   * font `name`, sorted and project-relative (§14.1's provenance rule)
   * — a directory listing, which `src/core/` may not do
   * (typescript.md §1) and which emission therefore cannot discover itself.
   */
  readonly bdfLicenceFiles: ReadonlyMap<string, readonly string[]>;
}

// bundledFrameworkFilename
// The bundled framework manifest a single file *is*, by filename, or undefined.
// A file is the framework manifest when it sits at `<…>/u8g2gl/manifests/<file>`
// — the include path FRAMEWORK_MANIFEST_PATH names, where the manifests ship —
// and the bundle carries a manifest of that filename. The same file copied into
// a project's widgets/ is a project copy, and still shadows (PR-04 WO1 F5).
//   filePath — absolute path of the single file
//   bundle   — framework manifest texts in use
function bundledFrameworkFilename(filePath: string, bundle: readonly ManifestText[]): string | undefined {
  const segments = resolve(filePath).split(sep);
  const filename = segments[segments.length - 1] ?? '';
  if (segments.slice(-3, -1).join('/') !== FRAMEWORK_MANIFEST_PATH) {
    return undefined;
  }
  return bundle.some((m) => m.filename === filename) ? filename : undefined;
}

/**
 * @brief Loads a project directory or a single XML file into a project model.
 *
 * Every document is parsed under the default `'error'` missing-name policy: an
 * unnamed element is an error, and no name is synthesised. `validate
 * --fix-names` writes names to disk *before* calling this, so what is loaded is
 * always what is on disk.
 *
 * @param targetPath Absolute path to a project directory or an XML file.
 * @param options    Label for a single file, and the framework bundle.
 * @return The model, the project root (directories only) and every source text.
 * @throws Error if a directory has no u8g2gl.xml, or still has a `components/`
 *         directory — propagated from readProjectFiles for the caller to report.
 */
export function loadProject(targetPath: string, options?: LoadProjectOptions): LoadedProject {
  const bundle = options?.frameworkManifests ?? FRAMEWORK_MANIFESTS;
  const loadDiagnostics: Diagnostic[] = [];
  const fileContents = new Map<string, string>();

  // Not a version literal: an unparsed project has no schema to name, and
  // hardcoding one of our own only rots the next time the schema bumps
  // (PR-3R WO9 removed a stale '0.3' default for exactly this reason).
  let project: U8g2glProject = { schema: '', name: 'unnamed', version: '1.0.0', targets: [] };
  let globals: Globals = { consts: [], subjects: [], styles: [], fonts: [], images: [] };
  const screens: Screen[] = [];
  // [D-18]: one element vocabulary. Plain widgets and composites go into one
  // list and from there into one registry — never sorted into two buckets.
  const projectManifests: WidgetManifest[] = [];
  let frameworkStandIn: { readonly filename: string; readonly manifest: WidgetManifest } | undefined;
  let hasProjectManifest = false;
  let projectRoot: string | undefined;

  if (statSync(targetPath).isDirectory()) {
    // --- Step 1a: A directory — the standard project layout ---
    projectRoot = resolve(targetPath);
    const files = readProjectFiles(projectRoot);
    for (const [path, text] of getProjectFileMap(files)) {
      fileContents.set(path, text);
    }
    hasProjectManifest = true;
    // Files discovery passed over are warnings, merged with the parsers' own.
    loadDiagnostics.push(...files.skippedFiles);

    const projRes = parseProjectFile(files.projectXml, 'u8g2gl.xml');
    loadDiagnostics.push(...projRes.diagnostics);
    project = projRes.value ?? project;

    if (files.globalsXml) {
      const globRes = parseGlobalsFile(files.globalsXml, 'globals.xml');
      loadDiagnostics.push(...globRes.diagnostics);
      globals = globRes.value ?? globals;
    }

    for (const screen of files.screenXmls) {
      const scrRes = parseScreenFile(screen.content, screen.filename);
      loadDiagnostics.push(...scrRes.diagnostics);
      if (scrRes.value) {
        screens.push(scrRes.value);
      }
    }

    for (const widget of files.widgetManifestXmls) {
      const widRes = parseWidgetManifestFile(widget.content, widget.filename);
      loadDiagnostics.push(...widRes.diagnostics);
      if (widRes.value) {
        projectManifests.push(widRes.value);
      }
    }
  } else {
    // --- Step 1b: A single file, dispatched by its root tag ---
    const label = options?.label ?? targetPath;
    const xml = readFileSync(targetPath, 'utf-8');
    fileContents.set(label, xml);
    const rootTag = xml.match(/<([a-zA-Z0-9_]+)/)?.[1] ?? '';

    if (rootTag === 'u8g2gl') {
      hasProjectManifest = true;
      const res = parseProjectFile(xml, label);
      loadDiagnostics.push(...res.diagnostics);
      project = res.value ?? project;
    } else if (rootTag === 'globals') {
      const res = parseGlobalsFile(xml, label);
      loadDiagnostics.push(...res.diagnostics);
      globals = res.value ?? globals;
    } else if (rootTag === 'screen') {
      const res = parseScreenFile(xml, label);
      loadDiagnostics.push(...res.diagnostics);
      if (res.value) {
        screens.push(res.value);
      }
    } else if (rootTag === 'widget' || rootTag === 'component') {
      // A '<component>' root is a hard error, not a dead end: dispatching it
      // here (rather than silently matching nothing) lets
      // parseWidgetManifestFile raise its named [D-18] migration diagnostic
      // the same way the directory-mode path does.
      const res = parseWidgetManifestFile(xml, label);
      loadDiagnostics.push(...res.diagnostics);
      const frameworkFilename = bundledFrameworkFilename(targetPath, bundle);
      if (res.value && frameworkFilename !== undefined) {
        frameworkStandIn = { filename: frameworkFilename, manifest: res.value };
      } else if (res.value) {
        projectManifests.push(res.value);
      }
    }
  }

  // --- Step 2: Framework manifests — parsed, and their text kept for diagnostics ---
  // The framework manifests come from the bundle, not from include/: an
  // npm-installed CLI has no include/ to read ([D-17]). Their text joins the
  // file map so a diagnostic located in one prints its source line (WO1 F9);
  // a project file of the same path, were there one, keeps its own text.
  const framework = parseFrameworkManifests(bundle);
  loadDiagnostics.push(...framework.diagnostics);
  for (const text of bundle) {
    const path = `${FRAMEWORK_MANIFEST_PATH}/${text.filename}`;
    if (!fileContents.has(path)) {
      fileContents.set(path, text.xml);
    }
  }

  // --- Step 3: Build the registry — framework manifests plus the project's ---
  // A single file that is a bundled framework manifest takes its bundled copy's
  // place rather than joining the project list, where it would be reported as
  // shadowing itself (PR-04 WO1 F5). Standing in rather than being dropped
  // means the file's own content is what gets validated: a framework author
  // checking an edit sees that edit's diagnostics, located in the real file.
  const standInFile = frameworkStandIn && `${FRAMEWORK_MANIFEST_PATH}/${frameworkStandIn.filename}`;
  const frameworkManifests = framework.manifests.map((m) =>
    frameworkStandIn && m.loc?.file === standInFile ? frameworkStandIn.manifest : m,
  );
  const manifests = buildManifestRegistry({ framework: frameworkManifests, project: projectManifests });

  return {
    model: {
      project,
      globals,
      screens,
      manifests,
      catalogue: CATALOGUE,
      loadDiagnostics,
      hasProjectManifest,
    },
    projectRoot,
    fileContents,
    assets: readAssets(projectRoot, globals),
    bdfLicenceFiles: readBdfLicenceFiles(projectRoot, globals),
  };
}

// readAssets
// The bytes of every asset the document declares, keyed by the `src` path the
// declaration names (§14.1, §14.2): the `src` of every `<xbm>`, `<convert>`
// and `<bdf>`.
//
// A `src` that resolves outside the project directory is skipped rather than
// read. A skipped or unreadable asset is left absent, and
// `compileProjectAssets()` reports it with the declaration's own location —
// a missing file is the author's defect, not the loader's, so nothing is
// thrown here.
//   projectRoot — absolute project directory, or undefined for a single file
//   globals     — the parsed globals, for the declarations
function readAssets(projectRoot: string | undefined, globals: Globals): ReadonlyMap<string, Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  if (projectRoot === undefined) {
    return assets;
  }
  const sources: string[] = [];
  for (const image of globals.images ?? []) {
    if (image.src !== '') {
      sources.push(image.src);
    }
  }
  for (const font of globals.fonts ?? []) {
    if (font.kind === 'bdf' && font.src !== '') {
      sources.push(font.src);
    }
  }
  for (const src of sources) {
    if (assets.has(src)) {
      continue;
    }
    const absolute = resolve(projectRoot, src);
    if (!isInsideProject(projectRoot, absolute)) {
      continue;
    }
    try {
      assets.set(src, new Uint8Array(readFileSync(absolute)));
    } catch {
      // Absent: reported by compileProjectAssets(), against the declaration.
    }
  }
  return assets;
}

/**
 * Lower-case name prefixes taken as licence provenance regardless of the BDF's
 * own name (§14.1); a file matches when its lower-cased name starts with one.
 */
const GENERIC_LICENCE_PREFIXES = ['license', 'licence', 'copying'];

/**
 * The SIL Open Font Licence's usual file names (`OFL.txt`, `OFL-1.1.txt`,
 * `ofl_license`): `ofl` followed by the end of the name, or by `.`, `-` or `_`.
 * A bare `ofl` prefix would also take `oflow.txt`. The other prefixes stay
 * loose on purpose: `COPYING3`, `LICENSES.txt` and `LICENSE2` are real licence
 * file names that a boundary rule would reject.
 */
const OFL_LICENCE_NAME = /^ofl(?:$|[._-])/;

// bdfLicenceFilesFor
// The sorted, project-relative licence-like files found in one <bdf>'s own
// directory (§14.1): a file whose name starts, case-insensitively, with
// 'license', 'licence' or 'copying', or is an OFL name (see OFL_LICENCE_NAME),
// or is named '<bdf-stem>.license'/'<bdf-stem>.licence' with any extension. Convenience
// provenance, never a diagnostic (§14.1) — an unreadable directory or a src
// outside the project simply yields no licence files.
//   projectRoot — absolute project directory
//   font        — the <bdf> declaration
function bdfLicenceFilesFor(projectRoot: string, font: { readonly src: string }): readonly string[] {
  if (font.src === '') {
    return [];
  }
  const absoluteFont = resolve(projectRoot, font.src);
  if (!isInsideProject(projectRoot, absoluteFont)) {
    return [];
  }
  const dir = dirname(absoluteFont);
  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const stem = basename(font.src, extname(font.src)).toLowerCase();
  const matches = entries.filter((name) => {
    const lower = name.toLowerCase();
    if (GENERIC_LICENCE_PREFIXES.some((prefix) => lower.startsWith(prefix)) || OFL_LICENCE_NAME.test(lower)) {
      return true;
    }
    return lower === `${stem}.license` || lower === `${stem}.licence` ||
      lower.startsWith(`${stem}.license.`) || lower.startsWith(`${stem}.licence.`);
  });

  const dirRelative = dir === projectRoot ? '' : `${dir.slice(projectRoot.length + 1).split(sep).join('/')}/`;
  return matches.map((name) => `${dirRelative}${name}`).sort(compareCodeUnits);
}

// readBdfLicenceFiles
// Every <bdf> declaration's licence files, keyed by font name. A font with no
// match is simply absent (no line for it in the generated comment).
//   projectRoot — absolute project directory, or undefined for a single file
//   globals     — the parsed globals, for the declarations
function readBdfLicenceFiles(projectRoot: string | undefined, globals: Globals): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  if (projectRoot === undefined) {
    return result;
  }
  for (const font of globals.fonts ?? []) {
    if (font.kind !== 'bdf') {
      continue;
    }
    const files = bdfLicenceFilesFor(projectRoot, font);
    if (files.length > 0) {
      result.set(font.name, files);
    }
  }
  return result;
}
