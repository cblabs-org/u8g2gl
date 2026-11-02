/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/check-package.mjs
 * Purpose: The gate on the npm package: proves that what `npm pack` produces,
 *          installed where no source tree can be seen, does everything a
 *          checkout does. Unit tests run against the source tree, which is
 *          exactly what an installed CLI lacks, so only a real pack and a real
 *          install can show that the staged designer and framework are found,
 *          complete and current.
 * Description: Packs the CLI (its `prepack` builds and stages everything, and
 *              refuses a dirty tree or an unpinned Emscripten), then:
 *              1. checks the tarball's file list against the package's
 *                 allowlist, and every file in it for home-folder paths and
 *                 the owner's address;
 *              2. installs the tarball into an empty directory with no
 *                 registry access (the CLI has no runtime dependencies), and
 *                 confirms the installed CLI sees no source tree;
 *              3. on a copy of the departures fixture runs `validate`,
 *                 `generate`, and `design --no-open`, and through the design
 *                 server checks the real designer is served at `/` and that
 *                 an `editor-wasm` build and a `test-run` both succeed.
 *              Prints the tarball and unpacked sizes. The CLI runs with its
 *              home directory inside the work directory, so its build caches
 *              never touch the user's. Needs the pinned Emscripten on PATH and
 *              the designer's dependencies installed.
 *              Usage: node scripts/check-package.mjs [--work <dir>]
 *                     (default work directory: tmp/check-package/)
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanText } from './check-home-paths.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ROOT = join(REPO_ROOT, 'cli');
const FIXTURE = join(CLI_ROOT, 'test', 'fixtures', 'departures-project');
const FIXTURE_SCREEN = 'departures';

/** SHA-256 of the owner's email address, so this file never contains it. */
const OWNER_ADDRESS_SHA256 = '603d66fb5bcf10654c4321aecf19f0340788dd58b29af97087bfd11137e25180';

/** How long one design-server build may take before the check gives up. */
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

// The package's allowlist: the CLI, the designer, the framework sources a
// build reads in their repository layout, and the licences. Anything else in
// the tarball (a test, a fixture, a doc, an agent file) fails the check.
// U8G2's C files are not listed here: they must be exactly the ones
// wasm/CMakeLists.txt compiles, which allowlistFor() adds from the package.
const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^THIRD-PARTY-NOTICES\.md$/,
  /^LICENSES\/[^/]+\.txt$/,
  /^dist\/.+/,
  /^designer\/.+/,
  /^framework\/(CMakeLists\.txt|STAMP\.json)$/,
  /^framework\/(include|src)\/.+/,
  /^framework\/wasm\/([^/]+\.(cpp|h)|CMakeLists\.txt)$/,
  /^framework\/test\/(editor_host|real_u8g2)\/[^/]+$/,
  /^framework\/extern\/u8g2\/LICENSE$/,
  // MUIU8g2.h is not compiled, but sits in a directory the builds search for
  // headers, and the package carries every header there (frameworkFiles()).
  /^framework\/extern\/u8g2\/cppsrc\/(U8g2lib|U8x8lib|MUIU8g2)\.(h|cpp)$/,
  /^framework\/extern\/u8g2\/csrc\/[^/]+\.h$/,
];

/** Paths that must never be in the package, whatever the allowlist says. */
const FORBIDDEN = [/(^|\/)test\/fixtures\//, /(^|\/)\.agents\//, /(^|\/)node_modules\//, /^designer\/E2E-TEST-BUILD$/, /\.test\.[cm]?[jt]s$/];

// fail
// Ends the check with a reason. Exit 1 fails the CI job.
function fail(message) {
  console.error(`check-package: FAIL: ${message}`);
  process.exit(1);
}

// step
// A progress line.
function step(message) {
  console.log(`check-package: ${message}`);
}

// run
// Runs a command to completion; fails the check if it fails. Returns stdout.
//   command, args — what to run
//   options       — cwd, env, and `quiet` to keep stdout for the caller
function run(command, args, { quiet = false, ...options } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', quiet ? 'pipe' : 'inherit', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error !== undefined || result.status !== 0) {
    fail(`'${command} ${args.join(' ')}' failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
  return result.stdout ?? '';
}

// filesUnder
// Every file beneath a directory, relative to it, with `/` separators.
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

// pack
// `npm pack` into the work directory, returning its JSON report (name,
// size, unpackedSize, entryCount, files). The stage script keeps its own
// output on stderr, so stdout is the report alone.
function pack(work) {
  step('packing (prepack builds the framework Wasm, the designer and the CLI)');
  const out = run('npm', ['pack', '--json', '--pack-destination', work], { cwd: CLI_ROOT, quiet: true });
  const [report] = JSON.parse(out);
  if (report === undefined || !existsSync(join(work, report.filename))) {
    fail('npm pack reported no tarball');
  }
  return report;
}

// checkFileList
// Step 1: every packed path is allowed and none forbidden; the U8G2 C files
// are exactly the ones the package's own parser says a build compiles.
//   paths     — the tarball's file list
//   u8g2Files — basenames of WASM_U8G2_C_SOURCES, from the installed package
function checkFileList(paths, u8g2Files) {
  const allowedC = new Set(u8g2Files.map((file) => `framework/extern/u8g2/csrc/${file}`));
  const outside = paths.filter((path) => !allowedC.has(path) && !ALLOWED.some((pattern) => pattern.test(path)));
  const forbidden = paths.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)));
  if (outside.length > 0 || forbidden.length > 0) {
    fail(`the tarball carries files outside its allowlist:\n  ${[...new Set([...outside, ...forbidden])].join('\n  ')}`);
  }
  const missingC = [...allowedC].filter((path) => !paths.includes(path));
  if (missingC.length > 0) {
    fail(`the tarball lacks U8G2 sources a build compiles:\n  ${missingC.join('\n  ')}`);
  }
  for (const required of ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'LICENSES/u8g2-BSD-2-Clause.txt', 'designer/index.html',
    'designer/framework-wasm/u8g2gl_editor.wasm', 'framework/STAMP.json', 'designer/STAMP.json', 'framework/extern/u8g2/csrc/u8g2_fonts.c']) {
    if (!paths.includes(required)) {
      fail(`the tarball has no ${required}`);
    }
  }
}

// checkContents
// Step 1, the contents half: no file in the package holds a home-folder path,
// the owner's username, or the owner's address. Binary files are scanned as
// Latin-1, which keeps every byte, because a path compiled into a Wasm module
// is as much a leak as one in a script.
//   packageDir — the installed package
function checkContents(packageDir) {
  const findings = [];
  for (const file of filesUnder(packageDir)) {
    const text = readFileSync(join(packageDir, file), 'latin1');
    for (const finding of scanText(text)) {
      findings.push(`${file}:${finding.line}: ${finding.reason}`);
    }
    for (const address of text.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) {
      if (createHash('sha256').update(address[0].toLowerCase()).digest('hex') === OWNER_ADDRESS_SHA256) {
        findings.push(`${file}: the owner's email address`);
      }
    }
  }
  if (findings.length > 0) {
    fail(`the package carries what it must not:\n  ${findings.join('\n  ')}`);
  }
}

// install
// Step 2: install the tarball into an empty directory, offline and with the
// registry pointed at a closed port, so any attempt to fetch fails. Returns
// the installed package's directory.
//   work    — the work directory
//   tarball — the packed file's name in it
function install(work, tarball) {
  step('installing the tarball with no registry access');
  const dir = join(work, 'install');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{ "name": "u8g2gl-package-check", "private": true }\n');
  run('npm', ['install', '--offline', '--no-audit', '--no-fund', '--registry=http://127.0.0.1:9/', join(work, tarball)], { cwd: dir });
  return join(dir, 'node_modules', 'u8g2gl');
}

// inspectInstalled
// Asks the installed CLI's own lookups what they find, in a child process so
// they run as the installed code does. The source-tree search must find
// nothing: otherwise a passing check could be the checkout's work, not the
// package's. Returns the U8G2 C file basenames its parser names.
//   packageDir — the installed package
function inspectInstalled(packageDir) {
  const module = (path) => pathToFileURL(join(packageDir, 'dist', 'node', 'design', ...path)).href;
  const script = [
    `const f = await import(${JSON.stringify(module(['build', 'framework-sources.js']))});`,
    `const s = await import(${JSON.stringify(module(['static-files.js']))});`,
    'const root = f.locateFrameworkRoot();',
    'console.log(JSON.stringify({ sourceTree: f.locateSourceTree() ?? null, framework: root ?? null,',
    '  designer: s.locateDesignerDist() ?? null,',
    "  u8g2: root ? f.readFrameworkSources(root).u8g2.map((p) => p.split(/[\\\\/]/).pop()) : [] }));",
  ].join('\n');
  const found = JSON.parse(run(process.execPath, ['--input-type=module', '-e', script], { quiet: true }));
  if (found.sourceTree !== null) {
    fail(`the installed CLI can see a source tree at ${found.sourceTree}; use a work directory outside the checkout`);
  }
  if (found.framework !== join(packageDir, 'framework') || found.designer !== join(packageDir, 'designer')) {
    fail(`the installed CLI did not choose its staged copies: ${JSON.stringify(found)}`);
  }
  return found.u8g2;
}

/** The running design server, stopped however the check ends (fail() exits). */
let designChild;
process.on('exit', () => designChild?.kill('SIGTERM'));

// startDesign
// Starts `design --no-open --json` and resolves with its URL and process once
// it prints its one JSON line.
//   cli, project, env — the installed CLI, the project, the CLI's environment
function startDesign(cli, project, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, 'design', project, '--no-open', '--json'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    designChild = child;
    let out = '';
    let settled = false;
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const line = out.split('\n')[0];
      if (!settled && out.includes('\n')) {
        settled = true;
        try {
          resolvePromise({ child, url: new URL(JSON.parse(line).url) });
        } catch (cause) {
          reject(new Error(`design printed '${line}': ${cause.message}`));
        }
      }
    });
    // After the URL is printed, an exit (the SIGTERM that ends the check) has
    // nothing left to report: the promise is already settled.
    child.on('exit', (code) => {
      if (!settled) reject(new Error(`design exited (${code}) before printing its URL`));
    });
  });
}

// awaitBuild
// Submits a build job to the design server and polls until it ends.
//   base, token — the server and its session token
//   job, params — what to build
async function awaitBuild(base, token, job, params) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const submitted = await fetch(new URL(`/api/build/${job}`, base), { method: 'POST', headers, body: JSON.stringify(params) });
  if (submitted.status !== 202) {
    fail(`submitting ${job} answered ${submitted.status}: ${await submitted.text()}`);
  }
  const { id } = await submitted.json();
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  for (;;) {
    const record = await (await fetch(new URL(`/api/build/${id}`, base), { headers })).json();
    if (record.status === 'succeeded' || record.status === 'failed') {
      return record;
    }
    if (Date.now() > deadline) {
      fail(`${job} did not finish within ${BUILD_TIMEOUT_MS / 60000} minutes`);
    }
    await new Promise((wake) => setTimeout(wake, 1000));
  }
}

// checkDesign
// Step 3, the design half: the real designer at `/`, then a project editor
// Wasm build and a test run through the server, as the designer requests them.
//   cli, project, env — the installed CLI, the project, the CLI's environment
async function checkDesign(cli, project, env) {
  step('design --no-open');
  const { child, url } = await startDesign(cli, project, env);
  try {
    // --- The designer, not the placeholder: `/` redirects into it ---
    const token = url.searchParams.get('token');
    const root = await fetch(url, { redirect: 'manual' });
    const location = root.headers.get('location');
    if (root.status !== 302 || location === null) {
      fail(`'/' answered ${root.status}, not the designer's redirect: the placeholder page is being served`);
    }
    const page = await fetch(new URL(location, url));
    const html = await page.text();
    if (page.status !== 200 || !html.includes('<div id="root">') || !html.includes('<title>u8g2gl design</title>')) {
      fail(`the designer's page is not the built designer (status ${page.status})`);
    }
    const wasm = await fetch(new URL(`${location}framework-wasm/u8g2gl_editor.wasm`, url));
    if (wasm.status !== 200 || wasm.headers.get('content-type') !== 'application/wasm') {
      fail(`the designer's framework editor Wasm answered ${wasm.status} ${wasm.headers.get('content-type')}`);
    }
    step('the designer is served at /');

    // --- The project editor Wasm, then the test run ---
    for (const [job, params] of [['editor-wasm', {}], ['test-run', { screen: FIXTURE_SCREEN, documents: [] }]]) {
      step(`${job} build`);
      const record = await awaitBuild(url, token, job, params);
      if (record.status !== 'succeeded') {
        fail(`${job} failed (${record.code ?? 'no code'}):\n${record.error}`);
      }
      step(`${job} succeeded`);
    }
  } finally {
    child.kill('SIGTERM');
  }
}

// main
// The steps of the header, in order, then the sizes.
async function main() {
  // --- Step 0: A fresh work directory ---
  const workArg = process.argv.indexOf('--work');
  const work = resolve(workArg >= 0 ? process.argv[workArg + 1] : join(REPO_ROOT, 'tmp', 'check-package'));
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  // --- Step 1: Pack, install, and check what was installed ---
  const report = pack(work);
  const packageDir = install(work, report.filename);
  const u8g2 = inspectInstalled(packageDir);
  checkFileList(report.files.map((file) => file.path), u8g2);
  checkContents(packageDir);
  step(`${report.entryCount} files, inside the allowlist, free of home paths`);

  // --- Step 2: The CLI on a copy of the departures fixture ---
  // Its home is inside the work directory, so the toolchain detection and the
  // build caches it writes stay there; PATH still carries the pinned em++.
  const home = join(work, 'home');
  mkdirSync(home, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CACHE_HOME: join(home, '.cache'), LOCALAPPDATA: join(home, 'AppData', 'Local') };
  const project = join(work, 'project');
  cpSync(FIXTURE, project, { recursive: true });
  const cli = join(packageDir, 'dist', 'node', 'cli.js');
  if (!existsSync(join(work, 'install', 'node_modules', '.bin', process.platform === 'win32' ? 'u8g2gl.cmd' : 'u8g2gl'))) {
    fail('the install has no u8g2gl bin link');
  }
  for (const command of ['validate', 'generate']) {
    step(command);
    run(process.execPath, [cli, command, project], { env });
  }
  await checkDesign(cli, project, env);

  // --- Step 3: The sizes ---
  const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
  step(`PASS: ${report.filename}: tarball ${mb(report.size)} (${report.size} bytes), unpacked ${mb(report.unpackedSize)} (${report.unpackedSize} bytes), ${report.entryCount} files`);
}

await main();
