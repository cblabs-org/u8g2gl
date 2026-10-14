---
name: pr-05r2-wo7-readability-audit
description: Remediate readability and documentation defects found in the PR-5R2 source, header and test changes
complexity: mechanical
---

# WO7 Readability Audit - PR-5R2 (timing)

**Scope reviewed:** `git diff 99ac4a3..HEAD -- src include test` on branch `u8g2gl-05r2/wo7-readability` (27 files; goldens, `.agents/`, `docs/`, `cli/` excluded)
**Reviewed:** 2026-10-14
**Standards:** `u8g2gl-standards` skill (SKILL.md, references/documentation.md, references/cpp.md)

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch, and do not plan. Execute the checklist below.

## Objective

The PR-5R2 code is in good shape: no P1 findings, no allocation, and the new timer and wall-clock modules are model examples. Remediation is one stale comment, a handful of work-order citations on new lines, and a few public-contract documentation gaps.

## Strict Boundary Box

**Do NOT touch:**
- Any behaviour. Comments only, plus the optional P4 moves if the architect approves them.
- Pre-existing WO/PR citations on lines this change did not touch (documentation.md section 4.1 says they are not defects). Only the lines listed below are in scope.

**Do NOT:** create branches, open PRs, rebase, or merge.

If a fix appears to require a behavioural change, stop and surface it.

## Tooling Constraints

- Host build: `cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON`, then build and run ctest. Use the PlatformIO MCP rather than raw `pio` if a firmware build is needed.
- Zero warnings under `-Wall -Wextra -Wpedantic`. All tests pass, none weakened.
- Size assertions in `test/test_sizeof_report.cpp` must still pass (measured on the 64-bit host during this audit: label 80, clock 72, timer 40, wall_clock 56; all within their asserted bounds).

## Line-Item Instructions

### P1 - Correctness or cost

None.

### P2 - Stale documentation (outranks omission)

- [ ] `src/u8g2gl_label.cpp:216` - Stale step reference. Evidence: `// Step 5 branches on long_mode_ because WO2b gave U8G2GL_LONG_SCROLL its own`. The branch on `long_mode_` is now `// --- Step 7: Advance the marquee one pixel ---` (line 289-294). Step 5 is now "Not yet due". The renumbering in this PR left the banner pointing at the wrong stage. **Fix:** change to "Step 7 branches on long_mode_ because U8G2GL_LONG_SCROLL has its own reversing mechanic while U8G2GL_LONG_SCROLL_CIRCULAR keeps the wrap". Drop the bare "WO2b" while editing the line (section 4.1).

### P3 - Consistency and documentation gaps

- [ ] **Bare work-order tags and unresolvable references on new/changed lines** (documentation.md section 4.1). Rewrite each as the knowledge, not the provenance (one line each). `D-A` is not a published reference: it appears in no file under `docs/`, and the published form is `[D-n]`.
  - `include/u8g2gl/u8g2gl_label.h:240` - "(PR-5R2 WO1)" -> delete the tag: "Scrolling is scheduled by due time: a step happens when ..."
  - `src/u8g2gl_label.cpp:202-203` - "is u8g2gl_scrolling_label::tick() reworked (PR-5R2 WO1, D-A) to schedule by DUE TIME rather than by when a step happened to run" -> "schedules by DUE TIME rather than by when a step happened to run". The bullets that follow are the real content and are excellent. Do not narrate the former class.
  - `src/u8g2gl_label.cpp:519` - "(PR-5R2 WO1)" at the end of the render_animation_update note -> delete the tag; the sentence already states the invariant.
  - `test/test_label.cpp:383` and `:449` - "(PR-5R2 WO1, D-A)" -> delete the tag, keep the "restarted the interval from when the step ran" explanation.
  - `test/test_label.cpp:1084` - section banner "(PR-5R2 WO1, defect D-A)" -> "Scroll timing - due-time scheduling".
  - `test/test_label.cpp:1377` and `test/test_subject.cpp:546` - "--- PR-05R2 WO6: ..." banners -> drop the "PR-05R2 WO6:" prefix.
  - `test/CMakeLists.txt:677` - "(PR-05R2 WO2)" -> drop it.
  - Do not touch the older citations nearby (`WO2b`, `WO4c`, `PR-04 WO10b` and the like): they are pre-existing and explicitly out of scope.
- [ ] `include/u8g2gl/u8g2gl_core.h:~379` (the `ui_handler()` Doxygen) - A precondition and a return rule live only in the implementation. `src/u8g2gl_core.cpp` says "ui_handler() must not be called from a timer callback (§11.1)" and Step 4 returns 0 when the render left the frame dirty. A host author reading the header gets neither. **Fix:** add to the `@brief` body: "Not re-entrant: do not call it from a timer callback or a subject observer it runs." and to `@return`: "0 when the frame is left dirty (a subject was written during the render): call again at once."
- [ ] `include/u8g2gl/u8g2gl_core.h:10-14` (Purpose) and `src/u8g2gl_core.cpp:9-15` (Purpose) - Now partly stale. core.h says ui_handler() "ticks the active screen, redraws only if something changed" and "Everything else in the library is passive"; core.cpp says the sleep hint is "aggregated from every widget's own deadline". Timers (run first, and with no screen active) now contribute. **Fix:** one clause in each: "runs the host's due timers, ticks the active screen ..." and "from every timer's and every widget's own deadline".
- [ ] `test/test_label.cpp` (Purpose/Description, lines 11-26) and `test/test_subject.cpp` (Purpose, lines 11-16) - Headers no longer enumerate what the file proves. test_label.cpp now carries ~300 lines of due-time scheduling and resize re-measure tests; test_subject.cpp now carries the pinned (non-copy, non-move) static_asserts. **Fix:** add one clause to each Purpose naming the new coverage. (test_clock.cpp and test_core.cpp already do this correctly; use them as the pattern.)

### P4 - Optional, only if the architect approves

- [ ] `src/u8g2gl_timer.cpp:121,176,198` - `u8g2gl_timer_pause`, `u8g2gl_timer_reset` and `u8g2gl_timer_get_user_data` have no banner while their siblings do. The first and third are trivial. `reset` has a real contract (due = now + period, wakes the loop), so one banner line is worth adding. Not required by the standards.
- [ ] `include/u8g2gl/u8g2gl_subject.h` - The deleted copy/move members are explained by a plain `//` block above the "Int subject" section. That is a good why-comment. Optionally promote it to a `@note` on `u8g2gl_subject_int_base` so it shows up in generated docs.
- [ ] The `resume_notify` placement question: see ruling below. Moving it is optional.

## Ruling: `u8g2gl_resume_notify()` in the public `u8g2gl_core.h`

**Acceptable under the current standards; not a defect. Recommendation is to leave it, with an optional P4 move.**

1. **The standards do not forbid it.** Nothing in SKILL.md section 3, cpp.md, or documentation.md requires an internal-header tier. Section 3's encapsulation rules cover members and global state (`extern`), and `s_resume_cb` / `s_in_handler` are file-static, so they comply. Every header in `include/u8g2gl/` is public, and there is no precedent for a private header.
2. **It is honestly documented.** It is marked "Library-internal" in the exported-symbol list and in its Doxygen, with the reason a host has no cause to call it. That is what documentation.md asks of a deliberate deviation.
3. **There is precedent for public-but-not-for-hosts functions.** `core.h` already exports a "Support for generated code" group (`u8g2gl_render_object()`, `u8g2gl_repaint_object()` and others) that application authors should not call directly.
4. **The cost is real but small.** A host calling it would only trigger a spurious wake. It is not memory- or correctness-unsafe.
5. **The cost of moving later is not zero.** Anything exported from a public header at 0.9 is API surface under `.agents/rules/03-versioning.md`; removing it later is a breaking change, whereas adding an internal header now is free. If the architect wants the surface kept minimal, the cheap fix is a private header (for example `src/u8g2gl_internal.h`, included by `u8g2gl_core.cpp` and `u8g2gl_timer.cpp`) with no public-header change. That needs a decision, not a worker default, because it also touches the test build's include paths. Note that PR-5R2 has not shipped, so now is the cheapest moment.

## Verification Requirement

- [ ] Host build: zero warnings.
- [ ] ctest: all tests pass, none weakened or removed.
- [ ] No behavioural change: `git diff` shows only comment lines (and comment-only edits inside `test/CMakeLists.txt`). Confirm with `git diff -U0 | grep '^[+-]' | grep -v '^[+-]\s*\(//\|\*\|/\*\|#\)'`, which should print only file headers.

## Issue Surfacing

If you find a defect outside this checklist, surface it in your Completion Report. Do not fix it and do not file an issue.

## Review Notes

**Severity counts:** P1 0 - P2 1 - P3 5 line items (about 14 individual lines) - P4 3

**What was checked:** file headers and SPDX on all 27 files; Doxygen on every new public declaration; banners on every `.cpp` function; step breakdowns; why-comments; stale and history-narrating comments on changed lines; naming against the C++ table; enum base types; allocation grep (`new`, `malloc`, `std::function`, `std::vector`, `std::string`: none in `src/` or `include/`); stored `std::function`: none; member ordering of `u8g2gl_timer`, `u8g2gl_wall_clock`, `u8g2gl_label`, `u8g2gl_clock`.

**Measured (64-bit macOS host; a 32-bit build was not available on this machine):** `sizeof(u8g2gl_label)` = 80, matching the comment at label.h:346 (so that claim is not stale). `u8g2gl_clock` = 72 (bound 96), `u8g2gl_timer` = 40 (bound 40, at the limit), `u8g2gl_wall_clock` = 56 (bound 56, at the limit). The `u8g2gl_timer` and `u8g2gl_wall_clock` bounds are tight on this host. The existing `ThirtyTwoBitTarget` test asserts the same bounds on a 32-bit layout, where pointer-heavy structs are smaller, so it holds, but I did not measure that width myself.

**What is good (pattern-match against these):** `u8g2gl_timer.h/.cpp` and `u8g2gl_wall_clock.h/.cpp` are exemplary. Their Purpose blocks say why the module exists and where it sits, they state thread-safety and lifetime contracts, and each `.cpp` function has a banner with parameters. The step breakdowns are real stages, and the why-comments are the load-bearing kind (wrap-safe difference arithmetic, schedule-from-due-time, restart-from-head after list change). `u8g2gl_label::tick()` and `u8g2gl_clock::tick()` are well structured; `schedule()` as the single exit for deadlines is a good extraction. Encapsulation holds: timer state is reachable only through friends, and module state is file-static.

**Observations (standards are silent):**
- The standards give no guidance on internal headers; see the ruling above. If more library-internal hooks accrue, a short rule in cpp.md would stop this question recurring.
- Pre-existing, not raised: older WO/PR citations throughout `test_label.cpp` and `label.h`/`label.cpp`, per documentation.md section 4.1.

## Completion Report

<!-- Written by the remediation worker at task completion -->
