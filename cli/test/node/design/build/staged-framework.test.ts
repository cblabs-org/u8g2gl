/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/staged-framework.test.ts
 * Purpose: What the npm package carries of the framework is what a build
 *          reads: no source a build compiles is missing, and nothing a build
 *          never reads is carried. Two checks make that true rather than
 *          hoped: the staged copy's files are exactly the set the parser
 *          names when run over the copy itself, and every framework unit,
 *          for both the editor Wasm and the test-run harness, compiles and
 *          links from the copy alone.
 * Description: The framework is staged from this repository into cli/tmp/ by
 *              stageFramework(), as `npm pack` stages it. The compile half
 *              needs Emscripten 5.0.3 (on PATH, or the managed install) and is
 *              skipped with a message without one, as the other build tests
 *              are; it builds the departures project against the copy.
 */

import { cpSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEditorWasm } from '../../../../src/node/design/build/editor-wasm-build.js';
import { frameworkFiles, readFrameworkSources, stageFramework } from '../../../../src/node/design/build/framework-sources.js';
import { buildTestRunHarness } from '../../../../src/node/design/test-run/test-run-build.js';
import { detectToolchain, type SelectedToolchain } from '../../../../src/node/toolchain/detect-toolchain.js';
import { nodeToolchainHost } from '../../../../src/node/toolchain/toolchain-host.js';
import { toolchainCacheRoot } from '../../../../src/node/toolchain/toolchain-paths.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from './departures-project.js';

const host = nodeToolchainHost();
// Detection only reads the real cache directory; nothing here writes it.
const toolchain: SelectedToolchain | undefined = (await detectToolchain(host, toolchainCacheRoot(host.platform, host.env, host.home)))
  .selected;
if (toolchain === undefined) {
  console.warn('staged-framework.test.ts: skipped, no Emscripten 5.0.3 (run `u8g2gl toolchain install` or put em++ on PATH)');
}

// filesUnder
// Every file beneath a directory, relative to it, with `/` separators, sorted.
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

let staged: string;
let copied: string[];

beforeAll(() => {
  staged = join(makeTempDir('staged'), 'framework');
  copied = stageFramework(FRAMEWORK_ROOT, staged);
});
afterAll(removeTempDirs);

describe('the staged framework', () => {
  it("carries exactly the files the parser names over the copy, and U8G2's licence", () => {
    const named = frameworkFiles(readFrameworkSources(staged)).map((file) => relative(staged, file).split(sep).join('/'));
    const expected = [...named, 'extern/u8g2/LICENSE'].sort();
    expect(filesUnder(staged)).toEqual(expected);
    expect(copied).toEqual(expected);
  });

  it('names every source inside the copy, and each exists', () => {
    const sources = readFrameworkSources(staged);
    for (const file of [...sources.runtime, ...sources.display, ...sources.bridge, ...sources.harness, ...sources.u8g2]) {
      expect(relative(staged, file).startsWith('..'), file).toBe(false);
    }
    expect(copied).toEqual(expect.arrayContaining(['CMakeLists.txt', 'wasm/CMakeLists.txt', 'extern/u8g2/csrc/u8g2_fonts.c', 'src/u8g2gl_internal.h']));
  });

  it('carries no test, fixture or tool the builds do not read', () => {
    for (const file of copied) {
      expect(file, file).not.toMatch(/^(test\/(?!editor_host\/|real_u8g2\/)|cli\/|designer\/|docs\/|\.agents\/|wasm\/test\/)/);
      expect(file, file).not.toMatch(/\.(xml|mjs|md)$/);
    }
  });
});

describe.skipIf(toolchain === undefined)('a build from the staged framework alone (needs Emscripten)', () => {
  it('compiles and links every framework unit, for the editor Wasm and the test-run harness', async () => {
    const cache = makeTempDir('staged-cache');
    const project = join(makeTempDir('staged-departures'), 'project');
    cpSync(DEPARTURES_PROJECT, project, { recursive: true });

    const editor = await buildEditorWasm({ projectRoot: project, cacheRoot: cache, frameworkRoot: staged, toolchain: toolchain!, host, optimisation: 'O1' });
    expect(editor.status, JSON.stringify(editor.diagnostics)).toBe('built');
    if (editor.status === 'failed') return;
    const sources = readFrameworkSources(staged);
    const units = (files: readonly string[]): string[] => files.map((file) => file.split(sep).pop()!);
    expect(editor.compiled).toEqual(expect.arrayContaining(units([...sources.runtime, ...sources.display, ...sources.bridge, ...sources.u8g2])));

    const harness = await buildTestRunHarness({ projectRoot: project, cacheRoot: cache, frameworkRoot: staged, toolchain: toolchain!, host });
    expect(harness.status, JSON.stringify(harness.diagnostics)).toBe('built');
    if (harness.status === 'failed') return;
    expect(harness.compiled).toEqual(expect.arrayContaining(units(sources.harness)));
  }, 600_000);
});
