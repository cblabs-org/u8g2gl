---
work_order: WO5
project: pr-05r-runtime-fixes
title: "Versions, a version test that needs no edit per release, and criterion 1's evidence"
branch: u8g2gl-05r/wo5-release-criterion1
base: u8g2gl-05r/wo4-height-and-bool-refs
complexity: standard
status: complete
---

# WO5 — runtime 0.8.0, CLI 0.12.0, the simplified version test, criterion 1 recorded

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition; "Rulings" R6 states the
versions; the Session Log records the owner's R3 reply ("feels like we are over-engineering
this"), the PA's simplified R3, and the owner's "continue and go until fixed". This WORKORDER's
`status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-05r`.** **Branch**:
`u8g2gl-05r/wo5-release-criterion1` (already checked out, no upstream) · **Base**:
`u8g2gl-05r/wo4-height-and-bool-refs`. Run `git branch --show-current` **as its own command
immediately before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch in `tmp/`,
never `/tmp`. `tmp/fdn/` is a `git archive` of foundation's held tip with its render harness;
build it, do not edit its sources, write nothing to any foundation repository.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover: commit what is green, set
`status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` (`references/typescript.md`, `references/documentation.md`). §4.1 on
lines you add or change. **Never publish to npm** (`rules/03`).

## Tooling Constraints

No PlatformIO work is expected. If any arises: the PlatformIO MCP only, never the `pio` CLI.

---

## Objective

Every version moves per `rules/03`, nothing has to be edited in a test the next time it does, and
criterion 1's re-measurement is recorded as evidence about U8G2GL rather than the legacy module.

## Line-Item Instructions

- [ ] **Baseline first** (clean configure, each suite alone): C++ and CLI totals — take the
      expected figures from WO4's Completion Report.
- [ ] **Runtime 0.7.0 → 0.8.0** (R6): `include/u8g2gl/u8g2gl_version.h`, `CMakeLists.txt`
      `project(... VERSION)`, `library.json` `version`. The root `CMakeLists.txt` refuses a
      mismatch among the three — let it prove them consistent.
- [ ] **Stamp the CLI's runtime floor:** `npm run build:runtime-version` in `cli/` →
      `cli/src/data/runtime-version.json` at 0.8.0. Its drift test must pass.
- [ ] **CLI 0.11.0 → 0.12.0** (R6; §13.9 — WO3 and WO4 changed generated output with no input
      change): `cli/package.json` and `cli/package-lock.json` (both `version` fields of the root
      package; `npm version 0.12.0 --no-git-tag-version` is acceptable, nothing else).
- [ ] **Simplified R3** in `cli/test/integration/generate.test.ts` (the test at about `:460`,
      "stamps the package version into a freshly generated project"): delete the literal
      `'0.11.0'` assertions; keep the test that a freshly generated header carries
      `// generator: <package.json version>` and that `--version` prints the same, and that the
      goldens do not (the `0.0.0-golden` check). Rewrite its comment: what it proves (the stamp is
      plumbed through), what it does not (that a bump happened — §13.9 is a review rule; the golden
      diff makes every output change visible in the PR), no history narration. `grep` the CLI tests
      for any other literal of the CLI or runtime version and treat it the same way; list them.
- [ ] **Regenerate** goldens and the compile fixture: `npm run build` first. The diff must be the
      runtime floor (`0.7` → `0.8`) only. Rebuild and run the C++ suite: the compile fixture's
      `U8G2GL_REQUIRE_RUNTIME_VERSION` must pass against 0.8.0, and `VersionGuard.*` must still
      refuse an older runtime by name.
- [ ] **Criterion 1 evidence.** Rebuild the harness in `tmp/fdn/` against this tip
      (`cmake --build tmp/fdn/build --target after`; its configure line is in WO4's WORKORDER) and
      write `.agents/skills/principal-architect-workspace/pr-05r-runtime-fixes/CRITERION-1.md`:
      method (what was compiled, from which commits, the display state the harness sets, the
      `-DU8G2GL_SOURCE_DIR` override, that nothing was written to foundation), the compare table
      (scenario, identical, differing, lit, `.bin` sha256), the state-probe table with the PR-05
      figures beside today's, and a plain statement of whether the PR-05 result holds **for
      U8G2GL alone** — i.e. for `plain_user_ui_handler`. Say what it does not show: the device
      (an on-device check is a later interactive step).
- [ ] design_spec: wherever it states the current runtime or CLI version, if anywhere.

## Strict Boundary Box

- **In:** the version files above, `cli/src/data/runtime-version.json`, CLI tests containing
  version literals, goldens and `test/generated_fixture/`, `CRITERION-1.md`, design_spec version
  statements.
- **Out:** any source behaviour; the schema version (0.4 — owner decision); tags, npm publish,
  pushes; foundation's repositories.

## Verification Requirement

- [ ] C++ clean configure, 0 warnings, ctest at baseline, one skip; CLI vitest at baseline (± the
      tests you changed — say which), `tsc`, lint.
- [ ] `node cli/dist/node/cli.js --version` prints `0.12.0`; a freshly generated config header
      carries `// generator: 0.12.0` and a runtime floor of 0.8.
- [ ] Golden diff is the floor only.
- [ ] `git diff --name-only <base>..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues.

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Decisions Made · Evidence · Dead Ends &
Warnings · Out-of-Scope Findings · Blockers.

### Status

**complete.** Committed on `u8g2gl-05r/wo5-release-criterion1`: `c425adc` (versions, stamp, test, goldens) and `900388e` (`CRITERION-1.md`); this report follows in its own commit. Not pushed, tagged or published.

### Baseline and final counts

| | Baseline (clean configure, WO4 tip) | Final (clean configure) |
|---|---|---|
| C++ build warnings | 0 | **0** |
| ctest | 414, 1 skip (`SizeOfReport.ThirtyTwoBitTarget`) | **414**, same skip |
| vitest | 1353 | **1353** (the one test I changed keeps its name's meaning, loses its assertions on literals; no test added or removed) |
| `tsc --noEmit` / `npm run lint` | clean | clean |

`VersionGuard.*`: 10 of 10 pass (they refuse an older runtime by name).

### Changes Made

- Runtime 0.7.0 → **0.8.0**: `include/u8g2gl/u8g2gl_version.h` (`U8G2GL_VERSION_MINOR`, and the `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7)` usage example in its doc, now `(0, 8)`), `CMakeLists.txt`, `library.json`. The root `CMakeLists.txt` configured cleanly, so it accepted the three as consistent.
- `npm run build:runtime-version` → `cli/src/data/runtime-version.json` `{0, 8, 0}`; its drift test passes.
- CLI 0.11.0 → **0.12.0**: `cli/package.json`, `cli/package-lock.json` (both root `version` fields, via `npm version 0.12.0 --no-git-tag-version`).
- `cli/test/integration/generate.test.ts`: the test is now "stamps the package version into a freshly generated project". Removed `expect(packageVersion).toBe('0.11.0')` and the `0.11.0` literals on the header and `--version`; both now compare to `packageVersion`; the `0.0.0-golden` check stays. The comment says what it proves (the stamp is plumbed through) and what it does not (that a bump happened; §13.9 is a review rule and the golden diff makes each output change visible), with no history.
- Goldens regenerated after `npm run build`: `cli/test/generator/fixtures/emit-project/expected/u8g2gl_generated_config.h` and `test/generated_fixture/generated/u8g2gl_generated_config.h`.
- `.agents/skills/principal-architect-workspace/pr-05r-runtime-fixes/CRITERION-1.md` written.

### Other version literals in the CLI tests

Searched `cli/test`, `cli/src`, `test`, `docs` for `0.11.0`, `0.7.0`, `0.12.0`, `0.8.0`, `(0, 7)`, `"0.7"`, `minor: 7`. The only hits were the five in the test above. The runtime floor is already read from the stamp (`emit-golden.test.ts` imports `RUNTIME_VERSION`; `runtime-version.test.ts` compares stamp to header), so those need no edit per release. `docs/design_spec.md` states no current runtime or CLI version (its mentions of 0.10.0, 0.6.0, 0.5.0 are history inside §16), so it is unchanged.

### Decisions Made

- Updated the doc example in `u8g2gl_version.h` (`U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7)` → `(0, 8)`) as a version statement in a version file; it is inside the Boundary Box and not behaviour.
- The state-probe table in `CRITERION-1.md` cites the "before" figures as recorded in `PROJECT.md` and WO4's WORKORDER. PR-05's own probe table is not in this repository, so none is invented.

### Evidence

- Golden diff, complete: in the two files above, the `#error` text `runtime 0.7 or newer` → `0.8 or newer` and `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);` → `(0, 8);`. Nothing else (4 lines changed in each file's two spots, 4 insertions / 4 deletions in all). The editor outputs regenerated unchanged.
- `node cli/dist/node/cli.js --version` → `0.12.0`. A project generated fresh from the `emit-project` fixture into `tmp/w5gen/`: `// generator: 0.12.0` and `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 8);`.
- The compile fixture builds and tests against runtime 0.8.0 (ctest 414 pass).
- Harness (`cmake --build tmp/fdn/build --target after`, objects rebuilt from this worktree's `src/`): five scenarios 0 differing; `no_font_pos_top`, `no_font_ref_height_all`, `plain_user_ui_handler` all **0**; truncation probe 181 of 181 identical; the five migrated `.bin` hashes equal the baseline's. Full tables in `CRITERION-1.md`.
- Criterion 1 verdict: **holds for U8G2GL alone, on the host.** Not shown: the device.
- `git diff --name-only u8g2gl-05r/wo4-height-and-bool-refs..HEAD`: the PA's `PROJECT.md` and this WORKORDER (from the dispatch commit), the nine version/golden/test files, and `CRITERION-1.md`; all within the Boundary Box.

### Dead Ends & Warnings

- `sed -i` without a backup suffix fails on macOS; used `perl -pi`.
- The harness build prints two `-Wunused-parameter` warnings from foundation's own `IGfxWidget.hpp:137`; not U8G2GL.

### Out-of-Scope Findings

- The harness's `state_probe.json` `font_mode_note` says the state saver "does not restore" the font mode. That is stale: the harness itself reports font mode 1 before and after. It is foundation's harness text, in `tmp/`; not touched.
- The harness's `U8G2GL_PINNED_SHA` (`82ec83f2`) is not enforced against the override; it only records. Worth knowing when quoting its `inputs.json`.
- Carried from WO4, unchanged: the editor-registry emitter's dead `ref.integer` branch for bool subjects.
- Rule 04: foundation's held branch pins a bare commit; the owner tagging it is still the robust fix, and this PR's merge must be a merge commit.

### Blockers

None.
