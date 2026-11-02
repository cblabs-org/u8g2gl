# PKG-1: The npm Package

**Status: APPROVED (2026-11-01), in progress.**

**Parent:** the release channel in `docs/implementation_plan.md` (*npm, `npx u8g2gl`, for
release*), made urgent by E-1 to E-2T. The served designer exists, but only inside a source
checkout. **Base:** `main` @ `75afa49` (E-2T merged). **Worktree:** `../U8G2GL-pkg1`.

## Purpose

Today `npm pack` of `cli/` ships the CLI alone. The PA built the 0.15.0 tarball from main,
installed it in an empty directory and ran it:

| Command | Result |
|---|---|
| `u8g2gl validate`, `generate` | Work |
| `u8g2gl design` | Serves a "no designer" placeholder page: the designer is not in the package |
| The project editor Wasm build (so project widgets, and Run) | Fails `no-source-tree`: the runtime, bridge, harness and U8G2 sources are not in the package |

Both lookups (`locateFrameworkRoot()`, `locateDesignerDist()`) walk up from the CLI to a
U8G2GL source tree, which only a checkout has. PKG-1 makes the installed package do everything
the checkout does. Publishing stays the owner's (rule 03).

## Decomposition

| WO | Topic | Branch |
|---|---|---|
| WO1 | Staging: build and stage the designer and the framework sources into the package; the lookups find them | `u8g2gl-pkg1/wo1-staging` |
| WO2 | Licences, notices and the package README | `u8g2gl-pkg1/wo2-licences` |
| WO3 | The install smoke test, locally and as a CI job; size report; CLI 0.15.1 | `u8g2gl-pkg1/wo3-smoke-ci` |
| WO4 | Readability review, docs, PA verification | `u8g2gl-pkg1/wo4-readability` |

One worker, in order, one PR.

## PA rulings

1. **The package ships everything a design session reads.**
   - The CLI (`dist/`).
   - **`designer/`**: the production designer build, with the framework editor Wasm it bundles.
   - **`framework/`**: the framework sources in their repository layout, so
     `readFrameworkSources()` parses them unchanged. That is:
     - the top-level `CMakeLists.txt`;
     - `include/` and `src/`;
     - `wasm/`'s sources, headers and `CMakeLists.txt`;
     - `test/editor_host/` and `test/real_u8g2/`;
     - from `extern/u8g2/`: `LICENSE`, `cppsrc/U8g2lib.*` and `U8x8lib.*`, `csrc/*.h`, and
       exactly the C files `WASM_U8G2_C_SOURCES` names (including `u8g2_fonts.c`, per the owner decision).
   - `LICENSES/`, `THIRD-PARTY-NOTICES.md`, `LICENSE` and a `README.md`.
   - Nothing else. No tests or fixtures, no `.agents/`, no docs beyond the README. The
     redundant `src/data/*` entries go from `files`, since `dist/data/` already carries them.
2. **What is staged is what a build reads.** The stager names the framework's files with
   `readFrameworkSources()` itself, plus the header directories it names, so the package can
   neither miss a source a build compiles nor carry one it doesn't. A test checks that the
   staged set equals the parser's, and that a compile of every unit from a staged copy alone
   succeeds.
3. **The stager builds what it ships.** A `prepack` script, `cli/scripts/stage-package.mjs`,
   refuses unless:
   - the tree is clean at HEAD;
   - Emscripten is the pinned version.

   Then it builds the framework editor Wasm, the designer (production) and the CLI, and
   stages them in that order. A `postpack` step removes the staged directories, which are
   git-ignored. Nothing stale can be packed, because nothing is reused from an earlier build.
   The staged copy carries a stamp: the CLI version and the commit.
4. **The lookups prefer the package.** `locateFrameworkRoot()` and `locateDesignerDist()` first
   look in the CLI's own package (`framework/`, `designer/`), accepting them only when the
   stamp's version matches the CLI's. Then they look for the source tree as now. A checkout
   with no staged copy behaves exactly as today. The `no-source-tree` code keeps its meaning,
   and its message no longer blames npm.
5. **Licences travel with the code.**
   - U8G2's `LICENSE`, which carries its font terms, goes to `LICENSES/u8g2-BSD-2-Clause.txt`.
   - `THIRD-PARTY-NOTICES.md` gains the designer bundle's production dependencies: React,
     react-dom, dockview-react and monaco-editor, with Monaco's own notices.
   - A test checks that every production dependency of `designer/` has a notice, so a new one
     cannot ship unannounced.
   - **No owner email** anywhere in the package (`package.json` `author` by name only).
6. **The README** is the npm page:
   - what U8G2GL is;
   - `npx u8g2gl generate`, `validate` and `design`;
   - the toolchain consent prompt and its size (about 1.6 GB);
   - that the runtime itself comes through PlatformIO (`library.json`), not npm;
   - the runtime-floor rule in one line.

   It contains no home paths.
7. **The smoke test is the gate.** `scripts/check-package.mjs` packs, installs the tarball
   into an empty directory with no registry access (the CLI has no runtime dependencies), and
   on a copy of the departures fixture checks:
   - `validate` and `generate` succeed;
   - `design --no-open` serves the designer at `/`, not the placeholder;
   - an `editor-wasm` build **succeeds**;
   - a `test-run` **succeeds**;
   - the tarball's file list is inside ruling 1's allowlist and free of home paths.

   It runs locally on macOS and as a new CI `package` job on Linux, with the pinned emsdk as
   `wasm-tests` has it. The tarball and unpacked sizes are reported in the job log and the
   completion report.
8. **Versions:** CLI 0.15.1, a patch bump because the generator's output does not change, so
   no golden moves. The runtime and schema are unchanged. **Publishing and tagging are the
   owner's:** the completion report ends with the exact commands, which no agent runs.
9. **Boundary:**
   - `cli/` (`package.json`, the two lookups, the stage script, README, LICENSES, tests);
   - `scripts/`;
   - `.github/workflows/ci.yml` (the `package` job);
   - `THIRD-PARTY-NOTICES.md`;
   - `.gitignore`;
   - docs (`implementation_plan.md` §release channel, `design_spec.md`'s licence table);
   - the designer's build config **only** if staging needs it.

   Excluded: nothing in the runtime, generator, schema or designer source; no new dependency.

## Owner decision needed

**The U8G2 font file.** A build compiles `csrc/u8g2_fonts.c` (39.7 MB of C source), because
built-in fonts are its symbols. The package therefore either carries it or fetches it.
- **(a) Recommended: ship it.** The tarball is about 13 MB and the install about 45 MB,
  against a 1.6 GB toolchain the same session already needs. It works offline, it is the exact
  file the checkout builds, and U8G2's licence travels with it.
- **(b) Fetch U8G2 at the pinned commit on first `design`,** with consent, as the toolchain is
  fetched. The package stays under 2 MB, but it adds a second download, a network dependency
  and a checksum to maintain.

## Status log

- **2026-11-01, owner:** "Approved, proceed", given to the ask *"Approve PKG-1, with U8G2's font source shipped in the package?"*. The decomposition is approved, and the owner decision is **(a): ship `u8g2_fonts.c` in the package.**
