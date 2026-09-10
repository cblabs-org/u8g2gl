---
work_order: WO9
project: pr-03-widgets
title: "[U-1] missing-name policy — CLI errors, editor generates, --fix-names writes back"
branch: u8g2gl-widgets/wo9-name-policy
base: u8g2gl-widgets/wo8-identity-remediation
complexity: standard
status: complete
---

# WO9 — Missing-Name Policy and Write-Back

## Authorization

Part of PR-03 (pr-03-widgets), decomposition approved by the human on
2026-09-10T07:10:37Z. WO9 was added by the Chief Architect on 2026-09-10 at the
human's explicit direction ("yes do wo9 and also please do the generate mode too"),
following review of PR #3. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> those specified here, do not branch beyond the one named below, do not plan.

## Branch

**Branch**: `u8g2gl-widgets/wo9-name-policy`
**Base**: `u8g2gl-widgets/wo8-identity-remediation`

You are already on it. Verify with `git branch --show-current` **as its own command
immediately before every commit** — never batched into the same command as the
commit. A check that runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Read BEFORE writing code: the `u8g2gl-standards` skill, especially
`references/typescript.md` and `references/documentation.md`.

---

## Background — the defect this closes

WO8 made synthesised names unique within a parse. They are still **positional**: the
name is recomputed from document position on every load, so inserting an element
renumbers its later siblings.

That is fatal once code generation exists (PR-04). Generated code binds to the name.
Generate against `label_0`, insert an element above it, regenerate — and `label_0` is
now a **different widget**, silently driving the user's application code into the
wrong object with no diagnostic.

The owner's resolution, which this WO implements:

> **The CLI must error when a name is missing. The editor must auto-correct and
> generate names.**

The reasoning is that **auto-correction requires a human who can see it and undo
it.** The editor has a canvas, a property panel, an undo stack and a save cycle. A
build pipeline has none of those — if the build invents identity it does so silently,
into generated code, in CI, with nobody looking.

This is a clarification of `[U-1]`, not a reversal. The original
"a hand-authored file should still open" argument was always an **editor** argument;
it ended up in the shared parser, where the build inherited it by accident.

---

## Design — settled, implement as specified

### 1. Policy is a parameter, not a branch

Core is isomorphic (`src/core/` must not import `node:`) and serves both the CLI and
the editor. The policy is therefore passed **in**, so the two journeys cannot drift
into two implementations:

```ts
export type MissingNamePolicy = 'error' | 'generate';
```

- **`'error'`** — emit `U8G2GL_MISSING_NAME` at `error` severity and **do not
  synthesise a name**. The element keeps no name; downstream validation may report
  further consequences, which is acceptable.
- **`'generate'`** — today's WO8 behaviour exactly: synthesise from the document-wide
  allocator, emit `U8G2GL_MISSING_NAME` at `warning` severity, carry on.

**Default is `'error'`.** If a caller does not choose, it gets the safe journey.
Silent synthesis is the dangerous option and must be opted into.

**On the one-code-two-severities question:** keep the single
`U8G2GL_MISSING_NAME` code. Its severity is a deterministic function of the policy
the caller passed, so a consumer always knows which it will get. Document this
explicitly on the code's declaration in `diagnostic.ts` — it must read as deliberate,
because a previous review flagged it as an accidental trap.

### 2. Thread the option through the parser entry points

`parseScreenFile()` and `parseComponentFile()` take an options object, which flows to
`parseWidgetTree()` and `parseWidgetNode()`. Prefer an options *object* over a
positional boolean so the call sites stay readable.

**Also fix, while you are in this file:** `parseWidgetNode()` is exported with
`allocator: NameAllocator = createNameAllocator([el])`. That default silently builds
a **single-element** allocator, so any external caller — a PR-04 generator, or the
editor parsing a fragment — reintroduces the exact scope mismatch WO8 removed.
**Remove the default and pass the allocator explicitly** from the internal recursive
call. A default that quietly does the wrong thing is worse than a required argument.

### 3. Write-back computes edits in core, applies them in node

Write-back does **not** need a round-trip serializer, and you must not build one.
Every `RawXmlElement` carries `loc` (the opening `<`) and each attribute its own
location, so inserting ` name="…"` after a tag name is a **line/column text
insertion**. Formatting, comments, whitespace and attribute order all survive because
nothing is re-serialised.

Split it across the isomorphic boundary:

- **In `src/core/`** — compute and return the edits: an ordered list of
  `{ loc, text }` insertions. Pure, no file I/O. The editor will consume exactly this
  to apply the same edits to an in-memory buffer in the browser.
- **In `src/node/`** — apply the edits to disk.

Apply edits **back-to-front** (descending position) so earlier insertions do not
invalidate the offsets of later ones. If you apply front-to-back you must re-derive
offsets after each edit; back-to-front is simpler and less error-prone. State which
you chose in a comment.

### 4. CLI surface

- `validate` uses `'error'` — the build journey.
- **New flag `--fix-names`**: parse with `'generate'`, apply the edits to the source
  files, report what was written, then re-validate. The build never *silently*
  invents identity, but the user can ask it to in a command they typed.
- `--fix-names` must honour the existing `--json` contract `[D-16]`: report the files
  changed and names inserted as structured data, not only prose.
- Do **not** add a `generate`/`build` command. That is PR-04.

---

## Strict Boundary Box

**In scope:**
- `cli/src/core/parser/` — `parse-widget-tree.ts`, `parse-screen.ts`, `parse-component.ts`, `index.ts`
- `cli/src/core/schema/diagnostic.ts` — documentation of the severity duality only
- A new core module for edit computation (site your choice within `src/core/`)
- `cli/src/node/cli.ts` and a new node module for applying edits
- `cli/test/**` — new and updated tests
- This `WORKORDER.md` (your Completion Report)

**Do NOT touch:**
- `cli/src/core/validator/` — the validator's own `MISSING_NAME` check stays as a
  belt-and-braces path. Do not delete it.
- The `NameAllocator` logic from WO8 beyond wiring the policy and removing the
  default parameter. It is correct and tested.
- Any C++ runtime file, widget, or manifest.
- `docs/` or any other `.agents/` file.
- The schema version. It stays `0.3` — the XML vocabulary is unchanged. A schema bump
  is an owner decision per `rules/03-versioning.md`.

**Do NOT** create branches beyond the one named, open PRs, rebase, or merge.

If a fix appears to need something outside this box, **stop and record it** in your
Completion Report rather than doing it.

## Versioning

Per `rules/03-versioning.md`, bumping the **generator/CLI** version for an
output-affecting change is required, not optional. `cli/package.json` is currently
`0.4.0`. Bump the minor version and say so in your report. **Do not** touch
`VALID_SCHEMA_VERSION`.

---

## Testing Requirement

- [ ] Default policy is `'error'`: an unnamed element yields an **error** diagnostic
      and **no synthesised name**
- [ ] `'generate'` policy reproduces WO8 behaviour exactly — all existing WO8 tests
      must pass unchanged under it, including the `<style name="x"/>` case and the
      later-in-document-order collision test
- [ ] Edit computation returns one insertion per unnamed element, at the right
      location, with a well-formed ` name="…"` attribute
- [ ] Applying the edits to a source string produces valid XML that **reparses with
      zero `MISSING_NAME` diagnostics under `'error'`** — this is the round-trip
      proof and the most important test in this WO
- [ ] Applying edits preserves comments, attribute order and indentation — assert on
      an input containing all three
- [ ] Multiple insertions in one file land correctly (this is what catches a
      front-to-back offset bug)
- [ ] `--fix-names` end-to-end through the CLI, including `--json` output shape

## Verification Requirement

- [ ] `npx vitest run` in `cli/` — all pass, none weakened or removed
- [ ] `npx tsc --noEmit` and `npm run lint` — zero errors
- [ ] `cmake --build build` and `ctest --test-dir build` — still green, zero warnings
- [ ] No `node:` import anywhere under `src/core/` — verify explicitly and state how
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not fix
it, do not file an issue. The architect triages.

---

## Completion Report

**Status**: complete. Branch `u8g2gl-widgets/wo9-name-policy`, commit `b4b237b`,
pushed to origin. No other branch created, no rebase, no merge, no PR.

### What changed

**New — `cli/src/core/parser/name-policy.ts`** (isomorphic)
`MissingNamePolicy`, `DEFAULT_MISSING_NAME_POLICY = 'error'`, `SourceEdit`,
`ParseOptions`, `createNameInsertion()` and `applyTextEdits()`. No XML
serializer: an insertion is ` name="…"` at the column one past the tag name,
derived from the element's recorded `<` location. `applyTextEdits()` resolves
1-based coordinates to offsets against a line-start table whose newline handling
(LF/CR/CRLF) matches the tokeniser's own `advance()`, then applies
**back-to-front** — descending offset, so an insertion never shifts an offset
still to be applied. That choice is stated in a comment at the sort.

**New — `cli/src/node/fix-names.ts`** (Node-only)
`fixMissingNames()` re-parses screens and components under `'generate'`, applies
their insertions to the files on disk, and returns one `NameFixRecord` per file
actually modified. It re-reads each file immediately before writing.

**`parse-widget-tree.ts`**
- `WidgetParseContext` (allocator + policy + optional edit sink) replaces the
  bare allocator parameter, and `createWidgetParseContext()` builds one.
- `parseWidgetNode()`'s **default `allocator` parameter is removed**; the
  context is required, and its Doxygen says why a default would be wrong.
- The identity step branches on the policy: `'error'` emits an error and
  synthesises nothing (and deliberately carries **no** `suggestions`, since there
  is no machine-applicable name to propose); `'generate'` delegates to a new
  `synthesiseName()` helper carrying the unchanged WO8 allocation logic plus the
  edit record.
- `parseWidgetTree()` gained an optional `ParseOptions`; omitting it selects
  `'error'`.

**`parse-screen.ts` / `parse-component.ts`** — `parseScreen`, `parseScreenFile`,
`parseComponent`, `parseComponentFile` all take `ParseOptions`. `ParseResult<T>`
gained `nameEdits?`, so a caller that passed no sink still receives the edits.

**`diagnostic.ts`** — documentation only: the two-severity duality of
`U8G2GL_MISSING_NAME` is now documented on its declaration as deterministic in
the caller's policy, explicitly flagged as deliberate rather than two code paths
sharing a constant.

**`cli.ts`** — `--fix-names` on `validate`. The fix pass runs *before* the load,
writes to disk, and the existing validate path then reads the rewritten files, so
the "re-validate" is a genuine re-validation rather than an assumption. Target
resolution now takes the first **positional** argument, so
`validate --fix-names <path>` works in either order. `--json` gains `fixedNames`
**only when `--fix-names` was given**, leaving the existing `[D-16]` contract
byte-identical for every other caller. Usage text updated.

**`cli/package.json`** — `0.4.0` → `0.5.0` (minor, per `rules/03-versioning.md`;
output-affecting). `VALID_SCHEMA_VERSION` untouched — schema stays `0.3`.

### Tests

**203 before → 224 after; 26 files; all pass, none weakened or removed.**

- `test/parser/name-policy.test.ts` (new, 15 tests) — default is `'error'` with
  no synthesis and no value; explicit `'error'` is identical to the default;
  `parseWidgetTree` defaults safely too; `'generate'` warns and synthesises;
  edit shape, position and count; **round trip** — generate, apply, reparse under
  `'error'`, assert zero `MISSING_NAME` and zero errors; a second fix pass is a
  no-op; comments, attribute order and indentation preserved on an input
  containing all three; multiple insertions in one file, including two on one
  line; CRLF; an out-of-range edit is skipped rather than thrown.
- `test/integration/cli.test.ts` (+6) — without the flag, unnamed elements are
  errors and **nothing on disk changes**; `--fix-names` writes, reports and
  revalidates clean; `--json` shape; idempotence; single file with the flag
  before the path; an already-named project is left byte-identical.
- `test/validator/element-identity.test.ts` — the nine WO8 synthesis assertions
  now pass `{ missingNamePolicy: 'generate' }`. **Every assertion is unchanged**;
  only the opt-in was added, which is precisely the WO's requirement that WO8
  behaviour be reproduced exactly under `'generate'`. The `<style name="x"/>`
  case and the later-in-document-order collision case both still pass verbatim.

### Verification

- `npx vitest run` — 224/224 pass.
- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- `cmake --build build` — no warnings; `ctest --test-dir build` — 166/166 (1
  skipped, the pre-existing 32-bit sizeof report).
- **Isomorphic constraint, verified two ways.** (1) `grep -rn "from 'node:\|require(\|from 'fs'\|from 'path'\|process\.\|__dirname" cli/src/core/` returns nothing.
  (2) `npx eslint src/core --max-warnings 0` passes, and `eslint.config.js`
  already carries a `no-restricted-imports` rule over `src/core/**/*.ts` banning
  `node:*` and every Node builtin — so this is enforced by the build, not by
  vigilance. The new `name-policy.ts` imports only a type from `../schema/`.
- `git diff` touches only Boundary Box files: `cli/package.json`,
  `cli/src/core/parser/{index,parse-component,parse-screen,parse-widget-tree,name-policy}.ts`,
  `cli/src/core/schema/diagnostic.ts`, `cli/src/node/{cli,fix-names}.ts`,
  `cli/test/**`. `git status` is clean; the integration tests build their
  throwaway projects under the git-ignored `tmp/` and remove them afterwards.
- `cli/src/core/validator/` untouched — the belt-and-braces `MISSING_NAME` check
  is intact.

### Found but not fixed — for the architect

1. **A screen or component validated as a single file always errors.** Validating
   one file in isolation has no globals or widget manifests, so it reports
   `U8G2GL_UNKNOWN_WIDGET` and `U8G2GL_UNKNOWN_FONT` for content that is
   perfectly valid inside its project. Pre-existing, unrelated to WO9, but it
   made one `--fix-names` test unable to assert exit 0 for a single file — the
   test asserts the write and the absence of `MISSING_NAME` instead, with a
   comment saying why. Worth deciding whether single-file validate should locate
   its project root.
2. **The `'error'` diagnostic names the fix in prose, not in `suggestions`.**
   Per §4 of the TypeScript standards suggestions must be machine-applicable, and
   under this policy there is deliberately no name to apply. A consumer wanting to
   offer "fix this" therefore has to know about `--fix-names` out of band. If that
   matters, the diagnostic contract may want a structured "remedy command" field —
   a schema-adjacent decision, so not taken here.
3. **`parseWidgetNode()` now requires a `WidgetParseContext`, whose
   `NameAllocator` is exported as a type.** Exporting it was necessary for
   declaration emit and to let an external caller build a context at all. The
   allocator's *logic* is untouched.
4. **`--fix-names` writes before validating, and does not stage or back up.** On a
   dirty working tree the user's only undo is `git checkout`. Deliberate — it is a
   command the user typed — but if a `--dry-run` is wanted, the edits are already
   computed in core and would be a small addition.
