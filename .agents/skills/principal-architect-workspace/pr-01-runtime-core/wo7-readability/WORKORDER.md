---
name: pr-01-runtime-core-wo7
description: Remediate readability and documentation defects found in the PR-01 runtime core
complexity: mechanical
---

# WO7 — Readability & Documentation Remediation

**Parent PR:** `pr-01-runtime-core` (see `../PROJECT.md`)
**Branch:** create `u8g2gl-runtime/wo7-readability` from `u8g2gl-runtime/wo6-sizing-remediation`
**Scope reviewed:** all 20 files of PR-01 — `include/u8g2gl/` (9), `src/` (6), `test/` (5)
**Reviewed:** 2026-09-08 by the `readability-reviewer` agent; findings triaged by the Chief Architect
**Standards:** `u8g2gl-standards` skill — invoke it before starting

---

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch beyond the one named above, and do not plan. Execute the checklist below.

## Objective

Bring the PR-01 runtime up to the documentation standard, so that a PR-03 widget
author can work from the headers alone rather than reading implementations, and so
the non-obvious design decisions are explained where a reader will find them.

The code is correct — clean build, 80/80 tests, no heap allocation, no stored
`std::function`. **This work order changes no behaviour.** Two enum declarations
change type; everything else is comments and headers.

## Strict Boundary Box

**Do NOT touch:**
- Any behaviour, algorithm or control flow. Comments, headers and the two enum
  base types only.
- `docs/` or `.agents/` — except your Completion Report in this file.
- Test assertions. If a test fails after your change, you changed behaviour;
  revert and surface it.
- The style-index table idea, the `_base`/`_n<>` subject split, or anything else
  settled in WO6.

**Do NOT** create branches beyond the one named, open PRs, rebase, or merge.

If a fix appears to require a behavioural change, **stop and surface it** rather
than making it.

## Tooling Constraints

```bash
cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON
cmake --build build
ctest --test-dir build --output-on-failure
```

80/80 tests currently pass with zero warnings under `-Wall -Wextra -Wpedantic`.
**Both must still hold when you finish.**

---

## Line-Item Instructions

### P2 — Convention with consequence

- [ ] **`include/u8g2gl/u8g2gl_subject.h:9`** — `u8g2gl_subject_type_t` has no
  explicit base type, so it is `int`:
  ```cpp
  enum u8g2gl_subject_type_t {
      U8G2GL_SUBJECT_INT = 0,
  ```
  It is stored as a member of `u8g2gl_binding_desc` (`src/u8g2gl_obj.cpp:155`), in
  a 128-slot static pool. **Measured impact: none on a 64-bit host (40 B either
  way — three pointers dominate), but 28 B → 24 B on a 32-bit target, saving
  512 B across the pool.** The target is what counts.
  **Fix:** `enum u8g2gl_subject_type_t : uint8_t { ... };`

- [ ] **`include/u8g2gl/u8g2gl_types.h:48`** — `u8g2gl_event_t` likewise untyped.
  Currently unused, so nothing pays for it yet — but it will be the first thing a
  PR-03 event-handling widget stores, and the rule should hold without exceptions
  before that happens.
  **Fix:** `enum u8g2gl_event_t : uint8_t { ... };`

- [ ] After both changes, re-check `u8g2gl_binding_desc`'s member order — with
  `subject_type` now a byte, the `uint8_t`/`bool` members should sit together
  after `ref_value`. Re-run `Core.SizeOfReport` and note any change.

### P3 — Consistency

- [ ] **No file carries a header block or SPDX identifier** — all 20 files.
  `grep -rl "SPDX" include/ src/ test/` returns nothing.
  **Fix:** add the header block specified in `u8g2gl-standards`
  `references/documentation.md` §1 to every file. Each needs a truthful `File:`
  path, a description saying *what and why*, and — for headers — an
  **exported-symbol list grouped by concern**. `u8g2gl_obj.h` already implies its
  groups in its `// ---` section comments (Geometry, Flags, Hierarchy, Binding,
  Style, Lifecycle); promote those into the header block.
  *This is one line item covering twenty files, not twenty items.*

- [ ] **Zero Doxygen comments anywhere in the runtime.** `grep -rn "/\*\*"
  include/ src/` returns nothing. Every public declaration across all 9 headers
  has at most a same-line `//`.
  **Fix:** convert existing informative `//` comments into
  `/** @brief … @param … @return … */` on the declarations, per
  `documentation.md` §2. Most of the prose already exists and needs moving, not
  writing. Prioritise, because these carry contracts a caller cannot guess:
  - `u8g2gl_obj.h:55-70` — `bind_text()` and `bind_flag_if_*()`: subject lifetime
    requirement, that the two `bind_text()` overloads are mutually exclusive per
    object, and what a `false` return means on capacity exhaustion.
  - `u8g2gl_core.h:56` — `ui_handler()`: the "ms until next work needed" contract
    is the single most important call contract in the library and exists only as
    a `//` block, not a `@return`.
  - `u8g2gl_subject.h` — `add_observer()`: returns `false` on overflow *and*
    asserts in debug. Explained in a block comment above the class, which a reader
    jumping to the declaration will not see.

- [ ] **The flat parent-index hierarchy is never explained.** Searching the tree
  for `[A-3]`, "flat array" or equivalent rationale finds only mechanical
  restatements. `u8g2gl-standards` `references/cpp.md` §5 gives *this exact case*
  as its worked example of a required why-comment — so its absence is a
  standards violation, not a suggestion.
  **Fix:** add a why-comment in `include/u8g2gl/u8g2gl_tree.h` above
  `u8g2gl_is_effectively_visible()` and `u8g2gl_effective_clip()` — the two
  functions that walk the parent chain. Explain that hierarchy is a flat array
  with parent indices rather than a tree because rendering is full-frame in
  document order ([D-4]) and layout is resolved at build time ([D-7]), so the only
  queries made walk *upward*; a child list would cost a vector per node to serve
  queries nobody makes. Reference [A-3].

- [ ] **`src/u8g2gl_core.cpp:55-70`** — `ui_handler()` labels its stages
  `// Phase 1:`, `// Phase 2:`, `// Phase 3:`. House style is
  `// --- Step N: <what this stage does> ---` (`documentation.md` §3). The content
  is right — each names the stage's purpose — and this is the best-structured
  function in the PR; only the delimiter differs.
  **Fix:** rename to the house format.

### P4 — Optional, architect approval required before actioning

- [ ] Remaining suggestions from the review are recorded in
  `tmp/pr-01-readability-review.md` §P4. **Do not action them** unless the
  architect has said so in writing in this file.

---

## Verification Requirement

- [ ] `cmake --build build` — **zero** warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest` — all 80 tests pass; none weakened or removed
- [ ] **No behavioural change**: `git diff` shows only comments, header blocks and
      the two enum base-type declarations. If the diff contains changed logic, you
      have exceeded scope.
- [ ] Re-run `Core.SizeOfReport` and record the figures in your Completion Report,
      noting the host width they were measured on

## Issue Surfacing

If you find a defect outside this checklist, record it in your Completion Report —
do not fix it and do not file an issue. The architect triages.

---

## Review Notes

*For the architect, not the worker.*

**Severity counts:** P1 0 · P2 2 · P3 4 · P4 3

**Two corrections made during triage**, both worth knowing:

1. The reviewer claimed the untyped `subject_type` "forces alignment padding the
   struct wouldn't otherwise need". Measured: **false on a 64-bit host** — 40 B
   either way, since three pointers dominate the layout. **True on the 32-bit
   target** — 28 B → 24 B, 512 B across the pool. The finding stands; the
   reasoning was asserted rather than measured and happened to be wrong on the
   machine it was checked from. The agent has since been told to compile and
   measure any size claim, and to state the target width.

2. The reviewer graded the missing flat-hierarchy why-comment **P4 (Suggestion)**
   while its own summary called it *"the single most important non-obvious
   decision in the codebase"*. Those cannot both be true. Re-graded to **P3**: the
   standards name it explicitly as a required why-comment, so its absence is a
   violation. The agent has since been told that anything the standards mandate is
   at least P3, never P4.

**Files reviewed:** all 20 — `u8g2gl_config.h`, `u8g2gl_core.h`,
`u8g2gl_helpers.h`, `u8g2gl_obj.h`, `u8g2gl_state_saver.h`, `u8g2gl_style.h`,
`u8g2gl_subject.h`, `u8g2gl_tree.h`, `u8g2gl_types.h`; `u8g2gl.cpp`,
`u8g2gl_core.cpp`, `u8g2gl_obj.cpp`, `u8g2gl_style.cpp`, `u8g2gl_subject.cpp`,
`u8g2gl_tree.cpp`; `test_core.cpp`, `test_obj.cpp`, `test_smoke.cpp`,
`test_style.cpp`, `test_subject.cpp`.

**Observation:** the code is genuinely clean — consistent naming, no memory-rule
violations, and WO6's fixes are well explained where they touch code. The gap is
entirely that the *reasoning* lives in commit messages and this workspace rather
than in the source, where the next reader will look.

---

## Completion Report

<!-- Written by the remediation worker at task completion -->
