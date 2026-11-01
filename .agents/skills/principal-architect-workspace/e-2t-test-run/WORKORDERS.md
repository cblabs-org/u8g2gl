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
