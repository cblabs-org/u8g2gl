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

*(worker: append here)*
