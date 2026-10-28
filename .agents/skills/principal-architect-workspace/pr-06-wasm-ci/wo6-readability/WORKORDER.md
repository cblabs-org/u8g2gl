---
name: pr-06-wo6
description: Handoff instructions for Work Order 6 — readability and verification
complexity: mechanical
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not branch, and do not plan. Your task is strictly limited to
> executing the checklist below.

# Objective

Final readability pass across the PR, verify test counts against baselines, and
produce evidence that the CI checks can fail.

**Parent project:** `pr-06-wasm-ci` — owner approved decomposition 2026-10-15.

# Strict Boundary Box

- Touch-up comments, whitespace, file headers across any file changed in this PR.
- Do **not** make functional changes (no logic, no new tests, no API changes).
- The branch will be `u8g2gl-06/wo6-readability`, branched from WO5's tip.

# Tooling Constraints

- Build and test with CMake and the CLI's test runner.
- Run both suites and report counts against baselines.

# Line-Item Instructions

## 1. Readability pass

- [ ] Review every file changed in the PR (`git diff --name-only origin/main`).
- [ ] Check for: consistent file headers (SPDX, copyright), Doxygen on public
  APIs, step-breakdowns in non-trivial functions, why-comments where rationale
  is non-obvious.
- [ ] Fix any inconsistencies. Use the u8g2gl-standards skill at
  `.agents/skills/u8g2gl-standards/SKILL.md` as the reference.

## 2. Verify test counts

- [ ] Run the C++ suite: `cd build && ctest --output-on-failure`
  Report total tests, passed, failed, skipped. Baseline: **501** (1 known skip).
  The count must be ≥ 501 (new tests add to it).

- [ ] Run the CLI suite: `cd cli && npm test`
  Report total tests, passed, failed. Baseline: **1353**.

- [ ] Report zero warnings from the C++ build.

## 3. Evidence the CI checks can fail

The bridge specifically asks for "evidence that the CI checks can fail, not just
that they pass." For each CI check:

- [ ] **Both suites:** Introduce a deliberate test failure (e.g. a bad assertion),
  run the suite, observe the failure, then revert. Record the output.

- [ ] **Xtensa cross-compile:** The inverted positive control is the evidence —
  it must fail when run against the pre-fix fixture. Confirm CI runs it and it
  fails as expected.

- [ ] **Determinism check:** WO4 should have demonstrated this. Confirm the
  evidence is present.

- [ ] Record all evidence in the commit message or a brief note in
  `.agents/skills/principal-architect-workspace/pr-06-wasm-ci/EVIDENCE.md`.

## 4. Final verification

- [ ] `git status` — clean working tree.
- [ ] `git branch --show-current` — `u8g2gl-06/wo6-readability`.
- [ ] `git log --oneline u8g2gl-06/wo1-runtime-debts..HEAD` — all commits
  from all WOs are present.

# Verification Requirement

Conventional commit: `style: readability pass for PR-06`.

# Issue Surfacing

Surface out-of-scope findings in the Completion Report.

---

## Completion Report (written by the worker at task completion)

### Status

### Changes Made

### Decisions Made

### Dead Ends & Warnings

### Out-of-Scope Findings

### Blockers
