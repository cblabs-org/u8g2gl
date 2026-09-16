---
work_order: WO9
project: pr-04-generator
title: "Firmware emission: project-level files"
branch: u8g2gl-generator/wo9-emit-project
base: u8g2gl-generator/wo8-realisation-capacities
complexity: standard
status: draft — PA revises against WO8's Completion Report before dispatch
---

# WO9 — Project-level emission

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo9-emit-project`
**Base**: `u8g2gl-generator/wo8-realisation-capacities`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Determinism (§13.9): document order, sorted includes,
no timestamps, no floating point.

## Design authority

design_spec §8.1–§8.2, §13.2, §13.4, §13.7, §13.9, §14; [D-21]. What the
generator may **not** assume about the runtime is listed in §13.7 — respect it.
Where this work order and the spec disagree, **stop and report**.

---

## Objective

Emit every file that is not per-screen, through **shared emission helpers** that
WO10 and WO11 reuse.

## Line-Item Instructions

- [ ] **Carried from WO8a — every emitted value must be literal and typed.** The value helper
      below cannot spell a value the pipeline never resolved or checked, and four gaps reach it
      today. Close each, with a test that fails at the base:
  - **Booleans:** only `hidden` is value-checked, so `filled="yes"` validates and would reach
    emission (confirmed end to end). Every `type="bool"` prop takes `true`/`false` only, with
    the strictness §7.2 gives `hcenter`.
  - **Non-coordinate `int` props are never evaluated:** `scroll_px_per_sec="#speed"` arrives as
    text. Resolve every `type="int"` prop through the existing evaluator — one evaluator, no
    second copy — and apply the `int32_t` range rule (§13.2 keeps coordinates at `int16_t`).
  - **A screen-level `$prop` in a `bind_*` attribute** is silent; at screen level there is
    nothing to substitute, so it is an error, as it already is for other attributes.
  - **A literal `<style>` child inside a `<view>`** is unchecked; check it as the attribute
    form is checked.
- [ ] **Shared helper — value spelling (§13.2):** one function mapping a prop type
      and resolved value to its C++ spelling (`int`, `bool`, escaped `string`,
      `enum` via `emit`, `font`, `image`, `subject`, `style`, `color`). Setter calls
      are spelled through it and nowhere else.
- [ ] **Shared helper — draw arguments:** one function producing a draw call's
      argument list from a drawing element's props in manifest declaration order
      (the order WO2 proved matches the header).
- [ ] **`u8g2gl_generated_config.h`:** the [D-21] capacities from WO8, and the
      version guard against WO4's `u8g2gl_version.h`.
- [ ] **`ui.hpp`:** includes the generated config **before** any runtime header;
      declares subjects, `ui_set_*`, screens, `ui_init()`.
- [ ] **Subjects unit:** `u8g2gl_subject_<type>_n<N>` with WO8's observer counts;
      strings sized by `max_len` (`max_len + 1` bytes, §8.2); initial values;
      `ui_set_*` setters.
- [ ] **Styles unit** (`ui_style_*`), **fonts** (`<builtin>` only — `<bdf>` is
      refused in WO5), **images** (`<xbm>` from file, `PROGMEM`; `<convert>` refused).
- [ ] **Carried from WO5b — the generator version must never be guessed.**
      `getPackageVersion()` in `cli/src/node/cli.ts` falls back to `'0.3.0'` when
      `package.json` cannot be read, which would stamp a wrong generator version into
      committed output. Fail with a clear error instead; a test covers the unreadable
      case.
- [ ] **Carried from WO5b — `<output prefix>`.** It is parsed but nothing reads it,
      and §13.4 fixes generated identifiers as `ui_*`. Decide from §13.4 whether it can
      mean anything (e.g. file names only). If it cannot, diagnose it rather than
      accept it silently; if it can, implement it and say what it controls. Record the
      reasoning.
- [ ] **Carried from WO4 — F5: generated capacities must reach the library build.**
      The binding pool is sized in `src/u8g2gl_obj.cpp` from `u8g2gl_config.h`.
      Including `u8g2gl_generated_config.h` only from generated translation units
      leaves the library compiled with the defaults, so the [D-21] capacities never
      take effect and §18's report would be false. Emit the capacities in a form the
      *library's* compilation also sees, and document the integration for CMake and
      PlatformIO (§16). Design it here; WO10's compile layer proves it.
- [ ] **Golden files** for a fixture project, compared byte-for-byte (§17.1).

## Strict Boundary Box

**In scope:** `cli/src/core/generator/emit/` (project units and shared helpers);
`cli/src/core/validator/` and `cli/src/core/resolver/` (the four WO8a value-completeness
carries only — booleans, `int` props, screen-level `$prop` in `bind_*`, literal `<style>`
child);
`cli/src/node/cli.ts` (version lookup only); `cli/src/core/parser/parse-project.ts`
and `cli/src/core/validator/` (`<output prefix>` only);
`cli/src/node/` only if the writer needs asset file reads passed in; golden
fixtures and tests; this WORKORDER.

**Do NOT touch:** per-screen emission (WO10); editor emission (WO11); runtime;
realisation.

---

## Testing Requirement

- [ ] Golden files match; regenerating is byte-identical.
- [ ] A subject bound by three objects and one draw-call element emits `_n<4>`.
- [ ] A string with `max_len="16"` emits a 16-character capacity (17 bytes).
- [ ] A string containing quotes, backslashes and non-ASCII escapes correctly.

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
