---
name: e-2j-wo1-wo3
description: Work Orders of E-2j — element tree in the Explorer, designer-only hiding, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the three named here.
- Do not push.
- Do not start other work.

Execute **WO1, then WO2, then WO3**.

**Parent project:** `e-2j-element-tree` ([PROJECT.md](PROJECT.md)). Its rulings are binding,
and its "Two kinds of hidden" section is the reason for most of them: read it first. The owner's
approval is recorded in its status log (rule 00). Read `.agents/rules/03-versioning.md` before
WO3.

# Where you work

- **Worktree:** `../U8G2GL-e2j`, starting on `u8g2gl-e2j/wo1-element-tree` (based on
  `909a32e`, upstream unset). Cut each later branch from the previous tip with
  `git checkout -b <name>`: `u8g2gl-e2j/wo2-design-hidden`, then `u8g2gl-e2j/wo3-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`, and again after every
    `bridge.cpp` change.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build: always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Flakes:** the two known ones were fixed (#53, #54). If any e2e fails, re-run it alone and
  report both runs; do not weaken a test to pass.
- **Versions:** never tag, never publish. Bump only what WO3 names.

# WO1 — element tree (`u8g2gl-e2j/wo1-element-tree`)

- [ ] Ruling 1: element rows under each Screens entry, nested, in document order, from the
      current buffer, built by a pure unit-tested function; expand state remembered per browser.
- [ ] Ruling 2: selection both ways through `SelectionModel`; opening another screen on row click.
- [ ] Ruling 3: tree roles and keyboard; file rows' context menu unchanged.
- [ ] Ruling 10's WO1 tests (tree builder unit tests; e2e for rows, row → canvas, canvas → row,
      keyboard). Render counts unchanged.

# WO2 — designer-only hiding (`u8g2gl-e2j/wo2-design-hidden`)

- [ ] Ruling 4: `setDesignHidden` and `getRuntimeHidden` in `wasm/bridge.cpp`, the export list,
      the header block, the optional wrapper in `editor-module.ts`, and the Wasm tests (added to
      `ci.yml` beside the existing three).
- [ ] Ruling 5: framework sources in the build hash, with its unit test; the disabled-eye
      fallback.
- [ ] Ruling 6: the hidden model, effective set with descendants, persistence, re-applied by the
      live loop and **never** by the test-run path.
- [ ] Rulings 7–9: the eye, Show all, hit-testing / marquee / outlines, the dashed selection,
      the toolbar badge, the "hidden by data" marker.
- [ ] Ruling 10's WO2 tests, including: a test run with an element hidden still reports parity,
      and toggling leaves the file clean.

# WO3 — docs, version, review, evidence (`u8g2gl-e2j/wo3-docs-review`)

- [ ] Ruling 11: `ui_spec`, the `ChangeLog`, and CLI 0.16.5 in `cli/package.json` and its lock
      file.
- [ ] Run the readability review (the `readability-reviewer` agent, or the standards skill's
      checklist) over the E-2j diff, and fix its findings.
- [ ] Re-run every suite one at a time, including the three existing Wasm tests and yours, and
      `scripts/refresh-goldens.mjs` on the built CLI (it must leave an empty diff). Run
      `scripts/check-package.mjs` from the repository root with Emscripten sourced.
- [ ] Write a completion report at the end of this file: commits per WO, suites before and after,
      decisions taken under the rulings, and anything left open.
