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

*Worker, 2026-11-24.* Provenance verified first, from the files (rule 00): this work order names
`e-3-sample-data`, and both PROJECT.md's and RESCOPE-E-3b.md's status logs record the owner's own
"Approve E-3b" (2026-11-24) with Q1a–Q4a.

## Commits per WO

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e3b/wo1-sample-sets` | `47297fe` set files, checks, server DELETE route, canvas |
| WO2 | `u8g2gl-e3b/wo2-sample-view` | `321dab0` Sample data view, typed grids, paste, subjects-table columns |
| WO3 | `u8g2gl-e3b/wo3-generated-sweep` | `263ad6f` `measureText`, generated and conventional sets, switcher, per-set test runs |
| WO4 | `u8g2gl-e3b/wo4-docs-review` | `99f4aad` docs, ChangeLog, CLI 0.26.0; `57df54f` readability-review fixes; `1989f05` two e2e test fixes (below); this report |

Nothing pushed, tagged or published.

## Suite results (one at a time)

| Suite | Baseline (`ca39244`) | Final |
|---|---|---|
| Framework Wasm build | ok | ok |
| Wasm tests | 6/6 | 7/7 (new `measure-text.test.mjs`, 14 checks) |
| Host C++ ctest | 540/540 | 540/540 |
| CLI vitest | 3233 | 3247 |
| CLI lint + tsc | clean | clean |
| Designer typecheck | clean | clean |
| Designer unit | 316 | 346 |
| e2e (`build:e2e`) | 159 passed, 2 failed; both passed alone (below) | first run 166 passed, 3 failed (below); after the fixes, the full suite 169/169 |
| Production (`build` + `test:e2e:production`) | 3 | 3 (also re-run after the final e2e fixes) |
| `refresh-goldens.mjs` | — | empty diff (`git status` clean) |
| `check-home-paths.mjs` | clean | clean |
| `check-package.mjs` | — | PASS at 0.26.0 (829 files, 15.9 MB) |

**Failures, each re-run alone:**
- Baseline: `performance.spec.ts:168` (a known flake) and `drag-performance.spec.ts:189`, both CPU-throttled latency tests. Both passed alone (p95s within budget). I read them as load on the machine.
- Final first run: `samples.spec.ts:154` and `:204` failed, a real defect in my own WO2 helper. WO3's *Create the conventional sets* button made `name: 'Create'` match two buttons. The locator is now `exact: true`.
- Final first run: `palette.spec.ts:238` failed alone too, so it was not load. The new toolbar switcher wraps the canvas toolbar one more line, and the fitted zoom fell to 1×. At 1× the `dropTag` helper's `Math.round` of a pixel centre (on x.5) landed on the next device pixel. I changed the helper to aim at the whole screen pixel nearest the centre inside the device pixel's span, the way the canvas's `floor((p − edge) / scale)` maps a point. No assertion changed. Every drop spec passed twice, then the full suite passed.

## The set-file format

`samples/<set>.json`, as RESCOPE-E-3b.md gives it. One real example, the departures fixture's `typical`, as the designer generates it (abridged to one row each):

```json
{
  "u8g2gl_samples": 1,
  "values": { "platform": "9", "system_time": 71700, "row0_time": "19:55", "row0_dest": "London Paddington",
              "row0_status": "On time", "box_fill": 8, "message_text": "" },
  "rows": {
    "screens/screen_departures.xml": {
      "row0":      [ { "cells": ["cells"] } ],
      "formation": [ { "number": 1, "class_type": "standard", "wheelchair": false, "bike": false, "loading_pct": 0 } ],
      "services":  [ { "cells": ["cells"] } ]
    }
  }
}
```

- **Problem codes.** `U8G2GL_SAMPLE_JSON` and `U8G2GL_SAMPLE_VERSION` are errors, and the set applies nothing. `SHAPE`, `UNKNOWN_SUBJECT`, `UNKNOWN_SCREEN`, `UNKNOWN_ELEMENT`, `NO_DATA`, `UNKNOWN_FIELD`, `VALUE` and `CAPACITY` are warnings, with only the value or row at fault left out.
- **Locations.** Each problem has the set file, the line and column (from a small located JSON reader), and the JSON path.
- **Where the code lives.** The types, reader and checks are `designer/src/samples/sample-set.ts`. The server needs none of them: it already treated `samples/` as project files.

## The staged C++ for one set, and how the index guard works

`u8g2gl_harness_samples.cpp`, written by `cli/src/node/design/test-run/sample-set-unit.ts` (from its unit test, departures):

```cpp
void ui_sample_set_0() {
    ui_set_platform("4");
    ui_set_box_fill(int32_t{3});
    ui_set_system_time(uint32_t{3600u});
    {  // departures.formation: carriages, 2 rows
        wd_train_formation* obj = static_cast<wd_train_formation*>(ui_screen_departures.objs[4]);
        obj->begin();
        obj->add_carriage(int32_t{1}, static_cast<const char*>("first"), true, false, int32_t{40});
        obj->add_carriage(int32_t{2}, static_cast<const char*>("standard"), false, true, int32_t{80});
        obj->commit();
    }
    {  // departures.services: rows, 2 rows
        wd_service_list* obj = static_cast<wd_service_list*>(ui_screen_departures.objs[5]);
        obj->begin();
        static const char* const row_0_cells[] = {"10:15", "Reading", "3", "On time"};
        obj->add_row(row_0_cells, size_t{4});
        obj->add_row(nullptr, size_t{0});
        obj->commit();
    }
}
```

The same unit defines three exports, `selectSampleSet()`, `getSampleSetCount()` and `getSampleSetName()`, and `u8g2gl_harness_apply_sample_set()`. That is a `switch` over the selected set, which does nothing when none is selected.

**The index guard.** `i` is the element's `object` index in the `ui_scene.json` generated in the same run. Before writing the unit, the stage reads each screen's generated `ui_screen_<s>_objs[]` table from the firmware `.cpp`. It requires entry `i` to be `&ui_obj_<element>`. A drift refuses the run with `U8G2GL_TEST_RUN_SAMPLES`, for example: `ui_screen_departures_objs[4] is &ui_obj_services, not &ui_obj_formation`.
- **Unit tests** (no toolchain): every departures collection resolves to its own table entry, and a table with two entries swapped is refused.
- **`sample-set-parity.test.ts`** (Emscripten): the departures fixture across its four conventional sets plus the initial values, 5 cases × 8 frames, 0 pixels differ. It also checks what each set draws, so two blank frames cannot pass by agreeing:
  - with the initial values and with `empty`, the service list and `row0` are unlit;
  - `typical` lights more than 20 service-list pixels;
  - `worst-case` lights more than `typical`, in the formation and the service list;
  - `longest-plausible` draws the same frame as `typical`.

## E-2g's first-use project

It does not exist. E-2g ("Designer first-use fixes") delivered designer fixes only: icons, explicit save and shape resizing. So that part was skipped, as the work order says. The four conventional sets of the departures fixture are committed instead, as CLI test-run fixtures (`cli/test/node/design/test-run/fixtures/departures-samples/`). They were generated by the designer's own generator with the real `measureText`. I did not put them in the departures fixture itself, because every e2e session copies that fixture, and a project that already has sets changes what the Sample data view offers.

## Found outside scope

- **CI** (`.github/workflows/ci.yml`, outside the Boundary) does not run the new `wasm/test/measure-text.test.mjs`. It needs one line beside `collection-data.test.mjs`. The new CLI tests run under `npm test` already.
- **`docs/ui_flows.md` §2.9**, the keyboard reference, does not list ⌥] / ⌥[. Only ui_spec §11 and design_spec §9 were in the WO4 docs Boundary. ui_flows §4.3 also still describes a `samples.xml`, which S1 superseded.
- **Two lines of `docs/ui_spec.md` outside §11** are slightly stale. §15's row (line ~722) and U-6's closing note (~737) still say "the format is E-3b's" and do not mention that `validate` ignores `samples/`. §6 may still describe Sample data as reserved.
- **Possible copyable code.** `cli/test/fixtures/departures-project/widgets/` is the fixture's copy. The foundation repository's own copy of the departures widgets is untouched (R10).

## Deviations, and why

1. **The server gained `DELETE /api/file`**, sample sets only and only at the expected version. The served file system (`cli/src/core/project-fs`, outside the Boundary) has no removal, and WO2's delete and rename need one. It lives in `design-server.ts` and `disk-project.ts`. The designer calls it through `ProjectDocuments.remove()`.
2. **The `u8g2gl_harness_apply_sample_set()` declaration is in `harness.cpp`, as `extern "C"`, not in `harness.h`.** `harness.h` is not in the Boundary, and the declaration is the one call's own. The header comment now says where it is defined.
3. **The firmware half takes each set from the request, as the canvas applied it** (checked values, rows by screen name), rather than re-reading `samples/`. So both halves get the same data, the checker is not duplicated in Node, and dirty set buffers are not staged. `checkStagedDocuments` accepts XML only, so the workspace now leaves sample sets out of `dirtyDocuments`; posting them would have failed every run.
4. **A run now covers every screen**, each with the initial values and with each set. The result keeps `screen` and `frames`, the requested screen with the initial values, so a client that predates sets still works. With no sets and one screen, it is exactly today's run.
5. **Rows map to an element's only `<data>`.** The format keys rows by element. An element with several `<data>` blocks is a `NO_DATA` problem rather than a guess.
6. **Generated sets.**
   - *One row:* strings are the field's name, so the row can be seen.
   - *Full, longest:* an unbounded collection gets 1 row, a subject with no `max_len` uses 32 (`U8G2GL_MAX_STRING_LEN`), and a string whose font cannot be measured uses `W`, which Output names.
   - *Widest glyph:* chosen from `!` to `~`, space left out because it draws nothing. A tie for the largest advance goes to `W`, since every glyph of a monospaced font ties.
   - *typical:* the initial values written out, plus one row per collection, so it draws something.
   - *Names:* the conventional sets are `longest-plausible` and `worst-case`, file names a shell needs no quoting for.
7. **The cycle shortcut is ⌥] / Alt+] and ⌥[ / Alt+[**, global in the capture phase like ⌘↵, matched by key code. The stops are *none* and then every set in name order. It is listed in the switcher's tooltip and in ui_spec §11.4.
8. **No autosave**, consistent with the XML. Set edits are dirty until saved, with ⌘S in the set's tab, ⌘⌥S, or the view's Save. Create, duplicate, rename and delete write to disk at once, because they are file operations the author asks for by name.
9. **The canvas link follows the selection while the view is open.** It opens and scrolls to the grid, and does not switch the sidebar to Sample data on every canvas click.
10. **Readability review:** no P1. Both P2s and every P3 are fixed (`57df54f`). Of the P4s, I changed "the owner's test case" and the PR-08 citation in the new unit. The `ruling N` / `Q1a` citations stay: ui_spec and design_spec cite the same rulings, so a reader can follow them.

