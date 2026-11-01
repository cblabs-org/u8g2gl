---
name: e-2t-wo1-wo5
description: Work Orders 1–5 of E-2T — the firmware-target harness, the test-run job and parity corpus, the designer's verdict, run after a pause and the gates
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the five named here, do not push, do not
start other work. Execute WO1 to WO5 in order.

**Parent project:** `e-2t-test-run` ([PROJECT.md](PROJECT.md)). Its status log records the
owner's approval (rule 00), and its rulings are binding, especially ruling 10 (a mismatch is a
finding) and ruling 12 (the boundary). The design is `e-d-editor-design/EDITOR-DESIGN.md` §2.2,
§4 and §5.2. Build on what exists: `cli/src/node/design/build/` (the editor-Wasm build, its
caches and `prepare-build.ts`), `editor-wasm-job.ts` and `build-queue.ts` (the job contract),
`wasm/bridge.cpp` and `wasm/test/snapshot.test.mjs` (frames and hashing), and
`designer/src/wasm/editor-wasm-controller.ts` and `pipeline/edit-loop.ts` (the live module).

# Where you work

- Worktree `../U8G2GL-e2t`, starting on `u8g2gl-e2t/wo1-harness`. Each later WO:
  `git checkout -b u8g2gl-e2t/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
  Download no toolchain or anything else.
- Record baselines first, suites one at a time. Build the framework editor Wasm
  (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release`;
  `cmake --build build-wasm --target u8g2gl_editor`) before `npm run build:e2e`.
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles, no home-folder paths in committed files (the guard must pass), and never the owner's
  email address in anything.
- Never open a browser window on the owner's desktop: Playwright headless, `--no-open`.
- **Timing runs:** after each, check `pmset -g log` (read only) for Sleep or DarkWake inside its
  window. A run that overlaps one is void and repeated. Change no power setting; do not run
  `caffeinate`.
- **Stop and report** (to the PA, at the end of this file, then end your turn) if a parity
  mismatch appears (ruling 10), if a generator golden would move, or if the work needs anything
  outside ruling 12's boundary.

# WO1 — the harness (`u8g2gl-e2t/wo1-harness`)

- [ ] Ruling 2: `wasm/memory_display.{h,cpp}` extracted from the bridge and used by it; the
      `snapshot`, `placeholder` and `last-error` tests pass with byte-identical frames.
- [ ] The harness unit (ruling 1): tick callback, `ui_init()`, set the active screen,
      `ui_handler()` at each time, and the buffer after each call; exports to run a screen
      by index over a list of times and read back each frame.
- [ ] The test-run build in `cli/src/node/design/test-run/` (ruling 3): generate into the
      cache, emit the screen table, compile the firmware units, the widget units and the
      harness, reuse the U8G2 cache, split the runtime cache from the bridge, and link `-O3`.
      Compiler diagnostics located as the editor build's are.
- [ ] Tests: unit tests for what needs no compiler (the screen table, cache keys), and
      Emscripten tests that build and run the harness on departures, skipping with the
      existing message when there is no toolchain.

# WO2 — the job and the corpus (`u8g2gl-e2t/wo2-job-corpus`)

- [ ] The `test-run` job (rulings 3–5): params carry the dirty documents and their versions,
      the screen and the times. Stage the overlay copy in the cache, never in the project. The
      result carries per-frame bytes (base64), SHA-256 hashes, timings and the versions
      tested, and the failure codes match `editor-wasm`'s for no toolchain or no source tree.
- [ ] The bug-report writer (ruling 6): `test-runs/<stamp>/` with both frames as PBM, the
      scene, the staged text and the versions, behind its own server route with the token.
- [ ] The parity corpus (ruling 10): every listed fixture, every screen, every time, harness
      against the project editor Wasm. Add the path to CI's `wasm-tests` vitest command.
      **On any mismatch, stop and report**, with the frames, the diff and your diagnosis.
- [ ] Report cold and warm Run times on departures (ruling 11).

# WO3 — the verdict (`u8g2gl-e2t/wo3-verdict`)

- [ ] The Run button and ⌘↵ / Ctrl+Enter (ruling 8), Monaco included, with the shortcut list
      updated.
- [ ] Live frames rendered at press time from the scene that text produced, and the canvas
      restored on the next frame (ruling 5).
- [ ] The toolbar verdict in every state of ruling 6, the staleness count, and Problems for a
      failed run.
- [ ] The disabled reasons of ruling 7; while a rebuild is running, Run waits for it.
- [ ] The diff overlay with both hashes, cleared at the next edit, and *Save bug report*
      showing the path written.
- [ ] Unit tests for the comparison, the staleness count and the state machine.

# WO4 — pause, queue and gates (`u8g2gl-e2t/wo4-pause-gates`)

- [ ] Run after a pause (ruling 9): off by default, stored per browser, 2 s after the last
      edit. Queueing: at most one run waiting, with the latest text.
- [ ] e2e, all with the real toolchain:
  - Run on departures shows `✓ parity`;
  - an unsaved edit is what gets tested, and the file on disk is unchanged;
  - an edit afterwards shows `· 1 edit since`;
  - ⌘↵ inside Monaco runs and inserts no line;
  - each disabled reason is shown.
- [ ] The self-test hook (ruling 11): one flipped harness pixel shows `≠ 1 px differ` and the
      overlay. It is test-build only, and the production no-hook grep is extended to match it.
- [ ] Ruling 11's gates: keystroke, drag (1× and 2×, panel open) and panel share, re-measured
      with thresholds unchanged. Then the keystroke gate once more, while a test run compiles,
      and report that figure.

# WO5 — review and evidence (`u8g2gl-e2t/wo5-readability`)

- [ ] Spawn the `readability-reviewer` on E-2T's diff against `07f59a0`. Resolve P1–P3;
      decide each P4 with a reason.
- [ ] Screenshots under `tmp/e2t/`: Run idle, running, `✓ parity`, stale, the mismatch
      overlay (via the hook), and a disabled reason.
- [ ] Docs:
  - EDITOR-DESIGN §4.4 marked built;
  - `docs/implementation_plan.md` §5 with E-2 and E-2T done;
  - the widget-author docs saying what Run checks.
- [ ] CLI 0.15.0 (rule 03), confirming that no golden moved.
- [ ] Final run of every suite, one at a time:
  - guard;
  - CLI, lint, tsc;
  - goldens;
  - C++ (`cmake -S . -B build/v`, `ctest`);
  - Wasm and its node tests;
  - the Emscripten CLI tests;
  - `build:e2e`;
  - designer unit;
  - e2e;
  - production and its no-hook grep.

  Then a completion report at the end of this file.

---

# Completion report (worker, 2026-11-01)

Provenance checked before starting: this file names `e-2t-test-run`, and its PROJECT.md status
log records the owner's "Approved, proceed" (2026-11-01). WO1 to WO5 done, in order, one branch
each, committed locally, nothing pushed. **No parity mismatch, no golden moved, nothing changed
in `include/`, `src/`, `core/generator` or the schema.**

## Branches and commits

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-e2t/wo1-harness` | `3f4f58c` the firmware-target harness on a shared memory display |
| WO2 | `u8g2gl-e2t/wo2-job-corpus` | `4981a15` the test-run job, the bug report, and the parity corpus |
| WO3 | `u8g2gl-e2t/wo3-verdict` | `6777c69` Run, the parity verdict, and the mismatch overlay |
| WO4 | `u8g2gl-e2t/wo4-pause-gates` | `2acaf3b` Run after a pause, the test-run e2e and self-test, the gates |
| WO5 | `u8g2gl-e2t/wo5-readability` | the commit carrying this report |

## What was built

- **WO1.** `wasm/memory_display.{h,cpp}` (extracted from the bridge; the bridge uses it).
  `wasm/harness.{h,cpp}`: tick callback, `ui_init()` at t = 0, `u8g2gl_set_active_screen()`,
  `ui_handler()` at each time, buffer kept after each call; one boot per instance (a second
  `runScreen()` is refused), so Node instantiates afresh per screen. `cli/src/node/design/test-run/`
  `screen-table.ts` (the table unit, from the generated scene; `screenDescriptorIdentifier()`),
  `test-run-build.ts` (generate into the cache, compile, link `-O3`), `harness-runner.ts`.
  Shared flag/cache/diagnostic code moved to `build/compile-units.ts`; caches are now
  `u8g2/`, `runtime/` (runtime + memory display, shared by both builds), `editor-host/` (bridge,
  scene parser) and `harness/`, all at the editor's flags and configuration hash. Firmware units
  and widgets compile **without** `U8G2GL_EDITOR` into `obj-firmware/`.
  Byte-identical check: the three bridge tests' full output, and SHA-256 of every fixture screen
  at all eight times through the framework editor Wasm (24 frames), identical before and after.
- **WO2.** `test-run-job.ts` (params `screen`, `documents` `{path, content, version}`, `times`;
  result frames base64 + SHA-256, timings, versions; editor-wasm's failure codes),
  `stage-project.ts` (synchronised staged copy at `<project cache>/staged/`, never the project),
  `bug-report.ts` + `register-test-run.ts` (`POST /api/test-run/report`, through a new
  token-checked `registerJsonRoute()` on the design server). Parity corpus in
  `cli/test/node/design/test-run/parity-corpus.test.ts`; CI's wasm-tests vitest path extended.
- **WO3.** `designer/src/test-run/verdict.ts` (comparison, toolbar text, availability) and
  `test-run-controller.ts` (state machine, queue, wait-for-rebuild); `ui/test-run-controls.tsx`;
  ⌘↵/Ctrl+Enter in `ui/app.tsx`'s capture handler; diff overlay in `canvas-view.ts`;
  `edit-loop.ts` gains `settled()`, `requestRun()`, `showDiff()`, `addDiagnosticSource()`;
  keyboard reference row in `docs/ui_flows.md` §2.9.
- **WO4.** *Run after a pause* (off by default, `localStorage`, 2 s). `e2e/test-run.spec.ts`
  (6 tests) and the keystroke-during-compile measurement in `e2e/performance.spec.ts`. CI's
  no-hook grep extended with `u8g2gl:flip-harness-pixel`; checked absent from the production
  bundle and present in the e2e bundle.
- **WO5.** Review resolved (below); screenshots `tmp/e2t/01-run-idle.png` … `07-disabled-not-well-formed.png`
  (idle, running, parity, stale, mismatch overlay, report saved, disabled); docs: EDITOR-DESIGN
  §4.4 marked built, `implementation_plan.md` E-2 and E-2T done, `design_spec.md` §6.5 "What the
  designer's Run checks"; CLI 0.15.0 (goldens: `git diff 07f59a0 -- cli/test/generator/fixtures`
  empty).

## Parity corpus

| Project | Screens | Frames compared | Differ |
|---|---|---|---|
| departures | 1 | 8 | 0 |
| emit-project | 1 | 8 | 0 |
| test/generated_fixture | 3 | 24 | 0 |
| widget probe, schema 0.4 | 1 | 8 | 0 |
| valid-project | — | refused by `generate` in both targets (`<focus_ring>`, U8G2GL_NOT_YET_SUPPORTED); asserted as a refusal | — |

## Final suite results (one at a time, on the finished tree)

| Suite | Result |
|---|---|
| Guard (`check-home-paths`) | pass; no owner email in any changed file |
| CLI build, lint, tsc | pass |
| CLI vitest (with Emscripten) | 122 files, 2611 tests pass (baseline 118 / 2555) |
| Goldens (`test/generator`) | 18 files, 272 pass; no golden diff vs `07f59a0` |
| C++ (`cmake -S . -B build/v`, ctest) | 512/512 (one pre-existing skip, SizeOfReport.ThirtyTwoBitTarget); 0 warnings |
| Wasm build and node tests | snapshot (golden 1c0c7bb2…), placeholder, last-error pass; 0 warnings |
| Emscripten CLI tests (CI's path) | 8 files, 88 tests, no "skipped, no Emscripten" |
| `build:e2e` | pass |
| Designer unit | 137 pass (baseline 128) |
| e2e (Chromium, Firefox, WebKit) | 75 pass (baseline 68) |
| Production build, no-hook grep, production e2e | clean; 3 pass |

## Gates (thresholds unchanged; all CPU 4×; pmset: no Sleep/DarkWake/Wake in any window)

Final e2e window 13:55:04–13:58:09 (also clean at WO4, 13:43:34–13:46:38).

| Gate | Result |
|---|---|
| Keystroke, departures | 300/300 first frame; run→blit p95 3.6 ms (key→blit reported p95 18.5 ms) |
| Keystroke, 20 elements | 300/300; run→blit p95 3.4 ms (key→blit p95 18.1 ms) |
| Drag 1× / 2×, panel open, departures | 300/300 each; input→blit p95 9.7 / 8.8 ms |
| Drag 1× / 2×, 20 elements | 300/300 each; p95 8.6 / 9.0 ms |
| Panel share | p95 1.2 ms |
| Self-tests (frame, drag, share) | each still fails its gate when forced |
| **Keystroke while test runs compile** (reported) | 296 of 300 keys with a run in flight; 300/300 first frame; run→blit p95 3.4 ms, max 12.3 ms; key→blit p95 18.8 ms. Under 16 ms: no parallelism ruling needed |

## Run time on departures (through the job; pmset clean 13:20:31–13:21:06)

- Cold, empty cache: 7.4, 4.9, 4.6 s (first includes the OS file cache).
- First Run after the editor Wasm has built (U8G2 and runtime shared): 3.4 s.
- **Warm, after a screen edit: 3.1, 3.1, 3.0 s** (compile ~0.6 s, `-O3` link ~2.4 s): under the 5 s target.
- Warm, text unchanged (harness current): 45 ms.

## Readability review (readability-reviewer, diff vs `07f59a0`)

- P1: none.
- P2: the parity corpus read G-PROBE-2's probe project from the PA workspace. **Resolved:** copied
  (sources only) to `cli/test/node/design/test-run/fixtures/widget-probe-0.4/`.
- P3: new lines cited EDITOR-DESIGN §… and rulings, which are workspace-only. **Resolved:** each
  replaced with the fact it stood for; two test titles renamed. Older code's citations untouched.
- P3: `compileOne` without step comments or a why for pruning. **Resolved.**
- P3: `TestRunController.run()` state machine undocumented. **Resolved** (steps for coalescing,
  silent-unless-pressed, parked-for-rebuild, run).
- P4: stage comments in `TestRunControls` JSX — **declined**: a presentational component, two
  short regions, comments would restate the markup.
- P4: two `differingPixels` (CLI count, designer positions) — **kept separate**, with a why-comment:
  the packages share no runtime code.
- Screenshots found two layout faults, fixed: the Run group wrapped mid-label in a narrow canvas
  panel, and the hash legend overflowed it.

## Decisions the rulings did not cover

1. **`test/CMakeLists.txt` changed (one line)**: the host `test_wasm_parity` target compiles
   `bridge.cpp`, which now needs `wasm/memory_display.cpp`. Not in ruling 12's list, but a direct
   consequence of ruling 2; nothing else under `test/` changed. PA to confirm.
2. **The live side applies the subjects' declared values** after `selectScreen`, as the designer's
   live pipeline does; the corpus does the same. Without it the boot frame differs (the scene
   carries no values), which is a harness-setup error, not a mismatch.
3. Firmware units and widgets compile without `U8G2GL_EDITOR`; the runtime is shared with it, per
   ruling 3 (only `u8g2gl_editor.{h,cpp}` test that macro, so layouts agree).
4. valid-project kept in the corpus as an asserted refusal (see table).
5. The self-test flips a harness pixel **in the page**, behind `__U8G2GL_TEST_HOOKS__`; so a bug
   report saved during the self-test records 0 differing pixels: the report takes the harness
   frame from the run's record, not from the page, and the e2e asserts exactly that.
6. Run is also unavailable when the editor Wasm build **failed**, and when the canvas shows the
   **last good frame** (errors it cannot draw): there is no comparable live frame.
7. The overlay is not drawn if the user edited while the server worked (the canvas already shows
   other text); the verdict still shows, marked stale.
8. "Edits since" counts content-change events; the posted version is Monaco's model version id.
9. The queue (at most one, latest text) is in WO3's controller, since it is part of its state
   machine; WO4 tests it.
10. Shortcut list: the designer has none in-app, so ⌘↵ went into `docs/ui_flows.md` §2.9 and the
    Run button's tooltip (both say it overrides Insert Line Below).
11. e2e: the no-source-tree reason is shown via a network double of the editor-wasm record, and
    the placeholder reason by setting the frame state, since both are hard to produce for real
    (an npm install; a widget added before its rebuild). Unit tests cover the logic.
12. Dependencies were installed with `npm ci --offline` from the local npm cache (no download,
    lockfiles unchanged).

## Open issues

- The corpus's frames barely move over time (departures' message is empty, so no scrolling label
  is compared); animation parity is exercised only by emit-project and the fixture's home screen.
  Sample data (E-3) through the generated setters would deepen it.
- Decision 1 above needs the PA's confirmation.
