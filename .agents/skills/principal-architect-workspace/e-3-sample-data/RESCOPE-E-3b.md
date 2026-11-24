# E-3b: sample sets in the designer (refreshed)

**Status:** E-3b was approved in principle as part of E-3 ("Approve E-3", 2026-11-17: rulings 6–11, with "E-3b gets its work orders when it starts"). This is its refresh against today's `main`. It names four points where the approved rulings needed a decision, because the code now shows something the plan didn't know. **Approved by the owner on 2026-11-24, with Q1a, Q2a, Q3a and Q4a** (status log below).

**Base:** `main` at `20978b3`, the #65 merge (schema 0.7, runtime 0.15.0, CLI 0.25.1).
**Parent:** `e-3-sample-data/PROJECT.md`. Its rulings 6–11 and 14 bind, except where this file refines them.

## What's there today (checked at `20978b3`)

| # | Topic | Today |
|---|---|---|
| 1 | Canvas values | `live-pipeline.ts` `declaredValues()` still sends only the initial values to `applySampleData()`. Nothing calls `applyCollectionData()` outside tests, so collection widgets render blank in the designer. |
| 2 | Sample files | Nothing reads or writes `samples/`. The design server's watcher and `disk-project.ts` know only the project XML, manifests and assets. |
| 3 | Sample data view | Reserved in `activity-views.ts` (`samples`, `ready: false`). |
| 4 | Subjects table | E-2k3's table is in place, with the "Initial value" column labelled as compiled in. This was the dependency E-3b waited for. |
| 5 | Test runs | `wasm/harness.cpp` boots the generated **firmware** code unmodified and compares its frames with the editor's, **at the initial values only**. It has no way to apply a sample set. |
| 6 | Firmware access to a collection | Generated objects are `static` in each screen's `.cpp` (`static wd_service_list ui_obj_services;`). There is no generated handle to them: the firmware ingestion API is PR-08's (design_spec §9.2). The only public route is the screen's `objs` array, in document order. |
| 7 | Text measurement | The bridge exports no way to measure a string. The *full, longest* set (ruling 8) needs the widest glyph of each font. |
| 8 | Project creation | No `init` command and no new-project flow exist. Ruling 6 says a new project is offered the conventional sets. |

## The decisions

**Q1. How a test run applies a set on the firmware side** (ruling 9: "test runs check every set").

The harness has to fill the generated firmware objects the way application code would. That means calling the subject setters, and calling each collection widget's own `begin()`, its declared access method per row, then `commit()`.
- **Q1a (recommended): the test-run stage writes one small C++ file per run, holding one function per set.**
  - **Scalars:** `ui_set_<subject>(value)`.
  - **Collections:** reach the widget through `ui_screen_<s>.objs[i]` (its document-order index, which the stage takes from the same resolved project the generator uses), cast it to its class, then `begin()`, the access method per row, and `commit()`.
  - **Wiring:** the harness gains one call, made after `ui_init()` and before the first frame, to the selected set's function.
  - **Why:** the firmware half then uses only the public calls an application uses. Parity stays meaningful, because the editor fills through its registry thunk and the firmware through the widget's own methods.
  - **Guard:** a test proves each index names the element it claims to.
  - **Boundary:** this adds `wasm/harness.cpp` and the test-run C++ staging. Firmware and generated output are unchanged.
- **Q1b:** link the editor registry into the harness and reuse the fill thunk. Smaller, but the two halves of the check would then share the fill path, so a fill bug could hide.
- **Q1c:** test runs keep checking the initial values only, and per-set checking waits for PR-08's generated ingestion API. That reverses ruling 9.

**Q2. Measuring the widest glyph** (ruling 8's *full, longest* set).
- **Q2a (recommended):** a bridge export `measureText(font, text)`, using the real renderer, editor target only. The generator picks, per font, the printable ASCII glyph with the largest advance and repeats it to `max_len`. **Boundary:** `wasm/bridge.cpp`, with the framework Wasm rebuilt. No runtime version change, because the runtime library doesn't change.
- **Q2b:** read glyph widths from the U8G2 font bytes in TypeScript. That puts a second font parser in the designer.

**Q3. Where the conventional sets are offered** (ruling 6). No new-project flow exists.
- **Q3a (recommended):** when `samples/` is empty, the Sample data view offers one action that creates **typical**, **empty**, **longest plausible** and **worst case**.
  - **typical** starts from the initial values.
  - **empty** and **worst case** are generated (the *empty* and *full, longest* sets of ruling 8).
  - **longest plausible** starts as a copy of *typical*, for the author to lengthen.
  - E-2g's first-use project gets the four as files.
- **Q3b:** leave this out until a new-project flow exists.

**Q4. The CLI version.** Ruling 12 said E-3b takes a CLI patch bump. Since then, E-2k3 set the precedent that a new designer capability takes a **minor**, and E-3b adds a file format, a view and per-set test runs.
- **Q4a (recommended): CLI 0.26.0.**
- **Q4b:** 0.25.2, as ruled.

The runtime stays 0.15.0 and the schema 0.7. The goldens don't move.

## The design (rulings 6–11, made concrete)

**The set file, `samples/<set>.json`:**

```json
{
  "u8g2gl_samples": 1,
  "values": { "station": "London Paddington", "wifi_up": true, "delay_min": 4 },
  "rows": {
    "screens/departures.xml": {
      "services":  [ { "cells": ["10:15", "Reading", "3", "On time"] } ],
      "formation": [ { "number": 1, "class_type": "first", "wheelchair": false, "bike": false, "loading_pct": 40 } ]
    }
  }
}
```

- **Shape:**
  - `values` is keyed by subject name.
  - `rows` is keyed by screen file, then element name, as ruling 6 says.
  - Field names are the manifest's `<field>` names, and a `repeat` field is an array.
- **What it's checked against:** the project. An unknown subject, screen or element, a wrong type, a value out of `min`/`max`/`values`, a string over `max_len`, an array over `repeat`, or rows over capacity each show in Problems, with the file and the JSON path.
- **What is never touched:** a set is never compiled, `generate` ignores `samples/`, and a set edit never touches project XML.
- **Missing values:** a subject a set leaves out inherits its initial value, and the UI says it's inherited.
- **Which set is active:** per-browser view state.

**The canvas.**
- **Scalars:** the live loop applies the active set's values over the initial values.
- **Collections:** it applies the active set's rows for the current screen, after each `applyScene`, through `applyCollectionData()`.
- **No set active:** the canvas behaves as today.

**Editing.** Set files are project documents. Their edits go through the same save and undo model as the XML files, one undo step per edit.

**Sample data view** (ruling 7):
- managing sets, and picking the active one;
- the scalar table, one column per set;
- a typed grid per collection instance, with its capacity shown;
- paste of a JSON array or CSV, every rejected value named by row and field;
- selecting a collection element on the canvas opens its grid.

**Generated sets** (ruling 8): *empty*, *one* and *full, longest*, each written as an ordinary set file.

**The set switcher** (ruling 9): on the canvas toolbar, cycled by keyboard. Test runs report parity per set, and per screen.

**Subjects table** (ruling 10): one sample column per set, beside "Initial value". An inherited value shows as inherited.

## Work orders (one branch each, stacked from `main`)

**WO1, sample-set files** (`u8g2gl-e3b/wo1-sample-sets`)
- **Format and checking:** the file format, its checking against the project, and Problems with JSON paths.
- **Design server:** reads, writes and watches `samples/`.
- **Canvas:** applies the active set's scalars and rows.
- **Tests:** unit and server tests.

**WO2, the view** (`u8g2gl-e3b/wo2-sample-view`)
- **View:** the Sample data view, with set management, the scalar table, typed grids and paste.
- **Canvas link:** selecting a collection on the canvas opens its grid.
- **Subjects table:** its per-set columns.
- **Tests:** unit and e2e.

**WO3, generated sets and sweeps** (`u8g2gl-e3b/wo3-generated-sweep`)
- **Generated sets:** *empty*, *one* and *full, longest*, using `measureText` (Q2), and the conventional sets offered (Q3).
- **Switching:** the toolbar switcher and its keyboard cycling.
- **Per-set test runs (Q1):** the staged set functions and the harness hook, reported per set.
- **Tests:** Wasm parity across sets, and e2e.

**WO4, docs and review** (`u8g2gl-e3b/wo4-docs-review`)
- **Docs:** ui_spec §11, with the file format, the view and the switcher; design_spec §9 for the per-set test run; the ChangeLog.
- **Version:** the CLI version (Q4).

**Boundary:**
- **Code:** `designer/**`, `cli/src/node/design/**`, `wasm/bridge.cpp` (Q2a only), and `wasm/harness.cpp` with the test-run staging (Q1a only).
- **Fixtures:** sample-set fixtures in the demo and test projects.
- **Docs and version:** the docs above and the CLI version.
- **Not touched:** `include/`, `src/`, the schema, the generator's output and the goldens.

## Verification (PA)
- **Suites:** every suite, run one at a time.
- **Built CLI:** the goldens are unchanged, and `generate` ignores `samples/`.
- **Browser,** on a copy of the departures demo:
  - fill the formation grid and watch the canvas;
  - paste CSV into the service list;
  - sweep all four conventional sets from the keyboard;
  - run a test run across every set, with parity reported per set;
  - check that the subjects table shows a column per set;
  - check that the XML on disk is untouched by set edits.

## Status log

| Date | Event |
|---|---|
| 2026-11-23 | PA refreshed E-3b against `main` at `20978b3`, after #65 merged. Findings 1–8 are above. Q1–Q4 await the owner. Nothing is implemented. |
| 2026-11-24 | **Approved by the owner.** Asked "Approve E-3b with Q1a–Q4a?", the owner replied, in their own words: **"Approve E-3b"**. That approves this refresh with Q1a, Q2a, Q3a and Q4a, its design, the four work orders and the Boundary. The PA branched `u8g2gl-e3b/wo1-sample-sets` from `origin/main` @ `20978b3` in `../U8G2GL-e4`. |
| 2026-11-24 | **E-3b done** by the worker (`47297fe` WO1, `321dab0` WO2, `263ad6f` WO3, `99f4aad`/`57df54f`/`1989f05` WO4, `159794d` report), after one usage-limit interruption; the PA snapshotted the uncommitted diff and resumed the same worker. Its deviations, all inside the Boundary, were accepted: a sample-only `DELETE /api/file` route; the harness hook declared in `harness.cpp`; the firmware half taking each set from the request; a test run covering every screen; an element with several `<data>` blocks reported, not guessed. E-2g's first-use project does not exist, so the four sets ship as CLI test-run fixtures. |
| 2026-11-24 | **E-3b verified by the PA** on `159794d`, suites one at a time: Wasm 7/7 (`measure-text` new); host ctest 540/540; CLI 3247; lint and designer typecheck clean; designer unit 346; e2e 169/169; production 3; goldens unchanged; check-package PASS at 0.26.0; home-path guard clean. Built CLI 0.26.0: with four sets and a broken JSON file in `samples/`, `validate` is clean and `generate` is byte-identical to a run without them. Browser, on a copy of the departures fixture: the conventional sets were created from the empty view; filling the formation grid changed the canvas live; CSV pasted into the service list landed two rows and refused one by row and field (`row 3, cells[1]: 45 characters, over the max_len of 24`), keeping a quoted comma; ⌥] / ⌥[ cycled none and all four sets; *worst case* drew 12 carriages and widest-glyph strings; a test run reported parity for all 5 cases; selecting the formation on the canvas opened its grid; the subjects table showed one column per set; the screen XML on disk was unchanged throughout. **PA fix** `5bd476d`: CI runs `measure-text.test.mjs`; stale sample-data lines in ui_spec (§6, §6.4, §15, U-6) and ui_flows (§4.3, §2.9). **Noted, not fixed:** a number cell typed out of range (9090 into `loading_pct`, max 100) keeps showing the typed text with no mark, while the set holds the last valid value. |
