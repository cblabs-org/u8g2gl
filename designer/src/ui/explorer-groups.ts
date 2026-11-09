/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer-groups.ts
 * Purpose: Turns the design server's flat file listing into the Explorer's
 *          groups (ui_spec §6), grouped by what an author edits rather than by
 *          directory. A widget is one thing to an author — its manifest, its
 *          `.cpp` and its `.hpp` — so it is one entry, under its own name,
 *          which opens the manifest; its C++ travels with the entry instead of
 *          being listed beside it. Kept apart from the component so the rule
 *          is a pure function a unit test can call.
 * Description: Every listed path lands in exactly one entry of one group:
 *              Project, Screens, Widgets, Assets, and "Other files" for the
 *              rest, so nothing on disk goes missing from the tree. Screens and
 *              widget manifests are recognised by `classifyProjectFile()`, the
 *              same rule the pipeline loads documents by, so the Explorer never
 *              calls a file a screen that the project does not read as one.
 *
 * Exports:
 * - ExplorerEntry:   One row: a label, the path it opens, and the files behind it
 * - ExplorerGroup:   A heading and its entries
 * - groupFiles():    The listing, grouped
 */

import { classifyProjectFile } from '../project/project-model';

/** One Explorer row. */
export interface ExplorerEntry {
  /** What the row shows: a widget's name, otherwise the file's name. */
  readonly label: string;
  /** The project-relative path the row opens, and its `data-path`. */
  readonly path: string;
  /**
   * Every file the entry stands for, `path` first: for a widget, its manifest
   * and then its C++ sources in listing order; for anything else, `path` alone.
   */
  readonly files: readonly string[];
}

/** One Explorer group: a heading and its entries, in listing order. */
export interface ExplorerGroup {
  readonly title: 'Project' | 'Screens' | 'Widgets' | 'Assets' | 'Other files';
  readonly entries: readonly ExplorerEntry[];
}

/** A widget's C++ sources, which its entry carries rather than lists. */
const WIDGET_SOURCE_EXTENSIONS: readonly string[] = ['.cpp', '.cc', '.hpp', '.h'];

/**
 * The asset files a project declares in `globals.xml`: BDF fonts, and XBM and
 * PNG images (`<bdf>`, `<xbm>`, `<convert>`). Recognised by extension because
 * an asset's `src` may be anywhere in the project, not only under `fonts/`.
 */
const ASSET_EXTENSIONS: readonly string[] = ['.bdf', '.xbm', '.png'];

// extensionOf
// The lower-cased extension of a path's last segment, dot included, or ''.
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

// fileName
// A path's last segment.
function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

// directoryOf
// Everything before a path's last `/`, or '' at the project root.
function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

// single
// An entry that stands for one file, labelled by `label`.
function single(path: string, label: string): ExplorerEntry {
  return { label, path, files: [path] };
}

/**
 * @brief Groups a project listing for the Explorer.
 *
 * A widget manifest (`widgets/<name>/<name>.xml`, or `widgets/<name>.xml`)
 * becomes one Widgets entry labelled `<name>`. The C++ sources in a manifest's
 * directory join that entry's `files` and are not listed; a directory under
 * `widgets/` with no manifest has nothing to attach them to, so its files
 * fall to "Other files" rather than vanish.
 *
 * @param files The listing, sorted.
 * @return Project, Screens, Widgets, Assets and Other files, in that order,
 *         empty groups omitted. Each listed path appears in exactly one entry.
 */
export function groupFiles(files: readonly string[]): ExplorerGroup[] {
  // --- Step 1: Find the widget manifests, and the directories they own ---
  // A directory directly under widgets/ is owned by its manifests; the flat
  // `widgets/<file>.xml` form owns no directory, so it claims no C++.
  const manifests = files.filter((path) => classifyProjectFile(path) === 'widget');
  const manifestsByDirectory = new Map<string, string[]>();
  for (const manifest of manifests) {
    const directory = directoryOf(manifest);
    if (directory === 'widgets') continue;
    const owned = manifestsByDirectory.get(directory) ?? [];
    owned.push(manifest);
    manifestsByDirectory.set(directory, owned);
  }

  // --- Step 2: Attach each owned C++ source to its directory's manifest ---
  // With more than one manifest in a directory, the one named after the
  // directory owns the sources, as the conventional layout pairs them; failing
  // that, the first in listing order does, so a source is never dropped.
  const sourcesByManifest = new Map<string, string[]>();
  const attached = new Set<string>();
  for (const path of files) {
    if (!WIDGET_SOURCE_EXTENSIONS.includes(extensionOf(path))) continue;
    const directory = directoryOf(path);
    const owners = manifestsByDirectory.get(directory);
    if (owners === undefined || owners.length === 0) continue;
    const named = `${directory}/${fileName(directory)}.xml`;
    const owner = owners.includes(named) ? named : (owners[0] as string);
    const sources = sourcesByManifest.get(owner) ?? [];
    sources.push(path);
    sourcesByManifest.set(owner, sources);
    attached.add(path);
  }

  // --- Step 3: Place every remaining path in exactly one group ---
  const project: ExplorerEntry[] = [];
  const screens: ExplorerEntry[] = [];
  const widgets: ExplorerEntry[] = [];
  const assets: ExplorerEntry[] = [];
  const other: ExplorerEntry[] = [];
  for (const path of files) {
    if (attached.has(path)) continue;
    const kind = classifyProjectFile(path);
    if (kind === 'project' || kind === 'globals') {
      project.push(single(path, path));
    } else if (kind === 'screen') {
      screens.push(single(path, fileName(path)));
    } else if (kind === 'widget') {
      const name = fileName(path).slice(0, -'.xml'.length);
      widgets.push({ label: name, path, files: [path, ...(sourcesByManifest.get(path) ?? [])] });
    } else if (ASSET_EXTENSIONS.includes(extensionOf(path))) {
      assets.push(single(path, path));
    } else {
      other.push(single(path, path));
    }
  }

  const groups: ExplorerGroup[] = [
    { title: 'Project', entries: project },
    { title: 'Screens', entries: screens },
    { title: 'Widgets', entries: widgets },
    { title: 'Assets', entries: assets },
    { title: 'Other files', entries: other },
  ];
  return groups.filter((group) => group.entries.length > 0);
}
