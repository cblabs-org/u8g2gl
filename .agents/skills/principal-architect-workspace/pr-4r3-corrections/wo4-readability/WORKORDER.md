---
work_order: WO4
project: pr-4r3-corrections
title: "Readability remediation"
branch: u8g2gl-4r3/wo4-readability
base: u8g2gl-4r3/wo3-binding-alias
complexity: standard
status: complete
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

**Work only in `../U8G2GL-4r3`.** **Branch**:
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

---
## Completion Report

### Status
complete

### Baseline and final counts
| Suite | Baseline | Final |
|---|---|---|
| C++ (clean configure, ctest) | 401 / one skip (SizeOfReport.ThirtyTwoBitTarget), 0 warnings | 401 / one skip, 0 warnings |
| CLI (vitest) | 1338 | 1338 (two existing tests gained wording assertions) |
| `tsc --noEmit` | clean | clean |
| lint (`eslint` and `tsc -p tsconfig.test.json`) | clean | clean |

Each suite was run alone.

### Changes Made
- **`#else` guard** (`generated-config.ts`): the call now sits in `#else`, before the closing `#endif`. A comment line records why. `emit-golden.test.ts` asserts the call lies between `#else` and `#endif`. `u8g2gl_version.h` Doxygen now says "guards the call". Both goldens refreshed from a rebuilt CLI. No version bump.
- **Floor message** (`u8g2gl_version.h`): the `static_assert` reads "generated for runtime major M, minor m or later", and the `@brief` says the runtime must have the major and at least the minor the code was generated for. Both `PASS_REGULAR_EXPRESSION`s in `test/CMakeLists.txt` updated.
- **Citation tail** (`validate-schema.ts`): one parenthetical, "(§13.1, §8.4, [D-20])" for geometry and "(§13.1, [UD-5])" otherwise.
- **Step 3 wording**: `bindingAliasDiagnostic` takes `origin: 'inherited' | 'own'`. Step 3 says "binds its own prop 'x' under another name"; Step 2 keeps "reaches a setter that is bound under another name". The existing tests in `bind-type-paths.test.ts` gained assertions on both.
- **§4.1 tag**: "WO8b's `Capacities`" became "the `Capacities` counted in `src/core/realise/capacities.ts`" (`Capacities` is defined there).
- **TSDoc** on `RUNTIME_VERSION`. The file is hand-written (only the `.json` is generated), so the doc lives there. `npm run build:runtime-version` was re-run and left the stamp unchanged (0.7.0).
- **`M`** in `manifest-registry.ts` became "The result keeps the parent's props deliberately".

### Evidence
- clang before, on the committed fixture config against `test/version_guard/pre_macro/`: two errors, the `#error` at line 43 and "a type specifier is required for all declarations" at line 45 on `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);`.
- clang after: `1 error generated.`, only the `#error` (now line 44), same text.
- CTest, matched lines:
  - OlderRuntimeFailsToCompile: `static assertion failed due to requirement '(7 + 1) <= 7': U8G2GL runtime too old or mismatched: this code was generated for runtime major 0, minor 7 + 1 or later, but this runtime is 0.7.0.`
  - MismatchedRuntimeMajorFailsToCompile: `static assertion failed due to requirement '(0 + 1) == 0': U8G2GL runtime too old or mismatched: this code was generated for runtime major 0 + 1, minor 7 or later, but this runtime is 0.7.0.`
  - All 10 VersionGuard.* tests pass, including PreMacroRuntimeFailsByName and GeneratedConfigCompiles.
- Golden diff, both files: the comment line, `#endif` becoming `#else`, and `#endif` moving after the call. Nothing else.
- Built CLI (`generate` on the emit-project fixture into `tmp/`): the config compiles against this runtime with exit 0 and no output under `-Wall -Wextra -Wpedantic`. Against the frozen header it gives exactly one error, the `#error`.
- Source files changed are all inside the Boundary Box. The added lines in source files contain no work-order tag; the only matches in `git diff u8g2gl-4r3/wo3-binding-alias` are in workspace files the PA committed.

### Out-of-Scope Findings
- §16 of the design spec says the guard is "preceded by an `#ifndef`". The `#else` form is not literally that. This was noted in REVIEW.md for the architect and `docs/` was not touched.

### Blockers
(none)
