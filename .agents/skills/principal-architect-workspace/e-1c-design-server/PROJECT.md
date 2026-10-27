# E-1c: The Design Server

**Parent:** the editor track, `implementation_plan.md` §5. **Scope and acceptance criteria:**
[E1-DECOMPOSITION.md §1, E-1c](../e-d-editor-design/E1-DECOMPOSITION.md), approved by the owner
on 2026-10-26 (recorded in [e-d-editor-design/PROJECT.md](../e-d-editor-design/PROJECT.md)).
**Base:** `origin/main` @ `019b103`. **Worktree:** `../U8G2GL-e1c`.

## Purpose

`npx u8g2gl design`, the served-first ruling's server (ui_spec `[UD-2]`, second amendment). It
serves the editor and the project, watches files, and runs builds. It is **never in the
per-edit loop**.

## Owner approval

> "approved - please proceed autonomously from this point on until you run out of quota.  Please spin up sub-agents as needed."

Given 2026-10-27 as a standing instruction to continue the programme autonomously.
*Provenance note:* the owner did not review this Work-Order breakdown before it started. E-1c's
**scope** rests on the owner's 2026-10-26 approval of the E-1 decomposition; this instruction
authorises starting it within that scope. Precedent: PR-06 (owner, 2026-10-15).

## Decomposition

| WO | Topic | Branch | ACs | Status |
|---|---|---|---|---|
| WO1 | `ProjectFileSystem` interface, in-memory implementation, contract suite, shared write-boundary function | `u8g2gl-e1c/wo1-project-fs` | c2 (shared rule), c5 (in-memory half), c6 | In progress |
| WO2 | The `design` command: loopback server, token, file routes, watcher and events, lock file, build queue, served implementation | `u8g2gl-e1c/wo2-server` (from WO1's tip) | c1, c2, c3, c4, c5, c7 | Pending |
| WO3 | Readability review and PA verification | — | all | Pending |

One worker, WO1 then WO2, sequentially in this worktree.

## PA rulings

1. **Boundary, one deviation from E1-DECOMPOSITION.** c2 requires the server and
   `load-project.ts` to share **one** write-boundary function. Today `isInsideProject` is private
   to `cli/src/node/load-project.ts`. It moves to a new `cli/src/node/project-path.ts` and
   `load-project.ts` imports it. That is the only edit to `load-project.ts`, and its behaviour
   must not change (its existing tests are the check).
2. **No dependencies.** The server is `node:http`; the event channel is **server-sent events**
   (one-way server-to-browser is all `watch` needs; writes go over HTTP). No `ws`, no `express`,
   no watcher library. The watcher is `node:fs.watch` with `recursive: true` (supported on
   macOS, Windows, and Linux from Node 20; CI runs Node 22). If recursive watching proves
   unreliable on Linux in CI, the worker reports it rather than adding a dependency.
3. **The served implementation's browser half** (`cli/src/browser/` or `cli/src/core/project-fs/`,
   using `fetch` and `EventSource` only) must satisfy the contract suite. Test it in Node 22,
   which has `fetch` and, if `EventSource` is missing, a minimal SSE reader written for the test
   environment. No polyfill dependency.
4. **The token** is 32 random bytes, hex, from `node:crypto`, accepted as a `?token=` query
   parameter on the first page load and then an `Authorization: Bearer` header or the same query
   parameter (SSE cannot set headers). Compared in constant time.
5. **The placeholder page** at `/` says the editor arrives with E-1e. No HTML framework.
6. **No version bump** unless generator output changes (it must not). Adding a CLI command is
   not a determinism-affecting change.
7. **Does not open a browser in tests.** `design` opens the browser by default; `--no-open`
   suppresses it, and every test passes it.

## Status log

- **2026-10-27.** Worktree created from `origin/main` @ `019b103`. WO1 issued.
