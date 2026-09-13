---
work_order: WO4
project: pr-04-generator
title: "Runtime support for generated code: render wrapper, version guard, frame-dirty observer"
branch: u8g2gl-generator/wo4-runtime-support
base: u8g2gl-generator/wo3-bindable-geometry
complexity: standard
status: draft — PA revises against WO3's Completion Report before dispatch
---

# WO4 — Runtime support for generated code

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo4-runtime-support`
**Base**: `u8g2gl-generator/wo3-bindable-geometry`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/cpp.md`. No heap, zero warnings, Doxygen
on public declarations.

## Design authority

design_spec §11.3, §13.3, §13.5, §13.7, §16. Runtime version **0.4.0 is
owner-approved** (PROJECT.md decision 5). Where this work order and the spec
disagree, **stop and report**.

---

## Objective

Give generated code the runtime calls §13 assumes but that do not exist, so the
emitters in WO9–WO10 generate calls rather than inline boilerplate.

## Background

- `ui_handler` calls `render_fn` and nothing else. §11.3 says the framework
  constructs `u8g2gl_state_saver` and sets the clip window around each object's
  render; nothing in `src/` does. `u8g2gl_effective_clip()` and
  `u8g2gl_is_effectively_visible()` exist in `u8g2gl_tree.h` but have no caller.
- §16: "the runtime refuses to compile against a mismatched major version". No
  version macro exists; `CMakeLists.txt` says `0.3.0`.
- §13.5 (corrected on `main`): draw-call elements with bindings need **one
  frame-dirty observer per subject**, calling `u8g2gl_mark_dirty()`. The observer
  signature is `void(*)(void*)`; there is no function of that shape to register.

## Line-Item Instructions

- [ ] **`u8g2gl_render_object(U8G2&, u8g2gl_obj* const* objs, const uint8_t* parents, uint8_t index)`**
      (exact signature the worker's to settle against `u8g2gl_screen`): skip if
      not effectively visible; construct `u8g2gl_state_saver`; set the effective
      clip; call `render()`. One implementation serving firmware and the editor.
- [ ] **`include/u8g2gl/u8g2gl_version.h`:** runtime major/minor/patch and the
      schema major the runtime supports, plus the macro or `static_assert` hook a
      generated header uses to refuse a mismatched major. Wire `CMakeLists.txt`
      `project(... VERSION 0.4.0)` so the two cannot disagree silently (a test or a
      configure-time check).
- [ ] **Frame-dirty observer:** a free function matching `u8g2gl_observer_cb` that
      calls `u8g2gl_mark_dirty()`.
- [ ] **Carried from WO2 — W3:** `u8g2gl_progress_bar::set_value()` marks dirty
      even when the value is unchanged. Apply the house change-guard; a test that a
      same-value set leaves the frame clean.
- [ ] **Carried from WO2 — W8:** `test/test_subject.cpp` has a placeholder file
      header and a comment claiming binds discard their result, which WO2 made
      untrue (they return `bool`). Correct both.
- [ ] Document the generated-config inclusion order ([D-21]) in
      `u8g2gl_config.h`'s header comment against the real generated file name.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_tree.h`, `u8g2gl_core.h`, `u8g2gl_config.h`
(comment only), new `u8g2gl_version.h`, matching `src/` files, `CMakeLists.txt`
(version), `src/u8g2gl_progress_bar.cpp` (W3 only), `test/`, this WORKORDER.

**Do NOT touch:** editor types (WO11); widgets; manifests; CLI.

---

## Testing Requirement

- [ ] A hidden ancestor suppresses a child's render; a child is clipped to an
      ancestor's bounds; U8G2 state is restored after the call (stub history).
- [ ] A translation unit asserting a mismatched major fails to compile — proven
      with a `try_compile` or equivalent, not by argument.
- [ ] Setting a subject observed by the frame-dirty callback marks the active
      screen dirty.

## Verification Requirement

- [ ] C++ build zero warnings; `ctest` all pass
- [ ] CLI suite unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
