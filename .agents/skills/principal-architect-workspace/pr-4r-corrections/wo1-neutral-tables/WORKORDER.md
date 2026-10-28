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

**Work only in the worktree `../U8G2GL-4r`**, never in
`../U8G2GL` â another session may own that checkout.

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

- [x] **Measure the baseline first**, in this worktree, each suite alone: CLI `npx vitest run`
      (PA measured **1055 tests / 62 files**), `tsc`, lint; C++ `cmake --build build` (0 warnings)
      and `ctest` (**362, one known skip `SizeOfReport.ThirtyTwoBitTarget`**). If your numbers
      differ, record both and continue.
- [x] **Move `cli/src/core/generator/realise/` to `cli/src/core/realise/`** with `git mv`, so
      history follows. Update every importer in `src/` and `test/`. `realise/` must import nothing
      from `generator/` or `validator/` after the move — today it imports only `schema/`,
      `manifest/` and `resolver/`; confirm that. Keep `generator/index.ts`'s public re-exports
      working (re-exporting from `../realise/` is the allowed direction), so the package's public
      API surface is unchanged.
- [x] **Move the shared tables into `cli/src/core/schema/`**, next to the data they describe:
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
- [x] **If any two copies of a table differ when you unify them, STOP and report** in the
      Completion Report — which entries, where. Do not pick one. A difference is a finding, not a
      merge conflict. (Re-diff `CPP_KEYWORDS` yourself before deleting a copy.)
- [x] **Add a layering test**, `cli/test/architecture/layering.test.ts` (or the nearest existing
      convention), that reads the import specifiers of every `.ts` file under `cli/src/core/` and
      fails, naming file and import, if:
  - anything under `validator/` imports from `generator/`;
  - anything under `realise/` imports from `validator/` or `generator/`;
  - anything under `schema/` imports from `validator/`, `generator/` or `realise/`.
  Resolve relative specifiers to paths; do not pattern-match strings like `'generator'` loosely.
  Prove the test bites: temporarily re-add one forbidden import, see it fail with a useful
  message, remove it. Say you did so in the report.
- [x] **No behaviour change.** Every existing test passes **with its assertions untouched**. A test
      file may change **only its import paths**. If a test seems to need anything more, you have
      changed behaviour: **stop and report**. The committed goldens (`test/generated_fixture/generated*/`)
      must be byte-identical; regenerate and confirm an empty diff.

      **PA amendment, 2026-09-28 (after the worker's stop, which was correct):** a test that pins
      *where* something is declared by file path may have that path literal updated **when the
      path is one this work order moves** — e.g. `validator-alignment.test.ts` "declares the object
      ceiling once", `'generator/realise/model.ts'` → `'realise/model.ts'`. The assertion's intent
      (declared once) is unchanged, and the new path is what ruling A requires. Nothing else in a
      test's body may change; any other case is still stop-and-report. List every such edit in the
      Completion Report.
- [x] Commit in coherent steps (the move; the tables; the guard) — each commit green.

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

- [x] Layering test added, and shown to fail on a re-added forbidden import
- [x] Every pre-existing test passes; test-file diffs are import lines only (show `git diff --stat`
      of `cli/test/` and confirm)
- [x] Goldens unchanged

## Verification Requirement

- [x] CLI `npx vitest run`, `npx tsc --noEmit`, `npm run lint` clean; C++ `cmake --build build`
      zero warnings, `ctest` all pass — each suite run alone
- [x] Run the **built CLI** end to end: `validate` and `generate --check` against
      `test/generated_fixture`, compared with the base's output
- [x] `git diff --name-only main..HEAD` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: COMPLETE.** Four commits on `u8g2gl-4r/wo1-neutral-tables`, each green:

| Commit | Step |
|---|---|
| `e32830f` | the tables move to `schema/` |
| `338202f` | interim report: stopped at the realise move for a ruling |
| `267b2f1` | `realise/` moves to `core/realise/` (after the PA amendment `a7c47b4`) |
| `100d4e1` | the layering test |

The order was tables, then move, then guard, rather than the move first as listed. The tables
did not depend on the move, and doing them first let them land green while the move waited on
the ruling.

### The stop, and the ruling

Moving `realise/` failed exactly one test (1054/1055 in a trial): `validator-alignment.test.ts`
"declares the object ceiling once" pins `MAX_OBJECTS_PER_SCREEN`'s declaring file as
`'generator/realise/model.ts'`. That is an assertion, not an import, so I stopped and reported it.
The PA ruled it a location literal of a moved file and amended this WORKORDER (`a7c47b4`). The
edit was then made as ruled.

### Test-body edits (location literals, per the PA amendment)

| File | Test | Edit |
|---|---|---|
| `cli/test/validator/validator-alignment.test.ts:257` | "declares the object ceiling once" | `'generator/realise/model.ts'` → `'realise/model.ts'` |

That is the only one. No assertion's intent changed: the ceiling is still declared once.

### Baseline and final counts (each suite alone)

| | Baseline @ `d5174c5` | Final @ `100d4e1` |
|---|---|---|
| CLI `vitest` | 1055 / 62 files | **1059 / 63 files** (the 1055 + 4 layering tests) |
| `tsc --noEmit`, `npm run lint` | clean | clean |
| C++ `cmake --build build` | 0 warnings | 0 warnings |
| `ctest` | 362, 1 known skip (`SizeOfReport.ThirtyTwoBitTarget`) | same |

### Where each table landed

| Table | Was | Now | Why there |
|---|---|---|---|
| realisation rule | `generator/realise/` | `core/realise/` (`git mv`; history follows) | ruling A. It imports only `schema/`, `manifest/`, `resolver/`; `generator/index.ts` re-exports it from `../realise/` |
| draw-colour values | `COLOR_VALUES` in `emit/value.ts` | `COLOR_VALUES = ['0','1','xor'] as const` in `schema/globals.ts`; `DrawColor = (typeof COLOR_VALUES)[number]` | beside the type, so the type is derived from the list |
| `U8G2GL_COLOR_*` spellings | `emit/value.ts`, `Record<string,string>` | stays in `emit/value.ts`, now `Record<DrawColor,string>` | emission knowledge; the compiler requires one enumerator per value |
| `styleProperties()` | `emit/styles.ts` | `schema/globals.ts`, beside `STYLE_PROPERTIES` | reads only that table and `StyleDecl` |
| `FLAG_COMPARISONS` | `emit/screen-model.ts` | `schema/widget-node.ts`, beside `BindingChild` | keyed by `BindingChild.type`, so the module owning the directive's shape owns what it may compare |
| `namedStyles()` | `emit/screen-model.ts` | `schema/widget-node.ts`, beside `WidgetNode` | reads only `WidgetNode` |
| `CPP_KEYWORDS` | two copies: `resolver/mangle.ts`, `validator/validate-identifiers.ts` | one, new `schema/cpp-keywords.ts` | no existing schema module owns C++ spelling rules. `mangle.ts` re-exports it, because `resolver/index.ts` is outside the box and the public export must not move |

Two small, behaviour-identical adjustments that the typing forced:
`validate-widget-props.ts` reads `(COLOR_VALUES as readonly string[]).includes(value)`, following
the `RECTANGLE` precedent. `value.ts` still looks a colour up by the raw string, through a
string-keyed view (see finding 1). Stale comments corrected: `validate-types.ts` ×2,
`editor-registry.ts` ×1, and `generator/index.ts:17`'s header. `realise/index.ts`'s Purpose now
says where the module sits and why. All four moved files' `File:` paths are updated.

### Differences between copies

**None.** I re-diffed `CPP_KEYWORDS` myself (`tmp/wo1/diff-keywords.mjs`): 93 entries each,
none in only one, same order. The new module was diffed against the mangle copy the same way:
identical. The colour values matched their only other statement, the old `DrawColor` union.

### Layering test — `cli/test/architecture/layering.test.ts`

Specifiers come from the compiler's own `ts.preProcessFile`, so static imports, `export … from`
and dynamic `import()` are all seen, and comments and strings are ignored. Each relative specifier
is resolved to a path under `src/core`, and its first directory is the layer. Three rules, one
test each, match the line item exactly. A fourth test asserts that the permitted edges
(generator→validator, validator→realise, realise→schema) are visible, so a pass cannot be vacuous.

**Proof it bites:** I temporarily appended one forbidden import in each guarded layer and ran it.
All three rules failed, each naming the file and the import:

```
src/core/validator/validate-types.ts imports '../generator/emit/value.js' (src/core/generator/emit/value.js): validator/ must not depend on generator/
src/core/realise/model.ts imports '../validator/validate.js' (src/core/validator/validate.js): realise/ must not depend on validator/
src/core/schema/globals.ts imports '../realise/index.js' (src/core/realise/index.js): schema/ must not depend on realise/
```

The files were restored from copies taken beforehand, and `git diff` confirmed they were
unchanged. The test is green again.

### Test-file diff stat (`main..HEAD -- cli/test`)

```
 cli/test/architecture/layering.test.ts         | 117 +++++++  (new)
 cli/test/generator/emit-editor.test.ts         |   3 +-       (import line: FLAG_COMPARISONS from schema/widget-node)
 cli/test/validator/validator-alignment.test.ts |   2 +-       (the one location literal above)
```

### Goldens, built CLI, public API

- Goldens: `refresh-goldens.mjs` through a fresh `dist/`. `git diff` of `test/generated_fixture/`
  and `cli/test/generator/fixtures/` is **0 lines**, after the tables and again after the move.
- Built CLI vs the base's captured output (`tmp/wo1/cli-compare.sh`): `validate`,
  `--json validate`, `generate --check` (firmware and editor), and full `generate --out` for both
  targets are all **byte-identical**. `generate --check` exits 1 at the base too, because goldens
  are stamped `0.0.0-golden` and the CLI stamps `0.7.0`. That is expected, and it is the only
  difference.
- Public API: runtime export names of `dist/core/index.js` are the same 156 before and after.
- No version bump: nothing emitted changed.

### Boundary

`git diff --name-only main..HEAD`, excluding the PA's `.agents/` ledger commits (`d5174c5`,
`a7c47b4`):
- `generator/` non-emit files (`check-project.ts`, `generate.ts`, `index.ts`, `report/*`): import
  lines, plus `index.ts`'s header comment.
- `emit/`: import lines, the moved exports, and the three stale comments.
- `realise/`: moved.
- `schema/`, `validator/`, `resolver/mangle.ts`.
- `cli/test/`: as listed above.

`emit/fonts.ts`, `images.ts` and `xbm.ts`, the C++ runtime, `docs/`, `PROGRAM*.md`, `PROJECT.md`
and `package.json` are untouched.

### Findings (out of scope, not fixed)

1. **`emit/value.ts` colour lookup reads the prototype chain.** A lookup of
   `COLOR_ENUMERATORS['constructor']` returns `Object`'s constructor rather than `undefined`, so
   `cppValue` would emit a function's source instead of throwing. It is unreachable today, because
   Pass 4 refuses any colour outside `COLOR_VALUES` first. I kept the behaviour unchanged. A `Map`
   or an `isDrawColor` guard would close it.
2. **Source-scanning tests pin file paths.** `validator-alignment.test.ts` and
   `validator-hardening.test.ts` (`schema/globals.ts`, `resolver/mangle.ts`, …) assert where things
   are declared by path, so every move means a test edit. This WO's amendment covers it for now; a
   standing rule could make it permanent.
3. **`schema/index.ts` exports types only.** `STYLE_PROPERTIES`, `COLOR_VALUES`,
   `FLAG_COMPARISONS` and the like are reachable only by module path, not from the package root.
   I left it that way so the public API does not change; whether they should be public is an owner
   question.
