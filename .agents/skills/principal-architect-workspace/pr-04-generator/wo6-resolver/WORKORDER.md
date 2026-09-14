---
work_order: WO6
project: pr-04-generator
title: "Resolver: constant arithmetic and anchors to literals"
branch: u8g2gl-generator/wo6-resolver
base: u8g2gl-generator/wo5b-generate-command
complexity: standard
status: draft — PA revises against WO5's Completion Report before dispatch
---

# WO6 — Resolver: arithmetic and anchors

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo6-resolver`
**Base**: `u8g2gl-generator/wo5b-generate-command`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Isomorphic core. Integer arithmetic only — floating
point must never reach output (§13.9).

## Design authority

design_spec §7.2, §13.2, §13.11 step 3, [D-7], [D-20]. Where this work order and
the spec disagree, **stop and report**.

---

## Objective

Every coordinate attribute resolves to a literal integer, by one evaluator that
the validator also uses. Today `validate-geometry.ts` checks literals only and
skips anything with an expression.

## Line-Item Instructions

- [ ] **Integer expression evaluator:** literals, `#const` from `globals.xml`,
      `#screen_width`/`#screen_height` from the selected target's catalogue record,
      `#parent_width`/`#parent_height`, `+ - * /` with parentheses. Integer
      division truncating toward zero. Diagnostics carry the attribute's location:
      unknown constant (with suggestions), non-integer constant, division by zero,
      malformed expression.
- [ ] **Anchors:** two of `{x, width, right}` determine the third; same for
      `{y, height, bottom}`; `hcenter`/`vcenter` centre within the container,
      odd remainders rounding down (§7.2). Over-constraint diagnostics already
      exist — reuse, do not duplicate.
- [ ] **Resolved model:** resolved geometry per element, with provenance back to
      the source attribute. Screen-level container is the display.
- [ ] **`validate-geometry.ts` uses the evaluator,** so bounds checks now cover
      expressions. Composite internals keep WO6-of-PR-3R's "no absolute check at a
      composite's top level" until WO7 supplies the instantiation size.
- [ ] Expose the resolver from core for `generate` (and, later, the editor).
- [ ] **Carried from WO3:** `CommonAttributes` in `cli/src/core/schema/widget-node.ts`
      still types `x`, `y`, `width`, `height` and `hidden` as common to every
      element, which WO3 made untrue — they come from the effective manifest. Align
      the type so the resolver cannot read geometry off a node that has none.

## Strict Boundary Box

**In scope:** new `cli/src/core/resolver/`; `cli/src/core/validator/validate-geometry.ts`;
`cli/src/core/schema/widget-node.ts` (`CommonAttributes` only);
`cli/src/core/generator/` (wiring only); `schema/diagnostic.ts`; tests; this WORKORDER.

**Do NOT touch:** composite expansion (WO7); realisation (WO8); emission; runtime.

---

## Testing Requirement

- [ ] Resolved integers asserted for each anchor combination and centring with
      odd remainders (§17.1 "Resolution" layer).
- [ ] `width="#screen_width - 8"` overflowing the display is now caught by
      `validate`; the same attribute fitting is not.
- [ ] Same screen against a 128-wide and a 256-wide target resolves differently
      (§7.3).

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
