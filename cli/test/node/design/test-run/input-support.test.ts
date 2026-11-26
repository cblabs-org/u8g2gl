/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/input-support.test.ts
 * Purpose: Keeps the input fixture's committed harness units honest. The Wasm
 *          input parity test links test/input_menu/'s firmware with the
 *          test-run harness, and the two units a test run generates beside it
 *          — the screen table, with the project's callbacks, and the empty
 *          sample-set unit — are committed under support/ so CMake can build
 *          it. They must be exactly what the design server would generate for
 *          the fixture, or the parity test would prove a harness no test run
 *          builds.
 * Description: Regenerates both from the committed scene and compares.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSceneLayout, screenTableUnit } from '../../../../src/node/design/test-run/screen-table.js';
import { readSampleStage, sampleSetUnit } from '../../../../src/node/design/test-run/sample-set-unit.js';

const FIXTURE = resolve(__dirname, '../../../../../test/input_menu');
const scene = readFileSync(join(FIXTURE, 'generated_editor', 'ui_scene.json'), 'utf-8');

describe("the input fixture's harness units", () => {
  it('are the screen table, with each callback, a test run generates', () => {
    const layout = readSceneLayout(scene);
    expect(layout?.callbacks).toEqual(['on_wifi_changed', 'on_reset', 'on_factory_reset']);
    expect(readFileSync(join(FIXTURE, 'support', 'u8g2gl_harness_screens.cpp'), 'utf-8')).toBe(screenTableUnit(layout!));
  });

  it('are the sample-set unit a run with no sets generates', () => {
    const unit = sampleSetUnit([], readSampleStage(FIXTURE, scene));
    expect(unit.ok).toBe(true);
    expect(readFileSync(join(FIXTURE, 'support', 'u8g2gl_harness_samples.cpp'), 'utf-8')).toBe(unit.ok ? unit.source : '');
  });
});
