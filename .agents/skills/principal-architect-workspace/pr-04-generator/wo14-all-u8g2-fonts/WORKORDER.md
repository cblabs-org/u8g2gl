---
work_order: WO14
project: pr-04-generator
title: "Every U8G2 font is usable, including the 522 whose names carry capitals"
branch: u8g2gl-generator/wo14-all-u8g2-fonts
base: u8g2gl-generator/wo13-readability
complexity: standard
status: dispatched
---

# WO14 — all U8G2 fonts usable

## Authorization

Part of PR-04 (`pr-04-generator`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's PR-04 approval with a timestamp; "Owner rulings and approval — 2026-09-28" quotes
the owner's ruling that **all** U8G2 fonts must be usable; and "Owner instruction — WO14, 2026-09-28"
quotes the instruction to implement it now. This WORKORDER's `status` must be `dispatched`.
Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo14-all-u8g2-fonts` · **Base**: `u8g2gl-generator/wo13-readability`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask. Do not push, do not tag, do not publish.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element and font knowledge is
**data**, never a hand-kept list.

## Design authority and the one divergence you must not widen

design_spec §13.4 (identifier rules), §14.1 (fonts), §13.2. **Read this carefully:** §13.4 today
requires a name matching `[a-z][a-z0-9_]*`, which is exactly what forbids the 522 U8G2 fonts whose
names carry capitals (`u8g2_font_helvR08_tr`). **The owner has ruled that all fonts must be usable,
and instructed that the code change be made now, ahead of the spec amendment**, which is the Chief
Architect's to write. So while you work, the implementation is deliberately ahead of §13.4.

That divergence is **confined to `<builtin>` font names**. Do not relax §13.4's rule anywhere else:
not for `<bdf>` names the author chooses, not for subjects, styles, images, screens, elements or
composites. If a line item seems to require that, **stop and report**.

---

## Objective

An author can name any font U8G2 bundles, and the generated C++ is still legal.

## Background

WO11b derived the valid set as data from the pinned submodule: `cli/src/data/u8g2-fonts.json`,
2039 names, cross-checked between `u8g2.h` and `u8g2_fonts.c`, with a drift test.
**522 of those names contain capitals.** A `<builtin name="u8g2_font_helvR08_tr">` is refused today
by the identifier rule before `UNKNOWN_FONT` ever gets a chance to accept it.

## Line-Item Instructions

- [x] **A `<builtin>`'s `name` is a U8G2 symbol, not an author-chosen identifier.** Validate it
      against `u8g2-fonts.json` (the existing `UNKNOWN_FONT` check) and **exempt it from §13.4's
      lowercase identifier rule**. A name that is not in the list keeps today's message and its
      near-miss suggestions. Find where the identifier rule currently rejects it and make the
      exemption explicit and commented, naming the owner's ruling — not a quiet special case.
- [x] **`<bdf>` is unchanged.** A `<bdf>`'s `name` is chosen by the author, so §13.4 still applies.
      Add a test that pins the difference, so a later reader cannot mistake the exemption for a
      general relaxation.
- [x] **The generated alias must stay a legal C++ identifier.** `fontIdentifier()`
      (`cli/src/core/resolver/mangle.ts`) spells `ui_font_<name>`. Decide and implement how a name
      with capitals is mangled — state your rule in the Completion Report, with its reason. It must
      be **deterministic**, **total** (every one of the 2039 names maps to a legal identifier), and
      **injective across the whole set**: prove with a test that maps all 2039 and asserts no two
      collide, and that every result matches `[A-Za-z_][A-Za-z0-9_]*`. Beware the obvious trap:
      lowercasing alone collides (`u8g2_font_5x7_mr` against a hypothetical `..._MR`), so check the
      real set rather than assuming.
- [x] **Collisions stay hard errors.** The mangled alias goes through the existing collision table
      like any other name; two fonts mangling to one identifier is a generate-time error naming both.
- [x] **The emitted alias and its use agree.** Whatever the alias is called, the `extern` declaration,
      the definition and every `set_font()` use spell it identically. A generated project using a
      capitalised font must compile.
- [x] **End-to-end proof:** extend the committed fixture with **one** capitalised font (for example
      `u8g2_font_helvR08_tr`) used by an element, regenerate, and let the C++ suite compile and run
      it. Goldens change for this work order; say so in the commit message.
- [x] **Legacy `u8g_font_*` macros stay refused** (WO11b f2) — unchanged here, still a bridge item.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-references.ts` and `validate-schema.ts` (the
`<builtin>` exemption only), `cli/src/core/resolver/mangle.ts` (font alias mangling),
`cli/src/core/generator/emit/fonts.ts` and any emitter that spells the alias, `cli/test/`,
the committed fixture and regenerated goldens, this WORKORDER.

**Do NOT touch:** `docs/` — the §13.4 amendment is the Chief Architect's; `PROGRAM*.md`; runtime
C++; the font-data builder (`font-symbol-builder.ts`) and `u8g2-fonts.json`, which are already
correct; any other name's validation.

---

## Testing Requirement

- [x] All 2039 names mangle to legal, unique identifiers (one test over the whole set)
- [x] A capitalised `<builtin>` validates, generates and compiles
- [x] A `<bdf>` with capitals is still refused, with §13.4's message
- [x] An unknown `<builtin>` is still refused with suggestions
- [x] Tests fail at the base; say how many fail behaviourally

## Verification Requirement

- [x] CLI `vitest`, `tsc`, lint clean; C++ `cmake --build build` zero warnings; `ctest` all pass
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: complete.** Every U8G2 font is usable. The 522 names carrying capitals validate,
generate, compile and draw; `<bdf>` keeps §13.4 in full, pinned by a test.

### The mangling rule, and why

**The rule is the identity: `ui_font_` + the name, verbatim. Nothing is folded, stripped or
case-changed.** `fontIdentifier()`'s behaviour is therefore unchanged; what changed is that it now
*has* a stated rule, with its reasoning written beside it in `cli/src/core/resolver/mangle.ts`, and
a test that holds it to the whole catalogue.

Three properties were required — deterministic, total over the 2039 names, injective across them.
The identity is the only candidate that gets all three without an argument that can rot:

1. **Total and legal by construction.** A U8G2 font name *is* a C identifier — it is the very
   symbol `u8g2.h` declares the array with. Measured over the committed catalogue: all 2039 match
   `[A-Za-z_][A-Za-z0-9_]*`, none contains `__`, none is a duplicate. Prefixing `ui_font_`
   preserves all three, so every alias is legal C++.
2. **Injective unconditionally.** The identity cannot map two names together. Every folding rule
   can. The obvious one, lowercasing, is the trap the WORKORDER named — and checking the real set
   rather than assuming gave a result worth recording: **lowercasing collides on nothing today.**
   All 2039 names are distinct when lowercased. That is exactly what makes it dangerous: its
   safety is a property of U8G2 2.36.18, not of the rule. The day U8G2 ships a `..._helvr08_tr`
   beside `..._helvR08_tr`, two fonts fold onto one alias, and the failure arrives as a dependency
   bump rather than as anything in this repository. A rule whose correctness depends on someone
   else not adding a name is not a rule.
3. **Readable, which is §13.4's purpose.** `<builtin name="u8g2_font_helvR08_tr">` becomes
   `ui_font_u8g2_font_helvR08_tr = u8g2_font_helvR08_tr`. The C++ spells the XML letter for
   letter. A case-folded alias would be the one place in generated output where it stops doing so.

**Proof** — `cli/test/resolver/mangle.test.ts`, "every U8G2 font's alias is legal and unique
(PR-04 WO14)": maps all 2039 names, asserts 522 carry capitals, asserts every identifier matches
`[A-Za-z_][A-Za-z0-9_]*` with no `__`, asserts no two collide, asserts the map is total
(2039 identifiers from 2039 names), asserts determinism, and asserts the lowercasing trap
explicitly — that folding is safe on today's catalogue and still wrong.

### Where the exemption lives

`cli/src/core/validator/validate-identifiers.ts`, at the font loop: `checkNameRule()` is skipped
when `font.kind === 'builtin'`, under a comment that quotes the owner's ruling of 2026-09-28,
explains that the name is a U8G2 symbol rather than an author-chosen identifier, and states plainly
that §13.4's wording is not yet amended so the code is deliberately ahead of the spec. It is an
explicit, reasoned exemption, not a quiet special case; the file header names it too.

**Nothing is loosened.** Pass 2's catalogue check (`validate-references.ts`, `U8G2GL_UNKNOWN_FONT`)
still holds a `<builtin>` name to the fonts U8G2 actually bundles, which is a strictly narrower
test than §13.4's shape rule — and every name it admits is already a C identifier, which is what
keeps the alias legal.

**`<bdf>` is untouched.** A `<bdf>`'s name is the author's (§14.2), so `checkNameRule()` still runs
on it. A test pins the difference with the identical string: `helvR08` is accepted as a
`<builtin>`'s suffix and refused as a `<bdf>` name with §13.4's own message. A control case asserts
subjects, styles and element names still refuse capitals.

### Collisions

Unchanged, and still hard errors. The alias is registered in `mangleIdentifiers()`'s global table
with kind `font`, so it goes through `checkCollisions()` like every other identifier and a clash
is `U8G2GL_NAME_COLLISION` naming both sources. A test asserts a capitalised font is in that table.
Note for the record: under the identity, two *different* font names cannot produce one alias, so
the reachable case is the same name declared twice — which is Pass 7's `U8G2GL_DUPLICATE_NAME`,
as before.

### End-to-end proof

`test/generated_fixture/` now declares `<builtin name="u8g2_font_helvR08_tr" />` and a
`u8g2gl_label name="caps"` on the bounds screen uses it. Regenerated goldens carry the alias in all
three places, spelled identically:

- `ui.hpp`: `extern const uint8_t* const ui_font_u8g2_font_helvR08_tr;`
- `ui_fonts.cpp`: `const uint8_t* const ui_font_u8g2_font_helvR08_tr = u8g2_font_helvR08_tr;`
- `ui_screen_bounds.cpp`: `ui_obj_caps.set_font(ui_font_u8g2_font_helvR08_tr);`

The C++ suite compiles and links those units against a stub array spelled as U8G2 spells it
(`support/fixture_u8g2_fonts.{h,cpp}`), so a case-folded alias would be a link failure rather than
a wrong pixel. `GeneratedFixture.AFontWhoseU8G2NameCarriesCapitalsIsUsable` then asserts the label
is actually drawn with that font's table. The editor journey proves it too: `ui_scene.json` carries
the name verbatim and `test_editor_parity.cpp` resolves it by that same string.

Run through the built CLI, not only the suites (PROJECT.md lesson 4):
`u8g2gl validate test/generated_fixture` → "Validation passed: 0 errors, 0 warnings"; the same
fixture on the base CLI → `Invalid name 'u8g2_font_helvR08_tr' for font`.

### Verification

| Suite | Result |
|---|---|
| CLI `npx vitest run` | **1055 passed / 62 files** (baseline 1045; +10) |
| CLI `npx tsc --noEmit` | clean |
| CLI `npm run lint` | clean |
| C++ `cmake --build build` (clean configure) | **0 warnings** |
| C++ `ctest --test-dir build` | **362/362 passed** (baseline 361; +1), one known skip `SizeOfReport.ThirtyTwoBitTarget` |

Each suite run alone, uncontended.

### Base failures (`f42ab3e`)

The two changed test files were copied into a throwaway worktree at the base and run there.
**3 tests fail, all three behaviourally** — none fails because an export or module is missing:

1. *accepts a capitalised U8G2 font in both journeys* — 1 validation error at base: the name is
   refused by §13.4.
2. *spells the alias identically in its declaration, its definition and its use* — base emits no
   files at all, because generation is refused.
3. *still refuses a `<builtin>` U8G2 does not bundle, capitals and all* — base reports
   `U8G2GL_INVALID_NAME` **as well as** `U8G2GL_UNKNOWN_FONT`; after the change only the
   catalogue error remains, which is the one an author can act on.

**Stated plainly because it matters:** the 2039-name mangling tests **pass at the base**. They had
to — `fontIdentifier()`'s behaviour is unchanged, and that is the finding: the identity was already
correct, and nobody had proved it. Those tests are a regression pin on the rule, not evidence of a
behaviour change. The behavioural change is entirely the validator exemption, and the three
failures above are its full extent.

### Boundary

`git diff --name-only f42ab3e..HEAD` — 15 files: the two CLI sources named in the box, the two CLI
test files, the fixture's `globals.xml` and `screens/screen_bounds.xml`, five regenerated goldens,
the fixture's two font-stub support files, and two C++ **test** files.

**A note on those last four.** The box excludes "runtime C++"; `include/` and `src/` are untouched.
`test/test_generated_fixture.cpp`, `test/test_editor_parity.cpp` and
`test/generated_fixture/support/fixture_u8g2_fonts.{h,cpp}` are the committed fixture's own test
and host support, and the box's own line item requires "let the C++ suite compile and run it",
which is not possible without them: the stub must declare the new array, the parity host must
provide it, and `kFixtureObjectsOnBusiestScreen` tracks the fixture's object count (5 → 6, since
`caps` makes bounds the busiest screen at six). No runtime behaviour was changed.

`docs/`, `PROGRAM*.md`, `font-symbol-builder.ts` and `u8g2-fonts.json` were not touched. The
`0.0.0-golden` stamp is unchanged. No generator version bump: output changes here only because the
input fixture changed, so §13.9's determinism rule is not engaged.

### Findings — out of scope, not fixed, not filed

1. **§13.4 still needs its amendment.** The code now accepts what the spec forbids. This is the
   recorded, owner-instructed divergence; the wording is the Chief Architect's and
   `CA-BRIDGE-2026-09-28.md` carries it. Until it lands, `validate-identifiers.ts` is the only
   statement of the rule.
2. **`generate --check` on the committed fixture always reports stale**, at the base as well as
   here. The committed `generated/` is stamped `0.0.0-golden` while a real run stamps the package
   version, so the two can never agree. Pre-existing, unrelated to this work order, and harmless
   because `compile-fixture.test.ts` compares with the golden stamp — but a reader running
   `--check` by hand on the fixture will be misled.
3. **A finding checked and withdrawn, recorded because the check is the point** (PROJECT.md
   lesson 5). The suspicion was that `findClosest()` being case-sensitive would leave an author
   who lowercases a font name without the obvious suggestion. It does not: `u8g2_font_helvr08_tr`
   returns `u8g2_font_helvR08_tr` **first** of 36 suggestions, because a single case difference is
   an edit distance of one. Nothing to fix. It is stated here so the next reader does not spend
   the same ten minutes on it.
