---
work_order: WO2
project: pr-4r2-corrections
title: "A custom manifest's <bind> is checked against the setter it targets"
branch: u8g2gl-4r2/wo2-bind-type-paths
base: u8g2gl-4r2/wo1-bound-child-clip
complexity: standard
status: dispatched
---

# WO2 — §13.2's matching types, on the path that skips them

## Authorization

Part of PR-4R2 (`pr-4r2-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Item 2 plan — agreed"
states this WO's rule. This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r2`.** **Branch**:
`u8g2gl-4r2/wo2-bind-type-paths` (already checked out, no upstream) · **Base**:
`u8g2gl-4r2/wo1-bound-child-clip`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`).

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/typescript.md`, `references/documentation.md`.
**§4.1 (new, 2026-10-05)**: on lines you add or change, cite published references (`§13.2`,
`[D-20]`, `[Q-9]`) and measured facts; no bare work-order tags, no workspace paths, no narrated
debate. Pre-existing citations are not yours to sweep. Diagnostics follow §15.1: say what is wrong,
where, and what to write instead.

---

## Objective

A `time` subject (or any mistyped subject) can no longer reach a geometry setter through a custom
element's own `<bind>` declaration, and a custom `<bind>` can no longer re-target a [D-20] geometry
setter under a name the geometry machinery does not recognise. The attribute and composite paths,
already correct, are pinned by tests.

## Background (PA probes at `86d3f89`; projects in `../evidence/probes/`, README there)

- **Already enforced** — probes `a/` and `c/`: `bind_x="t"` (a `time` subject) on a box, `bind_y`
  on a label, and both forwarded through a composite's `type="subject"` prop, are refused
  `TYPE_MISMATCH` by `checkElement()` in `cli/src/core/validator/validate-types.ts` (Step 1,
  `accepted.includes(subject.type)`), with the instance named for the composite case.
- **The gap** — probe `d/`: a custom element `extends="u8g2gl_obj"` declaring
  `<bind name="bind_when" type="time" setter="bind_x"/>` validates with **zero errors**, and
  generates `ui_obj_w.bind_x(&ui_subject_t);`. Pass 5 is satisfied because the subject's type
  matches the **declared** `<bind>`'s type; nothing checks the declaration against the setter it
  targets. Even with `type="int"` the call does not compile ("too few arguments, expected 2"):
  origin, clamp and the bound-container anchor rule are keyed by binding **name** in
  `cli/src/core/resolver/geometry-bindings.ts` (`GEOMETRY_BINDINGS`), so `bind_when` gets none of
  them. With `extends="u8g2gl_box"` and `setter="x"`, the same: validates, emits `ui_obj_w.x(...)`.
- On `<bind>`, `setter=` has the [Q-9] double meaning: a **method** on a class manifest
  (`setter="bind_x"`), a **prop** on a drawing manifest (`setter="x"`). Read it the way the shipped
  manifests mean it; do not change the vocabulary (schema stays 0.4).
- Bindings merge by `name` + `type` (`manifest/manifest-registry.ts:140`, `bindingKey`), so one
  `setter=` can be reached by several overloads. Manifest-level checks live in
  `cli/src/core/validator/validate-schema.ts` §5 ("Widget manifest schema validation",
  `for (const manifest of manifests.declaredWidgets)`).

## The rule (owner-approved, PROJECT.md "Item 2 plan")

For each `<bind>` **B** declared by a widget manifest, against the **effective** bindings and props
its `extends` chain supplies:

1. **No geometry alias.** If an inherited binding **I** has `I.setter === B.setter`, **I** is one of
   [D-20]'s four (`geometryBindingNamed(I.name)`), and `B.name !== I.name`: refuse. The message
   names the geometry binding to use instead (e.g. "write `bind_x`; geometry bindings keep their
   names so origin and clamping apply, §8.4 [D-20]").
2. **Type must be one the target accepts.** If one or more inherited bindings share `B.setter`,
   `B.type` must be among their declared types; otherwise refuse, listing the accepted types.
   Applies equally to a drawing manifest, where `setter=` names a prop: if `B.setter` names one of
   the manifest's own or inherited **props** and there is no inherited binding to compare with,
   `B.type` must match that prop's type for the subject types that have one (`int` prop ↔ `int`
   subject; a `time` subject never matches an `int` prop). State in the report exactly which
   prop/subject type pairs you treat as matching, and why.
3. A `<bind>` whose `setter=` targets nothing inherited — a new method on the author's own class —
   is **left alone**: the C++ compiler checks it, and §6.5 makes custom elements first-class.

Diagnostic code: reuse `TYPE_MISMATCH` for rule 2 if its wording fits a manifest-level fault; for
rule 1, reuse an existing code if one is apt, otherwise add one in `schema/diagnostic.ts` beside
its neighbours. If design_spec §15 enumerates codes, a new one is spec debt: **do not edit
`docs/`**; name it in the report for the Chief Architect. Locate the diagnostic at the `<bind>`
(its `loc`), not the widget.

## Line-Item Instructions

- [ ] **Measure the baseline**, each suite alone. Expect C++ 391 / one skip, CLI 1288, zero
      warnings (WO1's tip). Record what you get.
- [ ] **Pin tests for the enforced paths** (they should pass at the base — say so): a `time`
      subject on `bind_x` of a box and on `bind_y` of a label (attribute form), and the same
      forwarded through a composite `type="subject"` prop. Put them beside the existing Pass 5
      tests (`cli/test/validator/types.test.ts` or the nearest expanded-tree test), asserting
      `TYPE_MISMATCH` at the attribute.
- [ ] **Failing tests first for the gap**, then the fix:
      - `extends="u8g2gl_obj"`, `<bind name="bind_when" type="time" setter="bind_x"/>` → refused
        (rules 1 and 2 both hold; assert whichever you report, and that it is located at the
        `<bind>`; if you report both, say why that is not noise);
      - the same with `type="int"` → refused by rule 1;
      - `<bind name="bind_x" type="time" setter="bind_x"/>` on a custom class (same name, wrong type)
        → refused by rule 2;
      - a drawing manifest whose `<bind type="time" setter="width"/>` targets an `int` prop →
        refused by rule 2;
      - **accepted:** a custom class with `<bind name="bind_when" type="time" setter="bind_when"/>`
        (a new method), and a custom class redeclaring `<bind name="bind_x" type="int" setter="bind_x"/>`.
      Show the gap cases fail at the base.
- [ ] **Every shipped manifest passes** the new checks: the framework manifests under
      `include/u8g2gl/manifests/` and every fixture manifest in the repo produce no new diagnostic.
      If one does, stop and report it rather than editing the manifest.
- [ ] **Implement** in `validate-schema.ts` §5, reading inherited bindings and props from the
      manifest registry (the effective manifest of `extends`), never by element name ([D-17]).
      Use `geometryBindingNamed()`; do not spell the four names again.
- [ ] **End to end**: run the **built** CLI (`npm run build`, then `node cli/dist/node/cli.js
      validate`) on a copy of `../evidence/probes/d/` in `tmp/`: show the diagnostic. Then the
      `type="int"` variant. Paste both into the report.
- [ ] No version bump: CLI 0.10.0 is already this PR's unreleased minor, and validation-only
      changes do not alter emitted output. Goldens must not move.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-schema.ts`; `cli/src/core/schema/diagnostic.ts`
(one code, only if needed); `cli/src/core/validator/validate-types.ts` (only if a comment there
must now point to the manifest check); `cli/test/validator/**` and new test fixtures under it;
this WORKORDER.

**Do NOT touch:** `include/u8g2gl/manifests/**`; the geometry-bindings table's contents;
`cli/src/core/generator/**`; `cli/src/core/realise/**`; the runtime; goldens; `docs/`;
`PROGRAM*.md`; `PROJECT.md`; any version.

---

## Verification Requirement

- [ ] Pin tests pass at the base and the tip; gap tests fail at the base and pass at the tip
- [ ] CLI vitest, `tsc`, lint; C++ build and ctest unchanged (391 / one skip, zero warnings).
      **Each suite alone**, counts recorded
- [ ] Goldens unchanged (`git diff --stat u8g2gl-4r2/wo1-bound-child-clip..HEAD -- test/generated_fixture cli/test/generator/fixtures` is empty)
- [ ] `git diff --name-only u8g2gl-4r2/wo1-bound-child-clip..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file. Known and already
carried, do not re-report: a class extending a drawing element (`extends="u8g2gl_box"`) is accepted.

---
## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete | partial | blocked

### Baseline and final counts

### Changes Made

### Decisions Made

### Dead Ends & Warnings

### Out-of-Scope Findings

### Blockers
(none)
