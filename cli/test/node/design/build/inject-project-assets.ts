/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/inject-project-assets.ts
 * Purpose: What the designer does before it applies a scene, for the tests
 *          that drive a real project editor Wasm: inject every font and image
 *          the project declares. The editor Wasm compiles in none
 *          (design_spec §9), so a test that compares its frames with the
 *          firmware's must hand it the same bytes the firmware links.
 * Description: A `<builtin>` from the source tree's `u8g2_fonts.c` through the
 *              design server's own parser; a `<bdf>` and each image through
 *              `compileProjectAssets()`, as the designer compiles them; then
 *              the Wasm tests' own `injectAssets()` copies them in.
 *
 * Exports:
 * - injectProjectAssets():  Inject a project's fonts and images into a started module
 */

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileProjectAssets } from '../../../../src/core/assets/index.js';
import { BuiltinFontSource } from '../../../../src/node/design/builtin-fonts.js';
import { loadProject } from '../../../../src/node/load-project.js';
import { FRAMEWORK_ROOT } from './departures-project.js';

/** wasm/test/inject-assets.mjs's injection, as far as these tests call it. */
type InjectAssets = (
  module: unknown,
  assets: {
    fonts: Map<string, Uint8Array>;
    images: Map<string, { width: number; height: number; bytes: Uint8Array }>;
  },
) => void;

/**
 * @brief Injects every font and image a project declares into a started editor module.
 *
 * @param module      The Emscripten module (`createEditor()`'s `_module`).
 * @param projectRoot The project directory.
 * @throws Error when a declared asset cannot be produced, or the bridge refuses one.
 */
export async function injectProjectAssets(module: unknown, projectRoot: string): Promise<void> {
  const { injectAssets } = (await import(pathToFileURL(join(FRAMEWORK_ROOT, 'wasm', 'test', 'inject-assets.mjs')).href)) as {
    injectAssets: InjectAssets;
  };
  const loaded = loadProject(projectRoot);
  const compiled = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const builtins = new BuiltinFontSource(FRAMEWORK_ROOT);
  const fonts = new Map<string, Uint8Array>();
  for (const font of loaded.model.globals.fonts ?? []) {
    const bytes = font.kind === 'builtin' ? builtins.lookup(font.name) : compiled.fonts.get(font.name)?.bytes;
    if (bytes === undefined) throw new Error(`${projectRoot}: font '${font.name}' could not be produced`);
    fonts.set(font.name, bytes);
  }
  const images = new Map<string, { width: number; height: number; bytes: Uint8Array }>();
  for (const [name, image] of compiled.images) {
    images.set(name, { width: image.width, height: image.height, bytes: Uint8Array.from(image.bytes) });
  }
  injectAssets(module, { fonts, images });
}
