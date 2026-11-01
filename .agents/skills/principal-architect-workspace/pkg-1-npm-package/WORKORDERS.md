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
