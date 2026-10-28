---
work_order: WO6
project: pr-05r-runtime-fixes
title: "Readability remediation, and one dead branch in the editor registry"
branch: u8g2gl-05r/wo6-readability
base: u8g2gl-05r/wo5-release-criterion1
complexity: standard
status: complete
---

# WO6 — fix the readability audit's findings; drop the bool subject's integer-ref branch

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, which includes this readability
WO. This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `.`.** **Branch**:
`u8g2gl-05r/wo6-readability` (already checked out, no upstream). Run `git branch --show-current`
**as its own command immediately before every commit** (`.agents/rules/04-branch-hygiene.md`).
Scratch in `tmp/`, never `/tmp`.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**. Do not push, tag, publish or open a
PR. Anything this WORKORDER does not cover: commit what is green, set `status: blocked`, report,
stop.

## Standards

Load `u8g2gl-standards` (`references/cpp.md`, `references/typescript.md`,
`references/documentation.md`). §4.1 on lines you change. No PlatformIO work is expected; if any
arises, the PlatformIO MCP only, never the `pio` CLI.

---

## Objective

Every finding in [AUDIT.md](AUDIT.md) fixed, all five approved by the PA, plus the editor
registry no longer emitting an integer comparison for a bool subject.

## Line-Item Instructions

- [ ] **Baseline first:** C++ **414** (one skip, 0 warnings, clean configure), CLI **1353**.
- [ ] Every item in `AUDIT.md`: P2 × 2, P3 × 2 (including `U8G2GL_NO_PARENT` — make the header
      say where it is defined, `u8g2gl_types.h:39`), and P4 (the rewrap at
      `u8g2gl_core.h:253-254`). For the `render_animation_update()` doc, point implementers at
      `u8g2gl_repaint_object()` and say what it does for them.
- [ ] `cli/src/core/generator/emit/editor-registry.ts` (about `:392`): the generator now always
      gives a bool subject a `bool` ref (`screen-model.ts`), so the branch that passes
      `ref.integer` to a bool subject is dead for generated scenes — but the editor protocol
      (`include/u8g2gl/u8g2gl_editor.h`, the designer side under `cli/src/browser/` or wherever
      scenes are built at runtime) may still send an integer ref for a bool subject. **Find out
      first and say which.** If integer refs for bool subjects cannot reach the registry, remove
      the branch. If they can, keep the branch but pass `ref.integer != 0` (and compare
      `get()` against `ref.integer != 0` in the clear path), so it resolves to the `bool`
      overload explicitly rather than by implicit conversion. Regenerate (`npm run build` first, then
      `node test/generator/refresh-goldens.mjs` from `cli/`); describe the diff of
      `ui_editor_registry.cpp`, then rebuild and run the C++ suite (the editor parity tests compile it).
- [ ] Append a "Remediation" note under each item in `AUDIT.md`: fixed, with file:line.

## Strict Boundary Box

- **In:** the files `AUDIT.md` names, `editor-registry.ts` and its tests, goldens and the compile
  fixture's editor outputs.
- **Out:** behaviour anywhere else, versions, the schema.

## Verification Requirement

- [ ] C++ clean configure 0 warnings, ctest 414 ± tests you changed (say which), one skip. CLI
      vitest, `tsc`, lint. State totals.
- [ ] Golden diff: the editor registry branch only.
- [ ] `git diff --name-only <base>..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report; do not fix them or file issues.

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Evidence · Out-of-Scope Findings ·
Blockers.

### Status
Complete. Code commit `2d838af` (green build); AUDIT remediation notes in `1f0bb27`; this report committed after.

### Baseline and final counts
- Baseline: C++ 414 (one skip, 0 warnings, clean configure), CLI 1353.
- Final: C++ 414 (one skip: `SizeOfReport.ThirtyTwoBitTarget`), 0 warnings, clean configure into a fresh build dir; no C++ test changed. CLI vitest 1353 passed (90 files); `tsc --noEmit` clean; `npm run lint` (eslint + `tsc -p tsconfig.test.json`) clean. Suites run sequentially.

### Changes Made
- AUDIT P2 x2, P3 x2, P4: all fixed; file:line in each "Remediation" note in AUDIT.md. Comments and doc text only (`u8g2gl_obj.h`, `model.ts`, `u8g2gl_config.h`, `generated-config.ts`, `design_spec.md`, `u8g2gl_core.h`). `u8g2gl_config.h` also now lists the five capacity macros it defines.
- Editor registry, `cli/src/core/generator/emit/editor-registry.ts` (`directiveEntries`): kept the integer-ref branch for bool subjects and made the conversion explicit.

### Integer refs reaching the editor registry: finding and action
They can reach it. Nothing in the registry or protocol forbids it: `u8g2gl_editor_value` carries both `integer` and `boolean`, `u8g2gl_editor_int()` is public API (`u8g2gl_editor.h:125`), and `u8g2gl_editor_bind_flag` / `u8g2gl_editor_flag_clear` accept whatever the host builds. The only in-repo host, `test/editor_host/editor_host.cpp:341-345, 427-429`, picks the ref type from the JSON type of the scene's `ref`, so a hand-written or older scene with `0`/`1` on a bool subject yields an INT ref. The generator's own scene JSON emits bool refs for bool subjects, so for generated scenes the branch is dead; it is live for any other host. The designer is not in this repository, so I cannot say what it sends. I kept the branch and changed it to `ref.integer != 0` in both bind and clear (explicit `bool` overload; matches design_spec.md:1662 "0 is false, any other value true"), and updated the function's header comment.

### Evidence
- Golden diff is the editor registry branch only: `test/generated_fixture/generated_editor/ui_editor_registry.cpp`, 4 lines (bind and clear for `bind_flag_if_eq` and `bind_flag_if_not_eq`, bool subject): `ref.integer` becomes `ref.integer != 0` (bind) / `(ref.integer != 0)` (clear). `ui_scene.json` unchanged. Regenerated with `npm run build` then `node test/generator/refresh-goldens.mjs`; the C++ editor parity tests compile it and pass.
- `git diff --name-only 4d60b11..2d838af` is 8 files, all inside the Boundary Box.

### Out-of-Scope Findings
- No test exercises an INT ref against a bool subject through `u8g2gl_editor_bind_flag` / `_flag_clear` (test_editor.cpp:369-383 use bool refs only), so the kept branch is uncovered. Architect may want one.

### Blockers
None.

### Follow-up: integer-ref coverage
Commit `73b2be3`. Added `EditorRegistry.IntegerRefOnABoolSubjectMatchesTheBoolRef` in `test/test_editor.cpp` (after the flag-directive test). For `bind_flag_if_eq` and `bind_flag_if_not_eq`, subject true and false, it passes `u8g2gl_editor_int(v)` for v in {0, 1, 2, -1} through `u8g2gl_editor_bind_flag` (checks `is_hidden()`) and `u8g2gl_editor_flag_clear`, and asserts each equals the result for `u8g2gl_editor_bool(v != 0)`. Totals: C++ 415 (414 + 1), one skip, 0 warnings, clean configure.
Revert check (scratch edit of the generated registry, restored afterwards): removing `!= 0` makes the new test fail. Note that 0 and 1 alone would NOT catch it, since an int of 0/1 converts to bool or compares equal to a bool identically; the value 2 (and -1) is what distinguishes it, and only the `flag_clear` comparison (`get() == ref.integer`) is sensitive. The bind path converts implicitly to `bool` either way, so it is covered but not discriminating.
