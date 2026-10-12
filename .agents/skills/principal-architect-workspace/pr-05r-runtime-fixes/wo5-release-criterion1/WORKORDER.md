---
work_order: WO5
project: pr-05r-runtime-fixes
title: "Versions, a version test that needs no edit per release, and criterion 1's evidence"
branch: u8g2gl-05r/wo5-release-criterion1
base: u8g2gl-05r/wo4-height-and-bool-refs
complexity: standard
status: dispatched
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
