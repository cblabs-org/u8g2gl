/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build/prepare-build.ts
 * Purpose: Everything a project editor Wasm build does before the compiler
 *          runs, which is also everything that can be tested without one:
 *          generate the project's firmware and editor targets into a build
 *          cache (never into the project, whose `generated/` belongs to the
 *          user's firmware build), collect the widget sources, apply the
 *          platform-header rule, and compute the build hash.
 * Description: The **build hash** is a SHA-256 over exactly what the build
 *              compiles from the project: every file in each widget's
 *              directory (sources, headers, manifest), the generated fonts and
 *              images units (which carry the font and image data), the
 *              generated configuration, and the editor registry. It therefore
 *              changes when a widget source, a manifest, a font, an image or a
 *              capacity changes, and does not when only a screen's layout or a
 *              subject's value does — those reach the canvas live, through the
 *              scene, with no rebuild. Generated files are written only when
 *              their content changes.
 *
 * Exports:
 * - PreparedBuild:      The generated tree, widget sources and build hash
 * - prepareBuild():     Generate, collect, check and hash
 * - projectCacheDir():  The build cache directory for a project
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { compileProjectAssets } from '../../../core/assets/index.js';
import { emitEditorFiles } from '../../../core/generator/emit/index.js';
import { generate } from '../../../core/generator/index.js';
import type { Diagnostic } from '../../../core/schema/diagnostic.js';
import { getGeneratorVersion } from '../../generator-version.js';
import { loadProject } from '../../load-project.js';
import { writeGenerated } from '../../write-generated.js';
import { checkPlatformHeaders } from './platform-headers.js';

/** A widget source file's extensions: compiled units, and headers. */
const UNIT_EXTENSIONS = ['.cpp', '.cc'];
const HEADER_EXTENSIONS = ['.h', '.hpp'];

/** The generated files a build compiles from, and so hashes. */
const HASHED_GENERATED = ['generated/u8g2gl_generated_config.h', 'generated/ui_fonts.cpp', 'generated/ui_images.cpp'];
const HASHED_EDITOR = ['generated_editor/ui_editor_registry.cpp'];

/** What prepareBuild() produced. */
export type PreparedBuild =
  | {
      readonly ok: true;
      /** The project's directory in the build cache. */
      readonly dir: string;
      /** The firmware target (`ui.hpp`, the config, fonts, images). */
      readonly generatedDir: string;
      /** The editor target (registry and scene). */
      readonly editorDir: string;
      /** Each widget's directory, for the include path. */
      readonly widgetDirs: readonly string[];
      /** Every widget unit to compile, absolute. */
      readonly widgetUnits: readonly string[];
      /** Every widget header, absolute: a change to one recompiles the project's units. */
      readonly widgetHeaders: readonly string[];
      /** SHA-256 hex of every input (see the file header). */
      readonly buildHash: string;
      /** Warnings from generation. */
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * @brief The build cache directory for one project.
 *
 * Keyed by the project's absolute path, so two projects never share generated
 * files, and one project always finds its own objects again.
 *
 * @param cacheRoot The editor build cache.
 * @param projectRoot The project directory.
 */
export function projectCacheDir(cacheRoot: string, projectRoot: string): string {
  const key = createHash('sha256').update(resolve(projectRoot)).digest('hex').slice(0, 16);
  return join(cacheRoot, 'projects', key);
}

/**
 * @brief Generates the project into its cache directory, checks its widgets
 *        and computes the build hash.
 *
 * @param projectRoot The project directory, containing u8g2gl.xml.
 * @param cacheRoot   The editor build cache.
 * @return The prepared build, or `ok: false` with the diagnostics that
 *         refused it: a project that does not generate, or a widget that
 *         includes a platform header.
 */
export async function prepareBuild(projectRoot: string, cacheRoot: string): Promise<PreparedBuild> {
  const dir = projectCacheDir(cacheRoot, projectRoot);
  const generatedDir = join(dir, 'generated');
  const editorDir = join(dir, 'generated_editor');

  // --- Step 1: Generate both targets into the cache, as `generate` would ---
  const loaded = loadProject(projectRoot);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const result = generate({
    ...loaded.model,
    generatorVersion: getGeneratorVersion(),
    compiledAssets,
    bdfLicenceFiles: loaded.bdfLicenceFiles,
  });
  if (
    result.errors > 0 ||
    result.realised === undefined ||
    result.resolved === undefined ||
    result.capacities === undefined ||
    result.target === undefined
  ) {
    return { ok: false, diagnostics: result.diagnostics };
  }
  writeGenerated(generatedDir, result);
  const editor = emitEditorFiles({
    project: loaded.model.project,
    globals: loaded.model.globals,
    screens: loaded.model.screens,
    realised: result.realised,
    resolved: result.resolved,
    manifests: loaded.model.manifests,
    capacities: result.capacities,
    images: compiledAssets.images,
    compiledFonts: compiledAssets.fonts,
    bdfLicenceFiles: loaded.bdfLicenceFiles,
    generatorVersion: getGeneratorVersion(),
    target: result.target,
  });
  writeGenerated(editorDir, { ...result, files: editor.files });

  // --- Step 2: The widgets' own files, and the platform-header rule ---
  const widgetDirs = listWidgetDirs(projectRoot);
  const widgetFiles = widgetDirs.flatMap((widgetDir) => listFiles(widgetDir));
  const sources = new Map<string, string>();
  for (const file of widgetFiles) {
    if ([...UNIT_EXTENSIONS, ...HEADER_EXTENSIONS].some((ext) => file.endsWith(ext))) {
      sources.set(projectRelative(projectRoot, file), readFileSync(file, 'utf8'));
    }
  }
  const platformErrors = checkPlatformHeaders(sources);
  if (platformErrors.length > 0) {
    return { ok: false, diagnostics: platformErrors };
  }

  // --- Step 3: The build hash, over every compiled input in a fixed order ---
  const hash = createHash('sha256');
  const hashed: Array<[string, string]> = [
    ...widgetFiles.map((file): [string, string] => [projectRelative(projectRoot, file), file]),
    ...HASHED_GENERATED.map((name): [string, string] => [name, join(dir, name)]),
    ...HASHED_EDITOR.map((name): [string, string] => [name, join(dir, name)]),
  ];
  for (const [label, file] of hashed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    // Length-prefixed, so no boundary between two files can be moved
    // without changing the hash.
    const bytes = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
    hash.update(`${label}\0${bytes.length}\0`).update(bytes);
  }

  return {
    ok: true,
    dir,
    generatedDir,
    editorDir,
    widgetDirs,
    widgetUnits: widgetFiles.filter((file) => UNIT_EXTENSIONS.some((ext) => file.endsWith(ext))),
    widgetHeaders: widgetFiles.filter((file) => HEADER_EXTENSIONS.some((ext) => file.endsWith(ext))),
    buildHash: hash.digest('hex'),
    diagnostics: result.diagnostics,
  };
}

// listWidgetDirs
// `widgets/<name>/` directories, sorted: the project layout loadProject reads
// manifests from.
function listWidgetDirs(projectRoot: string): string[] {
  const widgets = join(projectRoot, 'widgets');
  if (!existsSync(widgets)) {
    return [];
  }
  return readdirSync(widgets)
    .sort()
    .map((name) => join(widgets, name))
    .filter((path) => statSync(path).isDirectory());
}

// listFiles
// Every file beneath a directory, sorted, so the hash never depends on the
// order the filesystem lists them in.
function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

// projectRelative
// A project-relative, forward-slashed path, as diagnostics name files.
function projectRelative(projectRoot: string, file: string): string {
  return relative(projectRoot, file).split(sep).join('/');
}
