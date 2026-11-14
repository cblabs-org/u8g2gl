# E-2k: Visual editors for `u8g2gl.xml` and `globals.xml`, and fonts by injection

**Status: approved 2026-11-14** (see the status log). E-2k1 is in progress.

**Base:** `origin/main` @ `50a0cba` (#55 merged). CLI 0.16.5, runtime 0.12.0, schema 0.6.
**Shape:** three PRs, in sequence: E-2k1, then E-2k2, then E-2k3. Each targets `main` and is
merged with a merge commit (rule 04). E-3a (`../e-3-sample-data/PROJECT.md`) can run alongside
E-2k3, after E-2k2.

## Owner direction (2026-11-14, in their own words)

> "in the explorer I want to think about what happens when we select the globals.xml or the
> u8g2gl.xml files at the top. It shows the xml but I think we shoul dprovide visual editors for
> those two - specifically (1) having a list of supported board codes to select from and
> information about eahc of the possible boards. (2) having a list of fonts to select from ,
> manage and add in as needed (e.g. if we have a custom font etc) - and possibly (3) a visual
> eitor for the subjects etc."

On the PA's first proposal the owner answered:

> "We should cover ALL the potential functionality. The UI is the main route for discovery of
> the properties. No one reads manuals these days, so if you don;t show somehting is there, then
> people won;t know it is there. That's a principal we should record and aspire to. It's one of
> the most significant failures of the LVGL editor is that it is incomplete so you can't
> discover."

> On the character range of a custom font: "Should this not be automated?"

> "We should not precompile fonts into the wasm if the wasm is fixed. (well - maybe one as a
> fall-back on failure) so we definitely need an injection route for more fonts and custom fonts
> as a default I would say."

Sample data was split out to its own project, E-3 (`../e-3-sample-data/PROJECT.md`). The
owner asked for both plans to be drafted: "Draft both plans".

## Findings (confirmed 2026-11-14 at `50a0cba`)

| # | Topic | Today |
|---|---|---|
| 1 | Opening the two files | The Explorer's Project group lists `u8g2gl.xml` and `globals.xml`. Selecting either shows XML only |
| 2 | Vocabulary, `u8g2gl.xml` | `parse-project.ts`: root `schema`, `name`, `version`; `<targets>`/`<target>` with `name`, `setup`, `rotation`, `ram_budget`; an optional `<display>` child carrying `setup`/`rotation`/`ram_budget`; bus `cs`, `dc`, `reset`, `address` from a `<bus>` child **or** from attributes on `<display>`/`<target>`; `<output dir prefix>`. Several equivalent spellings are accepted |
| 3 | Spec drift | design_spec §5.1's example writes `default="true"` on a target, but `parse-project.ts` never reads `default`. The designer uses `targets[0]` (`live-pipeline.ts:174`, `insert-element.ts:200`). Multi-target in the designer is open question **U-3** |
| 4 | Vocabulary, `globals.xml` | `<consts>` (int, string), `<subjects>` (int, string with `max_len`, bool, time; `value`), `<styles>` (the nine §10 properties, declared once in `STYLE_PROPERTIES`), `<fonts>` (`<builtin name>`, `<bdf name src range>`), `<images>` (`<xbm name src>`, `<convert name src width height mode threshold>`) |
| 5 | No declarative vocabulary | Apart from `STYLE_PROPERTIES`, the vocabulary exists only as parser code and TypeScript interfaces. Nothing a UI or a test could enumerate |
| 6 | Display catalogue | `cli/src/data/catalogue.json`: 1,637 full-buffer setups over 81 controllers. Each has width, height, tiles, framebuffer bytes, bus family and wiring, x-offsets and driver. No photos, datasheets or pinouts |
| 7 | Built-in fonts | `cli/src/data/u8g2-fonts.json`: 2,039 names. `framework/extern/u8g2/csrc/u8g2_fonts.c` already ships in the npm package (`check-package.mjs`) |
| 8 | Fonts in the editor Wasm | `wasm/bridge.cpp` resolves every font and image through the project's generated `ui_editor_asset()`, compiled in. A font is drawable only if it was compiled into the loaded Wasm. The bridge's own fallback, `u8g2_font_4x6_tr`, is built in |
| 9 | Custom fonts | `<bdf>` is compiled by the bdfconv Wasm, byte-identical to native bdfconv (design_spec §14.1). An absent `range` means every glyph in the file |
| 10 | Undo | Per document only. Cross-file undo is excluded (ui_spec §14) |
| 11 | Principles | ui_spec §2 principle 1 is "Lean, not comprehensive", which conflicts with the owner's discoverability principle as written |

## The principle (the owner's, to be recorded)

ui_spec §2 gains a principle, and principle 1 is reworded so the two cannot be read against
each other:

> **1. Lean in machinery, complete in reach.** A monochrome screen has 5–20 elements and the
> tool should feel proportionate to that: no machinery the job does not need. But nothing the
> schema can express is out of reach.
>
> **8. Everything is discoverable.** Every capability the schema offers has a visible, editable
> home in the UI. People learn a tool by looking at it, not by reading its manual, so a feature
> the UI does not show is a feature that does not exist for them. An incomplete editor is the
> incumbent tools' central failure; this one is complete by construction, and a test holds it
> there.

The wording is the PA's proposal; the owner may change it.

## How "complete by construction" works

A **vocabulary descriptor** for the two files: one declarative table per element (its
attributes, their types, allowed values, defaults, help text, and which bus family or condition
they apply to). It lives in `cli/src/core/schema/` beside `STYLE_PROPERTIES`, which is already
this pattern.

- **The forms are built from it**, as the property panel is built from widget manifests.
- **The parser and validator are tested against it.** A **coverage test** fails when an
  attribute the parser reads is missing from the descriptor, or a descriptor entry has no
  control in the form. So a schema addition cannot silently leave the UI behind.
- It is also where help text lives, so every field has an ⓘ, as principle 6 requires.

## PA rulings (binding once approved)

### Shared shell (E-2k1)

1. **The form sits beside the XML, not in place of it.** Opening either file shows *form ∥
   XML*. The form takes the canvas half of the existing split, and the XML stays live beside it.
   Every form edit is a text edit through the existing CST path and per-document undo, so
   comments and formatting survive (principle 5). A selection in the form highlights its XML
   range, and the cursor in the XML selects its form section.
2. **Explorer sections.** `u8g2gl.xml ▸ Project · Targets ▸ <each> · Output` and
   `globals.xml ▸ Subjects (n) · Fonts (n) · Images (n) · Styles (n) · Consts (n)` nest like
   E-2j's element rows. A click opens the file and scrolls to that section. Counts come from
   the current buffer.
3. **Reading and writing.** The form reads every accepted spelling (finding 2). An edit to an
   existing value is written where that value already lives. Anything new is written in one
   canonical form, the one design_spec §5.1 shows: `<target name>` containing `<display setup
   rotation …>`. A file the parser cannot read keeps the last good form, read-only, with the
   problem shown, as the canvas does.
4. **Validation is shown where you edit.** Each field shows its own diagnostics inline, with
   the same codes and wording as the Problems panel.

### `u8g2gl.xml` (E-2k1)

5. **Project section.** `name` and `version` are editable. `schema` is shown read-only, with
   its meaning in the ⓘ: a schema bump is the owner's and the CLI's migration path, never a
   field edit.
6. **The display picker.**
   - Guided steps: **controller**, then **size and variant** (e.g. 256×64 NHD), then **bus
     wiring** (4-wire HW SPI, HW I²C …), with fuzzy search over the setup name for those who
     know the part.
   - Every option shows what the catalogue knows: pixels, framebuffer bytes, bus family and
     wiring, driver, and tiles. Nothing the catalogue lacks is invented; the controller links to
     its U8G2 wiki page.
   - **Bus fields follow the bus family.** I²C shows `address`; SPI shows `cs`, `dc`, `reset`;
     parallel shows its own. A field that does not apply is not shown, and a value already in
     the file for a field that no longer applies is flagged, not silently dropped.
   - `rotation` (R0–R3, shown with degrees) and `ram_budget` (with the current budget figure
     beside it).
7. **Impact preview.** Before a new setup is committed, the picker shows a thumbnail of every
   screen rendered at the candidate geometry, with elements that would fall outside the display
   marked. It renders in a second editor-module instance with the candidate in memory only. If
   WO1 measures that as too slow for the project's screen count, it previews the active screen
   only and records the measurement.
8. **Targets.** Add, rename, reorder and remove targets. **Owner decision D1 below** settles
   what the canvas does with more than one.
9. **Output section.** `dir` and `prefix`, with the generated paths and symbol prefix shown as
   a live example.
10. **Spec drift (finding 3).** design_spec §5.1's `default="true"` is corrected to the actual
    rule (the first target is the default), unless D1 changes it.

### Fonts and images by injection (E-2k2)

11. **The editor Wasm stops depending on compiled-in fonts and images.** The bridge gains an
    injection route (editor-host code, `wasm/bridge.cpp` only): the designer passes a font's or
    an image's bytes by name, and lookup tries the injected table before the generated
    `ui_editor_asset()`. `u8g2_font_4x6_tr` stays built in as the fallback, used with a visible
    warning when a font cannot be loaded. Injected bytes are cleared with the scene, like the
    E-2j hidden set.
12. **Where the bytes come from.**
    - Built-in fonts are served by the design server from the packaged `u8g2_fonts.c`, by name,
      through a parsed and cached index. No network fetch, no new download.
    - `<bdf>` fonts are compiled in the browser by the bdfconv Wasm.
    - Images go through the existing §14.2 pipeline.
    - In every case the bytes are exactly what the firmware links, so the canvas cannot differ
      from the device. A Wasm test proves an injected built-in font renders pixel-identically to
      the same font compiled in.
13. **Rebuilds.** A font or image change no longer needs a project editor Wasm rebuild. Only
    widget code does.
14. **The Fonts view** (activity bar, enabled by this PR):
    - Browse all 2,039 built-in fonts, each drawing the author's own sample text through the
      real renderer. Fonts load lazily, as they scroll into view.
    - Filter by pixel height, character set and mode. The name suffixes are explained in
      words (`_tr` transparent, reduced to printable ASCII; `_mr` monospace, reduced; `_tn`
      digits and a few symbols; `_tf` full).
    - A glyph grid and the string ruler (ui_spec §12), so you can measure text against a width.
    - **Add to project** writes the `<builtin>` line into `globals.xml` through the CST path.
    - The label's font dropdown in the property panel ends with **Browse fonts…**, which opens
      the same view and returns the choice to that field.
15. **Custom BDF.** Drop or choose a `.bdf` file:
    - It is copied into the project's `fonts/` folder, the user agrees to the name, and the
      `<bdf>` line is written.
    - Any adjacent licence file is noted, as §14.1 records it.
16. **Character range, automated where it is safe.**
    - The default stays "no range", meaning every glyph, with its cost shown.
    - The designer derives the characters the project uses (static text, format strings,
      sample values) and offers presets, each with its byte cost: **All**, **Printable ASCII**,
      **Latin-1**, **Digits and time**, and **Only what this project uses**. The last is flagged
      as unsafe for any font used by an element bound to a string subject, because live data
      can carry characters that design time cannot see.
    - **New validator warning (CLI):** static text or a sample value using a glyph outside its
      font's declared range. That catches every case design time can see. A warning, not an
      error, and it changes no generated output.
17. **Globals sections for fonts and images.**
    - Fonts: each declared font with its kind, size cost, and how many elements and styles use
      it (click to list them). Remove is refused while it is still used, naming the users.
    - Images: each image with its source, a 1:1 preview, and for `<convert>` the threshold or
      dither choice beside its result (ui_spec §12). Add an image by choosing a file.

### Subjects, styles, consts (E-2k3)

18. **Subjects table.**
    - Columns are name, type, initial value, and `max_len` for strings (with its cost in bytes).
    - **"Initial value" is labelled as the value the firmware boots with**, and its ⓘ says it
      is compiled in. Sample values are E-3's and appear here as extra columns once E-3 lands.
    - Each row shows where it is used (bindings, by screen and element); click to go there.
19. **Rename across files.** Renaming a subject, const, style, font or image renames every
    reference in every project file. The dialog lists each file and the number of changes
    first. It is applied as one edit per document, so each file can be undone on its own, and
    the dialog says so (finding 10: cross-file undo stays out of scope).
20. **Styles.** One card per style with every §10 property, driven by `STYLE_PROPERTIES`. A
    tiny preview shows a sample label in that style through the real renderer. The card also
    shows where the style is used and the radius bound (§10).
21. **Consts.** Name, type, value, and where each is used (`#name` references).
22. **Add and delete for every kind**, with deletes refused while something still references
    the item, naming what does.

### All three PRs

23. **Testing.**
    - **Unit:** the descriptor, and the coverage test (rulings 1 and 4). Canonical writing and
      the keep-the-existing-spelling rule. Range derivation. Rename planning.
    - **Wasm:** injection (ruling 12's parity test, and clearing on teardown).
    - **CLI:** the range warning.
    - **e2e** for each section: edit in the form, see the XML change, undo it. The display
      picker changes the canvas size. Add a built-in font, use it on a label, and it renders
      with no rebuild. Import a BDF. Rename a subject across two screens.
    - Render-count and performance tests stay green.
24. **Versions.** No schema change. No runtime (`include/`, `src/`) change. The bridge is
    editor-host code. CLI **0.16.5 → 0.17.0** at E-2k1 (a new editing surface, so a minor bump,
    not a patch), then patch bumps at E-2k2 and E-2k3. If the editor registry's generated
    asset table changes shape, editor goldens move and the CLI bump already covers it
    (rule 03).
25. **Boundary** (per PR, refined in WORKORDERS.md): `designer/src/**`, `designer/e2e/**`;
    `cli/src/core/schema/**` for the descriptor only; `cli/src/node/design/**` for the font
    endpoint; `cli/src/core/validator/**` for ruling 16's warning only; `wasm/bridge.cpp`,
    `wasm/test/**`, `ci.yml` for new Wasm tests; `docs/ui_spec.md`, `docs/design_spec.md`
    (§5.1 drift, §14.1 range presets); `ChangeLog`; the CLI version. **No** runtime, schema or
    generator-output change beyond ruling 24.

## Decomposition

| PR | WO | Branch | Topic |
|---|---|---|---|
| E-2k1 | WO1 | `u8g2gl-e2k1/wo1-vocabulary` | Descriptor, coverage test, principle in ui_spec |
| | WO2 | `u8g2gl-e2k1/wo2-form-shell` | Form ∥ XML, Explorer sections, inline diagnostics |
| | WO3 | `u8g2gl-e2k1/wo3-targets` | Project, display picker, bus fields, impact preview, targets, output; D1 |
| | WO4 | `u8g2gl-e2k1/wo4-docs-review` | ui_spec, design_spec §5.1, ChangeLog, 0.17.0, review |
| E-2k2 | WO1 | `u8g2gl-e2k2/wo1-injection` | Bridge injection, font endpoint, parity test |
| | WO2 | `u8g2gl-e2k2/wo2-fonts-view` | Fonts view, Add to project, Browse fonts… |
| | WO3 | `u8g2gl-e2k2/wo3-bdf-images` | BDF import, range presets, validator warning, images |
| | WO4 | `u8g2gl-e2k2/wo4-docs-review` | Docs, version, review |
| E-2k3 | WO1 | `u8g2gl-e2k3/wo1-subjects` | Subjects table, usage, rename across files |
| | WO2 | `u8g2gl-e2k3/wo2-styles-consts` | Styles and consts cards |
| | WO3 | `u8g2gl-e2k3/wo3-docs-review` | Docs, version, review |

The detailed `WORKORDERS.md` for each PR is written when that PR starts, from these rulings.

## Owner decisions (settled 2026-11-14 by the approval: the PA's recommendation in each case)

| # | Question | PA recommendation, now the ruling |
|---|---|---|
| **D1** | **Multi-target (U-3).** Once the form can add targets, what does the canvas show? | A **target switcher in the status bar** on one canvas: the canvas, impact preview and budget follow the active target, and the active target is per-browser view state, never written to the XML. It closes U-3 in E-2k1. The alternative is to leave the canvas on the first target and say so in the form, deferring U-3 |
| **D2** | The principle's wording, and rewording principle 1 | As drafted above |
| **D3** | CLI 0.17.0 for E-2k1 | Yes: a minor bump for a new surface |

## Status log

| Date | Entry |
|---|---|
| 2026-11-14 | PA drafted this plan from the owner's direction above and sent it to the owner, asking: "Do you approve E-2k as drafted, with D1 as the status-bar target switcher?" |
| 2026-11-14 | **Owner approved, in their own words: "Approve E-2k".** That approves the whole plan as drafted: the three PRs and their decomposition, every ruling, and D1–D3 as recommended (D1: a status-bar target switcher; D2: the principle's wording as drafted; D3: CLI 0.17.0). PA created worktree `../U8G2GL-e2k1` from `origin/main` @ `50a0cba`, branch `u8g2gl-e2k1/wo1-vocabulary` (upstream unset). `extern/u8g2` checked out at the pinned `d66b49a` from the main checkout's local module clone, with no network and no config written. E-2k1 work orders are in [WORKORDERS-E-2k1.md](WORKORDERS-E-2k1.md). Worker spawned on WO1–WO4, in that order. E-2k2 and E-2k3 get their work orders when each starts. |
| 2026-11-14 | Worker completed E-2k1: WO1 (`85ed4f6`), WO2 (`c98f64e`), WO3 (`1475245`), WO4 (`9ecc18b`), report (`14cfa9a`). **PA fixes (`a09f5e3`), boundary extended to `cli/src/core/cst` for one export:** a new target's nested `<display>` is indented by the document's own step (`indentStep`, now exported) instead of two spaces; bus fields follow U8G2's constructors (I²C takes `reset`; 3-wire SPI has no `dc`); every bus field's help says `generate` does not use it yet. **Found by the PA:** nothing in the CLI reads a target's `cs`/`dc`/`reset`/`address`, and the schema cannot express the `clock`/`data` pins of U8G2's software SPI and I²C constructors. Raised with the owner as a decision; not changed here. PA verified the tip, suites one at a time: framework Wasm built; Wasm tests 4/4; CLI 2835; lint clean; designer typecheck clean; designer unit 252; e2e 120/120; production 3; `refresh-goldens.mjs` empty diff; home-path guard clean; `check-package` PASS (0.17.0, 775 files). In a browser, on the production build through the built CLI with a scratch copy of the demo (port 5399): `u8g2gl.xml` opens as form ∥ XML and a name edit rewrote one attribute in place; the picker's impact preview drew the screen at SSD1322 128×64 in 7 ms with six elements listed as outside; using it resized the canvas and one undo restored 256×64; adding a target wrote `<target name="target_1">` with a nested `<display>`; switching to it with an SSD1306 I²C setup moved the canvas to 128×64, listed the out-of-bounds problems, showed only the I²C bus fields, and disabled Run with its reason; `globals.xml` opens as a form listing every subject and font; the scratch files were never written. **Left open:** test runs build the first target only; the parser silently ignores some bus spellings (the form flags them, the validator does not); rotation lists both accepted spellings; the editor tab still reads "Canvas" on a form; the wiki link has no anchor. |
