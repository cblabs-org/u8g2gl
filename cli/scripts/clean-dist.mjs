/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/clean-dist.mjs
 * Purpose: Remove the build output directory so `npm run build` starts empty.
 * Description: `tsc` writes files but never deletes them, so a file whose source
 *              was renamed or removed would linger in `dist/` and be shipped by
 *              `npm pack`. This is a Node script rather than `rm -rf` so
 *              contributors on Windows build the same way.
 *              Usage: node scripts/clean-dist.mjs [directory]  (default: dist)
 */

import { rmSync } from 'node:fs';

const target = process.argv[2] ?? 'dist';
rmSync(target, { recursive: true, force: true });
