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
complete

### Changes Made
PA decision (resume_notify move):
- `src/u8g2gl_internal.h` (new) - house header, SPDX, Purpose; holds `u8g2gl_resume_notify()` and its Doxygen.
- `include/u8g2gl/u8g2gl_core.h` - declaration and Doxygen removed; exported-symbol entry (was line 34) removed.
- `src/u8g2gl_core.cpp`, `src/u8g2gl_timer.cpp` - `#include "u8g2gl_internal.h"` (quoted, relative).
- Checked: no CMake install rule and nothing in `library.json` lists headers (export only excludes dirs); no test, editor or other host references the symbol (grep over the tree outside docs/.agents).

AUDIT items:
- [x] P2 `src/u8g2gl_label.cpp:216` - now "Step 7 branches on long_mode_ ...", WO2b dropped.
- [x] P3 tags: `u8g2gl_label.h:240` tag deleted; `u8g2gl_label.cpp:~202` "reworked (PR-5R2 WO1, D-A)" -> "schedules by DUE TIME ..."; `u8g2gl_label.cpp:~519` tag deleted; `test_label.cpp:383`, `:449` tags deleted; `:1084` banner -> "Scroll timing - due-time scheduling"; `:1377` and `test_subject.cpp:546` prefix dropped; `test/CMakeLists.txt:677` tag dropped.
- [x] P3 `u8g2gl_core.h` ui_handler() Doxygen - not re-entrant (timer callback or observer it runs, §11.1); `@return` 0 when frame left dirty (§11.2).
- [x] P3 Purpose, `u8g2gl_core.h` ("runs the host's due timers", resume callback) and `u8g2gl_core.cpp` ("timer's and every widget's deadline", timers first, dirty check after render).
- [x] P3 Purpose, `test_label.cpp` (Purpose and Description: due-time scheduling, resize re-measure) and `test_subject.cpp` (non-copy/non-move static_asserts).
- [x] P4 `u8g2gl_timer.cpp` banners for pause, reset, get_user_data.
- [x] P4 `u8g2gl_subject.h` - deleted-members rationale promoted to a `@note` on `u8g2gl_subject_int_base` (the old plain `//` block left in place).
- [x] P4 resume_notify placement - done as the PA decision above.

### Decisions Made
- Left the older plain `//` subject comment in place beside the new `@note` rather than deleting it (it also covers the `_n` types).
- Added a one-sentence resume-callback mention to the core.h Purpose, as the WO asked for it.

### Dead Ends & Warnings
- None. Verification: fresh build 0 warnings; ctest 501 tests, 1 skip (SizeOfReport.ThirtyTwoBitTarget), 100% passed; CLI vitest 1353 passed; goldens untouched. The audit's non-comment grep prints only the moved declaration line.

### Out-of-Scope Findings
- `test/test_label.cpp:~1114` still cites "D-A" (unpublished reference); not on the audit list, left.
- Untracked `wo8-device/` workspace folder exists in the worktree; not mine, not committed.

### Blockers
(none)
