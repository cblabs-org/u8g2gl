---
name: pr-4r3-wo4-readability-review
description: Readability and documentation findings on 783e189..HEAD (u8g2gl-4r3/wo4-readability)
complexity: standard   # items 1 and 2 change emitted text and need golden and test updates
---

# REVIEW — PR-4R3 WO4 readability

**Scope:** `git diff 783e189..HEAD`, excluding the principal-architect workspace. Changed lines only.
**Reviewed:** 2026-10-06. **Standards:** `u8g2gl-standards`, `documentation.md` incl. §4.1.
**Method:** read-only. Nothing was built, so the clang behaviour in known item 1 is taken from the brief, not reproduced.

**Severity counts:** P1 0 · P2 0 · P3 5 · P4 4

No P1 or P2. Every new file has a header with SPDX and a truthful `File:` path. The new tests have a `Purpose:` that passes the "could a stranger say why this exists" test. The frozen `pre_macro` header says why it must never move. The spec §6.5, §13.1 and §16 and rules/03 text landed intact and in place. No stale reference to `GEOMETRY_BINDING_ALIAS` or `geometryAliasDiagnostic` remains outside the workspace.

## Line items

### P3 — Known items needing a fix
- [ ] **Item 1 — `cli/src/core/generator/emit/generated-config.ts:~190-194`** (emits `#ifndef` / `#error` / `#endif` then the macro call). Clang carries on past `#error` and adds a spurious "a type specifier is required" on the macro line, which buries the real refusal. **Fix:** agree with moving the call into an `#else`: `#ifndef U8G2GL_REQUIRE_RUNTIME_VERSION` / `#error ...` / `#else` / `U8G2GL_REQUIRE_RUNTIME_VERSION(M, m);` / `#endif`. Knock-ons:
  - Regenerate both goldens: `cli/test/generator/fixtures/emit-project/expected/u8g2gl_generated_config.h` and `test/generated_fixture/generated/u8g2gl_generated_config.h`.
  - `cli/test/generator/emit-golden.test.ts` ("precedes the macro call with an #ifndef...") asserts `indexOf(call) > endif`. Rewrite it to assert the call sits between `#else` and `#endif`, or the test fails.
  - The emitted comment ("so say what is needed here") is still true; keep it.
  - `include/u8g2gl/u8g2gl_version.h` macro Doxygen says generated code "precedes the call with `#ifndef`". Reword to "guards the call with `#ifndef ... #error ... #else`".
  - `test/version_guard/pre_macro/include_generated_config.cpp` and the CMake `PASS_REGULAR_EXPRESSION` still match, since the `#error` text is unchanged. Confirm the pre-macro case now emits only the named refusal.
  - Raise with the architect: the generated output changes without an input change. If 0.11.0 is unreleased, no further bump is needed. If it has shipped, §13.9 requires 0.11.1.
  - §16 says the guard is "preceded by an `#ifndef`". That is Chief wording and out of scope for me to judge, but the `#else` form is not literally "preceded by". Note it for the architect only.
- [ ] **Item 2 — `include/u8g2gl/u8g2gl_version.h` macro `static_assert` message (~lines 129-137).** "generated for runtime M.m or newer" is false for a newer major, which is refused. The `@brief` ("older than the one the code needs") has the same gap, and `runtime_major.cpp` stands in for exactly that case. **Fix:** word it as "generated for runtime M.m or a later minor of M, but this runtime is X.Y.Z". Reword the `@brief` to "Refuse to compile unless the runtime has the major and at least the minor the code was generated for". Update the `PASS_REGULAR_EXPRESSION` in `test/CMakeLists.txt` for `VersionGuard.OlderRuntimeFailsToCompile` and `VersionGuard.MismatchedRuntimeMajorFailsToCompile`, which both hard-code "or newer". The `#error` text emitted into generated headers ("0.7 or newer") is for a pre-macro runtime and can stay.
- [ ] **Item 3 — `cli/src/core/validator/validate-schema.ts` `bindingAliasDiagnostic`, the `consequence`/message construction (~lines 462-473).** The message ends "...(§8.4, [D-20]) (§13.1)." and the non-geometry branch ends "([UD-5]) (§13.1)". Two adjacent parentheticals read as noise. **Fix:** cite §13.1 once, where the rule is stated. Either `Write ${names} (§13.1): ${consequence}.` and keep the consequence's own citation, or merge to `(§13.1, §8.4, [D-20])`. Check that `bind-type-paths.test.ts` does not assert the old tail; it matches on `bind_x`, `bind_text` and the code, so it is unaffected.
- [ ] **Item 4 — same function, Step 3 call at `validate-schema.ts:~426`.** A drawing element's own geometry prop reuses "reaches a setter that is bound under another name". Nothing is inherited there, so the sentence is wrong for that path. **Fix:** let the helper take the origin of the name. For the Step 3 path say "binds its own prop '<setter>' under another name" (or "...geometry prop '<setter>'..."). Keep the inherited wording for Step 2. Two short phrases chosen by a parameter are enough; do not fork the diagnostic code. The `DIAGNOSTIC_CODES.BINDING_ALIAS` doc already says drawing manifests are covered, so it needs no change.

### P3 — Standards findings
- [ ] **`cli/src/core/generator/emit/generated-config.ts:21`** — the rewrapped Description line carries "The figures come from WO8b's `Capacities`". It is a work-order tag on a changed line (§4.1). **Fix:** replace "WO8b's `Capacities`" with "the `Capacities` counted in `src/core/realise/capacities.ts`" (a path in the source tree, not the workspace). Leave the untouched `WO8b`/`WO8c` mentions at lines 23, 39 and 109 alone; they are pre-existing.
- [ ] **`cli/src/data/runtime-version.ts:21`** — exported `RUNTIME_VERSION` has no TSDoc. It is a public declaration, and the thing a reader most wants to know is that it is the runtime's version and not the CLI's. **Fix:** add `/** @brief ... */` stating it is stamped from the header, is the floor the generator emits, and is not `package.json`'s version. This is TSDoc, not a repeat of the file header.
- [ ] **`cli/src/core/manifest/manifest-registry.ts:~388`** — the why-comment starts "M keeps the parent's props deliberately". `M` is not a name in scope (the variables are `manifest` and `parent`). This misleads. **Fix:** "The result keeps the parent's props deliberately: ...".

### P4 — Optional, only if the architect approves
- [ ] `validate-schema.ts:~361-367` — the `checkBindDeclarations` banner now wraps raggedly ("...[D-20] name). Pass 5" then "checks a subject..."). Reflow the whole banner.
- [ ] `include/u8g2gl/u8g2gl_version.h` macro Doxygen `@code` example hard-codes `(0, 7)`. It is only illustrative and goes stale at the next bump; `(0, 7)` could become `(MAJOR, MINOR)` in the prose. Not required.
- [ ] `cli/src/data/runtime-version.ts:21` re-spells `{major, minor, patch}` rather than reusing `RuntimeVersion` from `src/node/runtime-version-header.ts`. Reusing it would point `data/` at `node/`, so the duplication may be deliberate. Leave unless the architect wants a type moved into `core/`.
- [ ] `cli/test/validator/bind-type-paths.test.ts` — new `custom`/`drawing`/`instance` helpers have 130+ column lines. Mechanical wrap only.

## Verification
- [ ] Rebuild and regenerate goldens; `git diff` shows only the `#else` change in both golden headers.
- [ ] `ctest` VersionGuard.* all pass; the OlderRuntime and MismatchedRuntimeMajor cases still match the new message.
- [ ] CLI test suite passes, none weakened.
- [ ] No behavioural change other than the two emitted/asserted strings; diff is otherwise comments and TSDoc.

## Observations
- §4.1 half 2 applied: pre-existing `WO8b`/`WO8c`/`[Q-9]`/"Chief Architect ruling on WO1 F3" on untouched lines were not raised.
- The standards do not say how a refusal message should treat a newer major; items 2 and 4 are judged on accuracy, not on a rule.
