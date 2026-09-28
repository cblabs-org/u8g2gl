#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/build-bdfconv.ts
 * Purpose: Regenerates the committed bdfconv Wasm artefact (§14, PR-04b WO1) so `<bdf>`
 *          fonts can eventually compile identically in the CLI (Node) and the designer
 *          (browser) with no Emscripten dependency at install or test time — the same
 *          "measure once, commit the artefact, verify the recorded hashes" pattern
 *          build-catalogue.ts uses for the display catalogue (Q-11).
 * Description: Builds U8G2's bdfconv sources from the pinned submodule (or a
 *              `--u8g2-path`) with Emscripten, found via `--emsdk`/`EMSDK`/`PATH` and
 *              refused unless it reports exactly the pinned version — a silent version
 *              drift here would make the committed artefact's provenance a lie. Writes
 *              the glue source and the raw Wasm bytes into src/data/bdfconv/ as two JSON
 *              modules (so tsc's `resolveJsonModule` copies them into dist/ the same way
 *              it already does for catalogue.json), and records U8G2's commit, Emscripten's
 *              version and commit, the exact flags used and the sha256 of every committed
 *              file into bdfconv-source.json.
 *
 * Usage:
 *   npm run build:bdfconv
 *   npx tsx src/node/build-bdfconv.ts --u8g2-path /path/to/U8g2 --emsdk /path/to/emsdk
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readU8g2Source } from './catalogue-builder.js';

/**
 * Emscripten version bdfconv is built with. Measured 2026-09-28 (PROJECT.md Finding 3):
 * this version, installed read-only at the pinned emsdk location, produces a Wasm module
 * whose output is byte-identical to native bdfconv. Any other version refuses to build
 * rather than silently shipping an artefact nobody measured.
 */
const PINNED_EMSCRIPTEN_VERSION = '5.0.3';

/**
 * Recorded emcc flags (WORKORDER "What is already measured", plus two additions made and
 * justified during WO1 — see the Completion Report's Decisions Made):
 * - `-sALLOW_MEMORY_GROWTH=1`: the default heap OOMs converting U8G2's largest bundled
 *   BDF (unifont_jp.bdf, 9.4 MB) with no `-m` restriction; growth fixes it.
 * - `-ffile-prefix-map` (appended in code, since its value is this machine's absolute
 *   source path): without it, the compiler embeds that absolute path as debug-info
 *   strings in the .wasm, which would make two checkouts at different paths produce
 *   different bytes from identical source — measured and confirmed during WO1.
 */
const EMCC_BASE_FLAGS = [
  '-O2',
  '-w',
  '-sMODULARIZE',
  '-sEXPORT_ES6',
  '-sENVIRONMENT=web',
  '-sEXIT_RUNTIME=1',
  '-sINVOKE_RUN=0',
  '-sEXPORTED_RUNTIME_METHODS=FS,callMain',
  '-sALLOW_MEMORY_GROWTH=1',
] as const;

/** Placeholder recorded in bdfconv-source.json in place of the real, machine-specific path. */
const FILE_PREFIX_MAP_PLACEHOLDER = '<bdfconv-source-dir>';

/**
 * @brief Resolves a path string, expanding `~` to the user's home directory.
 * @param inputPath Raw path input from command line or environment.
 * @return Fully resolved absolute filesystem path.
 */
function expandHome(inputPath: string): string {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return resolve(homedir(), inputPath.slice(inputPath === '~' ? 1 : 2));
  }
  return resolve(inputPath);
}

/**
 * @brief Locates the `emcc` binary from `--emsdk`, `EMSDK`, or `PATH`, in that order.
 *
 * @param explicitEmsdk `--emsdk` value, if given.
 * @return Absolute path to `emcc` if resolved via an emsdk root, or the bare name `emcc`
 *         to be resolved via `PATH` by the child process launcher.
 */
function resolveEmccPath(explicitEmsdk: string | undefined): string {
  const emsdkRoot = explicitEmsdk ?? process.env['EMSDK'];
  if (emsdkRoot) {
    const candidate = resolve(expandHome(emsdkRoot), 'upstream', 'emscripten', 'emcc');
    if (!existsSync(candidate)) {
      throw new Error(`emcc not found under --emsdk/EMSDK: ${candidate}`);
    }
    return candidate;
  }
  return 'emcc';
}

/** One resolved emcc toolchain's identity, as reported by `emcc --version`. */
interface EmccIdentity {
  readonly version: string;
  readonly commit: string;
}

/**
 * @brief Reads and parses `emcc --version`'s first line for the version and commit.
 * @param emccPath Path or bare name resolved by resolveEmccPath().
 * @return The reported version (e.g. "5.0.3") and commit hash.
 */
function readEmccIdentity(emccPath: string): EmccIdentity {
  const output = execFileSync(emccPath, ['--version'], { encoding: 'utf8' });
  const match = /(\d+\.\d+\.\d+)\s*\(([0-9a-f]+)\)/.exec(output);
  if (!match) {
    throw new Error(`Could not parse "emcc --version" output:\n${output}`);
  }
  const version = match[1];
  const commit = match[2];
  if (version === undefined || commit === undefined) {
    throw new Error(`Could not parse "emcc --version" output:\n${output}`);
  }
  return { version, commit };
}

/**
 * @brief Computes a file's or buffer's sha256, hex-encoded.
 * @param data Bytes or UTF-8 text to hash.
 * @return Lowercase hex digest.
 */
function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * @brief Main execution function for the build-bdfconv CLI script.
 */
function main(): void {
  // --- Step 1: Parse arguments ---
  const args = process.argv.slice(2);
  let u8g2Path: string | undefined;
  let emsdkArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--u8g2-path' && i + 1 < args.length) {
      u8g2Path = args[++i];
    } else if (arg?.startsWith('--u8g2-path=')) {
      u8g2Path = arg.slice('--u8g2-path='.length);
    } else if (arg === '--emsdk' && i + 1 < args.length) {
      emsdkArg = args[++i];
    } else if (arg?.startsWith('--emsdk=')) {
      emsdkArg = arg.slice('--emsdk='.length);
    }
  }

  // --- Step 2: Resolve paths. The script lives in cli/src/node (or cli/dist/node), so
  //     the repository root is three levels up (same layout as build-catalogue.ts). ---
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..', '..', '..');
  const submodulePath = resolve(repoRoot, 'extern', 'u8g2');
  const resolvedU8g2Path = expandHome(u8g2Path ?? process.env['U8G2_PATH'] ?? submodulePath);
  const bdfconvSrcDir = join(resolvedU8g2Path, 'tools', 'font', 'bdfconv');
  if (!existsSync(bdfconvSrcDir)) {
    throw new Error(`bdfconv sources not found: ${bdfconvSrcDir}`);
  }

  console.log(`[u8g2gl] Building bdfconv from: ${bdfconvSrcDir}`);

  // --- Step 3: Identify the U8G2 source commit — must match catalogue-source.json (WO1
  //     provenance.test.ts), so the font list and the converter cannot silently diverge. ---
  const u8g2Source = readU8g2Source(resolvedU8g2Path);
  if (u8g2Source.commit === null) {
    console.warn(
      `[u8g2gl] Warning: ${resolvedU8g2Path} is not the top of a git checkout, so no ` +
        'U8G2 commit can be recorded. Build from extern/u8g2 for a reproducible artefact.'
    );
  }

  // --- Step 4: Resolve and verify the Emscripten toolchain ---
  const emccPath = resolveEmccPath(emsdkArg);
  const emccIdentity = readEmccIdentity(emccPath);
  if (emccIdentity.version !== PINNED_EMSCRIPTEN_VERSION) {
    throw new Error(
      `Pinned Emscripten is ${PINNED_EMSCRIPTEN_VERSION}, but ${emccPath} reports ` +
        `${emccIdentity.version} (${emccIdentity.commit}). Refusing to build an artefact ` +
        'whose provenance would not match what was measured. Install/activate the pinned ' +
        'version, or point --emsdk/EMSDK at it.'
    );
  }
  console.log(`[u8g2gl] emcc ${emccIdentity.version} (${emccIdentity.commit}) at ${emccPath}`);

  // --- Step 5: Build into a scratch directory under tmp/ (rule 02) ---
  const scratchDir = resolve(repoRoot, 'tmp', 'bdfconv-build');
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });

  const sourceFiles = readdirSync(bdfconvSrcDir)
    .filter((name) => name.endsWith('.c'))
    .sort()
    .map((name) => join(bdfconvSrcDir, name));
  if (sourceFiles.length === 0) {
    throw new Error(`No .c sources found in ${bdfconvSrcDir}`);
  }

  const gluePath = join(scratchDir, 'bdfconv.mjs');
  const wasmPath = join(scratchDir, 'bdfconv.wasm');
  const filePrefixMapFlag = `-ffile-prefix-map=${bdfconvSrcDir}=bdfconv`;
  const emccArgs = [...EMCC_BASE_FLAGS, filePrefixMapFlag, '-o', gluePath, ...sourceFiles];

  console.log(`[u8g2gl] Running emcc on ${sourceFiles.length} sources...`);
  execFileSync(emccPath, emccArgs, { cwd: scratchDir, stdio: 'inherit' });

  if (!existsSync(gluePath) || !existsSync(wasmPath)) {
    throw new Error('emcc reported success but did not produce bdfconv.mjs/.wasm');
  }

  // --- Step 6: Read build output and compute hashes ---
  const glueSource = readFileSync(gluePath, 'utf8');
  const wasmBytes = readFileSync(wasmPath);
  const wasmSha256 = sha256(wasmBytes);

  // --- Step 7: Write the committed artefact modules ---
  const dataDir = resolve(scriptDir, '..', 'data', 'bdfconv');
  mkdirSync(dataDir, { recursive: true });

  const gluePathOut = resolve(dataDir, 'bdfconv-glue.json');
  const wasmPathOut = resolve(dataDir, 'bdfconv-wasm.json');
  const sourcePathOut = resolve(dataDir, 'bdfconv-source.json');

  writeFileSync(gluePathOut, JSON.stringify({ source: glueSource }, null, 2) + '\n', 'utf8');
  writeFileSync(
    wasmPathOut,
    JSON.stringify({ base64: wasmBytes.toString('base64') }, null, 2) + '\n',
    'utf8'
  );

  // --- Step 8: Record provenance, hashed against the files as actually committed ---
  // Flags are recorded with the source directory's absolute path replaced by a
  // placeholder: the literal path is specific to this machine's checkout location, and
  // baking it into a committed file would make an unchanged project fail to regenerate
  // to an empty diff on a different machine (typescript.md §5, determinism). The flag's
  // effect does not depend on the literal value recorded here — only on the build using
  // the *actual* source directory at build time, which the script always does.
  const recordedFlags = [...EMCC_BASE_FLAGS, `-ffile-prefix-map=${FILE_PREFIX_MAP_PLACEHOLDER}=bdfconv`];
  const sourceRecord = {
    u8g2: { tag: u8g2Source.tag, commit: u8g2Source.commit },
    emscripten: { version: emccIdentity.version, commit: emccIdentity.commit },
    flags: recordedFlags,
    wasm: { sha256: wasmSha256 },
    artefacts: {
      'bdfconv-glue.json': sha256(readFileSync(gluePathOut)),
      'bdfconv-wasm.json': sha256(readFileSync(wasmPathOut)),
    },
  };
  writeFileSync(sourcePathOut, JSON.stringify(sourceRecord, null, 2) + '\n', 'utf8');

  // --- Step 9: Report ---
  console.log(`[u8g2gl] U8G2 ${u8g2Source.tag ?? '(none)'} commit ${u8g2Source.commit ?? '(unknown)'}`);
  console.log(`[u8g2gl] Wasm: ${wasmBytes.length} bytes, sha256 ${wasmSha256}`);
  console.log(`[u8g2gl] Glue: ${glueSource.length} chars`);
  console.log('[u8g2gl] Output written to:');
  console.log(`  - ${gluePathOut}`);
  console.log(`  - ${wasmPathOut}`);
  console.log(`  - ${sourcePathOut}`);
}

main();
