/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/static-children-loaders.test.ts
 * Purpose: The CLI's two loaders parse a project's manifests before its
 *          screens, so a static child (`<column>`, design_spec §6.5) is known
 *          for what it is: `loadProject()` neither asks for its name nor treats
 *          it as an element, and `--fix-names` never writes one into it. A
 *          missed manifest would turn every column into an unnamed element.
 * Description: A copy of the departures fixture under the git-ignored `tmp/`,
 *              with one unnamed element added beside the columns, so the
 *              name `--fix-names` writes shows the columns were passed over
 *              rather than the whole file left alone.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkProject } from '../../src/core/generator/index.js';
import { staticChildrenOf, isElementNode, type WidgetNode } from '../../src/core/schema/widget-node.js';
import { fixMissingNames } from '../../src/node/fix-names.js';
import { loadProject } from '../../src/node/load-project.js';

const DEPARTURES = resolve(__dirname, '../fixtures/departures-project');
const SCREEN = 'screens/screen_departures.xml';
const dirs: string[] = [];

/** A fresh copy of the departures fixture. */
function copy(): string {
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/static-children-'));
  dirs.push(dir);
  cpSync(DEPARTURES, dir, { recursive: true });
  return dir;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('loadProject() and static children', () => {
  it('parses the columns as static children of their list, with no diagnostic', () => {
    const { model } = loadProject(DEPARTURES);
    expect([...model.loadDiagnostics, ...checkProject(model, 'error').diagnostics]).toEqual([]);
    const services = model.screens[0]!.view.children.find((node) => node.attributes.name === 'services') as WidgetNode;
    expect(services.children.filter(isElementNode)).toEqual([]);
    expect(staticChildrenOf(services).map((child) => child.attributes['width'])).toEqual(['32', '102', '16', '40']);
  });
});

describe('--fix-names and static children', () => {
  it('names an unnamed element and never a column', () => {
    const dir = copy();
    const path = join(dir, SCREEN);
    const before = readFileSync(path, 'utf-8');
    writeFileSync(path, before.replace('<u8g2gl_line name="header_sep"', '<u8g2gl_line'));
    expect(fixMissingNames(dir, dir)).toEqual([{ file: SCREEN, names: ['line_0'] }]);
    expect(readFileSync(path, 'utf-8')).not.toMatch(/<column name=/);
  });
});
