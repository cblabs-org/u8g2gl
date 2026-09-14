---
work_order: WO7b
project: pr-04-generator
title: "The geometry contract: validate the expanded tree against design_spec §7.2 and §13.2"
branch: u8g2gl-generator/wo7b-geometry-contract
base: u8g2gl-generator/wo4c-real-u8g2
complexity: standard
status: draft — PA revises against WO4c's Completion Report before dispatch
---

# WO7b — The geometry contract

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO7b as
approved** under "Rulings on WO4c and WO7b"; and that this WORKORDER's `status` is
`dispatched`. If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo7b-geometry-contract`
**Base**: `u8g2gl-generator/wo4c-real-u8g2`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element knowledge
is data, never code: "rectangular element" is read from the effective manifest, never a
tag list.

## Design authority

design_spec **§7.2 and §13.2 on `main` @ `5f2574f`** — the geometry contract is now
normative there; this branch is rebased onto it. [D-7], [D-20]. **"Stop and report" means
record it, do not choose, continue with the remaining items.**

---

## Objective

Every check that only means something after composites expand runs once, on the expanded
tree, and the §7.2 contract holds: nothing reaches emission with an absent, wrapped or
guessed coordinate.

## Line-Item Instructions — §7.2 and §13.2 (normative)

- [ ] **Anchors only on rectangular elements.** `right`, `bottom`, `hcenter`, `vcenter` are
      valid only where the effective manifest declares `x`, `y`, `width` and `height`.
      Elsewhere (circle, ellipse, pixel, line, triangle) they are an error naming the
      element and the anchor.
- [ ] **Every element fully positioned.** After expansion, an element whose manifest
      declares geometry and whose `x` or `y` (or size, where required) cannot be resolved —
      under-determined (`width` with no `x`), a `$prop` that never substitutes, a `#parent_*`
      with no parent size, a constant that never resolves — is a validation error, never a
      silent zero or absence.
- [ ] **`hcenter`/`vcenter` are strict booleans.** Anything but `true`/`false` is an error.
- [ ] **Reserved constant names.** `screen_width`, `screen_height`, `parent_width`,
      `parent_height` cannot be declared as user constants; declaring one is an error at the
      declaration.
- [ ] **Constants validated where declared.** An `<int>` constant with a non-integer value
      is an error at its declaration, not only where used.
- [ ] **Bounds for the target being generated.** `generate --target <name>` checks bounds
      against that target; `validate` keeps its current target behaviour and says in its
      output which target it checked.
- [ ] **Coordinates fit `int16_t` (§13.2).** A resolved coordinate outside
      `int16_t` is a validation error, separate from — and before — the container bounds
      check. Other `int` properties keep the `int32_t` check.

## Line-Item Instructions — carried from WO6 and WO7

- [ ] **Substituted arguments are checked (WO7 F4/F5).** After `$prop` substitution, a
      font, image, style or enum value passed into a composite is checked exactly as it
      would be if written directly: `font="nope"` passed to a composite fails.
- [ ] **`hidden="$p"` substitutes (WO7 F6).** The parser converts `hidden` to a boolean
      before expansion sees it, so a `$prop` there is lost. Keep a `$`-placeholder as text
      until expansion, then apply the boolean rule to the substituted value.
- [ ] **[D-20] bound-geometry rule on the expanded tree (WO7 F7).** The
      anchored-child-of-a-geometry-bound-container check walks unexpanded trees and misses
      nested composites. Run it on the expanded tree.
- [ ] **Interpolated `$prop` is an error (WO7 F9, interim).** A `$name` inside longer text
      (`text="Hi $who"`) is not substituted and would reach output literally. Until the
      Chief Architect rules, report it as an error naming the prop, rather than passing it
      through.
- [ ] **`required` with `default` (WO7 F10).** A prop declared both `required="true"` and
      with a `default` is a schema error at the declaration.
- [ ] **Once, not twice.** Each check above runs on the template **or** the expanded tree,
      never both — say which for each, and test that a template defect is reported once.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/`, `cli/src/core/resolver/`,
`cli/src/core/parser/` (the `hidden` placeholder only), `cli/src/core/generator/`
(target-specific bounds only), `cli/src/node/cli.ts` (which target `validate` reports
only), `schema/diagnostic.ts`, `cli/test/`, this WORKORDER.

**Do NOT touch:** runtime C++; manifests; realisation, capacities or emission (WO8+);
mangling wiring and expand-once/resolve-once (WO8); `docs/`.

---

## Testing Requirement

- [ ] One failing-then-passing test per line item, each asserting the diagnostic code and
      the named element or declaration.
- [ ] A template defect inside a composite instantiated twice is reported once.
- [ ] A 128-wide and a 256-wide target produce different bounds results for the same
      screen under `generate --target`.

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ suite unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
