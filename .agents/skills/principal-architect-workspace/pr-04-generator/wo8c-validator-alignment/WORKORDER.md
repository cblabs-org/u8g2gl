---
work_order: WO8c
project: pr-04-generator
title: "Validator alignment: exact object ceiling, refusal severity, wd_ un-reserved"
branch: u8g2gl-generator/wo8c-validator-alignment
base: u8g2gl-generator/pa-ca-rulings
complexity: standard
status: complete
---

# WO8c — Validator alignment

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO8c as
approved by the owner** ("Owner approval — WO8c"); and that this WORKORDER's `status` is
`dispatched`. If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8c-validator-alignment`
**Base**: `u8g2gl-generator/pa-ca-rulings` (the PA commit applying the Chief Architect's
spec rulings, on top of WO8b)

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be
answered, and your work will strand uncommitted. Do not push.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. Isomorphic core. Element knowledge is
data, never code.

## Design authority

design_spec §7.2, §13.3, §13.4 and §13.5 **as they stand on this branch** — §13.4 was
corrected on 2026-09-16 and no longer reserves `wd_`. [A-3], [D-12], [D-18], [D-21].
**"Stop and report" means record it, do not choose, continue with the remaining items.**

---

## Objective

Three validator gaps that WO8b's realisation exposed, closed before emission is written
against them. Emission (WO9, WO10) must not be built on a ceiling check that under-counts.

## Background — the ceiling is a live hole, reproduced

`validate-schema.ts`'s `countScreenObjects` predates [D-18]. It **omits composite
containers** and **counts drawing elements** — both inverted by that decision — so its comment
claiming it "can never miss a real overflow" is false. Verified end to end by the PA on
2026-09-16: a project of 128 composite instances reaches **256 objects**, past the structural
limit of 254, and **both `validate` and `generate` exit 0 with no diagnostic**.

`parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` consumes one value ([A-3], [D-21]), so
254 is a property of the object model, not a tunable. WO8b now computes the exact count.

## Line-Item Instructions

- [x] **The ceiling uses realisation's exact count.** Replace `countScreenObjects` with the
      object count WO8b's realisation produces for the same screen, so the 254 limit is
      enforced on what will actually be emitted. Keep the diagnostic naming the screen, its
      count and the ceiling. If threading realisation into the validator would invert a module
      dependency, say so in the Completion Report and use the shared model rather than
      inventing a second count — **there must be exactly one object count in the codebase**,
      and a test should make a second one fail.
- [x] **Regression test at the boundary:** 256 objects (the 128-composite case above) is an
      error; 254 is not. Both through `validate` **and** `generate`. The 256 case must pass
      at this branch's base — say so in the report, since that is the defect's proof.
- [x] **Realisation's refusal obeys the journey split.**
      `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` is raised inside `generate()` only, so `validate`
      passes a document `generate` refuses. Make it a **warning in `validate`** and an
      **error in `generate`**, like every other refusal (PROJECT.md decision 1), using the
      existing severity mechanism rather than a new one.
- [x] **`wd_` is no longer reserved (Chief Architect ruling, §13.4 on this branch).** Remove
      `wd_` from `RESERVED_IDENTIFIER_PREFIXES` (`resolver/mangle.ts:50`) and from
      `RESERVED_PREFIXES` (`validator/validate-identifiers.ts:27`). **Collapse the two lists
      into one** exported constant — they are the same rule spelled twice, and §13.4 is its
      source. Keep `u8g2gl_` and `ui_` reserved. The prefix strip at
      `parser/parse-widget-tree.ts:380` still strips `wd_` for display purposes; leave it, and
      say whether it still makes sense.
- [x] **Restore a `wd_` fixture.** WO7 renamed a fixture from `wd_card` to `card` because the
      validator rejected it. Restore a `wd_`-named composite or custom element in the fixtures
      and assert it validates, so §6.6's convention is covered by a test rather than by
      absence. A `u8g2gl_`-named or `ui_`-named user element must still fail.

## Strict Boundary Box

**In scope:** `cli/src/core/validator/validate-schema.ts`, `validate-identifiers.ts`;
`cli/src/core/resolver/mangle.ts` (the prefix list only);
`cli/src/core/generator/` (severity plumbing and exposing realisation's count only);
`cli/src/core/schema/diagnostic.ts`; `cli/test/` including fixtures; this WORKORDER.

**Do NOT touch:** emission (WO9+); realisation's analysis itself (WO8b — consume it, do not
change it); WO8a's pipeline and its expansion-count test; runtime C++; manifests; `docs/`;
`PROGRAM*.md`.

---

## Testing Requirement

- [x] 256 objects errors in `validate` and `generate`; 254 passes. The 256 case passes at the
      base — state that from a throwaway worktree under `tmp/`.
- [x] A `draw=`-only element named by a focus ring warns in `validate` and errors in
      `generate`, with the same code and location.
- [x] A `wd_`-named user element validates; `u8g2gl_`- and `ui_`-named ones still fail.
- [x] One reserved-prefix list remains — a test fails if a second appears.

## Verification Requirement

- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (baseline 694)
- [x] `cmake --build build` zero warnings; `ctest --test-dir build` unchanged (baseline 305,
      one known skip)
- [x] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-17. **Status `complete`.** Not pushed.

### Authorization

Verified from committed files, not from the dispatch prompt:

- This WORKORDER's front matter: `project: pr-04-generator`, `status: dispatched` (as read).
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the twelve work
  orders, start WO1"*, recorded at `2026-09-13T19:59:36Z`.
- `../PROJECT.md` "Owner approval — WO8c, 2026-09-17" quotes the owner, *"you can add wo8c or
  wo9 whichever you prefer"*, with the placement left to the PA, and the status log's
  2026-09-17 entry records WO8c dispatched on this branch.

Nothing missing or inconsistent.

### The ceiling now uses realisation's count — and yes, it inverted a dependency

`countScreenObjects` is gone from `validate-schema.ts`, along with its local
`MAX_OBJECTS_PER_SCREEN` and the doc comment claiming it "can never miss a real overflow".
The ceiling is enforced by a new **Pass 9**, `validator/validate-realisation.ts`, against
`RealisedScreen.objects.length` — the length of the very array emission writes a `uint8_t`
parent table for, so the check cannot disagree with the thing it protects.

**The dependency inversion is real and I did not paper over it.** Realisation lives in
`generator/realise/`, so the validator now imports the generator, which is the reverse of
the usual layering. The two honest options were (a) import it, or (b) keep a count of the
validator's own — and (b) is the defect, not the fix. So it is (a), threaded through the
shared model exactly as WO8a threads the pipeline:

- `ValidateInput` gains an optional `realisation`, documented like `pipeline`;
- `shared-model.ts` gains `realisationOf(input)`, mirroring `pipelineOf(input)`: it returns
  the supplied realisation, or realises the run's shared expansion. Its doc comment names
  the inversion and why it is preferred to a second count;
- `generate()` now realises **before** `checkProject` (Steps 3 and 4 swapped) and passes the
  result through `checkProject` into `validate`, so a build realises the document once and
  Pass 9 judges the same analysis the build emits from. `generate`'s old post-validation
  realisation block and its separate `finaliseDiagnostics` merge are gone.

There is **no import cycle**: `generator/realise/` imports only `schema/`, `manifest/` and
`resolver/`, never the validator. `tsc` and the test type-check confirm it. If a later PR
wants the layering straight, the move is realisation to a neutral `core/` location — noted
as finding 2 rather than done here, since the Boundary Box covers `generator/` for severity
plumbing and exposing the count only.

**Exactly one object count** now exists. `MAX_OBJECTS_PER_SCREEN` is declared once, in
`generator/realise/model.ts`, whose doc comment previously said two counts were "deliberate
for now" and now says this is the only one. Three source-scanning tests pin it: the constant
is declared in exactly one file, `TOO_MANY_OBJECTS` is raised from exactly one module, and
§13.4's prefix literal appears in exactly one file. A second copy of any of the three fails
the suite rather than waiting to drift.

### 256 versus 254 — results, and the proof at the base

The fixture is a composite holding one label, so **one instance is two objects** (the
container plus its child). 127 instances = 254; 128 = 256.

| Case | `validate` | `generate` |
|---|---|---|
| 127 instances — **254 objects** | no `TOO_MANY_OBJECTS` | exits clean, files written, `realised[0].objects` length **254** |
| 128 instances — **256 objects** | **error**, naming screen `home`, "256 objects", "254", `uint8_t` | **refused**, `files: []` |

**At the base (`cef2409`), in a throwaway worktree under `tmp/`, the 256 case passes — that
is the defect's proof.** 8 of the 12 new tests fail there, and they fail *behaviourally*,
not because a module is missing:

- *"refuses 128 composite instances — 256 objects"* — **fails at the base**: no diagnostic at
  all, from either journey. This is WO8b finding 1 reproduced as a test.
- *"does not count drawing elements"* — **also fails at the base**, in the opposite
  direction: 300 `u8g2gl_pixel` elements are **zero** objects, and the structural count
  flagged them as 300 > 254. So the retired count was wrong *both* ways — it missed a real
  overflow and invented a false one — and this test is what stops a structural count being
  reinstated anywhere.
- the two severity tests and the three one-count/one-list scans also fail at the base.
- The four that pass at the base are the deliberate controls: the 254 cases (which the base
  under-counted, so it let them through for the wrong reason), the container-counting
  assertion, and "says nothing about a drawing element nothing refers to".

The worktree was removed (`git worktree remove --force`, `git worktree list` clean).

### How the refusal severity is threaded

Through the **existing** mechanism, not a new one. `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` was
raised only inside `generate()`, so `validate` passed a document `generate` refuses. Pass 9
now re-stamps realisation's diagnostics at `input.notYetSupported ?? DEFAULT_NOT_YET_SUPPORTED_POLICY`
— the same `'warning' | 'error'` parameter Pass 8 takes, defaulted the same way, and
`generate()` still fixes `'error'` with no override.

**Realisation's analysis is untouched.** `realise.ts` still states the fact at `'error'`;
Pass 9 decides what the fact costs the caller. That keeps the boundary ("consume it, do not
change it") and means both journeys report the same code, at the same location, with the same
prose — pinned by a test that asserts the two diagnostics are equal once severity is
normalised.

The ceiling, by contrast, is **always an error** in both journeys. It is a property of the
object model ([A-3], [D-21]), not something a later PR delivers, so it is not policy-driven.

### The reserved-prefix list, and the prefix strip

One list: `RESERVED_IDENTIFIER_PREFIXES` in `resolver/mangle.ts`, now `['u8g2gl_', 'ui_']`,
already re-exported through `resolver/index.ts`. `validate-identifiers.ts`'s duplicate
`RESERVED_PREFIXES` is deleted and Pass 7 imports the shared one; its doc comment says why
the mangler and Pass 7 must share it. Both files' headers no longer claim `wd_` is reserved,
and the constant's doc comment records the ruling and the reason (by [D-12] a tag *is* its
class name, so the generator never emits a `wd_` symbol).

**The prefix strip at `parser/parse-widget-tree.ts:380` is untouched — deliberately.** That
file is outside the Boundary Box (WO8a's excursion into it was flagged and accepted, and I
am not repeating that without need), and nothing in this work order requires the change. As
to whether it still makes sense: **partly, and its comment is now wrong.** The strip reduces
a tag to a stem for a *synthesised* name, so `<wd_service_list>` with no `name` becomes
`service_list_0`, which is still a reasonable name. But the comment says the prefixes are
stripped "so the auto-generated identifier conforms to §13.4", and for `wd_` that is no
longer true — a `wd_`-prefixed synthesised name would now conform perfectly well. Stripping
also means `<wd_badge>` and `<badge>` synthesise into the same `badge_0` pool. Recorded as
finding 1; not fixed.

### The `wd_` fixture, and what it asserts

New: `cli/test/validator/fixtures/valid/widgets/wd_badge/wd_badge.xml` — a user composite
named `wd_badge` whose child label is named `wd_caption`, so both the manifest name and an
element name carry the prefix. `screens/screen_home.xml` instantiates it as
`<wd_badge name="badge" …>`, fully positioned inside the 128x64 target.

`validate.test.ts` loads it into the registry alongside `status_bar` and a new test asserts the
whole valid fixture project yields **zero** `U8G2GL_INVALID_NAME` and zero errors — so the
§6.6 convention is covered by a test rather than by absence. The pre-existing assertions on
that fixture (0 errors, 2 warnings, both `NOT_YET_SUPPORTED` from its `<bdf>` fonts) are
unchanged, which is the check that adding the badge changed nothing else.

`u8g2gl_`- and `ui_`-named user elements **still fail**, asserted in two places:
`identifiers.test.ts` (now expects exactly `['u8g2gl_custom', 'ui_label']` and no longer
counts `wd_component`) and `element-identity.test.ts` (2 diagnostics, with an explicit
assertion that `wd_widget_instance` is **not** among them).

### Test counts

| Suite | Before (`cef2409`) | After |
|---|---|---|
| `npx vitest run` | 694, 45 files | **702**, 46 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | **0** (no C++ touched) |
| `ctest --test-dir build` | 305, 1 known skip | **305**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

Arithmetic: +12 new (`test/validator/validator-alignment.test.ts`), +1 (`validate.test.ts`'s
`wd_` assertion), **−5** (the retired structural-ceiling `describe` in `schema.test.ts`,
which tested `countScreenObjects` and could not survive it). 694 + 12 + 1 − 5 = 702.

Three existing tests changed, all of them pinning behaviour this work order deliberately
reverses: the two reserved-prefix tests above, and `schema.test.ts`'s ceiling block removed
whole. **WO8a's expansion-count test is untouched and still passes** — realisation reads
`pipeline.expansion` and expands nothing, so `validate` still expands exactly once and
`generate` still expands exactly once.

**A measurement warning worth recording.** One full-suite run reported 7 files failing and
took 3616s. It was worthless: I had launched it while the base-worktree `vitest` and a
`cmake`/`ctest` cycle were still running, and an earlier `pkill -f vitest` had killed workers
mid-flight. Re-run alone, the same tree gives 702/702 in 5.9s. The green figures above are
from uncontended runs. Do not measure this suite concurrently with another one.

### Decisions I made

1. **Pass 9, last in the sequence.** It is the only pass that judges the realised model
   rather than the authored one, and running it last keeps the authored-document passes
   reporting first for one defect.
2. **The ceiling is not policy-driven; the refusal is.** Reasoning above — one is a property
   of the object model, the other a construct a later PR delivers.
3. **Re-stamp rather than re-raise.** Pass 9 spreads realisation's diagnostics with the
   run's severity instead of `realise.ts` learning about policies, so realisation's analysis
   stays exactly as WO8b left it.
4. **`generate` realises before validating.** Required by decision 3 — Pass 9 has to receive
   the realisation — and it removes `generate`'s separate diagnostic-merge path.
5. **The 300-drawing-element test.** Not asked for, but the retired count was wrong in both
   directions and only this test pins the over-count half. It is also what makes a
   reinstated structural count fail loudly.
6. **Source-scanning tests for "one count, one list".** The WORKORDER asked that a second
   count make a test fail; a behavioural test cannot see a duplicate constant, so three
   scans over `src/core` do it directly.

### Spec disagreements (recorded, not chosen)

None. §7.2, §13.3, §13.4 and §13.5 as they stand on this branch agree with this WORKORDER
throughout — §13.4's corrected text ("**`wd_` is not reserved**") is exactly what the prefix
change implements, and §13.3's 254 is what Pass 9 enforces.

### Out-of-scope findings (not fixed, not filed)

1. **`parse-widget-tree.ts:380`'s prefix strip and its comment** (detail above). The comment
   justifies stripping `wd_` by §13.4 conformance, which the ruling has made false; and the
   strip collapses `<wd_badge>` and `<badge>` into one synthesised-name pool, so two
   different tags can contend for `badge_0`. Narrow — it needs two unnamed elements of
   tags differing only by the prefix — but it is a name the author never wrote.
2. **Realisation's home is now a layering wart.** The validator imports
   `generator/realise/`. A move to a neutral `core/realise/` (or `core/model/`) would
   straighten it with no behaviour change; every import is already through
   `realise/index.js`.
3. **`notYetSupported` is now narrower than its meaning.** The field and
   `NotYetSupportedPolicy` carry the severity of realisation's refusal too, which is not a
   "not yet supported" construct. A rename to something like `refusalPolicy` would say what
   it is; it touches every caller, so it is not a WO8c-sized change.
4. **`validate` now realises the whole document on every run.** Correct, and required by the
   journey split — but it is new work in the authoring path, and the designer validates per
   keystroke ([UD-2]). Nothing here is expensive at fixture scale; worth a thought when the
   designer drives it.
5. **The ceiling is per screen; `Capacities.maxObjectsPerScreen` is a maximum across
   screens.** Both derive from the same object array, so they cannot disagree — but they
   answer different questions with similar names, and WO9 emits the second one.
6. **`DRAWING_ELEMENT_NEEDS_OBJECT`'s doc comment in `diagnostic.ts`** describes it as a
   build refusal without mentioning that it is a warning while authoring. `diagnostic.ts` is
   in the Boundary Box but for "new codes only", and no new code was needed, so I left the
   comment alone rather than widen the diff.

### Diff boundary

`git diff --name-only cef2409..HEAD`:

- `cli/src/core/validator/validate-realisation.ts` (new — Pass 9)
- `cli/src/core/validator/validate.ts` (`realisation` input, Pass 9 wired)
- `cli/src/core/validator/validate-schema.ts` (`countScreenObjects` and its constant removed)
- `cli/src/core/validator/validate-identifiers.ts` (the duplicate prefix list removed)
- `cli/src/core/validator/shared-model.ts` (`realisationOf`)
- `cli/src/core/validator/index.ts` (re-export)
- `cli/src/core/resolver/mangle.ts` (the one prefix list; `wd_` removed)
- `cli/src/core/generator/generate.ts` (realise before validate; the early-return removed)
- `cli/src/core/generator/check-project.ts` (`realisation` threaded)
- `cli/src/core/generator/realise/model.ts` (the ceiling's doc comment — no logic)
- `cli/test/validator/validator-alignment.test.ts` (new, 12 tests)
- `cli/test/validator/fixtures/valid/widgets/wd_badge/wd_badge.xml` (new)
- `cli/test/validator/fixtures/valid/screens/screen_home.xml` (instantiates it)
- `cli/test/validator/validate.test.ts`, `identifiers.test.ts`,
  `element-identity.test.ts`, `schema.test.ts`
- this WORKORDER

Untouched: emission (WO9+), realisation's analysis (`realise.ts`, `capacities.ts`),
WO8a's pipeline and its expansion-count test, `cli/src/core/schema/diagnostic.ts`,
`cli/src/core/parser/`, runtime C++, `extern/`, manifests, `docs/`, `PROGRAM*.md`.
