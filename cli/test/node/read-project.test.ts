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
import { afterEach, describe, expect, it } from 'vitest';
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
    // the fixture's status_bar is a composite (a <widget> with a <view>). The
    // fixture no longer carries a copy of u8g2gl_label's manifest (PR-04 WO1):
    // framework manifests come from the CLI's bundle, never from widgets/.
    expect(projectFiles.widgetManifestXmls.length).toBeGreaterThanOrEqual(1);
    expect(
      projectFiles.widgetManifestXmls.some(
        (w) => w.filename === 'widgets/status_bar/status_bar.xml',
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
        '<u8g2gl schema="0.5" name="t" version="1.0.0"></u8g2gl>',
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

describe('readProjectFiles — files discovery passes over (design_spec §19)', () => {
  const dirs: string[] = [];

  /** Makes a project with the given extra files (path -> text); u8g2gl.xml is always present. */
  function project(files: Record<string, string>): string {
    mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
    const dir = mkdtempSync(resolve(__dirname, '../../tmp/skipped-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'u8g2gl.xml'), '<u8g2gl schema="0.5" name="t" version="1.0.0"></u8g2gl>');
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns for a screens/ file not named screen_*.xml, with the rename', () => {
    const files = readProjectFiles(project({ 'screens/home.xml': '<screen/>' }));

    expect(files.screenXmls).toEqual([]);
    expect(files.skippedFiles).toHaveLength(1);
    expect(files.skippedFiles[0]).toMatchObject({
      code: 'U8G2GL_SCREEN_FILE_SKIPPED',
      severity: 'warning',
      file: 'screens/home.xml',
      line: 1,
      column: 1,
      suggestions: ['screens/screen_home.xml'],
    });
    expect(files.skippedFiles[0]?.message).toContain('rename to screens/screen_home.xml');
  });

  it('suggests the lower-cased form for a case variant of a valid name', () => {
    const files = readProjectFiles(
      project({ 'screens/Screen_home.xml': '<screen/>', 'screens/screen_menu.XML': '<screen/>' }),
    );

    expect(files.screenXmls).toEqual([]);
    expect(files.skippedFiles.map((d) => [d.file, d.suggestions])).toEqual([
      ['screens/Screen_home.xml', ['screens/screen_home.xml']],
      ['screens/screen_menu.XML', ['screens/screen_menu.xml']],
    ]);
  });

  it('warns once for a subdirectory of screens/, naming it, and does not read inside', () => {
    const files = readProjectFiles(
      project({ 'screens/old/screen_a.xml': '<screen/>', 'screens/old/screen_b.xml': '<screen/>' }),
    );

    expect(files.screenXmls).toEqual([]);
    expect(files.skippedFiles).toHaveLength(1);
    expect(files.skippedFiles[0]).toMatchObject({ file: 'screens/old', severity: 'warning' });
    expect(files.skippedFiles[0]?.message).toContain('not searched recursively');
  });

  it('warns for a stray .xml at the project root, but not for u8g2gl.xml or globals.xml', () => {
    const files = readProjectFiles(project({ 'globals.xml': '<globals/>', 'home.xml': '<screen/>' }));

    expect(files.skippedFiles.map((d) => d.file)).toEqual(['home.xml']);
    expect(files.skippedFiles[0]?.suggestions).toEqual(['screens/screen_home.xml']);
  });

  it('does not warn for correctly named screens, non-XML files or widget manifests', () => {
    const files = readProjectFiles(
      project({
        'screens/screen_home.xml': '<screen/>',
        'screens/notes.txt': 'notes',
        'widgets/w/w.xml': '<widget/>',
      }),
    );

    expect(files.screenXmls.map((s) => s.filename)).toEqual(['screens/screen_home.xml']);
    expect(files.skippedFiles).toEqual([]);
  });

  it('orders warnings by code unit of path, not locale (§13.9)', () => {
    const files = readProjectFiles(
      project({ 'screens/beta.xml': '', 'screens/Zed.xml': '', 'screens/alpha.xml': '', 'zzz.xml': '', 'Aaa.xml': '' }),
    );

    expect(files.skippedFiles.map((d) => d.file)).toEqual([
      'Aaa.xml',
      'screens/Zed.xml',
      'screens/alpha.xml',
      'screens/beta.xml',
      'zzz.xml',
    ]);
  });
});
