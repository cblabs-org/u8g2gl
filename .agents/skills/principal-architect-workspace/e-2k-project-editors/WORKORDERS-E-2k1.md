---
name: e-2k1-wo1-wo4
description: Work Orders of E-2k1 — the vocabulary descriptor, the form ∥ XML shell, the u8g2gl.xml editor with the display picker and target switcher, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work, including anything from E-2k2, E-2k3 or E-3.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-2k-project-editors` ([PROJECT.md](PROJECT.md)). Its rulings 1–10 and
23–25, and decisions D1–D3, are binding for this PR. Read the whole of PROJECT.md first,
especially "The principle" and "How complete by construction works", because they are the
reason for most of what follows. The owner's approval is recorded in its status log (rule 00).
Read `.agents/rules/03-versioning.md` before WO4.

# Where you work

- **Worktree:** `../U8G2GL-e2k1`, starting on `u8g2gl-e2k1/wo1-vocabulary` (based on `50a0cba`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e2k1/wo2-form-shell`, then `u8g2gl-e2k1/wo3-targets`, then
  `u8g2gl-e2k1/wo4-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`. This PR should not change
    `bridge.cpp`. If you find you must, stop and report.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - The Wasm tests run as CI runs them: `node wasm/test/<name>.test.mjs`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
- **Standards:** load `u8g2gl-standards` before writing code (C++ and TypeScript naming differ:
  check §2). No workspace pointers in source comments or test titles. The home-path guard must
  pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop. A link the UI renders is fine; never follow one.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Flakes:** if any e2e fails, re-run it alone and report both runs. Do not weaken a test to
  pass.
- **Versions:** never tag, never publish. Bump only what WO4 names.

# WO1 — vocabulary descriptor (`u8g2gl-e2k1/wo1-vocabulary`)

- [ ] **The descriptor** in `cli/src/core/schema/`, for `u8g2gl.xml` and `globals.xml`. Each
      element is one declarative entry:
      - its tag, its parent, and whether it repeats;
      - each attribute's name, value type (string, int, bool, enum with values, or a reference
        kind: display setup, font, subject, style, image, path), required/optional, default,
        and **help text**;
      - for bus attributes, the bus families they apply to (from the catalogue's `bus.family`);
      - every **accepted alternative spelling** (finding 2: `setup`/`rotation`/`ram_budget` on
        `<target>` or `<display>`; bus attributes on `<bus>`, `<display>` or `<target>`;
        `max_len`/`maxLen` where accepted), each marked with its canonical form.
      Fold `STYLE_PROPERTIES` in by reference, never by copying it. Export it from the schema
      index so the designer can import it as it imports the rest of `cli/src/core`.
- [ ] **Help text for every attribute.** Take it from design_spec (§5.1–§5.3, §8, §10, §14) in
      plain words. Every entry must have some.
- [ ] **Coverage test, parser side.** It fails when:
      - an attribute the parsers read is missing from the descriptor. Prove it both ways: a
        document built from every descriptor entry parses with no unknown-attribute or missing
        diagnostics, and each value lands in the model; and a check that every attribute name
        `parse-project.ts`/`parse-globals.ts` read is in the descriptor. A source scan of the
        attribute-reading calls is acceptable if it is robust and documented;
      - or a descriptor entry has no help text.
- [ ] **ui_spec §2:** reword principle 1 and add principle 8, exactly as PROJECT.md "The
      principle" gives them.
- [ ] Unit tests for the descriptor's shape. CLI suite and lint green.

# WO2 — form ∥ XML shell (`u8g2gl-e2k1/wo2-form-shell`)

- [ ] **Ruling 1.** Opening `u8g2gl.xml` or `globals.xml` shows *form ∥ XML* in the editor
      area. The form takes the canvas half of the existing split, using the existing split,
      ratio and collapse behaviour. The XML stays live.
- [ ] **A generic form, built from the descriptor**, that covers **every** element and attribute
      of both files from this PR on:
      - repeating elements as lists with add, remove and reorder;
      - attributes as fields of the right kind (text, number, checkbox, select, a reference
        picker listing what the project declares);
      - help behind an ⓘ, as the property panel does (principle 6).
      Later PRs (E-2k2, E-2k3) replace sections with richer editors. Until then nothing is
      left XML-only.
- [ ] **Coverage test, UI side.** Every descriptor entry renders a control: a unit or component
      test that enumerates the descriptor and finds each one.
- [ ] **Edits through the existing CST path** (`designer/src/editing/`, as the property panel
      writes). One form change is one text edit and one undo step, in that document's undo.
      Comments and formatting survive: an e2e edits a file containing comments and checks they
      are intact.
- [ ] **Ruling 3, reading and writing.** The form reads every accepted spelling. An edit to an
      existing value is written where that value already lives. A new value or element is
      written in the canonical form. Text the parser cannot read keeps the last good form,
      read-only, with the problem shown.
- [ ] **Ruling 4.** Diagnostics for a field show inline on that field, with the Problems
      panel's codes and wording.
- [ ] **Selection sync.** Focusing a form section highlights its XML range, and moving the XML
      cursor into an element scrolls the form to it. Neither steals focus.
- [ ] **Ruling 2, Explorer sections.**
      - `u8g2gl.xml ▸ Project · Targets ▸ <each target> · Output`
      - `globals.xml ▸ Subjects (n) · Fonts (n) · Images (n) · Styles (n) · Consts (n)`
      Nested like E-2j's element rows and reusing its tree roles, keyboard and expansion
      memory. A click opens the file and scrolls the form to that section. Counts come from
      the current buffer. E-2j's screen rows are unchanged.
- [ ] Tests: unit tests for the form model; e2e for opening each file, an edit then undo, an add
      and a remove, the section rows, a comment surviving, and unparsable text keeping the last
      form. Render-count and performance tests stay green.

# WO3 — `u8g2gl.xml` editor and the target switcher (`u8g2gl-e2k1/wo3-targets`)

- [ ] **Ruling 5, Project section.** `name` and `version` are editable. `schema` is read-only,
      with its ⓘ saying why.
- [ ] **Ruling 6, the display picker.** It replaces the generic `setup` field.
      - Steps: controller, then size and variant, then bus wiring, with fuzzy search over the
        full setup name.
      - It is built from the catalogue the designer already loads (`model.catalogue`).
      - Each option shows pixels, framebuffer bytes, bus family and wiring, driver and tiles.
      - The controller links to U8G2's setup wiki page
        (`https://github.com/olikraus/u8g2/wiki/u8g2setupcpp`). Add an anchor only if you can
        confirm its format offline; never fetch the page.
      - Invent nothing the catalogue lacks.
- [ ] **Bus fields follow the bus family.** I²C shows `address`; SPI shows `cs`, `dc`, `reset`;
      parallel shows whatever the descriptor gives it. A field that does not apply is hidden.
      A value already in the file for a field that no longer applies is **flagged in the form,
      never dropped**.
- [ ] `rotation` (R0–R3, shown with degrees) and `ram_budget` (with the current budget figure
      beside it, wherever the designer already has one).
- [ ] **Ruling 7, impact preview.**
      - Before a new setup is committed, show a thumbnail of every screen at the candidate
        geometry, with the elements that fall outside the display marked.
      - Render in a second editor-module instance with the candidate in memory only. The
        document is untouched until the author confirms.
      - Measure it on the demo project and record the figure. If it is too slow for the
        project's screen count (more than about 1 s), preview the active screen only and
        record why.
- [ ] **Ruling 8, targets.** Add, rename, reorder and remove targets. Removing the last target
      is refused.
- [ ] **D1, the target switcher.**
      - A status-bar control, shown when the project has more than one target (and always
        naming the active target, as ui_spec §6's status bar already lists).
      - The canvas, insertion (`insert-element.ts`), the impact preview and any budget figure
        follow the **active** target. Today `live-pipeline.ts:174` and `insert-element.ts:200`
        take `targets[0]`; route both through one active-target source.
      - The active target is per-browser view state: `localStorage` keyed by project, every
        access in try/catch. It is **never written to the XML**. A missing or renamed target
        falls back to the first.
      - Switching is never an edit: no text change, no undo entry, no dirty marker.
- [ ] **Ruling 9, Output section.** `dir` and `prefix`, with a live example of the generated
      paths and symbol prefix.
- [ ] Tests:
      - unit tests for the picker's filtering and grouping, the bus-family field rules, and
        the active-target fallback;
      - e2e: pick a new display, which changes the canvas size, then undo restores it; the
        impact preview marks a clipped element; add a second target and switch the canvas to
        it with the file left clean; the switch survives a reload; an I²C `address` is flagged
        when the wiring changes to SPI.

# WO4 — docs and review (`u8g2gl-e2k1/wo4-docs-review`)

- [ ] **ui_spec:**
      - the Explorer section rows;
      - a new subsection for the project-file editors (form ∥ XML, the generic form and the
        coverage guarantee, reading and writing spellings);
      - the display picker, the impact preview and the target switcher;
      - §16: close **U-3** with D1's answer and the date.
- [ ] **design_spec §5.1 (ruling 10):** remove `default="true"` from the example and state the
      rule: the designer's active target is view state, and the first target is the default.
- [ ] `ChangeLog` entry for `cli v0.17.0`; the CLI version in `cli/package.json` and its lock
      file (D3).
- [ ] Run a readability review against `u8g2gl-standards` over every changed file, and fix what
      it finds.
- [ ] Final verification, suites one at a time:
      - the framework Wasm build and the Wasm tests;
      - CLI, lint and tsc;
      - designer unit;
      - e2e (after `build:e2e`), then production;
      - `refresh-goldens.mjs`, which must give an empty diff;
      - `check-package`.
- [ ] **Completion report** appended below: commits per WO, suite results, the impact-preview
      measurement, and anything left open or found outside the boundary. Do not fix things
      outside the boundary; report them.

# Completion report

*(Worker appends here.)*
