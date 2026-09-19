---
work_order: WO12
project: pr-04-generator
title: "Budget report, generate --json contract, determinism, CLI 0.7.0"
branch: u8g2gl-generator/wo12-budget-determinism
base: u8g2gl-generator/wo11b-validator-hardening
complexity: standard
status: draft — PA revises against WO11b's Completion Report before dispatch
---

# WO12 — Budget, `--json`, determinism

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo12-budget-determinism`
**Base**: `u8g2gl-generator/wo11b-validator-hardening`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval. **Do not
tag, and do not publish to npm** — rules/03-versioning.md.

## Standards

`u8g2gl-standards` skill. **Honest cost reporting (§1.3):** no figure the tooling
cannot substantiate.

## Design authority

design_spec §1.3, §13.5 (realisation reported), §13.9, §15.3, §18, §18.1; [D-16];
[D-18] amendment. CLI **0.7.0** approved (PROJECT.md decision 5). Where this work
order and the spec disagree, **stop and report**.

---

## Objective

`generate` reports what the project costs and why each element was realised as it
was, as human output and as a specified JSON contract; and determinism is proven
by test rather than asserted.

## Line-Item Instructions

- [ ] **§18.1 capacity section:** busiest screen objects `/ 254` with its name,
      busiest object's bindings with its name, total bindings, styles.
- [ ] **RAM lines only where derivable:** subject storage from declared sizes
      (`max_len + 1`), capacity counts. Widget `sizeof`, flash and framebuffer
      figures the generator cannot know (§13.7) are shown as **unmeasured**, not
      estimated.
- [ ] **The report states that classed-element demotion is not yet delivered**
      ([D-18] amendment) — on every run, in human output and in JSON.
- [ ] **Realisation report:** per element, object or draw calls, and the reason
      codes from WO8 (§13.5, §6.1).
- [ ] **`generate --json` contract:** `{ files, diagnostics, errors, warnings,
      budget, capacity, realisation }`, typed and documented. Every other command's
      contract unchanged.
- [ ] **Determinism tests:** generate twice → identical bytes; shuffle file
      discovery order → identical bytes; diagnostics ordered file, line, column.
- [ ] **Carried from WO5b — locale-independent diagnostic order.** `validate.ts` and
      `check-project.ts` sort with `localeCompare`, so the order can differ between
      machines. §13.9 orders diagnostics by file, then line, then column; compare by
      code unit, not locale. Keep both paths on one comparator.
- [ ] **Carried from WO5b — validate `<output dir>`.** `dir="../src"` is accepted. An
      output directory resolving outside the project root is an error (§13.10:
      generation writes only to the configured output directory, never the app's own
      sources).
- [ ] **Carried from WO5b — empty directories.** Deleting stale generated files leaves
      empty directories behind; remove a directory only when the writer emptied it.
- [ ] **Carried from WO11 — the scene file's marker.** `ui_scene.json` cannot carry the GENERATED
      marker, so the writer never deletes a stale one. Give the writer a way to recognise it
      (for example a top-level marker key) without special-casing the name.
- [ ] **Carried from WO5b — usage errors under `--json`.** `generate` usage errors are
      prose on stderr even with `--json`. Under [D-16] they are JSON with a stable code.
- [ ] **Carried from WO10 — the version proof changes.** WO10's goldens and committed fixture
      pin the generator stamp to `0.0.0-golden`, so bumping `package.json` does **not** change
      them. Prove the bump instead by generating a fresh project and asserting its header stamps
      `0.7.0`, and by asserting the goldens still regenerate byte-identically at the pinned stamp.
      Do not unpin the goldens.
- [ ] **CLI 0.7.0** in `package.json`; a freshly generated project's header carries it.
      The goldens and committed fixture stay pinned at `0.0.0-golden` and do **not**
      change — the proof is the carried item above, not a regenerated diff.

## Strict Boundary Box

**In scope:** `cli/src/core/generator/report/` (new); `cli/src/node/cli.ts` and
formatters; `cli/package.json` (version); `cli/src/node/write-generated.ts`,
`cli/src/core/generator/check-project.ts` and `cli/src/core/validator/validate.ts`
(the four WO5b carries only); regenerated fixture and golden files;
tests; this WORKORDER.

**Do NOT touch:** emission logic (a determinism defect found here is a **stop and
report**, with the failing test); runtime; spec documents.

---

## Testing Requirement

- [ ] The demotion-not-delivered statement is present in human and JSON output.
- [ ] Capacity figures match the generated config header exactly.
- [ ] Both determinism tests pass and are non-vacuous.

## Verification Requirement

- [ ] C++ build zero warnings; `ctest` all pass
- [ ] CLI tests, `tsc`, lint clean
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
