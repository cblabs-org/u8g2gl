/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/vite.config.ts
 * Purpose: How the designer is built into `designer/dist/`, which
 *          `u8g2gl design` serves. Three choices here are load-bearing:
 *          the CLI's isomorphic `cli/src/core/` is consumed through an alias,
 *          as a library and never a copy, so the designer validates and
 *          renders with exactly the code `generate` uses; the bundle is built
 *          with a relative base, because the server mounts it under a
 *          token-carrying path it only knows at run time; and the framework
 *          editor Wasm is copied in, so a project with no toolchain still
 *          renders its framework elements (E1 acceptance e8).
 * Description: React through `@vitejs/plugin-react`. Monaco's editor worker is
 *              bundled by Vite's `?worker` import in `src/monaco/`, so nothing
 *              loads from a CDN. The framework editor Wasm is read from
 *              `U8G2GL_FRAMEWORK_WASM_DIR`, or `build-wasm/wasm/` at the
 *              repository root (where `wasm/CMakeLists.txt` builds it), and
 *              emitted as `framework-wasm/u8g2gl_editor.{js,wasm}`. Without it
 *              the build warns and the designer reports that it has no
 *              framework renderer.
 *
 * Exports:
 * - default: The Vite configuration
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

/** The Emscripten loader and module the framework editor Wasm consists of. */
const FRAMEWORK_WASM_FILES = ['u8g2gl_editor.js', 'u8g2gl_editor.wasm'] as const;

// frameworkWasm
// Emits the framework editor Wasm into the bundle as fixed-name assets. Fixed
// names, not hashed ones, because the application addresses them by a path
// it builds at run time, and Vite cannot see that reference to rewrite it.
//   dir — where wasm/CMakeLists.txt's build left u8g2gl_editor.js/.wasm
function frameworkWasm(dir: string): Plugin {
  return {
    name: 'u8g2gl-framework-wasm',
    apply: 'build',
    generateBundle() {
      const missing = FRAMEWORK_WASM_FILES.filter((file) => !existsSync(join(dir, file)));
      if (missing.length > 0) {
        this.warn(
          `no framework editor Wasm at ${dir} (missing ${missing.join(', ')}): ` +
            'the designer will render nothing without a project toolchain. Build it with ' +
            "'emcmake cmake -B build-wasm && cmake --build build-wasm --target u8g2gl_editor', " +
            'or set U8G2GL_FRAMEWORK_WASM_DIR.',
        );
        return;
      }
      for (const file of FRAMEWORK_WASM_FILES) {
        this.emitFile({ type: 'asset', fileName: `framework-wasm/${file}`, source: readFileSync(join(dir, file)) });
      }
    },
  };
}

export default defineConfig({
  // Relative, so the bundle works under /app/<token>/ (see the file header).
  base: './',
  plugins: [react(), frameworkWasm(resolve(process.env.U8G2GL_FRAMEWORK_WASM_DIR ?? join(here, '..', 'build-wasm', 'wasm')))],
  resolve: {
    alias: {
      '@u8g2gl/core': resolve(here, '..', 'cli', 'src', 'core'),
      '@u8g2gl/data': resolve(here, '..', 'cli', 'src', 'data'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Monaco alone is several megabytes; the warning would fire on every build
    // and say nothing about this application.
    chunkSizeWarningLimit: 8000,
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
});
