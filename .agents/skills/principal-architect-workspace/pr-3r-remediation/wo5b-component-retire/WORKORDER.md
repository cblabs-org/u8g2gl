---
work_order: WO5b
project: pr-3r-remediation
title: "Retire the Component type — finish the [D-18] merge"
branch: u8g2gl-remediation/wo5b-component-retire
base: u8g2gl-remediation/wo5-schema-merge
complexity: standard
status: pending
---

# WO5b — Retire the `Component` type

## Authorization

Part of PR-3R, approved by the human on 2026-09-13 — verify the verbatim record
in `../PROJECT.md`. **WO5b was added by the Principal Architect during execution**
to finish what WO5 correctly stopped short of. If the record is absent or reads
as a placeholder, **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> those specified here, do not branch beyond the one named below.

## Branch

**Branch**: `u8g2gl-remediation/wo5b-component-retire`
**Base**: `u8g2gl-remediation/wo5-schema-merge`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted. **Commit
incrementally**; a green intermediate state committed is worth more than a perfect
one lost.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. §4.1 explains [D-18].

---

## Objective

`Component` stops existing as a distinct type. A composite becomes what [D-18]
says it is: a `WidgetManifest` whose `<api>` carries a `view`.

## Background — why WO5 stopped, and why it was right to

WO5 merged `ComponentProp` into `PropDef` cleanly, and `help` now works on
composite props. It could not retire `Component` itself, because five call sites
across four validator files read `comp.api` as a bare `PropDef[]`, while a
widget's props are read as `manifest.api.props` through an `ApiBlock`. Unifying
the type means unifying those reads — and those four files were reserved for WO6.

WO5 built the literal version first, found it did not compile, and surfaced the
conflict rather than either reaching into reserved files or choosing a shape that
compiled but encoded the wrong thing. That was the correct call. This work order
supplies the authorization it lacked.

**You get the validator files before WO6 does**, and deliberately: a type
migration and four behaviour changes in one diff is not reviewable. Yours is the
type migration. WO6 changes behaviour afterwards, on a settled shape.

## Line-Item Instructions

- [ ] Retire `Component`. A composite is a `WidgetManifest` with a `view`. Whether
      `cli/src/core/schema/component.ts` disappears or becomes a thin re-export is
      your call — say which you chose and why.
- [ ] Unify how composite props are read. The five known sites:
      `validate-identifiers.ts:441`, `validate-references.ts:333`,
      `validate-schema.ts:393`, `validate-widget-props.ts:176` and `:206`. Search
      for others rather than trusting this list — it was gathered by grep, not by
      the compiler.
- [ ] **Delete the `@deprecated ComponentProp` alias.** A deprecation alias buys
      downstream consumers time to migrate; there are no downstream consumers, and
      no XML or code exists outside this repository. Keeping it is debt with
      nothing on the other side of the trade. This is the same reasoning that
      rejected `--migrate` in WO8.
- [ ] **No behaviour change.** Every diagnostic that fires today must still fire,
      with the same code and the same severity. You are changing how the validator
      *reaches* a composite's props, not what it concludes about them.
- [ ] If unifying the read reveals a genuine behavioural difference between the
      widget path and the composite path — one validates something the other does
      not — **stop and surface it.** That is a finding for WO6, not a thing to
      quietly harmonise.

## Strict Boundary Box

**In scope:** `cli/src/core/schema/component.ts`, `widget-manifest.ts`,
`cli/src/core/schema/index.ts`, `cli/src/core/parser/parse-component.ts`, the four
validator files **for the type migration only**, their tests and fixtures, this
WORKORDER.

**Do NOT touch:** validator *behaviour* — `TIER1_PRIMITIVES`, cycle detection,
composite tag validation, container geometry, and the `setter`/`draw` rule are all
WO6's, and WO6's WORKORDER already specifies them. Do not do WO6's job because you
are in its files. Do not touch the C++ runtime, the manifests, or `docs/`.

---

## Testing Requirement

- [ ] Every existing validator test passes **with its assertions intact**. This is
      the whole safety property: a type migration that needed the tests rewritten
      changed behaviour.
- [ ] A composite's props still validate — names, types, `help`, and the
      diagnostics that fire on bad ones.
- [ ] `npx tsc --noEmit` is the real gate. The compiler finds the call sites grep
      missed.

## Verification Requirement

- [ ] `cd cli && npx vitest run` — all pass, none weakened or removed
- [ ] `npx tsc --noEmit` and `npm run lint` — zero errors
- [ ] `cmake --build build && ctest --test-dir build` — unchanged and green
- [ ] Confirm no `Component` type and no `ComponentProp` alias remain, and say how
      you verified it
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file an issue. The architect triages and files.

---

## Completion Report

<!-- Written by the worker at task completion -->
