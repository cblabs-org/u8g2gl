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

- [x] `designer/`: `package.json` (ruling 1), lockfile, `tsconfig.json`, `vite.config.ts`
      aliasing `cli/src/core`, `index.html`, `src/`. `npm run build` → `designer/dist/`.
- [x] The layout of ui_spec §6 with Dockview: activity bar, explorer (from `ProjectFileSystem.list()`),
      tabbed Monaco editors for XML, a canvas panel, Problems, Output, and a status bar with an
      editor-Wasm indicator. Panels may be stubs in WO1 except the explorer and Monaco.
- [x] Monaco workers bundled through Vite's worker support; no CDN loads.
- [x] Ruling 4's two routes in `cli/src/node/design/`, token-checked like every other route,
      with tests.
- [x] Manual check: `u8g2gl design <copy of the departures project> --no-open --json`, then load
      the URL in Playwright's Chromium and screenshot the shell (save to `tmp/`).

# WO2 — the live pipeline (`u8g2gl-e1e/wo2-pipeline`)

- [x] EDITOR-DESIGN §3.2: on each buffer change, at most **one** pipeline run per animation
      frame (parse → validate → realise → scene → Wasm `applyScene` → `renderFrame` → blit). No
      fast path.
- [x] Validator diagnostics become Monaco markers and Problems rows; clicking a row opens the file
      at its line and column (e6).
- [x] The canvas renders the active screen at a chosen zoom, 1-bit pixels crisp.
- [x] The editor-Wasm indicator in the status bar shows: building, current (with the build
      hash), stale, or none. It triggers E-1d's `editor-wasm` job on load and when widget sources
      change.
- [x] **e8:** with no toolchain, the project still opens: framework elements render from the
      framework editor Wasm, project widgets show placeholders, and the status bar says why.
- [x] Unit tests for the pipeline scheduler and the diagnostics mapping.

# WO3 — saving and the IDE beside it (`u8g2gl-e1e/wo3-save`)

- [x] Exactly as EDITOR-DESIGN §2.3: explicit save (⌘S / Ctrl-S); a file changed on disk while its
      buffer is clean reloads silently; while dirty, a three-way choice (keep mine, take theirs,
      compare) and **nothing is overwritten**; generated names written into the buffer on open
      and to disk only on save.
- [x] **e3:** a save after one edit changes only that edit's bytes on disk.
- [x] **e5:** a file opened and closed without an edit is not rewritten (mtime and bytes),
      even with names generated in the buffer.
- [x] Selection from XML to canvas: the element under the cursor is highlighted on the canvas.

# WO4 — Playwright and CI (`u8g2gl-e1e/wo4-playwright`)

- [x] `designer/e2e/`: tests that start `u8g2gl design` on a temp copy of the departures project
      (`--no-open`, port 0), load the shell, and check **e1, e3, e4, e5, e6, e8** end to end.
- [ ] **e2 (checkpoint C3):** keystroke to canvas, **p95 under 16 ms** with Chromium's CPU
      throttled 4× (CDP `Emulation.setCPUThrottlingRate`), on the departures project and on a
      20-element screen, over 300 keystrokes. Measure from the key event to the canvas blit
      (instrument with `performance.mark`). Report median, p95 and max per screen, and per-stage
      medians. Ruling 5: do not weaken it.
- [x] **e7:** the e1 test runs in Chromium, Firefox and WebKit.
- [x] One CI job in `ci.yml`: install `designer/` dependencies, Playwright browsers with
      `--with-deps`, build the CLI and the designer, run the e2e suite. The 16 ms test reports
      on CI without gating (CI machines vary); it gates locally.
- [x] You cannot run CI. Say so, and list what the PA should check.

# Completion report

**Worker, 2026-10-27.** WO1–WO4 done, one stop-and-report: **e2 fails** (below).

**Provenance checked** (rule 00): PROJECT.md names the parent and records the owner's standing
instruction and the dependency approval verbatim, and e-d-editor-design/PROJECT.md records the
2026-10-26 E-1 decomposition approval. PROJECT.md also says the owner did not review this WO
breakdown; I proceeded on the standing instruction, as E-1c and E-1d did.

### Commits

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-e1e/wo1-scaffold` | `bb88c11` designer package, shell, server routes |
| WO2 | `u8g2gl-e1e/wo2-pipeline` | `8478d5a` live pipeline, canvas, Wasm indicator, e8 |
| WO3 | `u8g2gl-e1e/wo3-save` | `266f200` save, reload, three-way choice, names, XML→canvas |
| WO4 | `u8g2gl-e1e/wo4-playwright` | `1992e7c` Playwright e1–e8, e2, CI job |

### Dependencies (ruling 1)

Exact versions in `designer/package.json`, lockfile committed, installed with
`npm install --before=2026-10-13`, so every transitive version is 14 days old too.

| Package | Version | Published |
|---|---|---|
| vite | 8.3.4 | 2026-10-08 |
| @vitejs/plugin-react | 6.1.2 | 2026-10-05 |
| react, react-dom | 19.3.0 | 2026-09-09 |
| dockview-react (the React binding; it brings `dockview`, `dockview-core`) | 8.5.1 | 2026-10-10 |
| monaco-editor | 0.57.0 | 2026-09-24 |
| typescript (the CLI's version) | 5.9.3 | 2025-09-30 |
| @types/react, @types/react-dom | 19.3.0 | 2026-09-09 |
| @playwright/test | 1.64.0 | 2026-10-07 |

Playwright's Chromium, Firefox and WebKit downloaded to its default cache. Nothing else.
No new package was needed: the unit tests use Playwright's runner (no browser), and the
node-side `tsconfig.node.json` takes `@types/node` from `cli/node_modules` (the CLI's own
devDependency) through `typeRoots` rather than adding it.

### Counts

- **CLI:** 1596 passed + 6 skipped, without Emscripten (baseline 1585 + 6; +11 new: the two
  new routes in the every-route token test, the designer route ×4, the Wasm route ×2,
  `static-files.test.ts` ×3). `npm run lint` clean.
- **C++:** 512, one known skip (`SizeOfReport.ThirtyTwoBitTarget`), zero warnings.
- **Designer unit:** 17 passed. **Designer e2e:** 11 passed, 1 skipped without Emscripten on
  PATH (the project-renderer test, which passes with it: 6.3 s), **e2 failing** as reported.
- Framework editor Wasm rebuilt here; `wasm/test/snapshot.test.mjs` passes at `1c0c7bb2…`.

### e2 (checkpoint C3) — STOP AND REPORT: p95 is over 16 ms

Chromium headless, CPU throttled 4×, 300 keystrokes per screen after 30 warm-up, keys spaced
0–20 ms at random. From the key event's timestamp to the end of the blit:

| Screen | Median | p95 | Max |
|---|---:|---:|---:|
| departures (9 elements) | 12.4 | **19.5** | 22.6 |
| 20 elements | 12.8 | **20.2** | 27.4 |

Stage medians / p95, ms (departures; the 20-element screen is within 0.5 ms of it):

| Monaco: key → text changed | Wait: text changed → frame | parse | resolve | realise | validate | scene | apply | render | blit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1.5 / 2.6 | **7.5 / 13.8** | 0.1 / 0.7 | 0.5 / 0.9 | 0 / 0.7 | 1.2 / 1.9 | 0.4 / 0.9 | 0.5 / 0.9 | 0.1 / 0.6 | 0 / 0.7 |

(Chromium coarsens `performance.now()` to 0.1 ms.) Two earlier runs agreed: p95 18.3/18.8 and
19.6/28.3 (the last with one 413 ms outlier).

**Reading it.** The pipeline itself is about 3 ms median and well inside EDITOR-DESIGN §3.3's
4 ms slice even throttled; Monaco's own handling is 1.5 ms. The miss is entirely the **wait
for the next animation frame** that §3.2's scheduling rule prescribes ("schedule ONE pipeline
run on the next frame"): a key lands uniformly within the 16.7 ms frame, so that wait alone
has a p95 near 14 ms. The test was not weakened; it still gates locally and fails. For the PA:
- The 16 ms budget of §3.3 (pipeline 4 + shell 8 + headroom 4) does not contain a frame wait,
  while the e2 measurement endpoint (key → blit) does. Either the endpoint or the budget needs
  restating, or the schedule changes.
- One schedule that keeps "at most one run per frame" is a leading-edge throttle: run at once
  if no run has happened this frame, otherwise on the next frame. It removes the wait but renders
  the first text of a frame rather than only the latest, which §3.2 rules out ("intermediate
  texts are never rendered"). I did not implement it: it is a design change.
- What the user sees is the same either way: a blit only reaches the screen at the next
  composite, and with rAF scheduling the blit lands in the frame that paints it.

### Browsers

e1 passes in **Chromium, Firefox and WebKit** (repeated 20× in Chromium, 5× in each of the
others). All other tests run in Chromium. Headless throughout; `--no-open` throughout.

### Screenshots (in `tmp/`, not committed)

`wo1-shell.png` (shell, Monaco), `wo2-none.png` (no toolchain: framework elements and three
placeholders), `wo2-project.png` (project renderer, hash `f68f4842`), `wo3-conflict.png`
(conflict bar and diff editor).

### Decisions and deviations to review

1. **The token rides in the path for the designer's files:** `/` redirects to
   `/app/<token>/`, and `presentedToken` accepts that segment. The bundle loads its modules,
   Monaco's workers and the framework Wasm by relative URL, which keeps a path but drops a
   query, so `?token=` cannot reach them. The check still runs before routing, on every route;
   the page sends `Referrer-Policy: no-referrer`. This touches `session-token.ts`, which I took
   as part of ruling 4's static route.
2. **The Wasm route is `GET /api/editor-wasm/<build id>/<file>`**, for a succeeded
   `editor-wasm` build only, and only its loader and module: the client can fetch only what a
   build it started produced, and no directory comes from the URL. Both routes read through one
   path-checked lookup (`static-files.ts`, the shared path rule plus `isInsideProject`).
3. **The framework editor Wasm is copied into `designer/dist/framework-wasm/`** at build time
   from `build-wasm/wasm/` (or `U8G2GL_FRAMEWORK_WASM_DIR`), so e8 works with no toolchain. A
   designer built without it warns and says so at run time.
4. **Subjects are given their declared `value`s** after every `applyScene` (§3.2's
   `applySampleData` step), so the canvas shows the boot frame; sample data proper is E-3's.
5. **Not-well-formed and schema-invalid text both keep the last good frame, dimmed** with a
   banner; §3.8's "live with problem elements hatched where the scene can still be built" is not
   done, because the scene emitter's contract is a validated model.
6. **Rebuild triggers:** every changed file outside `screens/` asks for a build, `globals.xml`
   included (§5.2 says a `globals.xml` edit needs none, but fonts are declared there). An
   unchanged build hash costs the server one `generate` and no compile.
7. **Closing a dirty tab keeps its model** (nothing is lost; the explorer shows ●); a clean one
   is disposed and never written. An explicit save of a buffer whose only change is generated
   names writes them, as ui_spec §16.1 says.
8. The "no toolchain" state is recognised from the build job's message text
   (`no Emscripten…`). A stable error code on the job would be better; that is E-1d's code.

### What the PA must check in CI (I cannot run it)

- `designer-e2e` passes on ubuntu: the emsdk cache key is shared with `wasm-tests`;
  `npx playwright install --with-deps` installs the three browsers' system libraries; the
  runner's Node 22 is put back in front of emsdk's on PATH for the suite.
- The e2 numbers in the uploaded `designer-e2e-results` artifact (`e2-performance.json`);
  CI sets `CI`, so e2 reports and does not gate there.
- Recursive `fs.watch` events arrive on Linux for the e4 tests (E-1c showed it for the CLI).
- `cli-tests` at 1596 + 6 skipped; `wasm-tests` and `determinism-check` unaffected (no CLI
  version bump; no generator output changed).

### Known limitations, not done

- `npm audit`: Monaco 0.57.0 pins DOMPurify 3.4.15, which has critical advisories (fixed in
  3.4.17, published 2026-10-12). Every Monaco release pins a vulnerable one; overriding it would
  add a version ruling 1 does not list. The designer is loopback-only and renders only the
  project's own text, but the PA should decide.
- A BOM is lost and mixed line endings are normalised on save: `ServedProjectFileSystem.read`
  decodes with a BOM-stripping `TextDecoder`, and Monaco normalises EOLs. Consistent LF or CRLF
  files round-trip byte for byte (e3).
- A project font or image the framework Wasm lacks makes the no-toolchain canvas refuse the
  scene (the banner says which); the departures project uses only built-ins it has.
- The npm package does not ship `designer/dist` (ruling 4's follow-up, beside E-1d's 8.3).
- Bundle: Monaco's full ESM build, about 15 MB in `dist/` with every language registered;
  trimming to XML only is possible later.

