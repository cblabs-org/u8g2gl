---
work_order: WO3
project: pr-04-generator
title: "[D-20] bindable geometry: runtime, manifests, validator"
branch: u8g2gl-generator/wo3-bindable-geometry
base: u8g2gl-generator/wo2-manifest-parity
complexity: standard
status: draft — PA revises against WO2's Completion Report before dispatch
---

# WO3 — [D-20] bindable geometry

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo3-bindable-geometry`
**Base**: `u8g2gl-generator/wo2-manifest-parity`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you
cannot be answered, and your work will strand.

## Standards

`u8g2gl-standards` skill before writing code. Mutators mark dirty, guarded. No
heap. Zero warnings. Element knowledge is data, never code ([D-17]).

## Design authority

[D-20] (`docs/decisions/d20-bindable-geometry.md`), design_spec §6.2, §8.4, §13.5.
Where this work order and the spec disagree, **stop and report**.

---

## Objective

[D-20] made `x`, `y`, `width` and `height` bindable. Nothing implements it: no
manifest declares the bindings, the runtime has no geometry binding, and the
validator rejects `bind_width` as an unknown attribute.

## Line-Item Instructions

- [ ] **Runtime:** `bind_x`, `bind_y`, `bind_width`, `bind_height` on `u8g2gl_obj`
      taking `u8g2gl_subject_int_base*`, driving the per-axis setters PR-3R added.
      Same invariant as WO2: one pool slot, one observer, `false` on exhaustion.
- [ ] **Object manifests:** declare the four as `<bind>` entries on
      `u8g2gl_obj.xml`, so every classed element inherits them via WO1's registry.
- [ ] **Drawing-element manifests:** declare bindings **explicitly** for each
      bindable property (at minimum geometry; `hidden` via `bind_flag_if_*`
      children per §8.4). A drawing element has no setter, so decide how a
      `<bind>` on a `draw=`-only manifest names its target within the **existing**
      `BindDef` shape. If the existing shape cannot express it without a new
      attribute, **stop and report** — new manifest vocabulary is an owner
      decision.
- [ ] **Validator:** accept and type-check bindings from the effective manifest's
      `BindDef.type`, replacing the hardcoded `bind_text`/`bind_value` checks in
      `validate-types.ts`. Format-string checks stay, keyed off the binding's
      declared `fmt`, not its name.
- [ ] **[D-20] diagnostic:** a container whose own geometry is bound may not have
      anchor-positioned children (`right`, `bottom`, `hcenter`, `vcenter`). Name
      the container, the bound attribute and the anchored child.
- [ ] Resolve the attribute-acceptance mismatches WO1 recorded between
      `COMMON_ATTRIBUTES` and effective manifests, per the PA's revision of this
      line item.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp` (geometry
bindings only); `include/u8g2gl/manifests/*.xml` (`<bind>` additions only);
`cli/src/data/manifests.json` (rebuilt); `cli/src/core/validator/validate-types.ts`,
`validate-widget-props.ts`, `validate-geometry.ts` (the [D-20] diagnostic);
`schema/diagnostic.ts` (new codes); tests; this WORKORDER.

**Do NOT touch:** the resolver or generator (WO5+); render path (WO4); parser;
schema vocabulary.

---

## Testing Requirement

- [ ] Bound width on an object updates geometry and marks the frame dirty on a
      static screen.
- [ ] `bind_width` on `<u8g2gl_box>` validates; a `bool` subject bound to it is a
      type error.
- [ ] A mistyped format specifier still fails, now via the declared `fmt`.
- [ ] Geometry-bound container with an anchored child is an error; with absolute
      children it is not.

## Verification Requirement

- [ ] C++ build zero warnings; `ctest` all pass
- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
