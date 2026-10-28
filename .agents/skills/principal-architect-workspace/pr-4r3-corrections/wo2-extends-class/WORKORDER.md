---
work_order: WO2
project: pr-4r3-corrections
title: "extends must name an element that has a class"
branch: u8g2gl-4r3/wo2-extends-class
base: u8g2gl-4r3/wo1-runtime-floor
complexity: standard
status: complete
---

# WO2 — §6.5: a class cannot extend a drawing element

## Authorization

Part of PR-4R3 (`pr-4r3-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Chief Architect rulings"
gives the §6.5 clause this WO lands. This WORKORDER's `status` must be `dispatched`. Otherwise
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `.`.** **Branch**:
`u8g2gl-4r3/wo2-extends-class` (already checked out, no upstream) · **Base**:
`u8g2gl-4r3/wo1-runtime-floor`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch files in `tmp/` in this
worktree, never `/tmp`. `extern/u8g2` is already initialised in this worktree.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/typescript.md`, `references/documentation.md`.
**§4.1**: on lines you add or change, cite published references (`§6.5`, `§6.2`, `[D-18]`,
`[D-17]`) and measured facts; no work-order tags, no workspace paths, no narrated debate.
Pre-existing citations are not yours to sweep. Diagnostics follow §15.1: say what is wrong, where,
and what to write instead.

---

## Objective

A manifest whose `extends` names a **drawing element** (§6.2: no class, served by free functions,
[D-18]) is refused at the manifest, with a diagnostic that says why and names the two routes that
work. Today it validates and generates an object of a class with no such members.

## Background (PA probes, CLI built from `783e189`; same behaviour at WO1)

| Manifest | Result today |
|---|---|
| `<widget name="wd_b" extends="u8g2gl_box"><api/></widget>`, instanced with x/y/width/height | Validates, 0 errors. Emits `static wd_b ui_obj_w;`, `tick()`, `u8g2gl_render_object(...)` and **no geometry call** — the hole |
| `extends="u8g2gl_obj"` + one own `draw=` prop | Refused, `U8G2GL_DRAWING_ELEMENT_EXTENDS` (schema pass §5): own props all `draw=` make it a drawing element |
| Own drawing element: no `extends`, props `x`,`y`,`width`,`height` with `draw="u8g2gl_draw_box"` | Works: `u8g2gl_draw_box(display, 0, 0, 10, 6);` |
| `extends="u8g2gl_obj"`, empty `<api>` (drawing in its own C++ class) | Works |

- `isDrawingElement()` (`cli/src/core/manifest/manifest-registry.ts` ~173) decides it from the
  **declared** manifest; read its doc comment — pass `.declared` / the registration's manifest,
  never an effective manifest.
- `extends` is resolved in `buildManifestRegistry` Step 3 (`resolveTag`, ~313–380), which already
  diagnoses an unknown target (`UNKNOWN_WIDGET`, with §6.5's remedy in the message) and a cycle.
  The new refusal belongs there, beside them: the registry is where `extends` is resolved, and it
  sees framework and project manifests alike, so a project drawing element is caught too.
- **Do not double-report.** A manifest that is itself a drawing element and declares `extends` is
  already refused by the schema pass (`DRAWING_ELEMENT_EXTENDS`); the new check skips it (the child,
  not the parent, is then the fault).

## The rule (Chief Architect, PROJECT.md "Item 2 — §6.5 clause")

If manifest **M** declares `extends="P"`, **P** is registered, and **P**'s declared manifest is a
drawing element, while **M** itself is not one: refuse, located at **M**'s `extends` attribute.
The message says (§15.1):
- what: `<M> extends drawing element 'P'`;
- why: a drawing element has no class — it is drawn by free functions — so there is nothing to
  inherit and the generated code would call methods on a type with no such members (§6.5, [D-18]);
- what instead, both routes: declare a drawing element of its own (`draw=` props, no `extends`),
  or `extends="u8g2gl_obj"` and draw from your own class.

Do **not** suggest "`u8g2gl_obj` plus a `draw=` prop": that is refused (row 2 above).

**Diagnostic code:** add one in `cli/src/core/schema/diagnostic.ts` beside
`DRAWING_ELEMENT_EXTENDS`, with a doc comment distinguishing the two (that one: a drawing element
declares `extends`; this one: a class extends a drawing element). Suggested name
`EXTENDS_DRAWING_ELEMENT` / `U8G2GL_EXTENDS_DRAWING_ELEMENT`; a better name is yours if you say
why.

**After the refusal**, choose what **M** inherits so the author sees one clear error rather than a
cascade (e.g. every instance attribute reported unknown). Measure the options (inherit nothing, as
the unknown-target branch does; or still inherit **P**'s props) with the built CLI on the probe
below, pick the one with the least noise, and report the output of both.

## Line-Item Instructions

- [ ] **Measure the baseline**, each suite alone: C++ **401 / one skip**, **0** warnings; CLI
      **1326**, `tsc`, lint. Record exact counts.
- [ ] **Failing tests first** in `cli/test/manifests/manifest-registry.test.ts` (or the nearest
      validator test if the end-to-end shape fits better — say which):
      - `extends="u8g2gl_box"` (framework drawing element), empty `<api>` → refused, at `extends`;
      - a class extending a **project** drawing element (no `extends`, `draw=` props) → refused;
      - a **composite** (`<view>`) declaring `extends="u8g2gl_box"` → refused (state what you see);
      - **accepted, no new diagnostic:** `extends="u8g2gl_obj"` empty `<api>`; `extends="u8g2gl_label"`;
        an own drawing element with no `extends`;
      - **not double-reported:** a drawing element declaring `extends="u8g2gl_box"` gets
        `DRAWING_ELEMENT_EXTENDS` only.
      Show the refused cases fail at the base.
- [ ] **Every shipped manifest and fixture passes**: framework manifests under
      `include/u8g2gl/manifests/` and every fixture manifest in the repo produce no new diagnostic.
      If one does, **stop and report** — do not edit it.
- [ ] **Implement** in `manifest-registry.ts` Step 3 using `isDrawingElement()`; no tag lists
      ([D-17]). Update the file header's Description (it lists what the registry diagnoses).
- [ ] **Spec**: in `docs/design_spec.md` §6.5, add the Chief Architect's clause from
      `../PROJECT.md` **verbatim** as a new paragraph **immediately after** the existing paragraph
      that begins "**`extends` must name an element that has a manifest**". The existing paragraph
      stays. Nothing else in `docs/` changes. Paste the diff in the report.
- [ ] **End to end with the built CLI** (`npm run build` in `cli/`, then
      `node cli/dist/node/cli.js validate`): a project in `tmp/` with `wd_b extends="u8g2gl_box"`
      instanced as `<wd_b name="w" x="0" y="0" width="10" height="6"/>` — paste the full output;
      then `generate` must refuse. Then the two working routes validate clean.
- [ ] No version bump: CLI 0.11.0 is this PR's unreleased minor, and a validation-only change does
      not alter emitted output. Goldens must not move.

## Strict Boundary Box

**In scope:** `cli/src/core/manifest/manifest-registry.ts`; `cli/src/core/schema/diagnostic.ts`
(one code); `cli/test/manifests/**`, `cli/test/validator/**` and new fixtures under them;
`docs/design_spec.md` §6.5 (the one clause); this WORKORDER.

**Do NOT touch:** `validate-schema.ts`'s `DRAWING_ELEMENT_EXTENDS` rule and
`checkBindDeclarations` (WO3); `include/u8g2gl/manifests/**`; `cli/src/core/generator/**`; the
runtime; goldens; any version; `docs/` outside §6.5; `.agents/rules/`; `PROGRAM*.md`;
`PROJECT.md`; `MEMORY.md`.

---

## Verification Requirement

- [ ] Refused cases fail at the base and pass at the tip; accepted cases pass at both
- [ ] C++ unchanged (401 / one skip, 0 warnings); CLI vitest **1326 +** your new tests, `tsc`,
      lint — **each suite alone**, counts recorded
- [ ] Goldens unchanged: `git diff --stat u8g2gl-4r3/wo1-runtime-floor..HEAD -- test/generated_fixture cli/test/generator/fixtures` is empty
- [ ] `git diff --name-only u8g2gl-4r3/wo1-runtime-floor..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled by WO3, do not re-report: a `<bind>` may alias an inherited non-geometry setter.

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
- code name; what M inherits after the refusal, with both measured outputs

### Evidence
- failing-first runs; built-CLI output for the refused and accepted projects; §6.5 diff

### Dead Ends & Warnings

### Out-of-Scope Findings

### Blockers
(none)
```

---
## Completion Report

### Status
complete

### Baseline and final counts
| Suite | Baseline | Final |
|---|---|---|
| C++ ctest | 401 passed, one skip (SizeOfReport.ThirtyTwoBitTarget), 0 warnings (clean rebuild) | unchanged: 401 / one skip, 0 warnings |
| CLI vitest | 1326 | 1331 (+5) |
| `eslint .` / `tsc -p tsconfig.test.json` / `tsc --noEmit` | clean | clean |

### Changes Made
- `cli/src/core/schema/diagnostic.ts` — `EXTENDS_DRAWING_ELEMENT: 'U8G2GL_EXTENDS_DRAWING_ELEMENT'`, doc comment distinguishing it from `DRAWING_ELEMENT_EXTENDS`.
- `cli/src/core/manifest/manifest-registry.ts` — Step 3 (`resolveTag`): after resolving a registered parent, refuse when `isDrawingElement(registrations.get(parentTag)?.manifest) && !isDrawingElement(manifest)`. No tag lists. File header Description updated.
- `cli/test/manifests/manifest-registry.test.ts` — new `extending a drawing element` block (5 tests; the registry test file, since the rule lives in the registry).
- `docs/design_spec.md` §6.5 — Chief Architect's clause verbatim, new paragraph after the "`extends` must name an element that has a manifest" paragraph (which is untouched).

### Decisions Made
- Code name kept as suggested: `EXTENDS_DRAWING_ELEMENT`. It reads as the converse of `DRAWING_ELEMENT_EXTENDS` and the doc comments disambiguate.
- After the refusal M **keeps the parent's props** (the check does not clear `parent`). Probe: `wd_b extends="u8g2gl_box"`, instanced `<wd_b name="w" x="0" y="0" width="10" height="6"/>`.
  - Option A (inherit parent's props): **1 error**, the new diagnostic only.
  - Option B (inherit nothing): **5 errors**: `Unknown attribute 'x'`, `'y'`, `'width'`, `'height'` on `<wd_b>` (the last with a spurious `did you mean 'right'?`), plus the new diagnostic.
  - A chosen; a test asserts `wd_b` still has `width`.

### Evidence
- Failing first: with only the diagnostic code added and no check, 3 refused-case tests failed (framework, project, composite); the accepted and not-double-reported cases pass at base too, as required.
- Built CLI, refused project (`tmp/wo2/refused`), `validate`:
```
error: widgets/wd_b/wd_b.xml:2:1
   Manifest <wd_b> extends drawing element 'u8g2gl_box'. A drawing element has no class — it is drawn by free functions ([D-18]) — so there is nothing to inherit, and the generated code would call methods on a type with no such members (§6.5). Declare a drawing element of your own (props with draw=, no 'extends'), or use extends="u8g2gl_obj" and draw from your own class.
   |
 2 | <widget name="wd_b" extends="u8g2gl_box">
   | ^^^^^^^^^^

Validation failed: 1 error(s), 0 warning(s).
```
  `generate` on it: same error, `Generation refused: 1 error(s), 0 warning(s). Nothing was written.`, exit 1.
- Working routes validate clean ("Validation passed: 0 errors, 0 warnings."): own drawing element at `tmp/wo2/own`; `extends="u8g2gl_obj"` at `tmp/wo2/obj`; `extends="u8g2gl_label"` at `tmp/wo2/label`.
- Shipped manifests: the `frameworkRegistry()` test (no diagnostics) passes; every fixture-driven suite passes, so no shipped manifest or fixture gained a diagnostic. Nothing was edited to achieve this.
- §6.5 diff: 7 lines added (clause verbatim) after the existing paragraph.
- Composite (`<view>`) extending `u8g2gl_box`: refused with the same code.

### Dead Ends & Warnings
- None.

### Out-of-Scope Findings
- Location: the manifest model records only the `<widget>` element's `loc`, not the `extends` attribute's, so the diagnostic is located at the element (2:1), with a 10-character underline (the length of the parent tag) that covers `<widget na` rather than the `extends` value. The unknown-target and cycle diagnostics share this. Pointing at the attribute needs the parser to record an attribute location (outside this Boundary Box).

### Blockers
(none)
