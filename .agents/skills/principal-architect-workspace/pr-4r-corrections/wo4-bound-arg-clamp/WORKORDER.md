---
work_order: WO4
project: pr-4r-corrections
title: "A bound draw-call argument clamps exactly as an object's binding does"
branch: u8g2gl-4r/wo4-bound-arg-clamp
base: u8g2gl-4r/wo3-radius-clamp
complexity: standard
status: dispatched
---

# WO4 — realisation must not be observable

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR with a timestamp, and its mandate lists item 1. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r`.** **Branch**:
`u8g2gl-4r/wo4-bound-arg-clamp` (already checked out) · **Base**: `u8g2gl-4r/wo3-radius-clamp`.
Run `git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md` and
`references/documentation.md`. §4.1 [D-18]: primitives compile to `u8g2gl_draw_*` **free
functions**. Do not tidy them into a class. Determinism (§13.9): the emitted spelling must be
stable.

---

## Objective

The same XML behaves the same way on either side of §13.5's realisation rule. A bound value
reaching a **draw call** is clamped into `int16_t` after its container origin is added, **by the
same code** that clamps it on the object path, in firmware and in the editor host alike.

## Design authority

design_spec §13.5, final paragraph, normative: *"a value reaching a draw call is clamped exactly as
the object path clamps it — into `int16_t`, after the container origin is added (§7.2) — instead of
wrapping in whatever narrower parameter the draw function happens to take."* [D-18] is the reason:
if one path clamps and the other wraps, realisation becomes observable, and the decision breaks.

## Background: three paths, one of which clamps

1. **Object path, clamps.** `u8g2gl_bound_coord()` in `src/u8g2gl_obj.cpp` bounds the subject value
   to ±65536, adds the `int16_t` origin in 32 bits, and clamps **the sum** to `int16_t` (Chief
   Architect, 2026-09-19: the sum, never each term). It is `static`, file-local.
2. **Firmware draw call, wraps.** `drawCallFor()` in `cli/src/core/generator/emit/draw-args.ts`
   spells a bound argument as `ui_subject_x.get()` or `40 + ui_subject_x.get()`. An `int32_t`
   expression is passed to an `int16_t` parameter and narrows implicitly. See
   `test/generated_fixture/generated/ui_screen_bounds.cpp:112`.
3. **Editor host, wraps.** `editor_host::draw_call()` in `test/editor_host/editor_host.cpp` does
   `arg.integer += origin` with no clamp. The registry thunk then passes the `int32_t` to the same
   `int16_t` parameter. The parity test compares firmware and editor call for call, so today it
   proves they **wrap identically**. It must end up proving they **clamp identically**.

## Line-Item Instructions

- [ ] **Measure the baseline**, each suite alone. Record the counts WO3 left.
- [ ] **Write the failing test first**, at the base (WO3's tip). Add a fixture screen, or extend an
      existing one: **two elements of the same class with the same position binding**, inside the
      same container so they share an origin. One is realised as an **object** by a §13.5 condition
      that does not change its drawing (e.g. an `<event_cb>`, or membership of a focus ring: your
      choice, stated). The other is realised as **draw calls**. Drive the subject **out of range**
      in both directions (e.g. `40000` and `-40000`) and assert the two draw **identically**: the
      same recorded U8G2 call and arguments, from the test double's log. Check that it fails at the
      base for the right reason (the draw-call path wraps), and record the base's wrapped values.
      A value that stays in range should agree before and after. Include one as a control.
- [ ] **One runtime helper, public**, in `include/u8g2gl/u8g2gl_coord.h`, e.g.
      `int16_t u8g2gl_coord_bound(int16_t origin, int32_t value)`, containing exactly the logic of
      today's `u8g2gl_bound_coord()` arithmetic: the ±65536 pre-bound, the sum, the `int16_t`
      clamp. Move the reasoning comment with it. `u8g2gl_obj.cpp` calls the helper, so the object
      path's behaviour is unchanged, and its existing tests prove it.
- [ ] **Firmware emission:** `drawCallFor()` spells every bound **integer** argument through the
      helper: `u8g2gl_coord_bound(40, ui_subject_x.get())`, and `u8g2gl_coord_bound(0, …)` for a
      zero origin and for a size, which has no origin. The object path clamps a size the same way,
      with origin 0. One spelling, no special case for zero, so the output reads uniformly. If a bound
      draw argument can be non-integer (bool, colour), leave it alone and say so. Update
      `SUBJECT_READ_SUFFIX`'s neighbourhood and the module header to state the rule.
      **§13.5's example in the spec** will then differ from the emitted text. Note that for the
      Chief Architect; do not edit `docs/`.
- [ ] **Editor host:** `draw_call()` computes a bound integer argument with the **same helper**
      (origin from the scene, 0 when absent), so the host cannot drift from firmware. If the
      registry thunk's implicit `int32_t` → `int16_t` narrowing remains reachable for a **literal**
      argument, report it as a finding. Literals are validated to `int16_t` today, so do not change
      the registry emitter unless the test requires it.
- [ ] **Scene format:** if the scene JSON's shape must change to carry anything new, it needs a
      scene-format version bump. Avoid that if the origin already suffices, which the PA expects.
- [ ] **CLI version 0.7.0 → 0.8.0** (`cli/package.json` and anything the build stamps from it).
      Rules/03: a generator change that alters output without an input change is breaking and
      **requires** it. Schema stays 0.4. Runtime stays 0.5.0 (WO3 bumped it).
- [ ] **Regenerate the goldens.** They move because every bound draw-call argument's spelling
      changes. The commit that moves them says so, and why, in its message. Review the golden
      diff: **only** bound draw-call arguments (and any stamp) may change. Anything else: stop and
      report.
- [ ] **CLI tests**: `emit-draw-args` (or the nearest) asserts the new spelling, including a zero
      origin and a bound size. Existing assertions that spell the old `40 + ui_subject_x.get()`
      form change **to the new spelling only**. List every one in the report.
- [ ] Run the **built CLI** on the fixture and show a bound draw call as generated.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_coord.h`, `src/u8g2gl_obj.cpp` (use the helper, no behaviour
change), `cli/src/core/generator/emit/draw-args.ts`, `test/editor_host/editor_host.cpp`,
`test/test_generated_fixture.cpp`, `test/test_editor_parity.cpp`, `test/test_obj.cpp`,
`test/test_binding.cpp`, the committed fixture (`test/generated_fixture/**`, including new XML and
regenerated goldens), `cli/test/` (draw-args tests and golden-spelling assertions), `cli/package.json`
(version) and whatever the build stamps from it, this WORKORDER.

**Do NOT touch:** the object-path arithmetic's **behaviour**; `emit/fonts.ts`, `images.ts`, `xbm.ts`
(PR-04b); the validator; the radius work (WO3); `docs/`; `PROGRAM*.md`; `PROJECT.md`; the schema
version; the runtime version.

---

## Testing Requirement

- [ ] The two-realisation test: identical at the extremes and at an in-range control; fails at the
      base behaviourally
- [ ] Editor parity still green, now over clamped values
- [ ] Object-path tests unchanged and green

## Verification Requirement

- [ ] CLI vitest, tsc, lint; C++ build zero warnings on a clean configure; ctest all pass. Each suite
      alone
- [ ] Golden diff reviewed: bound draw-call arguments only
- [ ] `git diff --name-only u8g2gl-4r/wo3-radius-clamp..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*(Worker fills this in: status; counts; the helper; the spelling rule; the test, its base failure and
the wrapped values; editor host change; golden diff summary; assertion edits listed; version bump;
built-CLI output; boundary; findings.)*
