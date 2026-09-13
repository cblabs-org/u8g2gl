---
work_order: WO1
project: pr-04-generator
title: "Manifest registry: framework manifests reach the CLI, extends resolved once"
branch: u8g2gl-generator/wo1-manifest-registry
base: main @ f693aab
complexity: standard
status: complete
---

# WO1 — Manifest registry

## Authorization

Part of PR-04 (`pr-04-generator`). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — the owner's own words with
a timestamp, not a relayed claim. If it is absent or reads as a placeholder,
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo1-manifest-registry` (already created)
**Base**: `main` @ `f693aab`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit. A check that
runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit on a green build. Do NOT stop to ask for approval —
you cannot be answered, and your work will strand uncommitted. Do not push; the
PA reviews your commits.

## Standards

Invoke the `u8g2gl-standards` skill before writing code, and read
`references/typescript.md`. Documentation carries equal weight to the code rules:
file headers with SPDX and a real `Purpose:` (not "Implementation of X"), TSDoc on
exports, `// --- Step N: ---` breakdowns, and why-comments where a decision is not
obvious from the code. `src/core/` is isomorphic — no `node:` imports; ESLint
enforces it.

## Design authority

`docs/design_spec.md` is normative — §13.1 and [D-17] for manifests, [D-18] for
the one element vocabulary. Where this work order and the spec disagree, **stop
and report**; do not pick one.

---

## Objective

Every element the CLI knows about comes from one registry built from the
framework's own manifests plus the project's, with `extends` chains resolved
once. Today the framework manifests never reach the CLI at all.

## Background — this is broken today, not merely untidy

- `cli/src/node/read-project.ts` discovers only the project's `widgets/`.
  `include/u8g2gl/manifests/` (16 files) is never read, and `package.json`'s
  `files` does not ship it. A real project using `<u8g2gl_label>` fails validation
  unless the author copies the manifest in.
- Four fixtures pass only because they carry such a copy, and it has gone stale —
  it still carries `animated="false"`, which PR-3R removed:
  - `cli/test/integration/fixtures/valid-project/widgets/u8g2gl_label/u8g2gl_label.xml`
  - `cli/test/integration/fixtures/broken-project/widgets/u8g2gl_label/u8g2gl_label.xml`
  - `cli/test/validator/fixtures/valid/widgets/u8g2gl_label/u8g2gl_label.xml`
  - `cli/test/validator/fixtures/invalid/widgets/u8g2gl_label/u8g2gl_label.xml`
- Nothing resolves `extends`. `u8g2gl_label extends u8g2gl_obj`, but the label's
  inherited props (`hidden`, `draw_color`, …) are known to the validator only
  through a hardcoded `COMMON_ATTRIBUTES` set in `validate-widget-props.ts:25`.
- `ValidateInput` carries `components` and `widgetManifests` as two lists, and
  `cli.ts`'s `bucketWidgetManifest` sorts manifests into them by whether they have
  a `view`. Under [D-18] that is one vocabulary split back into two at the door.

Every later work order in this PR — parity, resolver, realisation, both emitters —
reads manifests. This is first because all of them would otherwise each invent a
lookup.

## Line-Item Instructions

- [x] **Bundle the framework manifests as data.** Follow the catalogue precedent
      (`src/data/catalogue.json` + `catalogue.ts`, built by
      `src/node/build-catalogue.ts`): a `build:manifests` script writes
      `src/data/manifests.json` holding each manifest's filename and **raw XML
      text**, and `src/data/manifests.ts` exports it. Raw text, not a pre-parsed
      model, so the one manifest parser (`parseWidgetManifestFile`) stays the only
      parser. Add the JSON to `package.json` `files`.
- [x] **A drift guard for the bundle.** A test asserting `manifests.json` matches
      `include/u8g2gl/manifests/` byte-for-byte (same file set, same content),
      with a non-vacuous check that the directory resolved to a non-empty set.
      A bundle that silently lags the headers is the stale-fixture defect again.
- [x] **Manifest registry in `src/core/`.** A new module (suggested
      `src/core/manifest/`) that takes framework manifests and project manifests
      and returns a registry plus diagnostics. It must:
  - look up any element by tag, one namespace for widgets and composites alike;
  - resolve the `extends` chain into an **effective manifest** — inherited
    `props` and `bindings` merged, a child's declaration overriding its parent's
    by `name`, declaration order preserved (parent first, then child additions;
    an override keeps the parent's position). Later work orders depend on that
    order, so pin it with a test;
  - diagnose an unknown `extends` target and an `extends` cycle, naming the chain;
  - make a **project manifest whose tag matches a framework manifest a hard
    error**, naming both sources and telling the author to delete the copy. Add a
    stable code in `schema/diagnostic.ts` following the existing convention.
- [x] **Validator consumes the registry.** Replace `components` and
      `widgetManifests` on `ValidateInput` with the registry (or a single manifest
      list the validator turns into one), and replace every ad-hoc
      `new Map(... .map((c) => [c.name, c]))` in the validator passes with registry
      lookups. Delete `bucketWidgetManifest` from `cli.ts`; `cli.ts` passes the
      bundled framework manifests plus the project's.
- [x] **Merge the widget and composite prop-checking blocks** in
      `validate-widget-props.ts` (case 1 and case 2) into one body over the
      effective manifest. This was surfaced twice in PR-3R and those lines are
      being rewritten here anyway. **Watch for asymmetries as you merge** — every
      behavioural difference you find between the two blocks is a finding for the
      Completion Report, not something to settle silently. Diagnostic wording that
      said "on component <x>" may become uniform; update message assertions and
      say which.
- [x] **Do not change which attributes are accepted** beyond what extends
      resolution adds. Keep `COMMON_ATTRIBUTES` for the non-manifest layout and
      identity attributes. If you find an attribute that `COMMON_ATTRIBUTES`
      admits but no effective manifest declares (or the reverse), **record it**;
      WO3 owns attribute acceptance.
- [x] **Delete the four stale fixture copies** so those fixtures exercise the real
      framework manifests. Fix any test that relied on the stale content, and say
      what changed.

## Strict Boundary Box

**In scope:**
- `cli/src/core/manifest/` (new)
- `cli/src/data/manifests.json`, `cli/src/data/manifests.ts` (new)
- `cli/src/node/build-manifests.ts` (new), `cli/package.json` (`scripts`, `files`)
- `cli/src/core/validator/validate.ts`, `validate-widget-props.ts`,
  `validate-references.ts`, `validate-schema.ts`, `validate-identifiers.ts`,
  `validate-geometry.ts` — **only** to consume the registry and, in
  `validate-widget-props.ts`, to merge the two blocks
- `cli/src/core/schema/diagnostic.ts` (new codes only), `cli/src/core/index.ts`
  (exports)
- `cli/src/node/cli.ts` — manifest loading and removal of `bucketWidgetManifest`
- Tests and fixtures under `cli/test/`, this WORKORDER

**Do NOT touch:**
- Anything under `include/` or `src/` (C++) — including manifest XML content.
  Manifest corrections are WO2.
- `validate-types.ts` and binding-type checks — WO3.
- The parser, including `parse-widget-manifest.ts` — if the registry needs the
  parser to behave differently, **stop and report**.
- The missing-name policy (ui_spec §16.1) — settled.
- `docs/` — spec documents are the Chief Architect's.

---

## Testing Requirement

- [x] A project using `<u8g2gl_label>` with **no** local copy of its manifest
      validates cleanly — the regression test for the headline defect. It must
      fail against the code at `f693aab`.
- [x] A project shipping `widgets/u8g2gl_label/u8g2gl_label.xml` gets the new
      shadowing error, naming both sources.
- [x] `extends` resolution: inherited prop present; child override wins and keeps
      the parent's position; declaration order pinned; unknown `extends` and an
      `extends` cycle each diagnosed.
- [x] Bundle drift guard passes, and demonstrably fails if a manifest in
      `include/u8g2gl/manifests/` is edited without rebuilding.
- [x] Composite and widget instances go through the same prop-checking code — a
      test that a case previously covered for one path now fires for the other.

## Verification Requirement

- [x] `cmake --build build` — zero warnings (unchanged; confirm)
- [x] `ctest --test-dir build` — 240 pass (unchanged; confirm)
- [x] `cd cli && npx vitest run` — all pass; none weakened or removed without
      saying why in the Completion Report
- [x] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [x] `git diff --name-only f693aab..HEAD` touches only files named in the
      Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it and do not file an issue — the PA triages. Expect to find some; the merge
of the two prop-checking blocks is where PR-3R's evidence says one is hiding.

---

## Completion Report

**Worker:** Tier-3, 2026-09-13. **Code commit:** `6c71715` on
`u8g2gl-generator/wo1-manifest-registry`, not pushed.

### Authorization

Checked in the committed files, not taken from the dispatch prompt. The front
matter names `project: pr-04-generator`. `../PROJECT.md` → "Human Approval"
quotes the owner's own words, *"Approved — proceed with the twelve work orders,
start WO1"*, recorded at `2026-09-13T19:59:36Z`. The status log matches. No
disagreement between this work order and `docs/design_spec.md` stopped the work;
one tension is recorded under F3.

### Test counts

| Suite | Before (`f693aab`) | After (`6c71715`) |
|---|---|---|
| `ctest --test-dir build` | 240 pass | 240 pass |
| `cmake --build build` warnings | 0 | 0 |
| `npx vitest run` | 266 tests, 27 files | **293 tests, 29 files**, all pass |
| `npx tsc --noEmit`, `npm run lint` | clean | clean |

The +27 are: 14 registry tests, 5 bundle drift tests, 6 prop-check tests and 2
CLI integration tests. No test was removed or weakened. Changes to existing
tests are listed under line item 7 and "Test migration".

### Per line item

1. **Bundle as data.** `src/node/build-manifests.ts` (`npm run build:manifests`)
   writes `src/data/manifests.json`: `[{ filename, xml }]`, sorted by code unit,
   raw XML. `src/data/manifests.ts` exports `FRAMEWORK_MANIFESTS`. The JSON is
   added to `package.json` `files`. Parsing lives in
   `src/core/manifest/framework-manifests.ts` (`parseFrameworkManifests`), which
   calls `parseWidgetManifestFile`, so there is still only one parser. Framework
   files are reported under the path `u8g2gl/manifests/<file>`.
2. **Drift guard.** `test/manifests/manifest-bundle.test.ts` compares the bundle
   to `include/u8g2gl/manifests/`: same file set, same order, byte-identical
   content. It first checks that the directory is non-empty.
   - Its `bundleDrift()` check is itself tested against doctored copies (edited,
     added and removed files).
   - I also ran a real demonstration. With one byte of `manifests.json` changed,
     the guard failed with "content differs: u8g2gl_box.xml". Restored
     (byte-identical, checked with `cmp`), it passed.
   - `include/` was never touched, even temporarily.
3. **Registry.** `src/core/manifest/manifest-registry.ts`,
   `buildManifestRegistry({ framework, project })` returns:
   - `get` and `has` over one namespace, plus `tags`
   - `declaredComposites` and `declaredWidgets` (un-merged)
   - `diagnostics`

   An `EffectiveManifest` has merged `api.props` and `api.bindings` and carries
   `origin`, `declared` and `chain`. Merge order: parent's order first, a child
   override replaces its namesake in place, child additions are appended.
   Registry tests pin this exactly, for two and three levels, props and
   bindings. The diagnostics:
   - unknown `extends`: `U8G2GL_UNKNOWN_WIDGET`, with a suggestion
   - cycle: `U8G2GL_CIRCULAR_REFERENCE`, reported once, message
     "`wd_a -> wd_b -> wd_a`"
   - shadowing: new code `SHADOWED_FRAMEWORK_MANIFEST` =
     `'U8G2GL_SHADOWED_FRAMEWORK_MANIFEST'` in `schema/diagnostic.ts`; the
     message names both files and says to delete the project copy
4. **Validator consumes it.** `ValidateInput.components` and `.widgetManifests`
   are replaced by `manifests: ManifestRegistry`. `validate()` reports
   `manifests.diagnostics` as a new "Pass 0".
   - Every ad-hoc `new Map(...)` was replaced by registry lookups:
     - `validate-widget-props.ts`: 2 maps
     - `validate-references.ts`: 2 maps plus the one in `detectCompositeCycles`
     - `validate-schema.ts`: `compositeMap`
     - `validate-identifiers.ts`: `componentMap`
   - `validate-geometry.ts` now iterates `declaredComposites`.
   - `cli.ts`: `bucketWidgetManifest` is deleted. It parses the bundled
     manifests and passes them with the project's into one registry.
   - `core/index.ts` exports the manifest module.
5. **Blocks merged.** `validate-widget-props.ts` now has one
   `checkInstanceProps(node, effectiveManifest)` (unknown attribute → required →
   enum), used for every known tag. Messages are now uniform: `on <x>`, never
   `on component <x>`, for `UNKNOWN_ATTRIBUTE`, `MISSING_REQUIRED` and
   `INVALID_ENUM_VALUE`. No existing test asserted the old composite wording. A
   new test pins the uniform wording. Asymmetries are listed below.
6. **Accepted attributes.** `COMMON_ATTRIBUTES` is unchanged. The only newly
   accepted attributes are those `extends` adds. The comparison is below.
7. **Stale fixtures deleted** (all four). Three tests relied on them, none on
   their stale content:
   - `test/validator/validate.test.ts`: the loader now builds
     `frameworkRegistry([status_bar])` instead of parsing the copy.
   - `test/node/read-project.test.ts`: dropped the two assertions that the copy
     is discovered or in the file map, and relaxed "≥2 manifests" to "≥1".
   - `test/integration/cli.test.ts` (`--fix-names` suite): `createTempProject`
     no longer writes the copy, which would now be a shadowing error. The
     assertions are unchanged.

### Testing requirement — how each is met

- **Headline regression.** `cli.test.ts` → "validates a project using
  `<u8g2gl_label>` with no local copy of its manifest".
  - It builds a temp project with no `widgets/` and uses the inherited
    `draw_color`, so it also proves `extends` is resolved.
  - **Checked against `f693aab`:** in a temporary worktree (since removed), with
    dist built and this test file copied in, it fails with
    `U8G2GL_UNKNOWN_WIDGET`.
  - The existing `valid-project` tests now cover it too, since the copy is gone.
- **Shadowing.** `cli.test.ts` → "rejects a project copy of a framework
  manifest, naming both sources". It is also covered in the registry tests.
- **`extends`.** `test/manifests/manifest-registry.test.ts` covers:
  - an inherited prop is present
  - an override wins and keeps its position, with order pinned
  - three-level order
  - bindings
  - unknown `extends`
  - 2-cycle and 3-cycle
  - determinism
  - the real framework: 0 diagnostics, and `u8g2gl_label`'s `font` override sits
    at `u8g2gl_obj`'s position
- **Drift guard:** see item 2.
- **Same code path.** `widget-props.test.ts` → "suggests common layout
  attributes for a composite instance, as it always did for a widget".
  - A composite `widht` now gets suggestion `width`; at `f693aab` the composite
    path gave none.
  - Also added: uniform wording, one check per tag, inherited props accepted,
    child enum override, inherited `required`.

### Asymmetries found merging the widget (case 1) and composite (case 2) blocks

- **A1 — suggestion pool.** Case 1 put `COMMON_ATTRIBUTES` into the
  `findClosest` candidates; case 2 did not. Now both do (tested).
- **A2 — wording.** Case 2 said `on component <x>` in all three messages, case 1
  `on <x>`. Now uniform `on <x>`. Codes are unchanged.
- **A3 — a tag in both maps ran both blocks.** Before WO1, a plain widget and a
  composite with the same tag both matched, so every instance got each
  diagnostic twice. One registry lookup removes that. It is only reachable with
  duplicate declarations; see F7.
- **A4 — null-safety spelling.** `manifest.api?.props?.map` vs
  `component.api?.props.map`. Cosmetic, no behaviour.
- **A5 — neither block resolved `extends`.** The widget path saw inherited
  geometry and `hidden` only because `COMMON_ATTRIBUTES` repeats them, not
  through inheritance.
- **No residual difference** in bindings (`fmt` companions accepted) or in the
  enum `$param` skip. WO6 had already aligned those.

Two related asymmetries sat outside the block, in `validate-references.ts`.
Unifying the lookup changed them too:
- **A6 — suggestions and codes.** `UNKNOWN_WIDGET` suggestions came only from
  plain-widget names and `UNKNOWN_COMPONENT` suggestions only from composites.
  Both now draw from all registry tags; the code is still chosen by the
  `u8g2gl_` prefix. A declared composite whose tag starts with `u8g2gl_` used to
  be reported `UNKNOWN_WIDGET` anyway. It is now known, although identifier
  rules still reject that prefix on user names.
- **A7 — image references.** The image-reference check (a prop named
  `src`/`image` with `type="image"`) used to consult plain widgets only. It now
  also applies to composite instances that declare such a prop.

### `COMMON_ATTRIBUTES` vs effective manifests (for WO3)

Computed over all 16 framework manifests after resolution:
- **Admitted by `COMMON_ATTRIBUTES` but declared by no manifest:** `name`,
  `right`, `bottom`, `hcenter`, `vcenter`, `style`, `focus_style`, `focusStyle`.
- **In both** (declared on `u8g2gl_obj`, inherited by all): `x`, `y`, `width`,
  `height`, `hidden`.
- **Newly accepted through `extends`, not in `COMMON_ATTRIBUTES`:**
  - On every framework element: `disabled`, `draw_color`, `invert`, `padding`,
    `border`, plus `radius` everywhere except `u8g2gl_box` and `u8g2gl_circle`
    (which declare their own).
  - On elements that do not declare their own: `font`, `align`, `bind_text`,
    `bind_text_int`, `bind_text_fmt`. This includes the draw-only primitives
    (`u8g2gl_pixel`, `u8g2gl_line`, `u8g2gl_hline`, `u8g2gl_vline`,
    `u8g2gl_triangle`, `u8g2gl_ellipse`, …). See F1.
- **Composites** have no `extends`, so `COMMON_ATTRIBUTES` remains their only
  source of geometry and `hidden`. `disabled`, `draw_color` and the rest are not
  accepted on a composite instance.

### Decisions I had to make

- **D1 — the registry is the input, not a flat list.** `ValidateInput` carries
  it, and `validate()` reports its diagnostics, so the CLI and designer cannot
  disagree about shadowing.
- **D2 — reused codes.** Unknown `extends` reuses `U8G2GL_UNKNOWN_WIDGET`; a
  cycle reuses `U8G2GL_CIRCULAR_REFERENCE`. The only new code is the shadowing
  one, as the WO specified.
- **D3 — `extends` equal to the element's own name is a root.** The parser
  defaults a missing `extends` to `u8g2gl_obj`, so `u8g2gl_obj` arrives
  "extending itself". Treating that as a cycle would put an error on every
  project. The parser is off-limits, so the registry absorbs it. See F2.
- **D4 — only props and bindings inherit**, as the WO specified.
  `api.elements` stays the element's own list. See F8.
- **D5 — per-declaration checks use un-merged manifests.** Schema §4/§5,
  identifiers §4, references §3 and geometry iterate `declaredComposites` and
  `declaredWidgets`, so a defect in an inherited prop is reported once, against
  its owner. Framework manifests are now in schema §5's scope and produce 0
  diagnostics today.
- **D6 — a shadowing project copy is excluded outright.** The framework manifest
  wins lookup, and the copy is not schema-checked, since the fix is to delete it.
- **D7 — duplicate project declarations of one tag:** the first wins lookup
  (pre-WO1 Maps were last-wins). Both stay in the declared lists, so the
  existing composite `DUPLICATE_NAME` check still fires.

### Test migration

- **New helper.** `test/helpers/manifest-registry.ts` provides `registryOf` and
  `frameworkRegistry`.
- **Mechanical rewrites.** `components: [...]` / `widgetManifests: [...]` became
  `manifests: registryOf([...])` in:
  - `types.test.ts`
  - `geometry.test.ts`
  - `schema.test.ts`
  - `element-identity.test.ts`
  - `identifiers.test.ts`
  - `display.test.ts`

  The script lives in git-ignored `tmp/`.
- **`references.test.ts`, by hand.** It gained `BASE_COMPOSITES` and
  `BASE_WIDGETS`. An override that used to replace only `components` still keeps
  the base widgets, so no test's meaning changed.
- **`widget-props.test.ts`, rewritten.** All five original tests are kept with
  the same assertions. The composite-enum test's manifest now also declares a
  required `title`, which the instance supplies, so the test stays about enums.

### Out-of-scope findings (not fixed, not filed)

- **F1 — `u8g2gl_obj.xml` declares label-specific API on the base object**
  (`font`, `align`, `bind_text`, `bind_text_int`). With `extends` resolved, every
  draw-only primitive now validates `bind_text="..."` and `font="..."`. They were
  rejected before only because nothing was inherited. The data is wrong, not the
  resolution. Belongs to WO2 (manifest parity) and WO3.
- **F2 — the parser's `extends` default** (`parse-widget-manifest.ts`, `?? 'u8g2gl_obj'`):
  - it makes `u8g2gl_obj` self-referential (handled by D3)
  - an explicit `extends="<own name>"` cannot be told apart from it
  - `validate-schema.ts`'s "Missing required attribute 'extends' on widget"
    check can never fire, because the parser always fills the value
- **F3 — spec §6.5 example vs WO1's unknown-`extends` rule.** The example is
  `<widget name="wd_service_list" extends="u8g2gl_widget">`. No
  `u8g2gl_widget` manifest or class exists anywhere in `include/` or `src/`.
  - Under WO1 that manifest is a `U8G2GL_UNKNOWN_WIDGET` error.
  - §6.5 also calls `extends` "real C++ inheritance". Whether `extends` must name
    a *manifest*, or may name a manifest-less C++ class, is unstated.
  - This is not a direct WO/spec contradiction, since the WO explicitly requires
    diagnosing unknown `extends`, so I did not stop. The Chief Architect should
    confirm; the spec example needs correcting either way.
- **F4 — Pass 4 checks only screens.** Instances inside a composite's `<view>`
  are never prop-checked. §13.11 says composite instantiation is validated
  "inside composites as well as screens".
- **F5 — single-file `u8g2gl validate include/u8g2gl/manifests/u8g2gl_label.xml`**
  now reports `SHADOWED_FRAMEWORK_MANIFEST`, because a lone manifest file is
  treated as a project manifest. It also reports the long-standing
  `UNKNOWN_SCHEMA_VERSION ''`, which single-file mode gives any non-project file.
- **F6 — test files are not type-checked.** `tsconfig.json` includes only
  `src/`. Type-checking `test/` (via a throwaway config in `tmp/`) shows 4
  errors, identical at `f693aab`:
  - `element-identity.test.ts:230`, `:375`, `:376`
  - `geometry.test.ts:44`
- **F7 — duplicate plain-widget project manifests of one tag are undiagnosed.**
  Only composites get `DUPLICATE_NAME`. This is pre-existing; D7 changed the
  winner from last to first.
- **F8 — collection `<element>`s are not inherited through `extends`.** If
  `extends` is C++ inheritance, a child class inherits its parent's accessors.
  The PA should decide before WO7 or WO8 reads `api.elements`.
- **F9 — framework-manifest diagnostics have no source line in human output.**
  Their `u8g2gl/manifests/…` path is not in `cli.ts`'s `fileContentMap`. This
  only matters if the bundle is ever broken.
- **F10 — integration tests run `dist/node/cli.js`, and nothing rebuilds it.**
  Nothing before `vitest run` rebuilds `dist/`, so a stale `dist/` silently
  tests old code. I ran `npm run build` by hand before the final run. The
  baseline 266 ran against whatever `dist/` existed.
- **F11 — "component" wording remains outside the merged block.**
  - `validate-schema.ts` §4: "on `<component>`", "in component '…'"
  - `validate-references.ts`: "Unknown component", "in component '…'"
  - `validate-identifiers.ts`: "Duplicate component name",
    "Component-inlining name collision"

  All are [D-18] vocabulary residue, left as-is: outside the merge, and some
  have tests asserting the text.
