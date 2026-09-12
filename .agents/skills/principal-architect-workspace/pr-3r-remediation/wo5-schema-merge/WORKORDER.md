---
work_order: WO5
project: pr-3r-remediation
title: "Merge component schema into widget manifest"
branch: u8g2gl-remediation/wo5-schema-merge
base: wo4-manifests
complexity: standard
status: pending
---

# WO5 — Merge component schema into widget manifest

## Authorization

Part of PR-3R (pr-3r-remediation). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — not a relayed claim, the
owner's own words with a timestamp. If it is absent or reads as a placeholder,
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-remediation/wo5-schema-merge`
**Base**: `u8g2gl-remediation/wo4-manifests`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit. A check that
runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. Documentation carries
equal weight to the code rules: file headers with SPDX and a real `Purpose:`,
Doxygen on public declarations, `// --- Step N: ---` breakdowns, and why-comments
where a decision is not obvious from the code.

## Design authority

`docs/design_spec.md` is normative. The decisions driving this work order are
[D-18], [D-19], [D-20] and [D-21] — full records under `docs/decisions/`. Where
this work order and the spec disagree, **stop and report**; do not pick one.

---

## Objective

Merge the component schema into the widget manifest, so there is one type for
one concept per [D-18].

## Background

[D-18] removes `components/` and `<component>`: there is one element vocabulary,
and a composite is an element declared by a manifest whose `<api>` carries a
`<view>`. The TypeScript model still has a separate `Component` /
`ComponentProp` pair, which is the removed distinction still encoded in types.

**This also fixes a defect nobody logged.** `ComponentProp` has no `help` field,
so a composite's props cannot carry description text — and `ui_spec.md` §9 calls
that surface the editor's differentiator, the thing LVGL Pro does badly. Merging
the types fixes it for free, and the merged `PropDef` must carry `help`.

## Line-Item Instructions

- [ ] `Component` → `WidgetManifest` with a `view`. `ComponentProp` → `PropDef`,
      carrying `help`.
- [ ] Update `cli/src/core/parser/parse-component.ts` to produce the merged type.
      Whether the *file-level* entry point keeps its name is your call — say which
      you chose and why.
- [ ] Update `cli/src/core/schema/component.ts`, `widget-manifest.ts` and the
      barrel exports.
- [ ] Update `cli/test/parser/parse-component.test.ts`,
      `cli/test/schema/types.test.ts` and the parser fixtures.
- [ ] This is a **type merge, not a behaviour change**. If you find yourself
      changing what the parser accepts, stop — that is a schema change and it
      belongs to WO8.

## Strict Boundary Box

**In scope:** `cli/src/core/schema/component.ts`, `widget-manifest.ts`,
`cli/src/core/parser/parse-component.ts`, the barrel `index.ts` files, the four
named test files and their fixtures, this WORKORDER.

**Do NOT touch:** the validator (WO6), the manifests on disk (WO4), the schema
version (WO8).

---

## Testing Requirement

- [ ] Existing component-parsing tests pass against the merged type with their
      assertions intact — a merge that needed the tests rewritten was not a merge.
- [ ] `help` round-trips on a composite prop. This is the defect the merge fixes,
      so it needs a test that would fail without it.
- [ ] `npx tsc --noEmit` is the real gate here; a type merge that compiles is
      most of the way home.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass, none weakened or removed
- [ ] `cd cli && npx vitest run` — all pass
- [ ] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it, do not file an issue. The architect triages.

---

## Completion Report

<!-- Written by the worker at task completion -->
