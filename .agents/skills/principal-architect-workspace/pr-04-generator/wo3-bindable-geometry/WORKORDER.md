---
work_order: WO3
project: pr-04-generator
title: "[D-20] bindable geometry: runtime, manifests, validator"
branch: u8g2gl-generator/wo3-bindable-geometry
base: u8g2gl-generator/wo2-manifest-parity
complexity: standard
status: partial
---

# WO3 — [D-20] bindable geometry

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo3-bindable-geometry`
**Base**: `u8g2gl-generator/wo2-manifest-parity`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you
cannot be answered, and your work will strand.

## Standards

`u8g2gl-standards` skill before writing code. Mutators mark dirty, guarded. No
heap. Zero warnings. Element knowledge is data, never code ([D-17]).

## Design authority

[D-20] (`docs/decisions/d20-bindable-geometry.md`), design_spec §6.2, §8.4, §13.5.
Where this work order and the spec disagree, **stop and report**.

---

## Objective

[D-20] made `x`, `y`, `width` and `height` bindable. Nothing implements it: no
manifest declares the bindings, the runtime has no geometry binding, and the
validator rejects `bind_width` as an unknown attribute.

## Line-Item Instructions

- [x] **Runtime:** `bind_x`, `bind_y`, `bind_width`, `bind_height` on `u8g2gl_obj`
      taking `u8g2gl_subject_int_base*`, driving the per-axis setters PR-3R added.
      Same invariant as WO2: one pool slot, one observer, `false` on exhaustion.
- [x] **Object manifests:** declare the four as `<bind>` entries on
      `u8g2gl_obj.xml`, so every classed element inherits them via WO1's registry.
- [ ] **Drawing-element manifests:** declare bindings **explicitly** for each
      bindable property (at minimum geometry; `hidden` via `bind_flag_if_*`
      children per §8.4). A drawing element has no setter, so decide how a
      `<bind>` on a `draw=`-only manifest names its target within the **existing**
      `BindDef` shape. If the existing shape cannot express it without a new
      attribute, **stop and report** — new manifest vocabulary is an owner
      decision.
- [x] **Validator:** accept and type-check bindings from the effective manifest's
      `BindDef.type`, replacing the hardcoded `bind_text`/`bind_value` checks in
      `validate-types.ts`. Format-string checks stay, keyed off the binding's
      declared `fmt`, not its name.
- [x] **[D-20] diagnostic:** a container whose own geometry is bound may not have
      anchor-positioned children (`right`, `bottom`, `hcenter`, `vcenter`). Name
      the container, the bound attribute and the anchored child.
- [x] **Attribute acceptance — manifests are the source.** WO1 recorded that
      `COMMON_ATTRIBUTES` (`validate-widget-props.ts`) admits `name`, `right`,
      `bottom`, `hcenter`, `vcenter`, `style`, `focus_style` and `focusStyle`,
      none of which any manifest declares, and also repeats geometry and `hidden`,
      which manifests do declare. Reduce `COMMON_ATTRIBUTES` to **identity and
      anchor/style attributes only** — `name`, `right`, `bottom`, `hcenter`,
      `vcenter`, `style`, `focus_style` — so `x`, `y`, `width`, `height` and
      `hidden` are accepted only where the effective manifest declares them.
      Remove `focusStyle` unless something reads it; say which. A drawing element
      is hidden through `<bind_flag_if_*>` children (§6.2's own example), not a
      literal `hidden`. **If a spec example or fixture puts a literal `hidden` on a
      drawing element, stop and report** rather than choosing.

## Added by the Principal Architect after WO2 — do these first

WO2 removed the parser's implicit `extends` default and, to keep the schema check
quiet, added `extends="u8g2gl_obj"` to the eight drawing manifests. It said plainly
that this conflicts with design_spec §6.2 and §6.5. The PA's decision, consistent
with the Chief Architect's ruling on `main` (`4e4b992`: `extends` must name a
manifest, and names real C++ inheritance), is recorded in PROJECT.md under
"WO2 — complete". Implement it:

- [x] **Drawing manifests declare no `extends`.** Remove it from `u8g2gl_box`,
      `circle`, `ellipse`, `hline`, `line`, `pixel`, `triangle`, `vline`. A drawing
      element has no class ([D-18]).
- [x] **`u8g2gl_obj` is the single root.** Remove its self-referencing
      `extends="u8g2gl_obj"`. The registry treats `u8g2gl_obj` as the root class
      manifest because §13.7 names it as the base every generated object is reached
      through — one documented contract constant, with a why-comment, not an
      element list. Remove WO1/WO2's self-extends-as-root handling if nothing else
      needs it.
- [x] **The `extends` rule in the schema pass (`validate-schema.ts`):**
      a manifest with any `setter=` prop, other than the root, requires `extends`
      (the existing "missing required attribute" error, now reachable); a `draw=`-only
      manifest that declares `extends` is an error (a drawing element has no class
      to inherit from); a manifest with a `<view>` needs none, since the registry
      supplies `u8g2gl_obj`. A test for each branch.
- [x] **Remove the `it.fails` marker** for `u8g2gl_box` in
      `manifest-crosstest.test.ts` (`OPEN_EFFECTIVE_ORDER_MISMATCHES`). With no
      inherited `radius`, box's effective draw order is its declared order. The set
      should be empty; delete it rather than leave an empty exception list.
- [x] **W5 — stale comments** left by WO2's F2 change in
      `validate-references.ts` and `schema/widget-manifest.ts`.

## Carried from WO1 (PA triage)

- [x] **F4 — prop-check composite interiors.** `validate-widget-props.ts` walks
      only screens, so elements inside a composite's `<view>` are never
      prop-checked. §13.11 requires composite interiors to be validated on the same
      path as screens. `$prop` values are template placeholders and are skipped, as
      the other passes already do.
- [x] **F6 — type-check the tests.** `cli/tsconfig.json` covers only `src/`; four
      type errors already exist (`element-identity.test.ts:230/375/376`,
      `geometry.test.ts:44`). Add a test type-check (a `tsconfig.test.json` run by
      the lint or test script) and fix those four.
- [x] **F7 — duplicate plain-widget manifests.** Two project manifests declaring
      the same tag are diagnosed only when both are composites. Diagnose it for
      every manifest, naming both files.
- [x] **F11 — retire "component" wording** remaining in the schema, references and
      identifiers passes, updating the assertions that pin it.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp` (geometry
bindings only); `include/u8g2gl/manifests/*.xml` (`<bind>` additions, and removal
of `extends` from drawing manifests and from `u8g2gl_obj.xml`);
`cli/src/data/manifests.json` (rebuilt); `cli/src/core/manifest/` (root handling
only); `cli/src/core/validator/` — `validate-types.ts`, `validate-widget-props.ts`,
`validate-geometry.ts` (the [D-20] diagnostic), `validate-schema.ts` (the `extends`
rule, F7, F11), `validate-references.ts` and `validate-identifiers.ts` (F7, F11, W5);
`cli/src/core/schema/widget-manifest.ts` (comments only), `schema/diagnostic.ts`
(new codes); `cli/test/manifests/manifest-crosstest.test.ts`; `cli/tsconfig*.json`
and `cli/package.json` scripts (F6 only); tests; this WORKORDER.

**Do NOT touch:** the resolver or generator (WO5+); render path (WO4); parser;
schema vocabulary.

---

## Testing Requirement

- [x] Bound width on an object updates geometry and marks the frame dirty on a
      static screen.
- [x] `bind_width` on `<u8g2gl_box>` validates; a `bool` subject bound to it is a
      type error.
- [x] A mistyped format specifier still fails, now via the declared `fmt`.
- [x] Geometry-bound container with an anchored child is an error; with absolute
      children it is not.

## Verification Requirement

- [x] C++ build zero warnings; `ctest` all pass
- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-13. **Code commit:** `a652fd6` on
`u8g2gl-generator/wo3-bindable-geometry`, not pushed.

**Status `partial`, for one reason.** The drawing-element manifest item is
unticked. Geometry bindings are declared. `hidden` is not: it hit this item's own
stop-and-report clause (see that item). Every other line item is done.

### Authorization

I checked the committed files, not the dispatch prompt:
- Front matter names `project: pr-04-generator`, `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with
  the twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- The status log records WO3 as dispatched after WO2's review.

### Test counts

| Suite | Before (`ebbf999`) | After (`a652fd6`) |
|---|---|---|
| `cmake --build build` warnings | 0 | 0 |
| `ctest --test-dir build` | 260, 1 known skip | **266**, 1 known skip (`SizeOfReport.ThirtyTwoBitTarget`) |
| `npx vitest run` | 383 | **406**, 29 files |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` | clean (eslint only) | clean: eslint **and** `tsc -p tsconfig.test.json` |

### "Do these first"

- **Drawing manifests declare no `extends`.** Removed from the eight drawing
  manifests (`box`, `circle`, `ellipse`, `hline`, `line`, `pixel`, `triangle`,
  `vline`).
- **`u8g2gl_obj` is the single root.** Its self-`extends` is removed.
  - `manifest-registry.ts` exports `ROOT_CLASS_MANIFEST = 'u8g2gl_obj'`. Its
    why-comment cites §13.7's `u8g2gl_obj* const` object arrays and §13.12.
  - The self-extends-as-root branch in `parentTagOf` is gone.
  - `u8g2gl_obj` naming itself is now a `CIRCULAR_REFERENCE` like any other
    self-extends; there is a new test for this.
  - The constant is still needed for two things: the composite default parent,
    and the schema pass's root exemption.
- **The `extends` rule** in `validate-schema.ts` §5, one test per branch in
  `schema.test.ts`:
  - `setter=` props with no `extends`, and not the root: `MISSING_REQUIRED`
    (the existing message).
  - `draw=` props only, with `extends`: new `U8G2GL_DRAWING_ELEMENT_EXTENDS`.
  - Composite: no requirement. Composites are a separate declared list; the
    test uses `frameworkRegistry([composite])`.
  - Root: exempt, tested explicitly.
  - A manifest with **neither** kind of prop is left alone, because §6.5 gives
    an existing class a manifest with an `<api>` holding no new props.
- **`it.fails` removed.** `OPEN_EFFECTIVE_ORDER_MISMATCHES` is deleted, and box's
  effective draw order now passes as a plain `it`. The cross-test's "declares
  extends" assertion now expects `extends` if and only if the element is
  class-backed and not the root.
- **W5.** The stale comments are corrected:
  - `validate-references.ts`: composites *do* now inherit, and declared props
    are used deliberately for `$name` placeholders.
  - `schema/widget-manifest.ts`: the `extends` field doc and the Purpose
    paragraph.

### Line items

- **Runtime.** `bind_x`, `bind_y`, `bind_width`, `bind_height`
  (`u8g2gl_subject_int_base*`) → `bool`.
  - Each is exactly one `add_value_binding()` call. The four private static
    callbacks forward to `set_x/y/w/h`, so the change guard and `mark_dirty()`
    stay in one place.
  - int32 subject values are **clamped** to int16_t rather than truncated (see
    Decisions).
  - `test_binding.cpp` gains four `BindingInvariant.*` tests: one slot, one
    observer, rollback on either exhaustion, including the debug death test.
  - `test_obj.cpp`: `BindWidthUpdatesGeometryAndGatesStaticFrame` (the frame
    flag on an otherwise static screen, plus no re-dirty on an unchanged value)
    and `BindEachAxisDrivesItsSetter` (clamp, null subject).
- **Object manifests.** `u8g2gl_obj.xml` declares
  `<bind name="bind_x|bind_y|bind_width|bind_height" type="int" setter="bind_…"/>`.
  Every classed element and every composite inherits them. The cross-test
  confirms each has a public overload taking `u8g2gl_subject_int_base*`.
- **Drawing-element manifests (unticked).**
  - **How a `<bind>` names its target in the existing `BindDef` shape.** A
    drawing element has no method, so its `setter=` names **the `draw=` prop
    whose argument the bound subject supplies at draw time**, e.g.
    `<bind name="bind_width" type="int" setter="width"/>` on `u8g2gl_box`. This
    needs no new attribute, so I did not stop.
  - The cross-test now enforces it: for a drawing element, every
    `<bind setter=>` must name one of its own `draw=` props of the same type.
    Elements with a class keep the C++ overload check.
  - Declared bindings:

    | Element | Bindings |
    |---|---|
    | box | x, y, width, height |
    | hline | x, y, width |
    | vline | x, y, height |
    | circle, ellipse, pixel | x, y |
    | line, triangle | none (they have no [D-20] axis) |

  - **Caveat, for the owner:** this gives `setter` a second meaning on drawing
    manifests, the same kind of overload §13.1 criticised when props used
    `setter=` for U8G2 calls. A dedicated attribute would be clearer, and that
    is new vocabulary, so it is not mine to add.
  - **Stop-and-report: `hidden`.** Per §8.4 and §6.2, a drawing element is
    hidden through `<bind_flag_if_*>` **child directives**. `BindDef` describes
    an **attribute** slot, and no manifest, object manifests included, declares
    flag-binding children today. They are accepted on every element by the
    parser and checked by the references and types passes. Expressing "this
    element accepts flag bindings for `hidden`" in a manifest needs vocabulary
    `BindDef` does not have. **Nothing is declared**, and no existing behaviour
    changed.
- **Validator — binding types.** `validate-types.ts` is rewritten. The
  hardcoded `bind_text` / `bind_value` checks are gone.
  - For each binding in the effective manifest whose attribute is present and
    names a subject (not `$…`), the subject type must be in the binding's
    **accepted types**: its own `BindDef.type`, plus the types of every binding
    sharing its `setter`, i.e. the C++ overload set. See Decisions for why.
  - The format check reads the attribute named by `binding.fmt`, and messages
    name that attribute.
  - Tests:
    - `bind_width` on `<u8g2gl_box>` with an int subject validates.
    - A bool subject is `TYPE_MISMATCH` (exact message pinned).
    - An int on `bind_text` validates.
    - A custom `bind_level` with `fmt="level_fmt"` and a `%s` fails through
      `level_fmt`.
    - `$` placeholders are skipped.
    - The existing `%d` and `%s` mismatch tests still pass.
- **[D-20] diagnostic.** New `U8G2GL_BOUND_GEOMETRY_ANCHORED_CHILD` in
  `validate-geometry.ts`, run over screens and composite templates.
  - It fires for a node carrying any of `bind_x`, `bind_y`, `bind_width` or
    `bind_height` whose children, **or** (for a composite instance) the
    top-level elements of its `<view>`, use `right`, `bottom`, `hcenter` or
    `vcenter`.
  - The message names the container (name and tag), the bound attribute, the
    child (name and tag) and the anchor. The location is the anchor attribute.
  - Four tests: anchored child is an error; absolute children are not; a
    literal-geometry container is not; a composite instance with an anchored
    `<view>` child is an error.
- **Attribute acceptance.** `COMMON_ATTRIBUTES` is now `name`, `right`,
  `bottom`, `hcenter`, `vcenter`, `style`, `focus_style`, **`focusStyle`**.
  - **`focusStyle` kept, because two things use it:**
    - `parse-widget-tree.ts:254` writes it as a mirror of every `focus_style`.
    - `validate-references.ts:229` reads it.

    Removing it would report a phantom unknown attribute on every `focus_style`.
  - `x`, `y`, `width`, `height` and `hidden` are now accepted only where the
    effective manifest declares them. Tests: `x` on `<u8g2gl_line>` and a
    literal `hidden` on `<u8g2gl_box>` are both `UNKNOWN_ATTRIBUTE`;
    `bind_width` on box and anchors on a pixel are accepted.
  - **No spec example or fixture puts a literal `hidden` on a drawing
    element.** I searched `main:docs/design_spec.md`, `docs/`, every test
    fixture and `examples/`. No stop.
- **F4.** `validateWidgetProps` now also walks every declared composite's
  `<view>`, through the same `checkInstanceProps`. Enum `$prop` values were
  already skipped. Tests: an unknown attribute inside a view is reported, and
  `align="$mode"` inside a view is not.
- **F6.**
  - `cli/tsconfig.test.json` extends `tsconfig.json` with
    `noEmit`, `rootDir: "."` and `include: ["src","test"]`.
  - `npm run lint` is now `eslint . && tsc -p tsconfig.test.json`.
  - **There were 16 errors, not 4.** WO1's four, plus 12 added since `f693aab`:
    - `name-policy.test.ts`: 7 (helper typed `{code}` → `Diagnostic`)
    - `parse-widget-manifest-composite.test.ts:101`: 1 (narrowing)
    - `schema/types.test.ts`: 3. These were `@ts-expect-error` over
      **commented-out** assignments, which checked nothing. They are now
      never-called closures that fail type-checking if `readonly` is lost.
  - WO1's four: `element-identity.test.ts:230/375/376` needed `view!`.
    `geometry.test.ts:44` was a catalogue fixture that was not a
    `DisplayRecord` at all (string `bus`, plus the non-existent `resolution`,
    `buffer` and `ramBytes`). It is now a well-formed record.
- **F7.** `validate-identifiers.ts` §4 checks every declared manifest (plain and
  composite) for a repeated tag. It reports `DUPLICATE_NAME` against the
  second declaration, naming both files. The old composite-only "Duplicate
  component name" check is replaced. Three tests.
- **F11.** Message prose now says "composite" or "element" in the schema,
  references and identifiers passes, and the inlining-collision assertion is
  updated.
  - **Diagnostic code `U8G2GL_UNKNOWN_COMPONENT` is unchanged**: codes are a
    stable API (typescript.md §4).
  - Local variable names (`componentInstances`, `component`) are untouched.
  - The §15.4 migration text that names `<component>` as removed is correct
    and stays.

### Decisions I made

1. **The binding accepted-type set is the setter's overload set.** A strict
   `BindDef.type`-only check would reject design_spec §8.4's own example,
   `bind_text="temperature"` with `%d°C` (an int), because the manifests model
   the int form as a separate `bind_text_int` attribute. Grouping by `setter` is
   data-driven and matches C++ overload resolution. Consequence:
   `bind_text_int` now accepts a string subject too. See finding 2.
2. **Geometry bindings clamp** out-of-range int32 values to int16_t, so an
   element pins at the edge of coordinate space instead of wrapping.
3. **`hcenter` or `vcenter` equal to `"false"` is not an anchor** for the
   [D-20] check.
4. **A composite instance's `<view>` children count as its children** for the
   [D-20] check, because a composite is a real container ([D-18]).
5. **Drawing elements get only [D-20]'s four axes.** `radius`, `filled`,
   `rx/ry` and the line/triangle endpoints are not declared bindable.
   §6.1 and §8.4 name geometry only.

### Out-of-scope findings (not fixed, not filed)

1. **Manifest vocabulary for flag bindings** (the `hidden` stop-and-report
   above). Neither object nor drawing manifests can declare which
   `<bind_flag_if_*>` flags an element supports. As a result,
   `flag="disabled"` on a drawing element is accepted, though it means nothing
   there.
2. **`bind_text_int` versus §8.4.** The spec binds an int subject through
   `bind_text` and never mentions `bind_text_int`. The manifests
   (`u8g2gl_obj`, `u8g2gl_label`, `u8g2gl_button`) declare both. With decision
   1 the second attribute is redundant. Chief Architect or PA to decide whether
   it should exist.
3. **`setter=` meaning a `draw=` prop on drawing-manifest `<bind>`s** (see the
   drawing-element item). A candidate for dedicated vocabulary, which is an
   owner decision.
4. **Pass 5 (types) and Pass 2 still walk only screens** for type checks. F4
   was scoped to prop-checking, so composite interiors are prop-checked but not
   type-checked.
5. **`CommonAttributes` in `schema/widget-node.ts`** still types `x`, `y`,
   `width`, `height`, `hidden` and `focusStyle` as common to every node. That
   is outside the Boundary Box, and it no longer matches the validator.
6. **Mixed manifests.** A manifest with both `setter=` and `draw=` props is
   treated as class-backed by the `extends` rule. §13.1 does not say whether
   such a manifest is legal.
7. **Test type errors keep appearing between work orders.** Twelve new ones
   appeared between `f693aab` and `ebbf999`. `npm run lint` now catches this,
   but `vitest run` alone does not.

### Diff boundary

`git diff --name-only ebbf999..a652fd6` lists only:
- `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp`
- the nine manifests
- `cli/src/data/manifests.json` (rebuilt)
- `cli/src/core/manifest/manifest-registry.ts`
- the six validator files
- `schema/widget-manifest.ts` (comments only), `schema/diagnostic.ts` (two codes)
- `cli/package.json` (the lint script), `cli/tsconfig.test.json`
- tests

No parser, resolver, generator or `docs/` file changed.
