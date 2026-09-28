---
work_order: WO2
project: pr-4r-corrections
title: "Inline style_* overrides are restricted to §10's nine properties"
branch: u8g2gl-4r/wo2-style-overrides
base: main @ ca398ac
complexity: standard
status: dispatched
---

# WO2 — inline `style_*` restricted to §10's nine

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR with a timestamp, and its mandate lists item 2. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in the worktree `/Users/mcneillm/Documents/Projects/U8G2GL-4r`**, never in
`/Users/mcneillm/Documents/Projects/U8G2GL`. PR-04b may be running in parallel in another tree.

**Branch**: `u8g2gl-4r/wo2-style-overrides` (already checked out) · **Base**: `main` @ `ca398ac`

Run `git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer, and uncommitted
work strands. Do not push, tag, publish or open a PR.

## Standards

Load the `u8g2gl-standards` skill first; `references/typescript.md` and `references/documentation.md`.
§4: element knowledge is data ([D-17]), and **a table two layers share lives in neither**. WO1 just
moved `STYLE_PROPERTIES` and friends to `cli/src/core/schema/`; the layering test
(`cli/test/architecture/layering.test.ts`) must stay green.

---

## Objective

`style_<name>` is accepted only when `<name>` is one of §10's nine style properties **and** the
element has a setter for it. `style_text="x"` is refused, with a message naming what is allowed.

## Design authority

design_spec §10, now normative: *"Inline overrides are restricted to the nine properties in the
table above: `style_` tells a reader 'this is styling', and a general per-element override of any
property that happens to have a setter is a different feature, which §1.5 says waits for a
demonstrated need."* The nine: `font`, `draw_color`, `invert`, `padding`, `border`, `radius`,
`align`, `font_mode`, `bitmap_mode`. They are `STYLE_PROPERTIES`' `attribute` values in
`schema/globals.ts`. Use that list; do not write a tenth copy of it.

## Background

Two places decide whether an override applies, and today both accept any prop with a setter:

1. **The validator.** `checkStyles()` step 2 in `cli/src/core/validator/validate-widget-props.ts`
   looks up `manifest.api.props` for a prop of that name with a `setter`.
2. **Emission.** `styleOverridesOf()` in `cli/src/core/generator/emit/screen-model.ts` applies
   every override naming a setter prop. `screen.ts` reports what is left over (`unknown`), and
   `scene.ts` (the editor target) takes `applied`.

If only the validator changes, the two disagree, and the editor and firmware targets could apply
something the validator refused. **One predicate, used by both.**

## Line-Item Instructions

- [ ] **Measure the baseline** in this worktree, each suite alone. Expected at `ca398ac`: CLI **1059 /
      63 files**, tsc and lint clean; C++ 0 warnings, ctest **362, one known skip**.
- [ ] **State the rule once**, in `schema/` beside `STYLE_PROPERTIES`: a predicate or set, e.g.
      "is this a §10 style attribute", derived from `STYLE_PROPERTIES[].attribute`. **Canonical
      snake_case only**: the camelCase `aliases` (`drawColor`, …) are spellings `<style>`
      accepts and are **not** extended to `style_*`. `style_drawColor` stays refused, as it is
      today, because no prop is named `drawColor`.
- [ ] **Validator:** `checkStyles()` refuses an override whose name is not one of the nine, even
      when the element has a setter for it. Use the existing `UNKNOWN_ATTRIBUTE` code, the one this
      path already uses, so there is no new diagnostic code. The message names the attribute and the
      element, says inline overrides are limited to §10's style properties, **and lists the
      nine**. Suggestions (`findClosest`) are drawn from those of the nine the element can
      actually take. The existing refusal, for a name that is a style property but that the
      element has no setter for, keeps its message.
- [ ] **Emission:** `styleOverridesOf()` applies only overrides that pass the same rule. Anything
      else lands in `unknown`, so firmware and editor can never apply what the validator refused.
- [ ] **Tests:**
  - each of the nine is accepted on an element that sets it (a table-driven test over
    `STYLE_PROPERTIES`, not nine hand-written cases), validated **and** generated;
  - `style_text="x"` on a `u8g2gl_label` is refused with `UNKNOWN_ATTRIBUTE`, and the message
    contains all nine names;
  - one more non-§10 setter prop (your choice, e.g. `style_long_mode`) is refused;
  - `styleOverridesOf()` puts a non-§10 key in `unknown` and never in `applied`.
  Show the new tests fail at the base, and say how many fail **behaviourally** rather than because
  something is missing.
- [ ] **Existing tests keep their assertions.** The PA checked on 2026-09-28: no fixture or test
      writes a non-§10 `style_*` except `style_sparkle`, which is already refused. If an existing
      assertion must change, stop and report.
- [ ] Run the **built CLI** on a small project containing `style_text` and show the refusal as an
      author sees it, text and `--json`.

## Strict Boundary Box

**In scope:** `cli/src/core/schema/globals.ts` (the predicate), `cli/src/core/validator/validate-widget-props.ts`,
`cli/src/core/generator/emit/screen-model.ts` (`styleOverridesOf` only), `cli/test/` (new tests),
this WORKORDER's checkboxes and Completion Report.

**Do NOT touch:** runtime C++; `emit/fonts.ts`, `images.ts`, `xbm.ts` (PR-04b); `emit/draw-args.ts`
(WO4); any schema **surface** (no new attribute or element); `docs/`; `PROGRAM*.md`; `PROJECT.md`;
versions. No bump here: the PR's CLI bump to 0.8.0 is WO4's. Goldens must not move, because no
committed fixture uses a non-§10 override.

---

## Testing Requirement

- [ ] The tests above, failing at the base
- [ ] Layering test still green

## Verification Requirement

- [ ] CLI `npx vitest run`, `npx tsc --noEmit`, `npm run lint`; C++ `cmake --build build` zero
      warnings, `ctest` all pass. Each suite alone
- [ ] Goldens unchanged
- [ ] `git diff --name-only main..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*(Worker fills this in: status; counts before and after; where the rule lives; the refusal as an
author sees it; base failures; boundary; findings.)*
