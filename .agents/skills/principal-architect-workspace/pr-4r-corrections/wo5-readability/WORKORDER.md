---
work_order: WO5
project: pr-4r-corrections
title: "Readability remediation and the carried message fixes"
branch: u8g2gl-4r/wo5-readability
base: u8g2gl-4r/wo4-bound-arg-clamp
complexity: standard
status: complete
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

**Work only in `../U8G2GL-4r`.** **Branch**:
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

- [x] **R1 (P2), `include/u8g2gl/u8g2gl_draw.h`.**
  - The `Coordinates:` table (≈ lines 41–59) gains a row for a **rounded box's corner radius**:
    clamped by `u8g2gl_coord_corner_radius()` to `2r <= min(w,h)`, and a radius clamping to 0 draws
    square.
  - Note, in a sentence or a row, that generated code clamps a **bound value** through
    `u8g2gl_coord_bound()` before it reaches these functions (§13.5).
  - `u8g2gl_draw_box()`'s `@brief` and `@param radius` state the clamp.
- [x] **R2 (P3), `include/u8g2gl/u8g2gl_coord.h`.** "BOUND" names two things. Keep "BOUND VALUE"
      for `u8g2gl_coord_bound()`, which it names. Re-word `u8g2gl_coord_clamp()`'s `@brief` and the
      header's conversion list so it no longer says "a BOUND", e.g. "a RANGE-CLAMPED value". The
      reviewer's report has the exact lines. Words only.
- [x] **R3 (P4), `cli/src/core/resolver/mangle.ts:49–50`.** Fix the file header's Exports alignment
      left over from WO1.
- [x] **R4 (P4).** Replace the `--` double hyphens with em dashes in the comments the reviewer names in
      `test/editor_host/editor_host.cpp` and `test/test_generated_fixture.cpp`. Comments only.

**Carried message fixes (R5–R7): small, tested.**

- [x] **R5, `cli/src/core/generator/emit/screen.ts`, the `overrides.unknown` loop (≈ :219–230).**
      Since WO2 a key lands in `unknown` for one of two reasons: it is not one of §10's nine, or the
      element has no setter for it. The message and the comment above it claim only the second.
      Make the message true for both, e.g. by stating which reason applied, using `isStyleAttribute`.
      The validator refuses first, so this is not reachable through the CLI. Test it directly
      through `styleOverridesOf` / the emitter, as the existing emission tests do.
- [x] **R6, suggestions for a non-§10 override naming a real prop.** `style_text` on a label is
      refused with the message "Write it as the attribute 'text' instead", yet its `suggestions` are
      `['style_font']` by edit distance. [D-16] makes suggestions machine-applicable, so a tool would
      rewrite it to a *different property*. When that remedy applies, the suggestion is the plain
      attribute alone (`['text']`). Otherwise keep today's §10-only closest match.
      (`validate-widget-props.ts`, `checkStyles()` step 2.) Tests: `style_text` → `['text']`; an
      override naming no prop keeps §10 suggestions. You may update **the tests WO2 added**
      (`style-override-restriction.test.ts`) where they pin the old suggestion. No other existing
      assertion changes.
- [x] **R7, `cli/package-lock.json`.** Its `version` fields read `0.6.0` while `package.json` is
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

- [x] CLI vitest, tsc, lint; C++ build zero warnings on a clean configure; ctest all pass. Each suite
      alone. Goldens unchanged
- [x] `git diff --name-only u8g2gl-4r/wo4-bound-arg-clamp..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: complete.** Branch `u8g2gl-4r/wo5-readability`, base `u8g2gl-4r/wo4-bound-arg-clamp`.
Authorization verified from `../PROJECT.md` (owner approval 2026-09-28 08:48 BST, verbatim; WO5 in
the decomposition) and this file's `status: dispatched`.

### Commits

| SHA | Items |
|---|---|
| `52c2f77` | R1–R4, comments only |
| `1ca9343` | R5, R6 and their tests |
| `f11b06e` | R7 |

### Per item

- **R1.** `u8g2gl_draw.h`'s Coordinates table has a row for the rounded box's corner radius
  (`u8g2gl_coord_corner_radius()`, `2r <= min(w, h)`, a radius clamping to 0 draws square), and a
  paragraph saying generated code clamps a bound value through `u8g2gl_coord_bound()` before these
  functions (§13.5). `u8g2gl_draw_box()`'s `@brief` and `@param radius` state the clamp, pointing
  at `u8g2gl_coord_corner_radius()` for the derivation.
- **R2.** `u8g2gl_coord.h`: `u8g2gl_coord_clamp()`'s input is now a "RANGE-CLAMPED VALUE" in the
  header's conversion list and in its `@brief`. "BOUND" appears only in "BOUND VALUE"
  (`u8g2gl_coord_bound()`). The Exports list never used the word, so it is unchanged.
- **R3.** `resolver/mangle.ts` Exports descriptions all start in one column:
  `RESERVED_IDENTIFIER_PREFIXES` (WO1's leftover) and `OBJECT_IDENTIFIER_PREFIX` (off by one, older
  than WO1, same block).
- **R4.** Em dashes replace ` -- ` in every comment PR-4R added to the two files:
  `editor_host.cpp:473` (a pair) and `test_generated_fixture.cpp:413, 415, 422` (a pair on 422).
  The reviewer's `414, 422, 427` were off by a line or two; the stack diff now has no ` -- `.
- **R5.** `emit/screen.ts`: the `unknown` loop picks one of two reasons with `isStyleAttribute`.
  "Is not a style override: inline overrides are limited to §10's style properties, <the nine>",
  or the no-setter message. The wording is Pass 4's. The comment above the loop, and the stale
  banner line "No validator pass checks `style_*` values today", now say what is true. Tested
  through `emitScreenUnit` on a cleanly generated document with the override put on the resolved
  element: `text` gets the §10 reason and not the setter one. The control is `font_mode` against
  a label manifest served without that prop, which gets the setter reason. Every framework element
  with an object sets all nine, so the control needs the trimmed manifest.
- **R6.** `checkStyles()` step 2: when the element declares the prop, the suggestion is `[name]`,
  the plain attribute. Otherwise it is still the §10-only closest match. The step's comment is
  updated to match. Tests: `style_text` gives `['text']` and `style_long_mode` gives
  `['long_mode']`. `style_font_mod`, which names no prop, keeps the §10 suggestions, including
  `style_font_mode`, and has no remedy sentence. **Assertion changed:** WO2's "suggests only
  overrides the element can take, from among the nine" used `style_long_mode` and pinned the old
  suggestion. It is replaced by the table case above, and its §10-only check moves to the no-prop
  case. No other existing assertion changed.
- **R7.** `npm install --package-lock-only`. The diff is the two `version` fields, `0.6.0` to
  `0.8.0`, and nothing else.

The three behaviour cases (R6 × 2, R5's `text`) were shown to **fail on the old source** and pass
on the new. The controls pass on both.

### Verification (each suite alone)

| | Before (base) | After |
|---|---|---|
| CLI vitest | 1083 / 64 files | **1087 / 64 files** (−1 replaced, +5 new) |
| `tsc --noEmit`, `npm run lint` | clean | clean |
| C++ clean configure (`build/wo5`) | — | **0 warnings** |
| ctest | 377, one known skip (PA) | **377, one known skip** (`SizeOfReport.ThirtyTwoBitTarget`) |
| Goldens | — | `refresh-goldens.mjs` against a fresh `dist/`: no diff; `emit-golden` passes |

`git diff --name-only u8g2gl-4r/wo4-bound-arg-clamp..HEAD`: the nine in-box files, plus
`PROJECT.md` and this WORKORDER from the PA's dispatch commit `d2addd7`.

### Findings (out of scope, not fixed)

1. `test/test_generated_fixture.cpp:489` has one more ` -- ` pair ("a case-folded alias, most
   obviously"). It is older than PR-4R and the reviewer did not name it, so it was left alone.
2. R6's remedy is not guarded against the element **already** writing the plain attribute. For
   `text="a" style_text="b"`, the machine-applicable `['text']` would produce a duplicate
   attribute. The message has the same gap. It is rare, and the check is a small follow-up.
3. `resolver/mangle.ts:50`'s `CPP_KEYWORDS` Exports line is over 100 columns. I aligned it but did
   not wrap it: only the alignment was in scope.
4. Carried as before, and not touched: a `style_*` on a drawing element whose name is one of the
   nine (e.g. `style_radius` on `u8g2gl_box`) still gets the setter message, not §13.5's. R5's
   emitter never sees drawing elements, so that stays Pass 4's.
