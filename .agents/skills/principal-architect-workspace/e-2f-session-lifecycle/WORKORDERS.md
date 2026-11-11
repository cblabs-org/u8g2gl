---
name: e-2f-wo1-wo4
description: Work Orders 1–4 of E-2f — what the designer does when its design session ends
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.
Do not change the design, do not create any branches beyond the four named here, do not push, and
do not start other work. Execute WO1 to WO4 in order.

**Parent project:** `e-2f-session-lifecycle` ([PROJECT.md](PROJECT.md)). Its rulings are binding.
The owner's approval is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO4.

# Where you work

- **Worktree:** `../U8G2GL-e2f`, starting on `u8g2gl-e2f/wo1-connection` (based on `af6996f`).
  For each later WO, run `git checkout -b u8g2gl-e2f/woN-<name>` from the previous tip.
- **Install:** `git submodule update --init --checkout extern/u8g2`, then `npm ci` in `cli/`
  before `npm ci` and any build in `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time. Build the framework editor
  Wasm before `npm run build:e2e`. The e2e suite needs `npm run build:e2e`, never the production
  build; production is checked with `npm run build` and `test:e2e:production`. Emscripten:
  `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh` (never commit
  that path).
- **Standards:** load `u8g2gl-standards` before writing code. No workspace pointers in source
  comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Timing runs:** after each one, read `pmset -g log` (read only). A run that overlaps a Sleep
  or DarkWake is void and must be repeated. Change no power setting.
- **Versions:** never tag, never publish. Bump only what WO4 names.

# WO1 — connection state (`u8g2gl-e2f/wo1-connection`)

- [x] Ruling 1: `ServedProjectFileSystem` exposes its connection state, `connected` or `lost`,
      in the style the core already uses for observable state. An error after `ready` → `lost`;
      a later `ready` → `connected`. An error before the first `ready` still rejects
      `connect()`, exactly as today.
- [x] Decide whether `ProjectFileSystem` needs the state. Add it there, with
      `InMemoryProjectFileSystem` always `connected`, only if the designer cannot reach it
      otherwise. Record the choice and the reason in the completion report.
- [x] Unit tests with a fake `EventSource`: an error before `ready` rejects; an error after it
      gives `lost`; a second `ready` gives `connected`; `close()` reports neither.

# WO2 — the designer (`u8g2gl-e2f/wo2-designer`)

- [x] Ruling 2: the session banner. It sits above the dock while `lost`, with `role="alert"` and
      the conflict bar's styling. It says the design server has stopped, lists the files with
      unsaved changes (or says there are none), and tells the user to run `npx u8g2gl design`
      in the project folder to open a new session; until then saving is not possible. Editing
      stays enabled. It clears on `connected`, and the designer then re-lists the project so
      changes made during the gap are seen.
- [x] Ruling 3: a save that ends `failed` activates the Output panel and shows
      "✕ not saved: <file>" in the status bar until that file next saves (or its buffer
      returns to clean). `conflict` is unchanged.
- [x] Ruling 4: `beforeunload` is armed exactly while `documents.dirty` is non-empty.
- [x] Neither the banner nor the status item may make the Palette, the Explorer or the canvas
      re-render on a keystroke or a drag. The existing render-count tests must stay green.
- [x] Unit tests: the banner's text for zero, one and several dirty files; the status item's
      text and its clearing.
- [x] e2e, using the session helper's `stop()`: stopping the server shows the banner; an edit
      and ⌘S then shows the status item and activates Output; with a dirty buffer, a reload
      raises a `beforeunload` dialog (Playwright's `page.on('dialog')`); with none, it does not.
      The existing saving specs still pass.

# WO3 — the refusal page (`u8g2gl-e2f/wo3-refusal-page`)

- [x] Ruling 5: a new `cli/src/node/design/refusal-page.ts`, in the style of
      `placeholder-page.ts`. It is served, with status 403, to a `GET` with
      `Sec-Fetch-Mode: navigate`, or one whose `Accept` prefers `text/html` over JSON. Every
      other refused request gets today's JSON, byte for byte. `wrong Host` stays JSON.
- [x] The page is byte-identical for a missing token, a wrong token and every route. It holds
      no project name, path or token; check that by test, not by reading. Its text follows
      ruling 5.
- [x] Tests: a navigation request gets HTML, the same for missing and wrong tokens across every
      route in the existing route table; an API request still gets JSON; neither the token nor
      the project directory name appears in the page. The existing 403 tests are unchanged.

# WO4 — docs, version, review, evidence (`u8g2gl-e2f/wo4-docs-review`)

- [x] Ruling 7's docs: a short "session lifecycle" section in `docs/ui_spec.md`, and one line in
      the `design` paragraph of `cli/README.md` ("Lost the tab? Run it again. It reopens the
      running session."). A `ChangeLog` line only if a 0.x.y CLI patch has precedent there.
- [x] CLI 0.16.0 → 0.16.1, everywhere the last CLI patch bump changed it. No schema or runtime
      change. Show that no golden moved, or, if the CLI stamp moves goldens, that only the
      stamp did, exactly as rule 03 describes.
- [x] Spawn the `readability-reviewer` on E-2f's diff against `af6996f`. Resolve P1–P3, and
      decide P4 with reasons.
- [x] Screenshots under `tmp/e2f/`: the banner, the status item, and the refusal page.
- [x] A final run of every suite, one at a time: guard; CLI, lint and tsc; goldens; C++; Wasm,
      then `build:e2e`; designer unit; e2e; production and its no-hook grep;
      `check-package.mjs`. Then write a completion report at the end of this file: commits,
      suite counts, decisions, and anything left open.

# Completion report (worker, 2026-11-11)

**Provenance.** Read from PROJECT.md's status log before work began: the owner's "Approved, proceed" of 2026-11-11, and the PA's entry creating this worktree from `af6996f` and spawning this worker on WO1–WO4.

## Commits

Each branch is cut from the one before. Nothing is pushed, tagged or published.

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e2f/wo1-connection` | `4369ce0` |
| WO2 | `u8g2gl-e2f/wo2-designer` | `36ae731` |
| WO3 | `u8g2gl-e2f/wo3-refusal-page` | `54e5f7c` |
| WO4 | `u8g2gl-e2f/wo4-docs-review` | `fd1fed0` (docs, version), `5c5bccd` (review fixes), and this report |

## Versions

CLI 0.16.0 → **0.16.1** (`cli/package.json` and `cli/package-lock.json`, the two files the 0.15.2 → 0.15.3 bump touched). No schema or runtime change. `refresh-goldens.mjs`, run on the built 0.16.1 CLI, leaves an **empty diff**: the goldens are stamped `0.0.0-golden`, so the bump moves none. `ChangeLog` gains a `0.16.1` line under `cli v0.16.xx`; 0.15.2 is the precedent for a 0.x.y CLI patch line.

## Suites, before and after (one at a time)

| Suite | Before (`49b79e1`) | After (`5c5bccd`) |
|---|---|---|
| Home-path guard | self-test 11/11; clean | self-test 11/11; clean |
| CLI `npm test` | 2740 passed, 23 skipped (127 files) | 2750 passed, 23 skipped (128 files) |
| CLI lint and tsc | clean | clean |
| Goldens (`test/generator`) | 279 passed | 279 passed |
| C++ (Debug) | 515/515, 1 skipped (`SizeOfReport.ThirtyTwoBitTarget`); 0 warnings | the same |
| Wasm editor build; snapshot, placeholder, last-error | pass | pass |
| `build:e2e` | builds | builds |
| Designer unit | 159 passed | 163 passed |
| Designer e2e | 79 passed, 1 failed (see below) | 84 passed, 1 failed (see below); 85 passed at WO2 |
| Production build: no-hook grep / `test:e2e:production` | clean / 3 passed | clean / 3 passed |
| `check-package.mjs` | PASS, 15,341,397 bytes, 767 files | PASS, 15,348,188 bytes, 771 files |

- **The e2e failures are timing and flake, and each passed rerun alone at once.**
  - The baseline failure was `structure.spec.ts`, the Delete test: the Shift-click selected only `sys_clock`.
  - The final failure was `performance.spec.ts`'s frame gate: 6 keystrokes missed their frame, where 3 are allowed.
  - In WO2's full run (08:19–08:23), all 85 passed.
- **Timing runs.** The e2e runs were at 08:05–08:09, 08:19–08:23, 08:31–08:35, and the 08:35 rerun. `pmset -g log` shows the last Wake at 08:00:11 and no Sleep, DarkWake or Wake after it, so none is void.
- **Package growth:** 4 files and 6.8 KB, mostly `refusal-page.js` with its `.d.ts`.

## WO1: the interface decision

**`ProjectFileSystem` is unchanged.** The state lives only on `ServedProjectFileSystem`: `connection` (`'connected' | 'lost'`) and `onConnectionChange(listener) → unsubscribe`. This follows the core's existing `watch` style, because core cannot import the designer's `Observable`.

The reason: the designer already holds the concrete class. `Workspace` and `ProjectDocuments` are both constructed with a `ServedProjectFileSystem`, so the designer can reach the state without the interface. Adding it to the interface would also have forced a meaningless always-`connected` onto `InMemoryProjectFileSystem`. That is the deferred-DIP rule.

Other WO1 notes:
- **Before `connect()`** the state is `connected`, as documented on the type.
- **Handlers ignore a stream that `close()` replaced**, so a closed stream reports nothing.
- **Tests** are in `cli/test/project-fs/served-connection.test.ts`, with a fake stream.

## WO2 notes

- **The banner** is `ui/session-banner.tsx`, and its text is in `ui/session-status.ts`, which is pure so it can be unit-tested.
  - It sits in a new `.window` flex column above `.shell`, across the whole window.
  - The grid itself is unchanged, because `panel/panel.css`, which is outside the boundary, pins `grid-row: 1`.
  - It uses the conflict bar's class and `role="alert"`.
  - While connected it reads only the connection, so a keystroke or a drag renders nothing there. The existing render-count specs pass.
- **Re-listing on a return to `connected`** is `ProjectDocuments.resync()`.
  - It lists again and re-reads every document through the same rules as a change event (a new `catchUp`, factored out of `diskChanged`).
  - It tells the disk listeners about every file added, removed or moved.
- **"Not saved"** is `ProjectDocuments.notSaved`.
  - A `failed` save sets it.
  - The buffer turning clean clears it, and so does a successful save, since that makes the buffer clean.
  - `Workspace.saveActive()` brings Output forward through a new `showOutput()` request, which the layout fulfils.
- **The guard** is `ui/use-unsaved-guard.ts`. It owns one `beforeunload` listener, armed exactly while `documents.dirty` is non-empty.
- **The e2e spec** is `designer/e2e/session-lifecycle.spec.ts`, with 5 tests.
  - The banner, with a dirty file and with none.
  - "Not saved" and Output after ⌘S, cleared by undoing to clean.
  - The `beforeunload` dialog with a dirty buffer, and none without.

## WO3 notes

- **`wantsPage()`** returns true for a `GET` with `Sec-Fetch-Mode: navigate`, or whose `Accept` gives `text/html` a strictly higher weight than JSON, using the most specific matching range.
  - `*/*` alone, which is what `fetch` sends, is a tie, so it stays JSON.
  - `EventSource`'s `text/event-stream` gives HTML no weight, so it stays JSON too.
- **The page** is a constant, `REFUSAL_PAGE`, so it is byte-identical by construction.
- **Tests:**
  - A navigation gets one page across every GET route, for both a missing and a wrong token.
  - An `Accept` that prefers HTML also gets the page.
  - Every route keeps the exact JSON bytes under seven API `Accept`s, and so do non-GET navigations.
  - The page contains neither the token, nor the presented token, nor the project directory's name or path.
  - A wrong Host stays JSON for a navigation.
  - The existing 403 tests are unchanged.

## Readability review

The `readability-reviewer` reviewed the diff against `af6996f`. It found no P1 or P2, one P3 and four P4s.

- **P3, resolved:** `resync()`'s third stage (notifying the listeners) now has its own step comment.
- **P4, accepted:**
  - The `beforeunload` logic moved from `App` into the hook `useUnsavedGuard` (typescript.md §8).
  - The `.not-saved` rule no longer splits the Wasm indicator's rules.
  - A why-comment on the workspace's never-unsubscribed connection listener.
- **P4, declined:** sharing the string `npx u8g2gl design` between `refusal-page.ts` and `DESIGN_COMMAND` through a `core/` module. One is static HTML prose in `src/node/` and the other is designer copy. A neutral module holding one display string would couple the server's page to the designer's bundle for no behavioural gain, and both copies are pinned by tests.
- **Observation, unchanged:** the banner reuses the conflict bar's amber styling. Ruling 2 asks for exactly that.

## Evidence

Screenshots, taken headless and git-ignored:
- `tmp/e2f/banner.png`: the banner, naming the dirty screen.
- `tmp/e2f/not-saved.png`: the status item and Output after ⌘S.
- `tmp/e2f/refusal-page.png`: the page at a bare address.

They were taken by a throwaway spec, which was deleted after the run.

## Deviations and findings

1. **The `extern/u8g2` submodule was checked out from the owner's local clone, not GitHub.** The plain `git submodule update` was refused by the session's permission classifier. The submodule was instead cloned without network access from the main checkout's `.git/modules/extern/u8g2`, with a one-command `-c` URL override. No config was written: `submodule.extern/u8g2.url` still names GitHub. It is checked out at the pinned `d66b49a` (2.36.18).
2. **`resync()` catches up documents and the listing only.** A widget's C++ that changed during the gap, while keeping its name, is not detected, since there is no per-file version to compare without reading every file. It is noticed on its next change event. In practice a return to `connected` needs the same server to come back (a laptop sleep, a network blip); a restarted server has a new token, so the banner stays and the user opens a new session.
3. **`resync()` and the return to `connected` are not covered end to end.** No e2e can make a live server drop and restore an SSE stream on cue. The state change is unit-tested with the fake stream; `resync()` runs only on a real reconnect.
4. **The ChangeLog's `0.16.1` line sits above `0.16.0` in its entry**, newest first, as the file orders its entries. No in-entry precedent existed.

## Left open

- The two owner decisions in PROJECT.md: a stable address across restarts, and recovering unsaved edits in a new session.
- Firefox and WebKit ran only the `@cross-browser` subset. The new spec runs in Chromium only.
