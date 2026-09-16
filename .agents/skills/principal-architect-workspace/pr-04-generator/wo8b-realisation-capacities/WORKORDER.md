---
work_order: WO8b
project: pr-04-generator
title: "Realisation, flattening and generated capacities"
branch: u8g2gl-generator/wo8b-realisation-capacities
base: u8g2gl-generator/wo8a-one-pipeline
complexity: standard
status: dispatched
---

# WO8b — Realisation and capacities

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **the WO8
split as approved by the owner**; and that this WORKORDER's `status` is `dispatched`. If any
is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8b-realisation-capacities`
**Base**: `u8g2gl-generator/wo8a-one-pipeline`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Static capacities are generated, never guessed. Deterministic.

## Design authority

design_spec §13.3, §13.5, §18.1 on `main` @ `5f2574f`; [D-18] **and its 2026-09-13
amendment**; [D-21]. **"Stop and report" means record it, do not choose, continue with the
remaining items.**

---

## Objective

Decide, for every element in the whole document, whether it becomes an object or draw calls
and why; flatten to the object array; and count every capacity the runtime needs from what
was decided. WO8a's single pipeline supplies one expanded, resolved, mangled model — consume
it; do not expand, resolve or mangle again.

## What WO8a built, and two cautions

WO8a delivered `cli/src/core/resolver/pipeline.ts` and `cli/src/core/validator/shared-model.ts`:
one expansion and one screen resolution, shared by every validator pass and by `generate()`,
with mangling wired in and a test that counts expansions over the real `expandScreens`.
**Consume that model. Do not expand, resolve or mangle again**, and do not weaken the count
assertion — it has already caught a silent fallback where every pass built its own pipeline
and the suite stayed green.

- **"Resolve once" is true of screens, not templates.** Pass 6 still resolves a composite's
  own `<view>` separately, as WO7b requires so a template defect is reported once. Do not
  assume a composite template carries resolved geometry, and do not "fix" that here.
- **The pipeline is built for one target.** `ValidateInput.pipeline` carries a display
  obligation nothing enforces: pass the pipeline built for the target you are working on, and
  say in your report where that is threaded.

## Background — this is a whole-document analysis, not a predicate

Whether an instance needs an object depends on who binds to it, what focus ring names it,
what events it carries, and whether it is a composite or has children. None of that is local
to the element.

**The [D-18] amendment applies:** an element backed by a class is **always** an object for
now. Only `draw=`-only elements are realised as draw calls. The realisation pass still
evaluates and records every condition of the rule, so the reason reported is true and the
demotion can be switched on later without rewriting this pass.

## Line-Item Instructions

- [ ] **Realisation decision per instance** with a reason code for each condition that held:
      class-backed (amendment), binding, event, focus-ring member, composite, has children,
      typed child pointer. Focus and events are modelled even though `generate` refuses them
      (PROJECT.md decision 1).
- [ ] A **`draw=`-only element referenced by something that needs an object** (focus ring,
      event) is an error — it has no class to instantiate.
- [ ] **Flatten** depth-first in document order: object array, `uint8_t` parent table,
      `U8G2GL_NO_PARENT` at view level (§13.3). Draw-call elements keep their position in draw
      order, interleaved with objects.
- [ ] **Build-time ancestor visibility** for draw-call elements: the conjunction of
      ancestor-object hidden checks and the element's own bound flags (§13.5).
- [ ] **Capacities ([D-21]):** objects on the busiest screen; bindings on the busiest object;
      total bindings as the **true sum**; styles. Count against WO2's invariant (one binding,
      one pool slot, one observer).
- [ ] **Per-subject observer counts → `_n<N>`:** object bindings observing the subject, plus
      **one** frame-dirty observer if any draw-call element binds it (§13.5). String subjects
      also carry `max_len`. This is the PR-01 constraint nearly lost once — test it directly.
- [ ] **Choose the binding overload by subject type (WO5a 4).** A binding name may appear once
      per subject type (`bind_text` for `string` and `int`). Record the declaration whose
      `type` matches the bound subject, so WO10 and WO11 emit from that choice rather than
      re-selecting by name.
- [ ] The 254-object ceiling: the validator's conservative over-count stays; report whether
      the exact count now available disagrees with it, as a finding.

## Strict Boundary Box

**In scope:** new `cli/src/core/generator/realise/` (or equivalent) and the flattened model
type; `cli/src/core/generator/` wiring to consume WO8a's pipeline result;
`cli/src/core/schema/diagnostic.ts` (new codes only); `cli/test/`; this WORKORDER.

**Do NOT touch:** emission (WO9+); the validator passes (report the ceiling question instead);
runtime; manifests; `docs/`.

---

## Testing Requirement

- [ ] §13.12 example: `rule` is draw calls; `bar`, `bar_location`, `bar_wifi_icon`,
      `bar_clock`, `msg` are objects, in that array order, with parents
      `NO_PARENT, 0, 0, 0, NO_PARENT`.
- [ ] A static label with no references is still an object, with the class-backed reason
      (amendment).
- [ ] Two draw-call elements and one object bound to the same subject: observer count 2 (one
      object binding + one frame-dirty).
- [ ] Total bindings equals the sum, not objects × max.
- [ ] A `bind_text` to an int subject records the int declaration, not the string one.

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
