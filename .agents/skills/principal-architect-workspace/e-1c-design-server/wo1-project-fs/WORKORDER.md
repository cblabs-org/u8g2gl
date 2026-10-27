---
name: e-1c-wo1
description: Work Order 1 of E-1c — ProjectFileSystem interface, in-memory implementation, contract suite, shared write boundary
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond what these WOs name, do not push, do
not start other work. Execute this checklist, then WO2 (its WORKORDER.md is in `../wo2-server/`).

**Parent project:** `e-1c-design-server` ([PROJECT.md](../PROJECT.md)). Read it, its PA rulings,
and the provenance it cites in `.agents/skills/principal-architect-workspace/e-d-editor-design/PROJECT.md`
before starting (rule 00). The specification is
`.agents/skills/principal-architect-workspace/e-d-editor-design/E1-DECOMPOSITION.md` §1 E-1c, and
`EDITOR-DESIGN.md` §2 beside it (the session, save and conflict rules the interface must support).

# Where you work

- Worktree: `/Users/mcneillm/Documents/Projects/U8G2GL-e1c`, branch `u8g2gl-e1c/wo1-project-fs`
  (already created). `git branch --show-current` before every commit (rule 04).
- Commit as you complete coherent steps. **Do not push.** Commit trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Scratch in the worktree's `tmp/`. Load the `u8g2gl-standards` skill before writing code.

# Strict boundary box

- Create `cli/src/core/project-fs/**` and `cli/test/project-fs/**`.
- Create `cli/src/node/project-path.ts`; edit `cli/src/node/load-project.ts` **only** to import
  `isInsideProject` from it (PA ruling 1). Tests for it in `cli/test/node/`.
- Nothing else. No dependency changes.

# What to build

- `ProjectFileSystem` in `cli/src/core/project-fs/`: project-relative POSIX paths, operations
  `read(path)` → text (and a binary variant if the interface needs it for fonts/images — decide
  from what `read-project.ts` reads, and say what you chose), `write(path, text)`,
  `list()` → project files, `watch(listener)` → unsubscribe, with events `changed`, `added`,
  `removed`. Each read returns enough to detect a conflict on save (a content hash or version)
  and `write` can take the expected version and refuse if the file changed (EDITOR-DESIGN §2.3).
- `InMemoryProjectFileSystem` implementing it, including events on its own writes and a test
  hook to simulate an external change.
- **A contract suite** — a function `runProjectFsContract(name, factory)` in `cli/test/project-fs/`
  that any implementation calls, so WO2's served implementation reuses it exactly (c5).
- Path validation in the interface's contract: `..`, absolute paths, backslash tricks and empty
  segments are refused **before** any implementation sees them, by one shared pure function in
  `core/` (no `node:`). The real-path/symlink half stays in `cli/src/node/project-path.ts`
  (`isInsideProject`, moved verbatim from `load-project.ts`).

# Checklist

- [x] Baselines first: `cd cli && npm ci && npm test` (expect 1353), `npm run lint` clean. Paste.
- [x] Interface, in-memory implementation, contract suite, path validator, with tests.
- [x] `isInsideProject` moved to `project-path.ts`; `load-project.ts` imports it; all existing
      write-boundary tests pass unchanged.
- [x] **c6** — no `node:` import under `cli/src/core/project-fs/`. (E-1a adds the enforcing test
      on another branch; check by `grep` and say so.)
- [x] Full CLI suite, lint and tsc clean. Count = 1353 + new.
- [x] Completion report below.

# Completion report

**Worker, 2026-10-27.**

**Baselines** (`npm ci && npm test`, `npm run lint`, Node 26.8.1 locally):

```
Test Files  8 failed | 82 passed (90)
     Tests  23 failed | 1320 passed | 10 skipped (1353)
lint: clean
```

The total is the expected 1353. **The 23 failures are environmental, not code:** this worktree's
`extern/u8g2` submodule is not checked out (`.gitmodules` sets `update = none`), so every test
reading `extern/u8g2/tools/font/bdf/*.bdf` fails with ENOENT (`fonts/*`, `bdfconv/smoke`,
`assets/compile-project-assets`, `generator/emit-fonts`, `integration/generate-bdf`). I did not
initialise the submodule (a clone into shared git config, outside the boundary box). The same 23
fail identically before and after this WO.

**Commit:** `fc1f991` feat(cli): ProjectFileSystem interface, in-memory implementation, shared boundary.

**After:** `Tests 23 failed | 1402 passed | 10 skipped (1435)` = 1353 + 82 new, same 23
environmental failures. `npm run lint` (eslint + `tsc -p tsconfig.test.json`) clean; `tsc` on
`tsconfig.json` clean. All existing `load-project*` write-boundary tests pass unchanged.

**c6:** `grep -rn "from 'node:" cli/src/core/project-fs/` finds nothing; the existing eslint
`no-restricted-imports` rule on `src/core/**` also covers it. E-1a's architecture test (a7) is not on
this branch.

**Files.** `cli/src/core/project-fs/`: `project-file-system.ts` (interface, types,
`GuardedProjectFileSystem`), `in-memory-project-file-system.ts`, `project-path-rule.ts`
(`checkProjectPath`), `content-version.ts`, `index.ts`. `cli/src/node/project-path.ts`
(`isInsideProject`, body verbatim, now exported with TSDoc). Tests: `cli/test/project-fs/contract.ts`
(`runProjectFsContract`, `INVALID_PATHS`), `in-memory.test.ts`, `project-path-rule.test.ts`,
`content-version.test.ts`, `cli/test/node/project-path.test.ts`.

**Interface decisions.**

- **Binary read: yes, `readBytes(path)`.** `load-project.ts` reads `<xbm>`, `<convert>` and `<bdf>`
  `src` files as `Uint8Array`, so the editor needs bytes. `read(path)` is UTF-8 text over the same
  bytes and carries the same version. `write` takes text only — the editor writes XML; nothing in
  E-1 writes binary. Adding `writeBytes` later is additive.
- **Results, not throws** (typescript.md §4): every operation returns
  `{ ok: true, ... } | { ok: false, code, message, currentVersion? }` with
  `code ∈ invalid-path | outside-project | not-found | conflict | unavailable`. `outside-project`
  is for the served implementation's symlink refusal.
- **Version** is opaque, content-derived: FNV-1a 64 + length, pure JS (no `node:crypto` in core;
  Web Crypto is async and not on every host). Same bytes → same version on server and browser with
  no shared state; a rewrite with identical bytes is not a conflict.
- **`write(path, text, { expectedVersion })`:** omitted = unconditional; a string = only if still at
  that version; `null` = create only. A refusal is `conflict` with `currentVersion` (string, or
  `null` if absent) so the editor can offer keep-mine / take-theirs. Writes create parent
  directories.
- **Validation before the implementation:** implementations extend `GuardedProjectFileSystem`,
  whose public methods run `checkProjectPath` and only then call protected `readBytesChecked` /
  `writeChecked`. The base also owns listener fan-out (`emit`), so a throwing listener cannot
  starve the others.
- **The lexical rule refuses rather than normalises:** empty, control chars, any backslash, any colon
  (drives and NTFS streams), leading `/`, empty segments, and any dots-only segment (`.`, `..`,
  `...`). `a/./b` is refused, not cleaned, so one file never has two keys.
- **`list()`** returns every file, sorted with `compareCodeUnits`.
- **Events** are `{ kind, path }` and include the instance's own writes. In-memory delivers
  synchronously; the contract waits, so the served implementation may be async.
- **Contract fixture** (for WO2): the factory takes seed files and returns
  `{ fs, externalWrite, externalRemove, dispose }`; options `eventTimeoutMs` / `quietMs`. The suite
  includes "one external save → exactly one event", which holds the served watcher's debounce to it.

**Note for WO2 (documented in `isInsideProject`'s TSDoc and tested):** the verbatim function falls
back to a *lexical* comparison for a path that does not exist, so `linkdir/new.xml` under a
symlinked directory pointing outside passes. The server must check the nearest existing ancestor
when creating a file. That check goes in `cli/src/node/design/`; `isInsideProject` is unchanged.

**Not done:** nothing in scope.
