# C-1: Cleanup After E-1

**Parent:** none; a hygiene PR between E-1 and E-2. Its items are the follow-ups recorded in the
status logs of `e-1a-cst`, `e-1b-parser-on-cst`, `e-1d-project-wasm` and `e-1e-shell`, plus the
owner's pre-publication request to remove home-folder paths. **Base:** `main` @ `ec4cd01` (E-1e
merged). **Worktree:** `../U8G2GL-c1`.

## Owner approval

The PA proposed the five Work Orders below in chat on 2026-10-28. The owner answered, before the
plan was given:

> "yes clean up the paths to repo relative too - thanks"

and then, on the plan itself:

> "Approved, proceed"

Both given 2026-10-28.

## Decomposition

| WO | Topic | Branch | Status |
|---|---|---|---|
| WO1 | Home-folder paths out of the tree, and a CI guard that keeps them out | `u8g2gl-c1/wo1-paths` | ⏳ |
| WO2 | CI actions pinned by SHA, Dependabot for actions; gtest discovery timeout | `u8g2gl-c1/wo2-ci` (from WO1's tip) | ⏳ |
| WO3 | Designer and server: BOM kept on save, a failure code for no-toolchain, the lock-file warning | `u8g2gl-c1/wo3-designer` | ⏳ |
| WO4 | The five tokeniser error locations E-1a judged wrong | `u8g2gl-c1/wo4-locations` | ⏳ |
| WO5 | Rule 04's wording, Q-17's row, CLI 0.13.3; readability review and PA verification | `u8g2gl-c1/wo5-readability` | ⏳ |

## PA rulings

1. **Path rewrite rules (WO1).** A path under one of this repository's checkouts
   (`<home>/Documents/Projects/U8G2GL` or `U8G2GL-<anything>`) becomes repo-relative: the checkout
   prefix and its slash are removed; a bare checkout root becomes `.`. Any other path under the
   home folder becomes `~/…`. The rewrite is a committed, re-runnable script, so a reviewer can
   check it rather than trust it. In prose (records, not logs) the worker may reword a sentence
   where the mechanical result reads badly; evidence logs are rewritten mechanically only.
2. **Evidence logs are rewritten, and say so.** Each evidence folder touched gets a line in its
   README or EVIDENCE.md: paths rewritten 2026-10-28 by the named script, nothing else changed. If
   any record holds a hash **of a rewritten file** (not of a firmware image), stop and report.
3. **The guard** is a script under `scripts/` run by CI's existing lint job, failing on any
   tracked file containing an absolute home path (`/Users/<name>`, `/home/<name>`) or the owner's
   username. It must not match itself.
4. **Actions are pinned to the full commit SHA of the release tag they use today**, with the tag in
   a trailing comment; no version changes in this PR. `.github/dependabot.yml` covers
   `github-actions` only, weekly.
5. **gtest:** CMake's floor is 3.16, so `DISCOVERY_MODE PRE_TEST` (3.18) is out. Use a
   `DISCOVERY_TIMEOUT` on every `gtest_discover_tests`, set once (a variable or a small helper),
   not 29 hand-edited calls. Do not raise the CMake floor.
6. **BOM:** a file read with a BOM is written back with one. Mixed line endings remain normalised
   (Monaco cannot keep them): recorded as a limitation, not fixed.
7. **The failure code** is an additive field on the build job's record and its SSE event; the
   message text is unchanged. The designer decides "no toolchain" from the code alone.
8. **The lock file:** `u8g2gl design` prints one warning at start when the project is in a git
   work tree and `git check-ignore` says the lock file is not ignored. It never edits `.gitignore`.
   No git, or not a work tree: silent.
9. **Locations (WO4)** move only the diagnostics goldens; generated output stays byte-identical.
   If a generator golden moves, stop and report.
10. **Version:** CLI 0.13.2 → 0.13.3 (rule 03, a patch bump for fixes). No runtime or schema bump.
11. **Boundary:** the files the items above need, their tests, the records named here, rule 04,
    design_spec §21's Q-17 row, `package.json`/lockfile versions. Nothing in E-2's scope
    (hatched invalid state, allocation spikes, bundle size), no packaging change.

## Status log

- **2026-10-28.** Worktree created from `main` @ `ec4cd01`, `extern/u8g2` checked out. WO1–WO5
  issued to one worker in order.
