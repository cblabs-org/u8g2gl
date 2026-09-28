---
work_order: WO5a
project: pr-04-generator
title: "Manifest and validator carries: flags, bind overloads, mixed manifests, extends remedy"
branch: u8g2gl-generator/wo5a-validator-carries
base: u8g2gl-generator/wo4b-clipping-version
complexity: standard
status: complete
---

# WO5a — Manifest and validator carries

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval" (owner's own words, timestamped), that
`../PROJECT.md` records **the WO5 split as approved at the owner checkpoint**
("Checkpoint rulings"), and that this WORKORDER's `status` is `dispatched`. Otherwise
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo5a-validator-carries`
**Base**: `u8g2gl-generator/wo4b-clipping-version`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. `src/core/` stays isomorphic.
Element knowledge is data, never code ([D-17]).

## Design authority

design_spec §6.2, §6.5, §8.4, §13.1 **on `main` @ `ef73776`** (read with
`git show main:docs/design_spec.md`); [D-18]. **Do not add manifest vocabulary** —
`setter=` naming a prop on a drawing element's `<bind>` stays as built (owner ruling,
recorded as Q-9). Where this work order and the spec disagree, **stop and report**.

---

## Objective

Close the validator and manifest findings carried from WO1 and WO3 as one reviewable
behaviour change, before WO5b adds the `generate` command on top.

## Line-Item Instructions

- [x] **Flags on drawing elements (from WO3).** `<bind_flag_if_*>` flags are fixed by
      §8.4 (`hidden`, `disabled`), not declared per element. `hidden` is valid on every
      element. `flag="disabled"` on a `draw=`-only element is an error — nothing to
      disable. Decide "drawing element" through the registry, never a tag list.
- [x] **Binding overloads (from WO3).** Delete `bind_text_int` from the manifests.
      Declare `bind_text` once per accepted subject type (`type="string"` and
      `type="int"`, same `setter` and `fmt`). The registry merges bindings by
      (name, type); the validator accepts a subject type if any binding of that name
      declares it; remove WO3's same-setter inference. A string subject on an int-only
      binding must fail again. Rebuild the manifest bundle.
- [x] **Mixed manifests (from WO3).** A manifest declaring both `setter=` and `draw=`
      props is an error in the schema pass ([D-18]: one emission target or the other),
      naming one prop of each kind.
- [x] **Unknown `extends` says what to do (Chief Architect ruling on F3).** The
      registry's error stays. Its message (`manifest-registry.ts`, currently
      "Manifest <tag> extends unknown element 'parent'.") adds the remedy §6.5 states:
      give the class a manifest — an `<api>` with no new props is enough. Keep the
      near-miss suggestions. Assert the remedy text in a test.
- [x] **F5 (from WO1) — single-file shadowing.** `validate` pointed at a single
      framework manifest file (e.g. `include/u8g2gl/manifests/u8g2gl_label.xml`)
      reports a spurious shadowing error. A single file that *is* the bundled framework
      manifest is not a project copy.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/` (the carries above), `cli/src/core/manifest/`
(bindings merge by name and type; the `extends` message), `cli/src/node/cli.ts`
(single-file path, F5 only), `include/u8g2gl/manifests/*.xml` and
`cli/src/data/manifests.json` (`bind_text` overloads only), `cli/test/`,
`schema/diagnostic.ts` (new codes only), this WORKORDER.

**Do NOT touch:** runtime C++; the `generate` command, `loadProject()` extraction and
not-yet-supported policy (WO5b); new manifest vocabulary (Q-9).

---

## Testing Requirement

- [x] `flag="disabled"` on `<u8g2gl_box>` errors; `flag="hidden"` on it validates.
- [x] `bind_text` accepts string and int subjects; no binding named `bind_text_int`
      exists; a string subject on an int-only binding fails.
- [x] A manifest mixing `setter=` and `draw=` props errors, naming both.
- [x] Unknown-`extends` message contains the manifest remedy.
- [x] Single-file `validate` of a framework manifest reports no shadowing.

## Verification Requirement

- [x] C++ build zero warnings; `ctest` all pass (unchanged)
- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-14. **Code commit:** `a31527c` on
`u8g2gl-generator/wo5a-validator-carries`, not pushed.

### Authorization

I checked the committed files, not the dispatch prompt:
- The front matter named `project: pr-04-generator` and was `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the
  twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- "Checkpoint rulings", item 4, records **"WO5 split into WO5a (findings) and WO5b
  (`generate`) — APPROVED."**
- The status log records WO5a as dispatched.

Nothing was missing or inconsistent. I found no disagreement between this work order
and design_spec §6.2, §6.5, §8.4 or §13.1 on `main` @ `ef73776`, so nothing stopped
the work.

### Test counts

| Suite | Before (`9fe078f`) | After (`a31527c`) |
|---|---|---|
| `cmake --build build` warnings | 0 | **0** |
| `ctest --test-dir build` | 284 pass, 1 known skip | **284 pass**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |
| `npx vitest run` | 406, 29 files | **418**, 29 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint and test type-check) | clean | clean |

The +12 tests:
- registry: +1
- types: +4
- schema: +1
- widget-props: +4
- CLI integration: +2

No runtime C++ was touched.

**Checked against the base.** I made a throwaway worktree at `9fe078f` under git-ignored
`tmp/`, since removed, and copied the five updated test files into it. **8 tests fail
there**, one or more per line item:
- registry: bindings merge, unknown-`extends` remedy, no `bind_text_int`
- types: string subject on an int-only binding sharing a setter
- schema: mixed manifest
- widget-props: `disabled` on `<u8g2gl_box>`; custom `draw=` element
- CLI: single-file framework manifest

Every control passes at the base too:
- `hidden` on a box
- `disabled` on a label
- a string subject on `bind_text`
- a single-file project copy still reports shadowing

### Per line item

**1. Flags on drawing elements.** This is Step 5 of `checkInstanceProps` in
`validate-widget-props.ts` (Pass 4).
- A `<bind_flag_if_*>` child with `flag="disabled"` on a drawing element reports the
  new code `U8G2GL_INAPPLICABLE_FLAG`. It is located at the directive, with
  `offendingText: 'disabled'`.
- "Drawing element" is `isDrawingElement(manifest)`: the registry's effective manifest
  has no `view`, and its **declared** props include a `draw=` prop and no `setter=`
  prop. This is the test the schema pass's `extends` rule already uses. No tag appears
  in the code.
- A test proves this: a custom `wd_dot` with `draw=` props is rejected exactly like
  `<u8g2gl_box>`.
- `hidden` is never rejected. `disabled` on a class-backed element (`<u8g2gl_label>`)
  is accepted.
- Pass 4 also walks composite `<view>`s, so the rule holds inside composites.

Message:
`Flag 'disabled' in <bind_flag_if_eq> cannot apply to <u8g2gl_box>: it is a drawing element (draw= props only) with no object to disable. Only 'hidden' applies to a drawing element (§8.4).`

**2. Binding overloads.**
- **Manifests.** In `u8g2gl_obj.xml`, `u8g2gl_label.xml` and `u8g2gl_button.xml`,
  `<bind name="bind_text_int" type="int" …>` became `<bind name="bind_text" type="int" …>`.
  Setter (`bind_text`) and `fmt` (`bind_text_fmt`) are unchanged.
  `npm run build:manifests` rebuilt `cli/src/data/manifests.json`, the bundle drift
  guard is green, and the cross-tests pass. Each `bind_text` overload still finds its
  C++ `bind_text(u8g2gl_subject_<type>_base*…)`.
- **How bindings merge in the registry.**
  - `mergeByName` became `mergeByKey(inherited, own, keyOf)`. Props use
    `propKey = name`; bindings use `bindingKey = name + "\n" + type`.
  - Inherited order is kept. A child declaration with the same (name, type) replaces
    the parent's in place. A binding with a known name but a new type is appended.
  - So `u8g2gl_label`'s two `bind_text` declarations replace `u8g2gl_obj`'s two in
    place, and the effective list holds `bind_text:string`, then `bind_text:int`.
  - The doc comment on `EffectiveManifest` states that a binding name may now appear
    once per accepted type.
- **How the validator matches a subject type** (`validate-types.ts`).
  - `acceptedTypes`, WO3's same-setter inference, is deleted.
  - `bindingsByAttribute` groups the effective bindings by `name`, in first-declaration
    order. Each attribute present on the node is checked once.
  - A subject is accepted if its type is among the `type`s of **that name's**
    `<bind>`s. The `setter` is no longer read.
  - A mismatch lists every declared type:
    `… incompatible with 'bind_text' on <u8g2gl_label> (expected 'string' or 'int').`
  - Format checks run once per distinct `fmt` attribute across the overloads, so a
    shared `bind_text_fmt` is not reported twice (tested).
  - A string subject on an int-only binding fails again. The test uses a custom
    manifest in which int-only `bind_count` shares its setter with string
    `bind_caption`, which is exactly what WO3's inference would have accepted.

**3. Mixed manifests.** In `validate-schema.ts` §5, the new code
`U8G2GL_MIXED_EMISSION_TARGETS` fires when a plain-widget manifest has one prop
declaring only `setter=` **and** another declaring only `draw=`. Message, for the
test's `wd_hybrid`:

`Widget 'wd_hybrid' mixes emission targets: prop 'level' declares setter="set_level" and prop 'x' declares draw="u8g2gl_draw_pixel". A manifest declares setter= props (an element with a class) or draw= props (a drawing element), never both ([D-18], §13.1).`

`offendingText` is `'level, x'`, and the location is the manifest. See D3 for how it
interacts with the `extends` rule.

**4. Unknown `extends`.** The code (`U8G2GL_UNKNOWN_WIDGET`), location, offending text
and `findClosest` suggestions are unchanged. The exact new message:

`Manifest <${tag}> extends unknown element '${parentTag}'. 'extends' must name an element that has a manifest (§6.5). If '${parentTag}' is a C++ class, give it a manifest — an <api> with no new props is enough.`

The registry test asserts the remedy sentence verbatim, with the suggestion `wd_base`
still present.

**5. F5: single-file shadowing.** Change in `cli.ts`:
- The new `bundledFrameworkFilename(path)` resolves the path. It returns the filename
  when the last two directories are `u8g2gl/manifests`, which is
  `FRAMEWORK_MANIFEST_PATH`, the include path the manifests ship under, **and** the
  bundle carries a manifest of that filename.
- Such a file is not pushed to the project list. It **stands in for its bundled copy**
  in the framework list passed to the registry, matched on
  `loc.file === 'u8g2gl/manifests/<file>'`.
- So `validate include/u8g2gl/manifests/u8g2gl_label.xml` reports no shadowing, and
  nothing is located in that file.
- A byte-identical copy at `<project>/widgets/u8g2gl_label/u8g2gl_label.xml`, validated
  as a single file, **still** reports `U8G2GL_SHADOWED_FRAMEWORK_MANIFEST` (tested).

### Existing test assertions changed

- **`manifest-registry.test.ts`, "merges bindings by the same rule as props"**:
  rewritten as "merges bindings by name and type …". The old test asserted that a
  child's string `bind_x` **replaced** the parent's int `bind_x`. That is exactly the
  behaviour this work order reverses: they are now two overloads.
  - The new test pins that a same-(name, type) override keeps its position
    (`bind_y:int` with the child's setter).
  - It also pins that a new type is appended, giving the full order
    `bind_x:int, bind_y:int, bind_x:string, bind_z:int`.
- **`manifest-registry.test.ts`, "diagnoses an unknown extends target …"**: one
  assertion added, for the remedy. Nothing removed.

No other existing assertion changed. `types.test.ts` "accepts an int subject on
bind_text, through the bind_text overload set (§8.4)" is untouched and now passes
through the declared `type="int"` overload rather than inference.

### Decisions I made

- **D1 — two new codes, not reused ones.**
  - `INAPPLICABLE_FLAG`: `UNKNOWN_ATTRIBUTE` would misdescribe a child directive whose
    flag *is* in §8.4's set.
  - `MIXED_EMISSION_TARGETS`: `OVERCONSTRAINED` already means one prop declaring both.
  - Both are documented in `diagnostic.ts`. Only codes were added there.
- **D2 — the flag rule lives in Pass 4** (per-instance acceptance against the effective
  manifest), not Pass 2 or 5. Pass 4 is the pass that already walks composite views.
- **D3 — a mixed manifest gets only the mixed diagnostic**, not the `extends` ones as
  well.
  - A drawing element wants no `extends` and a class wants one, so either `extends`
    message would give contradictory advice until the author picks a target.
  - A single prop carrying both `setter` and `draw` is still only the per-prop
    `OVERCONSTRAINED`. The mixed check counts only props declaring one kind, so the
    existing "both are present" test is unaffected.
- **D4 — F5 is decided by location, and the file stands in rather than being dropped.**
  - Identity by location separates "the framework's file" from "a project's copy of
    it", which content comparison cannot do: WO1's shadowing fixture is byte-identical.
  - Standing in means an edited framework manifest is validated as edited, with
    diagnostics pointing at the real file, which is what a framework author running
    single-file `validate` wants.
- **D5 — the binding key separator is `\n`**, which no XML name or type can contain.

### Out-of-scope findings (not fixed, not filed)

1. **Flag values are never validated.** Nothing checks `flag` against §8.4's set.
   `flag="hiden"`, or a directive with no `flag`, validates silently. WO5a's rule only
   rejects `disabled` on drawing elements. An unknown-flag diagnostic with suggestions
   would be a small follow-up.
2. **The "drawing element" test now exists in three places:**
   - inline in `validate-schema.ts` (§5, the `extends` rule)
   - `isDrawingElement` in `validate-widget-props.ts`
   - the cross-test helper in `manifest-crosstest.test.ts`

   All three use the same definition today. A single exported helper on the registry
   (for example `isDrawingElement(EffectiveManifest)`) would stop them drifting. The
   Boundary Box limits `manifest/` to the merge and the message, so I did not add one.
   Candidate for WO8, whose realisation reads the same property.
3. **Stale docs mention `bind_text_int`:** `docs/ui_flows.md:174` and
   `docs/decisions/d19-label-long-mode.md:13`. They are outside the box (never edit
   `docs/`), so this goes to the Chief Architect.
4. **Consumers must now expect several bindings with one `name`.** WO8 and WO10's
   binding emission and WO11's editor thunks must choose the overload whose `type`
   matches the bound subject. Taking the first binding of that name would bind an int
   subject through the string overload. The cross-test already checks that each
   overload has a matching C++ signature.
5. **The mixed-manifest check covers plain widgets only** (schema §5). A composite
   (§4) whose `<prop>`s carry `setter=`/`draw=` is not checked. Composite props are
   template parameters and normally carry neither, so this is theoretical.
6. **Not re-checked in this work order:** WO1's F5 note also said that single-file
   mode reports `UNKNOWN_SCHEMA_VERSION ''` for any non-project file. My F5 test
   asserts only that nothing is located in the manifest file and that there is no
   shadowing, so whether that diagnostic still appears was not examined.
7. **Process note.** This WORKORDER says to *stop and report* where it and the spec
   disagree, while the dispatch prompt said to record and continue. No disagreement
   arose, so the two instructions never conflicted in practice. Worth aligning in
   future WORKORDERs.

### Diff boundary

`git diff --name-only 9fe078f..a31527c`:
- `cli/src/core/manifest/manifest-registry.ts`
- `cli/src/core/schema/diagnostic.ts` (two codes)
- `cli/src/core/validator/validate-schema.ts`, `validate-types.ts`,
  `validate-widget-props.ts`
- `cli/src/data/manifests.json` (rebuilt)
- `cli/src/node/cli.ts` (F5 only)
- `cli/test/integration/cli.test.ts`, `cli/test/manifests/manifest-registry.test.ts`,
  `cli/test/validator/schema.test.ts`, `types.test.ts`, `widget-props.test.ts`
- `include/u8g2gl/manifests/u8g2gl_button.xml`, `u8g2gl_label.xml`, `u8g2gl_obj.xml`
  (`bind_text` overloads only)

No runtime C++, `generate`, `loadProject()`, not-yet-supported policy, parser, or
`docs/` file changed, and no manifest vocabulary was added.
