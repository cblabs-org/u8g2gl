/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/stage-package.mjs
 * Purpose: Makes `npm pack` (and so `npm publish`) of the CLI carry everything
 *          a design session reads, built fresh from the commit being packed.
 *          An installed CLI has no U8G2GL source tree beside it, so the
 *          package stages two directories: `designer/`, the production
 *          designer with the framework editor Wasm it bundles, and
 *          `framework/`, the sources a project's Wasm builds compile, named by
 *          the same parser the builds use (framework-sources.ts). Nothing is
 *          reused from an earlier build, so nothing stale can be packed.
 * Description: Run as `prepack`, it refuses unless the tree is clean at HEAD
 *              and the Emscripten on PATH is the pinned version, then:
 *              1. builds the framework editor Wasm into a fresh build directory;
 *              2. builds the designer (production) against it;
 *              3. builds the CLI;
 *              4. stages `designer/` and `framework/`, each stamped with the
 *                 CLI version and the commit (package-copy.ts), and copies in
 *                 the repository's `THIRD-PARTY-NOTICES.md`, which covers
 *                 what they carry.
 *              Run as `postpack` with `--clean`, it removes what it staged,
 *              all of which is git-ignored. Progress and the builds'
 *              output go to stderr, so `npm pack --json` stays parseable.
 *              Usage: node scripts/stage-package.mjs [--clean]
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(CLI_ROOT, '..');
const DESIGNER_ROOT = join(REPO_ROOT, 'designer');
/** Where the framework editor Wasm is built; removed first, so it is never reused. */
const WASM_BUILD = join(REPO_ROOT, 'build', 'package-wasm');
/** What is staged, inside the CLI package: all of it git-ignored, all of it removed at postpack. */
const STAGED = {
  designer: join(CLI_ROOT, 'designer'),
  framework: join(CLI_ROOT, 'framework'),
  notices: join(CLI_ROOT, 'THIRD-PARTY-NOTICES.md'),
};

// log
// A progress line, on stderr (see the header).
function log(message) {
  process.stderr.write(`stage-package: ${message}\n`);
}

// refuse
// Stops the pack with what to do. Exit 1 makes npm abandon it.
function refuse(message) {
  process.stderr.write(`stage-package: refusing to pack: ${message}\n`);
  process.exit(1);
}

// run
// Runs a command to completion, its output on stderr; refuses if it fails.
//   command, args — what to run
//   options       — cwd and env for spawnSync
function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: ['ignore', 2, 2],
    // npm and the Emscripten wrappers are .cmd scripts on Windows.
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error !== undefined || result.status !== 0) {
    refuse(`'${command} ${args.join(' ')}' failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
}

// capture
// A command's stdout, or undefined if it cannot be run or fails.
function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: REPO_ROOT, shell: process.platform === 'win32' });
  return result.error === undefined && result.status === 0 ? result.stdout : undefined;
}

// removeStaged
// Removes everything staged, if present.
function removeStaged() {
  for (const path of Object.values(STAGED)) {
    rmSync(path, { recursive: true, force: true });
  }
}

// pinnedEmscripten
// The pinned Emscripten version, read from the module the toolchain code
// checks against, so the pin lives in one place. The CLI is not built yet
// when this runs, so the source is read rather than imported.
function pinnedEmscripten() {
  const source = readFileSync(join(CLI_ROOT, 'src', 'node', 'toolchain', 'toolchain-paths.ts'), 'utf8');
  const match = /export const EMSCRIPTEN_VERSION = '([^']+)'/.exec(source);
  if (match === null) {
    refuse('cannot find EMSCRIPTEN_VERSION in src/node/toolchain/toolchain-paths.ts');
  }
  return match[1];
}

// checkPreconditions
// The tree must be clean at HEAD, so the stamp's commit is the whole truth
// about what was packed; and Emscripten must be the pinned version, so the
// bundled framework editor Wasm is the one CI builds. Returns the commit.
function checkPreconditions() {
  // --- Step 1: A clean tree at HEAD ---
  const status = capture('git', ['status', '--porcelain']);
  if (status === undefined) {
    refuse('git is not available, or this is not a git checkout');
  }
  if (status.trim() !== '') {
    refuse(`the working tree is not clean (commit or stash first):\n${status.trimEnd()}`);
  }
  const commit = capture('git', ['rev-parse', 'HEAD'])?.trim();
  if (commit === undefined || commit === '') {
    refuse('cannot read the HEAD commit');
  }
  if (!existsSync(join(REPO_ROOT, 'extern', 'u8g2', 'csrc', 'u8g2.h'))) {
    refuse("the U8G2 submodule is not checked out: 'git submodule update --init --checkout extern/u8g2'");
  }

  // --- Step 2: The pinned Emscripten, on PATH ---
  const pinned = pinnedEmscripten();
  const version = capture('emcc', ['--version']);
  if (version === undefined) {
    refuse(`no emcc on PATH: activate Emscripten ${pinned} (emsdk_env) first`);
  }
  const found = /\b(\d+\.\d+\.\d+)\b/.exec(version.split('\n')[0] ?? '')?.[1];
  if (found !== pinned) {
    refuse(`emcc on PATH is ${found ?? 'an unknown version'}, not the pinned ${pinned}`);
  }

  // --- Step 3: The designer's dependencies, which the build needs ---
  if (!existsSync(join(DESIGNER_ROOT, 'node_modules'))) {
    refuse("the designer's dependencies are not installed: 'npm ci' in designer/");
  }
  return commit;
}

// build
// Steps 1 to 3 of the header, in that order: the designer bundles the
// framework editor Wasm, and the CLI is built last so its dist/ is the one
// staged beside them.
function build() {
  // --- Step 1: The framework editor Wasm, from an empty build directory ---
  rmSync(WASM_BUILD, { recursive: true, force: true });
  run('emcmake', ['cmake', '-S', REPO_ROOT, '-B', WASM_BUILD, '-DCMAKE_BUILD_TYPE=Release']);
  run('cmake', ['--build', WASM_BUILD, `-j${availableParallelism()}`, '--target', 'u8g2gl_editor']);

  // --- Step 2: The designer (production), bundling that Wasm ---
  const wasmDir = join(WASM_BUILD, 'wasm');
  run('npm', ['run', 'build'], { cwd: DESIGNER_ROOT, env: { ...process.env, U8G2GL_FRAMEWORK_WASM_DIR: wasmDir } });
  const dist = join(DESIGNER_ROOT, 'dist');
  // The designer's build only warns when the Wasm is missing; a package
  // without it would open projects that render nothing, so here it is fatal.
  for (const file of ['index.html', 'framework-wasm/u8g2gl_editor.js', 'framework-wasm/u8g2gl_editor.wasm']) {
    if (!existsSync(join(dist, file))) {
      refuse(`the designer build has no ${file}`);
    }
  }
  if (existsSync(join(dist, 'E2E-TEST-BUILD'))) {
    refuse('designer/dist/ is the end-to-end test build, not the production one');
  }

  // --- Step 3: The CLI ---
  run('npm', ['run', 'build'], { cwd: CLI_ROOT });
  return dist;
}

// stage
// Step 4 of the header: copy and stamp. The framework's file set comes from
// the CLI just built, so it is the parser the packed CLI will run.
//   designerDist — the designer build to copy
//   commit       — HEAD, for the stamps
async function stage(designerDist, commit) {
  const { stageFramework } = await import(pathToFileURL(join(CLI_ROOT, 'dist', 'node', 'design', 'build', 'framework-sources.js')).href);
  const { writePackageStamp } = await import(pathToFileURL(join(CLI_ROOT, 'dist', 'node', 'design', 'package-copy.js')).href);
  const { version } = JSON.parse(readFileSync(join(CLI_ROOT, 'package.json'), 'utf8'));
  const stamp = { version, commit };

  cpSync(designerDist, STAGED.designer, { recursive: true });
  writePackageStamp(STAGED.designer, stamp);
  const files = stageFramework(REPO_ROOT, STAGED.framework);
  writePackageStamp(STAGED.framework, stamp);
  // npm packs files from the package directory only, so the repository's
  // notices are copied in, as cli/LICENSE is a copy of the repository's.
  copyFileSync(join(REPO_ROOT, 'THIRD-PARTY-NOTICES.md'), STAGED.notices);
  log(`staged designer/ and framework/ (${files.length} files) for ${version} at ${commit}`);
}

// main
// --clean for postpack; otherwise check, build and stage. What was staged
// is removed first in both, so a pack that failed halfway
// leaves nothing a later pack could carry.
async function main() {
  removeStaged();
  if (process.argv.includes('--clean')) {
    return;
  }
  const commit = checkPreconditions();
  const designerDist = build();
  await stage(designerDist, commit);

  // The builds write only git-ignored output; a tree that is no longer clean
  // means one wrote somewhere it should not, and the stamp would be false.
  if ((capture('git', ['status', '--porcelain']) ?? '').trim() !== '') {
    removeStaged();
    refuse('the build changed tracked or unignored files; the staged copy would not match its commit');
  }
}

await main();
