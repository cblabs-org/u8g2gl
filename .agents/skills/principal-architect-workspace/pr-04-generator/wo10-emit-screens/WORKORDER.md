---
work_order: WO10
project: pr-04-generator
title: "Firmware emission: screens, and the compile layer"
branch: u8g2gl-generator/wo10-emit-screens
base: u8g2gl-generator/wo9-emit-project
complexity: standard
status: draft — PA revises against WO9's Completion Report before dispatch
---

# WO10 — Screen emission and compile layer

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo10-emit-screens`
**Base**: `u8g2gl-generator/wo9-emit-project`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, both languages. Generated C++ compiles with zero
warnings under `-Wall -Wextra -Wpedantic`.

## Design authority

design_spec §12.4 (corrected: `uint32_t` tick), §13.3, §13.5, §13.7, §13.8,
§13.12 (corrected: composite container is `u8g2gl_obj`), §17.1; [D-21] §4.
Where this work order and the spec disagree, **stop and report**.

---

## Objective

Emit each screen's translation unit, and prove the output compiles and behaves by
building it in the C++ test suite.

## Line-Item Instructions

- [ ] **Per-screen `.cpp`:** static objects in array order (composite containers as
      `u8g2gl_obj`); `objs[]` and `parents[]`; the `u8g2gl_screen` descriptor.
- [ ] **`init`** in the §13.7 order: construct → set properties → apply styles →
      register bindings → (events and focus refused in PR-04). Bindings last.
      Setter calls through WO9's value helper only.
- [ ] **`tick`** returns the minimum deadline across objects (`u8g2gl_min`).
- [ ] **`render`** in document order: objects via WO4's `u8g2gl_render_object`;
      draw-call elements as calls through WO9's draw-argument helper, guarded by
      WO8's build-time visibility conjunction, with bound values read from the
      subject at draw time. Adjacent siblings sharing an identical guard may be
      hoisted; **never reorder**.
- [ ] **Frame-dirty observers** registered once per subject that draw-call bindings
      read (§13.5), using WO4's `u8g2gl_frame_dirty_observer`.
- [ ] **Carried from WO4 — F7:** objects render through
      `u8g2gl_render_object(d, objs, parents, i)`, **never** `obj.render(d)` directly
      as design_spec §13.12's example still shows. A direct call skips effective
      visibility and clipping, so a hidden object would draw. A test with a hidden
      object proves the generated code does not.
- [ ] **Carried from WO5a — binding overloads.** Emit each binding from the declaration
      whose `type` matches the bound subject (`bind_text` exists for `string` and `int`),
      using WO8's recorded choice rather than re-selecting by name.
- [ ] **Carried from WO4 — F5, the proof:** the compiled fixture's binding pool is the
      *generated* capacity, not the default — asserted from a translation unit inside
      the library build, not only from generated code.
- [ ] **Generated code ignores `add_binding` returns** — capacities are exact
      ([D-21] §4) — and a `static_assert` in the fixture build proves the pool
      equals the counted total.
- [ ] **Compile layer:** commit a generated fixture project under `test/` and add
      it to the C++ test build. A C++ test runs `ui_init`, sets subjects, ticks,
      renders, and asserts stub draw-call history and dirty gating. A CLI test fails
      if regenerating that fixture changes the committed files.

## Strict Boundary Box

**In scope:** `cli/src/core/generator/emit/` (screen units); `test/` (generated
fixture, new C++ test, `test/CMakeLists.txt`); CLI tests; this WORKORDER.

**Do NOT touch:** runtime sources (a runtime gap is a **stop and report** — WO4
owned that surface); editor emission (WO11); shared helpers except to fix a defect,
disclosed.

---

## Testing Requirement

- [ ] §13.12's example generates, compiles and renders; `rule` is a bare draw call.
- [ ] A static screen changing a subject redraws once and then idles
      (`U8G2GL_IDLE`).
- [ ] A draw-call element under a hidden composite does not draw.
- [ ] Regenerating the committed fixture is an empty diff.

## Verification Requirement

- [ ] C++ build zero warnings, including generated code; `ctest` all pass
- [ ] CLI tests, `tsc`, lint clean
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
