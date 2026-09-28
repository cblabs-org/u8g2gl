/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/fixtures/make-fixture-logo.ts
 * Purpose: Regenerates the committed `<convert>` source image of the compile
 *          fixture, `test/generated_fixture/assets/logo_mark.png`. The PNG is a
 *          build input the C++ suite compiles, so it must be reproducible, not a
 *          binary nobody can explain.
 * Description: Writes `fixtureLogoPng()` (test/helpers/fixture-logo.ts) to the
 *              fixture. `test/images/fixture-logo.test.ts` fails if the
 *              committed file differs from what this writes.
 *              Usage, from `cli/`:  npx tsx test/fixtures/make-fixture-logo.ts
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureLogoPng } from '../helpers/fixture-logo.js';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test/generated_fixture/assets/logo_mark.png');
writeFileSync(target, fixtureLogoPng());
console.log(`wrote ${target}`);
