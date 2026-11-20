/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/inject-assets.mjs
 * Purpose: The Wasm tests' side of what the designer does before every scene:
 *          hand the editor Wasm each font and image the project declares. An
 *          editor Wasm compiles in no project font or image (design_spec §9),
 *          so a test that draws a fixture's text must inject the fixture's
 *          fonts first, as the designer would.
 * Description: `projectAssets()` gathers the bytes the way the shipped tools
 *              do, through the built CLI (`cli/dist`): a `<builtin>` from the
 *              packaged `u8g2_fonts.c` by the design server's own parser, and
 *              every `<bdf>` and image through `compileProjectAssets()`, the
 *              step the designer runs in the browser. `injectAssets()` copies
 *              them into a started module through `injectFont()` and
 *              `injectImage()`. The CLI suite imports `injectAssets()` alone,
 *              which needs no built CLI.
 *
 * Exports:
 * - projectAssets():  A project's fonts and images, by name, as the designer injects them
 * - injectAssets():   Inject them into a started editor module
 */

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * @brief A project's declared fonts and images, as the designer injects them.
 *
 * @param {string} projectDir The project directory.
 * @returns {Promise<{ fonts: Map<string, Uint8Array>, images: Map<string, { width: number, height: number, bytes: Uint8Array }> }>}
 * @throws Error if the CLI is not built, or a declared asset cannot be produced.
 */
export async function projectAssets(projectDir) {
  // --- Step 1: The built CLI's own loaders, as the design server and designer use them ---
  const dist = (path) => import(pathToFileURL(join(repo, 'cli', 'dist', ...path.split('/'))).href);
  const [{ loadProject }, { compileProjectAssets }, { BuiltinFontSource }] = await Promise.all([
    dist('node/load-project.js'),
    dist('core/assets/index.js'),
    dist('node/design/builtin-fonts.js'),
  ]);

  // --- Step 2: Every declared font and image, by its name ---
  const loaded = loadProject(projectDir);
  const compiled = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const builtins = new BuiltinFontSource(repo);
  const fonts = new Map();
  for (const font of loaded.model.globals.fonts ?? []) {
    const bytes = font.kind === 'builtin' ? builtins.lookup(font.name) : compiled.fonts.get(font.name)?.bytes;
    if (bytes === undefined) throw new Error(`${projectDir}: font '${font.name}' could not be produced`);
    fonts.set(font.name, bytes);
  }
  const images = new Map();
  for (const [name, image] of compiled.images) {
    images.set(name, { width: image.width, height: image.height, bytes: Uint8Array.from(image.bytes) });
  }
  return { fonts, images };
}

/**
 * @brief Injects fonts and images into a started editor module.
 *
 * @param {object} module The Emscripten module (`createEditor()`'s `_module`).
 * @param {{ fonts?: Map<string, Uint8Array>, images?: Map<string, { width: number, height: number, bytes: Uint8Array }> }} assets
 * @throws Error naming the asset when the bridge refuses one, with its reason.
 */
export function injectAssets(module, { fonts = new Map(), images = new Map() }) {
  // withBytes
  // Copies bytes onto the Wasm heap for one call, then frees them: the bridge
  // keeps its own copy.
  const withBytes = (bytes, call) => {
    const pointer = module._malloc(Math.max(1, bytes.length));
    module.HEAPU8.set(bytes, pointer);
    try {
      return call(pointer);
    } finally {
      module._free(pointer);
    }
  };
  const lastError = () => module.UTF8ToString(module._getLastError());
  for (const [name, bytes] of fonts) {
    const ok = withBytes(bytes, (p) => module.ccall('injectFont', 'number', ['string', 'number', 'number'], [name, p, bytes.length]));
    if (ok !== 1) throw new Error(`injectFont('${name}') refused: ${lastError()}`);
  }
  for (const [name, { width, height, bytes }] of images) {
    const ok = withBytes(bytes, (p) =>
      module.ccall('injectImage', 'number', ['string', 'number', 'number', 'number', 'number'], [name, width, height, p, bytes.length]),
    );
    if (ok !== 1) throw new Error(`injectImage('${name}') refused: ${lastError()}`);
  }
}
