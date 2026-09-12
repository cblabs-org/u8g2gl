---
work_order: WO8
project: pr-3r-remediation
title: "Schema 0.4, the 0.3 refusal path, and stack integration"
branch: u8g2gl-remediation/wo8-schema-04
base: wo7-capacities
complexity: standard
status: pending
---

# WO8 — Schema 0.4, the 0.3 refusal path, and stack integration

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

**Branch**: `u8g2gl-remediation/wo8-schema-04`
**Base**: `u8g2gl-remediation/wo7-capacities`

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

Move the schema to 0.4 and make the break diagnosable, then verify the stack as a
whole.

## Background

Everything WO1–WO7 changed is a breaking schema or manifest change.
`rules/03-versioning.md` and design_spec §15.4 both require a breaking change to
be **diagnosable, never silent**: the CLI must refuse `schema="0.3"` naming each
change and its migration, not fail obscurely somewhere downstream.

This is the last work order because the refusal message must describe changes
that have all already landed.

**It is also the item most likely to be quietly dropped**, and it is the whole
reason the break is defensible. A bump without the migration message is a silent
break wearing a version number.

## Line-Item Instructions

- [ ] `VALID_SCHEMA_VERSION` 0.3 → 0.4 in
      `cli/src/core/validator/validate-schema.ts`, and every fixture and test
      declaring `schema="0.3"`.
- [ ] Implement the §15.4 refusal path. A project declaring `0.3` gets a specific
      diagnostic naming what changed and what to do:
      `truncate` → `long_mode`; `<u8g2gl_scrolling_label>` →
      `<u8g2gl_label long_mode="scroll">`; `animated` removed from manifests;
      `components/` and `<component>` removed. The migration table is in
      design_spec §15.4 — follow it; if it and this list disagree, **stop and
      report**.
- [ ] Bump the CLI minor version in `cli/package.json`.
- [ ] Run the `readability-reviewer` agent over the whole stack's diff and record
      its findings in your Completion Report. Do **not** action P3s or P4s; the
      architect triages.
- [ ] Re-run `test/test_sizeof_report.cpp` and record every figure with the host
      width stated.

## Strict Boundary Box

**In scope:** `validate-schema.ts` and the refusal path, fixtures and tests
declaring a schema version, `cli/package.json`, this WORKORDER.

**Do NOT build migration tooling.** A `--migrate` command was considered and
**rejected**: no 0.3 XML has ever been written, here or anywhere, so there is
nothing to migrate. The refusal message is the whole requirement. If this comes
up again, the answer is in `docs/design_spec.md` §1.5 — a feature earns inclusion
by demonstrated need, and "we already have most of the machinery" is not need.

**Do NOT touch:** anything WO1–WO7 owns. If one of them left something broken,
report it — do not repair it here, where the fix would be invisible in review.

---

## Testing Requirement

- [ ] A project declaring `schema="0.3"` is refused with a diagnostic naming at
      least one specific migration, not a generic version mismatch. Assert on the
      message content — a test that only checks the error code would pass against
      the obscure failure this work order exists to prevent.
- [ ] A project declaring `schema="0.4"` validates.
- [ ] An unknown version (`0.9`) is refused distinctly from a known-old one.
- [ ] The full suite is green across the whole stack, not just this branch.

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
