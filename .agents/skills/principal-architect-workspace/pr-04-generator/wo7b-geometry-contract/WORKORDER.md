---
work_order: WO7b
project: pr-04-generator
title: "The geometry contract: validate the expanded tree against design_spec §7.2 and §13.2"
branch: u8g2gl-generator/wo7b-geometry-contract
base: u8g2gl-generator/wo4c-real-u8g2
complexity: standard
status: complete
---

# WO7b — The geometry contract

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO7b as
approved** under "Rulings on WO4c and WO7b"; and that this WORKORDER's `status` is
`dispatched`. If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo7b-geometry-contract`
**Base**: `u8g2gl-generator/wo4c-real-u8g2`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element knowledge
is data, never code: "rectangular element" is read from the effective manifest, never a
tag list.

## Design authority

design_spec **§7.2 and §13.2 on `main` @ `5f2574f`** — the geometry contract is now
normative there; this branch is rebased onto it. [D-7], [D-20]. **"Stop and report" means
record it, do not choose, continue with the remaining items.**

---

## Objective

Every check that only means something after composites expand runs once, on the expanded
tree, and the §7.2 contract holds: nothing reaches emission with an absent, wrapped or
guessed coordinate.

## Line-Item Instructions — §7.2 and §13.2 (normative)

- [x] **Anchors only on rectangular elements.** `right`, `bottom`, `hcenter`, `vcenter` are
      valid only where the effective manifest declares `x`, `y`, `width` and `height`.
      Elsewhere (circle, ellipse, pixel, line, triangle) they are an error naming the
      element and the anchor.
- [x] **Every element fully positioned.** After expansion, an element whose manifest
      declares geometry and whose `x` or `y` (or size, where required) cannot be resolved —
      under-determined (`width` with no `x`), a `$prop` that never substitutes, a `#parent_*`
      with no parent size, a constant that never resolves — is a validation error, never a
      silent zero or absence.
- [x] **`hcenter`/`vcenter` are strict booleans.** Anything but `true`/`false` is an error.
- [x] **Reserved constant names.** `screen_width`, `screen_height`, `parent_width`,
      `parent_height` cannot be declared as user constants; declaring one is an error at the
      declaration.
- [x] **Constants validated where declared.** An `<int>` constant with a non-integer value
      is an error at its declaration, not only where used.
- [x] **Bounds for the target being generated.** `generate --target <name>` checks bounds
      against that target; `validate` keeps its current target behaviour and says in its
      output which target it checked.
- [x] **Coordinates fit `int16_t` (§13.2).** A resolved coordinate outside
      `int16_t` is a validation error, separate from — and before — the container bounds
      check. Other `int` properties keep the `int32_t` check.

## Line-Item Instructions — carried from WO6 and WO7

- [x] **Substituted arguments are checked (WO7 F4/F5).** After `$prop` substitution, a
      font, image, style or enum value passed into a composite is checked exactly as it
      would be if written directly: `font="nope"` passed to a composite fails.
- [x] **`hidden="$p"` substitutes (WO7 F6).** The parser converts `hidden` to a boolean
      before expansion sees it, so a `$prop` there is lost. Keep a `$`-placeholder as text
      until expansion, then apply the boolean rule to the substituted value.
- [x] **[D-20] bound-geometry rule on the expanded tree (WO7 F7).** The
      anchored-child-of-a-geometry-bound-container check walks unexpanded trees and misses
      nested composites. Run it on the expanded tree.
- [x] **Interpolated `$prop` is an error (WO7 F9, interim).** A `$name` inside longer text
      (`text="Hi $who"`) is not substituted and would reach output literally. Until the
      Chief Architect rules, report it as an error naming the prop, rather than passing it
      through.
- [x] **`required` with `default` (WO7 F10).** A prop declared both `required="true"` and
      with a `default` is a schema error at the declaration.
- [x] **Once, not twice.** Each check above runs on the template **or** the expanded tree,
      never both — say which for each, and test that a template defect is reported once.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/`, `cli/src/core/resolver/`,
`cli/src/core/parser/` (the `hidden` placeholder only), `cli/src/core/generator/`
(target-specific bounds only), `cli/src/node/cli.ts` (which target `validate` reports
only), `schema/diagnostic.ts`, `cli/test/`, this WORKORDER.

**Do NOT touch:** runtime C++; manifests; realisation, capacities or emission (WO8+);
mangling wiring and expand-once/resolve-once (WO8); `docs/`.

---

## Testing Requirement

- [x] One failing-then-passing test per line item, each asserting the diagnostic code and
      the named element or declaration.
- [x] A template defect inside a composite instantiated twice is reported once.
- [x] A 128-wide and a 256-wide target produce different bounds results for the same
      screen under `generate --target`.

## Verification Requirement

- [x] CLI tests, `tsc`, lint clean; C++ suite unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-15. **Code commit:** `9970859` on
`u8g2gl-generator/wo7b-geometry-contract`, not pushed. **Status `complete`.**

### Authorization

Checked from committed files, not the dispatch prompt:
- Front matter: `project: pr-04-generator`, `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the twelve
  work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- `../PROJECT.md` "Rulings on WO4c and WO7b" item 2: "**WO7b — APPROVED.**"
- The status log records "WO7b dispatched on `u8g2gl-generator/wo7b-geometry-contract`".

Nothing missing or inconsistent.

### Test counts

| Suite | Before (`e05fc8d`) | After (`9970859`) |
|---|---|---|
| `npx vitest run` | 602, 42 files | **641**, 43 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | 0 (no C++ touched) |
| `ctest --test-dir build` | 305, 1 known skip | 305, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

New tests: `test/validator/geometry-contract.test.ts` (37), plus one each in
`test/integration/generate.test.ts` and `test/integration/cli.test.ts`.

**Run against the base.** I made a throwaway worktree at `e05fc8d` under `tmp/`, copied in
the three test files, and ran them there. **31 of 71 fail.**
- `geometry-contract.test.ts`: 29 of 37 fail. The 8 that pass on both commits are the
  controls:
  - a clean label;
  - an anchor on a rectangular element;
  - an unknown constant reported once;
  - a representable value outside its container;
  - an int32 overflow;
  - a declared font passing;
  - an argument not repeated at its use;
  - a nested [D-20] pair.
- Both new integration tests fail. The 32 existing integration tests pass there.

The worktree is removed.

### Per line item

**New codes:** `U8G2GL_INAPPLICABLE_ANCHOR`, `U8G2GL_UNRESOLVED_GEOMETRY`,
`U8G2GL_COORDINATE_OUT_OF_RANGE`, `U8G2GL_UNSUBSTITUTED_PROP`.

| Item | Code | Where it runs | Template or expanded |
|---|---|---|---|
| Anchors only on rectangular elements | `INAPPLICABLE_ANCHOR` | Pass 4, `checkInstanceProps` Step 4b | **Template** (as written: screens and every `<view>`) |
| Every element fully positioned | `UNRESOLVED_GEOMETRY` | Pass 6, `checkPositioned` | **Per axis:** template when the axis is settled there, otherwise expanded — see below |
| `hcenter` / `vcenter` strict booleans | `INVALID_ENUM_VALUE` (suggestions `true`, `false`) | Pass 4 | Literal: **template**. `$`-value: **expanded**, substituted attributes only |
| Reserved constant names | `INVALID_NAME` at the `<const>` | Pass 1 | Declaration (globals) |
| Constants validated where declared | `NON_INTEGER_CONSTANT` / `INTEGER_OVERFLOW` at the `<const>` | Pass 1 | Declaration. Use sites still report through the resolver, per "not only where used" |
| Bounds for the target generated | `OUT_OF_BOUNDS` (unchanged) | Pass 6, against `checkedTarget(input)` | Unchanged from WO7: template, plus expanded with word-for-word suppression |
| Coordinates fit `int16_t` | `COORDINATE_OUT_OF_RANGE` | Pass 6, `checkRepresentable` | Same per-axis split as positioning |
| Substituted arguments checked (F4/F5) | `UNKNOWN_FONT`, `UNKNOWN_IMAGE`, `UNKNOWN_STYLE` (Pass 2), `INVALID_ENUM_VALUE` (Pass 4) | `checkValueReferences` / `checkEnumValue` on substituted attributes | **Expanded**, only attributes whose written value was a whole `$prop` (literals were checked on the template) |
| `hidden="$p"` substitutes (F6) | none | parser + `expand.ts` | Expansion |
| [D-20] rule on the expanded tree (F7) | `BOUND_GEOMETRY_ANCHORED_CHILD` (unchanged) | Pass 6 Step 4 | **Expanded** only, deduplicated per source pair |
| Interpolated `$prop` (F9, interim) | `UNSUBSTITUTED_PROP` | `expand.ts` `reportUnsubstitutedProp`, reported by Pass 5 | Expansion. A non-int prop is reported once with no chain; an int prop with no value is reported per instance |
| `required` with `default` (F10) | `OVERCONSTRAINED` at the `<prop>` | Pass 1, `checkRequiredWithDefault` | Declaration (composite and project widget manifests) |

**"Rectangular"** is `isRectangular(manifest)` in `resolve.ts`: the effective manifest
declares `x`, `y`, `width` and `height`. It is never a tag list.
- On the bundled manifests, every `u8g2gl_obj` descendant and `u8g2gl_box` are rectangular.
- Circle, ellipse, pixel, line, triangle, hline and vline are not. hline has no `height`
  and vline no `width`.
- The resolver no longer reads `right`/`bottom`/centring on a non-rectangular element.
  Otherwise `x` plus `right` would derive a width for a circle. The WO6 test that pinned
  "anchors common to every element" now pins the §7.2 rule.
- `hcenter="false"` counts as no anchor.

**Positioning, and how each axis is judged once.**
- The resolver now reports per axis what it could not settle: `ResolvedElement.axes` —
  deferred attributes with their symbols, whether the axis was already diagnosed, and
  whether the container size was known. This is additive, and there is still no second
  resolver.
- For an element whose manifest declares the axis's start (`x`/`y`), Pass 6 reports:
  - each written coordinate that stayed deferred — a `$prop` outside a composite, or a
    `#parent_*` whose container has no size;
  - otherwise a missing start: an anchor with no container size to measure against, or
    an under-determined axis (for example `width` with neither `x` nor `right`).
- A size is required only where written, or where the manifest's `required` says so
  (Pass 4's existing check).
- An axis of a template element is **settled in the template** when all of these hold:
  - no `$` in its `x/width/right/hcenter` attributes;
  - nothing deferred;
  - no anchor needing the unknown top-level size.

  Step 2 judges settled axes and records them. Step 3 judges every other axis on the
  expanded tree, naming the instance. So `width` with no `x` in a composite used twice is
  reported once, while `x="$px"` left unset by one instance is reported for that instance
  only.
- **Silent cases:**
  - A `$` deferral in a copied template: expansion already reported it (`UNKNOWN_PROP`
    or `UNSUBSTITUTED_PROP`).
  - A built-in deferral when the target has no catalogue record: Pass 3's, as before.

### How `validate` reports its target, and how `generate --target` checks bounds

- `ValidateInput.target?: Target` is new. `checkedTarget(input)` returns it, or
  `project.targets[0]`.
- `ValidateResult.checkedTarget` gives `{ name, setup, display? }`, and `checkProject`
  passes it through.
- **`validate` (CLI)** prints a line before its summary, for example:

  ```
  Geometry checked against target 'primary' (U8G2_SSD1306_128X64_NONAME_F_HW_I2C, 128x64); 'generate --target' checks the target it builds.
  ```

  - It says so when the target has no display record, or when a project declares no
    target. A lone file prints nothing.
  - `--json` gains `"target": {name, setup, display}` when a target exists. The field is
    additive.
- **`generate`** resolves the target first, then calls
  `checkProject(model, 'error', target)`. So positioning, `int16_t` fit and bounds are all
  judged for the target being built.
  - An unknown target validates against the first target, then reports
    `UNKNOWN_TARGET` as before.
  - A refused build still reports `target` when the target resolved.
  - Tested in core and through the built CLI: a label 200 wide generates for the 256-wide
    target and is refused with `OUT_OF_BOUNDS` for the 128-wide one.

### The `int16_t` check, relative to the bounds check

- `checkElements` runs, per axis: positioning, then `checkRepresentable`, then
  `checkAxisBounds` — **only if the axis's resolved start and size fit
  `-32768..32767`**.
- An axis that fails is not bounds-checked, including in the walk that did not judge it.
  So `x="40000"` gives one `COORDINATE_OUT_OF_RANGE` and no `OUT_OF_BOUNDS`.
- Arithmetic keeps its `int32_t` checks. `x="3000000000"` is still `INTEGER_OVERFLOW`.
  Its message now says int32 is the range "build-time arithmetic is checked in", not the
  range "coordinates are emitted in" (§13.2).
- Checked: resolved `x`, `y`, `width`, `height`, whether written or derived.

### How `hidden="$p"` survives parsing

- `parse-widget-tree.ts` gains `hiddenAttributeValue(text)`: a whole `$name` placeholder
  stays text; anything else is `text === 'true'`, the old rule.
- `expand.ts` applies the same function to the substituted value, so the rule is spelled
  once.
- A nested pass-through (`hidden="$outer"`) stays text until its own instance substitutes
  it.
- Tested: the parser keeps `'$p'` and still makes a literal `true` a boolean. Instances
  giving `hide="true"`, and taking the `false` default, expand to `true` and `false`.

### Decisions I made

- **D1 — New codes where no existing meaning fits; otherwise reuse (WO7 D1):**
  - four new codes, listed above;
  - `INVALID_ENUM_VALUE` for a non-boolean centring value (a two-member set);
  - `INVALID_NAME` for a reserved constant;
  - `OVERCONSTRAINED` for required-with-default, matching setter-with-draw: one
    declaration saying two incompatible things.
- **D2 — Substitutions are recorded on `ExpandedElement.substitutions`, and each
  `PropArgument` carries `fixed`.** `fixed` means a default, or a literal written in
  another `<view>`, or a fixed pass-through. `substituted-values.ts` is the one rule for
  reporting:
  - at the element using the value;
  - once and without a chain when the argument is fixed;
  - with the chain otherwise;
  - not at all when the same pass already reported that code at the argument itself.
    Pass 2 checks any `font` attribute by name, including on a composite instance.
- **D3 — Deferred values are always judged on the expanded tree**, structural
  under-determination on the template when settled. As a result, a `#parent_height`
  under an unsized element *inside* a template is reported per instance.
- **D4 — No display record suppresses positioning errors caused by the display**
  (built-ins, anchors against it). Pass 3 reports the display; guessing would cascade.
- **D5 — The [D-20] check no longer reads composite templates directly**, only the
  expanded tree. A composite that is never instantiated has no container to reflow.
  A pair fixed by a template (container written in a `<view>`, no `$` on either side)
  is reported once; any other pair names its instance.
- **D6 — `isCentringOn` is unchanged.** `hcenter="yes"` is an error and still centres,
  so it does not also raise a positioning error.
- **D7 — Fixtures corrected, not the rules.** Both "valid" fixtures (validator and
  integration) broke three new rules:
  - they declared `screen_width`/`screen_height` as constants — renamed
    `layout_width`/`layout_height` on the same lines;
  - `status_bar` declared `font` both required and defaulted — `required` dropped;
  - `header_bar` had no geometry — `x/y/width/height` added on its line.

  Lines and columns are unchanged, so no existing location assertion moved.
- **D8 — Two existing tests re-pinned to the new rule:**
  - `resolve.test.ts` "still reads the common anchors" now asserts rectangular only;
  - `widget-props.test.ts` "anchors on any element" moved its anchors to a label.

### Spec disagreements (recorded, not chosen)

- **§13.2 range wording.** One sentence says the `int16_t` rule "covers x, y, width,
  height, and any anchor or constant they resolve from". The next says "Build-time
  arithmetic may use wider intermediate values, but a *result* that doesn't fit int16_t
  is a validation error".
  - The WORKORDER says "a resolved coordinate".
  - I check resolved `x/y/width/height` only. A constant `40000` used as `#big - 39990`
    is accepted, and so is a `right` value that is never stored.
  - → Chief Architect, if the first sentence means constants and anchors themselves.
- No disagreement found between this WORKORDER and §7.2, §13.2 or [D-20].

### Out-of-scope findings (not fixed, not filed)

1. **Expansion now runs four times per `validate`** (Passes 2, 4, 5, 6), up from two
   (WO7 F3). → WO8's expand-once.
2. **Line and triangle endpoints, and circle/ellipse `radius`/`rx`/`ry`, are not
   resolved.** `x1`, `y1`, `x2` and so on get no expressions, no `int16_t` check and no
   bounds check; the resolver reads only x/y/width/height and anchors. §13.2 lists only
   x/y/width/height as coordinates, but endpoints are stored as coordinates too.
   → PA / Chief Architect.
3. **`hidden` is not a strict boolean.** `hidden="yes"` is still silently `false`, unlike
   `hcenter`. A `hidden="$p"` written in a screen, outside any composite, stays text and
   nothing reports it.
4. **A `$name` written outside a composite, in a non-geometry attribute** (such as
   `font="$f"` in a screen), is silently skipped by Passes 2 and 4. Only geometry is now
   caught (`UNRESOLVED_GEOMETRY`).
5. **Pass 4 still reports `MISSING_REQUIRED` on an instance omitting a required prop that
   has a default.** The declaration is now an error, so one defect reads as two.
6. **A `<style name="$s">` directive child is not checked after substitution.** Pass 2
   checks only written style children; substitutions are recorded for attributes only.
7. **`generate()` still resolves unexpanded screens in its Step 3** (WO7 F2). Validation
   now covers the chosen target, so Step 3 can no longer add a new error. → WO8.
8. **WORKORDER boundary path.** It names `schema/diagnostic.ts`; the file is
   `cli/src/core/schema/diagnostic.ts`, which is what I edited.
9. **Test names avoid `wd_`**, because full `validate` rejects `wd_` composite tags —
   WO7's S1, still open with the Chief Architect.

### Diff boundary

`git diff --name-only e05fc8d..HEAD`, before this report:
- `cli/src/core/generator/check-project.ts`, `generate.ts` — target passed to validation
  only
- `cli/src/core/parser/index.ts`, `parse-widget-tree.ts` — `hidden` placeholder only
- `cli/src/core/resolver/expand.ts`, `expression.ts`, `index.ts`, `resolve.ts`
- `cli/src/core/schema/diagnostic.ts`
- `cli/src/core/validator/index.ts`, `substituted-values.ts` (new), `validate-geometry.ts`,
  `validate-references.ts`, `validate-schema.ts`, `validate-widget-props.ts`, `validate.ts`
- `cli/src/node/cli.ts` — `validate` reports its target only
- tests:
  - `cli/test/integration/cli.test.ts`, `generate.test.ts`
  - the integration `valid-project` fixtures (3 files)
  - `cli/test/resolver/resolve.test.ts`
  - the validator `valid` fixtures (3 files)
  - `cli/test/validator/geometry-contract.test.ts` (new), `widget-props.test.ts`

Untouched: runtime C++, manifests, `docs/`, `PROGRAM*.md`, realisation, capacities,
emission, mangling wiring.
