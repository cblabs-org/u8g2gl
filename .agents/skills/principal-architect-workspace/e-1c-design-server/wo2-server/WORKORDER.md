---
name: e-1c-wo2
description: Work Order 2 of E-1c — the design command, loopback server, token, watcher, lock file, build queue
---

# Role

As WO1. **Parent project:** `e-1c-design-server` ([PROJECT.md](../PROJECT.md)); its PA rulings
2–7 govern this WO.

# Where you work

- Same worktree. When WO1 is committed, create **only** this branch from WO1's tip:
  `git checkout -b u8g2gl-e1c/wo2-server`. Verify the branch before every commit. Do not push.

# Strict boundary box

- Create `cli/src/node/design/**`, `cli/test/node/design/**` (or `cli/test/design/**`).
- The served `ProjectFileSystem` browser half in `cli/src/core/project-fs/` (fetch and
  EventSource only, no `node:`), and its contract-suite run in `cli/test/project-fs/`.
- Edit `cli/src/node/cli.ts` only to register the `design` command.
- Nothing else. No dependencies.

# What to build

- `u8g2gl design [project-dir] [--port N] [--no-open]`: binds `127.0.0.1` on a free port (or
  `--port`), generates the token, prints `http://127.0.0.1:<port>/?token=<token>`, and opens it
  unless `--no-open`. Ctrl-C shuts down cleanly and removes the lock.
- Routes (all token-checked, PA ruling 4): `/` placeholder page; `GET /api/files` list;
  `GET /api/file?path=` read (with version); `PUT /api/file?path=` write (with expected version,
  409 on conflict); `GET /api/events` SSE stream of watcher events; `POST /api/build/:job` and
  `GET /api/build/:id` for the job queue, which has **no jobs registered** yet and a
  registration function E-1d will call.
- Writes validated by the shared path function and `isInsideProject` (symlinks resolved).
- Watcher: `fs.watch` recursive, debounced so one save gives one event, ignoring `generated/`,
  `.git/`, `node_modules/` and the lock file.
- Lock file `.u8g2gl-design.lock` in the project holding pid, port and token. A second `design`
  in the same project with a live pid prints the running URL and exits 0; a dead pid's lock is
  replaced. (Check `.gitignore` guidance: the lock is per-user state; say in the report whether
  the project template should ignore it. Do not edit templates.)

# Checklist

- [ ] **c1** — every route, including `/api/events`, returns 403 without the token or with a
      wrong one.
- [ ] **c2** — `..`, absolute paths, and a symlink pointing outside the project are refused on
      write (reuse WO1's cases plus a real symlink in a temp dir).
- [ ] **c3** — the bound address is `127.0.0.1` (assert `server.address()`).
- [ ] **c4** — an external write to a project file yields a `changed` event within 200 ms
      (time it; run it 20 times and report the max).
- [ ] **c5** — the served implementation passes WO1's contract suite against a live server.
- [ ] **c7** — second instance attaches and prints the URL; a stale lock (dead pid) is replaced.
- [ ] Tests start servers on port 0 with `--no-open` and always close them.
- [ ] Full CLI suite, lint and tsc clean.
- [ ] Completion report below.

# Completion report

*(Worker fills this in: commits, counts, c4 timings, platform caveats, anything not done.)*
