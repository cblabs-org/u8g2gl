---
work_order: WO8a
project: pr-04-generator
title: "One pipeline: expand once, resolve once, mangling wired in, geometry completed"
branch: u8g2gl-generator/wo8a-one-pipeline
base: u8g2gl-generator/wo7b-geometry-contract
complexity: standard
status: dispatched
---

# WO8a — One pipeline

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **the WO8
split as approved by the owner** (status log and "Owner approval — WO8 split"); and that
this WORKORDER's `status` is `dispatched`. If any is missing, record it in the Completion
Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8a-one-pipeline`
**Base**: `u8g2gl-generator/wo7b-geometry-contract`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be
answered, and your work will strand uncommitted. Do not push.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core — no `node:` imports
in `src/core/`. Element knowledge is data, never code. Deterministic: document order, never
map or set iteration order where it reaches output.

## Design authority

design_spec §7.2, §13.2, §13.4, §13.6, §13.11 on `main` @ `5f2574f` (this branch contains
it). **"Stop and report" means record it, do not choose, continue with the remaining
items.**

---

## Objective

`validate` and `generate` run **one** pipeline — parse, validate, expand once, resolve once,
mangle — so WO8b's realisation consumes a single expanded, fully resolved, collision-checked
model. Today expansion runs four times per `validate`, `generate` resolves unexpanded
screens, and the mangler is never called.

## Line-Item Instructions

- [ ] **Expand once, resolve once.** One expansion result, produced once and shared by every
      validator pass and by `generate()`. `generate()` stops resolving unexpanded screens
      (WO7 F2) and consumes the shared model (WO6 11, WO7 F3, WO7b 1 and 7). Count the
      expansions in a test so a future pass cannot quietly add a fifth.
- [ ] **Wire mangling in (WO7 F1).** `mangleIdentifiers` raises `U8G2GL_NAME_COLLISION`
      naming both sources but nothing calls it. Call it once on the shared model; retire the
      older one-level inlining-collision check; `generate` refuses on its errors. End-to-end
      test: `a_b` at screen level beside child `b` of instance `a` fails both `validate` and
      `generate`, naming both sources.
- [ ] **One drawing-element predicate, one flag set (WO5a 2, WO7 F8).** "Drawing element"
      (no `view`, declared `draw=` props, no `setter=` props) is spelled in
      `validate-schema.ts`, `validate-widget-props.ts` and the manifest cross-test; the flag
      set (`hidden`, `disabled`) is spelled in two passes. Put each on the registry once and
      migrate every call site.
- [ ] **Resolve non-rectangular geometry (WO7b 2).** Line and triangle endpoints (`x1`, `y1`,
      `x2`, `y2`, `x0`, `y0`) and circle/ellipse radii (`radius`, `rx`, `ry`) are never
      resolved: no expressions, no `int16_t` check, no bounds check. They are coordinates
      under §7.2 and §13.2, and WO9/WO10 cannot emit a draw call without literal arguments.
      Resolve them through the existing evaluator, apply the same `int16_t` and container
      checks, and keep the §7.2 rule that *anchors* remain rectangular-only.
- [ ] **`hidden` is a strict boolean (WO7b 3).** `hidden="yes"` silently becomes `false`, and
      a `hidden="$p"` written directly in a screen stays text unreported. Apply the strictness
      §7.2 gives `hcenter`/`vcenter`.
- [ ] **`$name` outside a composite (WO7b 4).** In a screen, a `$name` in a font, image,
      style or enum attribute is silently skipped; only geometry catches it. There are no
      props to substitute at screen level, so it is an error — reuse
      `U8G2GL_UNSUBSTITUTED_PROP` if it fits, and say so.
- [ ] **`<style name="$s">` after substitution (WO7b 6).** A style named by a `$prop` is never
      checked once substituted. Check it as WO7b checks substituted attributes.
- [ ] **Required-with-default reports once (WO7b 5).** A prop declared both `required` and
      defaulted is an invalid declaration (WO7b raises `OVERCONSTRAINED`); Pass 4 also reports
      a missing required prop on each instance, so one mistake reads as several defects.
      Report the declaration only.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/`, `cli/src/core/resolver/`,
`cli/src/core/manifest/` (the predicate and flag set), `cli/src/core/generator/` (pipeline
wiring only), `cli/src/core/schema/diagnostic.ts`, `cli/src/node/cli.ts` (wiring only),
`cli/test/`, this WORKORDER.

**Do NOT touch:** realisation, flattening, capacities, `_n<N>` counts or emission — all WO8b;
runtime C++; manifests; `docs/`; `PROGRAM*.md`.

---

## Testing Requirement

- [ ] Expansion count per `validate` and per `generate` asserted (once each).
- [ ] The `a_b` collision fails `validate` and `generate`, naming both sources.
- [ ] A line with `x1="#screen_width - 8"` resolves; one exceeding the display is
      `OUT_OF_BOUNDS`; one exceeding `int16_t` is `COORDINATE_OUT_OF_RANGE`; an anchor on a
      line is still `INAPPLICABLE_ANCHOR`.
- [ ] `hidden="yes"` and a screen-level `$name` in a font attribute are each errors.
- [ ] A prop that is `required` with a `default` produces exactly one diagnostic.
- [ ] Each new test fails at the base — say how many, from a throwaway worktree under `tmp/`.

## Verification Requirement

- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (baseline 641)
- [ ] `cmake --build build` zero warnings; `ctest --test-dir build` unchanged (baseline 305,
      one known skip)
- [ ] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
