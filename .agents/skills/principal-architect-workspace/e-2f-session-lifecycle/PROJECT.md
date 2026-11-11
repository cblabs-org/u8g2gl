# E-2f: When the design session ends

**Base:** `main` @ `af6996f` (#46 merged). CLI 0.16.0. **Worktree:** `../U8G2GL-e2f`.

## Owner decisions and approval

The owner asked, on 2026-11-11, for "the usability of this based on how an actual user would
oppen the app" [sic]. The PA tested the served designer as a user would, reported the findings in chat,
and the owner replied "Yes, plan them". The plan below was then presented in chat. The owner
answered it, in their own words:

> "Approved, proceed"

## The problem (measured 2026-11-11, on main's build)

| # | Situation | What happens now |
|---|---|---|
| 1 | The server stops (Ctrl-C, terminal closed, reboot) with a tab open | The page looks fully alive. ⌘S sends a `PUT`, which fails with connection refused. The only sign is a line in Output, which is hidden behind Problems. |
| 2 | The server restarts (a new token) under an open tab | Every save is refused with 403, for good. A reload shows raw JSON, and the browser does not ask before discarding unsaved edits. |
| 3 | Someone opens the bare address, or an old bookmark or tab | The page is `{"code":"forbidden","message":"missing or wrong session token"}`, with no next step. |

What already works, and stays as it is:
- `npx u8g2gl design` opens the browser with the token.
- Running it again attaches to the live server and reopens the session.

## One PR: E-2f, designer and design server only

**Versions:** CLI 0.16.0 → **0.16.1** (patch, rule 03: a fix with no output change). No change to
the schema or the runtime, and no golden moves.

| WO | Topic |
|---|---|
| WO1 | Core: `ServedProjectFileSystem` reports its connection state |
| WO2 | Designer: the "session ended" banner, visible save failures, the unsaved-changes guard |
| WO3 | Server: a help page, instead of JSON, for a refused browser navigation |
| WO4 | Docs, version, readability review, PA verification |

### PA rulings

1. **Connection state (WO1).**
   - `ServedProjectFileSystem` gains an observable connection state: `connected` or `lost`.
   - **`lost`:** the event stream errors after `ready`.
   - **Back to `connected`:** a later `ready`, from `EventSource`'s own retry.
   - On a return to `connected`, the designer re-lists the project, as the class's own doc
     comment already asks, so changes made during the gap are seen.
   - `InMemoryProjectFileSystem` is always `connected`.
   - The `ProjectFileSystem` interface gains the state only if the designer can't get it
     another way. The worker reports that choice; it doesn't make it silently.
   - Unit tests use a fake `EventSource`: an error before `ready` still rejects `connect()`, an
     error after it gives `lost`, and a second `ready` gives `connected`.
2. **The banner (WO2).** While the state is `lost`, a bar shows across the top of the window,
   with `role="alert"` and the same style as the existing conflict bar. It says:
   - the design server has stopped;
   - your unsaved changes are still in this tab, and it names the files;
   - to continue, run `npx u8g2gl design` in the project folder, which opens a new session,
     and that until then saving is not possible.

   Editing stays possible, so nothing is taken away. The banner clears on a return to
   `connected`.
3. **Save failures are visible (WO2).** A save that ends `failed`:
   - activates the Output panel, which already holds the reason;
   - adds a status-bar item, "✕ not saved: <file>", until that file next saves.

   `conflict` keeps its existing bar.
4. **The unsaved-changes guard (WO2).**
   - While `documents.dirty` is non-empty, `beforeunload` is armed, so a reload or a closed tab
     gets the browser's own "Leave site?" prompt.
   - It is not armed while nothing is dirty, so it never nags.
5. **The refusal page (WO3).**
   - **When a page is served:** a `GET` with `Sec-Fetch-Mode: navigate`, or one that accepts
     `text/html` while not accepting JSON first, gets a small HTML page, still status 403.
   - **Everything else is unchanged:** fetch and API callers keep today's JSON, so the existing
     403 tests stand as they are.
   - **The security properties hold:**
     - The page is byte-identical for a missing token, a wrong token and every route, so it
       still reveals nothing about routes.
     - It carries no project name, path or token.
     - `wrong Host` stays JSON, since the DNS-rebinding barrier has no human reader.
   - **Its text:** this designer link needs a running session; a link stops working when
     `u8g2gl design` stops or restarts; run `npx u8g2gl design` in the project folder, which
     opens the browser, or reopens the session if it is already running.
   - **New tests:**
     - a navigation request gets HTML, identical for missing and wrong tokens across all routes;
     - an API request still gets JSON;
     - the page contains neither the token nor the project name.
6. **Testing:**
   - **e2e,** using the session helper's existing `stop()`:
     - stopping the server mid-session shows the banner;
     - an edit then ⌘S shows "not saved" and activates Output;
     - a reload with a dirty buffer raises the `beforeunload` dialog.
   - **Unit:** the status-bar text, and the banner's file list.
   - **Unchanged:** the existing saving e2e tests must still pass.
7. **Docs (WO4):**
   - ui_spec gains a short "session lifecycle" section: what the banner means, and running the
     command again;
   - the README's `design` paragraph gains one line: "Lost the tab? Run it again. It reopens the
     running session.";
   - `ChangeLog` is updated only if a 0.x.y patch has precedent there.
8. **Boundary:**
   - `cli/src/core/project-fs/served-project-file-system.ts`, plus `project-file-system.ts` only
     under ruling 1's condition;
   - `cli/src/node/design/design-server.ts`, and a new `refusal-page.ts`;
   - `designer/src/{ui,documents,workspace.ts,main.tsx,styles.css}`;
   - their tests and e2e specs;
   - `docs/ui_spec.md`, `cli/README.md`, and the CLI version.

## Not in this plan: owner decisions

- **A stable address across restarts** (finding 4). Today the port is random and the token is
  new every start, so a bookmark never survives. The options are:
  - a default port: easy, but the token still changes;
  - keeping the token in the lock file across restarts: bookmarks work, but the lock then holds
    a long-lived secret.

  This is a security trade-off for the owner.
- **Recovering unsaved edits in the new session.** A new session is a different origin (a new
  port), so the browser's storage can't carry edits across. This only becomes possible after a
  decision on a stable port. Until then, the banner keeps the edits on screen and the guard stops
  a reload from losing them.

## Status log

| Date | Entry |
|---|---|
| 2026-11-11 | Owner approved the E-2f plan: "Approved, proceed". PA created worktree `../U8G2GL-e2f` from `af6996f`, branch `u8g2gl-e2f/wo1-connection`. Worker spawned on WO1–WO4. |
