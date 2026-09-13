---
work_order: WO5b
project: pr-3r-remediation
title: "Retire the Component type — finish the [D-18] merge"
branch: u8g2gl-remediation/wo5b-component-retire
base: u8g2gl-remediation/wo5-schema-merge
complexity: standard
status: complete
---

# WO5b — Retire the `Component` type

## Authorization

Part of PR-3R, approved by the human on 2026-09-13 — verify the verbatim record
in `../PROJECT.md`. **WO5b was added by the Principal Architect during execution**
to finish what WO5 correctly stopped short of. If the record is absent or reads
as a placeholder, **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> those specified here, do not branch beyond the one named below.

## Branch

**Branch**: `u8g2gl-remediation/wo5b-component-retire`
**Base**: `u8g2gl-remediation/wo5-schema-merge`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted. **Commit
incrementally**; a green intermediate state committed is worth more than a perfect
one lost.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. §4.1 explains [D-18].

---

## Objective

`Component` stops existing as a distinct type. A composite becomes what [D-18]
says it is: a `WidgetManifest` whose `<api>` carries a `view`.

## Background — why WO5 stopped, and why it was right to

WO5 merged `ComponentProp` into `PropDef` cleanly, and `help` now works on
composite props. It could not retire `Component` itself, because five call sites
across four validator files read `comp.api` as a bare `PropDef[]`, while a
widget's props are read as `manifest.api.props` through an `ApiBlock`. Unifying
the type means unifying those reads — and those four files were reserved for WO6.

WO5 built the literal version first, found it did not compile, and surfaced the
conflict rather than either reaching into reserved files or choosing a shape that
compiled but encoded the wrong thing. That was the correct call. This work order
supplies the authorization it lacked.

**You get the validator files before WO6 does**, and deliberately: a type
migration and four behaviour changes in one diff is not reviewable. Yours is the
type migration. WO6 changes behaviour afterwards, on a settled shape.

## Line-Item Instructions

- [x] Retire `Component`. A composite is a `WidgetManifest` with a `view`. Whether
      `cli/src/core/schema/component.ts` disappears or becomes a thin re-export is
      your call — say which you chose and why.
- [x] Unify how composite props are read. The five known sites:
      `validate-identifiers.ts:441`, `validate-references.ts:333`,
      `validate-schema.ts:393`, `validate-widget-props.ts:176` and `:206`. Search
      for others rather than trusting this list — it was gathered by grep, not by
      the compiler.
- [x] **Delete the `@deprecated ComponentProp` alias.** A deprecation alias buys
      downstream consumers time to migrate; there are no downstream consumers, and
      no XML or code exists outside this repository. Keeping it is debt with
      nothing on the other side of the trade. This is the same reasoning that
      rejected `--migrate` in WO8.
- [x] **No behaviour change.** Every diagnostic that fires today must still fire,
      with the same code and the same severity. You are changing how the validator
      *reaches* a composite's props, not what it concludes about them.
- [x] If unifying the read reveals a genuine behavioural difference between the
      widget path and the composite path — one validates something the other does
      not — **stop and surface it.** That is a finding for WO6, not a thing to
      quietly harmonise.

## Strict Boundary Box

**In scope:** `cli/src/core/schema/component.ts`, `widget-manifest.ts`,
`cli/src/core/schema/index.ts`, `cli/src/core/parser/parse-component.ts`, the four
validator files **for the type migration only**, their tests and fixtures, this
WORKORDER.

**Do NOT touch:** validator *behaviour* — `TIER1_PRIMITIVES`, cycle detection,
composite tag validation, container geometry, and the `setter`/`draw` rule are all
WO6's, and WO6's WORKORDER already specifies them. Do not do WO6's job because you
are in its files. Do not touch the C++ runtime, the manifests, or `docs/`.

---

## Testing Requirement

- [x] Every existing validator test passes **with its assertions intact**. This is
      the whole safety property: a type migration that needed the tests rewritten
      changed behaviour.
- [x] A composite's props still validate — names, types, `help`, and the
      diagnostics that fire on bad ones.
- [x] `npx tsc --noEmit` is the real gate. The compiler finds the call sites grep
      missed.

## Verification Requirement

- [x] `cd cli && npx vitest run` — all pass, none weakened or removed
- [x] `npx tsc --noEmit` and `npm run lint` — zero errors
- [x] `cmake --build build && ctest --test-dir build` — unchanged and green
- [x] Confirm no `Component` type and no `ComponentProp` alias remain, and say how
      you verified it
- [x] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file an issue. The architect triages and files.

---

## Completion Report

<!-- Written by the worker at task completion -->

**Status: complete, commit `00651d7`.** Branch verified as
`u8g2gl-remediation/wo5b-component-retire` immediately before the commit, as a
separate command. CLI **240 tests unchanged** (26 files), `npx tsc --noEmit`
clean, `npm run lint` clean, C++ **238 tests unchanged**
(`cmake --build build && ctest --test-dir build`, zero new warnings — the C++
tree was not touched).

### What changed

- **`cli/src/core/schema/component.ts` deleted outright**, not kept as a thin
  re-export. `Component` is now literally `WidgetManifest` — nothing is left
  behind for anyone to import, so a second name for the same type would be
  exactly the class of debt line-item 3 already rejects for `ComponentProp`.
  Every former `Component`/`ComponentProp` import site now imports
  `WidgetManifest`/`PropDef` from `widget-manifest.ts` directly.
- **`WidgetManifest.extends` becomes optional** (`extends?: string`). This was
  the one structural gap WO5's literal-alias attempt didn't get far enough to
  hit: a composite has no C++ base class to name (it is inlined into its
  constituent elements at build time, §13.4), so a true type-identity merge
  needs `extends` to be omittable rather than inventing a placeholder value.
  Nothing currently reads `.extends` off a composite; the one place that
  enforces its presence (`validate-schema.ts`'s widget-manifest schema check,
  §5) iterates only `widgetManifests`, which composites never join — so this
  is a type-shape correction with no behavioural reach, not a schema change.
- **`parse-component.ts`** now builds a full `ApiBlock`
  (`{ props: apiProps, bindings: [], elements: [] }`) instead of a bare
  `PropDef[]`. `bindings` and `elements` are always empty because a
  `<component>` document has never declared either — no parsing behaviour
  changed, only the shape the result is wrapped in.
- **The four validator files** now reach a composite's props through
  `.api.props` instead of `.api`, exactly mirroring how each file already read
  a widget's `manifest.api.props`:
  - `validate-identifiers.ts:441` (component-property name-rule check)
  - `validate-references.ts:333` ($prop template name collection)
  - `validate-schema.ts:393` (component `<prop>` required/type checks)
  - `validate-widget-props.ts:176` and `:206` (component attribute/required
    checks)
  Every diagnostic code and severity these produce is unchanged; only the
  property array's origin path changed.
- **The `@deprecated ComponentProp` alias is deleted.** No downstream
  consumer exists to protect.

### Files touched beyond the five-site grep list and the named boundary

The WORKORDER warned the five-site list was gathered by grep, not the
compiler, and to trust `tsc` instead. Deleting `component.ts` surfaced three
more files that import `Component` and would not otherwise compile:

- `src/core/validator/validate.ts` — `ValidateInput.components` typed as
  `readonly Component[]`; changed to `readonly WidgetManifest[]`. Type-only,
  no logic touched. Kept as a separate field from `widgetManifests` rather
  than merged, because the two are still validated by different passes
  (composite-tag rules vs. real `<widget>` schema rules) — unifying that pass
  structure is WO6's "composite tags" work, not this migration's.
- `src/node/cli.ts` — same import/annotation change on `parsedComponents`.
  Type-only.
- `src/core/parser/index.ts` — one doc-comment line said "Parse component XML
  files into Component"; corrected to name `WidgetManifest`. No code change.

None of these touch validator *behaviour*, C++ runtime, manifests, or `docs/`.
I judged them in-scope as unavoidable consequences of the type retirement the
WORKORDER's Objective names explicitly, and flagged them here rather than
silently expanding the diff without comment. If the architect disagrees with
including `validate.ts`/`cli.ts` in this PR's diff, they are two-line,
mechanical, and trivially separable.

Test files touched for the same reason (compile/assert against the new
shape, not named individually in the boundary box but exercising the
in-scope files above): `test/schema/types.test.ts` (the `Component`
describe-block, now testing a composite `WidgetManifest` literal directly),
`test/validator/identifiers.test.ts` and `test/validator/references.test.ts`
(inline component fixtures reshaped from bare `api: []` arrays to
`api: { props: [], bindings: [], elements: [] }` — these previously passed
only because the arrays were empty and the fixtures were structurally
untyped; vitest's esbuild transform does not type-check test files, so `tsc`
alone would not have caught them — only running the actual suite did).

### No behaviour change — how I verified it

- Every existing validator test's original assertions are intact; none were
  loosened, removed, or rewritten to fit the new shape. The only test-side
  edits are read-path renames (`comp.api` → `comp.api.props`) forced by the
  type change itself, plus the two named describe-blocks above.
- CLI test count is unchanged at 240 before and after (`npx vitest run`, run
  both before touching any file and after the final edit).
- `git diff --stat` against the parent commit touches exactly the 15 files
  named above (14 modified, 1 deleted) — no manifest, no `docs/`, no C++ file.

### Genuine behavioural difference found — surfaced for WO6, not fixed

Unifying the read (`.api` → `.api.props`) put the widget path (Case 1) and
component path (Case 2) in `validate-widget-props.ts` side by side for direct
comparison, and it reveals a real asymmetry that **predates this work
order** — it was already true of the old `Component`/`ComponentProp` code,
not introduced by this migration:

**Enum values are validated on widget props but never on composite props.**
Case 1 has a step 1c that checks `prop.type === 'enum'` values against
`prop.values` and emits `INVALID_ENUM_VALUE` with suggestions. Case 2 has no
equivalent step at all — a composite `<prop type="enum" values="...">` can be
instantiated with any string value and nothing will catch it, while the
identical prop shape on a widget manifest would be caught immediately.

A related, currently-latent asymmetry: Case 1 also folds `manifest.api.bindings`
(plus each binding's `fmt`) into its allowed-attribute set before flagging
`UNKNOWN_ATTRIBUTE`; Case 2 only ever looks at `component.api.props`. This is
not an active bug today — `parse-component.ts` always produces an empty
`bindings` array for composites, so there is nothing yet for Case 2 to miss —
but the moment composite `<api>` gains binding declarations (a WO8-shaped
schema question), Case 2 will silently reject every `bind_*` attribute on a
composite instance as unknown, where Case 1 already handles the exact same
shape correctly.

Per line-item 4, I have not touched either of these — they are validator
*behaviour*, squarely WO6's "composite tags" charter, and folding a fifth
behaviour change into a type-migration diff would make neither reviewable.

### Nothing else surfaced

No other out-of-boundary defects found. `TIER1_PRIMITIVES`, cycle detection,
container geometry, and the `setter`/`draw` rule were not inspected beyond
confirming the four validator files' *type* migration didn't touch them —
`git diff` on each of those four files shows only the one-line `.api` →
`.api.props` change (plus a short why-comment) per site, nothing else moved.
