/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/read-project.ts
 * Purpose: Discovers and loads all XML source documents for a U8G2GL project
 *          from the local filesystem according to standard project layout conventions.
 * Description: Reads the project manifest (u8g2gl.xml), global symbol declarations (globals.xml),
 *              screen views (screens/screen_*.xml), reusable components (components/[name]/[name].xml),
 *              and custom widget manifests (widgets/[name]/[name].xml). Throws a descriptive error
 *              if the root u8g2gl.xml is missing.
 *
 * Exports:
 * - ProjectFileEntry: Paired relative filename and XML content
 * - ProjectFiles: Structured collection of all project XML file contents
 * - readProjectFiles(dir): Reads and returns all project files from a directory
 * - getProjectFileMap(projectFiles): Maps relative filenames to file content for context lookup
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
  /** Discovered reusable component files (components/[name]/[name].xml). */
  readonly componentXmls: readonly ProjectFileEntry[];
  /** Discovered widget manifest files (widgets/[name]/[name].xml). */
  readonly widgetManifestXmls: readonly ProjectFileEntry[];
}

/**
 * @brief Reads all XML project files from a directory according to project layout conventions.
 *
 * Discovers and reads:
 * - `u8g2gl.xml` at project root (throws if missing)
 * - `globals.xml` at project root (optional, defaults to empty string)
 * - `screens/screen_*.xml`
 * - `components/[name]/[name].xml` (or `components/*.xml`)
 * - `widgets/[name]/[name].xml` (or `widgets/*.xml`)
 *
 * @param dir Path to the project root directory.
 * @return ProjectFiles structure containing loaded XML contents.
 * @throws Error if u8g2gl.xml is not found in dir.
 */
export function readProjectFiles(dir: string): ProjectFiles {
  const projectRoot = resolve(dir);

  // --- Step 1: Read mandatory u8g2gl.xml manifest ---
  const projectPath = join(projectRoot, 'u8g2gl.xml');
  if (!existsSync(projectPath)) {
    throw new Error(`Project file 'u8g2gl.xml' not found in: ${dir}`);
  }
  const projectXml = readFileSync(projectPath, 'utf-8');

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
    screenXmls.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  // --- Step 4: Glob components/*/[name].xml ---
  const componentsDir = join(projectRoot, 'components');
  const componentXmls: ProjectFileEntry[] = [];
  if (existsSync(componentsDir)) {
    const entries = readdirSync(componentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = join(componentsDir, entry.name);
        const subEntries = readdirSync(subDir, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (subEntry.isFile() && subEntry.name.endsWith('.xml')) {
            const fullPath = join(subDir, subEntry.name);
            componentXmls.push({
              filename: `components/${entry.name}/${subEntry.name}`,
              content: readFileSync(fullPath, 'utf-8'),
            });
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.xml')) {
        const fullPath = join(componentsDir, entry.name);
        componentXmls.push({
          filename: `components/${entry.name}`,
          content: readFileSync(fullPath, 'utf-8'),
        });
      }
    }
    componentXmls.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  // --- Step 5: Glob widgets/*/[name].xml ---
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
    widgetManifestXmls.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  return {
    projectXml,
    globalsXml,
    screenXmls,
    componentXmls,
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
  for (const component of projectFiles.componentXmls) {
    map.set(component.filename, component.content);
  }
  for (const widget of projectFiles.widgetManifestXmls) {
    map.set(widget.filename, widget.content);
  }
  return map;
}
