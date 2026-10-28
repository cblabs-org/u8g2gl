# Recovered scratch evidence

These files were written to the git-ignored `tmp/` of the `U8G2GL-05r` worktree (branch
`u8g2gl-05r/wo6-readability`, tip `81e533f`) and cited by this project's work orders but never
committed. They were recovered when that worktree was removed on 2026-10-26 and filed here
unedited. `.log` files are renamed `.txt` because `*.log` is git-ignored.

The one exception to "unedited": **paths rewritten 2026-10-28** by `scripts/rewrite-home-paths.mjs` (C-1): absolute home-folder paths in these logs were made repo-relative (under a checkout of this repository) or `~/…` (elsewhere). Nothing else in them changed. No hash recorded here is of a rewritten file.

| Folder | Original `tmp/` path | What it is |
|---|---|---|
| `wo1/` | `bench/*.txt`, `repro_{before,after}.txt` | State-saver cost benchmark (WO1, re-run in WO4 as `wo4_*`) and the ambient-state failure reproduction |
| `wo3/` | `wo3/{a_include_final,b_middleware,c_*,native_*,rig_generate}.log` | PlatformIO rig builds quoted in WO3 |
| `wo4/` | `wo4_mcp_fixture_*.log`, `wo4_part*.txt`, `wo4_cli_before.txt`, `wo4_fdn_*` | WO4 before/after captures (`wo4_` prefix dropped) |
| `wo7-device/` | `device/logs/{before,after,upload_after}.log` | Criterion 1 serial captures and the flash log (CRITERION-1.md) |

**Left out:** routine configure, build, ctest, vitest, lint and tsc logs (`base_*`, `final_*`,
`w5*`, `r1a_*`, `wo4_base_*`, `wo4_final_*`); PROJECT.md records their counts. Snapshot copies of
repository files (`arch/`, `wo3tip/`, `fdn/`, `device/runtime-before/`) are reproducible from git.
