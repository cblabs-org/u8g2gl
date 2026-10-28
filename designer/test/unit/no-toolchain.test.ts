/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/no-toolchain.test.ts
 * Purpose: The designer's "no toolchain" state is decided by the build
 *          record's failure code alone. The message is prose the server may
 *          reword; a designer that matched it would break silently when it did.
 * Description: Literal records, as `GET /api/build/<id>` serves them. The end
 *              to end no-toolchain test drives the real server's codes.
 */

import { expect, test } from '@playwright/test';
import { isNoToolchain, type BuildRecord } from '../../src/wasm/editor-wasm-controller';

const failed = (fields: Partial<BuildRecord>): BuildRecord => ({ id: '1', status: 'failed', ...fields });

test('a failure coded no-emscripten or no-source-tree is the no-toolchain state, whatever its message', () => {
  expect(isNoToolchain(failed({ code: 'no-emscripten', error: "no Emscripten 5.0.3: run 'u8g2gl toolchain install'" }))).toBe(true);
  expect(isNoToolchain(failed({ code: 'no-source-tree', error: 'reworded entirely' }))).toBe(true);
});

test('a failure without one of those codes is not, even when its message names a missing toolchain', () => {
  expect(isNoToolchain(failed({ error: "no Emscripten 5.0.3: run 'u8g2gl toolchain install'" }))).toBe(false);
  expect(isNoToolchain(failed({ error: 'no U8G2GL source tree beside this CLI' }))).toBe(false);
  expect(isNoToolchain(failed({ code: 'something-else', error: 'no Emscripten' }))).toBe(false);
});

test('a record that has not failed is never the no-toolchain state', () => {
  expect(isNoToolchain({ id: '1', status: 'succeeded', code: 'no-emscripten' })).toBe(false);
  expect(isNoToolchain({ id: '1', status: 'running' })).toBe(false);
});
