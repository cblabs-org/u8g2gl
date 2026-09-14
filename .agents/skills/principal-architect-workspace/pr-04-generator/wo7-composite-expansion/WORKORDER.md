---
work_order: WO7
project: pr-04-generator
title: "Composite expansion and identifier mangling"
branch: u8g2gl-generator/wo7-composite-expansion
base: u8g2gl-generator/wo6-resolver
complexity: standard
status: draft — PA revises against WO6's Completion Report before dispatch
---

# WO7 — Composite expansion and mangling

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo7-composite-expansion`
**Base**: `u8g2gl-generator/wo6-resolver`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Isomorphic core. Deterministic: document order, never
map or set iteration order where it reaches output.

## Design authority

design_spec §6.4, §8.3, §13.4, §13.6 steps 1–3, [D-18], [D-20]. Element identity
(ui_spec §16.1) is settled — **do not synthesise names**. Where this work order
and the spec disagree, **stop and report**.

---

## Objective

A screen's tree expanded so it contains only concrete elements, with every name
mangled to its C++ identifier and every geometry resolved against its real
container.

## Line-Item Instructions

- [ ] **Bind arguments to `<api>` props:** supplied attributes, then declared
      defaults; a missing required prop is an error.
- [ ] **Substitute `$prop`** through the `<view>` subtree. A `type="subject"` prop
      substitutes the subject *name*, which the enclosing `bind_*` then resolves;
      a name that is not a declared subject is a clear error at the instantiation
      site (§6.4).
- [ ] **Prefix names** with the instance name, recursively for nested composites
      (`bar_clk_digits`).
- [ ] **Resolve geometry against the container** using WO6's resolver:
      `#parent_*` and anchors inside the subtree measure the instance's resolved
      geometry. Remove the "no absolute check at a composite's top level" gap in
      `validate-geometry.ts`, now that the size is known per instance.
- [ ] **Mangling (§13.4):** the full table — screen functions, objects, composite
      children, subjects (`ui_subject_*`, `ui_set_*`), fonts, images, styles.
      Reserved prefixes and C++ keywords. **A collision after mangling is a hard
      error naming both sources** — never a silent rename.
- [ ] Provenance: every expanded node keeps its original source location and the
      instantiation chain, so later diagnostics can point at both.
- [ ] **Carried from WO3 — type-check composite interiors.** `validate-types.ts`
      walks only screens. Binding types inside a composite's `<view>` can only be
      checked after `$subject` substitution, so run the types pass over the expanded
      tree, reporting at the interior element with the instantiation site attached.
- [ ] **Carried from WO5a — flag values are never checked.** `<bind_flag_if_*>` with
      `flag="hiden"`, or with no `flag` at all, validates silently. §8.4 fixes the set at
      `hidden` and `disabled`; an unknown or missing flag is an error with a near-miss
      suggestion. Check it in the same types-pass walk.
- [ ] **Carried from WO5b — the parser drops `extends` on a composite.**
      `parse-widget-manifest.ts` sets `extends` only when a manifest has no `<view>`,
      so `<widget extends="…"><view>` silently loses it and WO5b's PR-08 refusal for a
      composite with its own C++ class cannot fire from real XML. Keep `extends` as
      written on a `<view>` manifest. The registry still supplies `u8g2gl_obj` to a
      composite that declares none. Add an end-to-end test: that XML now produces
      `U8G2GL_NOT_YET_SUPPORTED`, a warning in `validate` and an error in `generate`.
- [ ] **Carried from WO5b — collections must warn, not error, in `validate`.** Pass 2
      of `validate-references.ts` reports a declared collection child such as
      `<column>` as `U8G2GL_UNKNOWN_COMPONENT`, so decision 1's journey split does not
      hold for collections. A child tag that the parent's effective manifest declares
      as an `<element>` is known; only the not-yet-supported policy reports it. An
      undeclared child tag is still unknown.

## Strict Boundary Box

**In scope:** `cli/src/core/resolver/` (expansion and mangling modules);
`cli/src/core/validator/validate-geometry.ts` (composite top-level gap only);
`cli/src/core/validator/validate-types.ts` (expanded-tree walk only);
`cli/src/core/parser/parse-widget-manifest.ts` (keep `extends` on `<view>` manifests
only); `cli/src/core/validator/validate-references.ts` (declared collection children
only);
`schema/diagnostic.ts`; tests; this WORKORDER.

**Do NOT touch:** realisation, flattening, capacities (WO8); emission; runtime;
the name policy.

---

## Testing Requirement

- [ ] The §13.12 worked example's `status_bar` expands to the identifiers and
      resolved geometry shown there (`bar_location` 0,0,204,11; `bar_wifi_icon`
      204,0,12,11; `bar_clock` 216,0,40,11).
- [ ] Two instances of one composite produce distinct, non-colliding identifiers.
- [ ] `a_b` at screen level colliding with child `b` of instance `a` is a hard
      error naming both.
- [ ] Subject indirection resolves to the concrete subject; a non-subject name
      fails at the instantiation site.

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
