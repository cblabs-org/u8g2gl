---
work_order: WO9
project: pr-3r-remediation
title: "Remove the component vocabulary and pay down the remaining debt"
branch: u8g2gl-remediation/wo9-component-removal
base: u8g2gl-remediation/wo8-schema-04
complexity: standard
status: pending
---

# WO9 — Remove the component vocabulary

## Authorization

Part of PR-3R, approved by the human on 2026-09-13. **WO9 was directed by the
owner specifically**, after the Principal Architect escalated the gap rather than
adding a work order on its own judgement. The owner's words, recorded verbatim in
`../PROJECT.md`:

> "clean it up and pay down the technical debt, that's my preferred approach, get
> rid of the omponent code."

Verify that record before starting. If it is absent, **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> those specified here, do not branch beyond the one named below.

## Branch

**Branch**: `u8g2gl-remediation/wo9-component-removal`
**Base**: `u8g2gl-remediation/wo8-schema-04`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit.

## COMMIT ON A GREEN BUILD

Commit incrementally on green. Do NOT stop to ask for approval — you cannot be
answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. §4.1 explains [D-18].

---

## Objective

`<component>` and `components/` stop existing. A composite is authored as a
`<widget>` with a `<view>`, in `widgets/[name]/[name].xml`, exactly as
design_spec §15.4's migration table already says.

## Background — why this is the last thing standing

WO8 added a refusal message telling `0.3` users that `<component>` and
`components/` are removed per [D-18]. **They are not.** `parse-component.ts:65`
still requires a `component` root element and `read-project.ts` still discovers
`components/[name]/[name].xml`, so a **0.4** project using `<component>` is
accepted today with no diagnostic at all.

A refusal message asserting something the code does not honour is worse than not
asserting it. This is a planning gap, not a worker error: the assessment's R2.1
said "merge the component schema into the widget manifest", WO5 and WO5b merged
the *types* exactly as asked, and removing the *vocabulary* was never written
down.

The destination already exists — `read-project.ts` discovers
`widgets/[name]/[name].xml` today, and `WidgetManifest` has carried an optional
`view` since WO5b. You are removing the old road, not building a new one.

## Line-Item Instructions

### 1. Remove the vocabulary

- [ ] `read-project.ts` stops discovering `components/`.
- [ ] The `<component>` root element is no longer accepted. Whether
      `parse-component.ts` disappears into the widget-manifest parser or survives
      as a thin entry point is your call — say which and why. A composite is a
      `<widget>` with a `<view>`; that is one parse path, not two.
- [ ] Move the repository's own component fixtures to `widgets/`, converted to
      `<widget>` roots. They are the only such files in existence.

### 2. Make the removal diagnosable, never silent

This is the part that matters most, and the easiest to get wrong by simply
deleting code.

- [ ] **If a `components/` directory exists, that is a hard error** naming the
      migration — not a silently ignored directory. Someone who moves to 0.4 with
      their old layout must be told, not left wondering why their composites
      vanished. §15.4 requires breaking changes to be diagnosable.
- [ ] **A `<component>` root element is a hard error** with the same migration
      message.
- [ ] Both diagnostics must name the specific fix: move `components/x/` to
      `widgets/x/`, change the root element to `<widget>`, and give it a `<view>`.
- [ ] Tests must assert on **message content**, not just the diagnostic code. WO8
      set that precedent for exactly this reason: a test checking only the code
      passes against the obscure failure the message exists to prevent.

### 3. Pay down the surfaced debt

All four came from the readability review or WO8, and all are small:

- [ ] **`parse-widget-tree.ts`** — stale header comment describing the "Tier 1–4"
      model [D-18] removed. Rewrite it to describe what the file does now. Graded
      P2 by the review; a header that describes a deleted design actively misleads.
- [ ] **`u8g2gl_label.h`** — a struct-layout comment justified by its own
      arithmetic rather than a measured `sizeof`. Verify against the real measured
      figure (80 bytes on a 64-bit host) and correct it, or delete the claim. P3.
- [ ] **`cli.ts:413`** — dead `schema: '0.3'` default, always overwritten. Remove
      it; a stale version literal in the code is a trap now that 0.4 is current.
- [ ] **`cli/package-lock.json`** — root version stale at `0.3.0`. Regenerate or
      correct so it matches `package.json`.

## Strict Boundary Box

**In scope:** `cli/src/node/read-project.ts`, `cli/src/core/parser/parse-component.ts`
and the widget-manifest parser, `cli/src/node/cli.ts`, `cli/package-lock.json`,
`cli/src/core/parser/parse-widget-tree.ts` (header comment only),
`include/u8g2gl/u8g2gl_label.h` (the layout comment only), the affected fixtures
and tests, this WORKORDER.

**Do NOT touch:** anything WO1–WO8 delivered, beyond the four debt items named
above. The schema version, the refusal-message wording for the *other* five
migrations, the validator behaviour, the C++ runtime beyond that one comment. If
you find something else broken, **report it** — this is the last work order in the
PR and a repair hidden here is invisible in review.

---

## Testing Requirement

- [ ] A project with a `components/` directory is a hard error naming the fix
- [ ] A `<component>` root element is a hard error naming the fix
- [ ] Both assert on message content
- [ ] A composite authored as `<widget>` with a `<view>` in `widgets/` parses,
      validates and behaves exactly as the old form did — this is the proof the
      capability moved rather than being deleted
- [ ] No test anywhere still authors a `<component>`

## Verification Requirement

- [ ] `cd cli && npx vitest run` — all pass, none weakened or removed
- [ ] `npx tsc --noEmit` and `npm run lint` — zero errors
- [ ] `cmake --build build` — zero warnings; `ctest --test-dir build` — all pass
- [ ] `grep -rn "component" cli/src` returns only prose and diagnostic strings —
      no live parsing or discovery. State what you found.
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file an issue. The architect triages and files.

---

## Completion Report

<!-- Written by the worker at task completion -->
