---
work_order: WO4
project: pr-3r-remediation
title: "Manifests: animated out, draw= in"
branch: u8g2gl-remediation/wo4-manifests
base: wo3-draw-functions
complexity: standard
status: pending
---

# WO4 — Manifests: animated out, draw= in

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

**Branch**: `u8g2gl-remediation/wo4-manifests`
**Base**: `u8g2gl-remediation/wo3-draw-functions`

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

Bring all 17 manifests to the [D-18] shape: `animated` removed, and the eight
primitives naming runtime draw functions rather than U8G2 methods.

## Background

`animated` existed solely to license static demotion. [D-18] replaces demotion
with the realisation rule — decided per instance by the generator — so a manifest
no longer declares whether its element animates. All 17 manifests carry the
attribute today.

Separately, both spellings are currently `setter=` while meaning two different
things: a U8G2 method on primitives (`drawBox`) and a runtime method on widgets.
[D-18] wants those distinguished, so primitives gain `draw=`.

## Line-Item Instructions

- [ ] Remove `animated` from all 17 manifests in `include/u8g2gl/manifests/`.
- [ ] For the eight primitives — `box`, `circle`, `ellipse`, `hline`, `line`,
      `pixel`, `triangle`, `vline` — replace `setter="drawX"` with
      `draw="u8g2gl_draw_x"`, naming the functions WO3 added. Verify each symbol
      exists; a manifest naming a function that does not compile is worse than
      the `setter=` it replaced.
- [ ] Add `draw=` alongside `setter=` in `cli/src/core/schema/widget-manifest.ts`
      and drop `animated` from the type.
- [ ] Update `cli/src/core/parser/parse-widget-manifest.ts` to read `draw=`.
- [ ] Update `cli/test/manifests/manifest-crosstest.test.ts`, which asserts
      against the current shape and must move with it — the cross-test is the
      thing that makes this change safe, so it must end green and meaningful, not
      merely green.

## Strict Boundary Box

**In scope:** `include/u8g2gl/manifests/*.xml`, `widget-manifest.ts`,
`parse-widget-manifest.ts`, `manifest-crosstest.test.ts`, related parser tests
and fixtures, this WORKORDER.

**Do NOT touch:** the C++ draw functions (WO3 owns them), the validator (WO6),
the component schema (WO5).

---

## Testing Requirement

- [ ] The cross-test verifies `draw=` targets resolve to real declarations in
      `u8g2gl_draw.h`, not merely that the attribute parses.
- [ ] A manifest carrying `animated` is now a parse error or is ignored — pick
      one, implement it, and say which and why in your Completion Report.
- [ ] All 17 manifests parse and cross-test clean.

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
