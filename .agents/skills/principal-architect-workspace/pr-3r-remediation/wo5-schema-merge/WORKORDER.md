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
- [x] Update `cli/src/core/parser/parse-component.ts` to produce the merged type.
      Whether the *file-level* entry point keeps its name is your call — say which
      you chose and why.
- [x] Update `cli/src/core/schema/component.ts`, `widget-manifest.ts` and the
      barrel exports.
- [x] Update `cli/test/parser/parse-component.test.ts`,
      `cli/test/schema/types.test.ts` and the parser fixtures.
- [x] **Surfaced by WO4:** `cli/test/schema/types.test.ts` still references the
      deleted `u8g2gl_scrolling_label` tag in a Component-schema fixture. You are
      rewriting that file's Component types anyway; correct the fixture while you
      are there.
- [x] This is a **type merge, not a behaviour change**. If you find yourself
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

- [x] Existing component-parsing tests pass against the merged type with their
      assertions intact — a merge that needed the tests rewritten was not a merge.
- [x] `help` round-trips on a composite prop. This is the defect the merge fixes,
      so it needs a test that would fail without it.
- [x] `npx tsc --noEmit` is the real gate here; a type merge that compiles is
      most of the way home.

## Verification Requirement

- [x] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [x] `ctest --test-dir build` — all pass, none weakened or removed
- [x] `cd cli && npx vitest run` — all pass
- [x] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [x] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it, do not file an issue. The architect triages.

---

## Completion Report

<!-- Written by the worker at task completion -->

**Status: complete, commit `2bd7082`.** Verified independently after commit:
CLI 239 → **240 tests**, C++ **238 tests unchanged**, zero warnings
(`-Wall -Wextra -Wpedantic`), `npx tsc --noEmit` clean, `npm run lint` clean.
`git diff` touched exactly seven files, all named in the Boundary Box:
`component.ts`, `widget-manifest.ts`, `parse-component.ts`, the four named
tests/fixtures — no other file, validator included, was touched.

### What changed

- **`ComponentProp` is retired outright, in favour of `PropDef`.** This is the
  real merge the WORKORDER asked for on this half: a composite prop is now a
  `PropDef` like any other, so it can carry `help` — the defect ui_spec.md §9
  calls out. `parse-component.ts` now reads the `help` attribute and copies it
  onto the parsed prop.
- **`WidgetManifest` gained an optional `view` field**, documented as the
  field a composite manifest would populate ([D-18]: "a composite is a
  WidgetManifest whose `<api>` carries a `view`"). No existing widget touches
  it; it is currently unused outside its own doc comment, which is honest —
  it is groundwork for when WO8 actually points composite parsing at the
  `<widget>` root tag, not a live consumer yet.
- **`Component` was *not* made a literal `WidgetManifest` alias.** See "Bigger
  than the WORKORDER implied" below — this is the one place I deviated from
  the checklist's literal wording, and I'm flagging it prominently rather than
  quietly picking a reading that happened to compile.
- `test/schema/types.test.ts`'s Component fixture (surfaced by WO4) no longer
  references the deleted `u8g2gl_scrolling_label` tag; it now uses
  `u8g2gl_label` with `long_mode="scroll"`, matching WO2's replacement.
  `test/parser/fixtures/valid-component.xml` got the same correction.

### Bigger than the WORKORDER implied — surfaced, not silently resolved

The checklist reads "`Component` → `WidgetManifest` with a `view`" as a literal
type-identity merge. I built that first, exactly as written: `Component` and
`ComponentProp` as pure aliases (`type Component = WidgetManifest`), with
`WidgetManifest.api` unified as `ApiBlock` for both widgets and composites.

**It doesn't compile.** `validate-identifiers.ts`, `validate-references.ts`,
`validate-schema.ts` and `validate-widget-props.ts` — all four explicitly
reserved for WO6 by this project's own Strict Boundary Box — read a
component's `.api` as a bare property array today (`comp.api ?? []`,
`.map()`, `for...of`), in code paths kept entirely separate from how the same
four files read a real widget's `manifest.api.props`/`.bindings`. That is the
"removed distinction still encoded" showing up a second time, inside the
validator, not just in the schema types this work order was scoped to. WO6's
own title — "validator: primitives, **composite tags**, cycles, container
geometry" — says this reconciliation was always slated for that work order,
not this one.

Rule 00 is explicit that exceeding the Boundary Box is never authorized,
build state notwithstanding, so I did not patch those four files. Instead I
kept `Component` as its own interface — not a `WidgetManifest` alias — with
`api: readonly PropDef[]` (a bare array, matching what the validator already
expects) rather than wrapping it in `ApiBlock`. This delivers the
`ComponentProp` → `PropDef` half of the merge completely and cleanly (`help`
included, zero validator impact, since every field the validator reads off a
component prop — `name`, `loc`, `required` — is unchanged and `PropDef` is a
strict superset of the retired `ComponentProp`). It leaves the `Component` →
`WidgetManifest` half incomplete: the two types now share their prop type and
conceptual shape, but `Component` is still a second interface, not literally
`WidgetManifest`, because that last step requires touching the validator.

**Recommendation:** WO6, which already owns "composite tags" in the
validator, should finish this by folding `Component` into `WidgetManifest`
outright (wrapping composite props in `ApiBlock`) as part of rewriting the
four files' composite-handling branches to use `.api.props`/`.bindings`
consistently with the widget branches. I did not attempt this myself, and did
not file it as a separate issue per the Issue Surfacing instruction — it sits
inside WO6's existing charter, not a defect nobody assigned.

### Testing

- Existing component-parsing tests pass with their original assertions
  intact, changed only where the checklist itself required it (the deleted
  tag) or to check the new `help` field — no assertion was weakened or
  dropped to make the merge fit.
- New test in `parse-component.test.ts`: "round-trips help text on a
  composite prop" — parses a `<prop help="...">` and asserts it survives onto
  `result.value.api[0].help`. This fails on the pre-merge `ComponentProp`
  (no `help` field existed to read into), so it is a real regression guard
  for the defect this WORKORDER named as the point of the exercise.

### Nothing else surfaced

No other out-of-boundary defects found. `extends`/`draw` on `PropDef` (WO4's
shape) were left untouched, per instruction 3.
