---
name: e-6-wo1-wo4
description: Work Orders of E-6 — U8G2 font facts and pre-rendered samples, a font picker on adding or changing a built-in font, a file chooser with import for BDF fonts and images, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work: nothing in either foundation repository, nothing from E-3.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-6-asset-pickers` ([PROJECT.md](PROJECT.md)). Rulings 1–8 bind this PR, with
F1 settled as **(b)** (pre-rendered samples), F2 **yes** (images too) and F3 **CLI 0.21.0**. Read
the whole of PROJECT.md first, especially "What the code says". The owner's approval is recorded
in its status log (rule 00). Read `.agents/rules/03-versioning.md` before WO4.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e6/wo1-font-facts` (based on main at `dd5454e`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e6/wo2-font-picker`, then `u8g2gl-e6/wo3-file-chooser`, then `u8g2gl-e6/wo4-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit (`d66b49a`). Don't touch
  it, and don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build
  in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles. Any CLI `--out` path stays inside the worktree's `tmp/`.
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
  the owner's desktop. Playwright's own `filechooser` event is how e2e drives the import; never a
  real OS dialog.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind
  them, never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to
  pass.
- **Versions:** never tag, never publish. Bump only the CLI, to 0.21.0, in WO4. No schema or
  runtime change, and no golden may move.

# WO1 — font facts and samples (`u8g2gl-e6/wo1-font-facts`)

- [ ] **The suffix table** (ruling 4), in core (for example `cli/src/core/catalogue/font-facts.ts`,
      exported from its index; no node imports, because the designer bundles it).
      - `fontFacts(name)` returns the glyph box (`t`, `h`, `m`, `8`, with readable labels:
        transparent, common height, monospace, 8×8) and the character set (`f`, `r`, `u`, `n`,
        `e` and any others U8G2 uses, with readable labels). Each value is `undefined` when the
        table doesn't know it, never a guess.
      - Take the convention from U8G2's own source or documentation in `extern/u8g2` (the font
        build tool under `tools/font/`, or the docs). Cite the file in the doc comment. Also cite
        the wiki page `https://github.com/olikraus/u8g2/wiki/fntlistall`, which the picker links.
      - A test runs every name in `cli/src/data/u8g2-fonts.json` through it and checks the list
        of unknowns against a committed expectation, so a new unknown is a visible diff.
- [ ] **The samples** (ruling 6), rendered by U8G2 itself, natively:
      - Add a small host C++ program (for example under `tools/font-samples/`, with its own CMake
        target, not built by default and not part of ctest's default build). It compiles the
        vendored `u8g2_fonts.c` and renders one sample line per built-in font into a U8G2 full
        buffer (`u8g2_Setup_null` or a memory display), at the font's own height.
        - Sample text: `AaBbGg 0123`, or the font's digits only for an `n` set.
        - Crop the buffer to the drawn width and height, and pack it 1 bit per pixel.
      - A node script (beside `build-catalogue.ts`, wired as an npm script the way the catalogue
        is) runs it and writes `cli/src/data/u8g2-font-samples.json`, committed:
        `{ name: { w, h, bits } }`, with `bits` in base64.
      - The font list comes from `u8g2-fonts.json`, so no list is typed by hand. A font in the
        list that the renderer can't find is a build error naming it.
      - Measure the file. **If it exceeds 2 MB, stop and report** with the size and a breakdown;
        don't ship it.
      - Reproducible: running the script twice gives a byte-identical file. A test covers every
        name in `u8g2-fonts.json`, checks every sample has a non-zero size, and checks that `bits`
        decodes to `ceil(w*h/8)` bytes.
      - The file must not enter the designer's initial bundle. It's loaded only when the picker
        first opens: a dynamic `import()` that Vite splits, or a static file the design server
        already serves. Choose the one that needs no new server route, and say which.
- [ ] **Package:** check that `check-package` still passes and note the tarball's change in size.

# WO2 — font picker (`u8g2gl-e6/wo2-font-picker`)

- [ ] **`FontPicker`** in `designer/src/forms/`, modelled on `DisplayPicker`
      (`project-editor.tsx`): inline, not modal, with the same CSS conventions. It has:
      - the current font, its facts (height, set, box) and its sample, with a "Change font…"
        toggle;
      - a search, with the display search's word matching;
      - filters for height (a min–max range), character set and box/monospace;
      - result rows showing name, height, decoded set and the sample drawn on a small canvas
        (1-bit, scaled up with crisp pixels);
      - fonts the project already declares marked;
      - the `fntlistall` link.

      Keep the model logic (search, filters) in a separate, unit-tested `*-model.ts`, as
      `display-picker-model.ts` does.
- [ ] **On add** (ruling 1). "+ Built-in font" opens the picker instead of inserting an empty
      element. Choosing inserts `<builtin name="…"/>` through the form's existing edit path as one
      undo step; cancelling inserts nothing. Find the cleanest hook in `form-view.tsx`'s
      `form-add` and the form controller. A per-kind "add with chooser" is preferred to a special
      case scattered through the code; document the hook.
- [ ] **On change** (ruling 2). A `<builtin>`'s `name` field renders the picker, as `display/setup`
      does in `project-editor.tsx`. The text stays editable.
- [ ] **Tests:**
      - unit: search, filters, facts, the declared marking;
      - e2e on a demo copy: "+ Built-in font" opens the picker; a search and a choice add one
        `<builtin>` and one undo step removes it; Cancel adds nothing; "Change font…" swaps the
        name; the sample canvas is drawn (non-blank pixels); the initial page load doesn't
        request the samples file (check the network log).

# WO3 — file chooser (`u8g2gl-e6/wo3-file-chooser`)

- [ ] **`FileChooser`** in `designer/src/forms/`, for a path field of a given type (ruling 5):
      - the project's files of that type: `.bdf` for `<bdf>`, `.xbm` for `<xbm>`, `.png` for
        `<convert>`, each with path and size, and the current one selected;
      - "Import from your computer…" opens the browser's file input, limited to the type. It
        proposes `fonts/<file>` (fonts) or `images/<file>` (images), editable. It writes with
        `PUT /api/file` and "must not exist". A path that exists is refused with a clear message,
        and nothing is overwritten. It says that an import is a file write, which undo doesn't
        remove.
      - Take the file list from what the form already has (`form-controller.ts` `paths`); add
        sizes only if the existing `/api/files` response carries them, otherwise show none. No new
        server route.
- [ ] **On add** (ruling 1): "+ BDF font", "+ XBM image" and "+ Converted image" open the chooser.
      Choosing adds the element with `src` and a `name` derived from the file name: lower-cased,
      non-identifier characters to `_`, a leading digit prefixed, and made unique among the
      project's fonts or images. `<convert>` also needs `width` and `height`; read them from the
      PNG's header in the browser, and if that fails leave them for the author, with the field
      flagged. One undo step; cancel adds nothing.
- [ ] **On change** (ruling 2): those `src` fields render the chooser behind "Choose file…"; the
      text stays editable.
- [ ] **Tests:**
      - unit: listing by type, name derivation and uniqueness, the PNG header read, refusing an
        existing path;
      - e2e: "+ BDF font" offers the project's `.bdf` (plant one in the demo copy); choosing it
        adds `<bdf>` with the derived name; Import (Playwright `filechooser`) writes the file under
        `fonts/` and adds the element, and the file exists on disk; importing an existing name is
        refused and the disk is unchanged; Cancel adds nothing; "+ Converted image" with a PNG
        fills `width`/`height`.

# WO4 — docs and review (`u8g2gl-e6/wo4-docs-review`)

- [ ] **ui_spec §6.4**: the font picker and the file chooser, on add and on change.
- [ ] **design_spec §14.1/§14.2**: how the designer adds a font or an image; the samples file and
      how it's built ([D-14]'s pattern).
- [ ] **`ChangeLog`:** `cli v0.21.0`.
- [ ] **CLI 0.21.0** in `cli/package.json` and the lockfile.
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
      - `node scripts/check-package.mjs` (PASS at 0.21.0, with the tarball size).
- [ ] **Completion report** appended below:
      - commits per WO;
      - suite results, with baselines;
      - the samples file's size and how it loads;
      - the suffix unknowns;
      - anything found outside scope;
      - any deviation, and why.

# Completion report

*Worker report, 2026-11-15.* Authorization checked from the committed files: this work order
names `e-6-asset-pickers`, and its PROJECT.md status log records the owner's "Approve E-6".
Nothing pushed, tagged or published.

## Commits per WO

| WO | Branch | Commit |
|---|---|---|
| WO1 | `u8g2gl-e6/wo1-font-facts` | `6d55666` feat(catalogue): font facts and pre-rendered samples of every built-in font |
| WO2 | `u8g2gl-e6/wo2-font-picker` | `ecfe555` feat(designer): font picker on adding or changing a built-in font |
| WO3 | `u8g2gl-e6/wo3-file-chooser` | `72eb1f3` feat(designer): file chooser with import for BDF fonts and images |
| WO4 | `u8g2gl-e6/wo4-docs-review` | `b6f1148` docs: font picker and file chooser; CLI 0.21.0; this report on top |

## Suites, with baselines (each run alone)

| Suite | Baseline (main `dd5454e`) | Final (WO4) |
|---|---|---|
| Framework Wasm build + 4 Wasm tests | pass, 4/4 | pass, 4/4 |
| Host build + ctest | 520/520 (1 skipped: `SizeOfReport.ThirtyTwoBitTarget`), 0 warnings | 520/520 (same skip), 0 warnings |
| CLI vitest | 3008 passed, 23 skipped | 3023 passed, 23 skipped (+13 font facts/samples, +2 writeBytes contract) |
| CLI lint, tsc | pass | pass |
| Designer typecheck | pass | pass |
| Designer unit | 266 | 283 (+10 font picker, +7 file chooser) |
| e2e (`build:e2e`) | 127 | 133 passed, 1 failed, see below; 134 with the rerun (+3 font picker, +4 file chooser) |
| Production (`build`, `test:e2e:production`) | 3 | 3 |
| `refresh-goldens.mjs` | — | no diff |
| `check-home-paths.mjs` | clean | clean |
| `check-package.mjs` | PASS 0.20.0, 15,426,399 B | PASS **0.21.0, 15,730,169 B** (+303,770 B; unpacked +1,283,781 B) |

**Flake, reported:** the final full e2e run failed the known `design-hidden.spec.ts:144` (canvas
pixels after a reload, `256x64:1b0189bd` for `b64b7798`). Re-run alone it passed. It passed in
the baseline and in the full WO2 (130/130) and WO3 (134/134) runs; it touches no form code.

## The samples file

- `cli/src/data/u8g2-font-samples.json`: **1,248,291 bytes (1.19 MiB), 294,560 bytes gzipped**,
  under the 2 MB cap. 2039 samples; largest `logisoso92_tn` (577×111).
- Reproducible: a clean rebuild (`rm -rf build/font-samples`) gives a byte-identical file, checked
  twice, the second after WO4's comment edit to the renderer. The renderer builds with 0 warnings.
- **Loading: a dynamic `import()`**, not a server route. Vite emits it as its own chunk
  (`u8g2-font-samples-*.js`, 1.22 MB, 294 kB gzip), absent from `index.html`; the e2e checks the
  page load fetches nothing and the first picker fetches it once.
- Sample text: `AaBbGg 0123`, `0123456789` for an `n` font, else the font's first 8 glyphs from
  33 up when it has no glyph of the text (icon fonts). Cropped to the lit width and to the font's
  own box height (widened only if a glyph overhangs).

## The suffix unknowns

19 of 2039, all bare-number postfixes whose meaning is a per-font map file or Unicode block:
`gb16st_t_1/2/3`, `gb24st_t_1/2/3`, `siji_t_6x10`, and `unifont_t_` + `0_72_73`, `0_75`, `0_76`,
`0_77`, `0_78_79`, `0_86`, `72_73`, `75`, `76`, `77`, `78_79`, `86`. Listed in
`cli/test/catalogue/font-facts.test.ts`. A second test checks every custom postfix in the table
is one `build.c` writes.

## Deviations, and why

1. **Core gains `ProjectFileSystem.writeBytes()`.** The interface wrote only text, and an imported
   PNG is binary. It is the bytes twin of `write()`, reaching the same `writeChecked()` and the
   same `PUT /api/file`; no server change, no new route. Covered by the shared contract test.
2. **`tools/font-samples` defines `U8G2_USE_LARGE_FONTS`.** `u8g2.h` enables it for unix, ARM
   and ESP targets, not for a macOS host, and 63 of the listed fonts compile only under it.
3. **`project-form.spec.ts` changed one test.** Its Explorer-count step clicked
   "+ Built-in font" and expected Fonts (3); that button now opens the picker, so the test chooses
   a font. Not weakened: the count is still asserted.
4. **`FieldTextControl` exported from `form-controls.tsx`**, so the pickers keep the plain text
   box ("the text stays editable").
5. **Add hook:** `FormView` takes an `AddChooser` (`has(kind)`, `render(...)`), supplied per kind
   by the new `globals-editor.tsx`; `FormActions.add` carries the chosen values into the one add
   edit. Documented in form-view.tsx's header.
6. **A `<convert>` whose PNG header cannot be read** is added with `width=""` and `height=""`, so
   the validator flags both fields, rather than a seeded `0`.
7. **The readability review was done by me against `u8g2gl-standards`** (headers, Purpose,
   Doxygen, banners checked with the skill's awk, why-comments, no workspace pointers), not by
   spawning the `readability-reviewer` agent. One fix: the renderer's static buffers were
   undocumented.

## Found outside scope

- **63 `<builtin>` fonts exist only under `U8G2_USE_LARGE_FONTS`** (`u8g2_fonts.c`). The
  validator and the picker offer them on every target, but on a target where `u8g2.h` does not
  enable the macro (AVR, or any host that is not unix/ARM/ESP) they fail to link. The picker could
  mark them, and the validator could warn, but that needs a per-target rule.
- **Custom field controls ignore the form's read-only state.** The display picker, and now the
  font picker and file chooser, stay enabled while the text cannot be read; the controller still
  refuses the change, so nothing is written.
- **Changing a `<convert>`'s `src` with "Choose file…" does not update `width`/`height`**; a PNG
  of another size is then refused by the validator, as before. Doing both would be two field
  edits or a new change kind.
- `/api/files` carries no sizes, so the file chooser shows none, as the WO allowed.
- The worktree's local `main` ref is behind `dd5454e`; diffs here are against `dd5454e`.
