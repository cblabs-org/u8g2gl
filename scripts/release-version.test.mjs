/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/release-version.test.mjs
 * Purpose: Proves scripts/release-version.mjs refuses every tag rule 03 says it
 *          must, accepts each channel of each component, and that `next`
 *          follows the tiers, including a beta superseding a PATCH's dev tags.
 *          A tag check is only worth having if each refusal is known to fire,
 *          so every refusal has its own case.
 * Description: Each case runs the script as a command inside its own
 *              throwaway repository under tmp/release-version-test/, never in
 *              this one, so no tag is ever created here. The repositories
 *              carry only what the script reads: the three runtime version
 *              files, the CLI's package.json and runtime stamp, and an
 *              extern/u8g2 submodule cloned from a local stand-in for U8G2
 *              with version tags. Git runs with an empty global configuration,
 *              so the user's own settings (signing, hooks) cannot change the
 *              result.
 *              Usage: node --test scripts/release-version.test.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareReleases,
  formatReleaseTag,
  parseReleaseTag,
  rangeAdmits,
} from './release-version.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'release-version.mjs');
const WORK = join(REPO_ROOT, 'tmp', 'release-version-test');

// Git isolated from the user's configuration, with a fixed identity. The
// script under test inherits the same environment, so it sees the same repos.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: join(WORK, 'empty.gitconfig'),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'release-version test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'release-version test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

/** Run git in a directory; its trimmed stdout. Throws on failure. */
function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Run the script in a repository; its exit status and output. */
function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: GIT_ENV, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/** Write a file inside a repository, creating its directory. */
function put(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

/** Write every version file a release reads, for one runtime and CLI version. */
function writeVersions(repo, { runtime, cli, stamp = runtime, cmake = runtime, header = runtime, range = '^2.36.18' }) {
  put(repo, 'library.json', JSON.stringify({ name: 'u8g2gl', version: runtime, dependencies: { 'olikraus/U8g2': range } }, null, 2) + '\n');
  put(repo, 'CMakeLists.txt', `cmake_minimum_required(VERSION 3.16)\nproject(u8g2gl VERSION ${cmake} LANGUAGES CXX)\n`);
  const [major, minor, patch] = header.split('.');
  put(
    repo,
    'include/u8g2gl/u8g2gl_version.h',
    `#define U8G2GL_VERSION_MAJOR ${major}\n#define U8G2GL_VERSION_MINOR ${minor}\n#define U8G2GL_VERSION_PATCH ${patch}\n`,
  );
  put(repo, 'cli/package.json', JSON.stringify({ name: 'u8g2gl', version: cli }, null, 2) + '\n');
  const [smaj, smin, spat] = stamp.split('.').map(Number);
  put(repo, 'cli/src/data/runtime-version.json', JSON.stringify({ major: smaj, minor: smin, patch: spat }, null, 2) + '\n');
}

/** Commit everything in a repository. */
function commitAll(repo, message) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
}

let base; // the template repository each case copies
let u8g2Commits; // the stand-in U8G2's commits: { tagged, newMajor, untagged }
let caseCount = 0;

/** A fresh copy of the template repository for one case. */
function freshRepo() {
  const dir = join(WORK, `case-${++caseCount}`);
  cpSync(base, dir, { recursive: true });
  return dir;
}

/** Point the repository's extern/u8g2 at another stand-in commit and commit that. */
function moveU8g2(repo, commit) {
  git(join(repo, 'extern', 'u8g2'), 'checkout', '-q', commit);
  commitAll(repo, 'move u8g2');
}

before(() => {
  // --- Step 1: a clean work directory and an empty git configuration ---
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');

  // --- Step 2: a stand-in U8G2 with a release tag, a later major, and an untagged commit ---
  const upstream = join(WORK, 'u8g2-upstream');
  mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'master');
  put(upstream, 'ChangeLog', '2.36.18\n');
  commitAll(upstream, '2.36.18');
  git(upstream, 'tag', '2.36.18');
  const tagged = git(upstream, 'rev-parse', 'HEAD');
  put(upstream, 'ChangeLog', '3.0.0\n');
  commitAll(upstream, '3.0.0');
  git(upstream, 'tag', '3.0.0');
  const newMajor = git(upstream, 'rev-parse', 'HEAD');
  put(upstream, 'ChangeLog', 'unreleased\n');
  commitAll(upstream, 'unreleased');
  const untagged = git(upstream, 'rev-parse', 'HEAD');
  u8g2Commits = { tagged, newMajor, untagged };

  // --- Step 3: the template: runtime 0.11.1, CLI 0.15.2, U8G2 at 2.36.18 ---
  base = join(WORK, 'template');
  mkdirSync(base);
  git(base, 'init', '-q', '-b', 'main');
  writeVersions(base, { runtime: '0.11.1', cli: '0.15.2' });
  git(base, 'submodule', 'add', '-q', upstream, 'extern/u8g2');
  git(join(base, 'extern', 'u8g2'), 'checkout', '-q', tagged);
  commitAll(base, 'template');
});

after(() => {
  rmSync(WORK, { recursive: true, force: true });
});

// ─── Pure functions ─────────────────────────────────────────────────────────

describe('tag parsing and precedence', () => {
  test('parses and formats every channel', () => {
    for (const tag of ['cli-v0.15.2-dev.3', 'cli-v0.15.2-beta.1', 'cli-v0.15.2-rc.2', 'runtime-v0.11.1']) {
      assert.equal(formatReleaseTag(parseReleaseTag(tag)), tag);
    }
    assert.deepEqual(parseReleaseTag('runtime-v0.11.1'), {
      component: 'runtime',
      core: [0, 11, 1],
      channel: 'stable',
      preNum: 0,
    });
  });

  test('rejects shapes outside the scheme', () => {
    for (const tag of [
      'v0.11.1',
      'runtime-0.11.1',
      'designer-v0.1.0',
      'runtime-v0.11',
      'runtime-v0.011.1',
      'cli-v0.15.2-alpha.1',
      'cli-v0.15.2-beta.0',
      'cli-v0.15.2-beta',
      'v0.7.0-integration',
      'archive/u8g2gl-05/wo1-packaging',
    ]) {
      assert.equal(parseReleaseTag(tag), null, tag);
    }
  });

  test('orders dev < beta < rc < stable within a PATCH, and PATCH above all', () => {
    const order = [
      'cli-v0.15.2-dev.1',
      'cli-v0.15.2-dev.10',
      'cli-v0.15.2-beta.1',
      'cli-v0.15.2-beta.2',
      'cli-v0.15.2-rc.1',
      'cli-v0.15.2',
      'cli-v0.15.3-dev.1',
      'cli-v0.16.0',
    ].map(parseReleaseTag);
    for (let i = 1; i < order.length; i++) {
      assert.ok(compareReleases(order[i - 1], order[i]) < 0, `${i}`);
    }
  });

  test('reads the range forms a manifest uses for U8G2', () => {
    assert.equal(rangeAdmits('^2.36.18', [2, 36, 18]), true);
    assert.equal(rangeAdmits('^2.36.18', [2, 40, 0]), true);
    assert.equal(rangeAdmits('^2.36.18', [2, 36, 17]), false);
    assert.equal(rangeAdmits('^2.36.18', [3, 0, 0]), false);
    assert.equal(rangeAdmits('^0.3.1', [0, 4, 0]), false);
    assert.equal(rangeAdmits('~2.36.18', [2, 37, 0]), false);
    assert.equal(rangeAdmits('>=2.36.18', [3, 0, 0]), true);
    assert.equal(rangeAdmits('2.36.18', [2, 36, 19]), false);
    assert.equal(rangeAdmits('2.36.x', [2, 36, 19]), null);
  });
});

// ─── check: accepted tags ───────────────────────────────────────────────────

describe('check accepts', () => {
  for (const component of ['runtime', 'cli']) {
    for (const suffix of ['-dev.1', '-beta.1', '-rc.1', '']) {
      const tag = `${component}-v${component === 'runtime' ? '0.11.1' : '0.15.2'}${suffix}`;
      test(tag, () => {
        const repo = freshRepo();
        git(repo, 'tag', tag);
        const result = run(repo, 'check', tag);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, new RegExp(`^ok ${tag}: `));
        if (component === 'runtime') assert.match(result.stdout, /built against U8G2 2\.36\.18$/);
      });
    }
  }

  test('an annotated tag, and a run from a subdirectory', () => {
    const repo = freshRepo();
    git(repo, 'tag', '-a', '-m', 'beta', 'cli-v0.15.2-beta.1');
    const result = run(join(repo, 'cli'), 'check', 'cli-v0.15.2-beta.1');
    assert.equal(result.status, 0, result.stderr);
  });

  test('a further dev tag while the PATCH has only dev tags', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'runtime-v0.11.1-dev.1');
    git(repo, 'tag', 'runtime-v0.11.1-dev.2');
    assert.equal(run(repo, 'check', 'runtime-v0.11.1-dev.2').status, 0);
  });

  test('a stable promoted onto the same commit as its beta', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.2-beta.1');
    git(repo, 'tag', 'cli-v0.15.2');
    assert.equal(run(repo, 'check', 'cli-v0.15.2').status, 0);
  });
});

// ─── check: each refusal ────────────────────────────────────────────────────

/** Assert a refusal (exit 1) whose message matches every pattern. */
function assertRefused(result, ...patterns) {
  assert.equal(result.status, 1, `expected a refusal, got: ${result.stdout}`);
  for (const p of patterns) assert.match(result.stderr, p);
}

describe('check refuses', () => {
  test('a tag that is not a release tag', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'v0.7.0-integration');
    assertRefused(run(repo, 'check', 'v0.7.0-integration'), /"v0\.7\.0-integration" is not a release tag/);
  });

  test('a tag that does not exist', () => {
    assertRefused(run(freshRepo(), 'check', 'cli-v0.15.2-beta.1'), /no tag "cli-v0\.15\.2-beta\.1" exists/);
  });

  test('a tag that is not at the commit being checked', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.2-dev.1');
    put(repo, 'README.md', 'later\n');
    commitAll(repo, 'later');
    assertRefused(run(repo, 'check', 'cli-v0.15.2-dev.1'), /is at [0-9a-f]{12}, not at the commit being checked \(HEAD [0-9a-f]{12}\)/);
  });

  test("a CLI tag whose core differs from cli/package.json", () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.3-beta.1');
    assertRefused(run(repo, 'check', 'cli-v0.15.3-beta.1'), /the tag's core is 0\.15\.3, but cli\/package\.json says 0\.15\.2/);
  });

  test("a runtime tag whose core differs from the runtime's files", () => {
    const repo = freshRepo();
    git(repo, 'tag', 'runtime-v0.12.0');
    assertRefused(
      run(repo, 'check', 'runtime-v0.12.0'),
      /the tag's core is 0\.12\.0, but library\.json, CMakeLists\.txt and include\/u8g2gl\/u8g2gl_version\.h say 0\.11\.1/,
    );
  });

  test('a runtime whose three files disagree', () => {
    const repo = freshRepo();
    writeVersions(repo, { runtime: '0.11.1', cli: '0.15.2', cmake: '0.11.2', header: '0.11.0', stamp: '0.11.0' });
    commitAll(repo, 'drift');
    git(repo, 'tag', 'runtime-v0.11.1-dev.1');
    assertRefused(
      run(repo, 'check', 'runtime-v0.11.1-dev.1'),
      /library\.json says 0\.11\.1, CMakeLists\.txt says 0\.11\.2/,
      /library\.json says 0\.11\.1, include\/u8g2gl\/u8g2gl_version\.h says 0\.11\.0/,
    );
  });

  test('a CLI whose stamped runtime version lags the header', () => {
    const repo = freshRepo();
    writeVersions(repo, { runtime: '0.11.1', cli: '0.15.2', stamp: '0.11.0' });
    commitAll(repo, 'stale stamp');
    git(repo, 'tag', 'cli-v0.15.2-beta.1');
    assertRefused(
      run(repo, 'check', 'cli-v0.15.2-beta.1'),
      /cli\/src\/data\/runtime-version\.json says runtime 0\.11\.0, which lags include\/u8g2gl\/u8g2gl_version\.h's 0\.11\.1/,
    );
  });

  test('a dev tag in a PATCH that already has a beta', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'runtime-v0.11.1-beta.1');
    git(repo, 'tag', 'runtime-v0.11.1-dev.1');
    assertRefused(run(repo, 'check', 'runtime-v0.11.1-dev.1'), /runtime 0\.11\.1 already has runtime-v0\.11\.1-beta\.1, which supersedes its dev tags/);
  });

  test('a dev tag in a PATCH that is already stable', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.2');
    git(repo, 'tag', 'cli-v0.15.2-dev.4');
    assertRefused(run(repo, 'check', 'cli-v0.15.2-dev.4'), /already has cli-v0\.15\.2, which supersedes/);
  });

  test("a runtime whose U8G2 is outside library.json's range", () => {
    const repo = freshRepo();
    moveU8g2(repo, u8g2Commits.newMajor);
    git(repo, 'tag', 'runtime-v0.11.1-beta.1');
    assertRefused(
      run(repo, 'check', 'runtime-v0.11.1-beta.1'),
      /extern\/u8g2 is U8G2 3\.0\.0, which library\.json's "olikraus\/U8g2" range "\^2\.36\.18" does not admit/,
    );
  });

  test('a runtime whose U8G2 is not a tagged release', () => {
    const repo = freshRepo();
    moveU8g2(repo, u8g2Commits.untagged);
    git(repo, 'tag', 'runtime-v0.11.1-beta.1');
    assertRefused(run(repo, 'check', 'runtime-v0.11.1-beta.1'), /extern\/u8g2 at [0-9a-f]{12} has no U8G2 version tag/);
  });

  test('a runtime whose U8G2 submodule is not checked out', () => {
    const repo = freshRepo();
    git(repo, 'submodule', 'deinit', '-q', '-f', 'extern/u8g2');
    git(repo, 'tag', 'runtime-v0.11.1-beta.1');
    assertRefused(run(repo, 'check', 'runtime-v0.11.1-beta.1'), /extern\/u8g2 is not checked out/);
  });

  test('a CLI tag does not depend on the U8G2 submodule', () => {
    const repo = freshRepo();
    git(repo, 'submodule', 'deinit', '-q', '-f', 'extern/u8g2');
    git(repo, 'tag', 'cli-v0.15.2-beta.1');
    assert.equal(run(repo, 'check', 'cli-v0.15.2-beta.1').status, 0);
  });

  test('reads the commit, not an uncommitted edit', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.3-beta.1');
    writeVersions(repo, { runtime: '0.11.1', cli: '0.15.3' }); // edited, never committed
    assertRefused(run(repo, 'check', 'cli-v0.15.3-beta.1'), /cli\/package\.json says 0\.15\.2/);
  });
});

// ─── next ───────────────────────────────────────────────────────────────────

describe('next', () => {
  test('starts each channel of each component at 1, and stable bare', () => {
    const repo = freshRepo();
    assert.equal(run(repo, 'next', 'runtime', 'dev').stdout, 'runtime-v0.11.1-dev.1');
    assert.equal(run(repo, 'next', 'cli', 'beta').stdout, 'cli-v0.15.2-beta.1');
    assert.equal(run(repo, 'next', 'cli', 'rc').stdout, 'cli-v0.15.2-rc.1');
    assert.equal(run(repo, 'next', 'runtime', 'stable').stdout, 'runtime-v0.11.1');
  });

  test('increments PRE_NUM within the files\' PATCH, ignoring other PATCHes and components', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.2-dev.1');
    git(repo, 'tag', 'cli-v0.15.2-dev.2');
    git(repo, 'tag', 'cli-v0.15.1-dev.9');
    git(repo, 'tag', 'runtime-v0.15.2-dev.7');
    assert.equal(run(repo, 'next', 'cli', 'dev').stdout, 'cli-v0.15.2-dev.3');
  });

  test('across a supersession: once a beta exists, dev is refused and beta continues', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'runtime-v0.11.1-dev.1');
    assert.equal(run(repo, 'next', 'runtime', 'dev').stdout, 'runtime-v0.11.1-dev.2');
    git(repo, 'tag', 'runtime-v0.11.1-beta.1');
    assertRefused(run(repo, 'next', 'runtime', 'dev'), /dev tags are superseded: new work targets the next PATCH/);
    assert.equal(run(repo, 'next', 'runtime', 'beta').stdout, 'runtime-v0.11.1-beta.2');
    assert.equal(run(repo, 'next', 'runtime', 'stable').stdout, 'runtime-v0.11.1');

    // The next PR moves the files to the next PATCH, and dev starts again.
    writeVersions(repo, { runtime: '0.11.2', cli: '0.15.3' });
    commitAll(repo, 'next PATCH');
    assert.equal(run(repo, 'next', 'runtime', 'dev').stdout, 'runtime-v0.11.2-dev.1');
  });

  test('refuses a channel below one already tagged', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.2-rc.1');
    assertRefused(run(repo, 'next', 'cli', 'beta'), /already has cli-v0\.15\.2-rc\.1, which outranks a beta tag/);
  });

  test('refuses every channel once the PATCH is stable', () => {
    const repo = freshRepo();
    git(repo, 'tag', 'cli-v0.15.2');
    for (const channel of ['dev', 'beta', 'rc', 'stable']) {
      assertRefused(run(repo, 'next', 'cli', channel), /already released as cli-v0\.15\.2/);
    }
  });

  test("refuses when the runtime's files disagree", () => {
    const repo = freshRepo();
    writeVersions(repo, { runtime: '0.11.1', cli: '0.15.2', cmake: '0.11.2' });
    commitAll(repo, 'drift');
    assertRefused(run(repo, 'next', 'runtime', 'dev'), /CMakeLists\.txt says 0\.11\.2/);
  });

  test('a usage error exits 2', () => {
    const repo = freshRepo();
    assert.equal(run(repo, 'next', 'designer', 'dev').status, 2);
    assert.equal(run(repo, 'next', 'cli', 'alpha').status, 2);
    assert.equal(run(repo, 'check').status, 2);
  });
});
