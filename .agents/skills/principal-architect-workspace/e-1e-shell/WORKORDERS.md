---
name: e-1e-wo1-wo4
description: Work Orders 1–4 of E-1e — the designer shell, live pipeline, saving, Playwright
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the four named here, do not push, do not
start other work. Execute WO1 to WO4 in order.

**Parent project:** `e-1e-shell` ([PROJECT.md](PROJECT.md)). Its PA rulings are binding,
especially ruling 1 (exactly the approved dependencies, each at least 14 days old) and ruling 6
(the boundary). Read it and the provenance it cites (rule 00). The specification is
`.agents/skills/principal-architect-workspace/e-d-editor-design/E1-DECOMPOSITION.md` §1 E-1e; the
design is `EDITOR-DESIGN.md` §2 (session, save, the IDE beside it) and §3 (the edit loop); the
layout is `docs/ui_spec.md` §6. The server you build on is E-1c's (`cli/src/node/design/`, and
`cli/src/core/project-fs/`'s served `ProjectFileSystem`); the Wasm build job is E-1d's
(`cli/src/node/design/build/`, `wasm/u8g2gl_editor.mjs`). Read their PROJECT.md files under
`e-1c-design-server/` and `e-1d-project-wasm/`.

# Where you work

- Worktree `/Users/mcneillm/Documents/Projects/U8G2GL-e1e`, starting on `u8g2gl-e1e/wo1-scaffold`.
  Each later WO: `git checkout -b u8g2gl-e1e/woN-<name>` from the previous tip. Verify the branch
  before every commit. Commit as you go; **do not push**. Trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Scratch in `tmp/`.
- `extern/u8g2` is checked out. Baselines: CLI 1585 + 6 skipped (without Emscripten), C++ 512
  with one skip. Emscripten 5.0.3 for the project Wasm:
  `source /Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
- The test project is `cli/test/fixtures/departures-project/` (copy it to `tmp/` before editing).
- Load `u8g2gl-standards` before writing code (TypeScript sections; it covers the designer). No
  workspace pointers in source comments or test titles.
- Never open a browser window on the owner's desktop: Playwright runs headless, and
  `u8g2gl design` always gets `--no-open` in tests.

# WO1 — the package (`u8g2gl-e1e/wo1-scaffold`)

- [ ] `designer/`: `package.json` (ruling 1), lockfile, `tsconfig.json`, `vite.config.ts`
      aliasing `cli/src/core`, `index.html`, `src/`. `npm run build` → `designer/dist/`.
- [ ] The layout of ui_spec §6 with Dockview: activity bar, explorer (from `ProjectFileSystem.list()`),
      tabbed Monaco editors for XML, a canvas panel, Problems, Output, and a status bar with an
      editor-Wasm indicator. Panels may be stubs in WO1 except the explorer and Monaco.
- [ ] Monaco workers bundled through Vite's worker support; no CDN loads.
- [ ] Ruling 4's two routes in `cli/src/node/design/`, token-checked like every other route,
      with tests.
- [ ] Manual check: `u8g2gl design <copy of the departures project> --no-open --json`, then load
      the URL in Playwright's Chromium and screenshot the shell (save to `tmp/`).

# WO2 — the live pipeline (`u8g2gl-e1e/wo2-pipeline`)

- [ ] EDITOR-DESIGN §3.2: on each buffer change, at most **one** pipeline run per animation
      frame (parse → validate → realise → scene → Wasm `applyScene` → `renderFrame` → blit). No
      fast path.
- [ ] Validator diagnostics become Monaco markers and Problems rows; clicking a row opens the file
      at its line and column (e6).
- [ ] The canvas renders the active screen at a chosen zoom, 1-bit pixels crisp.
- [ ] The editor-Wasm indicator in the status bar shows: building, current (with the build
      hash), stale, or none. It triggers E-1d's `editor-wasm` job on load and when widget sources
      change.
- [ ] **e8:** with no toolchain, the project still opens: framework elements render from the
      framework editor Wasm, project widgets show placeholders, and the status bar says why.
- [ ] Unit tests for the pipeline scheduler and the diagnostics mapping.

# WO3 — saving and the IDE beside it (`u8g2gl-e1e/wo3-save`)

- [ ] Exactly as EDITOR-DESIGN §2.3: explicit save (⌘S / Ctrl-S); a file changed on disk while its
      buffer is clean reloads silently; while dirty, a three-way choice (keep mine, take theirs,
      compare) and **nothing is overwritten**; generated names written into the buffer on open
      and to disk only on save.
- [ ] **e3:** a save after one edit changes only that edit's bytes on disk.
- [ ] **e5:** a file opened and closed without an edit is not rewritten (mtime and bytes),
      even with names generated in the buffer.
- [ ] Selection from XML to canvas: the element under the cursor is highlighted on the canvas.

# WO4 — Playwright and CI (`u8g2gl-e1e/wo4-playwright`)

- [ ] `designer/e2e/`: tests that start `u8g2gl design` on a temp copy of the departures project
      (`--no-open`, port 0), load the shell, and check **e1, e3, e4, e5, e6, e8** end to end.
- [ ] **e2 (checkpoint C3):** keystroke to canvas, **p95 under 16 ms** with Chromium's CPU
      throttled 4× (CDP `Emulation.setCPUThrottlingRate`), on the departures project and on a
      20-element screen, over 300 keystrokes. Measure from the key event to the canvas blit
      (instrument with `performance.mark`). Report median, p95 and max per screen, and per-stage
      medians. Ruling 5: do not weaken it.
- [ ] **e7:** the e1 test runs in Chromium, Firefox and WebKit.
- [ ] One CI job in `ci.yml`: install `designer/` dependencies, Playwright browsers with
      `--with-deps`, build the CLI and the designer, run the e2e suite. The 16 ms test reports
      on CI without gating (CI machines vary); it gates locally.
- [ ] You cannot run CI. Say so, and list what the PA should check.

# Completion report

*(Worker fills in per WO: commits, dependency versions and their publish dates, CLI and C++
counts, e2 numbers with stage breakdown, browsers run, screenshots taken, anything not done,
any stop-and-report.)*
