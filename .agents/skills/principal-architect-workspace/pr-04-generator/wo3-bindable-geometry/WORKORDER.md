---
work_order: WO3
project: pr-04-generator
title: "[D-20] bindable geometry: runtime, manifests, validator"
branch: u8g2gl-generator/wo3-bindable-geometry
base: u8g2gl-generator/wo2-manifest-parity
complexity: standard
status: dispatched
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
- [ ] **Attribute acceptance — manifests are the source.** WO1 recorded that
      `COMMON_ATTRIBUTES` (`validate-widget-props.ts`) admits `name`, `right`,
      `bottom`, `hcenter`, `vcenter`, `style`, `focus_style` and `focusStyle`,
      none of which any manifest declares, and also repeats geometry and `hidden`,
      which manifests do declare. Reduce `COMMON_ATTRIBUTES` to **identity and
      anchor/style attributes only** — `name`, `right`, `bottom`, `hcenter`,
      `vcenter`, `style`, `focus_style` — so `x`, `y`, `width`, `height` and
      `hidden` are accepted only where the effective manifest declares them.
      Remove `focusStyle` unless something reads it; say which. A drawing element
      is hidden through `<bind_flag_if_*>` children (§6.2's own example), not a
      literal `hidden`. **If a spec example or fixture puts a literal `hidden` on a
      drawing element, stop and report** rather than choosing.

## Added by the Principal Architect after WO2 — do these first

WO2 removed the parser's implicit `extends` default and, to keep the schema check
quiet, added `extends="u8g2gl_obj"` to the eight drawing manifests. It said plainly
that this conflicts with design_spec §6.2 and §6.5. The PA's decision, consistent
with the Chief Architect's ruling on `main` (`4e4b992`: `extends` must name a
manifest, and names real C++ inheritance), is recorded in PROJECT.md under
"WO2 — complete". Implement it:

- [ ] **Drawing manifests declare no `extends`.** Remove it from `u8g2gl_box`,
      `circle`, `ellipse`, `hline`, `line`, `pixel`, `triangle`, `vline`. A drawing
      element has no class ([D-18]).
- [ ] **`u8g2gl_obj` is the single root.** Remove its self-referencing
      `extends="u8g2gl_obj"`. The registry treats `u8g2gl_obj` as the root class
      manifest because §13.7 names it as the base every generated object is reached
      through — one documented contract constant, with a why-comment, not an
      element list. Remove WO1/WO2's self-extends-as-root handling if nothing else
      needs it.
- [ ] **The `extends` rule in the schema pass (`validate-schema.ts`):**
      a manifest with any `setter=` prop, other than the root, requires `extends`
      (the existing "missing required attribute" error, now reachable); a `draw=`-only
      manifest that declares `extends` is an error (a drawing element has no class
      to inherit from); a manifest with a `<view>` needs none, since the registry
      supplies `u8g2gl_obj`. A test for each branch.
- [ ] **Remove the `it.fails` marker** for `u8g2gl_box` in
      `manifest-crosstest.test.ts` (`OPEN_EFFECTIVE_ORDER_MISMATCHES`). With no
      inherited `radius`, box's effective draw order is its declared order. The set
      should be empty; delete it rather than leave an empty exception list.
- [ ] **W5 — stale comments** left by WO2's F2 change in
      `validate-references.ts` and `schema/widget-manifest.ts`.

## Carried from WO1 (PA triage)

- [ ] **F4 — prop-check composite interiors.** `validate-widget-props.ts` walks
      only screens, so elements inside a composite's `<view>` are never
      prop-checked. §13.11 requires composite interiors to be validated on the same
      path as screens. `$prop` values are template placeholders and are skipped, as
      the other passes already do.
- [ ] **F6 — type-check the tests.** `cli/tsconfig.json` covers only `src/`; four
      type errors already exist (`element-identity.test.ts:230/375/376`,
      `geometry.test.ts:44`). Add a test type-check (a `tsconfig.test.json` run by
      the lint or test script) and fix those four.
- [ ] **F7 — duplicate plain-widget manifests.** Two project manifests declaring
      the same tag are diagnosed only when both are composites. Diagnose it for
      every manifest, naming both files.
- [ ] **F11 — retire "component" wording** remaining in the schema, references and
      identifiers passes, updating the assertions that pin it.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp` (geometry
bindings only); `include/u8g2gl/manifests/*.xml` (`<bind>` additions, and removal
of `extends` from drawing manifests and from `u8g2gl_obj.xml`);
`cli/src/data/manifests.json` (rebuilt); `cli/src/core/manifest/` (root handling
only); `cli/src/core/validator/` — `validate-types.ts`, `validate-widget-props.ts`,
`validate-geometry.ts` (the [D-20] diagnostic), `validate-schema.ts` (the `extends`
rule, F7, F11), `validate-references.ts` and `validate-identifiers.ts` (F7, F11, W5);
`cli/src/core/schema/widget-manifest.ts` (comments only), `schema/diagnostic.ts`
(new codes); `cli/test/manifests/manifest-crosstest.test.ts`; `cli/tsconfig*.json`
and `cli/package.json` scripts (F6 only); tests; this WORKORDER.

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
