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

- [ ] Baselines first: `cd cli && npm ci && npm test` (expect 1353), `npm run lint` clean. Paste.
- [ ] Interface, in-memory implementation, contract suite, path validator, with tests.
- [ ] `isInsideProject` moved to `project-path.ts`; `load-project.ts` imports it; all existing
      write-boundary tests pass unchanged.
- [ ] **c6** — no `node:` import under `cli/src/core/project-fs/`. (E-1a adds the enforcing test
      on another branch; check by `grep` and say so.)
- [ ] Full CLI suite, lint and tsc clean. Count = 1353 + new.
- [ ] Completion report below.

# Completion report

*(Worker fills this in: baselines, commits, counts, interface decisions, anything not done.)*
