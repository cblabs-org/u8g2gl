---
work_order: WO5a
project: pr-04-generator
title: "Manifest and validator carries: flags, bind overloads, mixed manifests, extends remedy"
branch: u8g2gl-generator/wo5a-validator-carries
base: u8g2gl-generator/wo4b-clipping-version
complexity: standard
status: draft — PA revises against WO4b's Completion Report before dispatch
---

# WO5a — Manifest and validator carries

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval" (owner's own words, timestamped), that
`../PROJECT.md` records **the WO5 split as approved at the owner checkpoint**
("Checkpoint rulings"), and that this WORKORDER's `status` is `dispatched`. Otherwise
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo5a-validator-carries`
**Base**: `u8g2gl-generator/wo4b-clipping-version`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. `src/core/` stays isomorphic.
Element knowledge is data, never code ([D-17]).

## Design authority

design_spec §6.2, §6.5, §8.4, §13.1 **on `main` @ `ef73776`** (read with
`git show main:docs/design_spec.md`); [D-18]. **Do not add manifest vocabulary** —
`setter=` naming a prop on a drawing element's `<bind>` stays as built (owner ruling,
recorded as Q-9). Where this work order and the spec disagree, **stop and report**.

---

## Objective

Close the validator and manifest findings carried from WO1 and WO3 as one reviewable
behaviour change, before WO5b adds the `generate` command on top.

## Line-Item Instructions

- [ ] **Flags on drawing elements (from WO3).** `<bind_flag_if_*>` flags are fixed by
      §8.4 (`hidden`, `disabled`), not declared per element. `hidden` is valid on every
      element. `flag="disabled"` on a `draw=`-only element is an error — nothing to
      disable. Decide "drawing element" through the registry, never a tag list.
- [ ] **Binding overloads (from WO3).** Delete `bind_text_int` from the manifests.
      Declare `bind_text` once per accepted subject type (`type="string"` and
      `type="int"`, same `setter` and `fmt`). The registry merges bindings by
      (name, type); the validator accepts a subject type if any binding of that name
      declares it; remove WO3's same-setter inference. A string subject on an int-only
      binding must fail again. Rebuild the manifest bundle.
- [ ] **Mixed manifests (from WO3).** A manifest declaring both `setter=` and `draw=`
      props is an error in the schema pass ([D-18]: one emission target or the other),
      naming one prop of each kind.
- [ ] **Unknown `extends` says what to do (Chief Architect ruling on F3).** The
      registry's error stays. Its message (`manifest-registry.ts`, currently
      "Manifest <tag> extends unknown element 'parent'.") adds the remedy §6.5 states:
      give the class a manifest — an `<api>` with no new props is enough. Keep the
      near-miss suggestions. Assert the remedy text in a test.
- [ ] **F5 (from WO1) — single-file shadowing.** `validate` pointed at a single
      framework manifest file (e.g. `include/u8g2gl/manifests/u8g2gl_label.xml`)
      reports a spurious shadowing error. A single file that *is* the bundled framework
      manifest is not a project copy.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/` (the carries above), `cli/src/core/manifest/`
(bindings merge by name and type; the `extends` message), `cli/src/node/cli.ts`
(single-file path, F5 only), `include/u8g2gl/manifests/*.xml` and
`cli/src/data/manifests.json` (`bind_text` overloads only), `cli/test/`,
`schema/diagnostic.ts` (new codes only), this WORKORDER.

**Do NOT touch:** runtime C++; the `generate` command, `loadProject()` extraction and
not-yet-supported policy (WO5b); new manifest vocabulary (Q-9).

---

## Testing Requirement

- [ ] `flag="disabled"` on `<u8g2gl_box>` errors; `flag="hidden"` on it validates.
- [ ] `bind_text` accepts string and int subjects; no binding named `bind_text_int`
      exists; a string subject on an int-only binding fails.
- [ ] A manifest mixing `setter=` and `draw=` props errors, naming both.
- [ ] Unknown-`extends` message contains the manifest remedy.
- [ ] Single-file `validate` of a framework manifest reports no shadowing.

## Verification Requirement

- [ ] C++ build zero warnings; `ctest` all pass (unchanged)
- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
