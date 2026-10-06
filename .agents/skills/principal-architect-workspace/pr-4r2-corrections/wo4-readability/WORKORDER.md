---
work_order: WO4
project: pr-4r2-corrections
title: "Readability remediation over PR-4R2"
branch: u8g2gl-4r2/wo4-readability
base: u8g2gl-4r2/wo3-radius-build-time
complexity: standard
status: complete
---

# WO4 — readability remediation

## Authorization

Part of PR-4R2 (`pr-4r2-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of the decomposition, which lists this WO. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r2`.** **Branch**:
`u8g2gl-4r2/wo4-readability` (already checked out, no upstream) · **Base**:
`u8g2gl-4r2/wo3-radius-build-time`. Run `git branch --show-current` **as its own command
immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR.

## Standards

Load `u8g2gl-standards` from **this worktree** (`.agents/skills/u8g2gl-standards/`, which has
documentation.md §4.1; the main checkout's copy does not). §4.1 binds the lines you write: cite
published references and measured facts; no work-order tags, workspace paths or narrated debate.
**Do not sweep pre-existing citations**, even on lines next to yours.

---

## Objective

Apply the review in [REVIEW.md](REVIEW.md) as the PA has dispositioned it below. Every item
except the last two is documentation only; behaviour is unchanged.

## Line-Item Instructions

- [ ] **Baseline**, each suite alone: expect C++ 395 / one skip, zero warnings; CLI 1319.
- [ ] **P2-1** `include/u8g2gl/u8g2gl_state_saver.h:21-23`: apply REVIEW.md's replacement text.
      Check it against `u8g2gl_render_object()` in `src/u8g2gl_core.cpp` (saver declared first,
      `u8g2gl_clip_scope` second) before writing it, so the order it states is the real one.
- [ ] **P2-2** `include/u8g2gl/u8g2gl_draw.h` at `:131-133`, `:118` and the table row `:60-65`:
      apply REVIEW.md's fix so all three agree.
- [ ] **P3-1** `cli/src/core/generator/emit/screen.ts:23`: "Two rules" → "Three rules".
- [ ] **P3-2** `cli/src/core/validator/validate-schema.ts:379, 390, 418`: house step format
      `// --- Step N: <purpose> ---`, detail lines as plain comments beneath.
- [ ] **P3-3, approved by the PA: the emitted render comment.** In `screen.ts` (~:644-649) add
      the one line REVIEW.md gives, so a reader of `ui_screen_*.cpp` is told before meeting
      `u8g2gl_clip_scope` that a bound draw call inside a container is drawn inside that
      container's clip (§13.5). Regenerate the goldens in the **same commit**, and say in its
      message that they move for this comment only and ship within the unreleased CLI 0.10.0, so
      no further generator bump (§13.9). Review the golden diff: **that comment line only**,
      in every `ui_screen_*.cpp` golden. Anything else: stop and report.
- [ ] **PA addition: one accurate radius message.** `checkCornerRadius()` in
      `cli/src/core/validator/validate-geometry.ts` (~:733) words the message's tail in two ways:
      a `draw=` radius says "or U8G2 draws outside the box (u8g2_box.c)", and a `setter=` radius
      says the runtime silently clamps it. Both are now false or true the same way: every path,
      `u8g2gl_draw_box` included, clamps through `u8g2gl_coord_corner_radius()`. Use the
      `setter=` wording for both and remove the branch. The measured reason the bound exists
      (U8G2 itself draws outside past it) may stay in the function's comment, not the message.
      Update existing assertions that pin the old box wording, **message text only**, and list
      each one.
- [ ] **P4-1** `cli/test/validator/bind-type-paths.test.ts:49`: delete the two no-op `.replace()`s.
- [ ] **P4-2** re-wrap the three over-long changed comment paragraphs REVIEW.md names, at their
      block's width. **P4-3 (banner split): skip.**
- [ ] Fill in REVIEW.md's Completion Report section as well as this WORKORDER's.

## Strict Boundary Box

**In scope:** the files named above; regenerated goldens (`test/generated_fixture/generated*/**`,
`cli/test/**/expected/**`) for P3-3 only; existing CLI test assertions on the radius message text;
REVIEW.md and this WORKORDER.

**Do NOT touch:** any behaviour other than the radius message text; pre-existing citations;
versions; `docs/`; `PROGRAM*.md`; `PROJECT.md`.

## Verification Requirement

- [ ] C++ zero warnings from a clean configure, ctest 395 / one skip; CLI vitest 1319 (same count,
      none weakened), `tsc`, lint. **Each suite alone**
- [ ] Golden diff is the render comment line only
- [ ] `git diff --name-only u8g2gl-4r2/wo3-radius-build-time..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---
## Completion Report

### Status
complete

### Changes Made
- P2-1 `u8g2gl_state_saver.h`: clip bullet now names `u8g2gl_clip_scope`; checked against `u8g2gl_render_object()` (saver line 139, clip scope line 140, so the clip resets first).
- P2-2 `u8g2gl_draw.h`: table row, `@brief` and `@param radius` now agree (literal over-bound radius refused at build time, §10; otherwise clamped).
- P3-1 `screen.ts` "Three rules". P3-2 `validate-schema.ts` three `// --- Step N: ... ---` comments, detail beneath.
- P3-3 `screen.ts`: one emitted render comment line; goldens regenerated (4 files: `cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp`, `test/generated_fixture/generated/ui_screen_{bounds,gauges,home}.cpp`). Diff is that line only, once per file (4 insertions, 0 deletions). Moved for this comment only; ships in the unreleased CLI 0.10.0, no further generator bump (§13.9).
- Radius message: `checkCornerRadius()` uses the `setter=` wording for every element; the `drawn` branch and variable removed; the measured U8G2 behaviour stays in the function comment. No test assertion pinned the old box wording, so none changed (grep for `u8g2_box`, `outside the box`, `draws outside` in `cli/test` found nothing).
- P4-1 two no-op `.replace()` deleted. P4-2 re-wrapped `editor_host.h`, `test_bound_child_clip.cpp`, `validate-geometry.ts` header paragraph. P4-3 skipped as instructed.

### Decisions Made
- Re-wrapped the validate-geometry.ts paragraph through its end so the block stays at one width.
- Added three comment lines to checkCornerRadius's header giving the reason the bound exists.

### Out-of-Scope Findings
(none)

### Blockers
(none)

### Verification
Baseline and final: CLI vitest 1319 passed; `tsc` and eslint clean. C++ clean configure in `tmp/cleanbuild`: zero warnings, ctest 395 passed, 1 skipped (SizeOfReport.ThirtyTwoBitTarget). Suites run alone.
