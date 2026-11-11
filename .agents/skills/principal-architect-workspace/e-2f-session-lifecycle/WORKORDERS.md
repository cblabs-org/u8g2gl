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

- [ ] Ruling 2: the session banner. It sits above the dock while `lost`, with `role="alert"` and
      the conflict bar's styling. It says the design server has stopped, lists the files with
      unsaved changes (or says there are none), and tells the user to run `npx u8g2gl design`
      in the project folder to open a new session; until then saving is not possible. Editing
      stays enabled. It clears on `connected`, and the designer then re-lists the project so
      changes made during the gap are seen.
- [ ] Ruling 3: a save that ends `failed` activates the Output panel and shows
      "✕ not saved: <file>" in the status bar until that file next saves (or its buffer
      returns to clean). `conflict` is unchanged.
- [ ] Ruling 4: `beforeunload` is armed exactly while `documents.dirty` is non-empty.
- [ ] Neither the banner nor the status item may make the Palette, the Explorer or the canvas
      re-render on a keystroke or a drag. The existing render-count tests must stay green.
- [ ] Unit tests: the banner's text for zero, one and several dirty files; the status item's
      text and its clearing.
- [ ] e2e, using the session helper's `stop()`: stopping the server shows the banner; an edit
      and ⌘S then shows the status item and activates Output; with a dirty buffer, a reload
      raises a `beforeunload` dialog (Playwright's `page.on('dialog')`); with none, it does not.
      The existing saving specs still pass.

# WO3 — the refusal page (`u8g2gl-e2f/wo3-refusal-page`)

- [ ] Ruling 5: a new `cli/src/node/design/refusal-page.ts`, in the style of
      `placeholder-page.ts`. It is served, with status 403, to a `GET` with
      `Sec-Fetch-Mode: navigate`, or one whose `Accept` prefers `text/html` over JSON. Every
      other refused request gets today's JSON, byte for byte. `wrong Host` stays JSON.
- [ ] The page is byte-identical for a missing token, a wrong token and every route. It holds
      no project name, path or token; check that by test, not by reading. Its text follows
      ruling 5.
- [ ] Tests: a navigation request gets HTML, the same for missing and wrong tokens across every
      route in the existing route table; an API request still gets JSON; neither the token nor
      the project directory name appears in the page. The existing 403 tests are unchanged.

# WO4 — docs, version, review, evidence (`u8g2gl-e2f/wo4-docs-review`)

- [ ] Ruling 7's docs: a short "session lifecycle" section in `docs/ui_spec.md`, and one line in
      the `design` paragraph of `cli/README.md` ("Lost the tab? Run it again. It reopens the
      running session."). A `ChangeLog` line only if a 0.x.y CLI patch has precedent there.
- [ ] CLI 0.16.0 → 0.16.1, everywhere the last CLI patch bump changed it. No schema or runtime
      change. Show that no golden moved, or, if the CLI stamp moves goldens, that only the
      stamp did, exactly as rule 03 describes.
- [ ] Spawn the `readability-reviewer` on E-2f's diff against `af6996f`. Resolve P1–P3, and
      decide P4 with reasons.
- [ ] Screenshots under `tmp/e2f/`: the banner, the status item, and the refusal page.
- [ ] A final run of every suite, one at a time: guard; CLI, lint and tsc; goldens; C++; Wasm,
      then `build:e2e`; designer unit; e2e; production and its no-hook grep;
      `check-package.mjs`. Then write a completion report at the end of this file: commits,
      suite counts, decisions, and anything left open.
