---
work_order: WO11b
project: pr-04-generator
title: "Validator hardening: validate never passes what generate refuses"
branch: u8g2gl-generator/wo11b-validator-hardening
base: u8g2gl-generator/wo10b-bound-text
complexity: standard
status: dispatched
---

# WO11b — Validator hardening

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO11b as approved by the
owner** ("Owner approval — WO10b and WO11b", **including the owner's confirmation of 2026-09-19**); and that this
WORKORDER's `status` is `dispatched`. If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo11b-validator-hardening` · **Base**: `u8g2gl-generator/wo10b-bound-text` (dispatch commit on it)

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval. Do not push or tag.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element knowledge is data,
never code. One pipeline: never a second count, evaluator, expansion or prefix list.

## Design authority

design_spec §7.2, §8.1–§8.4, §10, §13.2, §13.4, §14.1 (as amended on `main` @ `ff20f0c`), §21 Q-16;
the Chief Architect's rulings recorded in PROJECT.md ("Chief Architect rulings on CA-BRIDGE-2026-09-18"); PROJECT.md decision 1 (validate warns, generate
errors, for refusals). "Stop and report" means record it, do not choose, continue.

---

## Objective

`validate` never passes a document `generate` refuses, and no mistake reaches emission silently.
Each item below is a gap WO9 or WO10 found; each gets a test that fails at the base.

## Line-Item Instructions

- [ ] **A missing size (WO10 SR2).** WO10 dropped `required` on drawing geometry a binding or anchor
      can supply; WO7b's rule catches a missing *position*, not a missing *size*, so a box with no
      `width` and no binding passes `validate` and `generate` refuses it. A size neither written,
      bound nor anchor-derived is an error in `validate`.
- [ ] **Bound or styled values satisfy `required` (WO10b f1).** `validate` requires a literal `x`
      even when `bind_x` supplies it, and a literal `font` even when a named style supplies it, so
      the fixture has to write `x="0"` beside `bind_x`. A geometry attribute supplied by a binding,
      and a property supplied by a style the element names, both satisfy `required`. Then remove
      the fixture's redundant `x="0"` and regenerate; that output change is expected and disclosed.
- [ ] **One table of geometry bindings (WO10b f2).** The set of geometry bindings is spelled in the
      validator, in `emit/screen-model.ts` and in `emit/placement.ts`'s position table. Make it one
      data table in the model, consumed by all three. Emission must stay byte-identical.
- [ ] **Invented template setters (WO10 f1).** The manifest parser invents `set_<name>` setters for
      a composite's template parameters; emission filters them. Stop inventing them.
- [ ] **Screen-descriptor collision (WO10 f5).** `ui_screen_<name>` is not in `mangle.ts`'s
      collision table, so screen `a_objs`'s descriptor can collide with screen `a`'s object table. The
      same for `ui_editor_registry` (WO11 f6), and for the new `ui_obj_` family (WO10b).
- [ ] **`style_*` overrides (WO10 f8)** are never validated except `style_font`. Validate each against
      the style property it overrides.
- [ ] **Flag directives (WO10 f9):** a missing `ref_value`; `gt`/`lt` on a bool, string or time subject;
      and unknown `bind_flag_if_*` suffixes all pass today while emission refuses them.
- [ ] **`bind_text_fmt` on a string subject (WO10 f10)** validates, but the emitted call would not
      compile. Reject it, naming the subject's type.
- [ ] **`<builtin>` font names (WO9 f5).** A `<builtin>` name is aliased verbatim, so a typo is a link
      error in the user's firmware build. Check it against U8G2's own font symbols from the pinned
      `extern/u8g2` — derived as data, the way [D-14] derives the display catalogue, never a
      hand-kept list.
- [ ] **Subject values (WO9 f6):** a subject's initial `value` is type-checked; a string's initial value
      is checked against its `max_len`; remove `truncate` from `StyleDecl` (`schema/globals.ts:138`) and from the style
      parser (`parser/parse-globals.ts:71,86`), and the stale mention in `emit/styles.ts:57`.
      [D-19] deleted it and §10 no longer lists it. Keep the validator's [D-19] rejection message
      (`validate-schema.ts:70`) so an author who writes it is told why.
- [ ] **Ruling 1c (Chief Architect, 2026-09-19; §7.2, Q-16):** a container whose **own position is
      bound** (`bind_x`/`bind_y`) may have **no children** in schema 0.4. It is an **error** in
      `validate` and `generate` alike. The message says why (children are positioned at build
      time and there is no reflow yet) and points to Q-16. Composite instances count as
      containers.
- [ ] **Ruling 6 (Chief Architect, 2026-09-19; §7.2): bounds-check what is drawn.** A pixel as a
      1×1 box; a line by the box around its endpoints; a triangle by the box around its vertices;
      a circle or ellipse by the box around the segments its segment bits select (a quarter-circle
      at a display corner must pass when every drawn pixel is on the display). Checked against the
      container, for the target being generated. Radii get checked by this rule too, which closes
      WO8a f1. The segment → box derivation is data or one function shared with whatever else
      needs it. Never a second copy.
- [ ] **Two renames (WO9 f7, WO8c f3):** `U8G2GL_UNRESOLVED_GEOMETRY` is now used for non-coordinate
      `int` props too, and `notYetSupportedPolicy` also carries realisation's refusal severity. Rename
      each to what it now means, keeping diagnostic codes stable if they are public (say which).

## Strict Boundary Box

**In scope:** `cli/src/core/validator/`, `cli/src/core/resolver/mangle.ts` (the descriptor only),
`cli/src/core/parser/parse-widget-manifest.ts` (template setters only), `cli/src/core/schema/`
(`StyleDecl`, diagnostic names), `cli/src/node/` and `cli/src/data/` (the U8G2 font-symbol data
build only), `cli/src/core/parser/parse-globals.ts` and `emit/styles.ts` (the `truncate` removal only),
`cli/src/core/resolver/` (a shared drawn-extent function for ruling 6, if one belongs there),
`emit/screen-model.ts` and `emit/placement.ts` (consuming the one geometry-binding table only), the
committed fixture's `screens/screen_bounds.xml` and its regenerated output, `cli/test/`,
this WORKORDER.

**Do NOT touch:** runtime C++; manifests; emission, except to delete refusals the validator now
makes unreachable (say which); `docs/`; `PROGRAM*.md`. Run every suite alone.

## Verification Requirement

- [ ] CLI `vitest`, `tsc`, lint clean; runtime C++ unchanged; `cmake --build build` zero warnings and `ctest` green (the fixture compiles in both configurations)
- [ ] Each item has a test that fails at the base (say how many behaviourally)
- [ ] Diff limited to the Boundary Box

---

## Completion Report

*To be filled in by the worker.*
