---
name: pr-05r2-wo7
description: Handoff instructions for Work Order 7 — readability remediation from the PR-5R2 audit
complexity: standard
---

# PR-5R2 / WO7 — readability remediation

## Role Definition

You are an expert senior C++ engineer and execution-focused worker agent. You are NOT the Principal
Architect. Do not make architectural decisions, do not branch, and do not plan. Execute the
checklist below.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md` (the
Status Log records the owner's approval).

## Objective

Clear every finding in [AUDIT.md](AUDIT.md) (the readability-reviewer's report, in this folder): the
P2, every P3 line item, and the P4 suggestions. Also make one PA decision. This is documentation and
structure work: **no behaviour changes.**

## PA decision: `u8g2gl_resume_notify()` moves out of the public header

The reviewer ruled the current placement acceptable, but left the call to the PA. **It moves to a
private header now,** while PR-5R2 is unreleased. Removing a public symbol after 0.9 would be a
breaking change, and hosts must never call it.

- [ ] **Create `src/u8g2gl_internal.h`,** the library's first private header, with a full house
  file header, SPDX and Purpose. Purpose: "declarations shared between the library's own
  translation units; not part of the public API; never installed". Move the declaration and its
  Doxygen there.
- [ ] **Remove it from `include/u8g2gl/u8g2gl_core.h`,** including the exported-symbol list entry
  at around line 34.
- [ ] **Include the private header** from `src/u8g2gl_core.cpp` and `src/u8g2gl_timer.cpp` with a
  quoted relative include.
- [ ] **Confirm nothing ships or installs it.** It must not appear in the CMake install rules or
  `library.json` export lists. A PlatformIO or Arduino build compiles `src/` with its own directory
  on the include path, so the quoted include works there too.
- [ ] **Confirm no test or editor host calls it.** The PA's grep found none.

## Strict Boundary Box

- **Work in** `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, on branch
  `u8g2gl-05r2/wo7-readability` (checked out). Do not create branches.
- **Edit only** the files AUDIT.md names, plus `src/u8g2gl_internal.h` (new), `u8g2gl_core.h` /
  `.cpp` and `u8g2gl_timer.cpp` for the move. `docs/design_spec.md` only if a finding requires it.
- **Out of scope:**
  - any logic change, test-assertion change, version or CLI change;
  - the pre-existing WO citations that AUDIT.md marks out of scope. Remove work-order tags only from
    lines this PR added, as the audit lists.
- **Load the `u8g2gl-standards` skill first.**

## Line-Item Instructions

- [ ] Work through AUDIT.md top to bottom, ticking each item in **your Completion Report**, with
  file:line and what you did. Do not edit AUDIT.md itself.
- [ ] Where a work-order tag (`PR-5R2 WOn`, `D-A`) is removed, keep the *why* the comment carried,
  stated in present-tense design terms. Remove the tag, not the reason.
- [ ] For the `ui_handler()` Doxygen in `u8g2gl_core.h`: state that it must not be called from a
  timer callback, and that it returns 0 when the render leaves the frame dirty, matching spec §11.1
  and §11.2.
- [ ] For the Purpose blocks of `u8g2gl_core.h` / `.cpp`: describe timers being run first, the resume
  callback, and the dirty ordering. For the test files' Purpose blocks: name the new coverage.

## Verification Requirement

- Fresh build: `cmake -S . -B tmp/build-wo7 && cmake --build tmp/build-wo7 -j && ctest --test-dir tmp/build-wo7`.
  **501 tests** with 1 skip, 0 warnings, identical to before. CLI: `cd cli && npx vitest run`
  gives 1353, goldens untouched.
- `git diff --stat` shows comment and doc lines plus the header move only. Say if anything else
  moved.
- **Verify the branch,** then commit, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- Message the PA with the results.

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
