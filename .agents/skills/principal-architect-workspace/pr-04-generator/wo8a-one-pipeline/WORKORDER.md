---
work_order: WO8a
project: pr-04-generator
title: "One pipeline: expand once, resolve once, mangling wired in, geometry completed"
branch: u8g2gl-generator/wo8a-one-pipeline
base: u8g2gl-generator/wo7b-geometry-contract
complexity: standard
status: complete
---

# WO8a — One pipeline

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **the WO8
split as approved by the owner** (status log and "Owner approval — WO8 split"); and that
this WORKORDER's `status` is `dispatched`. If any is missing, record it in the Completion
Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8a-one-pipeline`
**Base**: `u8g2gl-generator/wo7b-geometry-contract`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be
answered, and your work will strand uncommitted. Do not push.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core — no `node:` imports
in `src/core/`. Element knowledge is data, never code. Deterministic: document order, never
map or set iteration order where it reaches output.

## Design authority

design_spec §7.2, §13.2, §13.4, §13.6, §13.11 on `main` @ `5f2574f` (this branch contains
it). **"Stop and report" means record it, do not choose, continue with the remaining
items.**

---

## Objective

`validate` and `generate` run **one** pipeline — parse, validate, expand once, resolve once,
mangle — so WO8b's realisation consumes a single expanded, fully resolved, collision-checked
model. Today expansion runs four times per `validate`, `generate` resolves unexpanded
screens, and the mangler is never called.

## Line-Item Instructions

- [x] **Expand once, resolve once.** One expansion result, produced once and shared by every
      validator pass and by `generate()`. `generate()` stops resolving unexpanded screens
      (WO7 F2) and consumes the shared model (WO6 11, WO7 F3, WO7b 1 and 7). Count the
      expansions in a test so a future pass cannot quietly add a fifth.
- [x] **Wire mangling in (WO7 F1).** `mangleIdentifiers` raises `U8G2GL_NAME_COLLISION`
      naming both sources but nothing calls it. Call it once on the shared model; retire the
      older one-level inlining-collision check; `generate` refuses on its errors. End-to-end
      test: `a_b` at screen level beside child `b` of instance `a` fails both `validate` and
      `generate`, naming both sources.
- [x] **One drawing-element predicate, one flag set (WO5a 2, WO7 F8).** "Drawing element"
      (no `view`, declared `draw=` props, no `setter=` props) is spelled in
      `validate-schema.ts`, `validate-widget-props.ts` and the manifest cross-test; the flag
      set (`hidden`, `disabled`) is spelled in two passes. Put each on the registry once and
      migrate every call site.
- [x] **Resolve non-rectangular geometry (WO7b 2).** Line and triangle endpoints (`x1`, `y1`,
      `x2`, `y2`, `x0`, `y0`) and circle/ellipse radii (`radius`, `rx`, `ry`) are never
      resolved: no expressions, no `int16_t` check, no bounds check. They are coordinates
      under §7.2 and §13.2, and WO9/WO10 cannot emit a draw call without literal arguments.
      Resolve them through the existing evaluator, apply the same `int16_t` and container
      checks, and keep the §7.2 rule that *anchors* remain rectangular-only.
- [x] **`hidden` is a strict boolean (WO7b 3).** `hidden="yes"` silently becomes `false`, and
      a `hidden="$p"` written directly in a screen stays text unreported. Apply the strictness
      §7.2 gives `hcenter`/`vcenter`.
- [x] **`$name` outside a composite (WO7b 4).** In a screen, a `$name` in a font, image,
      style or enum attribute is silently skipped; only geometry catches it. There are no
      props to substitute at screen level, so it is an error — reuse
      `U8G2GL_UNSUBSTITUTED_PROP` if it fits, and say so.
- [x] **`<style name="$s">` after substitution (WO7b 6).** A style named by a `$prop` is never
      checked once substituted. Check it as WO7b checks substituted attributes.
- [x] **Required-with-default reports once (WO7b 5).** A prop declared both `required` and
      defaulted is an invalid declaration (WO7b raises `OVERCONSTRAINED`); Pass 4 also reports
      a missing required prop on each instance, so one mistake reads as several defects.
      Report the declaration only.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/`, `cli/src/core/resolver/`,
`cli/src/core/manifest/` (the predicate and flag set), `cli/src/core/generator/` (pipeline
wiring only), `cli/src/core/schema/diagnostic.ts`, `cli/src/node/cli.ts` (wiring only),
`cli/test/`, this WORKORDER.

**Do NOT touch:** realisation, flattening, capacities, `_n<N>` counts or emission — all WO8b;
runtime C++; manifests; `docs/`; `PROGRAM*.md`.

---

## Testing Requirement

- [x] Expansion count per `validate` and per `generate` asserted (once each).
- [x] The `a_b` collision fails `validate` and `generate`, naming both sources.
- [x] A line with `x1="#screen_width - 8"` resolves; one exceeding the display is
      `OUT_OF_BOUNDS`; one exceeding `int16_t` is `COORDINATE_OUT_OF_RANGE`; an anchor on a
      line is still `INAPPLICABLE_ANCHOR`.
- [x] `hidden="yes"` and a screen-level `$name` in a font attribute are each errors.
- [x] A prop that is `required` with a `default` produces exactly one diagnostic.
- [x] Each new test fails at the base — say how many, from a throwaway worktree under `tmp/`.

## Verification Requirement

- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (baseline 641)
- [x] `cmake --build build` zero warnings; `ctest --test-dir build` unchanged (baseline 305,
      one known skip)
- [x] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-16. **Status `complete`.** Not pushed.

### Authorization

Checked from committed files, not from the dispatch prompt:

- Front matter: `project: pr-04-generator`, `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the twelve
  work orders, start WO1"*, recorded at `2026-09-13T19:59:36Z`.
- `../PROJECT.md` "Owner approval — WO8 split, 2026-09-16" quotes the owner, *"And yes split
  WO8 is fine."*, and the status log's 2026-09-16 entry records WO8a dispatched on this
  branch.

Nothing missing or inconsistent.

### Test counts

| Suite | Before (`ca80cad`) | After |
|---|---|---|
| `npx vitest run` | 641, 43 files | **669**, 44 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | 0 (no C++ touched) |
| `ctest --test-dir build` | 305, 1 known skip | 305, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

New tests: `test/validator/one-pipeline.test.ts` (27), plus one added to
`test/validator/identifiers.test.ts` (the nested-composite collision). One existing test was
rewritten, deliberately — see "Mangling" below.

**Run against the base.** A throwaway worktree at `ca80cad` under `tmp/`, with the two test
files copied in: **20 of 38 fail there**, across every line item. The 18 that pass on both
commits are controls — the nine pre-existing identifier tests, and the WO8a controls (a clean
line validates, `hidden="true"`/`"false"` are accepted, two names that only collide once
mangled are fine apart, an anchor on a line is already `INAPPLICABLE_ANCHOR` from WO7b, a
genuinely missing required prop is still reported, and `$prop`s inside a composite are still
silent). **Two of those controls pass at the base vacuously** and are honest about it only in
combination with their failing neighbours: "resolves an expression in an endpoint" and
"resolves an ellipse `rx`/`ry`" assert *no* diagnostics, and at the base nothing resolved
those attributes at all, so there was nothing to report. Their partners — the out-of-bounds,
`int16_t`, malformed-expression and division-by-zero cases — are what actually fail there.
The worktree is removed.

### Per line item

**1. Expand once, resolve once.** New `cli/src/core/resolver/pipeline.ts`:
`createScreenPipeline(...)` holds one `ExpansionResult` and one resolution of that expanded
tree against one display, each computed on first use and then reused.

- **Produced once:** `validate()` builds the pipeline and threads it to every pass as
  `ValidateInput.pipeline` (optional, so a pass called alone in a unit test still works —
  `pipelineOf(input)` in the new `cli/src/core/validator/shared-model.ts` returns the
  supplied one or builds its own). Passes 2, 4, 5, 6 and 7 all read `pipeline.expansion`;
  none calls `expandScreens` any more.
- **Shared with `generate`:** `generate()` builds the pipeline for the target it is
  *building*, hands it to `checkProject(model, policy, target, pipeline)` → `validate()`, and
  then takes `GenerateResult.resolved` from `pipeline.resolution.screens`. Its old Step 3 —
  a second `resolveScreens` over **unexpanded** screens — is gone, closing WO7 F2 and WO6
  finding 11. Its resolved model now contains composite interiors, measured against each
  instance; a test asserts exactly that.
- **Resolution diagnostics** are carried as `RaisedDiagnostic { node, diagnostic }` pairs
  rather than annotated inside the pipeline, because only Pass 6 knows how to place one (a
  diagnostic inside an instance names the instance unless the template already said it word
  for word). That keeps the resolution shareable without moving WO7b's judgement out of
  Pass 6.
- **The expansion count is asserted** in `one-pipeline.test.ts` by `vi.mock`-ing
  `resolver/expand.js` and wrapping the *real* `expandScreens` with a counter, so it counts
  what actually ran, wherever it was called from: one expansion per `validate()`, one per
  `generate()`. A future pass that quietly expands the document for itself fails this test.
  **This test earned its place during the work order:** a `perl` substitution I used to point
  the passes at the shared model silently did not match, every pass fell back to building its
  own pipeline, and all 642 tests still passed. Lint's "unused variable" on the untouched
  `passInput` is what exposed it; this test is what would have.

**2. Mangling wired in (WO7 F1).** Pass 7 (`validate-identifiers.ts`) now calls
`mangleIdentifiers({ globals, screens: pipeline.expansion.screens })` once and reports its
diagnostics. `generate` refuses on them automatically, because it runs this same validation.

*What the retired check used to catch:* section 3a compared each screen-level element name
against the children of a **directly** instantiated composite, one level deep. It therefore
saw only a screen-level name colliding with a first-level composite child; it never saw a
nested composite (`bar` → `clk` → `digits` → `bar_clk_digits`), never saw two composite
children colliding with each other or with a global identifier (`ui_font_*`, `ui_subject_*`,
a screen function), reported at the *instance* rather than at the later source, and named
**one** of the two sources — where §13.4 requires a hard error naming both. Its test
(`identifiers.test.ts`, "detects component-inlining name collision") is rewritten to pin the
new behaviour, and a second test now covers the nested case the old check could not reach.

**3. One drawing-element predicate, one flag set.** `isDrawingElement(manifest)`,
`BINDING_FLAGS` and `OBJECT_ONLY_FLAGS` now live in `manifest/manifest-registry.ts` and are
re-exported from `manifest/index.ts`. Migrated call sites:

| Was | Now |
|---|---|
| `validate-schema.ts` — `hasDrawProp && !hasSetterProp` in the `extends` rule | `isDrawingElement(manifest)` |
| `validate-widget-props.ts` — its own local `isDrawingElement`, plus the literal `'disabled'` | the registry's predicate on `manifest.declared`, plus `OBJECT_ONLY_FLAGS` |
| `validate-types.ts` — its own `BINDING_FLAGS` | the registry's |
| `test/manifests/manifest-crosstest.test.ts` — its own `isDrawingElement(props)` | the registry's, so author and cross-test cannot drift |

The predicate takes the manifest **as declared** (`EffectiveManifest.declared`), documented
on the function: inherited props would answer a different question, because a manifest that
wrongly declares `extends` would inherit `u8g2gl_obj`'s setters and stop looking like what it
is. `validate-schema.ts` keeps its own `setterOnlyProp`/`drawOnlyProp` locals, which are a
different, per-prop concept (`MIXED_EMISSION_TARGETS`).

**4. Non-rectangular geometry (WO7b 2).** `resolve.ts` gained `ResolvedExtra` and
`ResolvedElement.extras`, resolved through the **same** `evaluateExpression` as `x` and
`width` — no second evaluator. The attribute list is a fixed table, `EXTRA_COORDINATES`,
read **only where the element's effective manifest declares the attribute**, exactly as
`geometryText` already does for `x`/`width`: the table says what `x1` *means*, the manifest
says which elements have one ([D-17]). It sits beside the existing `AXES`,
`ANCHOR_ATTRIBUTES` and `GEOMETRY_BINDINGS`, which name the layout contract the same way.

Pass 6's new `checkExtras` applies the three existing checks in the existing order:

| Condition | Diagnostic |
|---|---|
| Written but never resolved (a screen-level `$prop`, a `#parent_*` with no container) | `U8G2GL_UNRESOLVED_GEOMETRY` |
| Outside `int16_t` — checked first; such an axis is then not bounds-checked | `U8G2GL_COORDINATE_OUT_OF_RANGE` |
| A **point** (`x0/x1/x2`, `y0/y1/y2`) outside its container | `U8G2GL_OUT_OF_BOUNDS` |
| A **length** (`radius`, `rx`, `ry`) that is negative | `U8G2GL_OUT_OF_BOUNDS` |
| A malformed expression, unknown constant, division by zero, int32 overflow | the evaluator's existing codes, now reachable from these attributes for the first time |

No new diagnostic codes: every condition matches an existing code's meaning (WO7 D1).

**Anchors stayed rectangular-only.** `isRectangular` is untouched and still requires all four
of `x`, `y`, `width`, `height`, so a line, triangle, circle, ellipse or pixel gains
coordinates without gaining a box: `right` on a `u8g2gl_line` is still
`U8G2GL_INAPPLICABLE_ANCHOR`, pinned by a test written for exactly that risk.

**5. `hidden` is a strict boolean.** `hiddenAttributeValue` in the parser now returns a
boolean only for `"true"`/`"false"` and keeps **any other text as text** — including a
`$prop` placeholder, which WO7b already needed. Pass 4 then holds `hidden` to the same rule
as `hcenter`/`vcenter` (`BOOLEAN_ATTRIBUTES`, one `checkBooleanValue`), so `hidden="yes"` is
`U8G2GL_INVALID_ENUM_VALUE` with suggestions `true`, `false`, instead of silently rendering
the element. The substituted-value path checks it too, so an instance passing `hide="yes"`
into a composite is reported at the element using it, naming the instance.

**6. `$name` outside a composite.** `U8G2GL_UNSUBSTITUTED_PROP` reused, and its doc comment
in `schema/diagnostic.ts` now states both conditions and why they are one fact: the reference
has no value and never will. One spelling of the rule, `unsubstitutedPlaceholder()` in
`substituted-values.ts`, used by both passes — Pass 2 for `font`, `image`/`src`, `style`,
`focus_style`, `style_font` and a `<style>` child's name; Pass 4 for every declared `enum`
prop and for `hidden`/`hcenter`/`vcenter`.

Scoped deliberately to the attributes the line item names, plus the `hidden` case line item 5
requires. **Geometry is left alone:** the line item says "only geometry catches it", and
WO7b's `UNRESOLVED_GEOMETRY` rule and tests for a screen-level `x="$px"` are untouched, so
one defect still produces one diagnostic. A `<style name="$s">` in a screen previously
reported `UNKNOWN_STYLE '$s'`, which was true but unhelpful; it is now the placeholder error.

**7. `<style name="$s">` after substitution.** `expand.ts` now records a `Substitution` for a
style child whose whole `name` was a `$prop` (`Substitution.styleChild`, with
`attribute: STYLE_CHILD_VALUE`). Pass 2's expanded-tree walk checks the substituted name
against the styles in scope and reports through the existing `reportSubstituted`, so it obeys
WO7b's placement rule unchanged: once and without a chain when the argument is fixed by the
template, naming the instance otherwise. Pass 4 skips these substitutions explicitly, since
the value is not an attribute of the element.

**8. Required-with-default reports once.** Pass 4's required-prop loop now skips a prop that
also declares a `default`. Pass 1 already reports the declaration once as
`U8G2GL_OVERCONSTRAINED`, and expansion already prefers the default and says nothing, so one
mistake now reads as one defect however many instances omit the prop. A genuinely missing
required prop — no default to fall back on — is still reported, pinned by its own test.

### Decisions I made

1. **A radius is not bounds-checked against its container.** A point (`x0/x1/x2`, `y0/y1/y2`)
   is a position and is held to the container exactly as `x` is. A radius is a distance from
   a centre, and bounding it would require deciding what a centre-positioned element's extent
   is — the semantics §7.2 explicitly defers and WO6 finding 8 already sent to the Chief
   Architect. So a radius is resolved and checked for `int16_t` and for being non-negative,
   and no further. `radius="500"` on a 128-wide display validates; this is recorded as
   finding 1 below rather than decided here.
2. **`radius` is treated as a length on every element that declares it**, including
   `u8g2gl_box`, where it is a corner radius rather than a circle radius. Both are pixel
   lengths that must resolve to a literal and fit `int16_t`, and neither is positioned, so
   one rule covers both without the generator knowing which element it is looking at.
3. **The pipeline carries resolution diagnostics unplaced**, paired with their node, rather
   than annotating them itself (reasoning under line item 1).
4. **`checkedTarget` moved** from `validate-geometry.ts` to the new `shared-model.ts`,
   alongside `pipelineOf`. `validate.ts` imports every pass, so a pass importing a value back
   from `validate.ts` would be a module cycle; both helpers needed a neutral home. Only
   `validate.ts` imported `checkedTarget`, so nothing else moved.
5. **The screen-level `$prop` rule is scoped to the named attribute kinds** (reasoning under
   line item 6), leaving WO7b's geometry rule to report geometry.

### Deviation from the Strict Boundary Box — recorded, not hidden

`cli/src/core/parser/parse-widget-tree.ts` is **not** in the Boundary Box, and I changed it:
`hiddenAttributeValue` now keeps a non-boolean value as text. Line item 5 cannot be delivered
without it — the parser collapsed `hidden="yes"` to `false` before any validator could see
it, so there was no value left to report. It is the same one-line function WO7b had to change
for the same attribute (its own diff boundary lists this file, and the PA accepted it), and
the change is confined to that function. Flagging it because the box did not name the file,
not because I think the change is wrong. **The PA should confirm it.**

### Spec disagreements (recorded, not chosen)

None found between this WORKORDER and §6.2, §7.2, §13.2, §13.4, §13.6 or §13.11. Two spec
*silences* were decided rather than stopped on, because neither contradicts anything written:
what a radius is bounded against (decision 1, and finding 1 below), and whether a `bool` prop
other than `hidden` must be a strict boolean (finding 2 below).

### Out-of-scope findings (not fixed, not filed)

1. **A radius is never bounds-checked.** `radius="500"` on a 128-wide display validates, and
   `x="0" radius="40"` puts a circle off the left edge with nothing said. Deciding the rule
   needs the centre-positioned-element semantics §7.2 defers — the same gap as WO6 finding 8,
   already with the **Chief Architect**. WO9/WO10 will emit these values regardless, so a
   ruling before emission would be worth having.
2. **No `bool` prop other than `hidden` is value-checked.** `filled="yes"` on a
   `<u8g2gl_box>`, or `disabled="1"` on a label, still passes: they are plain string
   attributes that no pass inspects. `hidden` is now strict because the line item named it,
   so the schema is inconsistent about booleans. One rule over every `type="bool"` prop would
   close it, and would be a small change in Pass 4 — but it is a rule change beyond WO8a.
3. **A screen-level `$prop` in a `bind_*` subject attribute is still silent.**
   `bind_text="$s"` written directly in a screen is skipped by Pass 2's subject check exactly
   as `font="$f"` used to be. It is the same defect in the same class, and one more line in
   the same helper would fix it; left alone because the line item lists font, image, style and
   enum, and the PA scoped it that way.
4. **A `<style>` child inside a composite's `<view>` is never checked when written
   literally.** Pass 2's style-child check runs only in the screen walk (section 2); the
   composite walk (section 3) checks fonts, images and subjects but not style children. So
   `<style name="headr" />` written in a template validates, while the substituted form now
   does not. Pre-existing, and narrower than it looks, but inconsistent.
5. **`int` props other than coordinates are never evaluated.** `padding="3 +"` or
   `scroll_px_per_sec="abc"` on a label still validates: only geometry attributes and the new
   endpoints/radii go through the evaluator. §13.2 says every `int` prop is emitted as an
   `int32_t` literal, so emission (WO9/WO10) needs either a rule or a diagnostic.
6. **`validate.ts`'s `ValidateInput.pipeline` is trust-based.** A caller could pass a pipeline
   built for a different display than `target`, and geometry would then be checked against one
   display and emitted for another. `generate` is the only caller that passes one and it
   builds both from the same target; the field is documented as carrying that obligation, but
   nothing enforces it.
7. **Pass 6 still resolves composite templates separately** (its Step 2), in addition to the
   shared resolution of the expanded tree. That is deliberate and required by WO7b — a
   template defect must be reported once even when the composite is never instantiated — but
   it means "resolve once" is true of *screens*, not of the document as a whole. Worth stating
   plainly so WO8b does not assume a single resolution pass exists.

### Diff boundary

`git diff --name-only ca80cad..HEAD`:

- `cli/src/core/resolver/pipeline.ts` (new), `expand.ts`, `resolve.ts`, `index.ts`
- `cli/src/core/validator/shared-model.ts` (new), `validate.ts`, `validate-geometry.ts`,
  `validate-identifiers.ts`, `validate-references.ts`, `validate-schema.ts`,
  `validate-types.ts`, `validate-widget-props.ts`, `substituted-values.ts`
- `cli/src/core/manifest/manifest-registry.ts`, `index.ts`
- `cli/src/core/generator/generate.ts`, `check-project.ts` (pipeline wiring only)
- `cli/src/core/schema/diagnostic.ts` (one doc comment)
- `cli/src/core/parser/parse-widget-tree.ts` — **outside the box**, see the deviation above
- tests: `cli/test/validator/one-pipeline.test.ts` (new),
  `cli/test/validator/identifiers.test.ts`, `cli/test/manifests/manifest-crosstest.test.ts`
- this WORKORDER

Untouched: runtime C++, `extern/`, manifests, `docs/`, `PROGRAM*.md`, `cli/src/node/cli.ts`
(no wiring change was needed), and all of WO8b's scope — realisation, flattening, capacities,
`_n<N>` counts and emission.
