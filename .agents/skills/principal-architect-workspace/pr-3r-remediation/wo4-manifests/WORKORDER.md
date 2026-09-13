---
work_order: WO4
project: pr-3r-remediation
title: "Manifests: animated out, draw= in"
branch: u8g2gl-remediation/wo4-manifests
base: wo3-draw-functions
complexity: standard
status: pending
---

# WO4 — Manifests: animated out, draw= in

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

**Branch**: `u8g2gl-remediation/wo4-manifests`
**Base**: `u8g2gl-remediation/wo3b-draw-testability`

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

Bring all 17 manifests to the [D-18] shape: `animated` removed, and the eight
primitives naming runtime draw functions rather than U8G2 methods.

## Background

`animated` existed solely to license static demotion. [D-18] replaces demotion
with the realisation rule — decided per instance by the generator — so a manifest
no longer declares whether its element animates. All 17 manifests carry the
attribute today.

Separately, both spellings are currently `setter=` while meaning two different
things: a U8G2 method on primitives (`drawBox`) and a runtime method on widgets.
[D-18] wants those distinguished, so primitives gain `draw=`.

## Line-Item Instructions

- [x] Remove `animated` from all 17 manifests in `include/u8g2gl/manifests/`.
- [x] For the eight primitives — `box`, `circle`, `ellipse`, `hline`, `line`,
      `pixel`, `triangle`, `vline` — replace `setter="drawX"` with
      `draw="u8g2gl_draw_x"`, naming the functions WO3 added. Verify each symbol
      exists; a manifest naming a function that does not compile is worse than
      the `setter=` it replaced.
- [x] Add `draw=` alongside `setter=` in `cli/src/core/schema/widget-manifest.ts`
      and drop `animated` from the type.
- [x] Update `cli/src/core/parser/parse-widget-manifest.ts` to read `draw=`.
- [x] **Surfaced by WO2:** `include/u8g2gl/manifests/u8g2gl_obj.xml` still
      declares the deleted `truncate` / `set_truncate`. Remove it. A manifest
      naming a setter that no longer exists is the same defect class as the
      `draw=` targets you are fixing.
- [x] Update `cli/test/manifests/manifest-crosstest.test.ts`, which asserts
      against the current shape and must move with it — the cross-test is the
      thing that makes this change safe, so it must end green and meaningful, not
      merely green.

## Strict Boundary Box

**In scope:** `include/u8g2gl/manifests/*.xml`, `widget-manifest.ts`,
`parse-widget-manifest.ts`, `manifest-crosstest.test.ts`, related parser tests
and fixtures, this WORKORDER.

**Do NOT touch:** the C++ draw functions (WO3 owns them), the validator (WO6),
the component schema (WO5).

---

## Testing Requirement

- [x] The cross-test verifies `draw=` targets resolve to real declarations in
      `u8g2gl_draw.h`, not merely that the attribute parses.
- [x] A manifest carrying `animated` is now a parse error or is ignored — pick
      one, implement it, and say which and why in your Completion Report.
- [x] All 17 manifests parse and cross-test clean.

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

**Status: complete.** Boundary respected exactly — the diff touches only
`include/u8g2gl/manifests/*.xml`, `widget-manifest.ts`,
`parse-widget-manifest.ts`, `manifest-crosstest.test.ts`, and two directly
related parser/schema tests (`test/parser/parse-widget-manifest.test.ts`,
`test/schema/types.test.ts`) that had to change because they asserted against
the field this WO removed. C++ 238 tests unchanged (nothing in the runtime was
touched — manifests are data, not compiled), zero warnings. CLI 220 → **239
tests**, `tsc --noEmit` and `eslint .` both clean.

**One correction to the WORKORDER's own premise:** it says "bring all 17
manifests" throughout. Only **16** exist in `include/u8g2gl/manifests/` — the
17th was `u8g2gl_scrolling_label.xml`, already deleted by WO2 per PROJECT.md's
own log. All 16 present manifests are updated; this is not a manifest left
behind, the count in the WORKORDER text is stale.

### What changed

- **`animated` removed from all 16 manifests.** The attribute is gone from
  every `<widget>` tag, matching [D-18]/§13.1 — realisation is now decided per
  instance by the generator, never declared by the manifest.
- **Eight primitives repointed at `draw=`.** `box`, `circle`, `ellipse`,
  `hline`, `line`, `pixel`, `triangle`, `vline` — every `<prop>` on these eight
  now carries `draw="u8g2gl_draw_<name>"` instead of `setter="drawX"`. Per
  design_spec §13.1/§6.2 this is a per-`<prop>` attribute (not one on
  `<widget>`), so every property of a primitive names the same free function;
  the function's own internal dispatch (e.g. `filled`/`radius` selecting
  `drawBox`/`drawRBox`/`drawFrame`/`drawRBox` inside `u8g2gl_draw_box`) is
  exactly why one property→one-function mapping is correct rather than the old
  per-property U8G2-method spelling.
- **`truncate`/`set_truncate` removed from `u8g2gl_obj.xml`.** Verified first
  that no C++ source still references `set_truncate` (WO2 already deleted it)
  — grepped `include/` and `src/` to confirm before touching the manifest.
- **`draw=` added to the TypeScript schema and parser.** `PropDef.setter` and
  the new `PropDef.draw` are both now optional — exactly one applies per
  [D-18]; a prop naming neither still defaults to `set_<name>` for backward
  compatibility with hand-authored widgets. `WidgetManifest.animated` is
  removed from the type entirely, and `parseWidgetManifest` no longer reads
  the widget-level `animated` attribute into the model.

### How I verified the `draw=` targets resolve

Two layers, deliberately not just "the attribute parses":

1. **Binary-level, following WO3b's own precedent.** `nm build/libu8g2gl.a |
   grep u8g2gl_draw_` shows all eight symbols as `T` (defined), none `U` —
   confirmed at the linker level, not by reading source.
2. **The cross-test now checks the real target, not just presence.**
   `manifest-crosstest.test.ts` parses `include/u8g2gl/u8g2gl_draw.h` itself
   with a regex (`declaredDrawFunctions()`) to build the set of actually
   declared free functions — not a hand-copied list, which would drift from
   the header the same way `TIER1_PRIMITIVES` drifted from the manifests. For
   every prop with a `draw=` value, the test asserts that value is a member of
   that set. A manifest naming `u8g2gl_draw_typo` would now fail the cross-test
   before it ever reached a linker. I added a self-check
   (`finds draw functions declared in u8g2gl_draw.h`) guarding against the
   extractor itself silently returning an empty set and making every `draw=`
   assertion vacuously pass — the same vacuous-suite failure mode the
   directory-resolution guard above it protects against.
   I also strengthened the "valid PropDefs" test to assert **exactly one** of
   `setter`/`draw` is present per prop (XOR), not merely that `setter` is
   truthy as the old assertion required — that old assertion would have
   *failed* for all eight primitives the moment I removed their `setter=`, so
   this was mechanically required, not optional polish.

### Lingering `animated`: ignored, not a parse error

**Decision: ignored.** A manifest still carrying the widget-level `animated`
attribute parses cleanly with zero diagnostics; the attribute is simply not
read into the `WidgetManifest` model (there is nowhere left to put it — the
field is gone from the type).

**Why, not parse error:** four fixture files outside this WO's boundary box
still carry `animated="false")` on a `u8g2gl_label.xml` —
`cli/test/validator/fixtures/{valid,invalid}/widgets/u8g2gl_label/` and
`cli/test/integration/fixtures/{valid-project,broken-project}/widgets/u8g2gl_label/`
— owned by the validator (WO6) and integration-test surfaces, not this WO. If
lingering `animated` were a parse error, every one of those fixtures would
start failing the moment this WO landed, for a reason entirely outside their
own test's concern. "Ignored" makes this WO's change land without forcing a
simultaneous edit to four files in someone else's boundary box, and matches
how the parser already treats every other unrecognised attribute (it never
diagnoses unknown attributes on `<widget>` or `<prop>`, only unknown *child
elements*) — so this is consistent with existing behaviour, not a new
exception invented for this case. I added a same-decision regression test in
`test/parser/parse-widget-manifest.test.ts` and a raw-text guard in
`manifest-crosstest.test.ts` (`should carry no [D-18] fossil animated
attribute`) that fails if any of the 16 *shipped* manifests regains the
attribute — so the "gone from the real manifests" half of [D-18] is still
enforced, just not as a parser-level rejection of any XML that happens to
mention the word.

### Verification

- `cmake --build build` — zero warnings, nothing rebuilt (manifests are not
  compiled; no C++ file was touched).
- `ctest --test-dir build` — **238/238 passed**, unchanged from WO3b.
- `cd cli && npx vitest run` — **239/239 passed** (220 → 239; +19: manifest
  cross-test gained a directory/extractor self-check plus a per-file
  "no animated fossil" and strengthened PropDef check across 16 files, parser
  test gained the ignored-attribute regression test and a `draw=`-parsing
  test, schema test gained one `PropDef` literal exercising `draw=`).
- `cd cli && npx tsc --noEmit && npm run lint` — zero errors, zero warnings.
- `git diff --stat` — touches only the 16 manifests, the two schema/parser
  source files, and three directly related test files. No files outside the
  Boundary Box.
- `git branch --show-current` — `u8g2gl-remediation/wo4-manifests`, verified
  as its own command immediately before this commit.

### Surfaced, not fixed (outside this WO's boundary)

1. **`validate-schema.ts` line ~480 will misfire on the real primitive
   manifests.** `if (!prop.setter) { … 'Missing required attribute setter' … }`
   has no corresponding branch for `draw=`. No current test feeds the real
   `include/u8g2gl/manifests/*.xml` primitives through `validateSchema` (I
   checked every `widgetManifests:` fixture in `cli/test/validator/*.test.ts`
   and none references box/circle/ellipse/hline/line/pixel/triangle/vline), so
   nothing is red today — but the first time WO6 (or a real project) validates
   one of the eight primitives through the full pipeline, every `draw=` prop
   will report a spurious "missing setter" error. This is squarely WO6's file
   under the Boundary Box's "Do NOT touch" list, so I did not touch it; WO6
   needs `if (!prop.setter && !prop.draw)` (or equivalent) before it lands.
2. **`cli/test/schema/types.test.ts` still references the deleted
   `u8g2gl_scrolling_label` tag** (line ~354, Component types test) — stale
   since WO2 deleted that widget. It's a literal string in a test fixture object
   for the *component* schema (`component.ts`), which is WO5's territory, not
   this WO's `widget-manifest.ts`/parser boundary, so left alone.
3. **Manifest count in this WORKORDER's own prose says 17; only 16 exist**
   (see above) — cosmetic, but worth the architect updating the WORKORDER
   template/count for the next reader rather than leaving a number that no
   longer matches the repository.

None of the three above were fixed here; all are reported for the architect to
triage.
