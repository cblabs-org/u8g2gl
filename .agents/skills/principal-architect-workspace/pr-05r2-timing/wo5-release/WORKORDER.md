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

- **Work in** `../U8G2GL-05r2`, on branch `u8g2gl-05r2/wo5-release`
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
complete (committed on `u8g2gl-05r2/wo5-release`; not pushed, tagged or published)

### Counts
| | Before | After |
|---|---|---|
| C++ ctest | 495, 1 skip (`SizeOfReport.ThirtyTwoBitTarget`) | 495, same skip (clean configure); 0 warnings |
| vitest | 1353 | 1353 |
| `tsc --noEmit`, `npm run lint` | clean | clean |
`VersionGuard.*`: 10 of 10 pass.

### Changes Made
- Runtime 0.8.0 -> 0.9.0: `include/u8g2gl/u8g2gl_version.h` (`U8G2GL_VERSION_MINOR` 9, and the doc example `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 9)`), `CMakeLists.txt`, `library.json`. Root CMake accepted the three as consistent. No other runtime-version literal exists (`test/version_guard/pre_macro/.../u8g2gl_version.h` is a deliberately old fixture header, untouched).
- `cli/src/data/runtime-version.json` -> `{0, 9, 0}` via `npm run build:runtime-version`; drift test passes.
- CLI 0.12.0 -> 0.13.0: `cli/package.json`, `cli/package-lock.json` (both version fields) via `npm version`.
- Goldens: `cli/test/generator/fixtures/emit-project/expected/u8g2gl_generated_config.h` and `test/generated_fixture/generated/u8g2gl_generated_config.h`.
- `docs/design_spec.md` §21 Q-14 row.

### Golden diff
Floor only: `#error` text "runtime 0.8 or newer" -> "0.9 or newer" and `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 8);` -> `(0, 9);`, in each of the two files (2 lines each). Editor outputs unchanged. Nothing else moved; no determinism finding.

### Spec §21 Q-14 (before / after)
Before: row ended "...Adopt it only if the saving matters. U8G2 can also cap ..."
After: inserted after "Adopt it only if the saving matters.": "**SPI half answered:** SPI (SSD1322, 10 MHz) measured 2026-10-13: full frame 11.8 ms, one label's tiles 4.4 ms; the saving is material above roughly 10 frames/s. **I²C open.**" Row stays open.
Spec states no current runtime or CLI version anywhere (mentions at line ~2042 are history), so no other spec place changed.

### Decisions Made
- Updated the doc-comment example in `u8g2gl_version.h` to (0, 9), as PR-05R did.
- CLI tests: grep for `0.12.0`, `0.8.0`, `0.8` found only the golden's floor text; no literal assertions to remove.

### Dead Ends & Warnings
- Used `perl -pi` rather than `sed -i` (macOS).
- The Q-14 wording was taken verbatim from the WORKORDER; PROJECT.md contains no "11.8" text to cross-check against.

### Out-of-Scope Findings
- Rule 04 still applies: merge this PR with a merge commit; foundation's pin is a bare commit until the owner tags.

### Blockers
(none)
