/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/read-project.ts
 * Purpose: Discovers and loads all XML source documents for a U8G2GL project
 *          from the local filesystem according to standard project layout conventions.
 * Description: Reads the project manifest (u8g2gl.xml), global symbol declarations (globals.xml),
 *              screen views (screens/screen_*.xml), and widget manifests
 *              (widgets/[name]/[name].xml) — both plain widgets and composites, since [D-18]
 *              leaves one element vocabulary and a composite is simply a widget manifest
 *              carrying a `<view>`. Throws a descriptive error if the root u8g2gl.xml is
 *              missing, and — PR-3R WO9 — throws the same kind of descriptive error if a
 *              `components/` directory exists at all: that layout was removed in schema 0.4
 *              ([D-18], design_spec §15.4), and a silently-ignored directory would leave a
 *              migrating author's composites simply missing with no explanation.
 *
 * Exports:
 * - ProjectFileEntry: Paired relative filename and XML content
 * - ProjectFiles: Structured collection of all project XML file contents
 * - readProjectFiles(dir): Reads and returns all project files from a directory
 * - getProjectFileMap(projectFiles): Maps relative filenames to file content for context lookup
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COMPONENT_REMOVED_MIGRATION } from '../core/parser/parse-widget-manifest.js';
import { compareCodeUnits } from '../core/order.js';

/**
 * An XML file loaded from a project directory, preserving its relative path.
 */
export interface ProjectFileEntry {
  /** Normalized forward-slash relative path (e.g. 'screens/screen_home.xml'). */
  readonly filename: string;
  /** Complete UTF-8 text content of the file. */
  readonly content: string;
}

/**
 * Complete set of XML files constituting a U8G2GL project.
 */
export interface ProjectFiles {
  /** u8g2gl.xml content from the project root. */
  readonly projectXml: string;
  /** globals.xml content from the project root. */
  readonly globalsXml: string;
  /** Discovered screen definition files (screens/screen_*.xml). */
  readonly screenXmls: readonly ProjectFileEntry[];
  /**
   * Discovered widget manifest files (widgets/[name]/[name].xml) — both plain
   * widgets and composites (a `<widget>` carrying a `<view>`, [D-18]).
   */
  readonly widgetManifestXmls: readonly ProjectFileEntry[];
}

/**
 * @brief Reads all XML project files from a directory according to project layout conventions.
 *
 * Discovers and reads:
 * - `u8g2gl.xml` at project root (throws if missing)
 * - `globals.xml` at project root (optional, defaults to empty string)
 * - `screens/screen_*.xml`
 * - `widgets/[name]/[name].xml` (or `widgets/*.xml`) — plain widgets and composites alike
 *
 * @param dir Path to the project root directory.
 * @return ProjectFiles structure containing loaded XML contents.
 * @throws Error if u8g2gl.xml is not found in dir.
 * @throws Error if a `components/` directory exists in dir (removed in schema
 *         0.4, [D-18]; PR-3R WO9) — named rather than silently ignored, per
 *         design_spec §15.4's diagnosability requirement.
 */
export function readProjectFiles(dir: string): ProjectFiles {
  const projectRoot = resolve(dir);

  // --- Step 1: Read mandatory u8g2gl.xml manifest ---
  const projectPath = join(projectRoot, 'u8g2gl.xml');
  if (!existsSync(projectPath)) {
    throw new Error(`Project file 'u8g2gl.xml' not found in: ${dir}`);
  }
  const projectXml = readFileSync(projectPath, 'utf-8');

  // --- Step 1b: A components/ directory is a removed layout, not silently
  // ignored (§15.4, [D-18], PR-3R WO9). Checked immediately after the
  // mandatory-file check above so a migrating author gets this before any
  // other discovery runs. ---
  const componentsDir = join(projectRoot, 'components');
  if (existsSync(componentsDir)) {
    throw new Error(
      `The 'components/' directory is removed: ${COMPONENT_REMOVED_MIGRATION}.`,
    );
  }

  // --- Step 2: Read optional globals.xml ---
  const globalsPath = join(projectRoot, 'globals.xml');
  let globalsXml = '';
  if (existsSync(globalsPath)) {
    globalsXml = readFileSync(globalsPath, 'utf-8');
  }

  // --- Step 3: Glob screens/screen_*.xml ---
  const screensDir = join(projectRoot, 'screens');
  const screenXmls: ProjectFileEntry[] = [];
  if (existsSync(screensDir)) {
    const entries = readdirSync(screensDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.xml') && entry.name.startsWith('screen_')) {
        const fullPath = join(screensDir, entry.name);
        screenXmls.push({
          filename: `screens/${entry.name}`,
          content: readFileSync(fullPath, 'utf-8'),
        });
      }
    }
    // By code unit, never by locale (§13.9, PR-04 WO12 follow-up). This order
    // reaches the emitted bytes: screens are emitted in the order they are
    // loaded, one `.cpp` each, and `ui.hpp` declares them in that order. ICU
    // collation weakens the underscore, so `screen_a_1.xml` collates *before*
    // `screen_a1.xml` and sorts *after* it by code unit — two ordinary lowercase
    // filenames, generating different bytes on two machines.
    screenXmls.sort((a, b) => compareCodeUnits(a.filename, b.filename));
  }

  // --- Step 4: Glob widgets/*/[name].xml (plain widgets and composites alike) ---
  const widgetsDir = join(projectRoot, 'widgets');
  const widgetManifestXmls: ProjectFileEntry[] = [];
  if (existsSync(widgetsDir)) {
    const entries = readdirSync(widgetsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = join(widgetsDir, entry.name);
        const subEntries = readdirSync(subDir, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (subEntry.isFile() && subEntry.name.endsWith('.xml')) {
            const fullPath = join(subDir, subEntry.name);
            widgetManifestXmls.push({
              filename: `widgets/${entry.name}/${subEntry.name}`,
              content: readFileSync(fullPath, 'utf-8'),
            });
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.xml')) {
        const fullPath = join(widgetsDir, entry.name);
        widgetManifestXmls.push({
          filename: `widgets/${entry.name}`,
          content: readFileSync(fullPath, 'utf-8'),
        });
      }
    }
    // Same rule, same reason: manifest order is registration order, and a
    // diagnostic about two manifests can name whichever was seen first.
    widgetManifestXmls.sort((a, b) => compareCodeUnits(a.filename, b.filename));
  }

  return {
    projectXml,
    globalsXml,
    screenXmls,
    widgetManifestXmls,
  };
}

/**
 * @brief Constructs a filename-to-content map from a ProjectFiles structure.
 *
 * Enables fast lookup of source code lines when formatting compiler diagnostics.
 *
 * @param projectFiles ProjectFiles returned by readProjectFiles.
 * @return Map keyed by relative file paths with XML file contents as values.
 */
export function getProjectFileMap(projectFiles: ProjectFiles): Map<string, string> {
  const map = new Map<string, string>();
  map.set('u8g2gl.xml', projectFiles.projectXml);
  if (projectFiles.globalsXml) {
    map.set('globals.xml', projectFiles.globalsXml);
  }
  for (const screen of projectFiles.screenXmls) {
    map.set(screen.filename, screen.content);
  }
  for (const widget of projectFiles.widgetManifestXmls) {
    map.set(widget.filename, widget.content);
  }
  return map;
}
