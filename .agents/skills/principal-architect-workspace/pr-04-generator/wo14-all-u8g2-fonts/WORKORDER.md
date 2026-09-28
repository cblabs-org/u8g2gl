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

- [ ] **A `<builtin>`'s `name` is a U8G2 symbol, not an author-chosen identifier.** Validate it
      against `u8g2-fonts.json` (the existing `UNKNOWN_FONT` check) and **exempt it from §13.4's
      lowercase identifier rule**. A name that is not in the list keeps today's message and its
      near-miss suggestions. Find where the identifier rule currently rejects it and make the
      exemption explicit and commented, naming the owner's ruling — not a quiet special case.
- [ ] **`<bdf>` is unchanged.** A `<bdf>`'s `name` is chosen by the author, so §13.4 still applies.
      Add a test that pins the difference, so a later reader cannot mistake the exemption for a
      general relaxation.
- [ ] **The generated alias must stay a legal C++ identifier.** `fontIdentifier()`
      (`cli/src/core/resolver/mangle.ts`) spells `ui_font_<name>`. Decide and implement how a name
      with capitals is mangled — state your rule in the Completion Report, with its reason. It must
      be **deterministic**, **total** (every one of the 2039 names maps to a legal identifier), and
      **injective across the whole set**: prove with a test that maps all 2039 and asserts no two
      collide, and that every result matches `[A-Za-z_][A-Za-z0-9_]*`. Beware the obvious trap:
      lowercasing alone collides (`u8g2_font_5x7_mr` against a hypothetical `..._MR`), so check the
      real set rather than assuming.
- [ ] **Collisions stay hard errors.** The mangled alias goes through the existing collision table
      like any other name; two fonts mangling to one identifier is a generate-time error naming both.
- [ ] **The emitted alias and its use agree.** Whatever the alias is called, the `extern` declaration,
      the definition and every `set_font()` use spell it identically. A generated project using a
      capitalised font must compile.
- [ ] **End-to-end proof:** extend the committed fixture with **one** capitalised font (for example
      `u8g2_font_helvR08_tr`) used by an element, regenerate, and let the C++ suite compile and run
      it. Goldens change for this work order; say so in the commit message.
- [ ] **Legacy `u8g_font_*` macros stay refused** (WO11b f2) — unchanged here, still a bridge item.

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

- [ ] All 2039 names mangle to legal, unique identifiers (one test over the whole set)
- [ ] A capitalised `<builtin>` validates, generates and compiles
- [ ] A `<bdf>` with capitals is still refused, with §13.4's message
- [ ] An unknown `<builtin>` is still refused with suggestions
- [ ] Tests fail at the base; say how many fail behaviourally

## Verification Requirement

- [ ] CLI `vitest`, `tsc`, lint clean; C++ `cmake --build build` zero warnings; `ctest` all pass
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
