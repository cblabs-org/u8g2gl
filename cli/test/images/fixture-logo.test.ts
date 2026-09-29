/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/images/fixture-logo.test.ts
 * Purpose: Keeps the committed `<convert>` fixture image honest: the PNG in `test/generated_fixture/assets/` must be exactly
 *          what `test/fixtures/make-fixture-logo.ts` writes, byte for byte, so it
 *          can always be regenerated and never drifts into a binary nobody can
 *          explain.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureLogoPng } from '../helpers/fixture-logo.js';

const committed = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test/generated_fixture/assets/logo_mark.png');

describe('the committed <convert> fixture image', () => {
  it('is exactly what make-fixture-logo.ts writes, byte for byte', () => {
    expect(Buffer.compare(readFileSync(committed), fixtureLogoPng())).toBe(0);
  });

  it('is stable: two builds are identical', () => {
    expect(Buffer.compare(fixtureLogoPng(), fixtureLogoPng())).toBe(0);
  });
});
