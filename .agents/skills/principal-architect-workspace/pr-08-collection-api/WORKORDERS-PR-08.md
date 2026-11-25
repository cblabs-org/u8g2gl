---
name: pr-08-wo1-wo4
description: Work Orders of PR-08 — named element handles in ui.hpp, generated per-instance collection storage through u8g2gl_rows (closing Q-19), §9.2's generated collection facade, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work. In particular, none of the following:
  - anything of PR-09's: focus, input, events, navigation, `focus_style` or the `apply_style()`
    precedence fix;
  - composites with their own C++ class (deferred, ruling 6);
  - the 9090 number-cell issue;
  - anything in either foundation repository.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `pr-08-collection-api` ([PROJECT.md](PROJECT.md)). Its rulings 1–9 bind this
PR, settling the detail of decisions Q1a, Q2a, Q3a, Q4a and Q7 in
[REFRESH-PR-08-09.md](REFRESH-PR-08-09.md).
- **Read first:** the whole of PROJECT.md and REFRESH-PR-08-09.md. The owner's approval is
  recorded in both status logs (rule 00).
- **Before WO1:** read `.agents/rules/03-versioning.md`.
- **Spec:** design_spec §6.5, §9, §13 and §18.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-08/wo1-element-handles`, which is based on main
  at `8012495` with no upstream set.
  - Cut each later branch from the previous tip with `git checkout -b <name>`:
    `u8g2gl-08/wo2-row-storage`, then `u8g2gl-08/wo3-collection-facade`, then
    `u8g2gl-08/wo4-docs-review`.
- **Boundary:**
  - **Runtime:** in `include/u8g2gl/` and `src/`, the new `u8g2gl_rows` type and the one new
    virtual on `u8g2gl_obj` (ruling 3), with the editor header and registry plumbing they need;
    `library.json` and the runtime-version files the version checks require.
  - **CLI core:** `cli/src/core/generator/**` (emit and report), `cli/src/core/validator/**` and
    `cli/src/core/realise/**`, as far as rulings 1–6 need. Also `cli/src/core/schema/diagnostic.ts`,
    for new codes only.
  - **Designer and design server:** `designer/**`, for the RAM figure (ruling 4) only;
    `cli/src/node/design/test-run/**` and `wasm/harness.cpp`, for ruling 8 only.
  - **Wasm:** `wasm/bridge.cpp` and the Wasm build files, only as far as editor-target storage
    (ruling 3) needs.
  - **Migration and tests:** every copy of `wd_service_list` and `wd_train_formation` that declares
    `<data>` (ruling 7); the tests, fixtures, generated test configs and goldens these changes move.
  - **Docs and versions:** the docs in WO4, and the versions in ruling 9.
  - **Not touched:**
    - the schema version (it stays 0.7);
    - the manifest vocabulary (Q3a adds nothing to it);
    - PR-09's constructs and Pass 8's PR-09 entries;
    - `extern/`;
    - either foundation repository.
  - If a step seems to need anything outside the Boundary, or a design choice the rulings don't
    settle, **stop and report**.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and don't
  run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from the
  lockfiles. Any CLI `--out` path stays inside the worktree's `tmp/`.
- **Baselines:** record them first, running the suites one at a time.
  - **Framework editor Wasm:** build it (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`, and again after any runtime or
    `bridge.cpp` change.
  - **Host C++ tests:** `cmake -B build && cmake --build build -j8 && ctest --test-dir build
    --output-on-failure`.
  - **e2e:** it needs `npm run build:e2e`, never the production build. A production `npm run build`
    overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - **Production:** checked with `npm run build` and `test:e2e:production`.
  - **Wasm tests:** run them as CI runs them, `node wasm/test/<name>.test.mjs`, every one listed in
    `.github/workflows/ci.yml`.
  - **Emscripten:** `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - **Known flakes,** still to be reported if they fail:
    - e2e: `performance.spec.ts:168`, `drag-performance.spec.ts:189` and
      `design-hidden.spec.ts:144`;
    - `generate-editor.test.ts`, when it hits vitest's 5 s limit under a full parallel run.
  - **Load:** the machine may be heavily loaded by other processes. Re-run any failure alone before
    judging it.
- **Standards:** load `u8g2gl-standards` before writing code. C++ and TypeScript naming differ, so
  check §2. No workspace pointers in source comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright runs headless, with `--no-open`. Never open a window, an editor, Finder or
  an OS file dialog on the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind them,
  never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Goldens:** when a golden moves, read the diff. Every changed line must be explained by this WO's
  change; anything else is a defect to report.
- **Versions:** never tag, never publish. Bump only in WO4, as ruling 9 gives: runtime 0.16.0, CLI
  0.27.0, schema unchanged at 0.7.

# WO1 — named element handles (`u8g2gl-08/wo1-element-handles`)

- [ ] **Ruling 1.** `ui.hpp` declares a typed reference for every named element realised as an
      object, `extern <class>& ui_<screen>_<element>;`, defined in that screen's `.cpp` beside its
      `static` object.
      - The object itself stays `static`. Only the reference is external.
      - Use the screen name exactly as `ui_screen_<screen>` spells it.
      - A drawing element gets no handle.
      - An element expanded out of a composite's template isn't written in the screen, and gets no
        handle either. Note in the report whether any fixture has one.
- [ ] **Identifier collisions.** Two generated identifiers that would collide (a handle against
      another handle, a screen function, a subject's `ui_set_…`/`ui_get_…`, or the facade WO3 adds)
      are an error diagnostic naming both sources. Add the code to `diagnostic.ts`, and check it in
      `generate`'s own pass and in `validate`, under the same refusal policy as the rest.
- [ ] **The editor target is unchanged:** the registry builds its own objects.
- [ ] **Tests:**
      - generator unit tests for the handle, a drawing element with none, and a collision;
      - a host C++ test that compiles generated code and reaches an element through its handle;
      - goldens refreshed, each diff explained.

# WO2 — generated collection storage (`u8g2gl-08/wo2-row-storage`)

- [ ] **Row encoding (ruling 2):**
      - the layout is computed in one CLI module, and both the generator's emit and §18's report use
        it, so the report counts nothing itself (`report/budget.ts`'s rule);
      - a `string` field with no resolvable `max_len` is refused by `generate`, with a diagnostic
        naming the widget, the `<data>` and the field.
- [ ] **`u8g2gl_rows` (ruling 3):**
      - a new runtime type in its own header: a non-owning view over a byte buffer and a generated,
        `constexpr` layout descriptor;
      - typed accessors per field and repeat index (read, and write for the widget's `add_…`), plus
        the capacity in rows;
      - no heap.
      - **Virtual:** one new virtual on `u8g2gl_obj` hands a view to the widget, keyed by the
        `<data>`'s declaration index. The default does nothing.
      - **Tests:** host C++ tests for the layout (alignment and padding), each field type, string
        truncation at `max_len`, and an out-of-range access.
- [ ] **Firmware storage:**
      - the generator emits one `static` buffer per instance per `<data>`, sized from that
        instance's resolved props;
      - the init hands each buffer to its widget after the setters and the static children.
- [ ] **Editor-target storage:**
      - the registry allocates the same size when it constructs the instance, recomputed from the
        instance's current props, and frees it with the scene;
      - parity holds, because both targets size from the same layout.
- [ ] **Migration (ruling 7):**
      - `wd_service_list` and `wd_train_formation` read and write their rows through `u8g2gl_rows`,
        and drop their own row arrays;
      - their public `begin()`, access method and `commit()` keep their signatures, so E-3a's fill
        thunk is unchanged;
      - with no view attached, `capacity()` is 0 and the access method returns `false`;
      - single buffer, no staging copy, as today;
      - migrate every copy with `<data>`, and list them in the report.
- [ ] **§18 (ruling 4):**
      - each instance's `<data>` storage is reported exactly, in bytes, with its derivation (capacity
        × row bytes, and the row's fields);
      - the designer's *RAM cost not reported for project widgets ([Q-19])* line becomes that figure
        for a widget with `<data>`; a project widget without `<data>` keeps the muted line;
      - check the figure against `sizeof` of the generated buffer in a host C++ test.
- [ ] **Tests:**
      - two instances declaring `max_rows="1"` and `max_rows="10"` get buffers of 1× and 10× the row
        size. That's Q-19's own example, made a test;
      - the Wasm parity tests (`collection-data` among them) and the CLI parity corpus pass, with
        their lit-pixel checks;
      - designer unit tests and one e2e spec for the RAM figure;
      - goldens refreshed, each diff explained.

# WO3 — the generated collection facade (`u8g2gl-08/wo3-collection-facade`)

- [ ] **Ruling 5.** Each `<data>` on each instance gets a generated object in `ui.hpp`, named
      `ui_<screen>_<element>_<data>`:
      - `begin()`, `add_row(…)` and `commit()` forward to the widget's own `begin()`, the declared
        access method and `commit()`;
      - `capacity()` returns the declared capacity;
      - `add_row`'s parameters are the fields in declaration order, with the C++ types E-3a's fill
        thunk passes for each field type;
      - a `repeat` field takes a pointer and count, with an `initializer_list` overload beside it;
      - past capacity, `add_row` returns `false`;
      - the names go through WO1's collision check.
- [ ] **E-3b's test run (ruling 8):**
      - `sample-set-unit.ts` fills each collection through the facade instead of `objs[i]`;
      - remove the index guard and its `U8G2GL_TEST_RUN_SAMPLES` mismatch case, along with their
        tests, and keep every other test-run check;
      - the per-set parity tests pass unchanged in what they assert.
- [ ] **Tests:**
      - generator unit tests for the facade's signatures, one per field type;
      - a host C++ test filling both widgets through the facade, checking capacity refusal and the
        rendered pixels;
      - goldens refreshed, each diff explained.

# WO4 — docs and review (`u8g2gl-08/wo4-docs-review`)

- [ ] **Ruling 6:** the classed-composite refusal's message names "a later PR" instead of PR-08, in
      Pass 8, `realise.ts` and their tests. Behaviour doesn't change.
- [ ] **design_spec:**
      - **§6.5:** the row encoding, storage being the framework's, and the handle;
      - **§9.2:** rewritten to what's built, with the real generated names;
      - **§9.4 and §9.6:** they stop saying PR-08 still owns the ingestion API, and §9.6 describes
        the facade route;
      - **§13:** the handle, storage and facade emission;
      - **§18:** the storage figure;
      - **[Q-19]:** closed, with today's date and this PR.
- [ ] **ui_spec:** the panel's RAM line.
- [ ] **implementation_plan.md:**
      - PR-08's row: delivered, and what was deferred (ruling 6);
      - E-3's row: E-3b done (#66), replacing "follows E-2k3".
- [ ] **`ChangeLog`:** `runtime v0.16.0` and `cli v0.27.0`.
- [ ] **Versions (ruling 9):**
      - runtime 0.16.0 in `CMakeLists.txt`, `library.json` and the runtime-version files the
        agreement checks require;
      - CLI 0.27.0 in `cli/package.json` and its lockfile;
      - regenerate the `test/*/generated*` configs the floor moves.
- [ ] Run the readability-reviewer over every changed file, and fix what it finds.
- [ ] **Final verification**, suites one at a time:
      - the framework Wasm build and every Wasm test in CI;
      - host C++ build and ctest;
      - CLI, lint and tsc;
      - designer typecheck and unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff after your commits;
      - `node scripts/check-home-paths.mjs`;
      - `node scripts/check-package.mjs` (PASS at 0.27.0).
- [ ] **Completion report**, appended below:
      - commits per WO;
      - suite results, with baselines;
      - for the departures fixture: the generated `ui.hpp` handle and facade declarations, and one
        instance's storage line with its §18 derivation;
      - the list of migrated widget copies;
      - each golden's change, in one line;
      - anything found outside scope;
      - any deviation, and why.

# Completion report

*(The worker appends it here.)*

## Report (worker, 2026-11-24)

**Authorization.** Before any change I checked the provenance. This file names its parent project. PROJECT.md's status log records the owner's own words, "Approve as recommended", and REFRESH-PR-08-09.md's log records the same approval.

### Commits per WO

Each WO is on its own branch, cut from the tip of the one before. Nothing was pushed or tagged.

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-08/wo1-element-handles` | `657fd14` named element handles in ui.hpp |
| WO2 | `u8g2gl-08/wo2-row-storage` | `eda055d` generated collection storage through u8g2gl_rows |
| WO3 | `u8g2gl-08/wo3-collection-facade` | `889d213` the generated collection facade |
| WO4 | `u8g2gl-08/wo4-docs-review` | `0f1b429` docs, versions and review; this report follows it |

### Suite results

Every suite ran one at a time. The baseline is main at `128b506`; the final run is the WO4 tree.

| Suite | Baseline | Final |
|---|---|---|
| Framework editor Wasm build | ok | ok, 0 warnings |
| Wasm tests (all seven in CI) | 7/7 pass | 7/7 pass |
| Host C++ build and ctest | 540/540 (1 skip) | 560/560 (1 skip), 0 warnings |
| CLI vitest, with Emscripten | 3247 in 156 files | 3280 in 159 files, all pass |
| CLI lint and tsc | ok | ok |
| Designer typecheck | ok | ok |
| Designer unit | 346 | 351 |
| e2e, after `build:e2e` | 169 | 170 |
| Production build, hook grep | ok | ok, no hook |
| `test:e2e:production` | 3 | 3 |
| `refresh-goldens.mjs` after the commits | — | empty diff |
| `check-home-paths.mjs` | — | pass |
| `check-package.mjs` | — | PASS, u8g2gl-0.27.0.tgz |

Collection-data in the Wasm tests: 0 pixels lit before the fill, and 1418 after, equal to the reference frame. The CLI parity corpus reported "departures: 5 cases × 8 frames, 0 differ".

**Flakes.** Each failure below passed when re-run alone.
- WO2's e2e run: `drag-performance.spec.ts:189` (7 missed frames, p95 19.9 ms) and `performance.spec.ts:168` failed. Both are on the known-flakes list.
- WO3's CLI run: four integration tests timed out at 5 s under a parallel run (`cli.test.ts` fix-names, `generate-convert.test.ts`, and two in `generate.test.ts`). The final run had one such timeout, in `generate-convert.test.ts`.

**check-package.** It packs a clone of HEAD, so it ran after the WO4 commit, with Emscripten on PATH. Its first attempt refused because `emcc` was not on PATH.

### The departures fixture

`ui.hpp` handles:
```cpp
extern u8g2gl_label& ui_departures_plat_label;
extern u8g2gl_label& ui_departures_plat_num;
extern wd_service_list& ui_departures_row0;
extern u8g2gl_label& ui_departures_message_bar;
extern wd_train_formation& ui_departures_formation;
extern wd_service_list& ui_departures_services;
extern u8g2gl_clock& ui_departures_sys_clock;
```
`ui.hpp` facades: `ui_departures_row0_rows`, `ui_departures_formation_carriages` and `ui_departures_services_rows`, each `extern const` with a `…_t` struct. For example:
```cpp
struct ui_departures_services_rows_t {
    void begin() const;
    bool add_row(const char* const* cells, size_t cells_count) const;
    bool add_row(std::initializer_list<const char*> cells) const;
    void commit() const;
    size_t capacity() const { return 10; }
};
// and ui_departures_formation_carriages_t::add_row(int32_t number, const char* class_type, bool wheelchair, bool bike, int32_t loading_pct) const;
```
One instance's storage line, from `ui_screen_departures.cpp`, and its entry in §18 (`--json`):
```
// services <data name="rows">: 10 rows × 152 bytes (cells: 6 × string, 25 bytes each, max_len 24 + 1, at 0; padded to 4) = 1520 bytes
alignas(4) static uint8_t ui_rows_services_rows[1520];
```
§18 reports the same block as `collection storage`, names `departures.services.rows`, count 10, measured at 1520 bytes, with the same derivation. `row0` (`max_rows="1"`) is 152 bytes and `formation` is 144. Q-19's example now holds: 1× and 10× the row's size.

### Migrated widget copies

Only one copy of each widget declares `<data>` in its C++: the departures fixture's, `cli/test/fixtures/departures-project/widgets/wd_service_list/` and `…/wd_train_formation/`. Both were migrated. Three other places use those copies or their manifests, and their XML is unchanged:
- `test/collection_data` and `test/static_children` hold only the manifests;
- `wasm/test/collection_reference.cpp` builds the widgets by hand, and now hands them storage.

Two copies are untouched, as ruling 7 says: the 0.4 widget-probe fixture has no `<data>`, and G-PROBE-2's evidence copy is under `.agents/`.

### Each golden's change

**WO1, handles**
- Each `ui.hpp` gains the class forward declarations and the handles. That is the emit-project, generated_fixture, large_font_guard, static_children, collection_data and both fill_guard fixtures.
- Each of their screen units gains the handle definitions.
- Editor goldens are unchanged.

**WO2, storage**
- Each screen unit with `<data>` gains `u8g2gl_rows.h`, its field table, layout, buffer and `attach_rows` call: collection_data, static_children, and both fill_guard fixtures.
- Every `ui_scene.json` goes to version 5. Those with `<data>` also gain `storage`.
- The fill_guard mismatch registry's field `max_len` changes from -1 to 8, because the fixture's string field gained `max_len="8"` so it can be sized.

**WO3, facades**
- The same four `ui.hpp`s gain `<cstddef>`, `<initializer_list>` and the facade declarations.
- Their screen units gain the facade definitions.

**WO4, versions**
- Every `u8g2gl_generated_config.h` changes its runtime floor from 0.15.0 to 0.16.0, in both the `#error` text and `U8G2GL_REQUIRE_RUNTIME_AT_LEAST`.

### Found outside scope

- **The human §18 text report** (`cli/src/node/format-budget.ts`, outside the Boundary) prints each `collection storage` line's count and bytes, but not its name or derivation. Those are in `--json` and in the generated comment. A follow-up should print them.
- **A stale comment** in `cli/src/core/parser/parse-widget-manifest.ts:293`, also outside the Boundary, still says Pass 8 refuses classed composites "until PR-08". It is a comment only, and was left as it is.
- **The foundation's own widget copies** still keep their row arrays. That was out of scope; they need the same migration when foundation picks up runtime 0.16.

### Deviations, and choices the rulings did not settle

1. **Refusals for unsized storage.** A `<data>` with no `capacity`, and a count naming a prop that the instance leaves unset with no default, are refused with the same `U8G2GL_UNSIZED_DATA` code. So is the string with no `max_len` that ruling 2 names. A buffer cannot be sized without its capacity, so I read this as ruling 2's own reason. No current fixture is affected.
2. **Where the unsized refusal is reported.** It is reported in Pass 9 at the refusal policy: a warning in `validate`, an error in `generate`, and so an error in the designer. Reported in `generate` alone, the designer would never show it.
3. **The collision code** `U8G2GL_GENERATED_NAME_COLLISION` is an error in both journeys, as `U8G2GL_NAME_COLLISION` is. It checks:
   - handles, facades and their types, against everything every unit sees;
   - storage names, against the globals and their own screen.
   There is no `ui_get_…` to check: the generator emits none.
4. **Storage lives in the capacities.** `computeCapacities()` now takes `resolved` and `manifests` and carries `collections`. That way emission, the scene, §18 and the designer read one sizing, and `cli.ts`, which is outside the Boundary, needed no change.
   - The designer's live pipeline had to pass them too, or its scene would carry no storage and the canvas would draw empty collections.
   - Pass 9 calls the same pure layout function itself, to report.
5. **The editor host reads its layout from the scene.** The editor target takes the layout from the scene (version 5) rather than recomputing it in C++. So both targets size from the one CLI module, and the layout algorithm exists once. Two small checked helpers were added to the editor runtime: `u8g2gl_editor_field_type()` and `u8g2gl_editor_rows_fit()`.
6. **Facades for template children.** Facades and storage exist for every object with `<data>`, including one expanded from a composite's template, named by its joined name. Ruling 1 excludes template children only from handles. No fixture has such a collection.
7. **The facade is stateless.** It forwards add_row and returns the widget's own refusal. For an access method returning `void`, `u8g2gl_row_added()` reports true, as the editor's fill thunk does. Both migrated widgets return `false` past capacity, and `add_row` returns `false` there. The facade's methods are `const` and the object is a `const` empty struct, so it costs no RAM.
8. **The migrated widgets' sizing setters are no-ops.** `set_max_rows`, `set_max_cols`, `set_max_cell_chars` and `set_max_carriages` now do nothing, with doc comments saying so, because the props size the generated storage instead. `wd_train_formation::get_carriage()` now copies into an out-parameter, because there is no record array to point into. Nothing outside the widget called it.
9. **`CMakeLists.txt` lists the new source.** I added `src/u8g2gl_rows.cpp` to `U8G2GL_RUNTIME_SOURCES`, which is plumbing the new type needs.
10. **The pre-release stamp test.** `prerelease-version.test.ts`'s STABLE was `0.16.0`, which now equals the runtime floor, so its replace-and-compare also hit the floor. It now uses `0.99.0` and `0.99.0-beta.1`, with a comment.
