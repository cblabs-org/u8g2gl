/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/build-flags.d.ts
 * Purpose: Declares the constants `vite.config.ts` defines at build time, so
 *          the code that branches on them is typed.
 *
 * Exports:
 * - __U8G2GL_TEST_HOOKS__:  True only in the end-to-end test build (`--mode e2e`)
 */

/**
 * True only in the end-to-end test build. A production build replaces it with
 * `false`, so everything behind it is removed from the bundle.
 */
declare const __U8G2GL_TEST_HOOKS__: boolean;
