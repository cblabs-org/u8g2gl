---
work_order: WO9
project: pr-03-widgets
title: "[U-1] missing-name policy — CLI errors, editor generates, --fix-names writes back"
branch: u8g2gl-widgets/wo9-name-policy
base: u8g2gl-widgets/wo8-identity-remediation
complexity: standard
status: pending
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

<!-- Written by the worker at task completion -->
