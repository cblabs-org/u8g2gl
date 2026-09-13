---
work_order: WO6
project: pr-3r-remediation
title: "Validator: primitives set, composite tags, cycles, container geometry"
branch: u8g2gl-remediation/wo6-validator
base: wo5-schema-merge
complexity: standard
status: pending
---

# WO6 — Validator: primitives set, composite tags, cycles, container geometry

## Authorization

Part of PR-3R (pr-3r-remediation). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — not a relayed claim, the
owner's own words with a timestamp. If it is absent or reads as a placeholder,
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-remediation/wo6-validator`
**Base**: `u8g2gl-remediation/wo5-schema-merge`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit. A check that
runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. Documentation carries
equal weight to the code rules: file headers with SPDX and a real `Purpose:`,
Doxygen on public declarations, `// --- Step N: ---` breakdowns, and why-comments
where a decision is not obvious from the code.

## Design authority

`docs/design_spec.md` is normative. The decisions driving this work order are
[D-18], [D-19], [D-20] and [D-21] — full records under `docs/decisions/`. Where
this work order and the spec disagree, **stop and report**; do not pick one.

---

## Objective

Close four validator gaps, three of which are live defects that let invalid
documents through today.

## Background — one of these is already broken

`TIER1_PRIMITIVES` (`cli/src/core/validator/validate-references.ts:23`) is a
hardcoded set, which contradicts [D-17]'s premise that the generator's knowledge
of elements is data, not code. **It has also already drifted**: it names
`u8g2gl_frame`, `u8g2gl_disc` and `u8g2gl_bitmap`, none of which have manifests,
and omits `ellipse`, `pixel`, `triangle` and `xbm`, which do.

Verified on 2026-09-12: `<u8g2gl_frame>` **passes validation** while
`<u8g2gl_nonsense>` is correctly rejected. Three phantom tags validate today and
would reach PR-04's generator with nothing behind them.

## Line-Item Instructions

- [ ] **Remove `TIER1_PRIMITIVES`.** Element knowledge comes from the manifest
      set. After this, a tag validates if and only if a manifest declares it.
      Confirm `ellipse`, `pixel`, `triangle` and `xbm` still validate, and that
      `frame`, `disc` and `bitmap` now correctly fail.
- [ ] **Validate tags inside composites.** The check at `:136` runs only over
      screens; the walk at `:331` validates fonts, images and subjects inside
      components but never the tag itself, so a misspelled element inside a
      composite passes today.
- [ ] **Add cycle detection.** Nothing prevents A instantiating B instantiating A.
      With composites producing real objects this must be a hard error, and the
      diagnostic must name the cycle path — `a -> b -> a` — not merely report that
      one exists.
- [ ] **Geometry bounds against the container.**
      `validate-geometry.ts:126–169` compares `rightEdge > displayWidth`. Per
      [D-20] the reference is the containing element, which is the display only at
      screen level. Inside a composite it is the composite's declared geometry.

## Added by the Principal Architect after WO4 — a live gap with no failing test

`cli/src/core/validator/validate-schema.ts` (around line 480) requires a `setter`
attribute on every `<prop>`. WO4 made `setter` optional and added `draw=` as the
alternative for primitives, so **every `draw=` prop will draw a spurious "missing
required attribute 'setter'"** once real primitive manifests go through the full
validate pipeline.

No test triggers it today, which is exactly why it needs writing down — it is a
defect with no failing test to announce it, and the first person to meet it will
be whoever wires the pipeline together in PR-04.

- [ ] Accept `draw=` as satisfying the requirement, and require **exactly one** of
      `setter` or `draw` — neither absent nor both present.
- [ ] A test per branch: `setter` alone passes, `draw` alone passes, neither is an
      error, both is an error.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-references.ts`,
`validate-geometry.ts`, `validate-schema.ts` (the `setter`/`draw` rule only), their tests, fixtures, this WORKORDER.

**Do NOT touch:** the schema types (WO5), the manifests (WO4), the missing-name
policy from PR-03 — that is settled, see ui_spec §16.1.

---

## Testing Requirement

- [ ] `<u8g2gl_frame>` now produces `UNKNOWN_WIDGET`. This is the regression test
      for the drift, and it must fail against the current code.
- [ ] Each of `ellipse`, `pixel`, `triangle`, `xbm` still validates.
- [ ] A misspelled tag inside a composite is now caught.
- [ ] A direct cycle (A→A) and an indirect one (A→B→A) are both hard errors, and
      the diagnostic names the path.
- [ ] An element overflowing its composite's bounds is caught; the same geometry
      at screen level against a larger display is not.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass, none weakened or removed
- [ ] `cd cli && npx vitest run` — all pass
- [ ] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it, do not file an issue. The architect triages.

---

## Completion Report

<!-- Written by the worker at task completion -->
