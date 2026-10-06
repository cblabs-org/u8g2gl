---
work_order: WO4
project: pr-4r3-corrections
title: "Readability remediation"
branch: u8g2gl-4r3/wo4-readability
base: u8g2gl-4r3/wo3-binding-alias
complexity: standard
status: dispatched
---

# WO4 — readability review remediation

## Authorization

Part of PR-4R3 (`pr-4r3-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, which includes WO4. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r3`.** **Branch**:
`u8g2gl-4r3/wo4-readability` (already checked out, no upstream) · **Base**:
`u8g2gl-4r3/wo3-binding-alias`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch files in `tmp/` in this
worktree. `extern/u8g2` is initialised; `build/` exists. vitest's globalSetup runs `tsc`.
`refresh-goldens.mjs` reads `cli/dist/`, so **run `npm run build` in `cli/` before refreshing
goldens**, or it refreshes stale output silently.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` (`cpp.md`, `typescript.md`, `documentation.md`). **§4.1** binds the lines
you add or change: published references and measured facts only, no work-order tags, workspace
paths or narrated debate. Pre-existing citations on lines you do not touch are not yours.

---

## Objective

Fix the seven P3 findings in [REVIEW.md](REVIEW.md). PA decisions on the P4s: **all skipped**
(the `@code` example mirrors the schema macro's; `RuntimeVersion` lives under `node/`, which core
data must not import; the banner and long test lines pass lint).

## Line-Item Instructions

Read `REVIEW.md` for each finding's file:line and the reviewer's suggested fix.

- [ ] **Measure the baseline**, each suite alone: C++ **401 / one skip**, **0** warnings; CLI
      **1338**, `tsc`, lint.
- [ ] **P3 — `#else` guard** (`cli/src/core/generator/emit/generated-config.ts`). Emit:
      ```cpp
      #ifndef U8G2GL_REQUIRE_RUNTIME_VERSION
      #error "…unchanged text…"
      #else
      U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);
      #endif
      ```
      **Measure first**: compile the current committed fixture config
      (`test/generated_fixture/generated/u8g2gl_generated_config.h`) against the frozen header
      `test/version_guard/pre_macro/` with clang and paste both errors; after the change, paste the
      single remaining error. Update the emitted comment, `emit-golden.test.ts`'s ordering
      assertion, and the `u8g2gl_version.h` Doxygen wording ("guards the call"). Rebuild the CLI,
      refresh goldens; the golden diff must be these lines only. `VersionGuard.PreMacroRuntimeFailsByName`
      and `VersionGuard.GeneratedConfigCompiles` must still pass. **No version bump**: 0.11.0 is
      unreleased and this PR introduced the text.
- [ ] **P3 — the floor's message** (`include/u8g2gl/u8g2gl_version.h`). The `static_assert` text and
      the macro's `@brief` must describe the refusal truthfully for an older minor **and** for a
      different major (newer included), e.g. "generated for runtime major M, minor m or later".
      Update both `PASS_REGULAR_EXPRESSION`s in `test/CMakeLists.txt`; both tests must still match
      on the message. Paste the two matched lines.
- [ ] **P3 — one citation tail** in `bindingAliasDiagnostic` (`validate-schema.ts`): no adjacent
      parentheticals; cite §13.1 once (e.g. "(§13.1, §8.4, [D-20])"). Update any test asserting the
      old text.
- [ ] **P3 — Step 3's wording**: a drawing element's own geometry prop bound under another name
      says it binds its **own** prop `'<setter>'` under another name; Step 2 keeps the inherited
      wording. One function, a parameter for the case — not a second function.
- [ ] **P3 — §4.1 tag** at `generated-config.ts:21` ("WO8b's `Capacities`" on a changed line):
      point at the module (`src/core/realise/capacities.ts` or wherever `Capacities` is defined —
      check). Touch only that changed line's tag.
- [ ] **P3 — TSDoc** on exported `RUNTIME_VERSION` in `cli/src/data/runtime-version.ts`. If that
      file is written by `build-runtime-version.ts`, put the doc in the generator so a rebuild
      keeps it; then re-run `npm run build:runtime-version` and confirm the drift test passes.
- [ ] **P3 — `M`** in `manifest-registry.ts`'s why-comment (~388): name what is meant ("the
      extending manifest").
- [ ] **End to end** with the built CLI: generate a project into `tmp/`; compile its config against
      this runtime (compiles, 0 warnings under `-Wall -Wextra -Wpedantic`) and against the frozen
      header (exactly one error, the `#error`). Paste both.

## Strict Boundary Box

**In scope:** the files named in the items above, the goldens via the refresh script,
`test/CMakeLists.txt` (the two regexes), tests asserting changed text, this WORKORDER.

**Do NOT touch:** `docs/`; `.agents/rules/`; any version; the P4 items; anything `REVIEW.md` does
not name; `PROJECT.md`; `MEMORY.md`; `REVIEW.md`.

---

## Verification Requirement

- [ ] C++ from a clean configure: **0** warnings, ctest **401 / one skip**; CLI **≥ 1338**, `tsc`,
      lint — **each suite alone**, counts recorded
- [ ] Golden diff vs `u8g2gl-4r3/wo3-binding-alias`: the `#else` restructure only
- [ ] `git diff --name-only u8g2gl-4r3/wo3-binding-alias..HEAD` within the Boundary Box
- [ ] `git diff u8g2gl-4r3/wo3-binding-alias..HEAD` adds no work-order tag on any line

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
- finding → fix, per P3

### Evidence
- clang before/after on the pre-macro header; matched CTest lines; golden diff; built-CLI compiles

### Out-of-Scope Findings

### Blockers
(none)
```
