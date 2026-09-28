---
work_order: WO5
project: pr-4r-corrections
title: "Readability remediation and the carried message fixes"
branch: u8g2gl-4r/wo5-readability
base: u8g2gl-4r/wo4-bound-arg-clamp
complexity: standard
status: dispatched
---

# WO5 — readability and carried fixes

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR with a timestamp, and its decomposition lists WO5. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r`.** **Branch**:
`u8g2gl-4r/wo5-readability` (already checked out) · **Base**: `u8g2gl-4r/wo4-bound-arg-clamp`.
Run `git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR.

## Standards

Load `u8g2gl-standards` first, especially `references/documentation.md`. The reviewer's full report
is at `tmp/pr4r-readability.md` in the worktree (git-ignored). Read it: R1–R3 below are its
findings, with its line numbers.

---

## Objective

The documentation matches what PR-4R made true. Two author-facing messages say what they mean.

## Line-Item Instructions

**Documentation only (R1–R4). No code changes.**

- [ ] **R1 (P2), `include/u8g2gl/u8g2gl_draw.h`.**
  - The `Coordinates:` table (≈ lines 41–59) gains a row for a **rounded box's corner radius**:
    clamped by `u8g2gl_coord_corner_radius()` to `2r <= min(w,h)`, and a radius clamping to 0 draws
    square.
  - Note, in a sentence or a row, that generated code clamps a **bound value** through
    `u8g2gl_coord_bound()` before it reaches these functions (§13.5).
  - `u8g2gl_draw_box()`'s `@brief` and `@param radius` state the clamp.
- [ ] **R2 (P3), `include/u8g2gl/u8g2gl_coord.h`.** "BOUND" names two things. Keep "BOUND VALUE"
      for `u8g2gl_coord_bound()`, which it names. Re-word `u8g2gl_coord_clamp()`'s `@brief` and the
      header's conversion list so it no longer says "a BOUND", e.g. "a RANGE-CLAMPED value". The
      reviewer's report has the exact lines. Words only.
- [ ] **R3 (P4), `cli/src/core/resolver/mangle.ts:49–50`.** Fix the file header's Exports alignment
      left over from WO1.
- [ ] **R4 (P4).** Replace the `--` double hyphens with em dashes in the comments the reviewer names in
      `test/editor_host/editor_host.cpp` and `test/test_generated_fixture.cpp`. Comments only.

**Carried message fixes (R5–R7): small, tested.**

- [ ] **R5, `cli/src/core/generator/emit/screen.ts`, the `overrides.unknown` loop (≈ :219–230).**
      Since WO2 a key lands in `unknown` for one of two reasons: it is not one of §10's nine, or the
      element has no setter for it. The message and the comment above it claim only the second.
      Make the message true for both, e.g. by stating which reason applied, using `isStyleAttribute`.
      The validator refuses first, so this is not reachable through the CLI. Test it directly
      through `styleOverridesOf` / the emitter, as the existing emission tests do.
- [ ] **R6, suggestions for a non-§10 override naming a real prop.** `style_text` on a label is
      refused with the message "Write it as the attribute 'text' instead", yet its `suggestions` are
      `['style_font']` by edit distance. [D-16] makes suggestions machine-applicable, so a tool would
      rewrite it to a *different property*. When that remedy applies, the suggestion is the plain
      attribute alone (`['text']`). Otherwise keep today's §10-only closest match.
      (`validate-widget-props.ts`, `checkStyles()` step 2.) Tests: `style_text` → `['text']`; an
      override naming no prop keeps §10 suggestions. You may update **the tests WO2 added**
      (`style-override-restriction.test.ts`) where they pin the old suggestion. No other existing
      assertion changes.
- [ ] **R7, `cli/package-lock.json`.** Its `version` fields read `0.6.0` while `package.json` is
      `0.8.0`. Regenerate with `npm install --package-lock-only`, **not** a fresh resolve. The diff
      should be the two version fields. If anything else changes, revert it and report.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_draw.h` and `u8g2gl_coord.h` (comments only),
`cli/src/core/resolver/mangle.ts` (header only), `test/editor_host/editor_host.cpp` and
`test/test_generated_fixture.cpp` (comments only), `cli/src/core/generator/emit/screen.ts` (R5),
`cli/src/core/validator/validate-widget-props.ts` (R6), `cli/test/` (tests for R5 and R6),
`cli/package-lock.json` (R7), this WORKORDER.

**Do NOT touch:** any runtime behaviour; emitted output (goldens must not move); `docs/`;
`PROGRAM*.md`; `PROJECT.md`; versions; PR-04b's files.

---

## Verification Requirement

- [ ] CLI vitest, tsc, lint; C++ build zero warnings on a clean configure; ctest all pass. Each suite
      alone. Goldens unchanged
- [ ] `git diff --name-only u8g2gl-4r/wo4-bound-arg-clamp..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*(Worker fills this in.)*
