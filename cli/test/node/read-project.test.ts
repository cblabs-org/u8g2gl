/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/read-project.test.ts
 * Purpose: Unit tests for project file discovery and loading.
 * Description: Verifies standard directory layout parsing (u8g2gl.xml, globals.xml,
 *              screens, components, and widgets) and error handling on missing files.
 */

import { resolve } from 'node:path';
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
    expect(projectFiles.componentXmls.length).toBeGreaterThanOrEqual(1);
    expect(projectFiles.componentXmls[0]?.filename).toBe(
      'components/status_bar/status_bar.xml',
    );
    expect(projectFiles.widgetManifestXmls.length).toBeGreaterThanOrEqual(1);
    expect(projectFiles.widgetManifestXmls[0]?.filename).toBe(
      'widgets/u8g2gl_label/u8g2gl_label.xml',
    );
  });

  it('builds a path-to-content map via getProjectFileMap', () => {
    const projectFiles = readProjectFiles(validProjectDir);
    const map = getProjectFileMap(projectFiles);

    expect(map.has('u8g2gl.xml')).toBe(true);
    expect(map.has('globals.xml')).toBe(true);
    expect(map.has('screens/screen_home.xml')).toBe(true);
    expect(map.has('components/status_bar/status_bar.xml')).toBe(true);
    expect(map.has('widgets/u8g2gl_label/u8g2gl_label.xml')).toBe(true);
  });

  it('throws descriptive error if u8g2gl.xml is missing', () => {
    expect(() => readProjectFiles(__dirname)).toThrow(
      "Project file 'u8g2gl.xml' not found in:",
    );
  });
});
