---
name: e-5-wo1-wo4
description: Work Orders of E-5 — u8g2gl.xml attributes and children checked against the vocabulary with no placeholder cascade, stale and duplicate Problems fixed in the designer, dead fixture output and vocabulary mechanisms deleted, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work: nothing in either foundation repository, nothing from E-3.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-5-loose-ends` ([PROJECT.md](PROJECT.md)). Rulings 1–11 bind this PR. Read
the whole of PROJECT.md first, especially "What the code says", which names every site. The
owner's approval, with E1–E3, is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO4.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e5/wo1-project-attributes` (based on main at
  `cf82556`, upstream unset). Cut each later branch from the previous tip with
  `git checkout -b <name>`: `u8g2gl-e5/wo2-problems`, then `u8g2gl-e5/wo3-cleanup`, then
  `u8g2gl-e5/wo4-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit (`d66b49a`). Don't touch
  it, and don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build
  in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles. When you pass `--out` to the CLI, give a path inside the worktree's `tmp/`,
  never a relative path that could leave it.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`.
  - The host C++ tests: `cmake -B build && cmake --build build -j8 && ctest --test-dir build
    --output-on-failure`.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - Known load flakes, still to be reported if they fail: `design-hidden.spec.ts:144` (e2e) and
    `generate-editor.test.ts` hitting vitest's 5 s limit under a full parallel run.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind
  them, never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to
  pass.
- **Versions:** never tag, never publish. Bump only the CLI, to 0.20.0, in WO4. No schema or
  runtime change, and no golden may move.

# WO1 — project attributes (`u8g2gl-e5/wo1-project-attributes`)

- [ ] **Unknown attributes** (ruling 1). In `cli/src/core/parser/parse-project.ts`, check every
      attribute on `<u8g2gl>`, `<targets>`, `<target>`, `<display>` and `<output>` against the
      spellings the project vocabulary gives that element (`attributeSpellings()` in
      `core/schema/project-vocabulary.ts`, aliases included). Derive the known set from the
      vocabulary, never from a second hand-kept list.
      - Anything else is `U8G2GL_UNKNOWN_ATTRIBUTE`, an error at the attribute's name, with
        "Unknown attribute 'x' on <target>." and the nearest spelling suggested the way
        `validate-widget-props.ts` does it (`findClosest`, or whatever it uses).
      - The removed pins (`cs`, `dc`, `reset`, `address`) keep `U8G2GL_REMOVED_ATTRIBUTE` and are
        never also reported as unknown.
      - Check how `xml:`/`xmlns` attributes and the `<?xml?>` declaration are handled before
        deciding they need an exemption; say what you found.
- [ ] **Unknown children.** An unknown child of `<targets>`, `<target>` or `<display>` is an error
      at its tag, in the same form as the existing unknown child of `<u8g2gl>`. `<bus>` keeps its
      removal message only.
- [ ] **The model survives non-structural errors** (ruling 2). Replace #58's single exemption in
      `parseProjectFile()` with a named set of codes that don't change the model's shape:
      `U8G2GL_REMOVED_ATTRIBUTE` and `U8G2GL_UNKNOWN_ATTRIBUTE`. An unknown *element* still
      withholds the model. Doxygen says why.
- [ ] **No placeholder cascade** (ruling 3). When `u8g2gl.xml` was read but its model withheld,
      the validator reports neither the schema-version error nor "No <target> declared" about the
      placeholder.
      - Find where the placeholder is made (`node/load-project.ts:211`) and where the designer's
        project model does the same. Fix it once, so both get the same behaviour, and say where.
      - A project with no `u8g2gl.xml` at all, and a genuinely empty `schema=""`, must still
        report what they report today.
- [ ] **Tests:**
      - unknown attribute on each of the five elements: one error, at its line, with the
        suggestion;
      - an alias (`ramBudget`) is not reported;
      - an unknown child of `<target>`, `<targets>` and `<display>`: one error each;
      - a removed pin is reported once, as removed;
      - a project with a stray attribute still reports its real schema and target (built CLI,
        `--json`);
      - `<foo/>` under `<u8g2gl>` gives exactly one error, through the built CLI;
      - a missing `u8g2gl.xml` and `schema=""` behave as before;
      - every committed fixture still validates (an existing test may already prove it: say
        which).

# WO2 — Problems (`u8g2gl-e5/wo2-problems`)

- [ ] **A failed run's problems clear at the next edit** (ruling 4), in
      `designer/src/test-run/test-run-controller.ts`, beside the mismatch overlay's clearing in
      `edited()`. The run's verdict line is untouched.
- [ ] **Build and test-run problems don't repeat live ones** (ruling 5). Where
      `designer/src/pipeline/edit-loop.ts` publishes Problems (`run()`, Step 1), drop a
      `U8G2GL_EDITOR_BUILD` or `U8G2GL_TEST_RUN_BUILD` diagnostic when a live diagnostic has the
      same file, line, column and message. Keep the rule in one small, named, unit-tested function
      in `pipeline/diagnostics.ts`. A build diagnostic with no live twin is kept.
      - Check that `parseBuildFailure()`'s file, line, column and message really match the live
        diagnostic's for the same error (paths, 1-based columns, message trimming). If they
        don't, match on what is reliably equal and say what you chose.
- [ ] **Tests:**
      - unit: the dedupe keeps a build-only diagnostic and drops a twin; the controller clears
        `diagnostics` at the first edit after a failed run;
      - e2e: a pin written into `u8g2gl.xml` on disk shows **one** problem once the editor build
        has failed, not two; after a refused run, an edit clears the run's problems.

# WO3 — cleanup (`u8g2gl-e5/wo3-cleanup`)

- [ ] **The departures fixture's output is deleted** (ruling 6):
      `cli/test/fixtures/departures-project/generated/` and `generated_editor/`. First grep the
      whole repository, `scripts/` and `.github/` included, for anything that reads them. If
      something does, stop and report.
      - Add a test, beside the fixture's helper, that fails if either directory exists.
      - Run the full CLI suite, which includes the design tests that copy this fixture.
- [ ] **The unused mechanisms are deleted** (ruling 7): `beforeCanonical`, both `unlessPresent`s
      and the `canonical` flag in `project-vocabulary.ts`; their branches in
      `attributeSpellings()`, `designer/src/forms/form-model.ts` and `form-edits.ts`; and their
      tests. Behaviour doesn't change: the form's unit and e2e suites pass without edits other
      than removing those cases.
- [ ] **§5.2's figures are recounted** (ruling 8) from `extern/u8g2` at `d66b49a`:
      - constructor classes in `cppsrc/U8g2lib.h`;
      - controllers;
      - distinct bus suffixes as U8G2 writes them;
      - full-buffer classes;
      - catalogue records.

      Use commands someone else can rerun, and record them and their output in your report.
      Correct `docs/design_spec.md:167` and `:403` to the counts, and say that `PARALLEL` is the
      builder's label for U8G2's bus-less parallel classes. Don't change any other figure without
      a recount behind it.

# WO4 — docs and review (`u8g2gl-e5/wo4-docs-review`)

- [ ] **design_spec:**
      - §5.1: `u8g2gl.xml`'s attributes and children are checked against the vocabulary, and an
        unknown one is an error;
      - §15.3: rows for anything new or changed.
- [ ] **ui_spec**, where Problems is described: build and test-run problems don't repeat a live
      one, and a failed run's problems clear at the next edit.
- [ ] **`ChangeLog`:** `cli v0.20.0`. Don't touch either foundation repository.
- [ ] **CLI 0.20.0** in `cli/package.json` and the lockfile.
- [ ] Run a readability review against `u8g2gl-standards` over every changed file, and fix what
      it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - host C++ build and ctest;
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.20.0).
- [ ] **Completion report** appended below:
      - commits per WO;
      - suite results, with baselines;
      - the §5.2 recount: its commands and output;
      - anything found outside scope;
      - any deviation, and why.

# Completion report

*Worker, 2026-11-15. Provenance checked before starting: this work order names `e-5-loose-ends`,
and its PROJECT.md status log records the owner's "Approve E-5". Nothing pushed, tagged or
published. No network except `npm ci` from the lockfiles.*

## Commits

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-e5/wo1-project-attributes` | `3d60eba` feat(parser): u8g2gl.xml is checked against the project vocabulary |
| WO2 | `u8g2gl-e5/wo2-problems` | `c342d7e` fix(designer): Problems says a fault once, and a failed run's only until the next edit |
| WO3 | `u8g2gl-e5/wo3-cleanup` | `b1d5589` refactor(vocabulary): delete the mechanisms nothing uses; recount §5.2 |
| WO4 | `u8g2gl-e5/wo4-docs-review` | `3c96f72` docs: u8g2gl.xml vocabulary checks and Problems; CLI 0.20.0; then this report |

## Suite results (one at a time)

| Suite | Baseline (`cf82556`+plan) | Final (`3c96f72`) |
|---|---|---|
| Framework Wasm build | OK | OK |
| Wasm tests (4, `node wasm/test/*.test.mjs`) | 4/4 pass | 4/4 pass |
| Host C++ (`ctest`) | 520/520 pass (1 skipped: `SizeOfReport.ThirtyTwoBitTarget`), 0 warnings | same |
| CLI `vitest run` | 2974 passed, 23 skipped | 3006 passed, 23 skipped (+32 new) |
| CLI lint + tsc | clean | clean |
| Designer typecheck | clean | clean |
| Designer unit | 262 passed | 266 passed (+4 new) |
| e2e (`build:e2e`, no Emscripten on PATH, as baseline) | 114 passed, 10 skipped, **1 failed: `design-hidden.spec.ts:144`** (known flake; passed when re-run alone) | 115 passed, 12 skipped (the 2 new specs need the toolchain), 0 failed |
| e2e with Emscripten 5.0.3 on PATH | not run at baseline | **127 passed, 0 skipped** |
| Production (`npm run build`, `test:e2e:production`) | 3 passed | 3 passed |
| `refresh-goldens.mjs` | n/a | empty diff |
| `check-home-paths.mjs` | n/a | clean |
| `check-package.mjs` | n/a | **PASS** `u8g2gl-0.20.0.tgz`, reports and stamps `0.20.0-dev.1` (it packs HEAD, so it was run after the version commit) |

## WO1 notes

- **The known set comes from the vocabulary.** `KNOWN_ATTRIBUTES` is built once from
  `PROJECT_VOCABULARY` × `attributeSpellings()`, crediting each spelling to the element it is
  written on, so `setup`/`rotation` on `<target>` and `ram_budget`/`ramBudget` on `<display>`
  are known. Children come from `vocabularyChildren()`. Suggestions use `findClosest`, as
  `validate-widget-props.ts` does.
- **`xmlns`, `xml:` and `<?xml?>`.** The tokeniser hands `xmlns`, `xmlns:a`, `xml:lang` and `a:b`
  over as ordinary attributes. The declaration is neither an element nor an attribute. Widgets
  and `<style>` don't exempt namespace attributes, no file in the repository writes one, and
  U8G2GL declares no namespace, so there's **no exemption**. `xmlns` on `<u8g2gl>` is
  unknown, and a test pins that.
- **The removed pins** are exempt only where `reportRemovedWiring` refuses them (`<target>`,
  `<display>`), so each pin gets one diagnostic. `<bus>` under `<target>` keeps its removal
  message alone, and its non-pin attributes aren't reported.
- **The model survives** an error in `MODEL_PRESERVING_CODES` (`REMOVED_ATTRIBUTE`,
  `UNKNOWN_ATTRIBUTE`). An unknown element still withholds it.
- **Where the placeholder fix lives.** The placeholder is made in `node/load-project.ts`
  (`loadProject`) and in `designer/src/project/project-model.ts` (`ProjectModelCache.build`).
  Each now sets a new optional `ProjectModel.projectWithheld`. The behaviour itself is in one place:
  `hasProjectModel()` in `core/generator/check-project.ts`. `checkProject()` uses it to drop the
  placeholder's schema diagnostic, so both journeys get it, and the CLI's
  `describeCheckedTarget` uses it to skip "No <target> declared". A missing `u8g2gl.xml`
  (directory: "Project file 'u8g2gl.xml' not found"; lone file: no schema error) and
  `schema=""` (still `U8G2GL_UNKNOWN_SCHEMA_VERSION` at `u8g2gl.xml`) behave as before, and
  tests cover both.
- **Every committed fixture still validates.** `project-unknown-vocabulary.test.ts` parses every
  committed `u8g2gl.xml` under `cli/test` and `test/generated_fixture` and expects no
  diagnostic. The workspace evidence projects under `.agents/` parse clean too (checked by
  hand, not in a test).
- **A fixture change the check forced.** `cli/test/parser/fixtures/valid-project.xml` wrote
  `default="true"` on `<target>`, which nothing ever read (§5.1: "there is no `default`
  attribute"). I removed it. That file is hashed in the CST tokeniser record, so
  `tokeniser-trees.json` and `tokeniser-diagnostics.json` got the same edit by hand, plus the
  new hash: the attribute leaves the record and `ram_budget` moves left 15 columns. The edit is
  documented in `tokeniser-golden.ts`'s header, as that file's convention requires.

## WO2 notes

- **Matching.** `parseBuildFailure()` keeps the file, line and column exactly as
  `formatDiagnostic` printed them, and it keeps only the message's **first line, trimmed**. So
  `withoutBuildRepeats()` matches on file, line, column and the live message's first line, trimmed.
  A multi-line live message, such as the 0.3 migration error, still finds its twin. Paths match:
  the build's `generate` labels project files project-relative, as the designer does.
- **One addition beyond the literal text.** `fail()` gives Problems nothing if an edit was made
  while the run was in flight, matching the overlay rule (`editsSince === 0 ? detail :
  undefined`). Ruling 4 says "as its mismatch overlay does". Without this, such a run's
  diagnostics would appear already stale and stay until the next edit. A unit test pins it.
  Revert that one line if the PA prefers the literal reading.
- **e2e.** `designer/e2e/build-problems.spec.ts` has two tests, both gated on Emscripten like
  `test-run.spec.ts`:
  - a real editor build failing on a pin written on disk;
  - a refused run whose record is served in the page, since no valid project makes the real
    server refuse a run the canvas can draw.

  I checked both against the fixes: with `withoutBuildRepeats` and the `edited()` clearing
  disabled, both fail. Then I restored the code and rebuilt.
- Both build codes now live in `pipeline/diagnostics.ts`. The controller imports
  `TEST_RUN_BUILD_CODE` from there instead of defining its own.

## WO3 notes

- **Deviation: the departures fixture's `generated/` and `generated_editor/` were not
  deleted.** The work order said to stop and report if anything reads them, and something does:
  `cli/test/node/design/build/prepare-build.test.ts:114` ("generates into the cache, never
  into the project, and is stable") copies the fixture and reads
  `generated/ui_fonts.cpp` before and after the build, as a sentinel that the build leaves the
  project's own output alone. PROJECT.md's "No test reads them" is therefore wrong in this one
  place. I deleted them and wrote the guard test, saw that test fail, and then **reverted all of
  it**: the directories, the guard test, and an edit to `designer/e2e/support/design-session.ts`.
  The suggested fix, for the PA to rule on: have that test plant its own sentinel in the copy's
  `generated/`, or assert that the build creates no `generated/`. Then the deletion, the guard
  (`test/node/design/build/departures-project.test.ts`, which fails if either directory exists)
  and the now-dead `rmSync(generated_editor)` in `design-session.ts` can land as planned. Nothing
  else in `scripts/`, `.github/`, `wasm/`, `cli/` or `designer/` reads them:
  - `check-package.mjs` regenerates before reading;
  - `panel-layout.test.ts` and `pipeline-allocation.test.ts` skip `generated*`;
  - `wasm/CMakeLists.txt` and the wasm tests read `test/generated_fixture`.
- **The mechanisms are gone**: `beforeCanonical`, both `unlessPresent`s and
  `VocabularyElement.canonical`, from `project-vocabulary.ts`, `attributeSpellings()`,
  `form-model.ts` (`FieldCandidate.beforeCanonical`/`shadowed`, and the `!child.canonical`
  skip) and `form-edits.ts`. `form-edits.ts` steps 2–5 were renumbered 2–4.
  `FieldCandidate.canonical` stays: it marks the canonical *place*, which step 2 uses, and isn't
  the removed flag.
  - Test edits are removals only: the `unlessPresent` loop and a `child.canonical ||` filter in
    `cli/test/schema/project-vocabulary.test.ts`, and three `canonical` filters in
    `designer/test/unit/project-form-coverage.test.ts`.
  - The form's unit suite, `project-form.spec.ts` and `project-targets.spec.ts` (12 tests) pass
    unchanged.

### §5.2 recount, from `extern/u8g2` at `d66b49a` (`git describe --tags`: `2.36.18`)

Run from `extern/u8g2`. `H=cppsrc/U8g2lib.h`, and `CLS` is the class-name list:

```sh
H=cppsrc/U8g2lib.h
CLS() { grep -oE '^class U8G2_[A-Z0-9_]+ : public U8G2 \{' $H | sed -E 's/^class U8G2_([A-Z0-9_]+) : .*/\1/'; }
CLS | wc -l                                                    # 4913  constructor classes
CLS | grep -xE 'NULL|BITMAP'                                   # NULL, BITMAP: the two that are not displays
CLS | grep -vxE 'NULL|BITMAP' | cut -d_ -f1 | sort -u | wc -l   # 81    controllers
CLS | grep -vxE 'NULL|BITMAP' | sed -nE 's/^.*_[12F]_(.+)$/\1/p' | sort | uniq -c | sort -rn
    # 13 distinct bus suffixes: 4W_SW_SPI 588, 4W_HW_SPI 588, 2ND_4W_HW_SPI 588, 8080 561,
    # 6800 552, 3W_SW_SPI 441, 3W_HW_SPI 441, SW_I2C 360, HW_I2C 360, 2ND_HW_I2C 360,
    # SW_SPI 18, HW_SPI 18, 2ND_HW_SPI 18   (sum 4893)
CLS | grep -cE '_[12F]$'                                       # 18    with no bus suffix
    # SBN1661_122X32, SED1520_122X32, KS0108_128X64, KS0108_ERM19264, T7932_150X32,
    # HD44102_100X64, each _1 _2 _F   (4893 + 18 + 2 = 4913)
CLS | grep -cE '_F(_|$)'                                       # 1637  full-buffer (1631 with a bus suffix + 6 without)
```

Catalogue, from the worktree root:

```sh
node -e 'const c=require("./cli/src/data/catalogue.json");console.log(c.length,
  new Set(c.map(r=>r.controller)).size, new Set(c.map(r=>r.bus.raw)).size,
  c.filter(r=>r.bus.raw==="PARALLEL").map(r=>r.setup).join(" "))'
# 1637 81 14 U8G2_HD44102_100X64_F U8G2_KS0108_128X64_F U8G2_KS0108_ERM19264_F
#            U8G2_SBN1661_122X32_F U8G2_SED1520_122X32_F U8G2_T7932_150X32_F
```

`PARALLEL` comes from `cli/src/node/catalogue-builder.ts:570/588`, the builder's label for a
name with no bus suffix.

What changed in design_spec:

- **Line 167.** "76 controllers" becomes **81**, and "1631 full-buffer" becomes **1637**. The old
  figure counted `_F_` with a trailing underscore, so it missed the 6 bus-less `_F` classes.
  4913 and 13 were already right; the row now says 4913 includes `U8G2_NULL` and `U8G2_BITMAP`.
- **Line 403.** It now says "13 bus suffixes U8G2 writes", and `PARALLEL` is named as the
  builder's label for the bus-less classes, with its own entry in the `parallel` row.

No other figure was changed. I haven't recounted the 221 displays, the 206 structs across 90
drivers, or the 73 framebuffer sizes. As an observation only: the catalogue has 227 distinct
`driver` values, which may or may not be the same thing as "90 drivers" (driver files).

## WO4 notes

- **design_spec.**
  - §5.1 gains a paragraph: every attribute and child is checked against the vocabulary, an
    unknown one is an error, and a withheld project reports only its parse error.
  - **§15.3 had no table of codes to add rows to**, only a table of commands. I added a small
    table under its "stable machine code" point. It lists the four codes `u8g2gl.xml` reports
    and how each changed in 0.20.
- **ui_spec §13 (Problems).** Two sub-bullets: each fault is shown once, and a failed run's
  problems are about the text it ran.
- **ChangeLog.** `cli v0.20.xx`, 0.20.0. Neither foundation repository was touched.
- **CLI 0.20.0** in `cli/package.json` and `cli/package-lock.json`, via
  `npm version --no-git-tag-version`.
- **Readability review.** The house `readability-reviewer` agent covered the whole
  `cf82556..` diff and found no P1/P2. All four P3/P4 findings are fixed:
  - the parser's element-id union is tied to the vocabulary by a new test, and a comment says
    so;
  - an unknown child of `<output>` (already an error in code) is added to the docs and the
    ChangeLog, with a test;
  - a touched comment's "PR-04 WO5a" pointer is dropped;
  - a ragged wrap in the vocabulary header is re-flowed.

## Found outside scope (ruling 11: not fixed)

- **`globals.xml` and screen files ignore stray attributes**, as `u8g2gl.xml` did before this PR.
  Through the built CLI, `validate` on a copy of `valid-project` with `foo="1"` on `<globals>`,
  `bar="1"` on an `<int>` subject, `baz="1"` on an `<int>` const and `qux="1"` on `<screen>`
  reports none of them. The parser alone also ignores a stray attribute on `<builtin>` and
  `<xbm>`. Unknown *children* of `<globals>` and `<subjects>` are already errors. Only `<style>`
  (validator) and widget elements (Pass 4) report unknown attributes. The same vocabulary-driven
  check would cover `globals.xml`, since the vocabulary already lists its elements.
- **`prepare-build.test.ts`** depends on the committed fixture output (WO3 above).
