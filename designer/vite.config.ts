/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/vite.config.ts
 * Purpose: How the designer is built into `designer/dist/`, which
 *          `u8g2gl design` serves. Four choices here are load-bearing:
 *          the CLI's isomorphic `cli/src/core/` is consumed through an alias,
 *          as a library and never a copy, so the designer validates and
 *          renders with exactly the code `generate` uses; the bundle is built
 *          with a relative base, because the server mounts it under a
 *          token-carrying path it only knows at run time; and the framework
 *          editor Wasm is copied in, so a project with no toolchain still
 *          opens and renders its framework elements; and the end-to-end test
 *          hooks exist only in a separate test build, never in the one users
 *          are served.
 * Description: React through `@vitejs/plugin-react`. Monaco's editor worker is
 *              bundled by Vite's `?worker` import in `src/monaco/`, so nothing
 *              loads from a CDN. The framework editor Wasm is read from
 *              `U8G2GL_FRAMEWORK_WASM_DIR`, or `build-wasm/wasm/` at the
 *              repository root (where `wasm/CMakeLists.txt` builds it), and
 *              emitted as `framework-wasm/u8g2gl_editor.{js,wasm}`. Without it
 *              the build warns and the designer reports that it has no
 *              framework renderer.
 *
 *              Two builds, by Vite mode:
 *              - `vite build` (production): `__U8G2GL_TEST_HOOKS__` is `false`,
 *                so the test hooks and the keystroke probe are removed.
 *              - `vite build --mode e2e` (the end-to-end test build): it is
 *                `true`, and the build writes `E2E-TEST-BUILD` beside the page,
 *                so the tests can refuse to run against the wrong build.
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

/** The marker file the end-to-end test build writes beside its page. */
const E2E_MARKER = 'E2E-TEST-BUILD';

// e2eMarker
// Writes the test build's marker, which `e2e/support/design-session.ts` checks
// for, and whose absence marks a production build.
function e2eMarker(): Plugin {
  return {
    name: 'u8g2gl-e2e-marker',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: E2E_MARKER, source: 'The end-to-end test build: it carries test hooks. Never serve it to users.\n' });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative, so the bundle works under /app/<token>/ (see the file header).
  base: './',
  define: {
    __U8G2GL_TEST_HOOKS__: JSON.stringify(mode === 'e2e'),
  },
  plugins: [
    react(),
    frameworkWasm(resolve(process.env.U8G2GL_FRAMEWORK_WASM_DIR ?? join(here, '..', 'build-wasm', 'wasm'))),
    ...(mode === 'e2e' ? [e2eMarker()] : []),
  ],
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
}));
