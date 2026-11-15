# E-5 — Loose ends from E-4: unreported attributes, stale problems, dead code

*PA plan, drafted 2026-11-15 and approved by the owner the same day. Covers every "Left
open" item in PRs #57 and #58 except the foundation's (owner: "fix all the
'left open' items - except for the parts related to the foundation, we will
change those on another PR").*

## Goal

One PR from main at `cf82556` (after #58). No schema or runtime change.
CLI 0.19.0 → **0.20.0**: a project that writes a stray attribute on
`u8g2gl.xml` now fails validation, which is a behaviour change. Generated
output is unchanged, so no golden moves.

## What the code says (main at `cf82556`)

| # | Item | Where | Cause |
|---|---|---|---|
| 1 | **Unknown attributes and children in `u8g2gl.xml` pass silently.** `foo="1"` or `<wibble/>` on a `<target>` validates clean. | `core/parser/parse-project.ts` | The parser reads only the attributes it knows, and nothing compares the rest with the vocabulary. Widgets and `<style>` already report `U8G2GL_UNKNOWN_ATTRIBUTE` as an error. |
| 1b | **Any parser error in `u8g2gl.xml` gives a false schema error.** An unknown `<foo/>` under `<u8g2gl>` also gets `Unknown or unsupported schema version ''` at 1:1, plus "No <target> declared". | `node/load-project.ts:211` keeps a placeholder project; the validator checks it | Any error withholds the parsed model, so the validator sees `schema: ''` and no targets. #58 exempted `U8G2GL_REMOVED_ATTRIBUTE` only. Item 1 would add more errors on this path, so it has to be fixed with it. |
| 2 | **A failed test run's problems outlive their cause.** After an undo, the run's `U8G2GL_TEST_RUN_BUILD` problems stay until the next run. | `designer/src/test-run/test-run-controller.ts` (`fail()`, `edited()`) | `diagnostics` is cleared only by the next run. The mismatch overlay beside it already clears at the next edit. |
| 3 | **The editor build repeats a project error.** The same message shows twice, once under its own code and once under `U8G2GL_EDITOR_BUILD`. | `designer/src/pipeline/edit-loop.ts:449` merges `wasm.buildDiagnostics` into Problems unfiltered | The build runs `generate`, which fails on the same errors the live pipeline has already reported. `parseBuildFailure()` re-codes them. Test-run failures (2) have the same shape. |
| 4 | **The departures fixture's `generated/` and `generated_editor/` are stale** (stamped 0.13.1, schema 0.4). | `cli/test/fixtures/departures-project/` | No test reads them. Every test copies the fixture and generates afresh. Nothing regenerates them, so they can only drift. |
| 5 | **The vocabulary keeps three mechanisms nothing uses.** `beforeCanonical`, `unlessPresent` and `canonical: false` existed for `<bus>`. | `core/schema/project-vocabulary.ts`; `designer/src/forms/form-model.ts`, `form-edits.ts` | Kept in #58 with generic docs. Every `canonical` is `true`. |
| 6 | **design_spec §5.2's figures may be stale.** It says 4913 constructor classes, 13 bus variants and 1631 full-buffer. The catalogue has 1637 records and 14 `bus.raw`. | `docs/design_spec.md:167, 403` | Unchecked since an older U8G2. The 14th `bus.raw` is the builder's own `PARALLEL` label for bus-less classes, so "13" may still be true of U8G2. The figures need recounting, not guessing. |

## Rulings

1. **Every attribute and child element in `u8g2gl.xml` is checked against the
   project vocabulary**, the same list the form is built from, so the two
   can't disagree.
   - An attribute the vocabulary doesn't spell on that element, aliases such
     as `ramBudget` included, is `U8G2GL_UNKNOWN_ATTRIBUTE`: an **error**, as
     for widgets and `<style>`, at its line, with the nearest spelling
     suggested.
   - An unknown child of `<target>`, `<targets>` or `<display>` is an error at
     its tag, as an unknown child of `<u8g2gl>` already is.
   - The removed pins keep their own `U8G2GL_REMOVED_ATTRIBUTE` and are never
     also reported as unknown.
   - The check lives in the parser, the only place that sees raw attributes.
2. **A parse error that doesn't change the model's shape keeps the model.** An
   unknown or removed attribute leaves the parsed project complete, so the
   validator goes on to the real schema and targets. #58's single exemption
   becomes a named set of codes.
3. **A withheld model reports nothing about the placeholder.** When
   `u8g2gl.xml` fails to parse structurally (an unknown element, a missing
   required attribute), Problems shows the parse error alone.
   - The validator skips the schema-version check and "No <target>
     declared" for a project it never received, rather than reporting
     values the file never wrote.
   - The test is that `<foo/>` gives one error, not three.
4. **A failed test run's problems clear at the next edit**, as its mismatch
   overlay does. The run's verdict line keeps its "n edits since" wording, so
   the result stays visible while Problems no longer claims it's current.
5. **A build or test-run problem that repeats a live one is dropped.** When
   Problems is published, a `U8G2GL_EDITOR_BUILD` or `U8G2GL_TEST_RUN_BUILD`
   diagnostic is dropped if a live diagnostic has the same file, line, column
   and message. Build problems with no live twin (a compiler error in a
   widget's C++, say) still show.
6. **The departures fixture's `generated/` and `generated_editor/` are
   deleted.** No test reads them, so they were a second, unchecked copy of
   generator output. A test fails if they come back, so a stray `generate`
   into the fixture is caught. This is preferred over making them goldens:
   `emit-project` and `generated_fixture` are already the goldens, and
   checked.
7. **The unused mechanisms are deleted**, not kept for later:
   - `beforeCanonical`, `unlessPresent` (both the spelling's and the element's)
     and the `canonical` flag;
   - their branches in `attributeSpellings()`, `form-model.ts` and
     `form-edits.ts`, and their tests.

   Behaviour is unchanged, which the form's unit and e2e suites show.
8. **§5.2's figures are recounted from the pinned U8G2** (`d66b49a`) with a
   reproducible command, recorded in the work order's report. The table and
   line 403 are corrected to the counts, and say that `PARALLEL` is the
   builder's label for U8G2's bus-less parallel classes.
9. **Versions.** CLI 0.20.0: item 1 makes some projects that passed before
   fail, which is a behaviour change, and pre-1.0 a minor bump. No schema bump:
   the vocabulary doesn't change, only the check. No runtime change. No golden
   moves, because generated output doesn't change.
10. **Docs.**
    - design_spec §5.1: `u8g2gl.xml`'s attributes and children are checked
      against the vocabulary.
    - §15.3: the codes' rows.
    - ui_spec, where Problems is described: build and test-run problems
      don't repeat a live one, and a failed run's clear at the next edit.
    - ChangeLog for `cli v0.20.0`.
11. **Out of scope:**
    - the foundation's changes (another PR, owner's call);
    - unknown attributes in `globals.xml` and screen files, which have their
      own checks. The work order's report notes any gap it finds there.

## Decomposition

Worktree `../U8G2GL-e4` from `origin/main` (`cf82556`). One branch per WO,
stacked. The worker doesn't push. The PA verifies, pushes and opens the PR.

| WO | Branch | Scope | Done when |
|---|---|---|---|
| **WO1** | `u8g2gl-e5/wo1-project-attributes` | Rulings 1–3 (items 1, 1b). | Tests: unknown attribute on each project element (`<u8g2gl>`, `<target>`, `<display>`, `<output>`) is one error at its line with a suggestion; an alias isn't reported; an unknown child of `<target>`/`<display>` is one error; a removed pin isn't also unknown; a project with a stray attribute still reports its real schema and target; `<foo/>` gives one error, not three. Built CLI shows the same. Every fixture still validates. |
| **WO2** | `u8g2gl-e5/wo2-problems` | Rulings 4–5 (items 2, 3). | Unit: a failed run's diagnostics clear at the first edit; a build diagnostic equal to a live one is dropped, and one without a twin is kept. e2e: a pin written on disk shows one problem, not two; after a refused run and an edit, the run's problems are gone. |
| **WO3** | `u8g2gl-e5/wo3-cleanup` | Rulings 6–8 (items 4–6). | The fixture dirs are gone and a test guards it; the full CLI suite, including the design tests that copy the fixture, passes. The mechanisms are gone and the form suites pass unchanged. §5.2 matches the recount. |
| **WO4** | `u8g2gl-e5/wo4-docs-review` | Ruling 10; CLI 0.20.0; readability review. | All suites pass one at a time; the golden refresh gives an empty diff; check-package PASS at 0.20.0; home-path guard clean. |

## For the owner to decide

- **E1. Unknown attributes in `u8g2gl.xml`: error or warning?** I recommend
  an **error**, as widgets and `<style>` already have it, and because the
  pins showed what a silently ignored attribute costs. A warning would let
  existing projects keep validating; with no clients yet, that isn't needed.
- **E2. The departures fixture's generated folders: delete or make goldens?** I
  recommend **delete**, with a test that keeps them gone (ruling 6).
- **E3. CLI 0.20.0?** It's a minor bump, because validation is stricter.

## Status log

- 2026-11-15 — Drafted by the PA after the owner asked for every non-foundation
  "Left open" item of #57 and #58 to be fixed.
- 2026-11-15 — **Approved by the owner.** Asked "Do you approve E-5, with my
  recommendations on E1–E3?", the owner replied, in their own words:
  **"Approve E-5"**. That settles E1–E3 as recommended:
  - E1: an unknown attribute in `u8g2gl.xml` is an error;
  - E2: the departures fixture's generated folders are deleted, with a guard;
  - E3: CLI 0.20.0.
- 2026-11-15 — **Ruling 6 corrected by the PA.** Its premise "No test reads
  them" was wrong: `prepare-build.test.ts` read the fixture's committed
  `generated/ui_fonts.cpp` as its sentinel, so the worker stopped, as the work
  order required. The PA made that test plant its own sentinel, then made
  the deletion and the guard as ruled (`3d4c828`). The ruling's outcome is
  unchanged.
- 2026-11-15 — **E-5 verified by the PA** on `3d4c828`, suites one at a time:
  - Wasm 4/4; host ctest 520/520; CLI 3031; lint, tsc and designer typecheck
    clean; designer unit 266; e2e 126/127, the one failure the known
    `design-hidden.spec.ts:144` flake, which passed alone; production 3.
  - Goldens: empty diff. check-package PASS at 0.20.0. Home-path guard clean.
  - Built CLI: `rotaton` on `<target>` is one error with "did you mean
    'rotation'"; `ramBudget` isn't reported; `<wibble/>` and `<foo/>` give one
    error each, with no placeholder schema error; a pin gives its refusal
    alone; `schema=""` is reported as before.
  - Browser, production build: a pin and a misspelt attribute written on disk
    show as two problems, not four, once the editor build has failed; both
    clear when the file is restored.
