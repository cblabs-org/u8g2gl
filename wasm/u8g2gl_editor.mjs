/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/u8g2gl_editor.mjs
 * Purpose: Thin Node.js wrapper around the Emscripten-generated Wasm module,
 *          exposing the editor bridge's C functions as a JS API with automatic
 *          string marshalling and buffer management.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Load and initialise the U8G2GL editor Wasm module.
 * @param {string} [wasmDir] Directory containing u8g2gl_editor.js/.wasm.
 *                           Defaults to the build-wasm/wasm/ output.
 * @returns {Promise<object>} The editor API.
 */
export async function createEditor(wasmDir) {
  const modulePath = wasmDir
    ? join(wasmDir, 'u8g2gl_editor.js')
    : join(__dirname, '..', 'build-wasm', 'wasm', 'u8g2gl_editor.js');

  const createModule = require(modulePath);
  const Module = await createModule();

  function callWithString(fnName, str) {
    const len = Module.lengthBytesUTF8(str) + 1;
    const ptr = Module._malloc(len);
    Module.stringToUTF8(str, ptr, len);
    try {
      return Module[fnName](ptr);
    } finally {
      Module._free(ptr);
    }
  }

  return {
    /**
     * Parse scene JSON and build the default screen.
     * @param {string} json Scene JSON string.
     * @returns {boolean} True on success.
     */
    applyScene(json) {
      return callWithString('_applyScene', json) === 1;
    },

    /**
     * Set subject values from a JSON object.
     * @param {string} json JSON object string like {"key": value, ...}.
     * @returns {boolean} True on success.
     */
    applySampleData(json) {
      return callWithString('_applySampleData', json) === 1;
    },

    /**
     * Tick objects and render to virtual display buffer.
     * @param {number} ms Current timestamp in milliseconds.
     * @returns {Uint8Array|null} Copy of the pixel buffer, or null on error.
     */
    renderFrame(ms) {
      const ptr = Module._renderFrame(ms >>> 0);
      if (!ptr) return null;
      const size = Module._getBufferSize();
      return new Uint8Array(Module.HEAPU8.buffer.slice(ptr, ptr + size));
    },

    /**
     * @returns {{width: number, height: number}} Display dimensions.
     */
    getDisplaySize() {
      return {
        width: Module._getDisplayWidth(),
        height: Module._getDisplayHeight(),
      };
    },

    /**
     * Get raw buffer pointer and size (for advanced use).
     */
    getBufferInfo() {
      return {
        ptr: Module._getBufferPtr(),
        size: Module._getBufferSize(),
      };
    },

    /**
     * Get the last error message from the bridge.
     * @returns {string}
     */
    getLastError() {
      return Module.UTF8ToString(Module._getLastError());
    },

    /**
     * The build hash a project editor Wasm was built with: a hash of every
     * input it compiled. The framework editor Wasm has none.
     * @returns {string|null}
     */
    getBuildHash() {
      return typeof Module._getBuildHash === 'function' ? Module.UTF8ToString(Module._getBuildHash()) : null;
    },

    /**
     * The active screen's elements drawn as placeholders, because the loaded
     * Wasm has no class for them.
     * @returns {{name: string, tag: string, class: string, rect: number[]}[]}
     */
    getPlaceholders() {
      return JSON.parse(Module.UTF8ToString(Module._getPlaceholders()));
    },

    /**
     * Destroy all objects and free resources.
     */
    teardown() {
      Module._teardown();
    },

    /** The raw Emscripten module, for testing. */
    _module: Module,
  };
}
