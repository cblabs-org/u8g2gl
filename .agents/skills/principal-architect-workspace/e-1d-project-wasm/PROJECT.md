# E-1d: The Project Editor Wasm

**Parent:** the editor track, `implementation_plan.md` §5. **Scope and acceptance criteria:**
[E1-DECOMPOSITION.md §1, E-1d](../e-d-editor-design/E1-DECOMPOSITION.md), approved by the owner
on 2026-10-26 (recorded in [e-d-editor-design/PROJECT.md](../e-d-editor-design/PROJECT.md)).
**Base:** stacked on E-1c, `u8g2gl-e1c/wo3-readability` (PR #23). It targets `main` after #23
merges; until then its diff includes E-1c's. **Worktree:** `../U8G2GL-e1d`.

## Purpose

The Wasm the canvas renders with is built from **this** project, with its real widget C++, and is
kept current with it. E-1d also fixes every bridge limitation E-D's WO1 found (LOOP-BUDGET F6,
F10): a fixture-bound registry, fonts and images; a 128-byte string cap; a 2 KB buffer cap;
fixed capacities; no Wasm build in CI.

## Owner approval

> "approved - please proceed autonomously from this point on until you run out of quota.  Please spin up sub-agents as needed."

Given 2026-10-27 as a standing instruction to continue the programme autonomously.
*Provenance note:* the owner did not review this Work-Order breakdown before it started. E-1d's
**scope** rests on the owner's 2026-10-26 approval of the E-1 decomposition; this instruction
authorises starting it within that scope. Precedent: PR-06 (owner, 2026-10-15).

## Decomposition

| WO | Topic | Branch | ACs | Status |
|---|---|---|---|---|
| WO1 | `u8g2gl toolchain install \| status \| path`: the managed, pinned Emscripten | `u8g2gl-e1d/wo1-toolchain` | (toolchain half of the scope) | In progress |
| WO2 | The bridge driven by the project: fonts and images from a generated table, capacities from the generated config, placeholders | `u8g2gl-e1d/wo2-bridge` | d1, d3, d5, d8 | Pending |
| WO3 | The build job on E-1c's queue: build cache, `-O1`/`-O3`, build hash, the platform-header rule | `u8g2gl-e1d/wo3-build-job` | d1, d2, d4, d6 | Pending |
| WO4 | A CI job that builds the framework editor Wasm and runs its snapshot test | `u8g2gl-e1d/wo4-ci` | d7 | Pending |
| WO5 | Readability review and PA verification | `u8g2gl-e1d/wo5-readability` | all | Pending |

One worker, WO1 to WO4 in order, each branch from the previous tip.

## PA rulings

1. **No toolchain download in this session.** Installing Emscripten is a 1.6 GB download, which
   needs the owner's explicit permission each time. The installer is built and tested against a
   **fake** process runner and fake network (temp directories, recorded commands); it is never
   run for real here. For building and testing Wasm, use the emsdk already on this machine:
   `source /Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`,
   which is **Emscripten 5.0.3**, the pinned version. That is also the "already on `PATH` at
   exactly 5.0.3" path the scope requires `toolchain` to detect and use.
2. **How the installer pins and verifies.** It clones `emscripten-core/emsdk` at tag `5.0.3` and
   checks the checkout's commit is **`a620cf1d71c62dfdfbb0c01fe0a371e2af2dda6c`** (read from the
   local emsdk checkout above, which is at that tag). It then runs `emsdk install 5.0.3` and
   `emsdk activate 5.0.3`, and emsdk verifies its own archives' checksums. It asks for consent
   first and states the size (about 1.6 GB installed). It never touches an emsdk the user
   installed themselves. Cache directories: `~/Library/Caches/u8g2gl/` (macOS),
   `$XDG_CACHE_HOME/u8g2gl/` or `~/.cache/u8g2gl/` (Linux), `%LOCALAPPDATA%\u8g2gl\` (Windows).
   Tests must point the cache at a temp directory and never write the real one.
3. **Versions.** Changing `editor-registry.ts`'s output moves editor-target goldens, so the CLI
   takes a **patch** bump, 0.13.1 → 0.13.2 (rule 03, determinism). The bridge is editor-only and
   not runtime API: **no runtime bump** unless `src/` or `include/u8g2gl/` change, which they
   should not. If a runtime change turns out to be needed, stop and report.
4. **Firmware untouched (d5).** No firmware-target golden may change, and the existing check
   that firmware binaries carry no editor code must still pass. If one does change, stop.
5. **CI (WO4)** installs Emscripten 5.0.3 by cloning emsdk at the pinned tag and commit in the
   workflow, cached by version. No third-party setup action.
6. **Boundary** is E1-DECOMPOSITION's: `wasm/**`, `cli/src/node/toolchain/**`,
   `cli/src/node/design/build/**`, `cli/src/core/generator/emit/editor-registry.ts`,
   `.github/workflows/ci.yml`, their tests, plus `cli/src/node/cli.ts` to register `toolchain`,
   `cli/package.json` for the version, and the generated goldens the bump moves. Any other file:
   stop and report.

## Status log

- **2026-10-27.** Worktree created from E-1c's tip, `extern/u8g2` checked out. emsdk 5.0.3 found
  at `departures-board/tools/layoutsim/emsdk` (tag `5.0.3`, `a620cf1d`). WO1 issued.
