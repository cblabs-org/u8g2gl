---
name: pkg-1-wo1-wo4
description: Work Orders 1–4 of PKG-1 — staging the designer and framework sources into the npm package, licences and README, the install smoke test and CI job, review and docs
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the four named here, do not push, do not
start other work, and **never publish to npm or create a tag**. Execute WO1 to WO4 in order.

**Parent project:** `pkg-1-npm-package` ([PROJECT.md](PROJECT.md)). Its status log records the
owner's approval (rule 00), including the owner decision to **ship `u8g2_fonts.c`**. Its rulings
are binding, especially ruling 2 (what is staged is what a build reads), ruling 7 (the smoke test
is the gate) and ruling 9 (the boundary). Build on what exists:
`cli/src/node/design/build/framework-sources.ts` (`locateFrameworkRoot()`,
`readFrameworkSources()`), `cli/src/node/design/static-files.ts` (`locateDesignerDist()`),
`cli/package.json` (`files`), `THIRD-PARTY-NOTICES.md`, `cli/LICENSES/`, and CI's `wasm-tests`
job (the pinned emsdk).

# Where you work

- Worktree `../U8G2GL-pkg1`, starting on `u8g2gl-pkg1/wo1-staging` (the submodule is checked
  out). Each later WO: `git checkout -b u8g2gl-pkg1/woN-<name>` from the previous tip. Verify
  the branch before every commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
  Download no toolchain or anything else. The smoke test's install uses the local tarball only
  (`npm install --offline` or an equivalent with no registry access).
- Record baselines first, suites one at a time.
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles, no home-folder paths in committed files or in the packed tarball (the guard and the
  smoke test must pass), and never the owner's email address in anything, including
  `package.json`.
- Never open a browser window on the owner's desktop: `design --no-open`, Playwright headless.
- **Stop and report** (to the PA, at the end of this file, then end your turn) if a generator
  golden would move, if staging needs a change to the runtime, generator, schema or designer
  source, or if the work needs anything outside ruling 9's boundary or a new dependency.

# WO1 — staging and lookups (`u8g2gl-pkg1/wo1-staging`)

- [ ] `cli/scripts/stage-package.mjs` (ruling 3) as `prepack`: refuse on a dirty tree or a
      wrong Emscripten version with a clear message; build the framework editor Wasm, the
      designer (production) and the CLI; stage `designer/` and `framework/` (ruling 1, with
      `u8g2_fonts.c`); write the stamp (CLI version, commit). `postpack` removes the staged
      directories; both are git-ignored. Drop the redundant `src/data/*` entries from `files`.
- [ ] The framework file set comes from `readFrameworkSources()` and the header directories it
      names (ruling 2). Tests: the staged set equals the parser's set, and a compile of every
      unit from a staged copy alone succeeds (Emscripten test, skipping with the existing
      message).
- [ ] Ruling 4: both lookups prefer the package's staged copy when its stamp matches the CLI
      version, then fall back to the source tree as today. Unit tests for: staged and matching;
      staged and mismatched (ignored, with a reason a test can see); checkout only (unchanged).
      `no-source-tree`'s message no longer blames npm.

# WO2 — licences and README (`u8g2gl-pkg1/wo2-licences`)

- [ ] Ruling 5: `LICENSES/u8g2-BSD-2-Clause.txt` from `extern/u8g2/LICENSE`; the notices gain
      the designer bundle's production dependencies with their licences and Monaco's own
      notices; a test fails when a `designer/` production dependency has no notice.
      `package.json` `author` is a name only.
- [ ] Ruling 6: `cli/README.md` as the npm page.

# WO3 — the smoke test and CI (`u8g2gl-pkg1/wo3-smoke-ci`)

- [ ] `scripts/check-package.mjs` (ruling 7): pack, install the tarball into an empty
      directory with no registry access, and on a copy of the departures fixture check
      `validate`, `generate`, `design --no-open` serving the real designer at `/`, an
      `editor-wasm` build **succeeding**, a `test-run` **succeeding**, and the tarball's file
      list inside ruling 1's allowlist and free of home paths. Print the tarball and unpacked
      sizes.
- [ ] A CI `package` job on Linux with the pinned emsdk as `wasm-tests` has it, running the
      script.
- [ ] CLI 0.15.1 (ruling 8), confirming no golden moved.

# WO4 — review and docs (`u8g2gl-pkg1/wo4-readability`)

- [ ] Spawn the `readability-reviewer` on PKG-1's diff against `75afa49`. Resolve P1–P3;
      decide each P4 with a reason.
- [ ] Docs: `docs/implementation_plan.md`'s release channel (built, not yet published),
      `design_spec.md`'s licence table.
- [ ] Final run of every suite, one at a time:
  - guard;
  - CLI build, lint, tsc, vitest (with Emscripten);
  - goldens;
  - C++ (`cmake -S . -B build/v`, `ctest`);
  - Wasm and its node tests;
  - the Emscripten CLI tests;
  - designer unit; `build:e2e` and e2e; production and its no-hook grep;
  - `scripts/check-package.mjs`.

  Then a completion report at the end of this file, with the sizes, the tarball file count,
  and **the exact publish and tag commands for the owner to run** (no agent runs them).

---

# Completion report (Tier-3 worker, 2026-11-01/02)

**Status: WO1 to WO4 complete.** No stop condition fired: no golden moved, and nothing in the runtime, generator, schema or designer source changed (`git diff 75afa49 -- designer include src wasm test/generated_fixture` is empty). No new dependency. Nothing pushed, published or tagged.

## Branches and commits (each based on the previous tip)

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-pkg1/wo1-staging` | `6a1453f` feat(pkg): stage the designer and framework into the npm package |
| WO2 | `u8g2gl-pkg1/wo2-licences` | `58a0064` docs(pkg): licences, notices and the npm README |
| WO3 | `u8g2gl-pkg1/wo3-smoke-ci` | `f4a1f26` test(pkg): the install smoke test, its CI job, CLI 0.15.1 |
| WO4 | `u8g2gl-pkg1/wo4-readability` | `27dd939` docs(pkg): readability review resolved; release channel and licence table, plus this report |

## What was built

- **Stager** `cli/scripts/stage-package.mjs`, run as `prepack` and as `postpack --clean`. It refuses on a dirty tree, a missing submodule, an emcc that is not the pinned 5.0.3 (the pin is read from `toolchain-paths.ts`), or missing designer dependencies. It then builds the framework editor Wasm in a freshly emptied `build/package-wasm`, the production designer (refusing if the Wasm is missing or the build is the e2e one), and the CLI. It stages `cli/designer/`, `cli/framework/` and a copy of `THIRD-PARTY-NOTICES.md`, stamps each staged directory with `STAMP.json` (`{version, commit}`), and re-checks that the tree is still clean. Its output goes to stderr, so `npm pack --json` stays parseable. Everything it stages is git-ignored.
- **File set** `frameworkFiles()` in `framework-sources.ts` (ruling 2). It is the two CMake files, every source `readFrameworkSources()` names, every header in the include directories it names (searched recursively), and the headers beside each source. `stageFramework()` copies exactly that set plus `extern/u8g2/LICENSE`. `compile-units.ts`'s cache key now uses the same function (see deviations).
- **Lookups** (ruling 4): `package-copy.ts` holds the stamp contract and `locateStagedCopy()` (`staged` / `absent` / `ignored` with a reason). `locateFrameworkRoot()` and `locateDesignerDist()` prefer a matching staged copy, then fall back to `locateSourceTree()`, which is the old walk-up, unchanged. The `no-source-tree` code is unchanged; its message now reads "no U8G2GL framework sources: none staged in this package, and no source tree beside the CLI …".
- **Licences** (ruling 5): `LICENSES/u8g2-BSD-2-Clause.txt`, plus React, dockview, Monaco (MIT and its ThirdPartyNotices, verbatim), marked and DOMPurify (taken as Apache-2.0). These are named in a new "The designer bundle" table in `THIRD-PARTY-NOTICES.md`, and the U8G2 and Emscripten rows are updated. `notices.test.ts` checks that the table equals the designer lock file's production tree (`@types/*` exempt), that each version matches, that each named licence file exists, that every `LICENSES/` file is mentioned, that the U8G2 copy is byte-identical to the submodule's, and that `author` carries no address. `author` is `"Matt McNeill (CB Labs)"`.
- **README** `cli/README.md` (ruling 6). It has no home paths.
- **Smoke test** `scripts/check-package.mjs` (ruling 7). It packs, installs offline with the registry pointed at a closed port, and asserts that the installed CLI sees no source tree and chose its own staged copies. It holds the tarball to the allowlist (U8G2 C files must equal `WASM_U8G2_C_SOURCES` exactly) and scans every file for home paths, the owner's username, and the owner's address (by SHA-256; the address itself is not in the repo). Then, on a copy of the departures fixture with the CLI's HOME inside the work directory, it runs `validate`, `generate` and `design --no-open --json`, and checks that `/` redirects to the real designer, that the framework Wasm is served, and that `editor-wasm` and `test-run` (screen `departures`) both succeed. It prints the sizes. It also runs as the CI `package` job (Linux, the pinned emsdk exactly as `wasm-tests`, the runner's Node 22 first on PATH).
- **Version:** CLI 0.15.1 (`package.json` and the lock file root). Runtime and schema are unchanged. No golden moved.

## Package (CLI 0.15.1, from `27dd939`)

- Tarball **15.2 MB** (15,205,633 bytes); unpacked **54.2 MB** (54,184,349 bytes); **751 files**: 640 in `dist/`, 11 in `designer/`, 87 in `framework/` (86 plus the stamp), and the rest are `LICENSES/`, the README, the notices, `LICENSE` and `package.json`.

## Suites (final run on the WO4 tip, one at a time, Emscripten 5.0.3)

| Suite | Result |
|---|---|
| Guard (self-test, tree) | 11/11; clean |
| CLI build, lint, tsc | Clean |
| CLI vitest, with Emscripten | **125 files, 2631 tests passed** (baseline 122/2611). One earlier full run had a single failure in `test/integration/generate-editor.test.ts` ("is up to date under --check…"). It passed alone and on the next full run, and is not touched by PKG-1. |
| Goldens (`test/generator`) | 18 files, 272 tests passed; no `expected/` file changed |
| C++ (`cmake -S . -B build/v`, `ctest`) | 512/512 passed (1 skipped: `SizeOfReport.ThirtyTwoBitTarget`, a test the suite already skips); 0 warnings |
| Wasm and its node tests | snapshot, placeholder, last-error passed |
| Emscripten CLI tests (`build`, `test-run`, `toolchain`) | 9 files, 92 tests passed, none skipped |
| Designer unit | 136/137 passed; the one failure (`test-run.test.ts:227`, a PAUSE_MS timing test) passed on rerun (9/9) |
| Designer `build:e2e` and e2e | Built. 72/75 passed; the 3 failures are all the CPU-throttled latency gates (see below) |
| Designer production build, no-hook grep, `test:e2e:production` | Built; no hook; 3/3 passed |
| `scripts/check-package.mjs` | **PASS** |

**The e2e latency gates are environmental, not PKG-1.** The failures were `drag-performance.spec.ts:189`, `performance.spec.ts:168`, and one of the two gate self-tests (which one differed between runs). They failed in a run where the machine's load average was 9 to 17 (other sessions) and one spec took an hour. A rerun failed a different combination. PKG-1 changes no designer file (`git diff 75afa49 -- designer` is empty), and CI runs these gates report-only. They should be re-checked on a quiet machine before relying on them.

## Deviations and decisions, for the PA

1. **The framework set is ruling 2's mechanism, not ruling 1's literal list.** The difference is small, and the result is a subset of ruling 1 except for one header:
   - `extern/u8g2/cppsrc/MUIU8g2.h` **ships**. It sits in a header directory the builds search; it is about 2 KB and not compiled.
   - `cppsrc/U8g2lib.cpp` and `U8x8lib.cpp` do **not** ship, because no build compiles them.
   - Also not shipped: `test/editor_host/editor_host.cpp` (not compiled), `include/u8g2gl/manifests/*.xml` (the CLI reads `dist/data/manifests.json`), and `wasm/test/` and `wasm/u8g2gl_editor.mjs`.
   - The smoke test's allowlist names `MUIU8g2.h` explicitly, with this reason beside it.
   - The compile-from-copy test shows the set is sufficient.
2. **The build cache key now uses `frameworkFiles()`** (`compile-units.ts`). It previously missed `src/u8g2gl_internal.h` and the CMake files, so editing either reused stale objects in a checkout. Existing caches are not reused once, which is harmless.
3. **`THIRD-PARTY-NOTICES.md` is staged into the package at prepack**, not committed as a second copy. It is git-ignored in `cli/`, and listed in `files`.
4. **`package-licence.test.ts` now packs with `--ignore-scripts`.** Otherwise its `npm pack --dry-run` would trigger the full prepack build inside the unit suite. The staged entries are allowed to be absent there; the smoke test covers the real pack.
5. **The README quotes the consent prompt's real size**, "about 1.3 GB installed, about 2 GB once in use" (`INSTALLED_SIZE`), rather than ruling 6's "about 1.6 GB". `u8g2gl --help` says "about 1.6 GB" (`cli.ts:214`). That inconsistency predates PKG-1 and is left for a follow-up.
6. **Out of boundary, not changed:** the designer's own Run-unavailable reason (`designer/src/test-run/verdict.ts:177`) still says "(an npm install)" for `no-source-tree`. It is designer source (ruling 9 excludes it). It needs a one-line follow-up.
7. **A stamp's `commit` is provenance only**; the version is the trust key, as ruling 4 says. A same-version leftover from an interrupted pack would be preferred in a checkout until the next pack removes it. This is documented in `package-copy.ts`.

## Readability review (WO4)

The `readability-reviewer` reported P1 0, P2 0, P3 3 and P4 4. All three P3s were resolved:
- why-comments at both lookups on why an ignored copy's reason is not surfaced;
- `@throws` on `writePackageStamp`;
- the stamp's commit documented as provenance.

P4s:
- cache-key note: done;
- `startDesign` settle guard and comment: done;
- `STAGED` doc: done;
- `stageFramework` `@pre`: declined, because its TSDoc already states the precondition and its only caller removes the old copy first.

## For the owner: publish and tag (no agent runs these)

After the PR is merged with a merge commit (rule 04), on a clean checkout of `main` with the submodule checked out:

```sh
git submodule update --init --checkout extern/u8g2
(cd cli && npm ci) && (cd designer && npm ci)
source ~/path/to/emsdk/emsdk_env.sh        # Emscripten 5.0.3
node scripts/check-package.mjs             # must end in PASS
cd cli && npm publish                      # prepack rebuilds and stages; postpack cleans
cd .. && git tag -a cli-v0.15.1 -m "u8g2gl CLI 0.15.1 (npm)" && git push origin cli-v0.15.1
```

`npm publish --dry-run` first will show the same file list. The tag name `cli-v0.15.1` is a suggestion: there is no release-tag convention yet, and the prefix keeps it distinct from the runtime's versions (rule 03).
