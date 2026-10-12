---
work_order: WO6
project: pr-05r-runtime-fixes
title: "Readability remediation, and one dead branch in the editor registry"
branch: u8g2gl-05r/wo6-readability
base: u8g2gl-05r/wo5-release-criterion1
complexity: standard
status: dispatched
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

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-05r`.** **Branch**:
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
