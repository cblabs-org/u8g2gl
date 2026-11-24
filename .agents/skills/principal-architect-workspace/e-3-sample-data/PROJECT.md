# E-3: Sample data, including collections

**Status: APPROVED by the owner 2026-11-17 ("Approve E-3"), as refreshed. E-3a first.**

**Base:** `origin/main` @ `a67baae` (after #61). CLI 0.22.0, runtime 0.13.0, schema 0.7.
**Shape:** two PRs, E-3a (the data shape, through to the bridge) and E-3b (sample sets in the
designer).

**Order (refreshed, O1):** **E-3a now**, then E-2k2 (re-scoped), then E-2k3, then E-3b.
- E-3a needs E-2k1's vocabulary descriptor, which merged in #56.
- The draft put E-3a after E-2k2 only because both edit `wasm/bridge.cpp`. That's file
  contention, not a dependency: E-3a adds `applyCollectionData()`, and E-2k2 adds font and image
  injection. Whichever runs second rebases.
- E-2k2 needs re-scoping before it runs, because E-6 (#60) and E-7 (#61) delivered part of its
  approved scope: the font browser with samples, filters and suffix explanations, and BDF
  import. What remains is mainly the bridge injection (no rebuild for a font or image change),
  real-renderer samples, the range presets and warning, and the fonts and images sections'
  usage counts.
- E-3b still waits for E-2k3, because it adds sample columns to E-2k3's subjects table.

## Owner direction (2026-11-14, in their own words)

> "We actually need a much more comprehensive approach to sample data, the test case is
> populating the widgets for the train formation or the service lists for example."

The owner asked for this plan to be drafted alongside E-2k: "Draft both plans". The owner's
discoverability principle (E-2k) applies here too: every field of every collection must be
editable in the UI.

## Findings (confirmed 2026-11-14 at `50a0cba`)

| # | Topic | Today |
|---|---|---|
| 1 | Scalar values on the canvas | `live-pipeline.ts` `declaredValues()` sends each subject's `value=` to the bridge's `applySampleData()`. So the only "sample data" is the **initial value compiled into the firmware**. In the demo, `row0_dest="London Paddington"` ships to the device |
| 2 | Where sample sets live | Undecided: ui_spec **U-6**. E-D leaned towards `samples/*.json`, outside the schema |
| 3 | Collection data | Hand-written C++ only. `wd_train_formation.hpp`: `begin()`, `add_carriage(uint8_t number, const char* class_type, bool wheelchair, bool bike, uint8_t loading_pct)`, `commit()`. `wd_service_list.hpp`: `add_row(const char* const* cells, size_t n)`. The manifests declare capacities (`max_carriages`, `max_rows` …) but **nothing about the shape of a row** |
| 4 | Editor fill path | None. E-D put a requirement on PR-08 (implementation_plan §5): a declared-capacity collection must be "fillable by name through the editor registry". LOOP-BUDGET F7 measured both of the departures board's service lists as blank in the designer |
| 5 | Static `<element>` children | The manifest schema already has `<element name access>` with typed `<arg>`s (design_spec §6.5's `<column width align>` example). `parse-widget-manifest.ts` parses it, but **no validator or generator code uses it**. The demo's service list sets its columns in C++ (`add_column(width, align)`), so they cannot be seen or edited in the designer |
| 6 | Registry | `u8g2gl_editor_registry`/`u8g2gl_editor_class` are runtime headers (`include/u8g2gl/u8g2gl_editor.h`), compiled only into the editor target ([UD-4]) |
| 7 | Test runs | Compare the editor's frames with the real build's, for the current values only |

## The model

There are **three kinds of value**, and the UI never blurs them:

| | **Initial value** | **Sample value** | **Collection sample rows** |
|---|---|---|---|
| Lives in | `globals.xml` `value=` | A sample set | A sample set |
| Compiled into the firmware | **Yes**: the boot frame | Never | Never |
| Scope | Per subject | Per subject, per set | Per collection widget instance (screen + element name), per set |
| Edited in | Subjects table, "Initial value" | Subjects table, one column per set; Sample data view | Sample data view, a typed grid per instance |

A set may leave a subject out. Then the initial value applies, and the UI shows that it was
inherited. If there is neither, the element shows the visible placeholder ui_spec §11 already
requires.

## Owner decisions (S1–S4 approved 2026-11-15, as recommended)

**O2, schema version (refreshed).** S2's "0.6 → 0.7" predates E-4b, which took 0.7. 0.7 has
not been released: there's no `u8g2gl` on npm, no CLI or runtime tag, and no GitHub release
(checked 2026-11-15). So, as E-4's O4 already agreed, E-3a **adds `<data>` to 0.7**. It's an
additive change to an unreleased version: no schema bump, and no runtime schema-minor change.
If 0.7 is released before E-3a merges, E-3a takes 0.8 instead.

| # | Question | PA recommendation |
|---|---|---|
| **S1** | **Where sample sets live (closes U-6)** | `samples/<set>.json` in the project: shared through source control, read by the designer and by test runs, **ignored by `generate`**, outside the schema. JSON, because it is data, never compiled, and what a live feed produces. The active set is per-browser view state |
| **S2** | **Widgets declare their runtime data shape in the manifest.** A new `<data>` block in `<api>`, sketched below. **Schema 0.6 → 0.7**, additive: 0.6 documents stay valid. Your call per rule 03 | Yes |
| **S3** | **What the generator does with `<data>`** | It emits only the **editor fill thunk**: the registry entry that takes rows by name and calls the widget's own `begin()`, the declared access method per row, then `commit()`. A compile-time check proves the declared fields match the method's signature. The widget keeps its hand-written ingestion API. Generating that API for the firmware (design_spec §9.2's `ui_departures_rows`) stays PR-08's |
| **S4** | **The parsed-but-unused static `<element>` vocabulary (finding 5)** | Implement it in E-3a, so the service list's columns move from C++ into the screen XML, where the designer can show and edit them. That follows from the discoverability principle, and the sample rows render against those columns. The alternative is a separate project |

### S2 sketch (the shape to be finalised in E-3a WO1)

```xml
<!-- wd_train_formation.xml -->
<api ...>
    <prop name="max_carriages" type="int" default="12" help="Carriage capacity." />
    <data name="carriages" access="add_carriage" capacity="max_carriages"
          help="The train's carriages, front first.">
        <field name="number"      type="int"  min="1" max="99" />
        <field name="class_type"  type="enum" values="standard,first" />
        <field name="wheelchair"  type="bool" />
        <field name="bike"        type="bool" />
        <field name="loading_pct" type="int"  min="0" max="100" help="How full, in percent." />
    </data>
</api>

<!-- wd_service_list.xml -->
<data name="rows" access="add_row" capacity="max_rows" help="One departure per row.">
    <field name="cells" type="string" repeat="max_cols" max_len="max_cell_chars" />
</data>
```

- `capacity`, `repeat` and `max_len` may name a `<prop>`, so the declared capacity is the one
  the RAM budget already reports.
- `begin()` and `commit()` are the §9.2 contract and are not declared.
- Field types are the existing `PropType`s plus `min`, `max` and `values`, all validated.

## PA rulings (binding once approved)

### E-3a: the data shape, through to the bridge

1. **Schema, parser, validator.**
   - Implement `<data>` and `<field>` (S2).
   - Errors: an unknown field type; a `capacity`, `repeat` or `max_len` that names no `<prop>`
     or names a non-int one; and a `<data>` on an element with no class.
   - `<data>` is part of schema 0.7 (O2), gated by a `DATA_SINCE = '0.7'` as the mirrors are,
     so a manifest at 0.6 that writes one is told to declare 0.7. 0.4–0.6 stay accepted.
   - Vocabulary descriptor entries, so E-2k's coverage test covers the new vocabulary.
2. **Static `<element>` children (S4).** Validate `<column>`-style children in screen XML
   against the manifest's `<element>`/`<arg>`s. The generator emits the calls to the declared
   access method at construction, and the property panel lists the children as an editable
   table.
3. **Editor fill thunk (S3).**
   - `u8g2gl_editor_class` gains an optional fill entry. It is editor target only, so the
     firmware pays nothing ([UD-4]).
   - `editor-registry.ts` emits it from `<data>`.
   - `bridge.cpp` gains `applyCollectionData(json)`, taking `{ "<element name>": [ rows ] }`.
     Rows beyond the declared capacity are refused, naming the element and the capacity, just
     as `add_row` returns `false` on the device.
   - The bridge's existing sample values and its new rows are applied **after** every
     `applyScene` by the live loop. A test run applies the set under test (ruling 9).
4. **The demo's widgets declare their data**, so the owner's test case works end to end: the
   formation and the service list are filled from a sample set, and the service list's
   columns come from XML.
5. **Tests.**
   - **CLI:** the parser and validator rules, and the generator emission (goldens move, and
     the version bumps below cover it).
   - **Wasm:** a formation and a service list filled by name render as a firmware build filled
     through the same methods (parity). Over-capacity is refused.

### E-3b: sample sets in the designer

6. **Sample set files (S1).**
   - The design server reads and writes `samples/*.json`, watched like the rest of the project.
   - The format holds a version, the scalar values by subject name, and the rows by
     screen-file and element name. It is validated against the project, so a set naming an
     unknown subject or element, or a row that breaks its field types, shows in Problems, with
     the file and the JSON path.
   - A new project is offered the conventional sets: **typical**, **empty**, **longest
     plausible**, **worst case** (ui_spec §11).
7. **Sample data view** (activity bar, enabled by this PR):
   - Pick the active set; create, duplicate, rename and delete sets.
   - The scalars, as a table, one column per set.
   - **Every collection instance on every screen** as a typed grid: checkboxes for bools,
     dropdowns for enums, numbers held to `min`/`max`, and strings counted against `max_len`.
     Add, remove and reorder rows, with the capacity shown (`8 / 12`).
   - **Paste** a JSON array or CSV with a header row into a grid. Fields are mapped by name,
     and every rejected value is reported by row and field. That is the route from a real
     departures feed into the designer.
   - Selecting a collection element on the canvas opens its grid.
8. **Generated sets from declarations.** Because capacities and `max_len` are declared, the
   designer can generate, on request, rather than make the author type:
   - **Empty:** no rows, empty strings.
   - **One:** a single row.
   - **Full, longest:** every collection at capacity, every string at `max_len` using the
     widest glyph of the font that draws it.
   They are written as ordinary sets, so they can be edited afterwards.
9. **Switching and checking.**
   - A set switcher on the canvas toolbar, with keyboard cycling (ui_spec §11), so one layout
     can be swept against every set in seconds.
   - **Test runs check every set**, reporting parity per set, not only for the current one.
10. **Subjects table (extends E-2k3's).** One sample column per set, beside the initial
    value. The initial-value column stays labelled as compiled in (the table above).
11. **Tests.**
    - **Unit:** the set format and its validation, paste mapping, and the generated sets.
    - **e2e:** fill the formation grid and see the canvas change; paste CSV into the service
      list; switch sets; and a test run across all sets reports parity for each.
      Sample-set edits never touch the project's XML.

### Both PRs

12. **Versions.**
    - Schema stays **0.7**, with `<data>` added to it (O2).
    - Runtime **0.13.0 → 0.14.0**: the editor registry gains a field, so a minor bump. Its
      schema minor stays 7.
    - CLI **0.22.0 → 0.23.0** for E-3a: new generator output, and the runtime bump forces a
      bump anyway (rule 03).
    - E-3b: a CLI patch bump.
    - Never tag, never publish.
13. **Docs.**
    - design_spec: §6.5 (the `<data>` block, and `<element>` made real), §9 (the editor fill
      path), §13 (the registry).
    - ui_spec: §11, rewritten around the three-kind table; U-6 closed.
    - implementation_plan: PR-08's E-D requirement marked delivered by E-3a.
    - ChangeLog.
14. **Boundary** (refined in each PR's WORKORDERS.md):
    - **E-3a:** `cli/src/core/{schema,parser,validator,generator}/**`; `include/u8g2gl/u8g2gl_editor.h`
      and `src/u8g2gl_editor.cpp`; `wasm/**`; the demo widgets' manifests and screens; tests
      and goldens; the docs above; the versions.
    - **E-3b:** `designer/**`; `cli/src/node/design/**`; docs; the version.
    - **Neither PR changes firmware behaviour.** The new runtime surface compiles only into the
      editor target.

## Decomposition

| PR | WO | Branch | Topic |
|---|---|---|---|
| E-3a | WO1 | `u8g2gl-e3a/wo1-data-schema` | `<data>`/`<field>`, schema 0.7, validator, descriptor |
| | WO2 | `u8g2gl-e3a/wo2-static-elements` | `<element>` children validated, emitted, and listed in the panel |
| | WO3 | `u8g2gl-e3a/wo3-fill-thunk` | Registry field, generator, `applyCollectionData`, Wasm parity, demo widgets |
| | WO4 | `u8g2gl-e3a/wo4-docs-review` | Docs, versions, review |
| E-3b | WO1 | `u8g2gl-e3b/wo1-sample-sets` | Set files, server, validation, conventional sets |
| | WO2 | `u8g2gl-e3b/wo2-sample-view` | Sample data view, typed grids, paste |
| | WO3 | `u8g2gl-e3b/wo3-generated-sweep` | Generated sets, switcher, test runs across sets, subjects columns |
| | WO4 | `u8g2gl-e3b/wo4-docs-review` | Docs, version, review |

## Status log

| Date | Entry |
|---|---|
| 2026-11-14 | PA drafted this plan from the owner's direction above. **Not approved; S1–S4 open.** No branch, worktree or code change exists. |
| 2026-11-15 | **S1–S4 approved by the owner.** After the PA's summary of S1–S4 and a note that the order and schema version needed refreshing, the owner replied, in their own words: **"approved"**. The PA reads this as S1–S4 approved as recommended, not as approval of the refreshed order and versions, which were open questions. |
| 2026-11-15 | PA refreshed the plan against main @ `a67baae`. Findings 1–7 re-checked and still true. 0.7 confirmed unreleased (O2). Order revised (O1), because E-6/E-7 overtook part of E-2k2. Versions moved on: runtime 0.13.0 → 0.14.0, CLI 0.22.0 → 0.23.0. **Awaiting approval of the refreshed plan.** |
| 2026-11-17 | **Approved by the owner.** Asked "Do you approve E-3 as refreshed, starting with E-3a?", the owner replied, in their own words: **"Approve E-3"**. That approves the refreshed plan: rulings 1–14, S1–S4 as recommended, O1 (E-3a now, then E-2k2 re-scoped, E-2k3, E-3b) and O2 (`<data>` added to unreleased schema 0.7; runtime 0.14.0; CLI 0.23.0 for E-3a). 0.7 re-checked unreleased the same day. PA branched `u8g2gl-e3a/wo1-data-schema` from `origin/main` @ `a67baae` in `../U8G2GL-e4`. E-3b gets its work orders when it starts. |
| 2026-11-17 | **E-3a WO1 done** (`340fc4b`); the worker stopped at WO2, correctly, because WO2 can't be built inside its Boundary. The PA confirmed the blocker in source: `parse-screen.ts` parses every child as an element (an unnamed `<column>`, as in design_spec §5.4's own example, is a missing-name error, and the designer writes `name="column_0"` into it); the resolver (`expand.ts`) and the realiser treat every child as an element; and `add_row` keeps `max_cell_chars - 1` characters. |
| 2026-11-17 | **W1 and W2 approved by the owner.** Asked "Do you approve W1 and W2 as recommended?", the owner replied, in their own words: **"Approve W1 and W2"**. **W1:** static children become their own child kind. The screen parser takes the manifests' child-element names as a parse option, so a `<column>` is never an element and never needs a name. E-3a's Boundary widens to `cli/src/node/{load-project,fix-names}.ts`, `cli/src/core/{resolver,realise}/**`, and `designer/src/project/project-model.ts` and `designer/src/documents/generated-names.ts`, with screens re-parsed when a manifest's `<element>` list changes. **W2:** a data field's `max_len` means usable characters, as a subject's does. The fixture's `wd_service_list` C++ changes so that `max_cell_chars` also means characters: one more byte of storage, and its help text updated. The foundation's copy of the widget is out of scope (R10), and is noted for the owner's foundation PR. The worker's WO1 choices were accepted by the PA: four data field types, a required `access`, and refusal both above the declared capacity and on a false return (Q-19). |
| 2026-11-17 | **E-3a done** by the worker (`f1317e7` WO2, `a06c3b3` WO3, `020a662`/`2ca39c1` WO4, `164f4f3` report), after two usage-limit interruptions; the PA snapshotted the tree each time and resumed the same worker. Its two extra designer files (`project-documents.ts`, `element-names.ts`) were justified as W1's minimum plumbing and accepted. |
| 2026-11-17 | **E-3a verified by the PA** on `164f4f3`, suites one at a time: Wasm 5/5 (the new `collection-data` parity test included); host ctest 530/530; CLI 3174; lint, tsc and designer typecheck clean; designer unit 291; e2e 138/138; production 3; goldens empty diff; check-package PASS at 0.23.0; home-path guard clean. **PA fixes:** `7bf7666`, CI now builds `u8g2gl_editor_collections` and runs `collection-data.test.mjs`, which it didn't; `793151e`, an unnamed misspelt static child (`<colum>`) is one "did you mean the static child <column>?" error and is never given a synthesised name. Before, it was a missing-name error that pointed at `--fix-names`. CLI 3177 after it. Built CLI: the departures fixture validates with unnamed `<column>`s and generates `add_column(…, U8G2GL_ALIGN_…)` calls; `align="middle"` is refused with the three values. Browser, production build: the `services` panel lists its four columns as a table; a width edit wrote one change, and one undo restored it; no name was written into any `<column>`; the disk was untouched. |
| 2026-11-24 | **E-3b refreshed and approved by the owner.** The PA refreshed E-3b against main @ `20978b3` ([RESCOPE-E-3b.md](RESCOPE-E-3b.md)): rulings 6–11 stand, refined by four decisions the code called for. **Q1a:** a test run applies each set to the firmware through a staged C++ function per set, using the public `ui_set_…()` setters and each collection widget's own `begin()`, access method and `commit()`, reached through `ui_screen_<s>.objs[i]`. **Q2a:** a `measureText` bridge export, editor target only, for the widest glyph. **Q3a:** the Sample data view offers the four conventional sets when `samples/` is empty, and the first-use project ships them. **Q4a:** CLI 0.26.0, superseding ruling 12's patch bump for E-3b. E-3b's Boundary (ruling 14) widens to `wasm/bridge.cpp` (Q2a) and `wasm/harness.cpp` with the test-run staging (Q1a); runtime 0.15.0, schema 0.7 and the goldens don't move. Asked "Approve E-3b with Q1a–Q4a?", the owner replied, in their own words: **"Approve E-3b"**. PA branched `u8g2gl-e3b/wo1-sample-sets` from `origin/main` @ `20978b3` in `../U8G2GL-e4`. Work orders: [WORKORDERS-E-3b.md](WORKORDERS-E-3b.md). |
| 2026-11-24 | **E-3b done** by the worker (`47297fe` WO1, `321dab0` WO2, `263ad6f` WO3, `99f4aad`/`57df54f`/`1989f05` WO4, `159794d` report), after one usage-limit interruption; the PA snapshotted the uncommitted diff and resumed the same worker. Its deviations, all inside the Boundary, were accepted: a sample-only `DELETE /api/file` route; the harness hook declared in `harness.cpp`; the firmware half taking each set from the request; a test run covering every screen; an element with several `<data>` blocks reported, not guessed. E-2g's first-use project does not exist, so the four sets ship as CLI test-run fixtures. |
| 2026-11-24 | **E-3b verified by the PA** on `159794d`, suites one at a time: Wasm 7/7 (`measure-text` new); host ctest 540/540; CLI 3247; lint and designer typecheck clean; designer unit 346; e2e 169/169; production 3; goldens unchanged; check-package PASS at 0.26.0; home-path guard clean. Built CLI 0.26.0: with four sets and a broken JSON file in `samples/`, `validate` is clean and `generate` is byte-identical to a run without them. Browser, on a copy of the departures fixture: the conventional sets were created from the empty view; filling the formation grid changed the canvas live; CSV pasted into the service list landed two rows and refused one by row and field (`row 3, cells[1]: 45 characters, over the max_len of 24`), keeping a quoted comma; ⌥] / ⌥[ cycled none and all four sets; *worst case* drew 12 carriages and widest-glyph strings; a test run reported parity for all 5 cases; selecting the formation on the canvas opened its grid; the subjects table showed one column per set; the screen XML on disk was unchanged throughout. **PA fix** `5bd476d`: CI runs `measure-text.test.mjs`; stale sample-data lines in ui_spec (§6, §6.4, §15, U-6) and ui_flows (§4.3, §2.9). **Noted, not fixed:** a number cell typed out of range (9090 into `loading_pct`, max 100) keeps showing the typed text with no mark, while the set holds the last valid value. |
