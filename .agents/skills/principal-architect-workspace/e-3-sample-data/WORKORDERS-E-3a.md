---
name: e-3a-wo1-wo4
description: Work Orders of E-3a — the widget manifest's <data> block in schema 0.7, static <element> children made real, the editor fill path through the registry and the bridge, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work, including anything from E-3b (sample set files, the Sample data view, the
  set switcher), E-2k2 or E-2k3, or either foundation repository.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-3-sample-data` ([PROJECT.md](PROJECT.md)). Its rulings 1–5 and 12–14 bind this
PR (12–14 only for what concerns E-3a), with S1–S4 as recommended and **O2: `<data>` is added to the
unreleased schema 0.7**: no schema bump, runtime 0.14.0, CLI 0.23.0. Read the whole of PROJECT.md
first, especially "Findings", "The model" and the S2 sketch. The owner's approval is recorded in its
status log (rule 00). Read `.agents/rules/03-versioning.md` before WO1.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e3a/wo1-data-schema` (based on main at `a67baae`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e3a/wo2-static-elements`, then `u8g2gl-e3a/wo3-fill-thunk`, then
  `u8g2gl-e3a/wo4-docs-review`.
- **Boundary**, which refines ruling 14:
  - `cli/src/core/{schema,parser,validator,generator}/**` and `cli/src/data/**` (the runtime
    stamp);
  - `include/u8g2gl/u8g2gl_editor.h`, `src/u8g2gl_editor.cpp`, and the runtime version in
    `include/u8g2gl/u8g2gl_version.h`, `CMakeLists.txt` and `library.json`;
  - `wasm/**`;
  - the departures fixture's widget manifests and screens (`cli/test/fixtures/departures-project/`);
  - **`designer/src/**` only for ruling 2's table** of static children in the property panel,
    and the minimum plumbing it needs;
  - tests and goldens; the docs in ruling 13; the versions.
  - **Widened by W1 (owner-approved 2026-11-17, see PROJECT.md):** `cli/src/node/load-project.ts`,
    `cli/src/node/fix-names.ts`, `cli/src/core/resolver/**`, `cli/src/core/realise/**`,
    `designer/src/project/project-model.ts` and `designer/src/documents/generated-names.ts`.
  - **W2:** the fixture's `wd_service_list.{hpp,cpp,xml}`, so that `max_cell_chars` means
    usable characters.

  Anything else, stop and report.
- **Install:** `extern/u8g2` is already checked out at the pinned commit (`d66b49a`). Don't touch it,
  and don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as you
  go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from the
  lockfiles. Any CLI `--out` path stays inside the worktree's `tmp/`.
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
  - Known flakes, still to be reported if they fail: `design-hidden.spec.ts:144` and
    `performance.spec.ts:168` (e2e), and `generate-editor.test.ts` hitting vitest's 5 s limit under a
    full parallel run.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ: check
  §2). No workspace pointers in source comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on the
  owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind them,
  never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Versions:** never tag, never publish. Bump exactly what WO3 and WO4 name. Never bump the schema.

# WO1 — `<data>` in the manifest (`u8g2gl-e3a/wo1-data-schema`)

- [ ] **Schema types** in `cli/src/core/schema/widget-manifest.ts`: `WidgetData` (name, access,
      capacity, help, fields, location) and `WidgetDataField` (name, type, min, max, values,
      max_len, repeat, help, location), on the manifest's `api`.
      - Field types are the existing `PropType`s plus `min`, `max` and `values` (S2).
      - `capacity`, `repeat` and `max_len` each take a literal int or the name of an int `<prop>`
        of the same widget.
- [ ] **Parser** (`core/parser/parse-widget-manifest.ts`): `<data>` and `<field>` inside `<api>`,
      with source locations. A widget may declare more than one `<data>`.
- [ ] **Validator** (ruling 1). Errors at the offending attribute:
      - an unknown field type;
      - `min`/`max` on a non-numeric field, or `min` > `max`;
      - `values` on a non-enum field, or an enum without values;
      - a `capacity`, `repeat` or `max_len` that is neither an int literal nor the name of an int
        `<prop>`;
      - a duplicate data or field name;
      - `access` that isn't a C++ identifier;
      - a `<data>` on a manifest with no class of its own.
- [ ] **Schema gate:** `DATA_SINCE = '0.7'`, as `MIRROR_SINCE` is. A project declaring schema 0.4–0.6
      whose widget manifest writes `<data>` gets one error saying to declare 0.7. 0.4–0.6 stay
      accepted otherwise. Do not bump `CURRENT_SCHEMA`.
- [ ] **Vocabulary coverage:** wherever the manifest vocabulary is described for the designer's
      coverage test (E-2k1's descriptor), add `<data>` and `<field>`, so the coverage test covers
      them. If the manifest vocabulary has no descriptor yet, say so in the report and add the
      parser and validator tests only.
- [ ] **The demo's widgets declare their data** (ruling 4), in
      `cli/test/fixtures/departures-project/widgets/`:
      - `wd_train_formation.xml` declares `carriages` through `add_carriage`, with the five fields
        of its C++ signature, using the real C++ names and types. Read
        `wd_train_formation.hpp`, and check `class_type`'s real values in the `.cpp`.
      - `wd_service_list.xml` declares `rows` through `add_row`, with `cells` repeated
        `max_cols` times at `max_cell_chars`.
      - The S2 sketch is the starting point, but the C++ is the truth. Where they disagree, follow
        the C++ and say so in the report.
- [ ] **Tests:** the parser, every validator rule above, the gate, and the fixture validating clean.

# WO2 — static `<element>` children (`u8g2gl-e3a/wo2-static-elements`)

- [ ] **W1, first:** static children are their own child kind, not elements.
      - `parseScreen` takes an optional parse option naming, per class, the manifest's `<element>`
        child names. A child so named is parsed as a static child: no `name` is needed, it never
        joins the element tree, and it never takes an element name.
      - Every loader parses manifests first and passes the option: `load-project.ts`,
        `fix-names.ts`, and the designer's `project-model.ts`. `generated-names.ts` must never
        name a static child.
      - The designer re-parses screens when a manifest's `<element>` list changes. Its parse
        cache is keyed by text today.
      - The resolver and realiser carry static children on their element, never as elements.
      - Pass 8's "collection children → PR-08" refusal (`validate-not-yet-supported.ts`) is lifted
        for declared static children.
- [ ] **W2:** in the fixture's `wd_service_list`, `max_cell_chars` means usable characters.
      - The storage holds `max_cell_chars + 1` per cell, and `add_row` copies up to
        `max_cell_chars`.
      - Update the prop's help, which currently says "including terminator", and the C++ doc
        comments.
      - Test it: a cell of exactly `max_cell_chars` characters survives whole.

The manifest schema already has `<element name access>` with typed `<arg>`s (design_spec §6.5's
`<column width align>`). The parser reads it, and nothing else does (finding 5). Make it real (S4,
ruling 2).

- [ ] **Validator:** in screen XML, a classed element's children named by its manifest's
      `<element>`s are validated against their `<arg>`s: types, required args, and unknown attributes.
      An unknown child of a classed element is an error at its tag, naming the element names the
      manifest allows.
- [ ] **Generator:** at construction, the firmware code calls the declared access method once per
      child, in document order, with the typed args. Use the existing emission of property setters
      as the model, including how an enum or alignment literal is spelled.
      - A screen with no static children generates exactly what it does today.
      - New output for screens that have them is new generator behaviour, so WO4's CLI bump
        covers it (rule 03).
- [ ] **The editor target** builds the same children, so the designer's canvas draws them. That
      means the scene and the registry, through the existing editor path.
- [ ] **The demo:** `wd_service_list.xml` declares `<element name="column" access="add_column">`
      with `width` (int) and `align` (the alignment enum the C++ takes).
      - The departures fixture's `services` and `row0` elements gain `<column>` children that give
        a sensible departure board: time, destination, platform, status.
      - Check the C++ `add_column(int16_t width, u8g2gl_align_t align)` and use its real alignment
        spellings.
- [ ] **Property panel:** a classed element with static children lists them as a small editable
      table: add, remove and reorder rows, and edit each arg with the control its type gets
      elsewhere. Each change goes through the existing document edit path as one undo step.
      Keep it inside the `designer/src/**` slice granted above.
- [ ] **Tests:**
      - validator rules;
      - generator unit tests and goldens: if a golden fixture gains columns, only the new calls
        move, and the report lists them;
      - a host C++ test, in the existing generated-fixture pattern, that a generated service list
        with columns constructs and lays out as the hand-written calls do;
      - e2e: the panel table edits a column's width, the XML changes, and one undo restores it.

# WO3 — the fill path (`u8g2gl-e3a/wo3-fill-thunk`)

- [ ] **Registry** (ruling 3), editor target only ([UD-4]):
      - `u8g2gl_editor_class` gains an optional fill entry: `nullptr` when the class declares no
        `<data>`. Its shape is your call. It needs to take the element's instance, the data name,
        and rows as already-parsed typed values (not JSON in C++ runtime code), and to return
        success or failure with a reason.
      - Document it in `u8g2gl_editor.h`.
      - No firmware path may include or pay for any of it.
- [ ] **Generator** (`emit/editor-registry.ts`) emits, per class with `<data>`, the thunk:
      `begin()`, the declared access method once per row with the fields in declared order (a
      `repeat` field passed as the array and count the C++ takes), then `commit()`.
      - Emit a compile-time check that the declared fields match the access method's signature:
        a `static_assert` over `std::is_invocable` or similar, in the existing `if constexpr`
        idiom in `u8g2gl_editor.h`. A mismatch then fails the editor build with a message naming
        the widget and data.
- [ ] **Bridge** (`wasm/bridge.cpp`, editor-host code): `applyCollectionData(json)` takes
      `{ "<element name>": { "<data name>": [ rows ] } }`, or the simpler shape when a widget has
      one data block. Choose one shape, document it, and test it.
      - Rows are objects keyed by field name, validated against the registry's declared fields
        before any call.
      - A row beyond capacity is refused, naming the element and the capacity, just as `add_row`
        returns `false` on the device. A bad row is refused naming the element, row index and
        field.
      - It is applied after every `applyScene`, as `applySampleData` is. Follow how the live loop
        re-applies sample values, but **don't wire the designer to call it yet**: that is E-3b. Add
        only the bridge entry, its TypeScript binding type, and tests.
- [ ] **Versions** (rule 03, ruling 12): runtime **0.14.0**, because the registry gains a field. That
      means the header, `CMakeLists.txt` and `library.json`, the CLI's `runtime-version.json`
      restamped with the existing script, and `U8G2GL_SCHEMA_VERSION_MINOR` unchanged at 7.
      Every golden's runtime-floor line moves, as at E-4b. Check that no other line moved without
      a reason.
- [ ] **Tests:**
      - generator unit tests and editor-registry goldens;
      - **Wasm parity:** a train formation and a service list filled through `applyCollectionData`
        render identically to the same widgets filled by hand-written calls in C++. Follow the
        existing Wasm test pattern, and use the departures fixture's widgets;
      - over-capacity and bad-row refusals;
      - the `static_assert` firing on a deliberately mismatched synthetic manifest, as a
        compile-fail case in the `test/version_guard/` pattern (with the same platform care as
        `test/large_font_guard/`).

# WO4 — docs and review (`u8g2gl-e3a/wo4-docs-review`)

- [ ] **design_spec:**
      - §6.5: the `<data>` block and `<element>` made real;
      - §9: the editor fill path, with PR-08 still owning the firmware ingestion API;
      - §13: the registry's fill entry;
      - §15.3/§15.4: schema 0.7's additions and the new diagnostics.
- [ ] **ui_spec:** the property panel's static-children table, and §11's three-kind model as
      PROJECT.md states it. U-6 is **closed by S1** (samples/*.json), with the format itself left
      to E-3b.
- [ ] **implementation_plan:** PR-08's E-D requirement, "fillable by name through the editor
      registry", marked delivered by E-3a.
- [ ] **`ChangeLog`:** runtime 0.14.0 and `cli v0.23.0`.
- [ ] **CLI 0.23.0** in `cli/package.json` and the lockfile.
- [ ] Run the readability-reviewer over every changed file, and fix what it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - host C++ build and ctest;
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff after your commits;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.23.0).
- [ ] **Completion report** appended below:
      - commits per WO;
      - suite results, with baselines;
      - every golden line that moved, and why;
      - the bridge's JSON shape;
      - where the C++ overruled the S2 sketch;
      - anything found outside scope;
      - any deviation, and why.

# Completion report

*(worker: append here)*
