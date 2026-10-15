---
name: pr-06-wo4
description: Handoff instructions for Work Order 4 — determinism check
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not branch, and do not plan. Your task is strictly limited to
> executing the checklist below.

# Objective

Add the §13.9 determinism condition as a CI check (a diff property, not a test),
demonstrate it failing, and remove the stopgap wording from the standards skill.

**Parent project:** `pr-06-wasm-ci` — owner approved decomposition 2026-10-15.

# Strict Boundary Box

- Touch only `.github/workflows/ci.yml` and
  `.agents/skills/u8g2gl-standards/SKILL.md`.
- Do **not** modify runtime source, CLI source, or test files.
- The branch will be `u8g2gl-06/wo4-determinism-check`, branched from WO3's tip.

# Tooling Constraints

- This WO writes a CI workflow step (shell script) and edits a skill file.
- Test the shell script locally by running it against a synthetic git diff.

# Context: the §13.9 determinism condition

A generator change that alters output **without an input change** is a breaking
change and requires a generator version bump. This is checked as a condition on
the diff, not as a test — a test sees one commit and the rule is about two.

The committed goldens under `cli/test/generator/fixtures/*/expected/**` are
stamped `// generator: 0.0.0-golden`, so they never move on a version bump and
move only on a real output change.

The condition: if a golden file under `cli/test/generator/fixtures/*/expected/**`
changed in this PR's diff, **and** no fixture **input** file in the same fixture
directory changed (the `screens/`, `assets/`, `widgets/` directories and the
root XML files), **then** the CLI version in `cli/package.json` must differ from
the merge base's.

The input clause matters: editing a fixture's XML *is* an input change and does
not trigger the version check.

# Line-Item Instructions

## 1. Add the determinism check to the CI workflow

- [ ] In `.github/workflows/ci.yml`, add a new job (or step in an existing job)
  called `determinism-check` that runs after the CLI tests.

- [ ] The step should:
  1. Compute the merge base: `git merge-base HEAD origin/main`
  2. Get the list of changed files: `git diff --name-only $MERGE_BASE HEAD`
  3. Check if any file matching `cli/test/generator/fixtures/*/expected/**`
     changed.
  4. If yes, for each fixture directory that has a changed golden, check if any
     input file in that fixture also changed. Input files are anything under the
     fixture directory that is NOT under `expected/`.
  5. If a golden changed WITHOUT an input change, compare the CLI version in
     `cli/package.json` between HEAD and the merge base. If the versions are
     identical, **fail** with a clear message: "Generator output changed without
     an input change and without a CLI version bump (§13.9)."
  6. If all golden changes have either a corresponding input change or a version
     bump, **pass**.
  7. If no goldens changed at all, **pass** (trivially).

- [ ] The step must handle the merge-base case correctly on PRs. GitHub Actions
  provides `${{ github.event.pull_request.base.sha }}` but this may not be
  available for push events. Use `git merge-base` with a fetched `origin/main`.
  Make sure `fetch-depth: 0` is set on the checkout action (or at least enough
  depth to reach the merge base).

## 2. Demonstrate the check failing

- [ ] Create a test script (in `tmp/` or as a CI test step) that:
  1. Creates a temporary git commit that modifies a golden file without changing
     any input and without bumping the CLI version.
  2. Runs the determinism check script against that commit.
  3. Asserts the check **fails**.
  4. Cleans up the temporary commit.

- [ ] Record the failure output in a comment in the workflow file or in the
  commit message, so it's evident the check was proven to detect violations.

## 3. Remove the stopgap wording from the standards skill

- [ ] In `.agents/skills/u8g2gl-standards/SKILL.md`, find the determinism bullet
  (lines ~147-155) and remove the stopgap wording. The current text says:

  ```
  **Reviewer's question, until CI carries it (§17.3):** ...
  **This is a stopgap with a named successor**: PR-06 makes it a condition
  checked on the diff, and this bullet then describes what the machine already
  enforces.
  ```

- [ ] Replace with wording that states the condition is checked in CI (§17.3),
  referencing the workflow, and describing what it checks. Keep the description
  of what determinism means (no timestamps, document order, sorted includes).
  Remove the "reviewer's question" framing entirely — it is now machine-enforced.

## 4. Verify

- [ ] The determinism check script runs correctly against the current diff
  (should pass trivially since no goldens are changing in this WO).
- [ ] The failure demonstration works.
- [ ] `git branch --show-current` — `u8g2gl-06/wo4-determinism-check`.

# Verification Requirement

Conventional commit messages: `ci: add §13.9 determinism check`,
`docs(skill): replace determinism stopgap with CI reference`.

# Issue Surfacing

Surface out-of-scope findings in the Completion Report.

---

## Completion Report (written by the worker at task completion)

### Status
Complete, verified, and approved by Principal Architect.

### Changes Made
1. Added `determinism-check` CI job in `.github/workflows/ci.yml` running after `cli-tests` (`needs: cli-tests`), computing merge-base against `origin/main` (with `fetch-depth: 0` and `git fetch origin main`), inspecting fixture goldens under `cli/test/generator/fixtures/*/expected/**`, checking for accompanying fixture input changes, and enforcing a CLI version bump in `cli/package.json` if goldens changed unaccompanied.
   - Commit: `f75710e` `ci: add §13.9 determinism check`
2. Demonstrated failure against a synthetic commit modifying a golden file without fixture input or CLI version bump; asserted exit code 1 and required message `::error::Generator output changed without an input change and without a CLI version bump (§13.9).`. Recorded failure evidence in `ci.yml` and commit message.
3. Updated `.agents/skills/u8g2gl-standards/SKILL.md` (lines ~147-155), removing the "reviewer's question" stopgap wording and replacing it with the machine-enforced CI check reference (§17.3).
   - Commit: `90280da` `docs(skill): replace determinism stopgap with CI reference`
4. (PA followup commit `d5a0bb0`): Bumped CLI to `0.13.1` in `cli/package.json` to satisfy the determinism condition in the PR branch.

### Decisions Made
- Structured `determinism-check` as a dedicated job dependent on `cli-tests` for clear PR check visibility.
- Implemented robust multi-engine version extraction (`node` -> `jq` -> `grep`/`sed`) in shell to ensure reliable package version parsing across runner environments.

### Dead Ends & Warnings
None.

### Out-of-Scope Findings
- **§13.9 determinism violation detected in PR-06 history**: In commit `ee26d14` ("fix(cli): sync runtime-version.json and goldens with 0.10.0"), golden `cli/test/generator/fixtures/emit-project/expected/u8g2gl_generated_config.h` was regenerated with `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 10);` without fixture inputs changing and without a CLI version bump (`0.13.0`).
- The new CI check detected this violation as expected. Per WO4 Strict Boundary Box, worker reported the finding to PA rather than editing `cli/package.json`. PA addressed this in commit `d5a0bb0` by bumping CLI to `0.13.1`.

### Blockers
None. All checks and test suites passing (CLI: 1353 tests, C++: 510 tests).
