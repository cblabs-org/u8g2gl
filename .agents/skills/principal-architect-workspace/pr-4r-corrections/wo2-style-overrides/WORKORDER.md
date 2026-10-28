---
work_order: WO2
project: pr-4r-corrections
title: "Inline style_* overrides are restricted to §10's nine properties"
branch: u8g2gl-4r/wo2-style-overrides
base: main @ ca398ac
complexity: standard
status: complete
---

# WO2 — inline `style_*` restricted to §10's nine

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR with a timestamp, and its mandate lists item 2. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in the worktree `.`**, never in
`.`. PR-04b may be running in parallel in another tree.

**Branch**: `u8g2gl-4r/wo2-style-overrides` (already checked out) · **Base**: `main` @ `ca398ac`

Run `git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer, and uncommitted
work strands. Do not push, tag, publish or open a PR.

## Standards

Load the `u8g2gl-standards` skill first; `references/typescript.md` and `references/documentation.md`.
§4: element knowledge is data ([D-17]), and **a table two layers share lives in neither**. WO1 just
moved `STYLE_PROPERTIES` and friends to `cli/src/core/schema/`; the layering test
(`cli/test/architecture/layering.test.ts`) must stay green.

---

## Objective

`style_<name>` is accepted only when `<name>` is one of §10's nine style properties **and** the
element has a setter for it. `style_text="x"` is refused, with a message naming what is allowed.

## Design authority

design_spec §10, now normative: *"Inline overrides are restricted to the nine properties in the
table above: `style_` tells a reader 'this is styling', and a general per-element override of any
property that happens to have a setter is a different feature, which §1.5 says waits for a
demonstrated need."* The nine: `font`, `draw_color`, `invert`, `padding`, `border`, `radius`,
`align`, `font_mode`, `bitmap_mode`. They are `STYLE_PROPERTIES`' `attribute` values in
`schema/globals.ts`. Use that list; do not write a tenth copy of it.

## Background

Two places decide whether an override applies, and today both accept any prop with a setter:

1. **The validator.** `checkStyles()` step 2 in `cli/src/core/validator/validate-widget-props.ts`
   looks up `manifest.api.props` for a prop of that name with a `setter`.
2. **Emission.** `styleOverridesOf()` in `cli/src/core/generator/emit/screen-model.ts` applies
   every override naming a setter prop. `screen.ts` reports what is left over (`unknown`), and
   `scene.ts` (the editor target) takes `applied`.

If only the validator changes, the two disagree, and the editor and firmware targets could apply
something the validator refused. **One predicate, used by both.**

## Line-Item Instructions

- [x] **Measure the baseline** in this worktree, each suite alone. Expected at `ca398ac`: CLI **1059 /
      63 files**, tsc and lint clean; C++ 0 warnings, ctest **362, one known skip**.
- [x] **State the rule once**, in `schema/` beside `STYLE_PROPERTIES`: a predicate or set, e.g.
      "is this a §10 style attribute", derived from `STYLE_PROPERTIES[].attribute`. **Canonical
      snake_case only**: the camelCase `aliases` (`drawColor`, …) are spellings `<style>`
      accepts and are **not** extended to `style_*`. `style_drawColor` stays refused, as it is
      today, because no prop is named `drawColor`.
- [x] **Validator:** `checkStyles()` refuses an override whose name is not one of the nine, even
      when the element has a setter for it. Use the existing `UNKNOWN_ATTRIBUTE` code, the one this
      path already uses, so there is no new diagnostic code. The message names the attribute and the
      element, says inline overrides are limited to §10's style properties, **and lists the
      nine**. Suggestions (`findClosest`) are drawn from those of the nine the element can
      actually take. The existing refusal, for a name that is a style property but that the
      element has no setter for, keeps its message.
- [x] **Emission:** `styleOverridesOf()` applies only overrides that pass the same rule. Anything
      else lands in `unknown`, so firmware and editor can never apply what the validator refused.
- [x] **Tests:**
  - each of the nine is accepted on an element that sets it (a table-driven test over
    `STYLE_PROPERTIES`, not nine hand-written cases), validated **and** generated;
  - `style_text="x"` on a `u8g2gl_label` is refused with `UNKNOWN_ATTRIBUTE`, and the message
    contains all nine names;
  - one more non-§10 setter prop (your choice, e.g. `style_long_mode`) is refused;
  - `styleOverridesOf()` puts a non-§10 key in `unknown` and never in `applied`.
  Show the new tests fail at the base, and say how many fail **behaviourally** rather than because
  something is missing.
- [x] **Existing tests keep their assertions.** The PA checked on 2026-09-28: no fixture or test
      writes a non-§10 `style_*` except `style_sparkle`, which is already refused. If an existing
      assertion must change, stop and report.
- [x] Run the **built CLI** on a small project containing `style_text` and show the refusal as an
      author sees it, text and `--json`.

## Strict Boundary Box

**In scope:** `cli/src/core/schema/globals.ts` (the predicate), `cli/src/core/validator/validate-widget-props.ts`,
`cli/src/core/generator/emit/screen-model.ts` (`styleOverridesOf` only), `cli/test/` (new tests),
this WORKORDER's checkboxes and Completion Report.

**Do NOT touch:** runtime C++; `emit/fonts.ts`, `images.ts`, `xbm.ts` (PR-04b); `emit/draw-args.ts`
(WO4); any schema **surface** (no new attribute or element); `docs/`; `PROGRAM*.md`; `PROJECT.md`;
versions. No bump here: the PR's CLI bump to 0.8.0 is WO4's. Goldens must not move, because no
committed fixture uses a non-§10 override.

---

## Testing Requirement

- [x] The tests above, failing at the base
- [x] Layering test still green

## Verification Requirement

- [x] CLI `npx vitest run`, `npx tsc --noEmit`, `npm run lint`; C++ `cmake --build build` zero
      warnings, `ctest` all pass. Each suite alone
- [x] Goldens unchanged
- [x] `git diff --name-only main..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: complete.** Implementation commit `576fb7a`, on `u8g2gl-4r/wo2-style-overrides`.
Not pushed.

### Counts, each suite alone

| Suite | Base (`fa3f5d4`, = `ca398ac` + PA docs) | After `576fb7a` |
|---|---|---|
| CLI `npx vitest run` | **1059 / 63 files** | **1079 / 64 files** (+20, one new file) |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + `tsconfig.test.json`) | clean | clean |
| C++ `cmake --build build` | 0 warnings | 0 warnings |
| `ctest` | **362, one known skip** (`SizeOfReport.ThirtyTwoBitTarget`) | **362, one known skip** |

Layering test green; `emit-golden.test.ts` green and no fixture or expected file touched.

### Where the rule lives

`cli/src/core/schema/globals.ts`, beside `STYLE_PROPERTIES`:

- `STYLE_ATTRIBUTES` — `STYLE_PROPERTIES.map((p) => p.attribute)`, table order, so a message
  listing them is deterministic. Not a tenth copy: derived.
- `isStyleAttribute(name)` — the one predicate. Canonical snake_case only; `aliases` are not
  consulted, so `style_drawColor` stays refused (pinned by a test).

Used by:

- **Validator**, `validate-widget-props.ts` `checkStyles()` Step 2: a non-§10 name is refused
  before the setter lookup, with `UNKNOWN_ATTRIBUTE`. Suggestions (`findClosest`) are drawn from
  those of the nine the element has setters for. The existing refusal (a §10 name the element
  has no setter for) keeps its message; its suggestions now come from the same nine-only pool,
  since suggesting e.g. `style_hidden` would suggest another refusal.
- **Emission**, `screen-model.ts` `styleOverridesOf()`: applies only overrides passing
  `isStyleAttribute`; everything else lands in `unknown`. `screen.ts` (firmware) reports
  `unknown`; `scene.ts` (editor) takes only `applied`.

Two further uses in the validator, both reading overrides, so the one rule holds everywhere an
override is treated as applied (disclosed; same file, in scope):

- `missingRequired()`: a non-§10 override no longer satisfies a required prop. Before,
  `<u8g2gl_glyph ... style_glyph="65">` with no `glyph` validated and emitted `set_glyph`. Now
  it is `UNKNOWN_ATTRIBUTE` on `style_glyph` **and** `MISSING_REQUIRED` on `glyph`, identical in
  both journeys, which is accurate: nothing supplies `glyph`.
- `checkSubstitutedValues()`: a non-§10 override's substituted `$prop` value is not re-checked
  as a style value, so a refused `style_long_mode="$m"` in a composite view is not reported a
  second time as a `TYPE_MISMATCH`.

`StyleOverrides`' two field doc comments (the return type of `styleOverridesOf`) were updated,
since they described the old rule; nothing else in `screen-model.ts` changed.

### The refusal as an author sees it

Built CLI (`npm run build`, `node dist/node/cli.js`) on `tmp/wo2-demo`, a one-label project
with `style_text="x"`:

```
error: screens/screen_home.xml:4:60
   'style_text' on <u8g2gl_label> 'title' is not a style override: inline overrides are limited to §10's style properties, font, draw_color, invert, padding, border, radius, align, font_mode, bitmap_mode. Write it as the attribute 'text' instead.
   |
 4 |                       font="u8g2_font_6x10_mr" style_text="x" />
   |                                                            ^^^^^^^^^^
   = did you mean 'style_font'?

Validation failed: 1 error(s), 0 warning(s).
```

`validate --json`:

```json
{
  "code": "U8G2GL_UNKNOWN_ATTRIBUTE",
  "severity": "error",
  "file": "screens/screen_home.xml",
  "line": 4,
  "column": 60,
  "message": "'style_text' on <u8g2gl_label> 'title' is not a style override: inline overrides are limited to §10's style properties, font, draw_color, invert, padding, border, radius, align, font_mode, bitmap_mode. Write it as the attribute 'text' instead.",
  "offendingText": "style_text",
  "suggestions": ["style_font"]
}
```

`generate` refuses with the same diagnostic and writes nothing. The "Write it as the attribute"
sentence appears only when the element declares a prop of that name (so not for `style_sparkle`).

### New tests, and the base

`cli/test/validator/style-override-restriction.test.ts`, 20 tests:

- the rule: `STYLE_ATTRIBUTES` equals `STYLE_PROPERTIES`' attributes (9); aliases refused;
  `text`, `long_mode`, `hidden` refused (3);
- **each of the nine accepted** on `u8g2gl_label`, table-driven over `STYLE_PROPERTIES` with
  the value drawn from the label manifest's prop type — validated with no error, generated
  with no error, firmware unit contains `.<setter>(`, editor scene lists the override (9);
- `style_text="x"` refused, `UNKNOWN_ATTRIBUTE`, both journeys agree, no files, message contains
  `§10` and all nine (1); `style_long_mode="dots"` and `style_hidden="true"` refused (2);
  suggestions only from the nine (1); `style_drawColor` stays refused (1); a refused override
  does not satisfy `required` (1);
- `styleOverridesOf`: `{text, align, long_mode}` → applied `[align]`, unknown
  `[long_mode, text]` (1); an undeclared key still in `unknown` (1).

Run against the base sources (the three `src` files restored from `HEAD` before the commit,
this test file unchanged, then restored): **9 fail, 11 pass.**

- **6 fail behaviourally**: `style_text`, `style_long_mode`, `style_hidden` each validate with
  no error; the suggestions test gets no diagnostic; `style_glyph` satisfies `required` with no
  error; `styleOverridesOf` returns `applied = [align, text, long_mode]`.
- **3 fail because the export is missing** (`STYLE_ATTRIBUTES` undefined, `isStyleAttribute is
  not a function`).
- The 11 that pass at the base are controls, correctly: the nine accepted cases (the base
  already accepted them), `style_drawColor` (already refused — no prop has that name) and the
  undeclared-key case.

### Existing tests

No existing test or assertion changed. `style_sparkle` now takes the new path (it is not one of
the nine) and gets the new message; both tests of it assert the code and offending text only,
which are unchanged.

### Boundary

`git diff --name-only fa3f5d4..576fb7a`: `schema/globals.ts`, `validator/validate-widget-props.ts`,
`generator/emit/screen-model.ts`, `test/validator/style-override-restriction.test.ts`.
`main..HEAD` additionally lists `PROJECT.md` and this WORKORDER — the PA's dispatch commit
`fa3f5d4`, plus this report. No version bump, no C++, no docs, no goldens.

### Findings (out of scope, not fixed)

1. **`screen.ts`'s `unknown` message is now inaccurate for a non-§10 setter prop.** It says the
   element "does not declare [it] as a property, so there is no setter". For `style_text` on a
   label both halves are false. Unreachable through the CLI today, because Pass 4 refuses first
   and `generate` stops, but it is the message a caller of emission alone would see. It could
   reuse the validator's wording, or the emitter could split `unknown` by reason. `screen.ts`
   is outside this WO's box.
2. **`style_text` suggests `style_font`.** `findClosest` over the nine finds `font` within its
   edit-distance limit of `text`. Honest by the rule, but not helpful; the remedy sentence
   ("Write it as the attribute 'text'") is the real fix here. If suggestions are meant to be
   machine-applied ([D-16]), a caller applying the first suggestion would change what the
   author meant. Consider offering the bare attribute as a suggestion when the element
   declares it — that is a change to what a suggestion may contain, so the PA's call.
3. **Step 1 of `checkStyles` checks only named styles on a drawing element**; a `style_*`
   override on one is refused by Step 2 instead, because a drawing element's props have no
   `setter`. Correct outcome, but by a different route with a message about setters rather than
   §13.5's "no object". Pre-existing, unchanged.

