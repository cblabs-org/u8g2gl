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

- [x] A BOM survives open → edit → save (ruling 6). Unit test and an e2e check.
- [x] The build job's record and its SSE event carry a failure code (ruling 7): at least
      no-Emscripten and no-source-tree. The designer's "none" state reads the code; the regex goes.
      Tests on both sides.
- [x] The lock-file warning (ruling 8), with tests for: ignored, not ignored, not a work tree.
- [x] Record mixed line endings as a known limitation where E-1e's limitations are documented.

# WO4 — tokeniser locations (`u8g2gl-c1/wo4-locations`)

- [x] The five cases: text before the root read as a tag; "expected '>'" reported at the element's
      `<`; a missing `=` cascading; an empty document at 1:1; `<!DOCTYPE>` giving two errors. Each
      reports once, at the right place, with a test.
- [x] Only diagnostics goldens move, each move explained in the commit; generator goldens and
      CI's determinism script unchanged (ruling 9).

# WO5 — docs and review (`u8g2gl-c1/wo5-readability`)

- [x] Rule 04: the foundation's pinned commit is protected by the tag `v0.7.0-integration`; say
      what that changes about the merge-commit policy, without dropping the policy.
- [x] design_spec §21: Q-17's row closed against PR #24 (E-1b).
- [x] CLI 0.13.2 → 0.13.3 (ruling 10), wherever the version is stamped or asserted.
- [x] Spawn the `readability-reviewer` on C-1's diff; resolve P1–P3, decide P4 with reasons.
- [x] Final run of every suite, one at a time; a completion report at the end of this file.

# Completion report (worker, 2026-10-28)

Five branches, each from the previous tip, nothing pushed. Suites run one at a time.

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-c1/wo1-paths` | `6b75954`..`83ed0f7` (script; mechanical result `b2e1264` alone; import fix; prose; CI + notes) |
| WO2 | `u8g2gl-c1/wo2-ci` | `565c697`..`6e5f606` |
| WO3 | `u8g2gl-c1/wo3-designer` | `0a21152`..`fb4f3b2` |
| WO4 | `u8g2gl-c1/wo4-locations` | `e2be0f2`..`87a03ca` |
| WO5 | `u8g2gl-c1/wo5-readability` | `d4c084d`..this commit |

**Suites, baseline (`91a05ff`) → final:**
- CLI: 2489 passing, 6 skipped → **2510 passing, 6 skipped** (the 6 are the Emscripten tests;
  with emsdk on PATH, `test/node/design/build` and `test/node/toolchain` run 50/50, no skip).
  Lint and tsc clean.
- C++: 512, one skip (`SizeOfReport.ThirtyTwoBitTarget`) → **512, one skip**; zero warnings.
- Designer unit: 17 → **20**.
- Designer e2e: 12 passing + 1 failed (the 4×-throttled keystroke gate, a local-only timing gate:
  12 missed frames of 3 allowed) → **14 passing** (one new BOM test; the timing gate passed on
  this run). Production build: no test hook; its editing test 3/3.
- Wasm snapshot, placeholder and last-error tests pass.

**WO1.** 18,375 paths in 102 files; the script is idempotent and the guard passes on the tree.
No record holds a hash of a rewritten file (ruling 2). Shown failing on a planted tracked path.
Exempt names: Emscripten's `/home/web_user` (generated glue) and the toolchain tests'
placeholder `/Users/a`. The owner's username is matched by SHA-256, so it is in no file.

**WO2.** The cold, unbounded `-j` failure **reproduced** before the fix (3 discovery
timeouts) and did not recur in three cold runs after (60 s, set once, 29 targets).

**WO3.** BOM kept through the core `ProjectFileSystem` (additive `bom`); failure codes
`no-emscripten` / `no-source-tree`; the lock-file warning on stderr.

**WO4.** Twelve diagnostics-golden entries and one tree entry gain an additive `corrected`
block; the records themselves are unchanged. No generator golden moved.

**WO5.** Readability review 0 P1, 0 P2, 7 P3 (all fixed), 5 P4 (4 taken, 1 declined, reasons in
`94e15a7`).

**Deviations from the rulings, for the PA:**
1. Ruling 3 names "CI's existing lint job"; CI has none (`npm run lint` is not run in CI). The
   guard is a step in `cli-tests`, which already sets up Node.
2. Ruling 7 names the build job's "SSE event"; there is none. The event stream carries file
   changes only and builds are polled, so the code is on the record, which the designer reads.
3. Rule 04's premise that the pinned commit is reachable from `main` through a merge commit is
   not true: `82ec83f` is not an ancestor of `origin/main`. Only the tag (and archive tags)
   hold it. The rule now says so, with the commands to check.
4. Beyond the five listed locations, one more end-of-input cascade went with them: trailing
   whitespace at the end of an open tag was also reported as `Unexpected character ''`.
5. `cli/package-lock.json` had been left at 0.13.0 by earlier bumps; it now reads 0.13.3.

