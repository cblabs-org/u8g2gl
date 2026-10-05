---
work_order: WO3
project: pr-4r2-corrections
title: "A radius known at build time is checked at build time, however it arrives"
branch: u8g2gl-4r2/wo3-radius-build-time
base: u8g2gl-4r2/wo2-bind-type-paths
complexity: standard
status: dispatched
---

# WO3 — the radius bound, reported instead of silently clamped

## Authorization

Part of PR-4R2 (`pr-4r2-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of the decomposition and "Ruling 2 — approved", which states
this WO's rule. This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r2`.** **Branch**:
`u8g2gl-4r2/wo3-radius-build-time` (already checked out, no upstream) · **Base**:
`u8g2gl-4r2/wo2-bind-type-paths`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`).

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/typescript.md`, `references/cpp.md` (tests),
`references/documentation.md`. **§4.1 (new, 2026-10-05)**: on lines you add or change, cite
published references (`§10`, `§6.2`, `[D-17]`, `[UD-5]`) and measured facts; no bare work-order
tags, no workspace paths, no narrated debate. Pre-existing citations are not yours to sweep.

---

## Objective

An element whose radius and size are all known at build time is refused when `2·radius >
min(width, height)`, whether the radius was written as an attribute, an inline `style_radius`, or a
named style, and whether the element is a drawing element or an object. The manifest help tells the
author the bound.

## Design authority

- design_spec §10 `radius`; the bound **`2·radius <= min(width, height)`**, measured in PR-4R
  against the pinned U8G2 (`test/test_rbox_bound.cpp`, `RealU8g2RoundedBoxBound.*`; harness in
  `../../pr-4r-corrections/evidence/rbox-bound/`). **Do not re-derive it**: an earlier derivation
  (`r <= min − 1`) was wrong for 30 of 68 radii. Equality is accepted: a capsule is intended.
- Owner ruling 2 (PROJECT.md): check **any element that declares `radius`** (as `draw=` or
  `setter=`) where radius, width and height are all literal. Accepted consequence: a label, which
  inherits `radius` from `u8g2gl_obj` but draws no rounded shape, is refused too.

## Background (PA probes at `86d3f89`; `../evidence/probes/r/` and its README)

- `checkCornerRadius()` (`cli/src/core/validator/validate-geometry.ts`, ~:691) reads the radius
  only from `element.extras` (the literal attribute) and runs only when `radius`, `width` and
  `height` are all `draw=` props: the box alone.
- The box refuses every style form already (named style, `<style>` child, `style_radius`), so the
  new reach is objects: a 20×6 `u8g2gl_button` with `style_radius="10"` **or literal
  `radius="10"`** passes today, as does a 20×6 `u8g2gl_switch` with `style="round"` (radius 10).
- The runtime clamps silently through `u8g2gl_coord_corner_radius()` (`include/u8g2gl/u8g2gl_coord.h`):
  the button for its focused fill (`u8g2gl_draw_box`) and each border layer
  (`draw_border_rframe`, `src/u8g2gl_button.cpp`), the switch for its track and handle
  (`src/u8g2gl_switch.cpp` ~:103–:140). A switch with no radius defaults to `h / 2`.
- **Precedence at init** (`styleLines()`, `cli/src/core/generator/emit/screen.ts` ~:208, and the
  INIT_STEPS order): named styles in written order (later wins), then inline `style_*` overrides,
  then the element's own attributes via setters, which win over both. Named-style scope is
  `styleScope()` (`validate-widget-props.ts` ~:320: globals, overridden by the screen's own; a
  composite template sees globals only); which attribute a style sets is `styleProperties()`
  (`schema/globals.ts`).

## Line-Item Instructions

- [ ] **Measure the baseline**, each suite alone. Expect C++ 391 / one skip, CLI 1301, zero
      warnings. Record what you get.
- [ ] **Measure, before writing the check, which radius the runtime honours** for the button and
      the switch. In a C++ test against the existing test double (`test/test_button.cpp`,
      `test/test_switch.cpp`, or one new file), sweep sizes (odd, even, wide, narrow, including
      the 14 of `test_rbox_bound.cpp` where they apply) × radius 0..min(w,h)/2+2, and record for
      the **outermost** shape (button: border layer 0 and the focused fill; switch: the track)
      whether the radius in the recorded U8G2 call equals the one requested. The prediction to
      confirm or refute: *the outer radius is honoured exactly when `2·r <= min(w, h)`*. Pin
      the result as a test. Inner layers and the switch handle derive their radius from the
      outer one by the class's design, so they are not the author's radius. State that in the
      report, with what you observed for them, but do not check them. **If the prediction is
      refuted for either class, commit the measurement and stop with `status: blocked`**: the
      bound would not be one rule, and that is the PA's call.
- [ ] **One precedence function** for "the radius this element is configured with at init, and
      where it came from" (attribute > inline `style_radius` > last named style in scope that
      declares `radius` > none). It reads `styleScope()`/`styleProperties()` and mirrors
      `styleLines()`'s order. It is written once, in the validator's shared area, and its comment
      names `styleLines()` as the order it mirrors. Pin the precedence with tests: each source
      alone; attribute beats style; `style_radius` beats a named style; the later of two named
      styles wins; screen-local beats global; a composite template sees globals only.
- [ ] **Extend `checkCornerRadius()`**: run for any element whose **effective manifest declares a
      `radius` prop** (`draw=` or `setter=`, read from the manifest, never by tag, [D-17]), with
      the radius from the precedence function and literal resolved `width` and `height`. Keep:
      radius 0 or absent constrains nothing; bound or unresolved size is skipped (the runtime
      clamp covers it); `2·r == min` accepted with no diagnostic of any severity; the existing
      message shape and code (`OUT_OF_BOUNDS`). Locate the diagnostic at the radius's source
      (the attribute, the `style_radius` attribute, or the element's style reference / `<style>`
      child) and name the source in the message, e.g. "radius=10 (from style 'round')". A
      named style's radius applies only to elements that declare `radius`; do not report a style
      declaration on its own.
      **This path exists twice** (attribute vs style, drawing vs object), where this programme's
      defects have hidden: the box's existing tests must pass **unchanged**.
- [ ] **Tests** (`cli/test/validator/`): refused: button with literal radius, button with
      `style_radius`, switch with a named style, label with a literal radius (ruling 2's accepted
      consequence), each 20×6 radius 10. Accepted: the same at radius 3 (`2·3 == 6`, capsule);
      a bound width; a switch with no radius (default `h / 2` is the runtime's, not the author's).
      A composite instance whose template element gets a too-large radius from a global style is
      reported with the instance named (the same `withInstantiation` shape other template
      diagnostics use).
- [ ] **Help text ([UD-5], item 4)**: the `radius` prop's `help` in
      `include/u8g2gl/manifests/u8g2gl_box.xml` and `include/u8g2gl/manifests/u8g2gl_obj.xml`
      states the bound in one line, e.g. `"Corner radius in pixels; 2 × radius may not exceed the
      smaller of width and height"`. Regenerate `cli/src/data/manifests.json` with
      `npm run build:manifests`; its diff is those two strings only. If the help string reaches any
      generated output (editor registry, scene, goldens), regenerate and confirm the diff is that
      string only. Check `cli/src/core/schema/globals.ts:150`'s doc comment and
      `include/u8g2gl/u8g2gl_draw.h`'s radius text: if they state a radius without the bound,
      add it.
- [ ] **End to end**: build the CLI and run `validate` on a copy of `../evidence/probes/r/` in
      `tmp/` for the switch (as committed) and for the button `style_radius` and literal variants
      listed in the probe README. Paste the diagnostics.
- [ ] **Fixtures**: every committed fixture project and test fixture still validates as before. If
      one now fails because it carries an oversized radius, stop and report it; do not edit it.
- [ ] No version bump: CLI 0.10.0 is this PR's unreleased minor. Goldens move only for the help
      string, if at all.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-geometry.ts`, the validator's shared helpers for
the precedence function (`shared-model.ts` or a new file beside it), `validate-widget-props.ts`
(only to export or share `styleScope()`, not to change it); `include/u8g2gl/manifests/u8g2gl_box.xml`
and `u8g2gl_obj.xml` (`radius` help only); `cli/src/data/manifests.json` (regenerated);
`cli/src/core/schema/globals.ts` and `include/u8g2gl/u8g2gl_draw.h` (radius comments only);
regenerated goldens (help string only); `cli/test/validator/**`; `test/test_button.cpp`,
`test/test_switch.cpp` or one new C++ test file plus its `test/CMakeLists.txt` line; this WORKORDER.

**Do NOT touch:** the runtime's radius arithmetic (`u8g2gl_coord.h`, button, switch drawing);
`test/test_rbox_bound.cpp`; the bound itself; the generator's emission; any other manifest prop;
`docs/`; `PROGRAM*.md`; `PROJECT.md`; any version.

---

## Verification Requirement

- [ ] Runtime measurement committed and pinned; prediction confirmed (or stopped as above)
- [ ] New tests fail at the base where they assert a refusal, pass at the tip; box tests unchanged
- [ ] CLI vitest, `tsc`, lint; C++ zero warnings from a clean configure, ctest all pass bar the one
      skip. **Each suite alone**, counts recorded against 391 / 1301
- [ ] `git diff --name-only u8g2gl-4r2/wo2-bind-type-paths..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

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
