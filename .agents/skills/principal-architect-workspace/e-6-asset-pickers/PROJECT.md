# E-6 — Pickers for fonts and asset files

*PA plan, drafted 2026-11-15 and approved by the owner the same day. Owner: "Adding a
built-in font or custom font should open a font selector or file browser. At
the moment it just gets a field with no helper, which is not much of a help."*

## Goal

Adding a font in `globals.xml`'s form opens the right chooser. Each field
that names one keeps the chooser behind a "Change…" button, as the target's
display picker already does.
- **A built-in font** opens a searchable picker over U8G2's 2039 fonts,
  showing each one's height and character set, and a rendered sample (F1).
- **A BDF font** opens a file chooser. It lists the project's `.bdf` files
  and can import one from your computer into the project.

The same file chooser serves the images' `src` (F2).

One PR, after #59 merges (both touch the form). No schema or runtime change.
CLI 0.20.0 → **0.21.0**, a designer feature. Generated output is unchanged.

## What the code says (main at `dd5454e`, after #59)

- **The fields.**
  - `<builtin name>` is a plain `string` in the vocabulary
    (`core/schema/project-vocabulary.ts`, `font-builtin`), so the form draws a
    bare text box (`designer/src/forms/form-controls.tsx`, `Control()`).
  - `<bdf src>`, `<xbm src>` and `<convert src>` are `reference to path`. They
    get a text box whose `datalist` suggests every project file, whatever its
    type.
- **"+ Built-in font"** (`form-view.tsx`, `form-add`) inserts the element with
  its required attributes empty and shows those fields. Nothing guides the
  choice.
- **The data is already shipped.**
  - `cli/src/data/u8g2-fonts.json`: the 2039 built-in font names.
  - `u8g2-font-heights.json`: their heights.
  - Both are extracted from the vendored U8G2 at catalogue build time ([D-14]),
    and `insert-element.ts` already imports the names.
- **The pattern to follow.** `DisplayPicker` (`forms/project-editor.tsx`) is
  inline, not modal: it shows the current value, a "Change display…" toggle, a
  search, stepwise columns, and a candidate committed as one edit. The
  target's snippet panel showed `nodeExtra` placing extra UI beside a node.
- **Writing a file is already possible.** The design server's
  `PUT /api/file?path=` writes bytes with an expected-version check (absent
  means create), up to 16 MB (`MAX_BODY_BYTES`), behind the session token. So
  an import needs no new endpoint.
- **No preview is possible today.** The editor Wasm links only the fonts a
  project declares (`wasm/CMakeLists.txt` compiles `u8g2_fonts.c`; the linker
  keeps the referenced fonts). So the designer can't draw an undeclared font.
  E-4b's snippet test also left the font tables out of its native build.

## Rulings

1. **Adding opens the chooser.**
   - "+ Built-in font" opens the font picker. Choosing a font adds
     `<builtin name="…"/>` as one undo step.
   - "+ BDF font" opens the file chooser. Choosing a file adds
     `<bdf name="…" src="…"/>`, with the name derived from the file name
     (made a valid identifier, unique among the project's fonts), as one undo
     step.
   - Cancelling adds nothing: no empty element is left behind.
   - The images' "+" buttons do the same (F2).
2. **The fields keep it.**
   - A `<builtin>`'s `name` shows the current font, its facts and a "Change
     font…" toggle, as `setup` does.
   - A path field shows its value and "Choose file…".
   - The text stays editable for someone who'd rather type, as with the
     display.
3. **The font picker.**
   - A search over the names, with the same word matching as the display
     search.
   - Filters: height (a range), character set, and monospace or proportional.
   - Each row shows the name, its height, its decoded set and a rendered
     sample (F1).
   - Fonts the project already declares are marked.
   - It links U8G2's font list (the wiki's `fntlistall`) for the full gallery.
4. **The suffix is decoded from U8G2's documented naming scheme.** A
   font's last token gives its glyph box (`t`, `h`, `m`, `8`) and its
   character set (`f`, `r`, `u`, `n`, `e`, …). It's one table in core, with
   its source cited, tested against every name in `u8g2-fonts.json`. A suffix
   the table doesn't know shows as unknown, never as a guess.
5. **The file chooser.**
   - It lists the project's files of the field's types: `.bdf` for a font,
     `.xbm` for `<xbm>`, `.png` for `<convert>`. Each shows its path and size,
     and the current one is selected.
   - **"Import from your computer…"** opens the browser's own file dialog,
     limited to those types. It proposes `fonts/<file>` or `images/<file>`,
     which the author can change before writing. It writes through
     `PUT /api/file` with "must not exist". It never overwrites: a name that
     exists is refused and the author is asked to rename.
   - An import is a file write, not a document edit: it isn't undone with the
     form. The chooser says so. The element that names it is the undoable
     edit.
   - The design server and its token are unchanged. No new endpoint.
6. **The font preview (F1, if (b)).**
   - The catalogue build renders one sample line per built-in font, natively,
     from the vendored `u8g2_fonts.c`, through U8G2 itself.
   - The output is a committed data file beside `u8g2-fonts.json`, as the
     catalogue is ([D-14]). It's served as a static asset and fetched when the
     picker first opens, so it never enters the designer's initial bundle.
   - Its size is measured and reported. If it exceeds 2 MB, stop and report
     rather than ship it.
7. **Everything goes through the form's existing edit path.** No new way of
   writing the document.
8. **Versions and docs.**
   - CLI 0.21.0.
   - ui_spec §6.4: the pickers.
   - design_spec §14.1/§14.2: how the designer adds a font or image.
   - ChangeLog.

## For the owner to decide

- **F1. A rendered sample in the font picker?**
  - **(a)** No: name, height, character set and the link to U8G2's gallery.
    Smaller, but you'd choose a font without seeing it.
  - **(b)** Yes (recommended): pre-rendered by the catalogue build from U8G2
    itself, loaded only when the picker opens. It's one more WO and one data
    file, estimated at 0.5–1.5 MB.
- **F2. Images too?** The same file chooser for `<xbm>` and `<convert>`'s
  `src`, and on their "+" buttons. I recommend **yes**: it's the same component,
  and the "UI complete" principle says no field should be left bare.
- **F3. CLI 0.21.0?**

## Decomposition

Worktree `../U8G2GL-e4` from `origin/main` once #59 has merged. One branch per
WO, stacked. The worker doesn't push. The PA verifies, pushes and opens the PR.

| WO | Scope | Done when |
|---|---|---|
| **WO1** font facts and preview | Ruling 4: the suffix table in core. Ruling 6 if F1(b): the native renderer in the catalogue build, the committed preview file, and its static route. | The table decodes every name or marks it unknown, with a test listing the unknowns. With F1(b), every built-in font has a sample, the size is reported, and the build is reproducible: regenerating gives an identical file. |
| **WO2** font picker | Rulings 1–3 for `<builtin>`: picker on add and on change. | Unit: search, filters, facts. e2e on a demo copy: "+ Built-in font" opens the picker; search and choose → one `<builtin>` and one undo step; cancel → no element; "Change font…" swaps it. |
| **WO3** file chooser | Rulings 1, 2 and 5 for `<bdf>`, and, with F2, `<xbm>` and `<convert>`. | Unit: listing by type, the derived name, refusing to overwrite. e2e: "+ BDF font" opens the chooser; choosing an existing `.bdf` adds `<bdf>` with a derived name; importing a file (Playwright's file chooser) writes it to `fonts/` and adds the element; an existing name is refused; cancel adds nothing. |
| **WO4** docs and review | Ruling 8; readability review. | All suites one at a time; golden refresh empty; check-package PASS at 0.21.0, with the tarball size noted; home-path guard clean. |

## Status log

- 2026-11-15 — Drafted by the PA from the owner's request.
- 2026-11-15 — **Approved by the owner.** Asked "Do you approve E-6, with my
  recommendations on F1–F3?", the owner replied, in their own words:
  **"Approve E-6"**. That settles F1–F3 as recommended:
  - F1(b): a pre-rendered sample per built-in font, capped at 2 MB;
  - F2: the file chooser serves images too;
  - F3: CLI 0.21.0.
  Work starts from main once #59 has merged, as planned.
- 2026-11-15 — #59 merged (`dd5454e`). Worktree branched from it.
