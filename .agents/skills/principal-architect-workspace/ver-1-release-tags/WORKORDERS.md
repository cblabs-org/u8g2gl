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
