---
name: pr-05r2-wo6
description: Handoff instructions for Work Order 6 — resized label re-measures; subjects cannot be copied
complexity: standard
---

# PR-5R2 / WO6 — two small fixes (owner-approved)

## Role Definition

You are an expert senior embedded C++ engineer and execution-focused worker agent. You are NOT the
Principal Architect. Do not make architectural decisions beyond what this order fixes, do not
branch, and do not plan.

**Parent project:** `.agents/skills/principal-architect-workspace/pr-05r2-timing/PROJECT.md`. The
Status Log records the owner's approval of this WO: "yes - fix the bugs please".

## Objective

Two defects found during this PR, each with a reproduction:

1. **A resized label keeps its stale layout** (found in WO1). `set_coords()` / `set_w()` / `set_h()`
   do not mark a label's layout as needing re-measurement, so `needs_scroll_` and `message_width_`
   go stale. **Repro:** a label 60 px wide with 60 px of text, rendered once, then
   `set_coords(0, 0, 50, 16)`. It never scrolls.
2. **Subjects can be copied** (found in WO4). The `u8g2gl_subject_*` types have implicit copy and
   assignment, and a copy's `observers_` points into the **source's** storage. That silently
   corrupts both subjects; WO4's first test fixture hit this with `s = u8g2gl_subject_int{}`.

## Strict Boundary Box

- **Work in** `/Users/mcneillm/Documents/Projects/U8G2GL-05r2`, on branch
  `u8g2gl-05r2/wo6-small-fixes` (checked out; it contains WO1–WO5). Do not create branches.
- **May edit:** `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp` (the geometry setters and one
  hook), `include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp`, `include/u8g2gl/u8g2gl_subject.h`
  (and `src/u8g2gl_subject.cpp` if needed), the matching tests (`test/test_label.cpp`,
  `test/test_obj.cpp`, `test/test_subject.cpp`), any **test or fixture** that copied a subject and
  now fails to compile (fix it the way WO4 did), and `docs/design_spec.md` only if it describes
  either behaviour. Plus your Completion Report.
- **Do not touch** the timers, the wall clock, the clock, the core frame logic, the CLI or generator,
  the schema, or versions (the runtime is already 0.9.0 in this PR).
- **If the generated code itself copies a subject,** stop and report. That would be a generator
  change; do not make it.

## Tooling Constraints

- Fresh build: `cmake -S . -B tmp/build-wo6 && cmake --build tmp/build-wo6 -j && ctest --test-dir tmp/build-wo6`.
  0 warnings. Baseline is **495**, 1 skip. The editor target and the generated-fixture compile tests
  must still pass. They are the proof that generated code never copies a subject.
- CLI once at the end: `cd cli && npx vitest run` (1353). **The goldens must not change.**
- **Load the `u8g2gl-standards` skill before writing code.**

## Line-Item Instructions

### 1. A resized label re-measures

- [ ] **Base-class hook:** a protected virtual hook on `u8g2gl_obj`, for example
  `on_size_changed()`, with a no-op default. The base geometry setters (`set_coords`, `set_w`,
  `set_h`, and any other setter that changes width or height) call it **only when the width or
  height actually changes**. A move alone does not call it. Check the per-axis setters around
  `src/u8g2gl_obj.cpp:31-80` and the bound-geometry path around `:854`.
- [ ] **The label overrides it:** set `needs_layout_ = true`, reset the scroll position and its timing
  (as `reset_scroll()` does, keeping WO1's `timing_started_` / due-time state consistent), and mark
  the frame dirty.
- [ ] **Memory:** say whether the hook adds a vtable slot only (no per-object bytes), and check
  `test_sizeof_report` still passes.
- [ ] **Tests:**
  - **The repro:** a 60 px label with 60 px of text does not scroll, then after
    `set_coords(0, 0, 50, 16)` it does.
  - **The reverse:** a scrolling label widened enough to fit stops scrolling.
  - **A pure move** does not reset the scroll.
  - **A bound geometry change** (if the binding path calls the setters) triggers it too.

### 2. Subjects cannot be copied

- [ ] **Delete copy:** `= delete` the copy constructor and copy assignment on every subject base and
  `_n` type in `u8g2gl_subject.h` (int, string, bool, time). Delete move as well, because a move
  would leave the same observer pointer behind; say if anything prevents that.
- [ ] **Fix what no longer compiles:** any test or fixture that copied a subject; list each. If
  `test/editor_host` or the generated fixture breaks, stop and report.
- [ ] **A compile-time test:** `static_assert(!std::is_copy_constructible_v<…>)` and
  `!std::is_copy_assignable_v<…>` for each type (and the move traits), in `test_subject.cpp`.
- [ ] **Doc comment** on the subject types: why they are non-copyable (observers point into their
  own storage).

## Verification Requirement

- ctest green in a **fresh** build, 0 warnings, editor and generated-fixture tests included. State
  the before and after totals. CLI vitest is unchanged and the goldens are untouched.
- `git status --short` clean apart from intended files.
- **Verify the branch** (`u8g2gl-05r2/wo6-small-fixes`), then commit, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not push.**
- Message the PA with the results.

## Issue Surfacing

Anything outside the box goes in your Completion Report with a reproduction. Do not fix it.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete

### Changes Made
- `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp` - protected virtual `on_size_changed()` (no-op default); `set_coords`, `set_w`, `set_h` call it only when width or height actually changed. The bound-geometry path (`on_width_bound`/`on_height_bound`) goes through `set_w`/`set_h`, so it is covered.
- `include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp` - override sets `needs_layout_ = true` and calls `reset_scroll()` (rewinds offset, clears `timing_started_`, marks dirty).
- `include/u8g2gl/u8g2gl_subject.h` - copy and move constructors and assignments `= delete` on all 4 `_base` and 4 `_n` types, plus a doc comment on why.
- `test/test_label.cpp` - 5 `LabelResize` tests (repro, reverse, pure move, dirty, bound width).
- `test/test_subject.cpp` - static_asserts for copy and move traits on every type, plus one placeholder TEST.

### Decisions Made
- Hook adds a vtable slot only (one pointer in the shared vtable per class), no per-object bytes; sizeof report unchanged (the 32-bit test is skipped on this host, as before).
- Move deleted too; nothing prevented it.
- Only `set_x`/`set_y` do not call the hook (pure moves).

### Dead Ends & Warnings
- None. Totals: 495 (1 skip) before, 501 (1 skip) after, fresh build dir, 0 warnings; editor and generated-fixture tests pass; CLI vitest 1353 passed; goldens untouched.

- Control run (tests built against pre-fix obj/label sources in tmp/ctl6): Narrowing FAILS on old code, Widening FAILS (after the coordinator found my first version passed on old code; it now asserts the drawn x stays at its resting non-negative position across several due times), BoundWidth FAILS, PureMove passes, SizeChangeMarksDirty passes (both already-correct behaviours). All 5 pass with the fix.

### Out-of-Scope Findings
- No test or fixture needed changing for the non-copyable subjects: WO4 had already fixed the one copy site, and nothing else (tests, editor host, generated fixtures) copies a subject.

### Blockers
(none)
