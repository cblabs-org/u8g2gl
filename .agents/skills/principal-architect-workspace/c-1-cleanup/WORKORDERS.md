---
name: c-1-wo1-wo5
description: Work Orders 1–5 of C-1 — paths, CI pins, gtest timeout, designer fixes, tokeniser locations, docs
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond the five named here, do not push, do not
start other work. Execute WO1 to WO5 in order.

**Parent project:** `c-1-cleanup` ([PROJECT.md](PROJECT.md)). Its rulings are binding, especially
ruling 11 (the boundary). Read it and the provenance it records (rule 00). The items' background is
in the status logs and follow-up notes of `e-1b-parser-on-cst/PROJECT.md`,
`e-1d-project-wasm/PROJECT.md` and `WORKORDERS.md`, and `e-1e-shell/PROJECT.md` and
`WORKORDERS.md`; E-1a's five wrong locations are in `e-1a-cst/`.

# Where you work

- Worktree `../U8G2GL-c1`, starting on `u8g2gl-c1/wo1-paths`. Each later WO:
  `git checkout -b u8g2gl-c1/woN-<name>` from the previous tip. Verify the branch before every
  commit. Commit as you go; **do not push**. Scratch in `tmp/`.
- `extern/u8g2` is checked out. Record your own baselines first (CLI, designer unit, designer
  e2e, C++), and run suites one at a time.
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments or test
  titles.
- Never open a browser window on the owner's desktop; Playwright runs headless, `u8g2gl design`
  gets `--no-open` in tests.

# WO1 — paths (`u8g2gl-c1/wo1-paths`)

- [x] `scripts/` gains the rewrite script (ruling 1) and the guard (ruling 3). Run the rewrite;
      commit the script and its result as separate commits, so the result's diff is reviewable on
      its own.
- [x] Read every non-evidence change and reword prose where the mechanical result reads badly.
- [x] Ruling 2's note in each evidence folder touched; the hash check.
- [x] The guard runs in CI's lint job and passes on the tree; a test or a self-check shows it
      fails on a planted path.

# WO2 — CI and the C++ build (`u8g2gl-c1/wo2-ci`)

- [x] Every `uses:` pinned by full SHA with the tag in a comment (ruling 4); resolve each SHA from
      the action's repository, and record how in the commit message.
- [x] `.github/dependabot.yml`, `github-actions` only, weekly.
- [x] `DISCOVERY_TIMEOUT` set once for every `gtest_discover_tests` (ruling 5). Show the cold
      parallel build passing that failed before (`rm -rf` the build dir, unbounded `-j`), or
      report that you could not reproduce the failure.

# WO3 — designer and server (`u8g2gl-c1/wo3-designer`)

- [ ] A BOM survives open → edit → save (ruling 6). Unit test and an e2e check.
- [ ] The build job's record and its SSE event carry a failure code (ruling 7): at least
      no-Emscripten and no-source-tree. The designer's "none" state reads the code; the regex goes.
      Tests on both sides.
- [ ] The lock-file warning (ruling 8), with tests for: ignored, not ignored, not a work tree.
- [ ] Record mixed line endings as a known limitation where E-1e's limitations are documented.

# WO4 — tokeniser locations (`u8g2gl-c1/wo4-locations`)

- [ ] The five cases: text before the root read as a tag; "expected '>'" reported at the element's
      `<`; a missing `=` cascading; an empty document at 1:1; `<!DOCTYPE>` giving two errors. Each
      reports once, at the right place, with a test.
- [ ] Only diagnostics goldens move, each move explained in the commit; generator goldens and
      CI's determinism script unchanged (ruling 9).

# WO5 — docs and review (`u8g2gl-c1/wo5-readability`)

- [ ] Rule 04: the foundation's pinned commit is protected by the tag `v0.7.0-integration`; say
      what that changes about the merge-commit policy, without dropping the policy.
- [ ] design_spec §21: Q-17's row closed against PR #24 (E-1b).
- [ ] CLI 0.13.2 → 0.13.3 (ruling 10), wherever the version is stamped or asserted.
- [ ] Spawn the `readability-reviewer` on C-1's diff; resolve P1–P3, decide P4 with reasons.
- [ ] Final run of every suite, one at a time; a completion report at the end of this file.
