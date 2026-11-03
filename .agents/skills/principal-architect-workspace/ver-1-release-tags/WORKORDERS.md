---
name: ver-1-wo1-wo4
description: Work Orders 1–4 of VER-1 — the foundation's SemVer channel model for U8G2GL's runtime and CLI, the tag check, the CLI packing as its tag, the PATCH-aware runtime floor, RELEASING.md and the ChangeLog
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the four named here, do not push any
branch or tag, do not start other work, and **never publish to npm**. Execute WO1 to WO4 in
order.

**Parent project:** `ver-1-release-tags` ([PROJECT.md](PROJECT.md), revision 3). Its status log
records the owner's approval (rule 00). Its rulings are binding, especially ruling 4 (the core in
files, the channel in the tag), ruling 9 (the floor) and ruling 13 (the boundary).
`RECOMMENDATION.md` and `VERSIONING-OPTIONS.md` beside it are the reasoning. The model is
`esp32-app-foundation`'s `docs/developer/versioning-policy.md` (in
`~/Documents/Projects/esp32-app-foundation`, read only).

Build on what exists:
- `cli/scripts/stage-package.mjs` and `scripts/check-package.mjs` (PKG-1);
- `cli/src/node/generator-version.ts`, `cli/src/node/build-runtime-version.ts`,
  `cli/src/data/runtime-version.json`;
- `include/u8g2gl/u8g2gl_version.h` (`U8G2GL_REQUIRE_RUNTIME_VERSION`);
- `cli/src/core/generator/emit/generated-config.ts` (the floor emission);
- the top-level `CMakeLists.txt` version agreement;
- CI's `determinism-check` job.

# Where you work

- Worktree `../U8G2GL-ver1`, starting on `u8g2gl-ver1/wo1-scheme`, with the submodule checked
  out. Each later WO: `git checkout -b u8g2gl-ver1/woN-<name>` from the previous tip. Verify the
  branch before every commit. Commit as you go; **push nothing**. Scratch in `tmp/`.
- Tags you create for tests are created in throwaway repositories under `tmp/`, never in this
  repository. Create no tag in this repository at all.
- Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
  Download nothing.
- Record baselines first, suites one at a time (the machine is often heavily loaded by other
  sessions; a timeout that passes when its file runs alone is load, and you say so).
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles, no home-folder paths in committed files (the guard must pass), and never the owner's
  email address in anything.
- Never open a browser window on the owner's desktop.
- **Stop and report** (to the PA, at the end of this file, then end your turn) if:
  - a golden moves for any reason other than ruling 9's floor line;
  - the work needs a schema change;
  - the work needs anything outside ruling 13's boundary, or a new dependency.

# WO1 — the scheme and the check (`u8g2gl-ver1/wo1-scheme`)

- [ ] Rule 03 rewritten (rulings 1–4, 7, 12): the two components, the tag format, the tiers and
      who tags each, PATCH per merged PR, the core in files and the channel in the tag, npm
      channels, and the U8G2 affiliation. Keep the compatibility rule, the determinism rule and
      "a runtime bump forces a CLI patch bump", updated for PATCH. Rule 04 restated for tags
      (ruling 10), with the ban kept.
- [ ] `scripts/release-version.mjs`, ruling 6:
  - `check <tag>`, with every listed refusal, plus ruling 12's U8G2-range check for a runtime
    tag;
  - `next <component> <channel>`.

  Both work from git and the files only, with no network access.
- [ ] Tests for every refusal, an accepted tag per component and channel, `next` across a
      supersession (a beta exists, so `dev` is refused), in throwaway repositories.

# WO2 — the channel from the tag (`u8g2gl-ver1/wo2-channel`)

- [ ] Ruling 5: `stage-package.mjs` requires a `cli-v*` tag at HEAD whose core matches
      `cli/package.json`. It writes the full version into the packed `package.json`, `postpack`
      restores the file, and with no tag it refuses, printing the command. Keep PKG-1's other
      refusals.
- [ ] `check-package.mjs` asserts the installed CLI reports the tag's full version, and that a
      `generate` stamps it. Since it packs, it needs a tag at HEAD: run it against a throwaway
      clone in `tmp/` carrying a local tag, never by tagging this repository.
- [ ] Ruling 8: `.github/workflows/release-tag.yml` for `runtime-v*` and `cli-v*` (check, plus
      the package check for `cli-v*`), with the pinned emsdk as `ci.yml`'s `package` job has
      it. It publishes nothing.
- [ ] A test that `generate` with CLI version `0.16.0-beta.1` succeeds and stamps it.

# WO3 — the PATCH-aware floor (`u8g2gl-ver1/wo3-floor`)

- [ ] Ruling 9: `U8G2GL_REQUIRE_RUNTIME_AT_LEAST(major, minor, patch)` in `u8g2gl_version.h`,
      with Doxygen and a refusal message naming both versions. The old macro is kept and
      documented as the form older generated code uses.
- [ ] The generator emits the new macro with the stamped PATCH. C++ tests:
  - a runtime one PATCH short is refused;
  - an equal or newer runtime compiles;
  - the old macro still compiles.

  Add a compile-fail test in the style of the existing ones.
- [ ] Runtime **0.11.1** in all three files, the stamp regenerated, CLI **0.15.2**. The goldens
      move by the floor line only: show that as a diff summary in the report.

# WO4 — docs, review, verification (`u8g2gl-ver1/wo4-docs`)

- [ ] `docs/RELEASING.md` (ruling 11), including the commands for the first pre-releases,
      `runtime-v0.11.1-beta.1` and `cli-v0.15.2-beta.1`, and for promotion to stable.
- [ ] The root `ChangeLog` (ruling 12), with an open `v0.11.xx` runtime entry and a `v0.15.xx`
      CLI entry. No email in it: entries name the project, not a person's address.
- [ ] `docs/implementation_plan.md`'s release-channel line.
- [ ] Spawn the `readability-reviewer` on VER-1's diff against `7adf628`. Resolve P1–P3;
      decide each P4 with a reason.
- [ ] Final run of every suite, one at a time:
  - guard;
  - CLI build, lint, tsc, vitest (with Emscripten);
  - goldens;
  - C++ (`cmake -S . -B build/v`, `ctest`);
  - Wasm and its node tests;
  - the Emscripten CLI tests;
  - designer unit;
  - `release-version.mjs` tests;
  - `check-package.mjs` against a tagged throwaway clone.

  Then a completion report at the end of this file, ending with the owner's exact tag and
  publish commands from `RELEASING.md`.

# Completion report (Tier-3 worker, 2026-11-03)

**Status: WO1 to WO4 done. No stop condition fired.** Authorization checked
from committed artifacts: this file names `ver-1-release-tags`, and its
`PROJECT.md` status log records the owner's "Approved, proceed" for revision 3.
Nothing pushed, no tag created in this repository (`git tag --list 'cli-v*'
'runtime-v*'` is empty), nothing published, no schema change, no new dependency.

## Branches and commits (stacked, each from the previous tip, base `7adf628`)

| Branch | Tip | Commits |
|---|---|---|
| `u8g2gl-ver1/wo1-scheme` | `83b8c6b` | Rule 03 rewritten, rule 04 restated for tags; `scripts/release-version.mjs` (`check`, `next`) and its tests |
| `u8g2gl-ver1/wo2-channel` | `d52a044` | `66a78e5` the CLI packs as its tag, `check-package.mjs` asserts the version, `release-tag.yml`, the pre-release `generate` test; `d52a044` depth-1 fetch for the throwaway clone |
| `u8g2gl-ver1/wo3-floor` | `9f9a340` | `U8G2GL_REQUIRE_RUNTIME_AT_LEAST`, the generator emits it, C++ tests; runtime 0.11.1, CLI 0.15.2 |
| `u8g2gl-ver1/wo4-docs` | this commit | `dcd9d49` `docs/RELEASING.md`, `ChangeLog`, implementation-plan line; `af07222` review findings; this report |

## Final suites (one at a time, `u8g2gl-ver1/wo4-docs`)

| Suite | Result |
|---|---|
| Home-path guard (self-test, then tree) | 11/11 cases; no paths |
| CLI build, lint, `tsc --noEmit` | clean |
| CLI vitest, Emscripten 5.0.3 on PATH | 126 files, 2635 tests, all pass (baseline 2631; +3 pre-release, +1 floor) |
| Goldens (`refresh-goldens.mjs` on the final tree) | no diff |
| C++ (`cmake -S . -B build/v`, fresh; `ctest`) | 515/515 pass, 1 skipped (`SizeOfReport.ThirtyTwoBitTarget`, as at baseline); 0 warnings |
| Wasm build + snapshot, placeholder, last-error | all pass |
| Emscripten CLI tests (ci.yml's set) | 9 files, 92 tests; none skipped |
| Designer unit | 137 pass |
| `node --test scripts/release-version.test.mjs` | 37/37 |
| `check-package.mjs`, throwaway clone tagged `cli-v0.15.2-dev.1` | PASS: installed CLI reports `0.15.2-dev.1`, `generate` stamps it, designer, editor-wasm and test-run all succeed; 751 files, 15.2 MB |

Load: the baseline vitest run (before any change) had one failure,
`test/project-fs/served.test.ts > watch > reports one external save as exactly
one event` (1000 ms timeout). It passed when its file ran alone (41/41), and
every later full run passed, so it was load from other sessions.

## Golden diff summary (WO3)

Two goldens move, identically, and only inside the §16 runtime-floor guard
block: `cli/test/generator/fixtures/emit-project/expected/u8g2gl_generated_config.h`
and `test/generated_fixture/generated/u8g2gl_generated_config.h`, 5 lines out
and 6 in each:

```diff
-// built beside (§16). A floor, not an equality: a newer runtime minor is fine.
+// built beside (§16). A floor, not an equality: a newer runtime is fine. The
+// patch is compared too, because new runtime API can arrive in a patch.
-#ifndef U8G2GL_REQUIRE_RUNTIME_VERSION
-#error "This code requires u8g2gl runtime 0.11 or newer, but the runtime in use predates the runtime version check. ..."
+#ifndef U8G2GL_REQUIRE_RUNTIME_AT_LEAST
+#error "This code requires u8g2gl runtime 0.11.1 or newer, but the runtime in use predates this runtime version check. ..."
-U8G2GL_REQUIRE_RUNTIME_VERSION(0, 11);
+U8G2GL_REQUIRE_RUNTIME_AT_LEAST(0, 11, 1);
```

The comment and the `#error`'s "the" → "this" are part of the floor block, and
both are needed for it to stay true: a 0.11.0 runtime has *a* version check,
just not this one. No other generated byte moved. The determinism condition
holds: goldens moved with no fixture input change, and CLI 0.15.1 → 0.15.2.

## Deviations and decisions, for the PA

1. **Ruling 7's npm command changes form: publish the tarball, not the
   directory.** I found this while building ruling 5, and checked it in npm
   11.19's source and with a dry run. `npm publish` re-reads `package.json`
   *after* `postpack` has restored it, so a directory publish would register
   `0.15.2` for a tarball whose `package.json` says `0.15.2-beta.1`. The beta
   would then take the stable version, and the stable could never be
   published. `npm publish <tarball>` reads the version from inside the
   tarball and runs no scripts. So `stage-package.mjs` refuses under
   `npm_command=publish`, and `RELEASING.md` says `npm pack`, then
   `npm publish <tarball> --tag beta`. The tarball's file name is the core
   (`u8g2gl-0.15.2.tgz`), because npm names it before `prepack`; its contents
   carry the full version. Ruling 5 itself is unchanged.
2. **Ruling 5 versus ruling 8's "`ci.yml` unchanged".** `ci.yml`'s `package`
   job packs an untagged HEAD, which ruling 5 makes `prepack` refuse. Without
   a change it would fail on every PR. `check-package.mjs` therefore packs a
   throwaway clone of HEAD under its work directory, tagged there
   `cli-v<core>-dev.1`, whenever HEAD has no `cli-v*` tag. This is the same
   mechanism WO2 asks for locally. Nothing is downloaded: HEAD comes at depth 1
   from the checkout, U8G2 from the local submodule, and the dependencies are
   copied. With a tag at HEAD (the release workflow) it packs in place.
   `ci.yml` is unchanged.
3. **`release-version.mjs` is a little stricter than ruling 6 lists:**
   - `check` refuses a CLI stamp *ahead of* the header as well as one that lags;
   - `next` refuses a channel below one already tagged (no beta after an rc),
     and refuses every channel once the PATCH is stable.
   It reads files from the commit (`git show`), never the working tree.
4. **Rule 03 gained a case the rulings imply but do not state:** a fix to an
   unpromoted beta keeps its PATCH and becomes `-beta.2`, as ruling 2's table
   has it. The exception is a fix that changes generated output, where the
   determinism check forces a new CLI PATCH.
5. **`release-tag.yml` also runs the release-version tests.** With `ci.yml`
   unchanged, nothing else in CI runs them. Adding them to `ci.yml` would be a
   good follow-up, and is the owner's or PA's call.
6. **`cli/package-lock.json`'s own version moved with `cli/package.json`**, as
   at every previous bump (`f4a1f26`).
7. **Readability review:** P1 1, P2 0, P3 3, P4 5, all resolved in `af07222`
   except one P4. That one asked `git()` to stop collapsing failures to null,
   so a broken `git tag --list` reads as "no tags". I declined it: it is a
   behaviour change, and any repository where it could fail has already failed
   `repositoryRoot()`. One P4 was a real improvement: one exported
   `releaseTagsAtHead()` now serves both `prepack` and the package check, so
   they cannot disagree about which tag is packed.

## Observations outside the boundary (not changed)

- **`docs/design_spec.md` §16 still names `U8G2GL_REQUIRE_RUNTIME_VERSION(major,
  minor)` as the runtime guard.** The u8g2gl-standards skill's §4 says the same
  in its runtime-version coupling note. Both are now stale, and the spec is
  normative. They need a PA follow-up.
- `test/xtensa/*/u8g2gl_generated_config.h` are committed corpora that use the
  old macro. They still compile against 0.11.1, which is the backward-compat
  case working.
- `cli/test/fixtures/departures-project/generated/` is stamped CLI 0.13.1 and
  carries no floor at all. That predates VER-1, and nothing compares it.
- This worktree's repository is **shallow**. The tag check and `next` need no
  history; only the clone's fetch did, and it now fetches at depth 1.
- The foundation pin `82ec83f` already carries the owner's
  `v0.7.0-integration`. I checked a throwaway clone tagged
  `runtime-v0.7.0-dev.1` there, and `check` accepts it (runtime 0.7.0, U8G2
  2.36.18). `RELEASING.md` gives the commands. Adding it does not touch the
  owner's tag.
- The worktree had no `node_modules`. They were installed with
  `npm ci --offline` from the local npm cache; nothing was downloaded.

## The owner's commands (from `docs/RELEASING.md`), after VER-1 merges

```bash
git checkout main && git pull --ff-only
git submodule update --init --checkout extern/u8g2

node scripts/release-version.mjs next runtime beta    # runtime-v0.11.1-beta.1
git tag -a runtime-v0.11.1-beta.1 -m "runtime 0.11.1-beta.1"
node scripts/release-version.mjs check runtime-v0.11.1-beta.1

node scripts/release-version.mjs next cli beta        # cli-v0.15.2-beta.1
git tag -a cli-v0.15.2-beta.1 -m "cli 0.15.2-beta.1"
node scripts/release-version.mjs check cli-v0.15.2-beta.1

git push origin runtime-v0.11.1-beta.1 cli-v0.15.2-beta.1
# wait for both "Release tag" workflow runs to go green

# pinned Emscripten 5.0.3 active
node scripts/check-package.mjs
mkdir -p tmp/release
(cd cli && npm pack --pack-destination ../tmp/release)
tar -xOzf tmp/release/u8g2gl-0.15.2.tgz package/package.json | grep '"version"'   # "0.15.2-beta.1"
npm publish tmp/release/u8g2gl-0.15.2.tgz --tag beta
npm view u8g2gl dist-tags
```

Promotion to stable, once validated:

```bash
git checkout --detach cli-v0.15.2-beta.1      # the same commit as runtime-v0.11.1-beta.1
git submodule update --checkout extern/u8g2
git tag -a runtime-v0.11.1 -m "runtime 0.11.1"
node scripts/release-version.mjs check runtime-v0.11.1
git tag -a cli-v0.15.2 -m "cli 0.15.2"
node scripts/release-version.mjs check cli-v0.15.2
git push origin runtime-v0.11.1 cli-v0.15.2
node scripts/check-package.mjs
rm -rf tmp/release && mkdir -p tmp/release
(cd cli && npm pack --pack-destination ../tmp/release)
npm publish tmp/release/u8g2gl-0.15.2.tgz
npm view u8g2gl dist-tags
git checkout main
```
