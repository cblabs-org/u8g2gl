---
work_order: WO8c
project: pr-04-generator
title: "Validator alignment: exact object ceiling, refusal severity, wd_ un-reserved"
branch: u8g2gl-generator/wo8c-validator-alignment
base: u8g2gl-generator/pa-ca-rulings
complexity: standard
status: dispatched
---

# WO8c — Validator alignment

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO8c as
approved by the owner** ("Owner approval — WO8c"); and that this WORKORDER's `status` is
`dispatched`. If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8c-validator-alignment`
**Base**: `u8g2gl-generator/pa-ca-rulings` (the PA commit applying the Chief Architect's
spec rulings, on top of WO8b)

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be
answered, and your work will strand uncommitted. Do not push.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element knowledge is
data, never code.

## Design authority

design_spec §7.2, §13.3, §13.4 and §13.5 **as they stand on this branch** — §13.4 was
corrected on 2026-09-16 and no longer reserves `wd_`. [A-3], [D-12], [D-18], [D-21].
**"Stop and report" means record it, do not choose, continue with the remaining items.**

---

## Objective

Three validator gaps that WO8b's realisation exposed, closed before emission is written
against them. Emission (WO9, WO10) must not be built on a ceiling check that under-counts.

## Background — the ceiling is a live hole, reproduced

`validate-schema.ts`'s `countScreenObjects` predates [D-18]. It **omits composite
containers** and **counts drawing elements** — both inverted by that decision — so its comment
claiming it "can never miss a real overflow" is false. Verified end to end by the PA on
2026-09-16: a project of 128 composite instances reaches **256 objects**, past the structural
limit of 254, and **both `validate` and `generate` exit 0 with no diagnostic**.

`parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` consumes one value ([A-3], [D-21]), so
254 is a property of the object model, not a tunable. WO8b now computes the exact count.

## Line-Item Instructions

- [ ] **The ceiling uses realisation's exact count.** Replace `countScreenObjects` with the
      object count WO8b's realisation produces for the same screen, so the 254 limit is
      enforced on what will actually be emitted. Keep the diagnostic naming the screen, its
      count and the ceiling. If threading realisation into the validator would invert a module
      dependency, say so in the Completion Report and use the shared model rather than
      inventing a second count — **there must be exactly one object count in the codebase**,
      and a test should make a second one fail.
- [ ] **Regression test at the boundary:** 256 objects (the 128-composite case above) is an
      error; 254 is not. Both through `validate` **and** `generate`. The 256 case must pass
      at this branch's base — say so in the report, since that is the defect's proof.
- [ ] **Realisation's refusal obeys the journey split.**
      `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` is raised inside `generate()` only, so `validate`
      passes a document `generate` refuses. Make it a **warning in `validate`** and an
      **error in `generate`**, like every other refusal (PROJECT.md decision 1), using the
      existing severity mechanism rather than a new one.
- [ ] **`wd_` is no longer reserved (Chief Architect ruling, §13.4 on this branch).** Remove
      `wd_` from `RESERVED_IDENTIFIER_PREFIXES` (`resolver/mangle.ts:50`) and from
      `RESERVED_PREFIXES` (`validator/validate-identifiers.ts:27`). **Collapse the two lists
      into one** exported constant — they are the same rule spelled twice, and §13.4 is its
      source. Keep `u8g2gl_` and `ui_` reserved. The prefix strip at
      `parser/parse-widget-tree.ts:380` still strips `wd_` for display purposes; leave it, and
      say whether it still makes sense.
- [ ] **Restore a `wd_` fixture.** WO7 renamed a fixture from `wd_card` to `card` because the
      validator rejected it. Restore a `wd_`-named composite or custom element in the fixtures
      and assert it validates, so §6.6's convention is covered by a test rather than by
      absence. A `u8g2gl_`-named or `ui_`-named user element must still fail.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-schema.ts`, `validate-identifiers.ts`;
`cli/src/core/resolver/mangle.ts` (the prefix list only);
`cli/src/core/generator/` (severity plumbing and exposing realisation's count only);
`cli/src/core/schema/diagnostic.ts`; `cli/test/` including fixtures; this WORKORDER.

**Do NOT touch:** emission (WO9+); realisation's analysis itself (WO8b — consume it, do not
change it); WO8a's pipeline and its expansion-count test; runtime C++; manifests; `docs/`;
`PROGRAM*.md`.

---

## Testing Requirement

- [ ] 256 objects errors in `validate` and `generate`; 254 passes. The 256 case passes at the
      base — state that from a throwaway worktree under `tmp/`.
- [ ] A `draw=`-only element named by a focus ring warns in `validate` and errors in
      `generate`, with the same code and location.
- [ ] A `wd_`-named user element validates; `u8g2gl_`- and `ui_`-named ones still fail.
- [ ] One reserved-prefix list remains — a test fails if a second appears.

## Verification Requirement

- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (baseline 694)
- [ ] `cmake --build build` zero warnings; `ctest --test-dir build` unchanged (baseline 305,
      one known skip)
- [ ] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
