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

- [x] **c1** — every route, including `/api/events`, returns 403 without the token or with a
      wrong one.
- [x] **c2** — `..`, absolute paths, and a symlink pointing outside the project are refused on
      write (reuse WO1's cases plus a real symlink in a temp dir).
- [x] **c3** — the bound address is `127.0.0.1` (assert `server.address()`).
- [x] **c4** — an external write to a project file yields a `changed` event within 200 ms
      (time it; run it 20 times and report the max).
- [x] **c5** — the served implementation passes WO1's contract suite against a live server.
- [x] **c7** — second instance attaches and prints the URL; a stale lock (dead pid) is replaced.
- [x] Tests start servers on port 0 with `--no-open` and always close them.
- [x] Full CLI suite, lint and tsc clean.
- [x] Completion report below.

# Completion report

**Worker, 2026-10-27.** Branch `u8g2gl-e1c/wo2-server`, created from WO1's tip `fa4d569`.

**Commit:** `2ff8ce1` feat(cli): u8g2gl design — loopback server, token, watcher, lock, build queue.

**Counts.** Before (WO1 tip): `23 failed | 1402 passed | 10 skipped (1435)`. After:
`23 failed | 1505 passed | 10 skipped (1538)`, so 103 new tests. The 23 failures are the same
environmental set as WO1's baseline (the `extern/u8g2` submodule is not checked out in this
worktree), and I checked them by file. `npm run lint` (eslint + `tsc -p tsconfig.test.json`) is
clean. The design and project-fs suites ran five more times with all 180 passing each time. No
stray `design` processes were left afterwards, and `cli/tmp/` was cleaned.

**Acceptance criteria.**

- **c1:** `design-server.test.ts` tries all 8 routes (`/`, `/api/files`, `GET`/`PUT /api/file`,
  `/api/events`, `POST /api/build/:job`, `GET /api/build/:id`, and an unknown route). Each one gets
  7 bad-token variants: none, wrong with the right length, truncated, upper-cased, a non-Bearer
  scheme, a wrong `?token=`, and a wrong header next to the right query. Every variant gets 403,
  and no refused PUT wrote anything. The token check runs before routing, so an unknown route
  also returns 403 without the token.
- **c2:** every one of WO1's `INVALID_PATHS` gets 400 `invalid-path` over HTTP, and so does
  percent-encoded `..%2F`. Using real symlinks in a temp directory, these all get 403
  `outside-project`: `link.xml` pointing to an outside file, `linkdir/new.xml` and
  `linkdir/deeper/new.xml` under a directory link pointing outside, and a dangling link pointing
  outside. The outside directory is checked afterwards and is unchanged. A symlink that stays
  inside the project still writes.
- **c3:** `server.address()` is `{ address: '127.0.0.1', family: 'IPv4' }`.
- **c4:** 20 runs on macOS (Darwin 25.6, Node 26.8.1, APFS), each timed from `writeFileSync` to
  the `changed` event arriving at a `ServedProjectFileSystem` over SSE. A typical run:
  `31.1, 53.0, 58.6, 41.5, 50.7, 53.9, 45.3, 51.6, 52.7, 51.7, 51.6, 52.2, 50.5, 52.7, 50.8, 48.4,
  55.6, 48.5, 52.9, 47.2` ms, **max 58.6 ms**. Over six full runs of 20 the max was 53–59 ms. About
  30 ms of that is the debounce (`WATCH_DEBOUNCE_MS`) and the rest is FSEvents latency.
- **c5:** `test/project-fs/served.test.ts` runs `runProjectFsContract('served', ...)` against a
  live server on port 0. Each test gets its own project, and the real watcher feeds a real SSE
  stream. All 37 contract cases pass, along with two served-only cases: a wrong token and a
  server that has gone away.
- **c7:** this is tested in-process (`startOrAttach`) and end to end through the built
  `dist/node/cli.js` with `--no-open --json`. A second instance prints the running URL as JSON
  `attached: true` and exits 0. SIGINT on the first instance exits 0 and removes the lock. These
  locks all get replaced: a dead pid (from a child that has exited), a live pid with no server
  answering (a reused pid), and a corrupt lock. A server never deletes a lock another server owns.
- Every test server binds port 0. CLI tests pass `--no-open`, and the in-process tests never call
  the opener. Servers are closed in `afterEach` or `finally`, and spawned children are SIGKILLed
  if they are still alive.

**Interface and design decisions (for the PA to rule on where they go beyond the WO).**

- **Wire protocol.** The PUT body is the raw text. The expected version goes in the
  `U8G2GL-Expected-Version` header, where the value `absent` means "must not exist". The read
  version comes back in `U8G2GL-Version`. Errors are `{ code, message, currentVersion? }` with
  these statuses: 400 invalid-path, 403 outside-project, 404 not-found, 409 conflict, 500
  unavailable. I did not use `If-Match`, because the standard pairs it with 412 and the WO asks for
  409. SSE sends `event: ready` first, then one `data: {kind,path}` per change, with a keepalive
  comment every 15 s.
- **`ServedProjectFileSystem.connect()` and `close()`.** `connect()` opens the stream and resolves
  on `ready`, so no event is lost between connecting and watching. It rejects on a wrong token.
  Reads and writes don't need it.
- **Host-header check (added beyond the WO).** Only `127.0.0.1:<port>` and `localhost:<port>` are
  accepted, and anything else gets 403. This blocks DNS rebinding and costs nothing. It is
  tested.
- **Ignored paths are also refused for writes (added beyond the WO).** `generated/`, `.git/`,
  `node_modules/` and the lock file are left out of the watcher and `list`, and writes to them get
  403 `outside-project`. Without that, anyone holding the token could plant `.git/hooks/*`. They
  can still be read.
- **New-file boundary.** `isInsideProject` is unchanged. `DiskProject.writeStaysInside` applies it
  to the nearest existing entry (found with lstat, so a dangling link counts as existing) and
  refuses anything that can't be resolved. That logic lives in `node/design/` and is the fix for
  the caveat raised in WO1.
- **The watcher reports only real differences.** For each path it debounces, then compares the
  content version with the last one it knew. This turns bursts and temp-then-rename saves into
  one event (or none), drops macOS's replay of pre-watch changes, and expands directory events to
  the files under them. One side effect: a served write of identical content sends no event,
  while in-memory sends one. The contract doesn't test that case.
- **Lock liveness is a live pid plus the server answering its own token** (a 1 s probe), because
  a pid alone can be reused. The lock is created exclusively (`wx`), and stale-lock removal is
  guarded by token so two instances racing can't delete each other's lock. Both instances open
  the browser unless `--no-open` is given.
- **Build queue.** `server.builds.register(name, runner)` is what E-1d calls. Jobs run strictly
  one at a time in FIFO order. `POST /api/build/:job` takes an optional JSON body as `params` and
  returns 202 with `{id, job, status}`. `GET /api/build/:id` returns
  `queued|running|succeeded|failed` with `result` or `error`. The last 100 finished records are
  kept. An unknown job gets 404 `unknown-job`, and registering the same name twice throws. There
  is no SSE push for build progress; E-1e may want one.
- **`--json`** prints one line: `{ url, port, pid, attached }`. A directory without `u8g2gl.xml`
  exits 1, and a bad option exits 2 (`U8G2GL_USAGE` under `--json`).
- **`.gitignore` guidance.** The lock holds the session token, so it is per-user secret state. The
  project template **should ignore `.u8g2gl-design.lock`**. The CLI has no project template
  (there is no `init` command), so nothing was edited. Whoever writes the template or the
  getting-started docs should add the line.
- **No version bump.** Generator output is unchanged, and the goldens pass.

**Platform caveats.**

- **Linux: recursive `fs.watch` is not verified here.** I could only test on macOS. CI is
  `ubuntu-latest` with Node 22, where recursive watching is Node's own inotify-per-directory
  implementation. If c4 or the served contract's watch cases fail or flake in CI, that is the
  ruling-2 report, not a reason to add a dependency. Also on Linux, Node still places inotify
  watches inside `node_modules/` and `.git/` even though their events are ignored, so a very
  large project could hit `fs.inotify.max_user_watches`. On Node 18, Linux has no recursive
  watch, so `startDesignServer` throws and `design` fails with that error (`engines` is `>=18`).
- **Windows: untested.** The symlink tests need symlink privileges there, and the browser opener
  uses `cmd /c start`.
- **Races.** An external editor that writes between the server's version check and its write
  can still race it, because no portable compare-and-swap exists. Inside one server, writes are
  synchronous and so serialised.

**Not done:** nothing in scope. WO3 (readability review and PA verification) is the PA's.
