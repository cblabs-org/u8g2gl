---
work_order: WO7
project: pr-04-generator
title: "Composite expansion and identifier mangling"
branch: u8g2gl-generator/wo7-composite-expansion
base: u8g2gl-generator/wo6-resolver
complexity: standard
status: complete
---

# WO7 — Composite expansion and mangling

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo7-composite-expansion`
**Base**: `u8g2gl-generator/wo6-resolver`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Isomorphic core. Deterministic: document order, never
map or set iteration order where it reaches output.

## Design authority

design_spec §6.4, §8.3, §13.4, §13.6 steps 1–3, [D-18], [D-20]. Element identity
(ui_spec §16.1) is settled — **do not synthesise names**. Where this work order
and the spec disagree, **stop and report**.

---

## Objective

A screen's tree expanded so it contains only concrete elements, with every name
mangled to its C++ identifier and every geometry resolved against its real
container.

## Line-Item Instructions

- [x] **Bind arguments to `<api>` props:** supplied attributes, then declared
      defaults; a missing required prop is an error.
- [x] **Substitute `$prop`** through the `<view>` subtree. A `type="subject"` prop
      substitutes the subject *name*, which the enclosing `bind_*` then resolves;
      a name that is not a declared subject is a clear error at the instantiation
      site (§6.4).
- [x] **Prefix names** with the instance name, recursively for nested composites
      (`bar_clk_digits`).
- [x] **Resolve geometry against the container** using WO6's resolver:
      `#parent_*` and anchors inside the subtree measure the instance's resolved
      geometry. Remove the "no absolute check at a composite's top level" gap in
      `validate-geometry.ts`, now that the size is known per instance.
- [x] **Mangling (§13.4):** the full table — screen functions, objects, composite
      children, subjects (`ui_subject_*`, `ui_set_*`), fonts, images, styles.
      Reserved prefixes and C++ keywords. **A collision after mangling is a hard
      error naming both sources** — never a silent rename.
- [x] Provenance: every expanded node keeps its original source location and the
      instantiation chain, so later diagnostics can point at both.
- [x] **Carried from WO3 — type-check composite interiors.** `validate-types.ts`
      walks only screens. Binding types inside a composite's `<view>` can only be
      checked after `$subject` substitution, so run the types pass over the expanded
      tree, reporting at the interior element with the instantiation site attached.
- [x] **Carried from WO5a — flag values are never checked.** `<bind_flag_if_*>` with
      `flag="hiden"`, or with no `flag` at all, validates silently. §8.4 fixes the set at
      `hidden` and `disabled`; an unknown or missing flag is an error with a near-miss
      suggestion. Check it in the same types-pass walk.
- [x] **Carried from WO5b — the parser drops `extends` on a composite.**
      `parse-widget-manifest.ts` sets `extends` only when a manifest has no `<view>`,
      so `<widget extends="…"><view>` silently loses it and WO5b's PR-08 refusal for a
      composite with its own C++ class cannot fire from real XML. Keep `extends` as
      written on a `<view>` manifest. The registry still supplies `u8g2gl_obj` to a
      composite that declares none. Add an end-to-end test: that XML now produces
      `U8G2GL_NOT_YET_SUPPORTED`, a warning in `validate` and an error in `generate`.
- [x] **Carried from WO5b — collections must warn, not error, in `validate`.** Pass 2
      of `validate-references.ts` reports a declared collection child such as
      `<column>` as `U8G2GL_UNKNOWN_COMPONENT`, so decision 1's journey split does not
      hold for collections. A child tag that the parent's effective manifest declares
      as an `<element>` is known; only the not-yet-supported policy reports it. An
      undeclared child tag is still unknown.

## What WO6 built, and what is not yours

WO6 delivered the resolver in `cli/src/core/resolver/` (`expression.ts` evaluator,
`resolve.ts` anchors and resolved model with provenance), used by
`validate-geometry.ts` and by `generate()`. **Build expansion on it; do not write a second
evaluator or a second anchor resolver.** Read WO6's Completion Report for the model shape.

WO6 also surfaced geometry-contract gaps — silent deferral of unresolved coordinates,
under-determined axes, unchecked `hcenter` values, constant shadowing, anchors on
non-rectangular elements, bounds checked only on the first target. **Those are held for a
proposed WO7b and are outside this work order.** If expansion makes one of them harder or
easier to fix, say so in the Completion Report; do not fix it here.

## Strict Boundary Box

**In scope:** `cli/src/core/resolver/` (expansion and mangling modules);
`cli/src/core/validator/validate-geometry.ts` (composite top-level gap only);
`cli/src/core/validator/validate-types.ts` (expanded-tree walk only);
`cli/src/core/parser/parse-widget-manifest.ts` (keep `extends` on `<view>` manifests
only); `cli/src/core/validator/validate-references.ts` (declared collection children
only);
`schema/diagnostic.ts`; tests; this WORKORDER.

**Do NOT touch:** realisation, flattening, capacities (WO8); emission; runtime;
the name policy.

---

## Testing Requirement

- [x] The §13.12 worked example's `status_bar` expands to the identifiers and
      resolved geometry shown there (`bar_location` 0,0,204,11; `bar_wifi_icon`
      204,0,12,11; `bar_clock` 216,0,40,11).
- [x] Two instances of one composite produce distinct, non-colliding identifiers.
- [x] `a_b` at screen level colliding with child `b` of instance `a` is a hard
      error naming both.
- [x] Subject indirection resolves to the concrete subject; a non-subject name
      fails at the instantiation site.

## Verification Requirement

- [x] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-14. **Code commit:** `a19b65a` on
`u8g2gl-generator/wo7-composite-expansion`, not pushed. **Status `complete`**, with
one important caveat: the mangling module is built and tested but **nothing in
`validate` or `generate` calls it yet**, because both call sites are outside this
Boundary Box. See F1.

The worker was interrupted once by an API usage limit, with everything uncommitted.
The tree was left untouched. On resuming I re-derived the state from `git status` and
`git diff`, finished the work, and committed it as one commit.

### Authorization

Checked from committed files, not from the dispatch prompt:
- Front matter: `project: pr-04-generator`, `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the
  twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- The status log records "WO7 dispatched on `u8g2gl-generator/wo7-composite-expansion`".

Nothing was missing or inconsistent.

### Test counts

| Suite | Before (`42e8264`) | After (`a19b65a`) |
|---|---|---|
| `npx vitest run` | 550, 38 files | **596**, 42 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | 0 (no C++ touched) |
| `ctest --test-dir build` | 284, 1 known skip | 284, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

Where the 46 new tests are:

| File | Tests |
|---|---|
| `test/resolver/expand.test.ts` | 17 |
| `test/resolver/mangle.test.ts` | 12 |
| `test/validator/expanded-tree.test.ts` | 16 |
| `test/integration/classed-composite.test.ts` | 1 |

- **No existing assertion changed.** One stale comment in `not-yet-supported.test.ts`
  was updated.
- **I did not run the new tests against the base.** The resolver tests import modules
  that do not exist there, so they cannot pass there. For the validator and integration
  tests, "fails at base" is my reading of the old code, not a run.

### Per line item

**1. Bind arguments** — `expand.ts`, `bindArguments`.
- For each prop the composite **declares**, the value is the instance's attribute if
  it is present and non-empty; otherwise the declared default.
- Inherited `u8g2gl_obj` props are not template parameters, and are not bound.
- A required prop with neither → `U8G2GL_MISSING_REQUIRED` at the instance element.
  The wording is identical to Pass 4's, so the two read as one fact.
- Bound arguments are recorded on the instance as
  `arguments: PropArgument[] { prop, type, value, from: 'argument'|'default', loc }`,
  in declaration order.

**2. Substitute `$prop`** — `expand.ts`, `substituteText`. Applied to every attribute
except `name`, to `style_*` overrides, and to directive values (`subject`, `ref_value`,
`flag`, `screen`, `callback`, and a `<style>` child's `name`).
- **Whole value `$p`:** replaced by the argument as written, of any type. If `p` is
  optional and unbound, the attribute is **left unset**, as if the template had not
  written it.
- **`$p` inside a longer value:** replaced only when `p` is an `int` prop that has a
  value, and then parenthesised: `$gap * 2` with `gap="1 + 2"` becomes `(1 + 2) * 2`,
  which resolves to 6. Anything else stays as written (D3).
- **`$p` naming no declared prop:** new code `U8G2GL_UNKNOWN_PROP` at the reference,
  with `$`-spelled suggestions. Reported once, however many instances use it.
- **Subject indirection** is covered under "How `$prop` and subject indirection
  resolve" below.

**3. Prefix names** — `mangle.ts`, `childIdentifier`, applied in `expand.ts` step 2.
- An element's identifier is its name prefixed with the innermost enclosing instance's
  identifier, joined by `_`.
- Because an instance's own identifier is already prefixed, nesting composes:
  `bar` → `bar_clk` → `bar_clk_digits` (tested).
- `name` is never substituted and never synthesised. An element with no name gets
  identifier `''` and no table entry.

**4. Geometry against the container.**
- An expanded instance node's element children are its **expanded template**, followed
  by any elements written inside the instance.
- WO6's `resolveElements` therefore resolves the template inside the instance's
  resolved box. **There is no second evaluator and no second anchor resolver.**
- `resolve.ts` gained one optional, additive parameter: a `DiagnosticAnnotator`, which
  lets a caller append the instantiation chain or suppress a repeat.
- `validate-geometry.ts` now closes the composite top-level gap — see "How composite
  geometry reaches `validate-geometry.ts`" below.

**5. Mangling** — `mangle.ts`, `mangleIdentifiers`. The table, the reserved names and
the collision rule are set out below. Tested directly; not yet called by `validate` or
`generate` (F1).

**6. Provenance** — covered under "Expanded-tree shape and provenance" below.

**7. WO3 carry: type-checking composite interiors.**
- `validate-types.ts` now runs `expandScreens` and walks the expanded tree.
- Each diagnostic is located at the interior element's attribute, in the composite's
  own file, with the chain appended. For example:
  `… (in instance 'readout' of <wd_readout> at screens/screen_home.xml:3:9)`.
- Expansion's diagnostics are reported from this pass (D6).

**8. WO5a carry: flag values**, in the same walk.
- Missing or empty `flag` → `U8G2GL_MISSING_REQUIRED` (`offendingText: 'flag'`).
- Any other value outside `hidden` / `disabled` → `U8G2GL_INVALID_ENUM_VALUE`, with
  suggestions (`hiden` → `['hidden']`).
- A `$`-reference not yet substituted is not checked.
- Inside a composite, the diagnostic names the instance.

**9. WO5b carry: parser `extends`.**
- `parse-widget-manifest.ts` reads `extends` once and keeps it on both shapes.
- A composite that declares none still has none. The registry's `u8g2gl_obj` default is
  unchanged (tested through `chain`).
- End to end, through the built CLI (`classed-composite.test.ts`),
  `<widget name="card" extends="u8g2gl_obj"><view>…`:
  - `validate` exits 0, with exactly one diagnostic: `U8G2GL_NOT_YET_SUPPORTED`,
    **warning**, `widgets/card/card.xml:1`;
  - `generate` exits 1 with `files: []` and the same code as an **error**.

**10. WO5b carry: collection children.**
- In Pass 2, both the screen walk and the composite walk now pass the parent element.
- A tag with no manifest of its own is **known** when its parent's own
  `api.elements` declares it (not inherited, per WO1 F8).
- Still reported as unknown: an undeclared child (`<colum>`), and a collection element
  outside its parent.
- Tested end to end: `validate` on `<wd_list><column/>` has 0 errors and one
  `NOT_YET_SUPPORTED` warning.

### Expanded-tree shape and provenance

```ts
ExpandedScreen  { screen: Screen; elements: ExpandedElement[] }
ExpandedElement {
  node: WidgetNode;              // $props substituted; for an instance, element children
                                 //   = expanded template ++ elements written inside it,
                                 //   directives first. node.loc is the SOURCE location.
  source: WidgetNode;            // the element exactly as written
  name: string;                  // as written, '' if none
  identifier: string;            // §13.4, '' if unnamed
  instantiation: InstantiationSite[];  // outermost first; [] at screen level
  arguments?: PropArgument[];    // present iff an expanded composite instance
  children: ExpandedElement[];   // same order as node's element children
}
InstantiationSite { tag; name; identifier; loc? }   // loc = the instance element
```

- **Source location:** `node.loc` and every `attributeLocs` entry keep the location in
  the file the element is written in. For a template child that is the composite's file.
- **Instantiation chain:** carried as `instantiation`.
- **Chain in diagnostics:** `provenance.ts` `withInstantiation()` appends it to the
  **message** only. `code`, file, line, column and suggestions are unchanged, so the
  [D-16] `Diagnostic` contract needs no new field.
- **Cycles:** a composite already on the chain is not expanded again. The cycle is
  Pass 2's `CIRCULAR_REFERENCE`.

### Mangling table as implemented

| Kind | Source | Identifier(s) | Scope |
|---|---|---|---|
| Screen functions | `<screen name="home">` | `ui_screen_home_{init,activate,deactivate,tick,render}` | global (`ui.hpp`) |
| Screen tables (§13.3) | same | `ui_screen_home_{objs,parents}` | global |
| Subject | `<int name="t">` | `ui_subject_t`, `ui_set_t` | global |
| Font | `name="small_9"` | `ui_font_small_9` | global |
| Image | `name="icon_wifi"` | `ui_image_icon_wifi` | global |
| Style (globals) | `<style name="header">` | `ui_style_header` | global |
| Style (screen-local) | same | `ui_style_header` | that screen |
| Screen-level object | `name="title"` | `title` | that screen |
| Composite child | `title` in instance `statusbar` | `statusbar_title` | that screen |
| Nested composite | `bar` → `clk` → `digits` | `bar_clk_digits` | that screen |

**Order.** Global entries come in this order: screens (in input order, functions then
tables), subjects, fonts, images, styles. Per screen: local styles, then objects
depth-first in document order (§13.3). No `Map` or `Set` order reaches output.

**Reserved names** (`RESERVED_IDENTIFIER_PREFIXES`, `CPP_KEYWORDS`): the prefixes
`u8g2gl_`, `ui_` and `wd_`; the full C++ keyword list; and `__`.
- Author-written names are Pass 7's to check, as before.
- `mangleIdentifiers` checks only **joined** composite-child identifiers, because two
  valid names can join into an invalid one. The result is `U8G2GL_INVALID_NAME` at the
  child's `name`, naming the instance. Tested cases:
  - `co` + `await` → `co_await`, a keyword;
  - `ui` + `set_x` → `ui_set_x`, a reserved prefix.

**Collision rule.**
- Two entries with the same identifier in scope and **different declaration keys** give
  `U8G2GL_NAME_COLLISION`, severity error.
  - It is located at the later source in document order.
  - The message names both sources with their locations and instantiation chains.
  - It says the generator never renames.
  - Both entries stay in the table as written.
- **Scopes:** global entries are visible in every screen; objects and local styles are
  per screen, so one element name on two screens is fine.
- **Same key twice is not a collision:** a name declared twice is Pass 7's
  `DUPLICATE_NAME`. A screen style with a global style's name is its override.

### How `$prop` and subject indirection resolve, and where errors go

- **Indirection.** `title_subject="station_name"` is bound. The template's
  `bind_text="$title_subject"` becomes `bind_text="station_name"`, so every later pass
  sees the concrete subject.
- **Nested indirection** composes, because each instance's arguments are substituted in
  its enclosing scope first:
  `clock_bar.clock_subject` (default `system_time`) → `clk time_subject="$clock_subject"`
  → `digits bind_time="system_time"`.

| Error | Code | Located at |
|---|---|---|
| Subject-prop argument (supplied or default) that is not a declared subject | `UNKNOWN_SUBJECT` | the **instantiation site**: the instance's attribute, or the instance element for a default; message says "is given" / "defaults to"; outer chain appended |
| Non-subject prop reaching a `bind_*` or `subject=` position with a non-subject value | `UNKNOWN_SUBJECT` | the same site, same rule |
| Missing required prop | `MISSING_REQUIRED` | the instance |
| `$name` naming no prop | `UNKNOWN_PROP` | the reference in the template, once |
| Binding type mismatch after substitution | `TYPE_MISMATCH` (Pass 5) | the interior element, chain appended |

### How composite geometry now reaches `validate-geometry.ts`

1. **Templates as declared** (unchanged).
   - Template-text defects are reported here, once, even for an unused composite. That
     covers malformed expressions, unknown constants, over-constraint, and a nested
     element overflowing a sized element inside the template.
   - The top level still has no container size here.
2. **Screens after expansion** (new).
   - `expandScreens` runs, then `resolveElements` over the expanded nodes, then
     `checkBounds`.
   - Diagnostics at an element inside an instance get the chain. Any exactly equal to a
     template diagnostic are dropped, so a template defect is not repeated per instance.
   - So `<box width="50">` at a composite's top level:
     - in a 40-wide instance is `OUT_OF_BOUNDS … containing element '<wd_panel>' is
       40px wide … (in instance 'narrow' …)`;
     - in a 60-wide instance, nothing;
     - with instances of 40, 60 and 30 wide, exactly two diagnostics, for `a` and `c`.
3. **The [D-20] bound-container check** is unchanged (F7).

### §13.12 worked example — what the test asserts

§6.4's `status_bar` is parsed from XML. §13.12's screen is resolved against
`U8G2_SH1122_256X64_F_3W_HW_SPI` (256×64).
- **Identifiers:** `bar`, `rule`, `msg`; `bar`'s children are `bar_location`,
  `bar_wifi_icon`, `bar_clock`.
- **Geometry (x, y, w, h):**

  | Element | Geometry |
  |---|---|
  | `bar` | 0,0,256,11 |
  | `bar_location` | **0,0,204,11** |
  | `bar_wifi_icon` | **204,0,12,11** |
  | `bar_clock` | **216,0,40,11** |
  | `msg` | 0,16,256,12 |

- **Arguments:** `bind_text` = `station_name`; font defaults to `small_9`; the wifi flag
  directive's subject defaults to `wifi_connected`.
- **Provenance:** `bar_location`'s source is `widgets/status_bar/status_bar.xml:8`, and
  its chain is `[{status_bar, bar, bar, screens/screen_home.xml:3:9}]`.
- **Diagnostics:** none from expansion, none from resolution.
- **Deviation:** the clock uses `format="hh_mm"`, not §6.4's `"HH:MM"` (F12).

### Decisions I made

- **D1 — flags reuse existing codes:** `MISSING_REQUIRED` for no flag,
  `INVALID_ENUM_VALUE` for an unknown flag. Both conditions match those codes' meaning,
  and no new stable code is needed.
- **D2 — one new code, `U8G2GL_UNKNOWN_PROP`.** No existing code means "a `$name` the
  composite does not declare". Before this, such a reference was silently skipped.
- **D3 — where `$prop` substitutes.**
  - A whole value substitutes any type.
  - Inside an expression, only `int` props substitute, parenthesised. Splicing a string
    or font name into an expression has no meaning; parentheses keep precedence.
  - An unbound optional whole-value reference unsets the attribute.
  - §8.3 and §13.6 say "substitute" and are silent on these cases.
- **D4 — instance children order:** the template first, then elements written inside
  the instance. The template is the composite's own content; nested author elements
  stay in the screen scope and are not prefixed.
- **D5 — chain as message prose; template defects once.** This avoids changing the
  `Diagnostic` contract and repeating one defect per instance.
- **D6 — Pass 5 reports expansion's diagnostics except `MISSING_REQUIRED`,** which
  Pass 4 already reports per instance in the same words. Pass 6 reports none of
  expansion's diagnostics.
- **D7 — mangling scopes follow translation units:** `ui.hpp` is global, each screen
  unit is local. A local style of a global style's name is an override.
- **D8 — expansion is not the name policy:** it never synthesises names, and an unnamed
  element has no identifier.
- **D9 — `resolve.ts` gained one optional annotator parameter.** It is additive, and
  every existing call is unchanged. This is how the chain reaches resolver diagnostics
  without a second resolver.

### Spec disagreements (recorded, not chosen)

- **S1 — `wd_` is both reserved and conventional.** §6.6 says user element tags "carry
  `wd_` by convention", while §13.4 reserves `wd_`. Pass 7 applies the reservation to
  composite tags, so `<widget name="wd_card"><view>` is `U8G2GL_INVALID_NAME`. My
  end-to-end fixture was renamed to `card` to get past it. This predates WO7, and the
  file is outside the box. → **Chief Architect**.
- **No disagreement found** between this WORKORDER and §6.4, §8.3, §13.4 or §13.6.
  - §13.6 step 4 says "the container's declared geometry"; the WORKORDER says "the
    instance's resolved geometry". For a composite these are the same box.

### Effect on the proposed WO7b gaps

- **Silent deferral (WO6 F4) — easier.** After expansion, a coordinate still deferred in
  a screen can no longer be an unexpanded `$prop` or an unsized composite top level. It
  is a real defect, apart from an unbound optional prop or a non-int prop inside an
  expression. WO7b can make deferral an error on the **expanded** tree and leave the
  template pass (Step 2) deferring.
- **Under-determined axes (F2) — easier.** They can now be judged per instance.
- **First target only (F1) — unchanged.** Per-instance checks still run on
  `targets[0]` only.
- **`hcenter` values, constant shadowing, `<int>` at declaration, anchors on
  non-rectangular elements — unchanged.** Expansion copies these attributes verbatim.
  Note for WO7b: every such check must run on the template **or** on the expanded tree,
  not both, or it will report twice. The `templateReported` dedupe only covers
  diagnostics equal word for word.

### Out-of-scope findings (not fixed, not filed)

1. **F1 — `mangleIdentifiers` is not called by `validate` or `generate`.** Wiring it
   needs `validate-identifiers.ts` or `generator/generate.ts`, both outside the box.
   - Pass 7's older one-level check (`3a`) still runs. It sees screen-level-versus-child
     collisions only, not nested ones, reports at the instance, and names one source.
   - So today the "hard error naming both" exists only in the module.
   - Recommendation: replace Pass 7 `3a` with one `mangleIdentifiers` call on the
     expanded tree, and have `generate` refuse on its diagnostics. → **PA, WO8**.
2. **F2 — `generate()` resolves unexpanded screens** (`resolveScreens`). So
   `GenerateResult.resolved` has no composite interiors. WO8 should run `expandScreens`
   once and resolve the expanded nodes (also closing WO6 F11: no third resolve).
3. **F3 — expansion runs twice in `validate`** (Passes 5 and 6), because
   `ValidateInput` has nowhere to carry one expansion. The cost is small; thread one
   through when `checkProject` is next touched.
4. **F4 — font, image and style arguments are not checked after substitution.** Pass 2
   skips `$` values in templates and never sees substituted ones, so
   `<status_bar font="nope">` validates. Only subject arguments are checked, in
   expansion. Pass 2 on the expanded tree would close it.
5. **F5 — enum arguments are not checked after substitution.** Pass 4 skips `$` values,
   so `long_mode="$mode"` with `mode="wobble"` validates. Same remedy as F4, in Pass 4.
6. **F6 — `hidden="$p"` cannot be substituted.** The parser turns `hidden` into a
   boolean (`attr.value === 'true'`) at parse time, so any `$` value becomes `false`
   before expansion sees it.
7. **F7 — the [D-20] bound-container check still walks unexpanded trees.** It looks one
   template level into a bound instance, but not through nested composites.
8. **F8 — the flag set is spelled in two places:** `BINDING_FLAGS` in
   `validate-types.ts`, and the literal `'disabled'` in `validate-widget-props.ts`
   (`INAPPLICABLE_FLAG`). Fold both into WO8's shared registry-helper consolidation
   (WO5a finding 2).
9. **F9 — a string prop inside longer text is not substituted** (`text="Hi $who"`, D3).
   §8.3 is silent; decide before an author relies on it.
10. **F10 — `validate-widget-props.ts` still reports a missing required prop on a
    composite instance** even when a later default could apply. This matches expansion
    today, because a required prop with a default is an odd declaration. No schema rule
    rejects one.
11. **F11 — `geometry.test.ts` keeps a composite-template test named
    "does not flag a composite template top-level child against any display".** It
    still passes, because no instance exists, but its wording now undersells the
    per-instance check. → End-of-PR readability review.
12. **F12 — §6.4's example uses `format="HH:MM"` on `<u8g2gl_clock>`,** but the clock
    manifest's enum is `hh_mm,hh_mm_ss`, so the spec example fails Pass 4. →
    **Chief Architect**.

### Diff boundary

`git diff --name-only 42e8264..a19b65a`:
- `cli/src/core/resolver/expand.ts`, `mangle.ts`, `provenance.ts` (new);
  `resolve.ts` (optional annotator only); `index.ts` (exports)
- `cli/src/core/validator/validate-geometry.ts` (per-instance check)
- `cli/src/core/validator/validate-types.ts` (expanded-tree walk, flag values)
- `cli/src/core/validator/validate-references.ts` (declared collection children)
- `cli/src/core/parser/parse-widget-manifest.ts` (keep `extends`)
- `cli/src/core/schema/diagnostic.ts` (`UNKNOWN_PROP`)
- tests: `test/resolver/expand.test.ts`, `test/resolver/mangle.test.ts`,
  `test/validator/expanded-tree.test.ts`, `test/integration/classed-composite.test.ts`
  (new); `test/validator/not-yet-supported.test.ts` (comment only)

Untouched: `docs/`, runtime `include/` and `src/`, manifests, generator, realisation,
flattening, capacities, emission, and the name policy.
