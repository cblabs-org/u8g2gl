---
name: pr-04-generator-wo-readability
description: Remediate readability and documentation defects found in PR-04's full diff (main..HEAD, ff20f0c..d9e21e0)
complexity: mechanical
work_order: WO13 (proposed)
project: pr-04-generator
branch: u8g2gl-generator/wo13-readability
base: u8g2gl-generator/wo12-budget-determinism
status: dispatched — approved by the owner 2026-09-28
---

## Authorization

Part of PR-04 (`pr-04-generator`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's PR-04 approval with a timestamp, and "Owner rulings and approval — 2026-09-28"
quotes the owner's approval of **WO13** verbatim. This WORKORDER's `status` must be `dispatched`.
Otherwise stop and report.

**Branch:** `u8g2gl-generator/wo13-readability`, base `u8g2gl-generator/wo12-budget-determinism`.
Run `git branch --show-current` as its own command immediately before every commit. Commit on a
green build without asking. Do not push and do not tag.

**Not in this work order, by the PA's decision:** the 522 U8G2 fonts whose names contain capitals.
The owner has ruled that all fonts must be usable, but §13.4's lowercase rule is what forbids them,
so the Chief Architect's amendment comes first. Do not touch font-name validation.

## PA triage, 2026-09-28

The PA spot-checked this report rather than accepting it. **Confirmed:** the mis-cased stub
(`test/stubs/U8G2lib.h` against the real `cppsrc/U8g2lib.h`, which is why every runtime header
carries a four-branch `__has_include` chain); `u8g2gl_xbm.xml`'s redundant `bitmap_mode`; both
duplicate inline comparators (`emit/unit.ts:101`, `write-generated.ts:126`), which do contradict
`a93f5f9`'s "one code-unit comparator everywhere"; and the "Its C++ identifier (§13.4)" comment in
`realise/model.ts`, now wrong because the emitted name carries the `ui_obj_` prefix.

**One finding is wrong as stated.** `cli/test/schema/types.test.ts:97` — the PA counted the object's
entries: it lists **23**, which matches the title, so "update the count to 24" would make it wrong.
The real defect is the word *all*: `DiagnosticCode` now has far more codes than these 23, several
added in WO11b and WO12. Retitle it as the subset it is, or assert the full set from the type.

**The layering Observation is for the Chief Architect, not this work order.** It goes in the next
bridge with WO11b f8. Do not restructure `validator/` ↔ `generator/` here.

# WO — Readability & Documentation Remediation (PR-04, WO1–WO12)

**Scope reviewed:** `u8g2gl-generator/wo12-budget-determinism` — full diff
`ff20f0c..d9e21e0` (twenty work orders: the TypeScript generator/validator/resolver
stack, plus supporting runtime C++ changes and test fixtures).
**Reviewed:** 2026-09-28
**Standards:** `u8g2gl-standards` skill (`documentation.md`, `cpp.md`, `typescript.md`)

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch, and do not plan. Execute the checklist below.

## Objective

Bring PR-04's documentation and a handful of naming/duplication defects into line
with house standards before the branch merges. The codebase's documentation
discipline is, on the whole, **very good** — file headers are present and
substantive across every new TypeScript and C++ file touched by this stack, enum
base types are all explicit, there is no heap allocation or stored
`std::function`, and `mark_dirty()` guarding is applied correctly and
consistently in the widget setters reviewed. The defects below are real but
narrow: a small cluster of **stale comments** left behind by renames (the
dominant risk this size of stack always carries), one genuinely mis-cased file,
one redundant XML declaration, two comparator duplications the codebase's own
commit message claims were eliminated, and a layering question for the architect
to rule on rather than the worker to resolve.

## Strict Boundary Box

**Do NOT touch:**
- Any behaviour. This is documentation, comments, and a small number of
  no-behaviour-change deduplications (P2 items below) — no logic changes beyond
  what each item explicitly describes.
- Generated fixtures under `test/generated_fixture/` — regenerate them via the
  CLI if a P2 fix changes emitted output; do not hand-edit committed generated
  files.
- The schema, the manifest vocabulary, or anything that would change a
  `.golden` comparison's bytes for a reason other than the two named comparator
  fixes.

**Do NOT:** create branches, open PRs, rebase, or merge.

If a fix appears to require a behavioural change, stop and surface it rather than
making it.

## Tooling Constraints

- `cd cli && npm test` — all Vitest suites pass, no test weakened to pass.
- `cd cli && npm run build` (or equivalent typecheck) — zero TypeScript errors.
- `cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON && cmake --build build && ctest --test-dir build` —
  zero warnings under `-Wall -Wextra -Wpedantic`, all tests pass.
- Golden-file tests (`cli/test/generator/emit-golden.test.ts` and friends) must
  still report the fixture regenerating **unchanged** unless an item explicitly
  says otherwise (P2-3 and P2-4 do not change emitted bytes; P2-1's rename of a
  redundant XML declaration should also leave generated output unchanged since
  the inherited property already produces identical behaviour — confirm this
  with a regenerate-and-diff before considering the item done).

## Line-Item Instructions

### P1 — Correctness or cost

None found. No heap allocation, no stored `std::function`, no untyped enums, and
no `mark_dirty()` omissions were found in the C++ surface this stack touches.

### P2 — Convention violation with consequence

- [ ] **`test/stubs/U8G2lib.h` is mis-cased.** The real U8G2 header is
  `U8g2lib.h` (lowercase `g`), confirmed against every reference to it elsewhere
  in this stack (e.g. `CMakeLists.txt:80`, `include/u8g2gl/u8g2gl_state_saver.h:70`).
  The stub's actual filename is `U8G2lib.h` (capital `G2`). This is not merely
  cosmetic: it is why every runtime header that includes U8G2 now carries a
  four-way `__has_include` fallback chain trying both cases and both include
  styles (see `include/u8g2gl/u8g2gl_coord.h:47-54`,
  `include/u8g2gl/u8g2gl_helpers.h:28-35`, `include/u8g2gl/u8g2gl_state_saver.h:41-48`,
  and others) — a case-sensitive filesystem (any Linux CI runner) would silently
  select a different branch than a case-insensitive one (macOS default) depending
  on the exact spelling used, which is fragile even though it currently resolves
  correctly. **Fix:** rename `test/stubs/U8G2lib.h` to `test/stubs/U8g2lib.h`,
  update `test/CMakeLists.txt:365`'s reference and any other reference to the old
  name, and confirm the `__has_include` fallback chains can be trusted to still
  find it (they can remain as a portability belt-and-braces, but the "single
  authoritative stub" should not itself be misspelled against what it stands in
  for).

- [ ] **`include/u8g2gl/manifests/u8g2gl_xbm.xml` redeclares `bitmap_mode`**,
  which its base class already declares identically. `u8g2gl_xbm.xml` extends
  `u8g2gl_obj` (line 2), and `u8g2gl_obj.xml:18` already declares
  `<prop name="bitmap_mode" type="enum" setter="set_bitmap_mode" values="solid,transparent" default="solid" emit="U8G2GL_BITMAP_MODE_{VALUE^^}" .../>`
  word-for-word except for the `help` text. `u8g2gl_xbm.xml`'s copy
  (lines 5-8) is dead duplication: the property is inherited and this
  redeclaration cannot add anything a subclass override couldn't express more
  narrowly, and D-17 treats the manifest as the single source of an element's
  properties. **Fix:** remove the redundant `<prop name="bitmap_mode" .../>`
  from `u8g2gl_xbm.xml`, keeping only `src`. Regenerate the golden fixtures and
  confirm no byte changes (the property was already being inherited, so this
  should not affect emitted code — if it does, that is a separate defect to
  surface rather than fix here).

- [ ] **Two inline code-unit comparators duplicate `compareCodeUnits`**, despite
  commit `a93f5f9` ("report,order: report the framebuffer; one code-unit
  comparator everywhere") claiming exactly this consolidation was done —
  it missed these two:
  - `cli/src/core/generator/emit/unit.ts:101` — `includeBlock()`:
    `[...new Set(includes)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))`
  - `cli/src/node/write-generated.ts:126` — `listFiles()`:
    `found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))`

  `cli/src/core/order.ts`'s own header explicitly exists because "this
  repository has now paid four times for one rule spelled in several places,"
  and lists exactly this class of bug. **Fix:** import `compareCodeUnits` from
  `../../order.js` (or the correct relative path from each file) and replace
  both inline comparators with it. `write-generated.ts` is in `src/node/`, so
  the isomorphic-import constraint does not block this. Re-run the determinism
  and golden-file suites; output should be unchanged since both files already
  sort ASCII filenames where code-unit and the ad-hoc comparator agree — this
  item removes latent risk, not a live bug.

### P3 — Consistency and stale documentation

**These are the priority category for this review — they actively mislead,
not merely omit.**

- [ ] **`cli/src/core/generator/realise/model.ts:183` and `:197`** (and the
  identical claim at `cli/src/core/resolver/expand.ts:128`) call `identifier`
  "its C++ identifier" / "the C++ identifier (§13.4)". It is not: it is the
  pre-emission name (author's `name`, mangled/prefixed by enclosing composite
  instances). The actual emitted C++ variable name adds the `ui_obj_` prefix,
  applied by `objectIdentifier()` and documented at
  `cli/src/core/generator/emit/screen.ts:128-129` ("An element's C++ object,
  `ui_obj_<name>` (§13.4)"). A reader trusting the `model.ts`/`expand.ts` comment
  would grep generated code for the wrong string. **Fix:** reword both to
  something like "The element's mangled name (§13.4): `name`, prefixed by each
  enclosing instance — the C++ object identifier is this value prefixed with
  `ui_obj_` (see `emit/screen.ts`'s `objectIdentifier()`)."

- [ ] **The generated config's "busiest object" comment names the author's
  identifier, not the emitted C++ variable.** `cli/src/core/generator/realise/capacities.ts:171`
  sets `busiestObject = element.identifier` (the same un-prefixed value above),
  and `cli/src/core/generator/emit/generated-config.ts:116-118` emits it verbatim
  into the generated header's comment: confirmed in
  `test/generated_fixture/generated/u8g2gl_generated_config.h:47`, which reads
  `// The busiest object is 'track_readout'.` — but the actual C++ variable a
  user would find in `ui_screen_*.cpp` is `ui_obj_track_readout`. A reader
  grepping the generated `.cpp` for `track_readout` alone (as the comment
  implies they can) will not find the declaration. **Fix:** either emit
  `ui_obj_<identifier>` in the comment (call the same `objectIdentifier()` helper
  `emit/screen.ts` uses), or reword the comment to make clear `identifier` names
  the XML element, not the C++ variable. Regenerate the fixture and update the
  golden comparison.

- [ ] **`cli/src/core/parser/parse-widget-tree.ts:378-379`** describes `wd_` as
  one of the "framework and custom widget prefixes" being stripped, alongside
  `u8g2gl_` and `ui_`, implying it is a reserved/framework prefix. It is not:
  `cli/src/core/resolver/mangle.ts:77-81` records the Chief Architect's explicit
  2026-09-16 ruling that **`wd_` is deliberately absent** from
  `RESERVED_IDENTIFIER_PREFIXES` — it is an author-chosen convention for widget
  class names (`wd_service_list`) and *is* the class name by [D-12], not a
  prefix the framework strips. Stripping it when synthesising an auto-generated
  child name may still be the right behaviour (an unnamed child of
  `<wd_service_list>` probably shouldn't auto-name itself
  `wd_service_list_0`), but the comment mischaracterises *why*, and a reader who
  goes looking for `wd_` in the reserved-prefix list (having just read this
  comment) will not find it and may "fix" the mismatch by adding it back —
  exactly the regression `mangle.ts`'s comment says already happened once.
  **Fix:** reword to something like "Strip `u8g2gl_` and `ui_` (§13.4's reserved
  prefixes) and, separately, `wd_` — not because it is reserved (it deliberately
  is not, see `resolver/mangle.ts`), but because a `wd_`-named widget's own tag
  already reads as the identifier stem without repeating it."

- [ ] **Stale test titles / headers** (four items, each a one-line or one-block
  fix, group as one pass):
  - `cli/test/schema/types.test.ts:97` — title reads `'contains all 23 required
    diagnostic codes with correct U8G2GL prefixes'`, but the `expectedCodes`
    object below it (lines 98-121) lists **24** entries. **Fix:** update the
    count in the title to 24, or add whichever code the author intended and the
    title already anticipated — check which was meant before just renumbering.
  - `cli/test/validator/geometry.test.ts:7`'s file-header `Description:` reads
    "checks out-of-bounds positioning against target display catalogue
    resolutions" as if every element is checked against the display. Per
    [D-20] (implemented in this same file, e.g. the `'catches an element
    overflowing its composite parent container...'` and `'checks a
    screen-nested element against its immediate parent container, not the
    display'` tests at lines 221 and 282), geometry is checked against the
    **immediate containing element**, which is the display only for
    screen-level elements. **Fix:** reword the `Description:` to state the
    containing-element rule, matching the `[D-20]` comment already present at
    line ~214-217 in the same file.
  - `cli/test/test_obj.cpp` (native side, but flagging here since it's the
    worst offender of this class) — header reads only `Description:
    Implementation of test_obj.cpp` with no `Purpose:` field at all. This is
    exactly documentation.md §1's named anti-pattern: a description that
    restates the filename and says nothing. **Fix:** write a real `Purpose:`
    describing what `u8g2gl_obj`'s test suite actually verifies (geometry,
    flags, parent-index hierarchy, style application, binding lifecycle — scan
    the file's `TEST(...)` names for the list), following the pattern every
    other `test_*.cpp` file touched by this stack already uses (see
    `test/test_button.cpp`, `test/test_clock.cpp`, etc. for the house style).

## Verification Requirement

- [ ] `cd cli && npm test` — all suites pass, none weakened.
- [ ] `cd cli && npm run typecheck` (or `tsc --noEmit`) — zero errors.
- [ ] Golden/determinism suites (`emit-golden.test.ts`, `determinism.test.ts`)
      still report the fixture regenerating **unchanged**, except where a P2
      item's comment says otherwise (none currently do; confirm this holds
      after the `bitmap_mode` removal and both comparator swaps).
- [ ] `cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON && cmake --build build && ctest --test-dir build --output-on-failure` —
      zero warnings, all tests pass.
- [ ] No behavioural change: `git diff` for every P2/P3 item should touch only
      comments, doc blocks, a file rename, and (for the two comparator items)
      an import plus a one-line function body replacement whose output is
      provably identical to the code it replaces.

## Issue Surfacing

If you find a defect outside this checklist, surface it in your Completion
Report — do not fix it and do not file an issue.

## Review Notes

**Severity counts:** P1 0 · P2 3 · P3 4 (grouped; 6 underlying instances) · P4 0

**What this review covered:** `git diff --stat ff20f0c..d9e21e0` (288 files,
~53.7k insertions) was triaged by area — the TypeScript generator/emit/resolver/
validator tree, the C++ runtime files WO4b/WO4c/WO10b touched, the new
`u8g2gl_editor.h`/`u8g2gl_editor.cpp` (WO11), the test fixtures, and the specific
items named in the task brief. Given the diff's size, review depth was uneven by
design: every item the task brief named was individually verified against the
actual source (not taken on faith), and targeted greps covered file-header
presence, SPDX presence, enum base types, heap/`std::function`/`String` usage,
`mark_dirty()` guarding in every touched widget setter, and TSDoc presence on
every new file's exported functions. A line-by-line read of all ~130 changed
TypeScript files and ~75 changed C++ files was not performed within budget; the
"Observations" below note where a fuller pass would likely find more of the same
class of defect.

**What was verified and found clean, worth stating plainly so it isn't
re-litigated:**
- Every new/modified `.ts` file under `cli/src/` carries a correct header with
  SPDX and an exports list; every new/modified `.h`/`.cpp` under `include/` and
  `src/` does too (cpp.md's claim that "the runtime currently lacks these
  entirely" is itself now stale against this stack's own work, in the
  reviewer's favour).
- No heap allocation, no stored `std::function`, no Arduino `String` in any
  changed runtime file.
- Every enum touched or added by this stack (`u8g2gl_editor_type_t`,
  pre-existing ones) has an explicit base type.
- Every widget setter sampled (`u8g2gl_switch`, `u8g2gl_progress_bar`,
  `u8g2gl_clock`, `u8g2gl_xbm`, `u8g2gl_button`, and the style setters in
  `u8g2gl_obj.cpp`) correctly guards `mark_dirty()` on an actual value change
  where a change-guard is meaningful, and calls it unconditionally where a
  pointer-identity guard would be unreliable (text/bitmap-pointer setters) —
  this is the exact defect class WO4b's PROJECT.md note describes having
  shipped once already, and it has not recurred here.
- The new `u8g2gl_editor.h` structs (`u8g2gl_editor_class`,
  `u8g2gl_editor_registry`, etc.) are ordered pointers-first as the file's own
  comment states, and the file's Doxygen is thorough, including lifetime notes
  ("Nothing here owns memory... must outlive whatever is set from them").
- `cli/src/core/order.ts`'s own rationale for `compareCodeUnits` is a model
  why-comment — it names the exact bug class (locale-dependent sort) with a
  worked example, which is precisely what documentation.md §4 asks for.

**Layering question (Observation, not a defect the standards resolve):**
`cli/src/core/validator/shared-model.ts`, `validate-realisation.ts`,
`validate-types.ts`, `validate-widget-props.ts`, and `validate-schema.ts` all
import from `generator/realise/index.js` and `generator/emit/{screen-model,
value,styles}.js` — pulling `COLOR_VALUES`, `styleProperties`, `namedStyles`,
`FLAG_COMPARISONS`, `MAX_OBJECTS_PER_SCREEN` and `realiseScreens` itself into the
validator. In the other direction, `generator/generate.ts` and
`generator/check-project.ts` import `validator/validate.js` and
`validator/validate-not-yet-supported.js`. No single file forms an import
cycle, but the two subsystems are now mutually dependent at the directory
level, which is unusual for a validate-then-generate pipeline: a reader
expecting "validator runs first, informs generation" will be surprised to find
the validator reaching into generator internals for lookup tables like
`COLOR_VALUES`. This may well be the right call — it is the same instinct as
`order.ts` itself, avoiding a second hardcoded copy of a list that must agree
with emission (the standards' D-17 "element knowledge is data, never code" cuts
in favour of one source). But the standards are silent on where that one source
should *live* when both the validator and the generator need it, and "validator
imports generator" versus "both import a shared `core/*` module" is an
architectural choice, not a mechanical fix. Flagging for the architect's
judgement; not included as a checklist item because fixing it without a
decision on the right shared location would just move the coupling, not remove
it.

**Uncertain / not chased further given budget:**
- The task brief's "a `geometry.test.ts` title" is addressed above as the
  file-header `Description:`, not an individual `it()` title — every `it()`
  title in that file was read and found accurate against [D-20]'s current
  behaviour. If a specific `it()` title was meant, it was not found; worth a
  second look if the architect had a specific line in mind.
- "Placeholder test-file headers" (plural) — only `test/test_obj.cpp` was found
  with the bare "Implementation of X" anti-pattern among files sampled; a full
  enumeration of all 288 changed files' headers was not performed. Worth a
  grep-for-pattern pass (`grep -rn "Description: Implementation of"`) before
  considering this class of defect closed.
- The C++ files not explicitly sampled (`u8g2gl_editor.cpp`, `u8g2gl_glyph.cpp`,
  `u8g2gl_draw.cpp`'s implementation, `u8g2gl_core.cpp`) were checked for the
  non-negotiables (headers, heap, enums) but not read end-to-end for in-routine
  step-breakdown completeness or why-comment coverage on non-obvious formulas.

## Completion Report

<!-- Written by the remediation worker at task completion -->
