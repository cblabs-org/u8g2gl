/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/read-project.test.ts
 * Purpose: Unit tests for project file discovery and loading.
 * Description: Verifies standard directory layout parsing (u8g2gl.xml, globals.xml,
 *              screens, and widgets — composites included, per [D-18]) and error
 *              handling on a missing u8g2gl.xml or a leftover `components/`
 *              directory (removed in schema 0.4, PR-3R WO9).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProjectFiles, getProjectFileMap } from '../../src/node/read-project.js';

describe('readProjectFiles', () => {
  const validProjectDir = resolve(__dirname, '../integration/fixtures/valid-project');

  it('loads valid project files according to directory layout conventions', () => {
    const projectFiles = readProjectFiles(validProjectDir);

    expect(projectFiles.projectXml).toContain('<u8g2gl');
    expect(projectFiles.globalsXml).toContain('<globals>');
    expect(projectFiles.screenXmls.length).toBeGreaterThanOrEqual(1);
    expect(projectFiles.screenXmls[0]?.filename).toBe('screens/screen_home.xml');
    // Widget manifests include both plain widgets and composites ([D-18]) —
    // the fixture's status_bar is a composite (a <widget> with a <view>).
    expect(projectFiles.widgetManifestXmls.length).toBeGreaterThanOrEqual(2);
    expect(
      projectFiles.widgetManifestXmls.some(
        (w) => w.filename === 'widgets/status_bar/status_bar.xml',
      ),
    ).toBe(true);
    expect(
      projectFiles.widgetManifestXmls.some(
        (w) => w.filename === 'widgets/u8g2gl_label/u8g2gl_label.xml',
      ),
    ).toBe(true);
  });

  it('builds a path-to-content map via getProjectFileMap', () => {
    const projectFiles = readProjectFiles(validProjectDir);
    const map = getProjectFileMap(projectFiles);

    expect(map.has('u8g2gl.xml')).toBe(true);
    expect(map.has('globals.xml')).toBe(true);
    expect(map.has('screens/screen_home.xml')).toBe(true);
    expect(map.has('widgets/status_bar/status_bar.xml')).toBe(true);
    expect(map.has('widgets/u8g2gl_label/u8g2gl_label.xml')).toBe(true);
  });

  it('throws descriptive error if u8g2gl.xml is missing', () => {
    expect(() => readProjectFiles(__dirname)).toThrow(
      "Project file 'u8g2gl.xml' not found in:",
    );
  });

  it('throws a hard error naming the migration if a components/ directory exists (§15.4, [D-18], PR-3R WO9)', () => {
    // A silently-ignored components/ directory would leave a migrating
    // author's composites simply missing with no explanation — this is the
    // WORKORDER's core requirement, so the message must name the fix, not
    // just detect the condition.
    //
    // Build a throwaway directory layout with a components/ dir to exercise
    // the check without needing a checked-in fixture just for this.
    const tmpDir = mkdtempSync(join(tmpdir(), 'u8g2gl-wo9-'));
    try {
      writeFileSync(
        join(tmpDir, 'u8g2gl.xml'),
        '<u8g2gl schema="0.4" name="t" version="1.0.0"></u8g2gl>',
      );
      mkdirSync(join(tmpDir, 'components', 'badge'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'components', 'badge', 'badge.xml'),
        '<component name="badge"><api></api><view></view></component>',
      );

      expect(() => readProjectFiles(tmpDir)).toThrow(
        "The 'components/' directory is removed",
      );
      expect(() => readProjectFiles(tmpDir)).toThrow("'<widget>'");
      expect(() => readProjectFiles(tmpDir)).toThrow("'<view>'");
      expect(() => readProjectFiles(tmpDir)).toThrow(
        "'components/x/' to 'widgets/x/'",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
