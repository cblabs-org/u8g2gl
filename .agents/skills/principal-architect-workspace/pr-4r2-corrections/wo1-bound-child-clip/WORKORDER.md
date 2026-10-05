---
work_order: WO1
project: pr-4r2-corrections
title: "A bound draw-call child is clipped to its container, as an object child is"
branch: u8g2gl-4r2/wo1-bound-child-clip
base: main @ 86d3f89
complexity: architect
status: dispatched
---

# WO1 — realisation must not be observable through clipping

## Authorization

Part of PR-4R2 (`pr-4r2-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition with a date, and ruling 1 is
option (b). This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r2`.** **Branch**:
`u8g2gl-4r2/wo1-bound-child-clip` (already checked out, no upstream) · **Base**: `main` @ `86d3f89`.
Run `git branch --show-current` **as its own command immediately before every commit**
(`.agents/rules/04-branch-hygiene.md`). Do not touch the other checkouts.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. If you hit a decision this WORKORDER does not cover and cannot be made
inside the Boundary Box, commit what is green, set `status: blocked`, write the Completion Report
and stop.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md`,
`references/documentation.md`. **§4.1 (new, 2026-10-05)**: on lines you add or change, cite
published references (`§13.5`, `[D-18]`) and measured facts; no bare work-order tags (`WO1`,
`PR-4R2 WO1`), no workspace paths, no narrated debate. Pre-existing citations are not yours to
sweep. [D-18]: primitives stay `u8g2gl_draw_*` free functions. Determinism (§13.9): the emitted
spelling must be stable.

---

## Objective

A drawing element inside a container whose geometry is **bound** is drawn inside its container's
**effective clip**, so an overhang is clipped exactly where the same element realised as an object
would be. Firmware emission and the editor host do it through **one runtime helper**.

## Design authority

design_spec §13.5's realisation list, last bullet, and [D-18]: realisation is a generator outcome
the author cannot observe. The owner ruled (2026-10-05, ruling 1 option (b) in `../PROJECT.md`)
that this is achieved by **clipping the draw call**, not by making it an object: a drawing element
has no class, so "make it an object" could only refuse it. The spec text will be amended by the
Chief Architect after this WO lands; **do not edit `docs/`**. Quote the emitted spelling in your
report so the wording can cite it.

## Background (measured by the PA at `86d3f89`)

- **Object path, clips.** `u8g2gl_render_object()` (`src/u8g2gl_core.cpp`) computes
  `u8g2gl_effective_clip(objs, parents, index)` (own bounds ∩ every ancestor's), skips an empty
  one, constructs `u8g2gl_state_saver`, `u8g2gl_apply_clip()`s it, renders, then
  `display.setMaxClipWindow()` (U8G2 has no clip getter, so the full display is the between-objects
  state).
- **Draw-call path, does not clip.** `screen.ts:380` emits, after a visibility guard over enclosing
  objects (`screen.ts:299`), e.g.
  `u8g2gl_draw_box(display, u8g2gl_coord_bound(10, ui_subject_n.get()), 10, 10, 6, true, 0);  // w_b: no object (§13.5)`.
  Reproduce with `../evidence/probes/one/` (a box with bound `x` in a composite, a box with bound
  `width` in a `u8g2gl_obj`). The committed fixture already has such a child: `knob` inside
  `track` in `test/generated_fixture/screens/screen_bounds.xml` (and `dot` at screen level, which
  has no container and must stay unclipped).
- **Editor host** (`test/editor_host/editor_host.cpp`) renders objects through
  `u8g2gl_render_object()` and draw calls after their guard (~:494–:510). The scene's draw entries
  — check whether they already carry the enclosing object's index; object entries carry `parent`
  (`cli/src/core/generator/emit/scene.ts:207`). `SCENE_FORMAT_VERSION = 2`.

## Line-Item Instructions

- [ ] **Measure the baseline**, each suite alone (CLI vitest; `tsc`; lint; C++ clean configure,
      build, ctest). Expect C++ 383 / one skip, CLI 1281, zero warnings. Record what you get.
- [ ] **Write the failing test first, against real U8G2 pixels.** Link the pinned U8G2 C sources as
      `test/test_rbox_bound.cpp` does (see its CMake target) and render into a real frame buffer.
      Construct: a container object, and a drawing-element child whose **bound** coordinate places
      it overhanging the container's right edge (and a second case, the bottom edge via a bound
      size). Drive it through the **generated** code path, or through exactly the sequence the
      generator emits — your choice, stated — and assert **no pixel is set outside the container
      rect**. Show it fails at the base for the right reason (pixels outside), record the count.
      Then, as a control, the **same element realised as an object** (a class-backed element with
      the same rect, e.g. a label/obj child of the same container) sets no pixel outside either.
      The PR's bridge asks for exactly this: "a container, a child with a bound coordinate that
      overhangs, and the pixels it paints".
- [ ] **One public runtime helper** for "draw inside object *i*'s effective clip", in
      `include/u8g2gl/u8g2gl_core.h` / `src/u8g2gl_core.cpp`. Shape is your call, stated with the
      reason: an RAII scope (e.g. `u8g2gl_clip_scope` with a `drawable()` query, resetting with
      `setMaxClipWindow()` in its destructor) or a function pair. Requirements: the clip reset can
      not be forgotten by the caller in the common shape; an empty clip draws nothing; it uses
      `u8g2gl_effective_clip()` and `u8g2gl_apply_clip()`, never its own arithmetic.
      **`u8g2gl_render_object()` uses the same helper** for its clip set/reset, so the clip
      sequence exists once. Its behaviour must not change; its existing tests (`test_core.cpp`,
      including `Core.ApplyClipPinsExclusiveCornerConvention`) prove it. Unifying duplicated logic
      is where this programme's defects have hidden: diff the old and new sequence line by line
      (order of saver, clip, render, reset; the empty-clip early return) and say in the report
      that you did.
- [ ] **Firmware emission** (`cli/src/core/generator/emit/screen.ts`, and `draw-args.ts` /
      `placement.ts` only if the condition lives there): a draw-call element is emitted inside the
      helper, scoped to its **nearest enclosing object** (the parent index the screen arrays
      already hold), **when and only when** (a) it has an enclosing object and (b) at least one of
      its draw arguments is bound. Literal-geometry children are unchanged (§7.2 already refuses an
      overhang), and screen-level ones (`dot`) are unchanged. Keep the existing visibility guard.
      The condition is decided once, in one function, and the scene emitter (next item) reads the
      same function — not a second copy of the test.
- [ ] **Editor host + scene.** The host draws such an element inside the **same helper** with the
      same object index. If the scene's draw entries must gain a field (e.g. the enclosing object
      index, or a `clip` flag), that is a format change a host sees: bump `SCENE_FORMAT_VERSION`
      to 3, update the format comment block in `scene.ts`, and make the host check it as it checks
      2 today. If the existing fields already suffice, do not bump; say which fields.
      `test_editor_parity.cpp` must cover the clipped child: firmware and editor agree, including
      the clip calls if the test double records them.
- [ ] **Versions.** CLI `0.9.0 → 0.10.0` (`cli/package.json`, lockfile version fields, anything the
      build stamps): emitted output changes without an input change (rules/03, §13.9). Runtime
      `0.5.0 → 0.6.0` (`CMakeLists.txt` `project(... VERSION)` and wherever the runtime version is
      mirrored) for the new public API. If generated code records or checks a minimum runtime
      version, raise it to 0.6.0 so a 0.10.0 project cannot compile silently against a 0.5.0
      runtime; if nothing records it, say so as a finding. Version-literal test edits are
      permitted, literals and titles only; list each. **Schema stays 0.4.**
- [ ] **Regenerate the goldens** (`test/generated_fixture/generated/**`,
      `test/generated_fixture/generated_editor/**`, `cli/test/generator/fixtures/**/expected/**`
      as applicable). Review the diff: **only** the clip wrapping of bound draw-call children of a
      container, the version stamps, any scene-format field/version, and an include line if the
      helper needs one may change. Anything else: stop and report. The commit moving them says why.
- [ ] **CLI tests**: emission asserts the wrapped spelling for a bound child in a composite and in
      a `u8g2gl_obj`; asserts **no** wrapping for a literal child of a container and for a bound
      element at screen level. Existing assertions change only where they spelled the old unwrapped
      text for a bound container child; list every one.
- [ ] Run the **built CLI** (`node cli/dist/node/cli.js generate`) on `../evidence/probes/one/`
      (copy it to the session scratchpad or `tmp/` first; do not generate into the workspace) and
      paste the two emitted draw calls into the report.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_core.h`, `src/u8g2gl_core.cpp`, the runtime version
location(s); `cli/src/core/generator/emit/screen.ts`, `scene.ts`, `placement.ts`,
`draw-args.ts` (only where the condition or spelling lives); `test/editor_host/**`;
`test/test_core.cpp`, `test/test_editor_parity.cpp`, `test/test_generated_fixture.cpp`, one new
C++ test file for the real-U8G2 pixel test, `test/CMakeLists.txt`; `test/generated_fixture/**`
(regenerated goldens; a new fixture element only if `knob` cannot serve); `cli/test/**` (emission
tests, version literals); `cli/package.json`, `cli/package-lock.json` version fields; this
WORKORDER.

**Do NOT touch:** the validator (`cli/src/core/validator/**`, WO2/WO3 own it); realisation
reasons in `cli/src/core/realise/**` (this is not a new object condition); `u8g2gl_coord_*`
arithmetic; the radius work; `docs/`; `PROGRAM*.md`; `PROJECT.md`; the schema version;
`include/u8g2gl/manifests/**`.

---

## Verification Requirement

- [ ] The real-U8G2 pixel test fails at the base (count recorded) and passes at the tip; the object
      control passes at both
- [ ] `Core.*` render-object tests unchanged and green
- [ ] Editor parity green, covering the clipped child
- [ ] CLI vitest, `tsc`, lint; C++ zero warnings under `-Wall -Wextra -Wpedantic` from a **clean
      configure**; ctest all pass bar the one known skip. **Each suite alone**, counts recorded
      against 383 / 1281
- [ ] Golden diff reviewed and within the list above
- [ ] `git diff --name-only 86d3f89..HEAD` within the Boundary Box

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
