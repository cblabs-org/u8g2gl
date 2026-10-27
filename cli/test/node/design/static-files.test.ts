/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/static-files.test.ts
 * Purpose: The file lookup behind the designer and editor Wasm routes, tested
 *          directly, because over HTTP the URL parser collapses a `..` before
 *          the server sees it and so never exercises the path rule itself.
 * Description: A temporary directory with files, a subdirectory, and symlinks
 *              pointing in and out; then every refusal and the media types.
 */

import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { locateDesignerDist, readStaticFile } from '../../../src/node/design/static-files.js';
import { makeTempDir, removeTempDirs, writeFiles } from './temp-project.js';

afterAll(removeTempDirs);

describe('readStaticFile()', () => {
  it('reads a file beneath the directory, typed by its extension', () => {
    const dir = makeTempDir('static');
    writeFiles(dir, { 'index.html': '<p>', 'assets/a.js': 'x', 'm.wasm': 'w', 'blob.bin': 'b' });
    expect(readStaticFile(dir, 'index.html')).toMatchObject({ contentType: 'text/html; charset=utf-8' });
    expect(new TextDecoder().decode(readStaticFile(dir, 'assets/a.js')?.bytes)).toBe('x');
    expect(readStaticFile(dir, 'm.wasm')?.contentType).toBe('application/wasm');
    expect(readStaticFile(dir, 'blob.bin')?.contentType).toBe('application/octet-stream');
  });

  it('refuses traversal, absolute paths, directories, missing files and symlinks out', () => {
    const outside = makeTempDir('static-outside');
    writeFiles(outside, { 'secret.txt': 'no' });
    const dir = makeTempDir('static');
    writeFiles(dir, { 'assets/a.js': 'x' });
    symlinkSync(join(outside, 'secret.txt'), join(dir, 'out.txt'));
    symlinkSync(join(dir, 'assets', 'a.js'), join(dir, 'in.js'));
    for (const path of ['../static-outside/secret.txt', 'assets/../../x', '/etc/hosts', 'assets', 'nope', '', 'out.txt', 'a\\b']) {
      expect(readStaticFile(dir, path), path).toBeUndefined();
    }
    expect(readStaticFile(dir, 'in.js')).toBeDefined();
  });
});

describe('locateDesignerDist()', () => {
  it('finds designer/dist only when its index page exists', () => {
    const root = makeTempDir('framework');
    expect(locateDesignerDist(root)).toBeUndefined();
    writeFiles(root, { 'designer/dist/index.html': '<p>' });
    expect(locateDesignerDist(root)).toBe(join(root, 'designer', 'dist'));
  });
});
