---
name: e-3b-wo1-wo4
description: Work Orders of E-3b — sample-set files in samples/, the Sample data view with typed grids and paste, generated sets, the set switcher and per-set test runs, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work: no PR-08 ingestion API, no new-project or `init` flow, no `apply_style()`
  fix, and nothing in either foundation repository.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-3-sample-data` ([PROJECT.md](PROJECT.md)). Its rulings 6–11 and 14 bind this
PR, as refined by [RESCOPE-E-3b.md](RESCOPE-E-3b.md) with **Q1a, Q2a, Q3a and Q4a**. Ruling 12's
"E-3b: a CLI patch bump" is superseded by Q4a: **CLI 0.26.0**. Read the whole of PROJECT.md and
RESCOPE-E-3b.md first. The owner's approval is recorded in both status logs (rule 00). Read
`.agents/rules/03-versioning.md` before WO1.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e3b/wo1-sample-sets` (based on main at `20978b3`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e3b/wo2-sample-view`, then `u8g2gl-e3b/wo3-generated-sweep`, then
  `u8g2gl-e3b/wo4-docs-review`.
- **Boundary**, which refines ruling 14 as RESCOPE-E-3b.md widens it:
  - `designer/**`;
  - `cli/src/node/design/**`, including the test-run staging under `test-run/`;
  - `wasm/bridge.cpp`, **only** for the `measureText` export (Q2a), and the Wasm build files only as
    far as that export needs (an exported-functions list, say);
  - `wasm/harness.cpp`, **only** for the one call that applies the selected set after `ui_init()`
    (Q1a);
  - Wasm tests under `wasm/test/`, and the CLI's test-run tests and fixtures;
  - sample-set fixtures (`samples/*.json`) in the departures fixture and the test projects, and in
    E-2g's first-use project if one exists in the tree;
  - the docs in WO4, and the CLI version in `cli/package.json` and its lockfile.
  - **Not touched:** `include/`, `src/`, the schema, `cli/src/core/**`, generator output and the
    goldens. `generate` must ignore `samples/`. If a step seems to need anything outside the
    Boundary, stop and report.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and don't run
  `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as you
  go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from the
  lockfiles. Any CLI `--out` path stays inside the worktree's `tmp/`.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`, and again after any `bridge.cpp` change.
  - The host C++ tests: `cmake -B build && cmake --build build -j8 && ctest --test-dir build
    --output-on-failure`.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - Known flakes, still to be reported if they fail: `performance.spec.ts:168` and
    `design-hidden.spec.ts:144` (e2e), and `generate-editor.test.ts` hitting vitest's 5 s limit
    under a full parallel run. The machine may be heavily loaded by other processes; re-run any
    failure alone before judging it.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ: check
  §2). No workspace pointers in source comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor, Finder or an OS
  file dialog on the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind them,
  never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Versions:** never tag, never publish. Bump only the CLI, to 0.26.0, in WO4. The runtime stays
  0.15.0 and the schema 0.7.

# WO1 — sample-set files (`u8g2gl-e3b/wo1-sample-sets`)

- [ ] **The format**, `samples/<set>.json`, exactly as RESCOPE-E-3b.md's design gives it:
      `u8g2gl_samples: 1`; `values` keyed by subject name; `rows` keyed by screen file (project-relative,
      forward slashes) then element name; each row an object keyed by the manifest's `<field>` names,
      a `repeat` field as an array. Put the types and the parser in one designer module, shared with
      the server if the server needs them.
- [ ] **Checking against the project.** Each of these is a Problem naming the set file and the JSON
      path (`rows["screens/departures.xml"].services[3].cells[1]`, say):
      - an unknown version, or JSON that doesn't parse (with the line and column);
      - an unknown subject, screen or element, or an element with no `<data>`;
      - an unknown field, or a wrong type;
      - a value outside `min`/`max`, or not in `values`;
      - a string over its `max_len` (resolved from the instance's props where the manifest names a
        `<prop>`), counted in characters;
      - an array longer than its `repeat`;
      - rows beyond the instance's `capacity`.
      A set with problems still applies the parts that check clean, and the canvas never crashes on a
      bad set.
- [ ] **Design server:** reads, writes and watches `samples/*.json` as it does the project's other
      files, through `disk-project.ts` and `project-watcher.ts`, with the same path and session-token
      rules. An external edit to a set reaches the designer like an external XML edit. `generate`
      and `validate` ignore `samples/` (test it through the built CLI).
- [ ] **Set files are project documents** in the designer, saved and undone through the same model as
      the XML files, one undo step per edit. A set edit never touches project XML.
- [ ] **Active set:** per-browser view state, as the other view state is. No active set means today's
      behaviour.
- [ ] **Canvas:** the live loop (`live-pipeline.ts`) applies the active set's `values` over the initial
      values through `applySampleData()`, and the active set's rows for the current screen through
      `applyCollectionData()`, after each `applyScene`. A subject the set leaves out keeps its initial
      value.
- [ ] **Tests:** unit tests for the parser and every check above; server tests for read, write, watch
      and the path rules; one e2e: a set file on disk fills the formation and the service list on the
      canvas, and the XML on disk is unchanged.

# WO2 — the Sample data view (`u8g2gl-e3b/wo2-sample-view`)

- [ ] **Enable the view** reserved in `activity-views.ts` (`samples`).
- [ ] **Set management:** pick the active set; create, duplicate, rename and delete sets. Delete asks
      first, in the designer's own UI, never an OS dialog.
- [ ] **Scalars:** a table, one row per subject and one column per set. A value a set leaves out shows
      as inherited from the initial value, and editing it writes it into that set.
- [ ] **Collections:** every collection instance on every screen as a typed grid (ruling 7):
      checkboxes for bools, dropdowns for enums, numbers held to `min`/`max`, strings counted against
      `max_len`, a `repeat` field as its cells. Add, remove and reorder rows, with the capacity shown
      (`8 / 12`). Each edit is one undo step.
- [ ] **Paste** into a grid: a JSON array of row objects, or CSV with a header row. Fields map by name;
      every rejected value is reported by row and field, and the accepted rows still land.
- [ ] **Canvas link:** selecting a collection element on the canvas opens its grid in the view.
- [ ] **Subjects table** (ruling 10, extending E-2k3's): one sample column per set beside "Initial
      value", which stays labelled as compiled in. Inherited values show as inherited.
- [ ] **Tests:** unit tests for the paste mapping (JSON and CSV, including quoted commas and rejected
      values) and the grid's value rules; e2e: fill the formation grid and see the canvas change; paste
      CSV into the service list; open a grid from the canvas; the subjects table's set columns; the
      XML on disk untouched.

# WO3 — generated sets, the switcher and per-set test runs (`u8g2gl-e3b/wo3-generated-sweep`)

- [ ] **`measureText(font, text)`** (Q2a) in `wasm/bridge.cpp`: returns the string's width in pixels
      using the real renderer, editor target only. Wasm test against known U8G2 widths.
- [ ] **Generated sets** (ruling 8), on request, written as ordinary set files:
      - **empty:** no rows, empty strings;
      - **one:** a single row per collection;
      - **full, longest:** every collection at capacity, every string at `max_len` made of the
        printable ASCII glyph with the largest advance in the font that draws it (found with
        `measureText`).
      Numbers take a valid value (`min`, or 0 within range); enums take their first value.
- [ ] **Conventional sets** (Q3a): when `samples/` is empty, the Sample data view offers one action
      creating **typical** (from the initial values), **empty**, **longest plausible** (a copy of
      typical, for the author to lengthen) and **worst case** (the *full, longest* set). If E-2g's
      first-use project exists in the tree, ship the four as files in it; if it doesn't, say so in
      the report and skip that part.
- [ ] **Set switcher** (ruling 9) on the canvas toolbar, with keyboard cycling through the sets.
      Follow the toolbar's and the keyboard map's existing conventions, and add the shortcut wherever
      the designer lists its shortcuts.
- [ ] **Per-set test runs** (Q1a):
      - the test-run stage writes one C++ file per run, holding one function per set. Scalars go
        through `ui_set_<subject>(value)`. Each collection is reached through `ui_screen_<s>.objs[i]`,
        its document-order index taken from the same resolved project the generator uses, cast to its
        class, then filled with `begin()`, the declared access method per row and `commit()`;
      - `wasm/harness.cpp` gains one call, after `ui_init()` and before the first frame, to the
        selected set's function; with no set, behaviour is exactly today's;
      - the editor half applies the same set through `applySampleData()` and `applyCollectionData()`;
      - test runs report parity **per set and per screen**, in the existing test-run UI and bug
        report;
      - **guard:** a test proves each staged `objs[i]` names the element it claims to, so an index
        drift fails loudly instead of filling the wrong widget.
- [ ] **Tests:** unit tests for the generated sets and the staged C++; a Wasm or CLI test-run parity
      test across the four conventional sets of the departures fixture, which also checks that
      particular pixels are lit, so two blank frames can't count as agreeing; e2e: sweep the sets from
      the keyboard; a test run across every set reports parity for each.

# WO4 — docs and review (`u8g2gl-e3b/wo4-docs-review`)

- [ ] **ui_spec §11:** the file format, its checks, the Sample data view, generated and conventional
      sets, the switcher and its shortcut, and the subjects table's set columns.
- [ ] **design_spec §9:** the per-set test run (the staged set functions, the `objs[i]` route and its
      guard), with PR-08 still owning the firmware ingestion API. Note that `generate` ignores
      `samples/`.
- [ ] **`ChangeLog`:** `cli v0.26.0`.
- [ ] **CLI 0.26.0** in `cli/package.json` and the lockfile. Confirm the goldens don't move (they are
      stamped `0.0.0-golden`).
- [ ] Run the readability-reviewer over every changed file, and fix what it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - host C++ build and ctest;
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff after your commits;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.26.0).
- [ ] **Completion report** appended below:
      - commits per WO;
      - suite results, with baselines;
      - the final set-file format, with one real example;
      - the staged C++ for one set, and how the index guard works;
      - whether E-2g's first-use project existed and got the four sets;
      - anything found outside scope;
      - any deviation, and why.

# Completion report

*(worker: append here)*
