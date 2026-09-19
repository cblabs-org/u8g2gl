---
work_order: WO11b
project: pr-04-generator
title: "Validator hardening: validate never passes what generate refuses"
branch: u8g2gl-generator/wo11b-validator-hardening
base: u8g2gl-generator/wo10b-bound-text
complexity: standard
status: complete
---

# WO11b — Validator hardening

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO11b as approved by the
owner** ("Owner approval — WO10b and WO11b", **including the owner's confirmation of 2026-09-19**); and that this
WORKORDER's `status` is `dispatched`. If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo11b-validator-hardening` · **Base**: `u8g2gl-generator/wo10b-bound-text` (dispatch commit on it)

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval. Do not push or tag.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element knowledge is data,
never code. One pipeline: never a second count, evaluator, expansion or prefix list.

## Design authority

design_spec §7.2, §8.1–§8.4, §10, §13.2, §13.4, §14.1 (as amended on `main` @ `ff20f0c`), §21 Q-16;
the Chief Architect's rulings recorded in PROJECT.md ("Chief Architect rulings on CA-BRIDGE-2026-09-18"); PROJECT.md decision 1 (validate warns, generate
errors, for refusals). "Stop and report" means record it, do not choose, continue.

---

## Objective

`validate` never passes a document `generate` refuses, and no mistake reaches emission silently.
Each item below is a gap WO9 or WO10 found; each gets a test that fails at the base.

## Line-Item Instructions

- [ ] **A missing size (WO10 SR2).** WO10 dropped `required` on drawing geometry a binding or anchor
      can supply; WO7b's rule catches a missing *position*, not a missing *size*, so a box with no
      `width` and no binding passes `validate` and `generate` refuses it. A size neither written,
      bound nor anchor-derived is an error in `validate`.
- [ ] **Bound or styled values satisfy `required` (WO10b f1).** `validate` requires a literal `x`
      even when `bind_x` supplies it, and a literal `font` even when a named style supplies it, so
      the fixture has to write `x="0"` beside `bind_x`. A geometry attribute supplied by a binding,
      and a property supplied by a style the element names, both satisfy `required`. Then remove
      the fixture's redundant `x="0"` and regenerate; that output change is expected and disclosed.
- [ ] **One table of geometry bindings (WO10b f2).** The set of geometry bindings is spelled in the
      validator, in `emit/screen-model.ts` and in `emit/placement.ts`'s position table. Make it one
      data table in the model, consumed by all three. Emission must stay byte-identical.
- [ ] **Invented template setters (WO10 f1).** The manifest parser invents `set_<name>` setters for
      a composite's template parameters; emission filters them. Stop inventing them.
- [ ] **Screen-descriptor collision (WO10 f5).** `ui_screen_<name>` is not in `mangle.ts`'s
      collision table, so screen `a_objs`'s descriptor can collide with screen `a`'s object table. The
      same for `ui_editor_registry` (WO11 f6), and for the new `ui_obj_` family (WO10b).
- [ ] **`style_*` overrides (WO10 f8)** are never validated except `style_font`. Validate each against
      the style property it overrides.
- [ ] **Flag directives (WO10 f9):** a missing `ref_value`; `gt`/`lt` on a bool, string or time subject;
      and unknown `bind_flag_if_*` suffixes all pass today while emission refuses them.
- [ ] **`bind_text_fmt` on a string subject (WO10 f10)** validates, but the emitted call would not
      compile. Reject it, naming the subject's type.
- [ ] **`<builtin>` font names (WO9 f5).** A `<builtin>` name is aliased verbatim, so a typo is a link
      error in the user's firmware build. Check it against U8G2's own font symbols from the pinned
      `extern/u8g2` — derived as data, the way [D-14] derives the display catalogue, never a
      hand-kept list.
- [ ] **Subject values (WO9 f6):** a subject's initial `value` is type-checked; a string's initial value
      is checked against its `max_len`; remove `truncate` from `StyleDecl` (`schema/globals.ts:138`) and from the style
      parser (`parser/parse-globals.ts:71,86`), and the stale mention in `emit/styles.ts:57`.
      [D-19] deleted it and §10 no longer lists it. Keep the validator's [D-19] rejection message
      (`validate-schema.ts:70`) so an author who writes it is told why.
- [ ] **Ruling 1c (Chief Architect, 2026-09-19; §7.2, Q-16):** a container whose **own position is
      bound** (`bind_x`/`bind_y`) may have **no children** in schema 0.4. It is an **error** in
      `validate` and `generate` alike. The message says why (children are positioned at build
      time and there is no reflow yet) and points to Q-16. Composite instances count as
      containers.
- [ ] **Ruling 6 (Chief Architect, 2026-09-19; §7.2): bounds-check what is drawn.** A pixel as a
      1×1 box; a line by the box around its endpoints; a triangle by the box around its vertices;
      a circle or ellipse by the box around the segments its segment bits select (a quarter-circle
      at a display corner must pass when every drawn pixel is on the display). Checked against the
      container, for the target being generated. Radii get checked by this rule too, which closes
      WO8a f1. The segment → box derivation is data or one function shared with whatever else
      needs it. Never a second copy.
- [ ] **Two renames (WO9 f7, WO8c f3):** `U8G2GL_UNRESOLVED_GEOMETRY` is now used for non-coordinate
      `int` props too, and `notYetSupportedPolicy` also carries realisation's refusal severity. Rename
      each to what it now means, keeping diagnostic codes stable if they are public (say which).

## Strict Boundary Box

**In scope:** `cli/src/core/validator/`, `cli/src/core/resolver/mangle.ts` (the descriptor only),
`cli/src/core/parser/parse-widget-manifest.ts` (template setters only), `cli/src/core/schema/`
(`StyleDecl`, diagnostic names), `cli/src/node/` and `cli/src/data/` (the U8G2 font-symbol data
build only), `cli/src/core/parser/parse-globals.ts` and `emit/styles.ts` (the `truncate` removal only),
`cli/src/core/resolver/` (a shared drawn-extent function for ruling 6, if one belongs there),
`emit/screen-model.ts` and `emit/placement.ts` (consuming the one geometry-binding table only), the
committed fixture's `screens/screen_bounds.xml` and its regenerated output, `cli/test/`,
this WORKORDER.

**Do NOT touch:** runtime C++; manifests; emission, except to delete refusals the validator now
makes unreachable (say which); `docs/`; `PROGRAM*.md`. Run every suite alone.

## Verification Requirement

- [ ] CLI `vitest`, `tsc`, lint clean; runtime C++ unchanged; `cmake --build build` zero warnings and `ctest` green (the fixture compiles in both configurations)
- [ ] Each item has a test that fails at the base (say how many behaviourally)
- [ ] Diff limited to the Boundary Box

---

## Completion Report

**Worker:** Tier-3, 2026-09-19. **Status `complete`.** Five code commits plus this report: `280cd0e`, `46b3377`,
`f6e294c`, `11642c2`, `2d5d89a`. Not pushed or tagged; no version bumped (no schema change; the generator's output
changes only in the disclosed fixture line, and the goldens stay pinned at `0.0.0-golden`). The worker was
interrupted twice (a usage limit, and a stalled stream); both times it resumed from committed state on this branch.

### Authorization

Verified from committed files before any change: the front matter names `project: pr-04-generator` and
`status: dispatched`; `../PROJECT.md` "Human Approval" quotes *"Approved — proceed with the twelve work orders,
start WO1"* at `2026-09-13T19:59:36Z`; "Owner approval — WO10b and WO11b" quotes *"ok please update the
checkpoint-bridge - I approve 10a and 10b …"* and the owner's confirmation of 2026-09-19, *"confrmed that "10a and
10b" approval meant WO10b and WO11b"*.

### Suites (each run alone, uncontended)

| Suite | Base (`5f69d25`) | After (`2d5d89a`) |
|---|---|---|
| `npx vitest run` | 859 / 56 files | **927 / 57 files** |
| `npx tsc --noEmit`, `npm run lint` | clean | clean |
| `cmake --build build --clean-first` | 0 warnings | **0 warnings** (both configurations) |
| `ctest --test-dir build` | 361, 1 known skip | **361**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

Runtime C++ unchanged. The committed fixture regenerates byte-identically and compiles and runs in the C++ suite.

### Line items — test, and base-failure status

All new tests are in `cli/test/validator/validator-hardening.test.ts`. The file has 68 tests, one describe per item.
Wherever the journey split is concerned, a test runs **both** journeys (`checkProject` at the authoring policy, and
`generate`) over one project and asserts they report the same errors.

**Run at the base in a throwaway worktree (`tmp/wo11b-base` at `5f69d25`):** 67 tests ran. **53 fail and 14 pass.** Of the 53:
- **51 fail behaviourally**;
- **2 fail only because a name does not exist at the base**: `GEOMETRY_BINDINGS` (TypeError), and the renamed key
  `DIAGNOSTIC_CODES.UNRESOLVED_VALUE`.

The 14 that pass at the base are controls, plus 4 deliberate pins of behaviour the base already had:
- line and triangle points, which the base checked point by point;
- the segment-table scan;
- the `ui_obj_` collision;
- no `set_caption` emitted, because emission filtered it.

The font-list drift test is skipped at the base, because the worktree has no submodule checked out and the builder
module does not exist there.

| Item | Proving test(s) | At base |
|---|---|---|
| Missing size (SR2) | `a missing size…`: box without width; object without width (at the base `generate` threw); composite instance without height | 3 fail behaviourally |
| Bound or styled values satisfy `required` (WO10b f1) | `a binding or a named style…`: `bind_x`/`bind_y` with no literal; the font supplied by a style attribute, a `<style>` child, `style_font` or a screen-local style; a `$`-style per instance | 6 fail behaviourally |
| One geometry-binding table (WO10b f2) | `one table of geometry bindings`: the table's contents, and a source scan for any other spelling | 1 fails only because the export is missing; 1 fails behaviourally (scan) |
| Invented template setters (WO10 f1) | `a composite's template parameters…` | 1 fails behaviourally |
| Screen-descriptor collision (WO10 f5, WO11 f6, `ui_obj_`) | `the collision table is total`: `a` + `a_objs`, `a` + `a_init`, table membership | 3 fail behaviourally; the `ui_obj_` pin passes (WO10b already checked it) |
| `style_*` overrides (WO10 f8) | `each style_* override…`: 5 bad values, suggestions, unknown key, drawing element, substituted value | 9 fail behaviourally |
| Flag directives (WO10 f9) | `flag directives…`: missing `ref_value`; gt/lt/eq on bool, string and time subjects; unknown suffix; drawing-element guard | 7 fail behaviourally |
| `bind_text_fmt` on a string (WO10 f10) | `bind_text_fmt on a string subject…` (even `%s`) | 1 fails behaviourally |
| `<builtin>` names (WO9 f5) | `a <builtin> font must be one U8G2 bundles`: typo plus suggestion; drift guard against `extern/u8g2` | 1 fails behaviourally; drift test absent at base |
| Subject values (WO9 f6) and `truncate` | `a subject's initial value…` (6 values plus UTF-8), `truncate is gone…` | 8 fail behaviourally |
| Ruling 1c | `ruling 1c…`: composite instance; object with a child; reported once per template; controls | 4 fail behaviourally (at the base the control failed too, because `x` was required beside `bind_x`) |
| Ruling 6 | `ruling 6…`: whole circle at a corner, radius 500, ellipse, pixel, hline `y`, container-relative, bound centre; quarter-circle at all four corners passes | 7 fail behaviourally |
| Two renames | `two renames, codes stable` | 1 fails because the key is missing; 1 fails behaviourally (the base ignores `refusalPolicy`) |

### Diagnostic codes

- **Added (public):**
  - `U8G2GL_BOUND_POSITION_HAS_CHILDREN` (ruling 1c);
  - `U8G2GL_STRING_TOO_LONG` (a string value over its `max_len`).
- **Renamed, key only:** `DIAGNOSTIC_CODES.UNRESOLVED_GEOMETRY` → `UNRESOLVED_VALUE`. **The code string
  `U8G2GL_UNRESOLVED_GEOMETRY` is unchanged**, because codes are public and stable (§15.3, [D-16]).
- **Renamed TypeScript API** (exported from `core/index`, so public to the npm package; pre-1.0):
  - `NotYetSupportedPolicy` → `RefusalPolicy`;
  - `ValidateInput.notYetSupported` → `refusalPolicy`;
  - `DEFAULT_NOT_YET_SUPPORTED_POLICY` → `DEFAULT_REFUSAL_POLICY`;
  - `GENERATE_NOT_YET_SUPPORTED_POLICY` → `GENERATE_REFUSAL_POLICY`.
- **Existing codes, no change.** Every refusal the validator now makes early uses **the code emission used**:
  - `MISSING_REQUIRED` for a missing size and a missing `ref_value`;
  - `TYPE_MISMATCH` for a bad style value, a flag on the wrong subject type, and a subject value;
  - `UNKNOWN_ATTRIBUTE` for an unknown flag suffix, an unknown style key, and a style on a drawing element.

  So `generate` reports the same code for those documents as before.

### How the `<builtin>` font data is derived

- `cli/src/node/font-symbol-builder.ts` (`parseFontSymbols`) reads the pinned `extern/u8g2/csrc`:
  - every `extern const uint8_t u8g2_font_*[]` **declared** in `u8g2.h`;
  - every `const uint8_t u8g2_font_*[N]` **defined** in `u8g2_fonts.c`.
- It requires the two sets to match exactly, and throws if they don't, because a name must both compile and link.
- 2.36.18 defines some fonts with `U8X8_FONT_SECTION`. The first run of the builder caught that, and both macros are
  accepted.
- `build-catalogue.ts` writes the result to **`cli/src/data/u8g2-fonts.json`** (2039 names, sorted), in the same run
  and under the same `catalogue-source.json` record as the display catalogue ([D-14]'s method). The catalogue files
  rebuilt byte-identical.
- Pass 2 imports the JSON. `validate-display.ts` already imports `page-mode-map.json` the same way.
- A drift test compares the committed list with a fresh parse of the submodule.

### Decisions I made

1. **The geometry-binding table lives in the resolver** (`resolver/geometry-bindings.ts`), the layout model that the
   validator and both emitters already import. It is a discriminated union, so `placement.ts` derives
   `POSITION_BINDINGS` with a type guard, and editor-registry.ts needed no change.
2. **The drawn-extent function lives in the resolver** (`resolver/drawn-extent.ts`), with `SEGMENT_EXTENTS` as data
   encoding `u8g2_circle.c`'s quadrant rule: a quadrant includes the centre's row and column.
   - `ResolvedExtra` gains `spans`, the axes of a length, set in `EXTRA_COORDINATES`.
   - A rectangle axis keeps its existing check; every other axis is checked by what the element draws.
   - The per-point check in Pass 6 is removed, not duplicated.
   - An hline's `y` and a pixel are now bounded, which they were not before.
3. **A missing size uses `MISSING_REQUIRED`**, the code `generate` used. A `draw=` prop's default counts as a
   supplier; a `setter=` prop's default does not, because `set_coords` takes only a literal or a binding.
4. **Styles supply a required prop through `styleProperties()`**, the styles unit's one table, imported from
   `emit/styles.ts`. The validator also imports `FLAG_COMPARISONS` and `namedStyles` from `emit/screen-model.ts` and
   `COLOR_VALUES` from `emit/value.ts`. That is the same reverse layering WO8c accepted for realisation, and I chose it
   over writing a second copy.
5. **A string over its `max_len` is an error, not a warning.** The value is a literal the author wrote and the
   buffer cannot hold it. It is measured in UTF-8 bytes.
6. **Ruling 1c is reported once per container**, at its binding. A container fixed by a template is reported once
   however many instances there are. A bound position with children replaces the anchored-child diagnostic for that
   container; a bound size keeps it.

### Beyond the letter of a line item, inside its objective (disclosed)

- **A named style on a drawing element** is now refused in `validate`. `generate` always refused it. It sits beside
  the `style_*` item. Test: `a drawing element has no object to style…`.
- **Files outside the listed box, each a spelling move or a call-site change with byte-identical output:**
  - `generate.ts`, `check-project.ts`, `generator/index.ts`: the refusal-policy rename call sites;
  - `emit/ui-hpp.ts`: the descriptor spelling moved to `mangle.ts` and is re-exported;
  - `emit/editor-registry.ts`: spells `EDITOR_REGISTRY_FUNCTION`;
  - `resolver/resolve.ts`: `spans`;
  - `test/generated_fixture/widgets/slider/slider.xml`: the redundant `x="0"`, which its own comment attributed to
    this defect.
- **Disclosed fixture output change:**
  - `ui_obj_track_readout.set_coords(0, 16, 20, 10);  // x: set by its binding below` (it was `40, 16, …`). The
    runtime position is unchanged, because `bind_x(&ui_subject_knob_x, 40)` applies 40 + 5 at registration.
  - `ui_scene.json` changes the matching `rect[0]`.
  - Nothing else in any golden or fixture changed.
- **Emission refusals now unreachable, and left in place.** Deleting them was allowed, not required; they are defence
  in depth, and removing them changes shared signatures the editor target uses.
  - `placeAll`'s bound-container refusal (`screen-model.ts`);
  - `drawCallStep`'s `MISSING_REQUIRED` (`screen.ts`);
  - `flagComparison`'s three refusals;
  - `styleLines`' two refusals;
  - `subjects.ts`' `initialValueFor` refusals.

  The `templateParameters` filter in `writtenProperties` is now dead code; it is left for the same reason.

### End to end through the built CLI

- A copy of the fixture: `validate` and `generate` both exit 0, and the output is byte-identical to the committed
  fixture apart from the stamp.
- Seeded with a misspelt `<builtin>`, a bound box with a child, and an unsized box: `validate --json` and
  `generate --json` report **the same nine diagnostics at the same locations**. They differ only in the severity of
  `DRAWING_ELEMENT_NEEDS_OBJECT` (a warning in `validate`, an error in `generate`, per decision 1). `generate` wrote no files.

### Findings (not fixed, not filed)

1. **522 of U8G2's 2039 fonts cannot be declared as `<builtin>` at all.** Their names contain capitals
   (`u8g2_font_helvR08_tr`), and the `<builtin name>` doubles as the §13.4 identifier, which must be lowercase, so
   the declaration gets `U8G2GL_INVALID_NAME`. → **Chief Architect**: separate the font's U8G2 symbol from its U8G2GL
   name (for example `<builtin name="helv8" symbol="u8g2_font_helvR08_tr"/>`), or relax §13.4 for fonts.
2. **The legacy `u8g_font_*` macros** (191 aliases in `u8g2.h`) would compile but are not in the list, so they are
   refused. → PA or Chief Architect: whether to accept aliases.
3. **`truncate` on a `<style>` in a 0.4 document is silently ignored.** It is not told why: the [D-19] message in
   `validate-schema.ts` is only part of the **0.3** migration text. More generally, unknown `<style>` attributes are
   never reported. The work order's premise that the validator rejects it is off. → PA.
4. **`style_*` keys are accepted for any setter prop** (`style_text="hi"` builds), not only for §10's nine style
   properties. I kept emission's rule rather than choose. → Chief Architect: should `style_` be restricted to §10?
5. **A box's `radius` is not checked against its own size.** Ruling 6 bounds what is drawn, and a rounded box draws
   inside its rectangle, so `radius="500"` on a 10×10 box validates. → PA.
6. **A string subject with no `max_len` is not length-checked.** Its capacity is `U8G2GL_MAX_STRING_LEN`, a runtime
   macro the build can override, so the generator cannot know it.
7. **The manifests declare `fmt="bind_text_fmt"` on the string overload of `bind_text`** (`u8g2gl_obj.xml`,
   `u8g2gl_label.xml`), although the runtime overload takes none. The validator now refuses any format on a string, so
   this is harmless, but the manifest misstates the API. → manifest fix (outside the box).
8. **The validator now imports from `generator/emit/`** (`styles.ts`, `screen-model.ts`, `value.ts`) as well as
   `generator/realise/`. This extends WO8c's layering wart; move these tables to a neutral module at the end-of-PR
   review.
9. **`ui_init`, `ui_subjects_init` and `ui_styles_init` are fixed generated names outside the collision table.** No
   family can produce them today, because every family has an underscore-delimited prefix; add them if the table is
   meant to be literally total. The work order named only the descriptor and `ui_editor_registry`.

### Diff boundary

`git diff --name-only 5f69d25..HEAD` (42 files):

```
cli/src/core/generator/{check-project,generate,index}.ts
cli/src/core/generator/emit/{editor-registry,placement,screen-model,styles,ui-hpp}.ts
cli/src/core/parser/{parse-globals,parse-widget-manifest}.ts
cli/src/core/resolver/{drawn-extent,geometry-bindings,index,mangle,resolve}.ts
cli/src/core/schema/{diagnostic,globals}.ts
cli/src/core/validator/{index,validate,validate-geometry,validate-not-yet-supported,validate-realisation,
    validate-references,validate-schema,validate-types,validate-widget-props}.ts
cli/src/data/u8g2-fonts.json
cli/src/node/{build-catalogue,font-symbol-builder}.ts
cli/test/generator/{emit-screen,manifest-fixes}.test.ts
cli/test/resolver/mangle.test.ts
cli/test/validator/{geometry-contract,not-yet-supported,one-pipeline,types,validator-hardening,widget-props}.test.ts
test/generated_fixture/generated/ui_screen_bounds.cpp
test/generated_fixture/generated_editor/ui_scene.json
test/generated_fixture/screens/screen_bounds.xml
test/generated_fixture/widgets/slider/slider.xml
```

Runtime C++, the manifests, `docs/`, `PROGRAM*.md` and `.agents/rules` are untouched. I changed eight existing tests,
none of them weakened:
- the mechanical rename in `geometry-contract` and `not-yet-supported`;
- the WO10 gap pin in `manifest-fixes`, which now asserts the gap is closed;
- the radius test in `one-pipeline`, where ruling 6 reverses "unbounded";
- one message assertion in `types`;
- one offendingText assertion in `emit-screen`;
- a styled pixel in `widget-props`, which is now refused as `generate` refused it;
- the table order in `mangle`.

Scratch files are under `tmp/wo11b-*`, which is git-ignored. The base worktree was removed after use.
