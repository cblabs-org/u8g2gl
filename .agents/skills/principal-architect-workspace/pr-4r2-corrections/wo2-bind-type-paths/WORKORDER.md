---
work_order: WO2
project: pr-4r2-corrections
title: "A custom manifest's <bind> is checked against the setter it targets"
branch: u8g2gl-4r2/wo2-bind-type-paths
base: u8g2gl-4r2/wo1-bound-child-clip
complexity: standard
status: complete
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

### Status
complete

### Baseline and final counts
| Suite | Baseline (WO1 tip) | Final |
|---|---|---|
| C++ ctest | 391 / 391 passed, 1 skipped (`SizeOfReport.ThirtyTwoBitTarget`), 0 build warnings | unchanged (no C++ touched; not rebuilt after the CLI change) |
| CLI vitest | 1288 (87 files) | 1298 (88 files): +10 new tests, all in `cli/test/validator/bind-type-paths.test.ts` |
| `tsc`, lint | clean | clean |

Authority verified: `../PROJECT.md` "Human Approval" quotes the owner, "Item 2 plan" states the rule, WO `status` was `dispatched`.

### Changes Made
- `cli/src/core/validator/validate-schema.ts`: new `checkBindDeclarations()` called at the end of §5's per-manifest loop, plus `geometryAliasDiagnostic()` and `SUBJECT_TYPE_OF_PROP`. Reads inherited bindings from `registry.get(manifest.extends)`, never by element name.
- `cli/src/core/schema/diagnostic.ts`: one new code, `GEOMETRY_BINDING_ALIAS` (`U8G2GL_GEOMETRY_BINDING_ALIAS`), beside `MIXED_EMISSION_TARGETS`.
- `cli/test/validator/bind-type-paths.test.ts`: 3 pin tests for the already-enforced attribute and composite paths (pass at the base) and 7 for the declaration check.
- No change to `validate-types.ts`, manifests, generator, goldens or versions. Goldens: no diff.

### Decisions Made
- **Pins pass at the base; gap tests fail at the base.** Run before the fix: 3 pins and 3 "accepts" tests passed, 4 gap tests failed (the alias, `type="int"` alias, same-name-wrong-type and drawing cases).
- **Rules 1 and 2 are both reported on the time/`bind_when` case, as two diagnostics at the `<bind>`.** This is not noise: they are independent faults with independent fixes (rename so origin and clamping apply; change the type). Fixing only the name would leave a `bind_x` with a `time` type, which rule 2 would then refuse. The `type="int"` variant gets rule 1 alone.
- **Rule 1 code**: no existing code was apt, so added `GEOMETRY_BINDING_ALIAS`. Rule 2 reuses `TYPE_MISMATCH`.
- **Prop/subject pairs treated as matching (drawing manifests):** `int` prop to `int` subject, `bool` to `bool`, `string` to `string`. These are the only prop types with a subject type of their own. A `time` subject matches no prop type, because it is consumed by a method (`bind_time`) and never written to a prop. Props of type enum, font, image, subject, style or color are left alone: no subject type corresponds to them, so there is nothing to compare against without guessing.
- **Prop comparison applies only to drawing manifests** (`isDrawingElement(declared)`), where `setter=` names a prop ([Q-9]). On a class manifest `setter=` is a method, so prop names are not consulted.
- **Rule 1 also applied to drawing manifests** (small extension, same defect as the class case): if a drawing manifest's `<bind setter="x|y|width|height">` is not named `geometryBindingFor(that attribute).binding`, it is refused with the same code. All shipped drawing manifests already comply. If the PA considers this beyond the WORKORDER, it is one block (the `geometryBindingFor` branch) and its removal would not affect any other test.
- Diagnostics are located at the `<bind>` (`bind.loc`); the alias one has `offendingText` = the bind name, the type one has the type, each with a suggestion.

### Dead Ends & Warnings
None. The first draft of the new test file's drawing cases failed because an instance of the drawing widget on a screen draws its own `UNKNOWN_ATTRIBUTE` errors (it declares only one prop); those tests filter to errors in the manifest file.

### Out-of-Scope Findings
- **Spec debt:** design_spec §15 / [D-16] code list: `U8G2GL_GEOMETRY_BINDING_ALIAS` is new and unlisted. `docs/` not edited, per the WORKORDER.
- A custom class whose own prop-less `<bind>` re-uses an *inherited non-geometry* setter under a new name (e.g. `name="bind_foo" setter="bind_text"`) is accepted if its type matches. That is intended (rule 1 is geometry only) but means such an alias gets no `fmt` pairing; not checked.
- Composites (`declaredComposites`) are outside §5's loop and so their `<api>` `<bind>`s, if any, are not checked by this rule.

### Blockers
(none)

### End to end: built CLI on a copy of probe `d/` (in `tmp/`)
`npm run build`, then `node cli/dist/node/cli.js validate tmp/d` (exit 1, 2 errors):
```
error: widgets/wd_d/wd_d.xml:3:3
   Widget 'wd_d' declares <bind name="bind_when" setter="bind_x">, which reaches a geometry setter under another name. Write name="bind_x": geometry bindings keep their names so origin and clamping apply (§8.4, [D-20]).
 3 |   <bind name="bind_when" type="time" setter="bind_x" />
   = did you mean 'bind_x'?
error: widgets/wd_d/wd_d.xml:3:3
   Widget 'wd_d' declares <bind name="bind_when" type="time" setter="bind_x">, but the setter 'bind_x' it inherits accepts only 'int' (§13.2). Declare type="int", or point setter= at a new method on your own class.
 3 |   <bind name="bind_when" type="time" setter="bind_x" />
   = did you mean 'int'?
Validation failed: 2 error(s), 0 warning(s).
```
The `type="int"` variant (int subject `n`, exit 1, 1 error): the first diagnostic above only (`<bind name="bind_when" ... type="int" setter="bind_x" />`), no type error.

Shipped manifests: the whole CLI suite (framework manifests and fixtures) passes with no new diagnostic; the built CLI also reports none on `test/generated_fixture`, `cli/test/generator/fixtures/emit-project`, `cli/test/validator/fixtures/valid` and `cli/test/integration/fixtures/valid-project`.
