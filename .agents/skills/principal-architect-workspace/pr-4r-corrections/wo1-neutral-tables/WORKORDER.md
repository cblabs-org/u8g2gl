---
work_order: WO1
project: pr-4r-corrections
title: "Shared lookup tables and the realisation rule move to modules neither layer owns"
branch: u8g2gl-4r/wo1-neutral-tables
base: main @ 92de668
complexity: standard
status: dispatched
---

# WO1 — neutral tables

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR, with a timestamp, and the Chief Architect's rulings A and B
that this work order implements. This WORKORDER's `status` must be `dispatched`. Otherwise **stop
and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in the worktree `/Users/mcneillm/Documents/Projects/U8G2GL-4r`**, never in
`/Users/mcneillm/Documents/Projects/U8G2GL` — another session may own that checkout.

**Branch**: `u8g2gl-4r/wo1-neutral-tables` (already created and checked out) · **Base**: `main` @ `92de668`

Run `git branch --show-current` **as its own command immediately before every commit**, never
batched with the commit.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask** — nobody can answer, and work left
uncommitted strands. Do not push, do not tag, do not publish, do not open a PR.

## Standards

Load the `u8g2gl-standards` skill before any code; `references/typescript.md` and
`references/documentation.md` apply. §4's newest rule is the reason for this work order: *a lookup
table two layers share lives in neither of them.* Moved modules keep full file headers (SPDX,
`File:` path — **update the path**, Purpose, Exports).

---

## Objective

`validator/` and `generator/` stop depending on each other. After this work order the CLI core's
dependency runs one way, **`realise` ← `validator` ← `generator`**, with every shared table in a
module neither of the two owns, and a test that keeps it so.

## Background

Today `validator/` imports from `generator/` in two places, and `generator/` imports from
`validator/` in the other direction:

| Importer | Imports | From |
|---|---|---|
| `validator/validate-schema.ts`, `validate-widget-props.ts` | `COLOR_VALUES` | `generator/emit/value.ts` |
| `validator/validate-types.ts` | `FLAG_COMPARISONS` | `generator/emit/screen-model.ts` |
| `validator/validate-widget-props.ts` | `namedStyles()` | `generator/emit/screen-model.ts` |
| `validator/validate-widget-props.ts` | `styleProperties()` | `generator/emit/styles.ts` |
| `validator/shared-model.ts`, `validate-realisation.ts`, `validate.ts` | `realiseScreens`, `MAX_OBJECTS_PER_SCREEN`, `RealisationResult` | `generator/realise/` |
| `generator/check-project.ts`, `generate.ts` | `validate()`, `RefusalPolicy` | `validator/` — **this direction is correct and stays** |

Separately, **`CPP_KEYWORDS`** exists twice: `resolver/mangle.ts` and
`validator/validate-identifiers.ts`. The PA diffed them on 2026-09-28: 93 entries each, identical.

## Line-Item Instructions

- [ ] **Measure the baseline first**, in this worktree, each suite alone: CLI `npx vitest run`
      (PA measured **1055 tests / 62 files**), `tsc`, lint; C++ `cmake --build build` (0 warnings)
      and `ctest` (**362, one known skip `SizeOfReport.ThirtyTwoBitTarget`**). If your numbers
      differ, record both and continue.
- [ ] **Move `cli/src/core/generator/realise/` to `cli/src/core/realise/`** with `git mv`, so
      history follows. Update every importer in `src/` and `test/`. `realise/` must import nothing
      from `generator/` or `validator/` after the move — today it imports only `schema/`,
      `manifest/` and `resolver/`; confirm that. Keep `generator/index.ts`'s public re-exports
      working (re-exporting from `../realise/` is the allowed direction), so the package's public
      API surface is unchanged.
- [ ] **Move the shared tables into `cli/src/core/schema/`**, next to the data they describe:
  - the draw-colour **values** beside `DrawColor` in `schema/globals.ts`, as one `const` list the
    `DrawColor` type is derived from, so the type and the list cannot drift. The C++ enumerator
    spellings (`U8G2GL_COLOR_*`) are emission knowledge and **stay in `emit/value.ts`**, keyed so
    the compiler enforces one enumerator per value (e.g. `Record<DrawColor, string>`). Importers of
    `COLOR_VALUES` — including `emit/editor-registry.ts` — take it from the schema;
  - `FLAG_COMPARISONS` into the schema module that owns binding shapes (your judgement which;
    state it);
  - `styleProperties()` beside `STYLE_PROPERTIES` in `schema/globals.ts`;
  - `namedStyles()` beside `WidgetNode` in `schema/widget-node.ts`;
  - `CPP_KEYWORDS` into one schema module, used by both `resolver/mangle.ts` and
    `validator/validate-identifiers.ts`; delete the second copy.
- [ ] **If any two copies of a table differ when you unify them, STOP and report** in the
      Completion Report — which entries, where. Do not pick one. A difference is a finding, not a
      merge conflict. (Re-diff `CPP_KEYWORDS` yourself before deleting a copy.)
- [ ] **Add a layering test**, `cli/test/architecture/layering.test.ts` (or the nearest existing
      convention), that reads the import specifiers of every `.ts` file under `cli/src/core/` and
      fails, naming file and import, if:
  - anything under `validator/` imports from `generator/`;
  - anything under `realise/` imports from `validator/` or `generator/`;
  - anything under `schema/` imports from `validator/`, `generator/` or `realise/`.
  Resolve relative specifiers to paths; do not pattern-match strings like `'generator'` loosely.
  Prove the test bites: temporarily re-add one forbidden import, see it fail with a useful
  message, remove it. Say you did so in the report.
- [ ] **No behaviour change.** Every existing test passes **with its assertions untouched**. A test
      file may change **only its import paths**. If a test seems to need anything more, you have
      changed behaviour: **stop and report**. The committed goldens (`test/generated_fixture/generated*/`)
      must be byte-identical; regenerate and confirm an empty diff.
- [ ] Commit in coherent steps (the move; the tables; the guard) — each commit green.

## Strict Boundary Box

**In scope:** `cli/src/core/realise/` (moved), `cli/src/core/schema/`,
`cli/src/core/validator/`, `cli/src/core/resolver/mangle.ts`, **import lines and the moved exports
only** in `cli/src/core/generator/` (including `emit/`), `cli/src/core/index.ts`,
`cli/src/browser/index.ts`, `cli/src/node/` import lines, **import lines only** in `cli/test/`,
the new layering test, this WORKORDER's checkboxes and Completion Report.

**Do NOT touch:** runtime C++ (`include/`, `src/`, `test/`); `emit/fonts.ts`, `emit/images.ts`,
`emit/xbm.ts` beyond an import line (PR-04b's area); any emitted output; `docs/`; `PROGRAM*.md`;
`PROJECT.md`; `package.json` versions — **no version bump**, because nothing emitted changes.
No behaviour change of any kind: no message wording, no diagnostic codes, no ordering.

---

## Testing Requirement

- [ ] Layering test added, and shown to fail on a re-added forbidden import
- [ ] Every pre-existing test passes; test-file diffs are import lines only (show `git diff --stat`
      of `cli/test/` and confirm)
- [ ] Goldens unchanged

## Verification Requirement

- [ ] CLI `npx vitest run`, `npx tsc --noEmit`, `npm run lint` clean; C++ `cmake --build build`
      zero warnings, `ctest` all pass — each suite run alone
- [ ] Run the **built CLI** end to end: `validate` and `generate --check` against
      `test/generated_fixture`, compared with the base's output
- [ ] `git diff --name-only main..HEAD` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*(Worker fills this in: status; baseline and final counts; where each table landed and why; any
difference found between copies; the layering test and proof it bites; test-file diff stat;
golden diff; built-CLI run; boundary; findings.)*
