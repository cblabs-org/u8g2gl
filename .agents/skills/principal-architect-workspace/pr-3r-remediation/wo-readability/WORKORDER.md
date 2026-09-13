---
name: pr-3r-remediation-wo-readability
description: Remediate the small set of readability/documentation defects found in the PR-3R (WO1-WO8) stack diff
complexity: mechanical
---

# WO — Readability & Documentation Remediation

**Scope reviewed:** `git diff main..HEAD` on branch `u8g2gl-remediation/wo8-schema-04`
(the whole PR-3R remediation stack, WO1 through WO8) — both the C++ runtime
(`include/`, `src/`, `test/`) and the TypeScript CLI (`cli/src/`, `cli/test/`).
**Reviewed:** 2026-09-13
**Standards:** `u8g2gl-standards` skill (`documentation.md`, `cpp.md`, `typescript.md`)

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch, and do not plan. Execute the checklist below.

## Objective

**This stack is documented to a noticeably higher standard than the skill requires
as a floor**, and the checklist below is short as a result. Every touched C++ file
carries a compliant header, complete Doxygen with lifetimes and failure modes,
`// --- Step N ---` breakdowns on every multi-stage function, and why-comments on
every non-obvious decision — often citing the exact decision record ([D-18],
[D-19], [D-20], [D-21]) and even the specific line of `design_spec.md`. The
TypeScript side matches it. Remediation here is mechanical touch-up of two stale
comments and a naming inconsistency, not a substantive documentation pass.

One item is flagged as an **Observation** rather than a checklist line: a
behavioural gap between what WO8's new schema-0.4 refusal message claims and
what the parser still accepts. That is a correctness question for the architect
to triage, not a documentation fix a worker should make unilaterally.

## Strict Boundary Box

**Do NOT touch:**
- Any behaviour. This is documentation and comment-text only — no logic changes.
- `cli/src/core/parser/parse-widget-tree.ts` beyond the header comment named
  below — do not touch its parsing logic.
- The `<component>`/`components/` acceptance behaviour flagged under
  Observations — that is the architect's call, not this worker's.

**Do NOT:** create branches, open PRs, rebase, or merge.

If a fix appears to require a behavioural change, stop and surface it rather than
making it.

## Tooling Constraints

- C++: `cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON && cmake --build build && ctest --test-dir build` — zero warnings under `-Wall -Wextra -Wpedantic`, all tests pass.
- CLI: `cd cli && npx tsc --noEmit && npm run lint && npx vitest run` — zero errors, all tests pass.
- Comment-only changes must not alter any `.ts`/`.cpp`/`.h` file's compiled output.

## Line-Item Instructions

### P2 — Stale documentation describing removed architecture
- [ ] `cli/src/core/parser/parse-widget-tree.ts:12` — the file header's
  `Description:` still reads "Recognises Tier 1 primitives (§6.1), Tier 2
  built-in widgets (§6.2), Tier 4 custom widgets (§6.4), and potential Tier 3
  component instances (§6.3)." [D-18] (recorded 2026-09-11/12, and the premise
  of this entire remediation stack) collapsed the tier model to one element
  vocabulary; this file was not touched by WO1-WO8 and is the one place in the
  parser still describing the pre-[D-18] four-tier system as current. A reader
  of this file taken alone will re-derive the wrong mental model. **Fix:**
  rewrite the `Description:` to describe what the function actually recognises
  today — plain widget/composite elements, layout coordinates, `style_*`
  overrides, `bind_*` binding slots, condition directives and event handlers —
  without reference to tiers, and add a one-line note that [D-18] removed the
  authoring-tier distinction this file predates.

### P3 — Consistency
- [ ] `include/u8g2gl/u8g2gl_label.h` struct comment (added by WO2, near the
  member list) — verify the largest-alignment-first ordering claim against an
  actual `sizeof`/offset measurement rather than accepting the comment's
  arithmetic on trust, per the review procedure's "measure, never reason about
  size" rule. The comment's own math is very likely correct (it matches the
  `u8g2gl_scrolling_label.h` layout it was copied from, which was presumably
  checked when written), but this workorder did not re-run
  `test_sizeof_report.cpp` to confirm the merged class's actual layout — do
  that and record the printed figure in the commit message; no comment change
  is needed unless the measured layout disagrees with what's documented.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings
- [ ] `ctest --test-dir build` — all pass, `SizeOfReport.AllWidgets` still holds
      (it directly exercises the struct in the P3 item above)
- [ ] `cd cli && npx tsc --noEmit && npm run lint && npx vitest run` — all pass
- [ ] No behavioural change: `git diff` against this workorder's start point
      touches only comment text inside `parse-widget-tree.ts`'s header block

## Issue Surfacing

If you find a defect outside this checklist, surface it in your Completion Report
— do not fix it and do not file an issue.

## Review Notes

**Summary.** This is, by a wide margin, the best-documented diff this reviewer
has audited against these standards. Every touched C++ header and implementation
file carries: a compliant file header with SPDX and a `Purpose:` that answers
*why* the module exists rather than restating its name; complete Doxygen on
every public declaration, including lifetimes, failure modes and cross-
references to the specific decision record that motivates a non-obvious choice;
`// --- Step N: <purpose> ---` breakdowns on every function with distinct
stages; and why-comments that consistently go further than the standard's own
worked examples — e.g. `u8g2gl_obj.cpp`'s `apply_style`/style-setter change
guards explain not just *that* they check `style_.has(PROP)` in addition to the
value, but the exact second bug (a button/label render-path regression) that a
value-only guard would have reintroduced. The TypeScript side matches this:
`validate-schema.ts`'s new migration table and `countScreenObjects` both carry
why-comments that would let a reviewer unfamiliar with [D-18]/[D-21] follow the
reasoning without opening the design spec.

No P1 findings. No heap allocation, no stored `std::function`, no `std::string`/
Arduino `String` outside host tests, and no untyped enum was introduced by this
diff — `u8g2gl_long_mode_t : uint8_t` follows the house pattern exactly. No
`node:` import was introduced into `cli/src/core/`. Naming is correct for both
languages throughout — C++ additions follow `lowercase_snake`/trailing-underscore/
`U8G2GL_` conventions, TypeScript additions follow camelCase/PascalCase
correctly, and no one confused the two schemes.

**Checked and clean, worth naming so a worker pattern-matches against it:**
`u8g2gl_draw.h`/`.cpp` (the new [D-18] free-function layer) is the single best
file header in the diff — it pre-empts the exact "tidy these into a class"
regression a future contributor is likely to attempt, cites [D-18] and
design_spec §6, and every function has both a `.h` Doxygen contract and a `.cpp`
banner exactly as `documentation.md` §2 specifies. `test_sizeof_report.cpp`'s new
`u8g2gl_binding_desc_mirror` is a good example of the standard's "report sizes"
rule applied under a real constraint (the real struct has internal linkage) —
it documents its own staleness risk rather than silently becoming wrong.

**Severity counts:** P1 0 · P2 1 · P3 1 · P4 0

**Files reviewed (diff scope):** all 89 files touched by `main..HEAD`, with full
reads of `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp`,
`include/u8g2gl/u8g2gl_draw.h`, `src/u8g2gl_draw.cpp`,
`include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp`,
`include/u8g2gl/u8g2gl_style.h`, `src/u8g2gl_style.cpp`,
`include/u8g2gl/u8g2gl_config.h`, `include/u8g2gl/u8g2gl_types.h`,
`test/test_sizeof_report.cpp`, and the deleted `u8g2gl_scrolling_label.{h,cpp}`;
diff-level review of every changed file under `cli/src/core/` (parser, schema,
validator) and `cli/src/node/cli.ts`; header/first-15-lines spot check across
all touched TS files for SPDX and `Purpose:` presence.

**Observations (standards-silent, for architect triage, not a defect under this
skill):**

WO8's new §15.4 refusal message (`cli/src/core/validator/validate-schema.ts`,
`SCHEMA_0_3_MIGRATIONS`) tells a `schema="0.3"` author that `'<component>' is
removed: use '<widget>' with a '<view>'` and that `'the 'components/' directory
is removed`. Checked against the actual parser: `cli/src/node/read-project.ts`
(untouched by this diff) still globs `components/*/[name].xml` unconditionally,
`cli/src/core/parser/parse-component.ts` still parses a `<component>` root tag
with no deprecation diagnostic, and `validate-schema.ts`'s own "Component schema
validation" pass (§4) still validates `<component>` content as legitimate
regardless of the declared schema version. A project declaring `schema="0.4"`
with a `<component>` file present today validates cleanly — the exact thing the
refusal message tells a `0.3` author has been removed. This may be entirely
correct under WO8's own scope: its WORKORDER.md explicitly limits WO8 to the
refusal-path *message* and forbids touching anything WO1-WO7 own or building
migration tooling, and no work order in this stack claims ownership of actually
deleting `<component>`/`components/` support from the parser. But the migration
message is, right now, describing a removal that has not happened, which is the
kind of thing `documentation.md`'s "stale docs outrank missing docs" principle
would flag if it applied to a diagnostic string as it does to a comment — the
skill doesn't say diagnostics are documentation, so this is reported here as an
observation rather than a finding, but the architect should decide whether a
PR-04 (or WO9) item is needed to either enforce the removal or soften the
message to "deprecated" until it is.
