#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/release-version.mjs
 * Purpose: The one place that knows what a release tag means
 *          (.agents/rules/03-versioning.md). Under that scheme the core
 *          version, MAJOR.MINOR.PATCH, is committed in each component's files,
 *          because PlatformIO fetches the runtime without its tags, while the
 *          channel lives only in the tag. Two places must then agree, and this
 *          script is what holds them together: CI runs `check` on every tag
 *          push, packing the CLI runs it before stamping the tag's version,
 *          and agents and the owner run `next` instead of counting tags.
 * Description: Works from git and the committed files only, with no network
 *              access. Files are read from the commit being checked (`git
 *              show`), never the working tree, so an uncommitted edit cannot
 *              make a tag look right.
 *
 *              `check <tag>` refuses, naming the file and both values:
 *              - a tag that is not a release tag;
 *              - a tag that does not exist, or is not at HEAD;
 *              - a core that differs from the component's files;
 *              - a runtime whose three version files disagree;
 *              - a runtime whose U8G2 (extern/u8g2's tag) is outside
 *                library.json's `olikraus/U8g2` range;
 *              - a CLI whose stamped runtime version differs from the header;
 *              - a `dev` tag in a PATCH that already has a beta, rc or stable.
 *
 *              `next <component> <channel>` prints the tag to create next at
 *              HEAD, from the files' core and the tags that already exist.
 *
 *              Usage: node scripts/release-version.mjs check <tag>
 *                     node scripts/release-version.mjs next <runtime|cli> <dev|beta|rc|stable>
 *              Run from anywhere inside the repository. Exit 0 on success,
 *              1 on a refusal, 2 on a usage error.
 *
 * Exports:
 *
 *     Tags and versions:
 *     - COMPONENTS / CHANNELS:  The component prefixes and channel names, in precedence order
 *     - parseReleaseTag():      Split a tag into component, core, channel and PRE_NUM
 *     - formatReleaseTag():     The inverse
 *     - compareReleases():      SemVer precedence of two parsed tags (dev < beta < rc < stable)
 *     - rangeAdmits():          Whether a library.json version range admits a version
 *
 *     Repository queries:
 *     - readComponentCore():    A component's committed core at a commit, or why it has none
 *     - checkTag():             Every refusal for one tag at HEAD
 *     - nextTag():              The tag to create next, or why there is none
 */

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The released components, as tag prefixes (rule 03). */
export const COMPONENTS = ['runtime', 'cli'];

/**
 * Channels in precedence order, lowest first. `stable` is the absence of a
 * suffix in the tag; it is named here so `next` and the comparison can say it.
 */
export const CHANNELS = ['dev', 'beta', 'rc', 'stable'];

// No leading zeros in a number, as SemVer requires, and PRE_NUM from 1.
const NUM = '(0|[1-9]\\d*)';
const RELEASE_TAG = new RegExp(
  `^(runtime|cli)-v${NUM}\\.${NUM}\\.${NUM}(?:-(dev|beta|rc)\\.([1-9]\\d*))?$`,
);

// The files each component's core is committed in, so every message names one.
const LIBRARY_JSON = 'library.json';
const CMAKE_LISTS = 'CMakeLists.txt';
const VERSION_HEADER = 'include/u8g2gl/u8g2gl_version.h';
const CLI_PACKAGE = 'cli/package.json';
const RUNTIME_STAMP = 'cli/src/data/runtime-version.json';
const U8G2_PATH = 'extern/u8g2';
const U8G2_DEPENDENCY = 'olikraus/U8g2';

// ─── Tags and versions ──────────────────────────────────────────────────────

/**
 * Split a release tag into its parts.
 * @param {string} tag  e.g. `cli-v0.15.2-beta.1`
 * @returns {{ component: string, core: number[], channel: string, preNum: number } | null}
 *          null when the tag is not in the release shape. A stable tag has
 *          channel `stable` and preNum 0.
 */
export function parseReleaseTag(tag) {
  const m = RELEASE_TAG.exec(tag);
  if (!m) return null;
  return {
    component: m[1],
    core: [Number(m[2]), Number(m[3]), Number(m[4])],
    channel: m[5] ?? 'stable',
    preNum: m[6] ? Number(m[6]) : 0,
  };
}

/**
 * The tag for parsed parts; the inverse of parseReleaseTag().
 * @param {{ component: string, core: number[], channel: string, preNum: number }} release
 */
export function formatReleaseTag({ component, core, channel, preNum }) {
  const suffix = channel === 'stable' ? '' : `-${channel}.${preNum}`;
  return `${component}-v${core.join('.')}${suffix}`;
}

/**
 * SemVer precedence of two parsed tags of one component: core first, then
 * channel (dev < beta < rc < stable), then PRE_NUM. Negative when a < b.
 */
export function compareReleases(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  }
  const byChannel = CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel);
  return byChannel !== 0 ? byChannel : a.preNum - b.preNum;
}

/** Compare two `[major, minor, patch]` arrays; negative when a < b. */
function compareCores(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** `X.Y.Z` as `[X, Y, Z]`, or null. */
function parseCore(text) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Whether a library.json dependency range admits a version.
 *
 * Only the forms a PlatformIO manifest uses for U8G2 are supported: `^X.Y.Z`,
 * `~X.Y.Z`, `>=X.Y.Z`, and an exact `X.Y.Z` or `=X.Y.Z`. The caret follows
 * npm's rule, under which the left-most non-zero part is fixed. Anything else
 * is reported as unsupported rather than guessed at.
 *
 * @param {string} range    e.g. `^2.36.18`
 * @param {number[]} version  `[major, minor, patch]`
 * @returns {boolean | null} null when the range is not a supported form
 */
export function rangeAdmits(range, version) {
  const m = /^(\^|~|>=|=)?\s*(\d+\.\d+\.\d+)$/.exec(String(range).trim());
  if (!m) return null;
  const floor = parseCore(m[2]);
  const operator = m[1] ?? '=';
  if (operator === '=') return compareCores(version, floor) === 0;
  if (compareCores(version, floor) < 0) return false;
  if (operator === '>=') return true;

  // --- Upper bound: the first version the range excludes ---
  let ceiling;
  if (operator === '~') {
    ceiling = [floor[0], floor[1] + 1, 0];
  } else if (floor[0] !== 0) {
    ceiling = [floor[0] + 1, 0, 0];
  } else if (floor[1] !== 0) {
    ceiling = [0, floor[1] + 1, 0];
  } else {
    ceiling = [0, 0, floor[2] + 1];
  }
  return compareCores(version, ceiling) < 0;
}

// ─── Repository access ──────────────────────────────────────────────────────

/** Run git in `cwd`; the trimmed stdout, or null when git fails. */
function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/** The repository's top-level directory, from any directory inside it. */
function repositoryRoot(cwd) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Error(`not inside a git repository: ${cwd}`);
  return root;
}

/** A file's text at a commit, or null when the commit has no such file. */
function fileAt(repo, commit, path) {
  return git(repo, ['show', `${commit}:${path}`]);
}

/** Every release tag of one component that exists in the repository, parsed. */
function releaseTagsOf(repo, component) {
  const listed = git(repo, ['tag', '--list', `${component}-v*`]) ?? '';
  return listed
    .split('\n')
    .map((name) => ({ name, release: parseReleaseTag(name) }))
    .filter((t) => t.release !== null && t.release.component === component);
}

/** Tags in one component's PATCH, given that PATCH's core. */
function tagsInPatch(repo, component, core) {
  return releaseTagsOf(repo, component).filter((t) => compareCores(t.release.core, core) === 0);
}

// ─── Reading each component's committed version ─────────────────────────────

/** The runtime's version as each of its three files states it, at a commit. */
function runtimeVersionFiles(repo, commit) {
  const sources = [];

  // --- Step 1: library.json, which PlatformIO reads ---
  const libraryText = fileAt(repo, commit, LIBRARY_JSON);
  let library = null;
  try {
    library = libraryText === null ? null : JSON.parse(libraryText);
  } catch {
    library = null;
  }
  sources.push({ file: LIBRARY_JSON, version: library ? parseCore(library.version ?? '') : null });

  // --- Step 2: CMakeLists.txt's project(... VERSION) ---
  const cmake = fileAt(repo, commit, CMAKE_LISTS) ?? '';
  const project = /project\(\s*u8g2gl\s+VERSION\s+(\d+\.\d+\.\d+)/.exec(cmake);
  sources.push({ file: CMAKE_LISTS, version: project ? parseCore(project[1]) : null });

  // --- Step 3: the header's three macros, which generated code compiles against ---
  sources.push({ file: VERSION_HEADER, version: headerVersion(fileAt(repo, commit, VERSION_HEADER)) });

  return { sources, library };
}

/** `[major, minor, patch]` from u8g2gl_version.h's text, or null. */
function headerVersion(text) {
  if (text === null) return null;
  const parts = ['MAJOR', 'MINOR', 'PATCH'].map((part) => {
    const m = new RegExp(`^#define U8G2GL_VERSION_${part} +(\\d+)`, 'm').exec(text);
    return m ? Number(m[1]) : null;
  });
  return parts.includes(null) ? null : parts;
}

/**
 * A component's committed core at a commit.
 * @param {string} repo       repository root
 * @param {string} component  `runtime` or `cli`
 * @param {string} commit     any revision; defaults to HEAD
 * @returns {{ core: number[] | null, problems: string[] }} core is null, with
 *          the reason in problems, when a file is missing or the runtime's
 *          files disagree with one another
 */
export function readComponentCore(repo, component, commit = 'HEAD') {
  if (component === 'cli') {
    let version = null;
    try {
      version = parseCore(JSON.parse(fileAt(repo, commit, CLI_PACKAGE) ?? 'null')?.version ?? '');
    } catch {
      version = null;
    }
    return version
      ? { core: version, problems: [] }
      : { core: null, problems: [`${CLI_PACKAGE} has no X.Y.Z "version"`] };
  }

  const { sources } = runtimeVersionFiles(repo, commit);
  const problems = sources
    .filter((s) => s.version === null)
    .map((s) => `${s.file} does not state the runtime version`);
  if (problems.length > 0) return { core: null, problems };

  // The three must agree: CMake checks the same at configure time, but a tag
  // check must not depend on someone having configured.
  const [first, ...rest] = sources;
  const disagreeing = rest.filter((s) => compareCores(s.version, first.version) !== 0);
  if (disagreeing.length > 0) {
    return {
      core: null,
      problems: disagreeing.map(
        (s) =>
          `the runtime's files disagree: ${first.file} says ${first.version.join('.')}, ` +
          `${s.file} says ${s.version.join('.')}`,
      ),
    };
  }
  return { core: first.version, problems: [] };
}

/**
 * The U8G2 release extern/u8g2 points at in a commit: the submodule's
 * version-shaped tag at the recorded gitlink.
 * @returns {{ version: number[] | null, problem: string | null }}
 */
function u8g2VersionAt(repo, commit) {
  // --- Step 1: the gitlink the commit records for the submodule ---
  const entry = git(repo, ['ls-tree', commit, U8G2_PATH]) ?? '';
  const gitlink = /^160000 commit ([0-9a-f]+)\t/.exec(entry);
  if (!gitlink) return { version: null, problem: `${U8G2_PATH} is not a submodule at ${commit}` };

  // --- Step 2: the submodule's own repository ---
  // `git -C` on an uninitialised (empty) submodule directory silently runs in
  // the parent repository instead, so confirm the top level is the submodule.
  const submodule = join(repo, U8G2_PATH);
  const top = git(submodule, ['rev-parse', '--show-toplevel']);
  if (top === null || realpathSync(top) !== realpathSync(submodule)) {
    return {
      version: null,
      problem:
        `${U8G2_PATH} is not checked out, so its U8G2 version cannot be read. ` +
        `Run: git submodule update --init --checkout ${U8G2_PATH}`,
    };
  }

  // --- Step 3: the version tag at that commit ---
  const tags = (git(submodule, ['tag', '--points-at', gitlink[1]]) ?? '')
    .split('\n')
    .map((t) => parseCore(t))
    .filter((v) => v !== null)
    .sort(compareCores);
  if (tags.length === 0) {
    return {
      version: null,
      problem:
        `${U8G2_PATH} at ${gitlink[1].slice(0, 12)} has no U8G2 version tag ` +
        `(fetch the submodule's tags, or point it at a U8G2 release)`,
    };
  }
  return { version: tags[tags.length - 1], problem: null };
}

// ─── check ──────────────────────────────────────────────────────────────────

/**
 * Every refusal for one tag, checked at HEAD.
 * @param {string} tag
 * @param {{ cwd?: string }} [options]  any directory in the repository
 * @returns {{ refusals: string[], summary: string | null }} summary describes
 *          an accepted tag, including the U8G2 version a runtime was built
 *          against; it is null when anything was refused
 */
export function checkTag(tag, { cwd = process.cwd() } = {}) {
  const refusals = [];

  // --- Step 1: the tag's shape ---
  const release = parseReleaseTag(tag);
  if (!release) {
    return {
      refusals: [
        `"${tag}" is not a release tag: expected <runtime|cli>-vX.Y.Z or ` +
          `<runtime|cli>-vX.Y.Z-<dev|beta|rc>.N`,
      ],
      summary: null,
    };
  }
  const repo = repositoryRoot(cwd);
  const core = release.core.join('.');

  // --- Step 2: the tag exists and is at the commit being checked ---
  const head = git(repo, ['rev-parse', 'HEAD^{commit}']);
  const tagged = git(repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  if (tagged === null) {
    refusals.push(`no tag "${tag}" exists in this repository`);
  } else if (tagged !== head) {
    refusals.push(
      `"${tag}" is at ${tagged.slice(0, 12)}, not at the commit being checked (HEAD ${head.slice(0, 12)})`,
    );
  }

  // --- Step 3: the tag's core equals the component's committed files ---
  const files = readComponentCore(repo, release.component, 'HEAD');
  refusals.push(...files.problems);
  if (files.core && compareCores(files.core, release.core) !== 0) {
    const file = release.component === 'cli' ? CLI_PACKAGE : `${LIBRARY_JSON}, ${CMAKE_LISTS} and ${VERSION_HEADER}`;
    refusals.push(`the tag's core is ${core}, but ${file} say${release.component === 'cli' ? 's' : ''} ${files.core.join('.')}`);
  }

  // --- Step 4: component-specific agreement ---
  let u8g2 = null;
  if (release.component === 'runtime') {
    u8g2 = checkU8g2Range(repo, refusals);
  } else {
    checkRuntimeStamp(repo, refusals);
  }

  // --- Step 5: a dev tag in a PATCH that already has a beta, rc or stable ---
  if (release.channel === 'dev') {
    const superseding = tagsInPatch(repo, release.component, release.core)
      .filter((t) => t.release.channel !== 'dev')
      .map((t) => t.name)
      .sort();
    if (superseding.length > 0) {
      refusals.push(
        `${release.component} ${core} already has ${superseding.join(', ')}, which supersede${superseding.length === 1 ? 's' : ''} ` +
          `its dev tags: new work targets the next PATCH (stop and ask before tagging here)`,
      );
    }
  }

  if (refusals.length > 0) return { refusals, summary: null };
  const built = u8g2 ? `, built against U8G2 ${u8g2.join('.')}` : '';
  return {
    refusals,
    summary: `${tag}: ${release.component} ${core}, channel ${release.channel}, at ${head.slice(0, 12)}${built}`,
  };
}

/** Refuse a runtime whose U8G2 is outside library.json's range; the U8G2 version, or null. */
function checkU8g2Range(repo, refusals) {
  const { library } = runtimeVersionFiles(repo, 'HEAD');
  const range = library?.dependencies?.[U8G2_DEPENDENCY];
  if (typeof range !== 'string') {
    refusals.push(`${LIBRARY_JSON} declares no "${U8G2_DEPENDENCY}" dependency`);
    return null;
  }
  const { version, problem } = u8g2VersionAt(repo, 'HEAD');
  if (problem) {
    refusals.push(problem);
    return null;
  }
  const admits = rangeAdmits(range, version);
  if (admits === null) {
    refusals.push(`${LIBRARY_JSON}'s "${U8G2_DEPENDENCY}" range "${range}" is not a form this check reads`);
  } else if (!admits) {
    refusals.push(
      `${U8G2_PATH} is U8G2 ${version.join('.')}, which ${LIBRARY_JSON}'s "${U8G2_DEPENDENCY}" range "${range}" does not admit`,
    );
  }
  return version;
}

/** Refuse a CLI whose stamped runtime version differs from the header. */
function checkRuntimeStamp(repo, refusals) {
  const header = headerVersion(fileAt(repo, 'HEAD', VERSION_HEADER));
  let stamp = null;
  try {
    const json = JSON.parse(fileAt(repo, 'HEAD', RUNTIME_STAMP) ?? 'null');
    stamp = json && [json.major, json.minor, json.patch].every(Number.isInteger)
      ? [json.major, json.minor, json.patch]
      : null;
  } catch {
    stamp = null;
  }
  if (header === null) {
    refusals.push(`${VERSION_HEADER} does not state the runtime version`);
  } else if (stamp === null) {
    refusals.push(`${RUNTIME_STAMP} has no major, minor and patch`);
  } else if (compareCores(stamp, header) !== 0) {
    const relation = compareCores(stamp, header) < 0 ? 'lags' : 'is ahead of';
    refusals.push(
      `${RUNTIME_STAMP} says runtime ${stamp.join('.')}, which ${relation} ${VERSION_HEADER}'s ` +
        `${header.join('.')} (run: cd cli && npm run build:runtime-version)`,
    );
  }
}

// ─── next ───────────────────────────────────────────────────────────────────

/**
 * The tag to create next at HEAD for one component and channel.
 *
 * The core is the files' at HEAD. Within that PATCH:
 * - `dev` is refused once a beta, rc or stable exists (rule 03's supersession);
 * - a pre-release is refused below a channel already tagged (no beta after an
 *   rc), and every channel is refused once the PATCH is stable;
 * - otherwise PRE_NUM is one more than the channel's highest.
 *
 * @param {string} component  `runtime` or `cli`
 * @param {string} channel    `dev`, `beta`, `rc` or `stable`
 * @param {{ cwd?: string }} [options]
 * @returns {{ tag: string | null, refusals: string[] }}
 */
export function nextTag(component, channel, { cwd = process.cwd() } = {}) {
  // --- Step 1: the core this PATCH is, from the committed files ---
  const repo = repositoryRoot(cwd);
  const { core, problems } = readComponentCore(repo, component, 'HEAD');
  if (!core) return { tag: null, refusals: problems };
  const version = core.join('.');
  const existing = tagsInPatch(repo, component, core);
  const names = (list) => list.map((t) => t.name).sort().join(', ');

  // --- Step 2: refusals from what the PATCH already has ---
  const stable = existing.filter((t) => t.release.channel === 'stable');
  if (stable.length > 0) {
    return {
      tag: null,
      refusals: [
        `${component} ${version} is already released as ${names(stable)}: ` +
          `new work targets the next PATCH, and its files must say so first`,
      ],
    };
  }
  if (channel === 'dev') {
    const superseding = existing.filter((t) => t.release.channel !== 'dev');
    if (superseding.length > 0) {
      return {
        tag: null,
        refusals: [
          `${component} ${version} already has ${names(superseding)}, so its dev tags are superseded: ` +
            `new work targets the next PATCH (stop and ask before tagging here)`,
        ],
      };
    }
  }
  const rank = CHANNELS.indexOf(channel);
  const higher = existing.filter((t) => CHANNELS.indexOf(t.release.channel) > rank);
  if (higher.length > 0) {
    return {
      tag: null,
      refusals: [`${component} ${version} already has ${names(higher)}, which outranks a ${channel} tag`],
    };
  }

  // --- Step 3: the next PRE_NUM within the channel ---
  const preNum = channel === 'stable'
    ? 0
    : 1 + Math.max(0, ...existing.filter((t) => t.release.channel === channel).map((t) => t.release.preNum));
  return { tag: formatReleaseTag({ component, core, channel, preNum }), refusals: [] };
}

// ─── Command line ───────────────────────────────────────────────────────────

const USAGE =
  'usage: node scripts/release-version.mjs check <tag>\n' +
  '       node scripts/release-version.mjs next <runtime|cli> <dev|beta|rc|stable>';

/** Print refusals and exit 1, or the result and exit 0. */
function report(subject, refusals, success) {
  if (refusals.length > 0) {
    console.error(`release-version: refused ${subject}:`);
    for (const r of refusals) console.error(`  - ${r}`);
    process.exit(1);
  }
  console.log(success);
}

/** Dispatch `check` or `next`; exit 2 on a usage error. */
function main(argv) {
  const [command, ...args] = argv;
  try {
    if (command === 'check' && args.length === 1) {
      const { refusals, summary } = checkTag(args[0]);
      report(args[0], refusals, `ok ${summary}`);
      return;
    }
    if (command === 'next' && args.length === 2 && COMPONENTS.includes(args[0]) && CHANNELS.includes(args[1])) {
      const { tag, refusals } = nextTag(args[0], args[1]);
      report(`a ${args[0]} ${args[1]} tag`, refusals, tag);
      return;
    }
  } catch (error) {
    console.error(`release-version: ${error.message}`);
    process.exit(2);
  }
  console.error(USAGE);
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
