---
work_order: WO8
project: pr-04-generator
title: "Realisation, flattening and generated capacities"
branch: u8g2gl-generator/wo8-realisation-capacities
base: u8g2gl-generator/wo7-composite-expansion
complexity: standard
status: draft — PA revises against WO7's Completion Report before dispatch
---

# WO8 — Realisation and capacities

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8-realisation-capacities`
**Base**: `u8g2gl-generator/wo7-composite-expansion`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Static capacities are generated, never guessed.
Deterministic.

## Design authority

design_spec §13.3, §13.5 (corrected: one frame-dirty observer per subject),
§18.1; [D-18] **and its 2026-09-13 amendment**; [D-21]. Where this work order and
the spec disagree, **stop and report**.

---

## Objective

Decide, for every element in the whole document, whether it becomes an object or
draw calls and why; flatten to the object array; and count every capacity the
runtime needs from what was decided.

## Background — this is a whole-document analysis, not a predicate

Whether an instance needs an object depends on who binds to it, what focus ring
names it, what events it carries, and whether it is a composite or has children.
None of that is local to the element.

**The [D-18] amendment applies:** an element backed by a class is **always** an
object for now. Only `draw=`-only elements are realised as draw calls. The
realisation pass still evaluates and records every condition of the rule, so the
reason reported is true and the demotion can be switched on later without
rewriting this pass.

## Line-Item Instructions

- [ ] **Realisation decision per instance** with a reason code for each condition
      that held: class-backed (amendment), binding, event, focus-ring member,
      composite, has children, typed child pointer. Focus and events are modelled
      even though `generate` refuses them (PROJECT.md decision 1).
- [ ] A **`draw=`-only element referenced by something that needs an object**
      (focus ring, event) is an error — it has no class to instantiate.
- [ ] **Flatten** depth-first in document order: object array, `uint8_t` parent
      table, `U8G2GL_NO_PARENT` at view level (§13.3). Draw-call elements keep
      their position in draw order, interleaved with objects.
- [ ] **Build-time ancestor visibility** for draw-call elements: the conjunction of
      ancestor-object hidden checks and the element's own bound flags (§13.5).
- [ ] **Capacities ([D-21]):** objects on the busiest screen; bindings on the
      busiest object; total bindings as the **true sum**; styles. Count against
      WO2's invariant (one binding, one pool slot, one observer).
- [ ] **Per-subject observer counts → `_n<N>`:** object bindings observing the
      subject, plus **one** frame-dirty observer if any draw-call element binds it.
      String subjects also carry `max_len`. This is the PR-01 constraint nearly lost
      once — test it directly.
- [ ] **Carried from WO7 — F1: wire mangling in.** `mangle.ts` (`mangleIdentifiers`)
      raises `U8G2GL_NAME_COLLISION` naming both sources, but neither `validate` nor
      `generate` calls it, and Pass 7's older one-level inlining-collision check still
      runs. Call the mangler once on the single pipeline, retire the old check, and make
      `generate` refuse on its errors. An end-to-end test: `a_b` at screen level beside
      child `b` of instance `a` fails `validate` and `generate`, naming both.
- [ ] **Carried from WO7 — F2/F3: expand once, then resolve.** `generate()` resolves
      unexpanded screens, so its resolved model lacks composite interiors, and `validate`
      expands twice (Passes 5 and 6). One expansion, shared by validation and generation,
      followed by one resolution of the expanded tree.
- [ ] **Carried from WO7 — F8: one flag set.** `hidden`/`disabled` is spelled in two
      passes. Define it once beside the drawing-element predicate below.
- [ ] **Carried from WO6 — resolve once.** `generate()` already resolves the first target
      twice (inside validation, then for the built target). Realisation consumes
      `GenerateResult.resolved` and the expanded tree WO7 produces; it must not resolve
      again, and must not add a third pass.
- [ ] **Carried from WO5a — one "drawing element" predicate.** Whether a manifest is a
      drawing element (no `view`, declared `draw=` props, no `setter=` props) is spelled
      in `validate-schema.ts`, `validate-widget-props.ts` and the manifest cross-test.
      Realisation needs the same answer. Put it on the registry once, use it here, and
      migrate the three existing call sites to it.
- [ ] **Carried from WO5a — choose the binding overload by subject type.** A binding
      name may appear once per subject type (`bind_text` for `string` and `int`). When
      counting and recording bindings, select the declaration whose `type` matches the
      bound subject — never the first match by name.
- [ ] The 254-object ceiling: the validator's conservative over-count stays; report
      whether the exact count now available disagrees with it, as a finding.

## Strict Boundary Box

**In scope:** new `cli/src/core/generator/realise/` (or equivalent) and the
flattened model type; `cli/src/core/manifest/` (the drawing-element predicate only);
`cli/src/core/validator/validate-schema.ts`, `validate-widget-props.ts` and
`cli/test/manifests/manifest-crosstest.test.ts` (migrating to that predicate only);
`cli/src/core/validator/validate.ts`, `validate-identifiers.ts` and the pass that holds
the retired one-level collision check (F1 wiring only); `cli/src/core/generator/`
(expand-once, resolve-once, mangling refusal); `cli/src/core/resolver/` (sharing one
expansion result only); the validator passes spelling the flag set (F8 only); `schema/diagnostic.ts`; tests; this WORKORDER.

**Do NOT touch:** emission (WO9+); validator (report the ceiling question
instead); runtime; manifests.

---

## Testing Requirement

- [ ] §13.12 example: `rule` is draw calls; `bar`, `bar_location`,
      `bar_wifi_icon`, `bar_clock`, `msg` are objects, in that array order, with
      parents `NO_PARENT, 0, 0, 0, NO_PARENT`.
- [ ] A static label with no references is still an object, with the
      class-backed reason (amendment).
- [ ] Two draw-call elements and one object bound to the same subject: observer
      count 2 (one object binding + one frame-dirty).
- [ ] Total bindings equals the sum, not objects × max.

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
