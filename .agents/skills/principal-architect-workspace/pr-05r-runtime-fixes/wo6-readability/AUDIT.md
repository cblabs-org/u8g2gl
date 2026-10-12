---
name: pr-05r-wo6-readability-audit
description: Remediate readability and documentation defects found in the PR-05R branch diff
complexity: mechanical
---

# WO — Readability & Documentation Remediation (PR-05R)

**Scope reviewed:** `git diff origin/main...HEAD` over `src include test cli/src cli/test cli/scripts docs CMakeLists.txt library.json`, excluding `.agents/` and generated goldens. Branch `u8g2gl-05r/wo6-readability`.
**Reviewed:** 2026-10-12
**Standards:** `u8g2gl-standards` skill (documentation.md §1-§5 applied; cpp.md / typescript.md naming checked against the right table)

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch, and do not plan. Execute the checklist below.

## Objective

The branch is in good shape: no P1, new functions carry banners and step comments, new comments cite `§`/`[D-n]` and measured figures, and headers are truthful. The defects are three stale doc comments (two of them made wrong by this branch's own change) and a small amount of narrated history. Fix them so implementers of `render_animation_update()` are pointed at `u8g2gl_repaint_object()`, and the budget model describes what `note` is now used for.

## Strict Boundary Box

**Do NOT touch:**
- Any behaviour. Comments and doc text only.
- Pre-existing `PR-xx` / `WO-xx` citations on unchanged lines (not defects, §4.1).
- Generated goldens, `.agents/`.

**Do NOT:** create branches, open PRs, rebase, or merge. If a fix seems to need a behaviour change, stop and surface it.

## Tooling Constraints

Zero warnings under `-Wall -Wextra -Wpedantic`; the C++ suite and the CLI suite must pass unchanged (run suites sequentially).

## Line-Item Instructions

### P2 - Stale documentation made wrong by this branch

- [ ] **Candidate 1 CONFIRMED** - `include/u8g2gl/u8g2gl_obj.h:466-468` (doc of `render_animation_update()`, declared line 473). The text reads: "An implementation must clear its own bounding box first, because the buffer was not cleared on this path, and should push via u8g2gl_partial_refresh()". The branch moved clear + clip + state guard + render into `u8g2gl_repaint_object()` (`src/u8g2gl_core.cpp:516`), and `label`, `clock` and `progress_bar` now all call it. The paragraph tells a new widget author to hand-roll the clear, which skips the clip and the `u8g2gl_state_saver` guard the branch exists to enforce (the failure mode `test_ambient_state.cpp` documents). The doc comment does not mention `u8g2gl_repaint_object()` anywhere. **Fix:** replace the paragraph with: an implementation repaints through `u8g2gl_repaint_object(display, *this)` (u8g2gl_core.h), which clips to the object's own bounds, clears them, calls `render()` and runs inside the same state guard as `u8g2gl_render_object()` (§11.3, [D-5]); it then pushes with `u8g2gl_partial_refresh()` over the same bounds. Add `@see u8g2gl_repaint_object`. Check `include/u8g2gl/u8g2gl_obj.h` includes or forward-declares nothing new (comment only).

- [ ] **Candidate 2 CONFIRMED** - `cli/src/core/generator/report/model.ts:109` (file is not in the diff, but the branch made it false). `BudgetLine.note` doc says "It exists for the framebuffer." `budget.ts` (`bindingPoolLine()`, about line 411-428 on this branch) now sets `note` on the `binding pool slots` line, whose figure is `unmeasured`. The doc also frames `note` as "a caveat on a figure that **is** reported", which no longer holds either. **Fix:** reword the first paragraph to cover both users: the framebuffer's figure, exact for the `<target>` constructor but not for an application-built `U8G2`; and the binding pool line, whose slot count holds only when the generated header reaches the runtime (§16, §18.1). Drop "that is reported" or say "a figure or count". Keep the existing framebuffer rationale paragraph.

### P3 - Consistency and documentation gaps

- [ ] **Candidate 3 CONFIRMED (pre-existing line)** - `include/u8g2gl/u8g2gl_config.h:57` lists `U8G2GL_NO_PARENT: Sentinel for root objects` under `Exported Constants`. The file does not define it: `grep` finds the definition only at `include/u8g2gl/u8g2gl_types.h:39` (`static constexpr uint8_t U8G2GL_NO_PARENT = UINT8_MAX;`). The line dates from 0.4.0 and the branch did not write it, but the branch edited this very header block (added `Consumed Macros:` directly beneath at line 59), so it is in reach and it is a false export. **Fix:** delete line 57. Optionally list the actual capacity macros the file defines, which the header omits (`U8G2GL_MAX_OBJECTS_PER_SCREEN`, `U8G2GL_MAX_BINDINGS_PER_OBJ`, etc.; take the names from the file itself).

- [ ] **Narrated history on new lines (§4.1)** - three places describe what an earlier version advised rather than stating the conclusion and its reason:
  - `cli/src/core/generator/emit/generated-config.ts` header, "Not a forced `-include` of the header, which an earlier version advised: on a real multi-library esp32dev build ...". **Fix:** drop "which an earlier version advised:"; the measured failure that follows stands alone.
  - `docs/design_spec.md`, §16 paragraph beginning "Only runtime sources and generated code include `u8g2gl_config.h`": "**A project-wide forced `-include` of the header is not a substitute**, and was advised before this:". **Fix:** delete "and was advised before this".
  - (Check only) the spec phrase "the `x+w-1` form of earlier drafts" in §11.3 is pre-existing text and is left alone.

### P4 - Optional, only if the architect approves

- [ ] `include/u8g2gl/u8g2gl_core.h:253-254` - the reflowed `u8g2gl_render_object()` doc has two over-long lines ("height over every glyph, direction 0); sets the clip window to the effective clip (own bounds intersected with") against a wrapped ~80-column style everywhere else. **Fix:** rewrap. No rule mandates it.

## Verification Requirement

- [ ] C++ build and suite - zero warnings, all tests pass, none weakened (sequential)
- [ ] `cli` build, lint and test - all pass
- [ ] No behavioural change: `git diff` shows only comments and doc text in `u8g2gl_obj.h`, `model.ts`, `u8g2gl_config.h`, `generated-config.ts`, `design_spec.md`, plus optionally `u8g2gl_core.h`

## Issue Surfacing

If you find a defect outside this checklist, surface it in your Completion Report; do not fix it and do not file an issue.

## Review Notes

**Severity counts:** P1 0 - P2 2 - P3 2 - P4 1

**What was checked.** Every added/changed line in the C++ runtime, the CLI source, the new test files, `test/CMakeLists.txt`, the stub, and the spec for: header/SPDX/`File:` truth, export lists, Doxygen on new public declarations (`u8g2gl_repaint_object`, `emittedBindingPoolSlots`, `GENERATED_CONFIG_MACRO`, `skippedFiles`, `SCREEN_FILE_SKIPPED`), banners and `// --- Step N ---` breakdowns (all present, including `u8g2gl_repaint_object`, `~u8g2gl_state_saver`, `bindingPoolLine`, `skippedDiagnostic`, `screenNameFor`, `boolRef`), memory discipline (no heap, no `std::function`; `u8g2gl_state_saver` members ordered pointers first then bytes, initialiser order matches declaration order), naming per language table, and a grep of all added lines for work-order tags, PR tags, workspace paths and debate. No `PR-`/`WO`/`.agents` tag appears on any added line. The `WO4c` in `test/stubs/U8g2lib.h` and `WO6 Finding B` in `u8g2gl_config.h` are on unchanged lines and were not raised. "Pass 5" in `screen-model.ts` and its test names the validator pass in `validate-types.ts`, a durable code reference, not a tag; not raised.

**Good:** `u8g2gl_state_saver.h` is exemplary: Purpose states the rule and why, the class doc carries a table, the Cost paragraph is measured with host, tool version and iteration count, and the null-font and height-mode why-comments are the kind the standard asks for. `test/test_ambient_state.cpp` ties each case to a measured failure. The `read-project.ts` and `budget.ts` helpers have banners in the house format.

**Uncertain:** Candidate 3 is on a line the branch did not author; I report it as a real defect adjacent to edited lines, at P3, rather than as a branch-introduced one. If the architect applies the "unchanged lines are out of scope" rule strictly, drop it to a note.

**Files reviewed:** CMakeLists.txt, library.json, include/u8g2gl/{u8g2gl_config,u8g2gl_core,u8g2gl_obj,u8g2gl_state_saver,u8g2gl_version}.h, src/u8g2gl_{clock,core,label,obj,progress_bar}.cpp, test/CMakeLists.txt, test/stubs/U8g2lib.h, test/test_{ambient_state,binding,core,generated_fixture,obj,subject}.cpp, test/generated_fixture/support/capacity_probe.cpp, cli/src/core/generator/emit/{generated-config,screen-model}.ts, cli/src/core/generator/report/{budget,model}.ts, cli/src/core/schema/diagnostic.ts, cli/src/node/{load-project,read-project}.ts, cli/test (changed tests), docs/design_spec.md.

**Observations (standards silent):** The standards do not say whether stale-doc rules extend to a file the branch did not touch but whose meaning it changed (Candidate 2). I treated it as in scope because the skill says stale docs the branch made wrong are.

## Completion Report

<!-- Written by the remediation worker at task completion -->
