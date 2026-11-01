/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/parity-corpus.test.ts
 * Purpose: The parity corpus ([D-9]): for every fixture project and every
 *          screen, the firmware target's frames (the test-run harness) must
 *          equal the editor target's (the project editor Wasm) at every
 *          test-run time, pixel for pixel. The two targets share one runtime,
 *          so a difference is a framework bug in the generator, the editor
 *          registry, the bridge or the runtime, and is reported as one: this
 *          test is a finding when it fails, not a test to adjust.
 * Description: The editor side is driven as the designer's live canvas drives
 *              it: the project's scene applied, the screen selected, the
 *              subjects' declared values applied (the frame firmware draws
 *              at boot), then each time rendered in order from that one
 *              apply. The harness side boots fresh per screen. A fixture the
 *              generator refuses is listed with its refusal, and both builds
 *              must refuse it with that code: when the refusal goes, the test
 *              fails until the fixture's frames are compared.
 *
 *              Needs Emscripten 5.0.3. Without one every case is skipped with
 *              the same message as the other Emscripten tests, which CI's
 *              wasm-tests job treats as a failure.
 */

import { cpSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEditorWasm } from '../../../../src/node/design/build/editor-wasm-build.js';
import { loadProject } from '../../../../src/node/load-project.js';
import { differingPixels } from '../../../../src/node/design/test-run/bug-report.js';
import { loadHarness } from '../../../../src/node/design/test-run/harness-runner.js';
import { TEST_RUN_TIMES } from '../../../../src/node/design/test-run/test-run-job.js';
import { buildTestRunHarness } from '../../../../src/node/design/test-run/test-run-build.js';
import { detectToolchain, type SelectedToolchain } from '../../../../src/node/toolchain/detect-toolchain.js';
import { nodeToolchainHost } from '../../../../src/node/toolchain/toolchain-host.js';
import { toolchainCacheRoot } from '../../../../src/node/toolchain/toolchain-paths.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from '../build/departures-project.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';

const host = nodeToolchainHost();
// Detection only reads the real cache directory; nothing here writes it.
const toolchain: SelectedToolchain | undefined = (await detectToolchain(host, toolchainCacheRoot(host.platform, host.env, host.home)))
  .selected;
if (toolchain === undefined) {
  console.warn('parity-corpus.test.ts: skipped, no Emscripten 5.0.3 (run `u8g2gl toolchain install` or put em++ on PATH)');
}

const CLI_ROOT = resolve(__dirname, '../../../..');

/** One corpus project, and what both builds must do with it. */
interface CorpusProject {
  readonly name: string;
  readonly dir: string;
  /** Absent: both build, and every frame must match. Present: both must refuse with this code. */
  readonly refusedWith?: string;
}

const CORPUS: readonly CorpusProject[] = [
  { name: 'departures', dir: DEPARTURES_PROJECT },
  // generate refuses it: it uses <focus_ring>, which focus navigation (§12.2)
  // delivers. Its frames join the corpus when that refusal is lifted.
  { name: 'valid-project', dir: join(CLI_ROOT, 'test', 'integration', 'fixtures', 'valid-project'), refusedWith: 'U8G2GL_NOT_YET_SUPPORTED' },
  { name: 'emit-project', dir: join(CLI_ROOT, 'test', 'generator', 'fixtures', 'emit-project') },
  { name: 'generated_fixture', dir: join(FRAMEWORK_ROOT, 'test', 'generated_fixture') },
  // The widget probe project: the departures widgets as first written, at
  // schema 0.4, before their manifests carried palette metadata.
  {
    name: 'widget probe (schema 0.4)',
    dir: join(FRAMEWORK_ROOT, '.agents', 'skills', 'principal-architect-workspace', 'g-probe2-widgets', 'evidence', 'probe-project'),
  },
];

/** The editor API of wasm/u8g2gl_editor.mjs, as the corpus drives it. */
interface EditorApi {
  applyScene(json: string): boolean;
  applySampleData(json: string): boolean;
  renderFrame(ms: number): Uint8Array | null;
  getLastError(): string;
  _module: { ccall(name: string, returns: string, types: string[], args: unknown[]): number };
}

// loadEditor
// The project editor Wasm through the same wrapper the snapshot test uses.
async function loadEditor(wasmDir: string): Promise<EditorApi> {
  const module = (await import(pathToFileURL(join(FRAMEWORK_ROOT, 'wasm', 'u8g2gl_editor.mjs')).href)) as {
    createEditor(dir: string): Promise<EditorApi>;
  };
  return module.createEditor(wasmDir);
}

// declaredValues
// The subjects' declared values as the designer's live pipeline applies them
// (designer/src/pipeline/live-pipeline.ts): numbers for int and time,
// booleans for bool, text otherwise, undeclared values left out.
function declaredValues(projectRoot: string): string {
  const values: Record<string, string | number | boolean> = {};
  for (const subject of loadProject(projectRoot).model.globals.subjects ?? []) {
    const value = subject.default;
    if (value === undefined) continue;
    if (subject.type === 'int' || subject.type === 'time') {
      const number = Number(value);
      if (Number.isFinite(number)) values[subject.name] = number;
    } else if (subject.type === 'bool') {
      values[subject.name] = value === 'true';
    } else {
      values[subject.name] = value;
    }
  }
  return JSON.stringify(values);
}

describe.skipIf(toolchain === undefined)('the parity corpus: firmware frames equal live frames (needs Emscripten)', () => {
  let cache: string;
  beforeAll(() => {
    cache = makeTempDir('parity-cache');
  });
  afterAll(removeTempDirs);

  for (const fixture of CORPUS) {
    it(`${fixture.name}: every screen, every time`, async () => {
      // --- Step 1: Both targets, from one copy of the project ---
      const project = join(makeTempDir('parity-project'), 'project');
      cpSync(fixture.dir, project, { recursive: true });
      const common = { projectRoot: project, cacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT, toolchain: toolchain!, host };
      const harnessBuild = await buildTestRunHarness(common);
      const editorBuild = await buildEditorWasm({ ...common, optimisation: 'O1' });

      // --- Step 2: A refused fixture: both refuse, for the recorded reason ---
      if (fixture.refusedWith !== undefined) {
        expect(harnessBuild.status).toBe('failed');
        expect(editorBuild.status).toBe('failed');
        expect(harnessBuild.diagnostics.map((d) => d.code)).toContain(fixture.refusedWith);
        expect(editorBuild.diagnostics).toEqual(harnessBuild.diagnostics);
        console.log(`${fixture.name}: refused by generate (${fixture.refusedWith}) in both targets; no frames to compare`);
        return;
      }
      expect(harnessBuild.status, JSON.stringify(harnessBuild.diagnostics)).not.toBe('failed');
      expect(editorBuild.status, JSON.stringify(editorBuild.diagnostics)).not.toBe('failed');
      if (harnessBuild.status === 'failed' || editorBuild.status === 'failed') return;

      // --- Step 3: Every screen, every time, pixel for pixel ---
      const harness = await loadHarness(harnessBuild.harnessDir);
      const scene = readFileSync(editorBuild.sceneFile, 'utf8');
      const values = declaredValues(project);
      expect(harness.screens.length).toBeGreaterThan(0);
      const mismatches: string[] = [];
      let compared = 0;
      for (const screen of harness.screens) {
        const firmware = await harness.run(screen, TEST_RUN_TIMES);
        const editor = await loadEditor(editorBuild.wasmDir);
        expect(editor.applyScene(scene), editor.getLastError()).toBe(true);
        expect(editor._module.ccall('selectScreen', 'number', ['string'], [screen]), editor.getLastError()).toBe(1);
        expect(editor.applySampleData(values), editor.getLastError()).toBe(true);
        TEST_RUN_TIMES.forEach((time, i) => {
          const live = editor.renderFrame(time);
          const fw = firmware.frames[i];
          if (live === null || fw === undefined) {
            mismatches.push(`${screen} @ ${time} ms: no frame (${editor.getLastError()})`);
            return;
          }
          const differ = differingPixels(live, fw);
          compared++;
          if (differ !== 0 || live.length !== fw.length) {
            mismatches.push(`${screen} @ ${time} ms: ${differ} px differ`);
          }
        });
      }
      console.log(`${fixture.name}: ${harness.screens.length} screen(s), ${compared} frames compared, ${mismatches.length} differ`);
      expect(mismatches, 'a parity mismatch is a framework bug: diagnose and report it, do not adjust this test').toEqual([]);
    }, 300_000);
  }
});
