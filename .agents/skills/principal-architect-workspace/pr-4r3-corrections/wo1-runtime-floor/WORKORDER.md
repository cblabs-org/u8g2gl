---
work_order: WO1
project: pr-4r3-corrections
title: "Generated code asserts the runtime it needs"
branch: u8g2gl-4r3/wo1-runtime-floor
base: main @ 783e189
complexity: standard
status: dispatched
---

# WO1 — §16's runtime floor, stamped, emitted, and refused by name

## Authorization

Part of PR-4R3 (`pr-4r3-corrections`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Chief Architect rulings"
R1 and R3 state this WO's rule and versions. This WORKORDER's `status` must be `dispatched`.
Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r3`.** **Branch**:
`u8g2gl-4r3/wo1-runtime-floor` (already checked out, no upstream) · **Base**: `main` @ `783e189`.
Run `git branch --show-current` **as its own command immediately before every commit**
(`.agents/rules/04-branch-hygiene.md`). Scratch files go in `tmp/` in this worktree
(`.agents/rules/02-workspace.md`), never in `/tmp`.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`,
`references/typescript.md`, `references/documentation.md`. **§4.1**: on lines you add or change,
cite published references (`§16`, `[D-11]`, `rules/03`) and measured facts; no work-order tags
(no "PR-4R3", "WO1"), no workspace paths, no narrated debate. Pre-existing citations are not yours
to sweep. `cli/test/generator/no-ticket-numbers.test.ts` already polices generated output.

---

## Objective

Every generated project refuses, at compile time and by name, a runtime older than the one the CLI
was built beside — including a runtime so old it predates the check. The floor the CLI emits is
stamped from `include/u8g2gl/u8g2gl_version.h`, and a stamp that falls behind the header fails a
test.

## Background (PA scoping at `783e189`)

- `U8G2GL_REQUIRE_SCHEMA_VERSION` is at `include/u8g2gl/u8g2gl_version.h:86`: a `static_assert`
  that names both versions via `U8G2GL_VERSION_STR`. Mirror its **shape and message style**.
- The emitter is `cli/src/core/generator/emit/generated-config.ts`, section `Version guard (§16)`
  (around line 172). Nothing emits a runtime requirement today.
- `CMakeLists.txt` lines 6–26 already parse the header's `U8G2GL_VERSION_*` macros at configure
  time and refuse a mismatch with `project(... VERSION)`.
- **The drift-guard precedent is `cli/test/manifests/manifest-bundle.test.ts`** with
  `npm run build:manifests` (`cli/src/node/build-manifests.ts` → `cli/src/data/manifests.json` +
  `manifests.ts`). Use that shape: a build script writes committed data under `cli/src/data/`, a
  test compares it to the in-tree source and fails the moment they differ, and the test proves it
  is not vacuous by feeding a doctored copy. **Do not invent a second shape.**
- The compile-must-fail precedent is the `VersionGuard.*` CTests (`test/CMakeLists.txt` ~363–382,
  sources `test/version_guard/*.cpp`), matched with `PASS_REGULAR_EXPRESSION` on the refusal
  message and listed in the `RESOURCE_LOCK u8g2gl_build_tree` block (~746).
- Goldens: `cli/test/generator/fixtures/emit-project/expected/` and
  `test/generated_fixture/generated/`, refreshed by `cli/test/generator/refresh-goldens.mjs`. The
  golden generator version is `0.0.0-golden`; the C++ suite compiles `test/generated_fixture`.

## The rule (Chief Architect R1, PROJECT.md)

**Floor: major equal, runtime minor ≥ the floor's minor, at every version.** Not the schema
macro's shape (that is an equality, and comparing the minor "only while major is 0" on a floor
would ignore it from 1.0 on). A newer runtime minor passes; an older one, or any other major, is
refused. Patch is not compared.

**The floor is the runtime version in the tree the CLI was built from** — never the CLI's own
`package.json` version (CLI 0.10.0 vs runtime 0.6.0 today; they are independent).

**A runtime older than the macro.** The emitted guard is preceded by:

```cpp
#ifndef U8G2GL_REQUIRE_RUNTIME_VERSION
#error "<names the required floor, e.g. 'requires u8g2gl runtime 0.7 or newer'; says the runtime in use predates the runtime version check; says what to do>"
#endif
U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);
```

Exact wording is yours; it must name the floor and the remedy (update the runtime library, or
regenerate with a CLI matching the runtime), in the same voice as the schema refusal.

## Line-Item Instructions

- [ ] **Measure the baseline first**, from a clean configure, each suite alone: C++ build + ctest
      (expect **395 / one skip**, `SizeOfReport.ThirtyTwoBitTarget`, **0** warnings under
      `-Wall -Wextra -Wpedantic`); in `cli/`: `npm ci`, vitest (expect **1319**), `tsc`, lint.
      Record exact counts.
- [ ] **Runtime: `include/u8g2gl/u8g2gl_version.h`.** Add `U8G2GL_REQUIRE_RUNTIME_VERSION(major,
      minor)` beside the schema macro, with Doxygen in the same depth: what it guards, why it is
      a floor and not an equality (§16), and that both versions appear in the message. The
      `static_assert` message names **the floor the code was generated for and this runtime's
      version**. Update the file header (Exported Macros) and the schema macro's paragraph that
      says "Schema version rather than generator or runtime version" so the header no longer
      implies the runtime is never checked.
- [ ] **Runtime version → 0.7.0**: `U8G2GL_VERSION_MINOR 7` in the header **and**
      `project(... VERSION 0.7.0)` in `CMakeLists.txt` (configure refuses a mismatch).
- [ ] **CTests, failing-first where possible** (sources under `test/version_guard/`, wired like
      the existing four, added to the `RESOURCE_LOCK` list):
      - `VersionGuard.RuntimeFloorMatchCompiles` — floor = this runtime's major.minor;
      - `VersionGuard.NewerRuntimeMinorCompiles` — floor one minor below this runtime;
      - `VersionGuard.OlderRuntimeFailsToCompile` — floor one minor **above** this runtime;
        `PASS_REGULAR_EXPRESSION` matches the message naming both versions. **This is the test the
        bridge asked for: an older runtime is refused by name**;
      - `VersionGuard.MismatchedRuntimeMajorFailsToCompile` — floor major + 1;
      - `VersionGuard.PreMacroRuntimeFailsByName` — the emitted guard compiled against a
        **frozen copy of the 0.6.0 header** (e.g. `test/version_guard/pre_macro/u8g2gl/u8g2gl_version.h`,
        copied from `main` @ `783e189`, with a file header saying why it is frozen). Match the
        `#error` text naming the floor. **Prefer compiling the committed
        `test/generated_fixture/generated/u8g2gl_generated_config.h` itself** with the frozen
        header first on the include path, so the test exercises emitted text rather than a hand
        copy of it; if include order or the header's other contents make that impractical, use a
        hand-written TU and say why in the report.
      Write the floor in the "older" and "major" cases the way `mismatch.cpp` does (an expression
      from the runtime's own macros), so they do not need editing at every bump.
- [ ] **Stamp, CLI side.** A `build:runtime-version` npm script (`cli/src/node/build-runtime-version.ts`)
      reads the header's `U8G2GL_VERSION_MAJOR/_MINOR/_PATCH` and writes committed data under
      `cli/src/data/` (JSON + a small typed `.ts` accessor, as `manifests` does). Fail loudly if a
      macro is missing, as CMake does. Commit the generated data.
- [ ] **Drift test — must not be squeezed.** Beside `manifest-bundle.test.ts`'s shape: read the
      header from `../../../include/u8g2gl/u8g2gl_version.h`, compare to the committed stamp,
      fail with a message that says to run `npm run build:runtime-version`; and prove it is not
      vacuous by feeding a doctored header text (e.g. minor + 1) and asserting it reports drift.
      **Show it failing**: before running the build script after the 0.7.0 bump, the drift test
      must fail against the stale 0.6.0 stamp — record that run in the report.
- [ ] **Emitter.** In `generated-config.ts`'s `Version guard (§16)` section, after the schema
      guard: the `#ifndef`/`#error` block, then `U8G2GL_REQUIRE_RUNTIME_VERSION(<major>, <minor>);`
      from the stamp, with a short emitted comment (§16: a floor; newer runtime is fine). Update
      the module header's Description (it says the module emits capacities and the schema guard).
      Core reads the stamp from `cli/src/data/` the way it reads manifests — the floor is not a
      CLI option and not the generator version.
- [ ] **Emitter tests**: the emitted floor equals the stamp; the `#ifndef` precedes the macro
      call; the schema guard is unchanged.
- [ ] **CLI version → 0.11.0** in `cli/package.json` (and lockfile). Emitted output changes with
      no input change (§13.9, rules/03).
- [ ] **Goldens**: refresh with `refresh-goldens.mjs`. The **only** golden diff must be the new
      guard lines (and nothing else in any file). Paste the diff stat and one file's hunk.
- [ ] **Spec and rules — Chief Architect text, verbatim, from `../PROJECT.md` R1:**
      - `docs/design_spec.md` §16: insert the R1 text ("The two requirements compare
        differently…" through "…reports a refusal rather than a syntax error.") **immediately after
        the requirements table**. Keep the paragraphs "The runtime floor is the runtime version
        the generator was built beside…" and "This needs no discipline…" and "*Why the runtime
        check is needed…*" — they explain the stamp, which the new text does not. **Delete** from
        the paragraph *before* the table the two sentences beginning "Generated code carries
        **two** version requirements, and both are compared on the major version…" through
        "…without any error." **only the comparison part** — keep "Generated code carries **two**
        version requirements." as a lead-in to the table. Nothing else in §16 changes.
      - `.agents/rules/03-versioning.md`: in "The compatibility rule" table add a `Comparison`
        column; runtime row as R1 gives it; schema row `Equality: major, and minor while the major
        is 0`. Replace the paragraph "Both compare the major version, and **also the minor while
        the major is 0**…" with R1's two-sentence text. Nothing else in the file changes.
      Paste the final §16 and rules/03 diffs in the report.
- [ ] **End to end with the built CLI**: `npm run build`, `node cli/dist/node/cli.js --version`
      reports 0.11.0; generate a small project into `tmp/` and show the emitted guard block; then
      compile that generated config header (a) against this runtime — compiles, (b) against the
      frozen 0.6.0 header — `#error` naming 0.7. Paste both compiler outputs (trimmed).

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_version.h`; `CMakeLists.txt` (version only);
`test/CMakeLists.txt` (VersionGuard tests only); `test/version_guard/**`; `test/test_version.cpp`
(only if a comment now misstates what is checked); `cli/src/node/build-runtime-version.ts` (new);
`cli/src/data/` (the new stamp files only); `cli/src/core/generator/emit/generated-config.ts`;
`cli/test/**` (new tests; goldens via the refresh script); `cli/package.json`,
`cli/package-lock.json`; `test/generated_fixture/generated/**` (via the refresh script only);
`docs/design_spec.md` §16 only; `.agents/rules/03-versioning.md` compatibility section only; this
WORKORDER.

**Do NOT touch:** the schema version or `U8G2GL_REQUIRE_SCHEMA_VERSION`'s behaviour; the manifest
registry, validators, `schema/diagnostic.ts` (WO2/WO3); `include/u8g2gl/manifests/**`; any other
runtime source; `docs/` outside §16; `PROGRAM*.md`; `PROJECT.md`; `MEMORY.md`.

---

## Verification Requirement

- [ ] C++ from a **clean configure**, each suite alone: build with **0** warnings; ctest **395 + the
      new VersionGuard tests**, one skip. State the new total.
- [ ] CLI: vitest **≥ 1319** plus your new tests, `tsc`, lint clean. State the total.
- [ ] Drift test shown failing against a stale stamp, then passing.
- [ ] `VersionGuard.OlderRuntimeFailsToCompile` and `VersionGuard.PreMacroRuntimeFailsByName` each
      shown to pass **because of the message**, not merely because the build failed (paste the
      matched line).
- [ ] Golden diff is the guard lines only.
- [ ] `git diff --name-only 783e189..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled by later WOs, do not re-report: a class may `extends` a drawing element; a `<bind>` may
alias an inherited non-geometry setter.

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
- non-obvious choices and rationale (message wording, stamp file format, how the pre-macro test
  compiles emitted text)

### Evidence
- drift test failing then passing; matched CTest lines; golden diff stat; built-CLI output;
  §16 and rules/03 diffs

### Dead Ends & Warnings

### Out-of-Scope Findings

### Blockers
(none)
```
