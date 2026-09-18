---
work_order: WO11
project: pr-04-generator
title: "Editor target: class registry, property thunks, draw-by-name, scene description"
branch: u8g2gl-generator/wo11-editor-target
base: u8g2gl-generator/wo10-emit-screens
complexity: standard
status: dispatched
---

# WO11 — Editor target

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo11-editor-target`
**Base**: `u8g2gl-generator/wo10-emit-screens`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, both languages. **No heap** — the editor target is still
runtime code.

## Design authority

design_spec §13.1 (two generation targets), ui_spec [UD-4], §4.1 steps 5–7, §15.
**Sample data is out of scope** (PROJECT.md decision 4). Where this work order and
the spec disagree, **stop and report**.

---

## Objective

The editor target, generated from the same manifests and the same resolved model as
firmware, compiled out of firmware entirely — and a test that fails if the two
targets diverge.

## Background

The editor is the point of this programme. ui_spec §15 names editor-target
generation as PR-04 scope. This work order is last among the emitters so that it
reuses finished shared helpers rather than growing a second copy of them — PR-3R's
evidence is that the second copy is where the defect hides.

## What WO9 and WO10 built, and one known runtime defect

- **Reuse, never re-spell:** `emit/value.ts` (the §13.2 value spelling), `emit/draw-args.ts`
  (draw-argument order) and `emit/placement.ts` (container-relative → device-absolute
  coordinates). The parity test below is only meaningful if the editor path goes through the
  same three.
- **The firmware fixture** is committed at `test/generated_fixture/` and compiled in the C++
  suite; its goldens pin the generator stamp to `0.0.0-golden`. Build the parity test on that
  fixture.
- **Known runtime defect — do not fix it here.** `u8g2gl_label::render()` draws only `text_`;
  a label bound to a subject never draws the subject's value (confirmed by the PA; proposed as
  WO10b). Your parity test must not assert bound text. Literal `text` set by name is fine —
  both targets reach `set_text()`. If the defect blocks a line item, record it and continue.
- **Run every suite alone** — never alongside another suite or build (Standing instructions).

## Line-Item Instructions

- [ ] **`include/u8g2gl/u8g2gl_editor.h`**, entirely under `#ifdef U8G2GL_EDITOR`:
      registry entry types — tag, `sizeof`/`alignof`, placement-construct and destroy
      into **caller-provided storage**, a property-thunk table, and a draw-by-name
      entry type. The editor host (PR-06) owns the storage.
- [ ] **Generated registry unit** covering **all loaded manifests** (framework and
      project), so the palette can place any element: construct-by-name for classed
      elements, set-by-name thunks, draw-by-name for `draw=`-only elements. Thunks
      spell setter calls through WO9's value helper; draw entries use WO9's
      draw-argument helper. **No second spelling of either.**
- [ ] **Carried from WO5a — binding overloads.** A binding name may appear once per
      subject type. Set-by-name for a binding must dispatch on the subject's type, and
      the registry must not collapse `bind_text`'s `string` and `int` declarations into
      one entry.
- [ ] **Scene description JSON** from the same resolved, flattened model WO8
      produces (ui_spec §4.1 step 6): flat element list, resolved geometry and
      properties, parent table, realisation. Subjects are described, **values are
      not supplied** — the editor host supplies them.
- [ ] **Parity test:** a native C++ test compiled with `-DU8G2GL_EDITOR` builds the
      WO10 fixture from its scene description through the registry and renders it;
      the stub draw-call history must equal the firmware-generated fixture's.
- [ ] **Firmware pays nothing:** a check (e.g. `nm` on the firmware test binary)
      that no registry symbol is present without `U8G2GL_EDITOR`.

## Strict Boundary Box

**In scope:** new `include/u8g2gl/u8g2gl_editor.h` and its `src/` file if any;
`cli/src/core/generator/emit/` (editor units); `cli/src/node/cli.ts`
(`--target-kind firmware|editor` or equivalent flag, named by the worker);
`test/` (editor parity test, CMake); CLI tests; this WORKORDER.

**Do NOT touch:** the Wasm build (PR-06); sample data; shared helpers except to fix
a defect, disclosed; firmware emission output (the parity test is what guards it).

---

## Testing Requirement

- [ ] Construct a `u8g2gl_label` by name into provided storage, set `text` and
      `font` by name, render: same history as the firmware setter path.
- [ ] Draw a `u8g2gl_box` by name: same history as the firmware draw call.
- [ ] Parity test on the full fixture passes, and fails if a thunk is deliberately
      mis-spelled (prove it is not vacuous, then revert).
- [ ] Firmware binary contains no registry symbols.

## Verification Requirement

- [ ] C++ build zero warnings in both configurations; `ctest` all pass
- [ ] CLI tests, `tsc`, lint clean
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
