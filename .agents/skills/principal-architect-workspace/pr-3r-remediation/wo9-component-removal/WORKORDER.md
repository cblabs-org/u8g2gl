---
work_order: WO9
project: pr-3r-remediation
title: "Remove the component vocabulary and pay down the remaining debt"
branch: u8g2gl-remediation/wo9-component-removal
base: u8g2gl-remediation/wo8-schema-04
complexity: standard
status: complete
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

- [x] `read-project.ts` stops discovering `components/`.
- [x] The `<component>` root element is no longer accepted. Whether
      `parse-component.ts` disappears into the widget-manifest parser or survives
      as a thin entry point is your call — say which and why. A composite is a
      `<widget>` with a `<view>`; that is one parse path, not two.
- [x] Move the repository's own component fixtures to `widgets/`, converted to
      `<widget>` roots. They are the only such files in existence.

### 2. Make the removal diagnosable, never silent

This is the part that matters most, and the easiest to get wrong by simply
deleting code.

- [x] **If a `components/` directory exists, that is a hard error** naming the
      migration — not a silently ignored directory. Someone who moves to 0.4 with
      their old layout must be told, not left wondering why their composites
      vanished. §15.4 requires breaking changes to be diagnosable.
- [x] **A `<component>` root element is a hard error** with the same migration
      message.
- [x] Both diagnostics must name the specific fix: move `components/x/` to
      `widgets/x/`, change the root element to `<widget>`, and give it a `<view>`.
- [x] Tests must assert on **message content**, not just the diagnostic code. WO8
      set that precedent for exactly this reason: a test checking only the code
      passes against the obscure failure the message exists to prevent.

### 3. Pay down the surfaced debt

All four came from the readability review or WO8, and all are small:

- [x] **`parse-widget-tree.ts`** — stale header comment describing the "Tier 1–4"
      model [D-18] removed. Rewrite it to describe what the file does now. Graded
      P2 by the review; a header that describes a deleted design actively misleads.
- [x] **`u8g2gl_label.h`** — a struct-layout comment justified by its own
      arithmetic rather than a measured `sizeof`. Verify against the real measured
      figure (80 bytes on a 64-bit host) and correct it, or delete the claim. P3.
- [x] **`cli.ts:413`** — dead `schema: '0.3'` default, always overwritten. Remove
      it; a stale version literal in the code is a trap now that 0.4 is current.
- [x] **`cli/package-lock.json`** — root version stale at `0.3.0`. Regenerate or
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

- [x] A project with a `components/` directory is a hard error naming the fix
- [x] A `<component>` root element is a hard error naming the fix
- [x] Both assert on message content
- [x] A composite authored as `<widget>` with a `<view>` in `widgets/` parses,
      validates and behaves exactly as the old form did — this is the proof the
      capability moved rather than being deleted
- [x] No test anywhere still authors a `<component>`

## Verification Requirement

- [x] `cd cli && npx vitest run` — all pass, none weakened or removed
- [x] `npx tsc --noEmit` and `npm run lint` — zero errors
- [x] `cmake --build build` — zero warnings; `ctest --test-dir build` — all pass
- [x] `grep -rn "component" cli/src` returns only prose and diagnostic strings —
      no live parsing or discovery. State what you found.
- [x] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file an issue. The architect triages and files.

---

## Completion Report

**Status: complete.** `a184253` (vocabulary removal) then `f8be430` (three of
the four debt items) on `u8g2gl-remediation/wo9-component-removal`, base
`u8g2gl-remediation/wo8-schema-04`. Boundary respected: `git diff` against the
base touches only files named in the Strict Boundary Box, plus the fixtures
and tests it authorizes.

### What changed

**The vocabulary is gone, not just the claim about it.** `parse-component.ts`
is deleted; its logic — `<view>` parsing, focus-ring extraction, prop
handling — is folded into `parse-widget-manifest.ts`, per the WORKORDER's own
framing: a composite is one parse path, distinguished from a plain widget only
by an optional `<view>` child on the same `<widget>` root, not by a second tag
or a second function. `extends` is left `undefined` when a `<view>` is
present (a composite has no C++ class of its own); a plain widget keeps its
`'u8g2gl_obj'` default exactly as before.

`read-project.ts` no longer discovers `components/` at all — the
`componentXmls` field is gone from `ProjectFiles`. `cli.ts` now parses every
`widgets/*/[name].xml` file through the one `parseWidgetManifestFile`, and a
new `bucketWidgetManifest()` helper sorts each result into the `components` or
`widgetManifests` array the validator already expects, keyed on whether
`.view` is present. **No validator file was touched** — `validate.ts`,
`validate-schema.ts`, `validate-references.ts`, `validate-identifiers.ts`,
`validate-widget-props.ts`, `validate-geometry.ts` are all byte-identical to
WO8; they still receive `components`/`widgetManifests` in the same shape they
always have, just populated by one parser instead of two.

**Both removals are now a named hard error**, not a silent no-op:

- A `components/` directory throws from `readProjectFiles`, mirroring the
  existing "missing `u8g2gl.xml`" precedent in the same file.
- A `<component>` root is a `U8G2GL_MALFORMED_XML` diagnostic raised inside
  `parseWidgetManifest` itself — reached from both directory mode (a stray
  `<component>`-rooted file under `widgets/`) and single-file mode (`cli.ts`
  now routes `rootTag === 'component'` to `parseWidgetManifestFile` instead of
  matching nothing).

Both messages are built from one shared string,
`COMPONENT_REMOVED_MIGRATION` (exported from `parse-widget-manifest.ts`), so
an author who hits either one reads the same instruction:

> `components/` directory: `"The 'components/' directory is removed: move
> 'components/x/' to 'widgets/x/', change its root element to '<widget>', and
> give it a '<view>' ([D-18])."`
>
> `<component>` root: `"'<component>' is removed: move 'components/x/' to
> 'widgets/x/', change its root element to '<widget>', and give it a '<view>'
> ([D-18])."`

**The proof that this is a migration, not a deletion:** the repository's own
`status_bar` composite fixture (three, one per fixture directory) was moved
from `components/status_bar/` to `widgets/status_bar/` and its root changed
from `<component>` to `<widget>` with no other edit — same `<api>`, same
`<view>`, same children. It parses, validates, and drives the same
`u8g2gl_label`/`u8g2gl_xbm`/`u8g2gl_clock` view tree it always did
(`test/validator/validate.test.ts`'s "0 errors, 0 warnings" fixture test, and
the CLI integration test against `valid-project/`, both green).

**Deliberately not carried forward:** the old `<component>` parser inferred a
missing `name` from the file path (`components/weather_badge/weather_badge.xml`
→ `weather_badge`). A `<widget>` root has always required `name` explicitly,
with no equivalent fixture in `parse-widget-manifest.test.ts`. One vocabulary
means one rule, and no fixture in this repository relied on the inference
(PROJECT.md: "No user XML exists outside this repository's fixtures"), so I
dropped it rather than carrying an inconsistency into the merged parser. Noted
here per the boundary box rather than silently decided.

### The four debt items

1. **`parse-widget-tree.ts` header** — rewritten to describe the current
   one-vocabulary model instead of the deleted Tier 1–4 split.
2. **`u8g2gl_label.h` struct-layout comment** — measured
   `sizeof(u8g2gl_label)` on this host: **80 bytes**, matching the figure
   already corrected in `docs/decisions/d19-label-long-mode.md`. Recorded the
   measurement in the comment rather than leaving the padding-order rationale
   unverified against a real build.
3. **`cli.ts:413` dead `schema: '0.3'` default** — replaced with `''`; it was
   always overwritten by a successful parse, and a literal version string
   sitting in a fallback object is exactly the trap §03-versioning.md warns
   about.
4. **`cli/package-lock.json`** — regenerated with
   `npm install --package-lock-only` (offline, no dependency changes); it
   picked up only the two stale `0.3.0` version fields, now `0.6.0` to match
   `package.json`.

### Verification

- `cd cli && npx vitest run` — **266 / 266 pass** (unchanged in aggregate from
  WO8's tally; composition shifted because the removed `<component>`-authoring
  tests were replaced 1:1 or folded, and `read-project.test.ts` gained the new
  hard-error case — see below).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `cmake --build build` — zero warnings. `ctest --test-dir build` —
  **240 / 240 pass** (one host-only skip, `SizeOfReport.ThirtyTwoBitTarget`,
  pre-existing and unrelated). C++ was touched only by the label.h comment, so
  this count is unchanged from WO8.
- `grep -rn "component" cli/src` — every remaining hit is either prose in a
  doc-comment (parser/index.ts, parse-widget-manifest.ts, fix-names.ts,
  read-project.ts, cli.ts, parse-widget-tree.ts explaining the removal or the
  history), a diagnostic message string, or the validator layer's own
  internal naming for the composite concept (`ValidateInput.components`,
  `componentMap`, `isComponent`, and their diagnostic text in
  validate-schema.ts / validate-references.ts / validate-identifiers.ts /
  validate-widget-props.ts / validate-geometry.ts / validate.ts) — untouched,
  as the boundary box requires. **No hit is a live parser accepting a
  `<component>` root or a discovery routine walking a `components/`
  directory** — both of those now only ever produce the hard error.
- `git diff` against the WO8 base touches only: `read-project.ts`,
  `parse-component.ts` (deleted) and `parse-widget-manifest.ts`, `cli.ts`,
  `fix-names.ts`, `parser/index.ts`, `package-lock.json`,
  `parse-widget-tree.ts` (header only), `u8g2gl_label.h` (layout comment
  only), and fixtures/tests.

### Judgement calls disclosed

- **`parse-component.ts` disappears rather than surviving as a thin entry
  point.** Its only callers were `cli.ts`, `fix-names.ts`, and this repo's own
  tests — no designer package or external consumer imports it (checked: no
  workspace outside `cli/` references `parseComponentFile`). Folding it in
  keeps [D-18]'s "one parse path" literally true instead of true in spirit
  with a redirect left behind.
- **`fix-names.ts` was not named in the Strict Boundary Box but had to
  change** — it called `parseComponentFile` and read `projectFiles.componentXmls`
  directly, both removed. This is the same class of forced, disclosed fix
  WO5b hit with three files `tsc` found beyond its named boundary: mechanical,
  required to compile, not a new decision. It now dispatches a `<widget>`
  root to `parseWidgetManifestFile` (which costs nothing extra for a plain
  widget, since `computeNameEdits` only produces edits when a `<view>` was
  actually parsed).
- **The `<component>`-root hard error reuses the existing `MALFORMED_XML`
  code** rather than minting a new diagnostic code, distinguished only by
  message content (the WORKORDER's own testing requirement: assert on message
  content, not code). This matches how every other "wrong root tag" case in
  this parser is already coded, and a new code seemed unjustified for one
  more shape of the same underlying condition ("root tag doesn't match what
  this file expects").

### Surfaced, not fixed (per "do not repair anything else — report it")

Nothing new. No other defect was encountered while working this WORKORDER.
