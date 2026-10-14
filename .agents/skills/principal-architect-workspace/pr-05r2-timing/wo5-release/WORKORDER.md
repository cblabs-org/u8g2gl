---
name: pr-05r2-wo5
description: Handoff instructions for Work Order 5 — release versions for PR-5R2
complexity: standard
---

# PR-5R2 / WO5 — release: runtime 0.9.0, CLI 0.13.0

## Role Definition

You are an expert senior engineer and execution-focused worker agent. You are NOT the Principal
Architect. Do not make architectural decisions, do not branch, and do not plan. Execute the
checklist below.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md` (the
Status Log records the owner's approval). Rules: `.agents/rules/`, especially
`03-versioning.md`.

## Objective

Move every version per `rules/03`. **Runtime 0.8.0 → 0.9.0**, because WO3 and WO4 add public API
(timers, the wall clock, the resume callback). The CLI stamps the runtime floor into generated code,
so the goldens change with no input change, and §13.9 then requires a generator bump: **CLI 0.12.0
→ 0.13.0**. Also record the owner-approved Q-14 wording in spec §21.

**Precedent:** PR-05R's release WO did exactly this for 0.7 → 0.8. Read
`.agents/skills/principal-architect-workspace/pr-05r-runtime-fixes/wo5-release-criterion1/WORKORDER.md`
and its Completion Report, and follow the same steps. Its "Criterion 1 evidence" item does **not**
apply here.

## Strict Boundary Box

- **Work in** `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, on branch `u8g2gl-05r2/wo5-release`
  (checked out; it contains WO1–WO4). Do not create branches.
- **In:**
  - `include/u8g2gl/u8g2gl_version.h`, root `CMakeLists.txt` `project(... VERSION)`, `library.json`
    `version`, and any other runtime-version literal you find (list them);
  - `cli/src/data/runtime-version.json`, through `npm run build:runtime-version`;
  - `cli/package.json` and `cli/package-lock.json`, through
    `npm version 0.13.0 --no-git-tag-version`, and nothing else in them;
  - regenerated goldens and the compile fixture;
  - `docs/design_spec.md` §21 (Q-14), plus any place stating the current runtime or CLI version;
  - your Completion Report.
- **Out:** all source logic, tests' logic, the schema (it stays at 0.4; schema bumps are the
  owner's decision), npm publishing, and tags. Never publish or tag (`rules/03`).

## Tooling Constraints

- C++: `cmake -S . -B tmp/build-wo5 && cmake --build tmp/build-wo5 -j && ctest --test-dir tmp/build-wo5`.
  0 warnings. Baseline is **495**, 1 skip.
- CLI, in `cli/`: `npm ci`, `npm run build`, `npx vitest run` (baseline 1353), `npx tsc --noEmit`,
  `npm run lint`. **Run the suites one after another,** not in parallel.
- Goldens: `npm run build` first, then `node test/generator/refresh-goldens.mjs` (as in PR-05R).

## Line-Item Instructions

- [ ] **Baseline:** C++ and CLI totals before any change.
- [ ] **Runtime 0.8.0 → 0.9.0** in the three files. The root `CMakeLists.txt` refuses a mismatch;
  let it prove them consistent.
- [ ] **Stamp the CLI's runtime floor:** run `npm run build:runtime-version`, so
  `runtime-version.json` reads 0.9.0. Its drift test must pass.
- [ ] **CLI 0.12.0 → 0.13.0.**
- [ ] **Grep the CLI tests** for literal `0.12.0` and `0.8` / `0.8.0` version assertions. PR-05R
  removed these on purpose, so there should be none; list any you find and treat them the PR-05R
  way.
- [ ] **Regenerate** the goldens and the compile fixture. **The diff must be the runtime floor
  (`0.8` → `0.9`) only.** If anything else moves, stop and report it: that would be a
  determinism finding.
- [ ] **Rebuild and run the C++ suite:** the compile fixture's `U8G2GL_REQUIRE_RUNTIME_VERSION`
  must pass against 0.9.0, and `VersionGuard.*` must still refuse an older runtime by name.
- [ ] **Spec §21, the Q-14 row.** Mark the SPI half answered with the owner-approved wording,
  verbatim from PROJECT.md / the device evidence: *"SPI (SSD1322, 10 MHz) measured 2026-10-13: full
  frame 11.8 ms, one label's tiles 4.4 ms; the saving is material above roughly 10 frames/s. I²C
  open."* The I²C half stays open, so keep the row open. Quote the before and after.
- [ ] **Spec:** wherever it states the current runtime or CLI version, update it, and list the
  places.

## Verification Requirement

- C++ and CLI suites green, 0 warnings, totals stated before and after. The golden diff is floor-only.
- `git status --short` clean apart from intended files.
- **Verify the branch** (`u8g2gl-05r2/wo5-release`), then commit, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not push, tag or publish.**
- Message the PA with the results.

## Issue Surfacing

Anything outside the box goes in your Completion Report. Do not fix it.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete | partial | blocked

### Changes Made
- `path/to/file` — what changed and why

### Decisions Made
- Decision description and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, and what to avoid

### Out-of-Scope Findings
- Finding description and suggested action

### Blockers
(none)
