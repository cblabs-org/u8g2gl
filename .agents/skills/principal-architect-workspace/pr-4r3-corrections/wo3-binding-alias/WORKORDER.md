---
work_order: WO3
project: pr-4r3-corrections
title: "A <bind> that re-declares an inherited setter keeps the inherited name"
branch: u8g2gl-4r3/wo3-binding-alias
base: u8g2gl-4r3/wo2-extends-class
complexity: standard
status: dispatched
---

# WO3 — §13.1: one name per inherited setter, one code for the rule

## Authorization

Part of PR-4R3 (`pr-4r3-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Chief Architect rulings" R2
gives this WO's rule, code name and §13.1 text. This WORKORDER's `status` must be `dispatched`.
Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r3`.** **Branch**:
`u8g2gl-4r3/wo3-binding-alias` (already checked out, no upstream) · **Base**:
`u8g2gl-4r3/wo2-extends-class`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch files in `tmp/` in this
worktree, never `/tmp`. `extern/u8g2` is initialised; vitest's globalSetup runs `tsc`, so a type
error anywhere breaks the whole CLI suite.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/typescript.md`, `references/documentation.md`.
**§4.1**: on lines you add or change, cite published references (`§13.1`, `§13.2`, `[D-20]`,
`[D-17]`, `[UD-5]`, `§15.3`) and measured facts; no work-order tags (no "PR-4R2", "PR-4R3"), no
workspace paths, no narrated debate. Pre-existing citations are not yours to sweep — but a line
you change is yours, so a "(PR-4R2)" on a line you edit goes. Diagnostics follow §15.1.

---

## Objective

A custom `<bind>` that re-declares a setter already bound in its `extends` chain under a different
name is refused — for every setter, not only geometry ones — with one diagnostic code,
`U8G2GL_BINDING_ALIAS`, replacing `U8G2GL_GEOMETRY_BINDING_ALIAS`.

## Background (PA scoping, CLI built from `783e189`)

- `checkBindDeclarations()` is in `cli/src/core/validator/validate-schema.ts` (~360–445), with
  `geometryAliasDiagnostic()` below it. Step 2 compares a `<bind>` with the inherited bindings that
  share its `setter=` (`sharing`) and refuses only when the inherited one is a geometry binding
  (`geometryBindingNamed(...)`) under a different name. Step 3 handles a **drawing** manifest's
  `<bind>` whose `setter=` names one of its own props.
- **The hole, measured:** `<widget name="wd_l" extends="u8g2gl_label"><api><bind name="bind_foo"
  type="string" setter="bind_text"/></api></widget>` instanced with `bind_foo="s"` validates with 0
  errors and emits `ui_obj_w.bind_text(&ui_subject_s);`. Under [UD-5] the property panel would show
  `bind_foo` while the runtime calls `bind_text`.
- **Nothing relies on it (PA search of every `.xml`/`.ts`/`.json`/`.md` in the repo):** every
  `<bind>` whose `name` differs from its `setter=` is either a framework **drawing** manifest's
  own-prop binding (`bind_x` → `x` in `u8g2gl_box/circle/pixel/ellipse/hline/vline.xml`) or a test
  of the existing geometry refusal (`cli/test/validator/bind-type-paths.test.ts`). No framework
  **class** manifest binds one setter under two names (`u8g2gl_obj/label/button` declare
  `bind_text` twice — same name, two types).
- `U8G2GL_GEOMETRY_BINDING_ALIAS` is referenced only in `schema/diagnostic.ts`, `validate-schema.ts`,
  `bind-type-paths.test.ts`, and `docs/design_spec.md` §13.1. Nothing is tagged or published, so the
  rename breaks no consumer (Chief Architect R2).

## The rule (Chief Architect R2, PROJECT.md)

For each `<bind>` **B** a widget or composite manifest declares:

1. **Inherited setter (Step 2).** If inherited bindings share `B.setter` and **none** of them has
   `name === B.name`: refuse with `U8G2GL_BINDING_ALIAS`, naming the inherited name(s) to write
   instead. This subsumes today's geometry-only branch — one check, not two. The message carries
   the specifics: for a geometry setter, [D-20]'s consequence (origin, clamp and anchor are keyed
   by name, so the call does not compile); otherwise, that the editor's property panel ([UD-5])
   and diagnostics would show a name the runtime does not use. The existing type check (same Step)
   is unchanged.
2. **A drawing manifest's own geometry prop (Step 3) — keep the existing refusal**, now under
   `U8G2GL_BINDING_ALIAS`: `<bind name="bind_when" setter="x">` on a custom drawing element is still
   refused, because [D-20] resolves origin and clamp by name. **Do not widen Step 3** to non-geometry
   props: `<bind name="bind_foo" type="bool" setter="filled">` on a custom drawing element names its
   own prop and stays **accepted** (it emits `u8g2gl_draw_box(…, ui_subject_b.get())` today).
3. A `<bind>` whose `setter=` targets nothing inherited and no own prop — a new method on the
   author's class — stays **accepted**.

One diagnostic-building function for the code; no second spelling of the geometry names
(use `geometryBindingNamed()` / `geometryBindingFor()` as today).

## Line-Item Instructions

- [ ] **Measure the baseline**, each suite alone: C++ **401 / one skip**, **0** warnings; CLI
      **1331**, `tsc`, lint. Record exact counts.
- [ ] **Pin test first** (passes at the base): a custom **drawing** element with
      `<bind name="bind_when" type="int" setter="x"/>` is refused with today's alias code. No
      existing test pins Step 3's geometry refusal; this one protects it through the refactor.
- [ ] **Failing tests first** (in `cli/test/validator/bind-type-paths.test.ts`):
      - class `extends="u8g2gl_label"`, `<bind name="bind_foo" type="string" setter="bind_text"/>` →
        `BINDING_ALIAS`, located at the `<bind>`, message names `bind_text`;
      - the same `<bind>` on a **composite** `<api>` → refused;
      - `<bind name="bind_foo" type="int" setter="bind_text"/>` on a label subclass → alias (type
        `int` is accepted by an inherited `bind_text`, so only the alias fires — assert exactly one);
      - **accepted:** a label subclass redeclaring `<bind name="bind_text" type="string"
        setter="bind_text"/>`; a new method `<bind name="bind_foo" type="string" setter="bind_foo"/>`;
        a custom drawing element `<bind name="bind_foo" type="bool" setter="filled"/>` with a `bool`
        `filled` prop.
      Show the refused cases fail at the base.
- [ ] **Rename** `GEOMETRY_BINDING_ALIAS` → `BINDING_ALIAS` (`'U8G2GL_BINDING_ALIAS'`) in
      `schema/diagnostic.ts`, with a doc comment covering both cases; update every reference and
      the existing tests. `git grep GEOMETRY_BINDING_ALIAS` outside `.agents/` must return nothing.
- [ ] **Implement** in `checkBindDeclarations()`: generalise Step 2 as the rule says; Step 3 keeps
      its geometry refusal under the new code. Update the function's comment block to state the
      rule as §13.1 now does.
- [ ] **Every shipped manifest and fixture passes**: framework manifests and every fixture
      manifest in the repo produce no new diagnostic. If one does, **stop and report** — something
      relies on the alias, and the Chief Architect asked to hear about it before it is broken.
- [ ] **Spec**: in `docs/design_spec.md` §13.1, replace the two paragraphs beginning
      "**A `<bind>` may not reach a setter under another name.**" and "The geometry case is why this
      is a rule…" with the Chief Architect's R2 text from `../PROJECT.md`, **verbatim**. Nothing else
      in `docs/` changes. Paste the diff.
- [ ] **End to end with the built CLI** (`npm run build` in `cli/`): in `tmp/`, the `wd_l` /
      `bind_foo` → `bind_text` project above → refused, paste the output; PR-4R2's probe shape
      (`extends="u8g2gl_obj"`, `<bind name="bind_when" type="int" setter="bind_x"/>`) → refused
      under the new code with the [D-20] wording; the accepted drawing-element `bind_foo` → `filled`
      project → validates clean.
- [ ] No version bump (unreleased CLI 0.11.0; validation only). Goldens must not move.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-schema.ts` (`checkBindDeclarations` and its
diagnostic helper only); `cli/src/core/schema/diagnostic.ts` (the rename); `cli/test/validator/**`;
`docs/design_spec.md` §13.1 (the two paragraphs); this WORKORDER.

**Do NOT touch:** `manifest-registry.ts` (WO2's rule); the geometry-bindings table
(`cli/src/core/resolver/geometry-bindings.ts`); `include/u8g2gl/manifests/**`; the generator; the
runtime; goldens; any version; `docs/` outside §13.1; `.agents/rules/`; `PROGRAM*.md`;
`PROJECT.md`; `MEMORY.md`.

---

## Verification Requirement

- [ ] Pin test passes at base and tip; refused cases fail at the base and pass at the tip
- [ ] C++ unchanged (401 / one skip, 0 warnings); CLI vitest **1331 +** your new tests, `tsc`,
      lint — **each suite alone**, counts recorded
- [ ] Goldens unchanged: `git diff --stat u8g2gl-4r3/wo2-extends-class..HEAD -- test/generated_fixture cli/test/generator/fixtures` is empty
- [ ] `git diff --name-only u8g2gl-4r3/wo2-extends-class..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
already with the Chief Architect, do not re-report: §13.1's "names it freely" sentence does not
carve out a drawing element's own geometry prop; manifest diagnostics locate at the element, not
the attribute.

---

## Completion Report (append below on completion)

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Baseline and final counts
| Suite | Baseline | Final |
|---|---|---|

### Changes Made
- `path` — what and why

### Decisions Made
- message wording for the geometry and non-geometry cases; how one check replaced two

### Evidence
- pin test; failing-first runs; built-CLI output for the three projects; §13.1 diff

### Dead Ends & Warnings

### Out-of-Scope Findings

### Blockers
(none)
```
