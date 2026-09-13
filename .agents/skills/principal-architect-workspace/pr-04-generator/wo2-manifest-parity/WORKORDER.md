---
work_order: WO2
project: pr-04-generator
title: "Manifest ↔ runtime parity: every manifest target exists with the right shape"
branch: u8g2gl-generator/wo2-manifest-parity
base: u8g2gl-generator/wo1-manifest-registry
complexity: standard
status: draft — PA revises against WO1's Completion Report before dispatch
---

# WO2 — Manifest ↔ runtime parity

## Authorization

Part of PR-04 (`pr-04-generator`). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — the owner's own words with
a timestamp. If it is absent or a placeholder, **stop and report**. Also confirm
this WORKORDER's `status` is `dispatched`; a `draft` has not been revised against
its predecessor and must not be executed.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo2-manifest-parity`
**Base**: `u8g2gl-generator/wo1-manifest-registry`

Verify with `git branch --show-current` **as its own command immediately before
every commit**, never batched with the commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit on a green build. Do NOT stop to ask for approval —
you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code; read `references/cpp.md`
and `references/typescript.md`. Every mutator that changes what is drawn calls
`mark_dirty()`, guarded on the value changing (the house pattern from PR-3R WO1).
Zero warnings. No heap.

## Design authority

`docs/design_spec.md` is normative — §6.3, §8, §13.1, §13.8. Where this work
order and the spec disagree, **stop and report**.

---

## Objective

The generator will emit a call for every `setter=`, `draw=` and `<bind setter=>`
in every manifest. Prove each one exists with the shape the generator will assume,
and repair the ones that do not.

## Background

- `u8g2gl_clock.xml` declares `<bind name="bind_time" type="int" setter="bind_time" />`.
  No `bind_time` exists in `include/` or `src/`, and the type should be `time`
  (`u8g2gl_subject_time` exists). §13.12's worked example calls it.
- `bind_value` on `u8g2gl_progress_bar.xml` and `u8g2gl_switch.xml` — the same:
  declared, not implemented.
- `manifest-crosstest.test.ts` checks only that `draw=` names a declared function.
  It never checked `<prop setter=>` or `<bind setter=>`, which is how these shipped.
- The generator will pass a drawing element's props to its `draw=` function **in
  manifest declaration order** (WO1 pins that order). Nothing verifies the header
  agrees.

**PA decision recorded in PROJECT.md:** `bind_time` is **implemented**, not
refused.

## Line-Item Instructions

- [ ] **Cross-test: `<prop setter=>`.** Parse the class headers along the
      effective `extends` chain (use WO1's registry) and assert each setter is a
      declared public method. Self-check the extractor is not vacuous.
- [ ] **Cross-test: `<bind setter=>`.** Same, for every binding — the check the
      Chief Architect directed.
- [ ] **Cross-test: `draw=` shape.** For each drawing element, the draw function's
      parameters after `U8G2&` match the manifest's `draw=` props in count and
      declaration order, by name.
- [ ] **Cross-test: bind types.** Every `<bind type=>` is a subject type
      (`int|string|bool|time`).
- [ ] **Implement `u8g2gl_clock::bind_time(u8g2gl_subject_time_base*)`** and retype
      the manifest to `time`.
- [ ] **Implement `bind_value`** on the progress bar and the switch against the
      subject types their manifests declare.
- [ ] **One binding, one slot, one observer.** Every object binding method —
      existing and new — consumes exactly one `s_binding_pool` slot and one subject
      observer slot, and returns `false` on exhaustion. Add a runtime test per
      binding method asserting both. WO8 counts capacities against this invariant;
      if an existing method violates it, fix the method, not the invariant.
- [ ] Fix any further mismatch the new cross-tests expose **in manifests or by
      adding a missing runtime method**. If a mismatch needs a design choice (a
      manifest naming behaviour the class cannot sensibly have), **stop and
      report** it rather than choosing.

## Strict Boundary Box

**In scope:** `cli/test/manifests/manifest-crosstest.test.ts` (and helpers beside
it); `include/u8g2gl/manifests/*.xml` (setter, type and bind corrections only);
`include/u8g2gl/u8g2gl_clock.h`, `u8g2gl_progress_bar.h`, `u8g2gl_switch.h`,
`u8g2gl_obj.h` and their `src/` counterparts (binding methods only);
`cli/src/data/manifests.json` (rebuilt); `test/` C++ tests; this WORKORDER.

**Do NOT touch:** geometry bindings (`bind_x` etc.) — WO3; the validator — WO3;
the render path or version header — WO4; schema vocabulary (no new manifest
attributes — owner decision).

---

## Testing Requirement

- [ ] Each new cross-test fails against WO1's tip for at least one real manifest
      (bind setters certainly), then passes.
- [ ] Clock renders a bound time subject; progress bar and switch update from a
      bound subject and mark dirty.
- [ ] Pool/observer invariant tested per binding method, including exhaustion.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass
- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean
- [ ] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file issues.

---

## Completion Report

*To be filled in by the worker.*
