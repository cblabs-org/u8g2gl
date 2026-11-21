---
name: e-2k3-wo1-wo4
description: Work Orders of E-2k3 (re-checked) — a shared reference finder and the subjects table, rename across files from Rename… and from the name field, style cards and consts with usage and removal guards, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work, including E-3b (sample sets and their columns), a CLI `rename`
  command, the "Assets" activity view, or either foundation repository.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `e-2k-project-editors`.
- **Binding:** [RESCOPE-E-2k3.md](RESCOPE-E-2k3.md), its rulings 1–15, L1–L3 and amendments M1–M3, N1 (as corrected by N1′) and N2. It supersedes
  [PROJECT.md](PROJECT.md)'s rulings 18–22 where they differ.
- **Still in force from PROJECT.md:** the principle (ui_spec §2, "Everything is discoverable"),
  and rulings 1, 3, 4 and 23 for how the forms edit.
- **Approval:** the owner's own words are recorded in both status logs (rule 00).
- **Read first:** the whole of RESCOPE-E-2k3.md, and `.agents/rules/03-versioning.md`.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-e2k3/wo1-subjects` (main at `8ec6da5`,
  upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e2k3/wo2-rename`, then `u8g2gl-e2k3/wo3-styles-consts`, then
  `u8g2gl-e2k3/wo4-docs-review`.
- **Boundary.** It refines RESCOPE's:
  - `designer/src/**` and `designer/e2e/**`;
  - `cli/src/core/**` for **one new pure, read-only reference-finder module** (and its tests),
    plus the exports it needs from existing modules (for example the expression tokenizer). No
    parser, validator, resolver or generator behaviour change, and no new diagnostic;
  - tests and new test fixtures;
  - `docs/ui_spec.md`, `ChangeLog`, and the CLI version (WO4).

  **Not** `include/`, `src/`, `wasm/`, the schema, the goldens, or any generated output. Anything
  else, stop and report.
- **Install:** `extern/u8g2` must be checked out at the pinned `d66b49a` (it was for E-2k2 in this
  worktree). Don't run `git submodule update`; if it's missing, stop and report. Run `npm ci` in
  `cli/` before `npm ci` and any build in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as you
  go. **Do not push.**
- **Scratch:** keep scratch files in `tmp/`, and keep every CLI `--out` inside it. Fetch nothing from
  the network beyond `npm ci` from the lockfiles.
- **Baselines.** Record them first, running the suites one at a time:
  - **Emscripten:** `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - Build the framework editor Wasm, then the CLI, before the Wasm tests and e2e:
    `emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm -j8`.
  - **Wasm tests:** run each as CI does, with `node wasm/test/<name>.test.mjs`
    (`asset-injection` included).
  - Host C++: `cmake -B build && cmake --build build -j8 && ctest --test-dir build --output-on-failure`.
  - **Designer unit tests** run under Playwright: `npx playwright test --config playwright.unit.config.ts`.
  - **e2e:** run it against `npm run build:e2e`. A production `npm run build` overwrites that build,
    so rebuild `build:e2e` before every `test:e2e`.
  - **Production:** run `npm run build`, then `test:e2e:production`.
  - **Known flakes** (report them if they fail): `design-hidden.spec.ts:144`,
    `performance.spec.ts:168` and `drag-performance.spec.ts:189` (e2e), and
    `generate-editor.test.ts` hitting vitest's 5 s limit under a full parallel run.
- **Standards:** load `u8g2gl-standards` before writing code. C++ and TypeScript naming differ; check
  §2. Put no workspace pointers in source comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright, headless, with `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** 5321 is the owner's demo server; 5399 and 5401 are the PA's. Never bind or stop them.
- **Flakes:** if a test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Versions:** never tag or publish. Bump only what WO4 names. Never bump the schema or the
  runtime.

# WO1 — The reference finder and the subjects table (`u8g2gl-e2k3/wo1-subjects`)

RESCOPE rulings 1–4, and RESCOPE finding 4.

- [ ] **The reference finder** (`cli/src/core/`, pure, read-only). Given the project's documents,
  it lists, for one name of one kind (subject, const, style, font, image), every reference, with
  its file and the exact source range of the text to replace. It covers every shape of finding 4:
  - `bind_*` attributes and `<bind_flag_if_*> subject=`;
  - manifest props typed `subject`, `style`, `font` or `image` (the manifests' data, [D-17], as
    `asset-usage.ts` already reads font and image props);
  - `<style name>` children, and a style's `font`, global or screen-local;
  - `style="<name>"` and `focus_style="<name>"` on any element (M1);
  - `style_font="<font>"` overrides (M1);
  - `#name` constant tokens in any attribute value, found through the resolver's expression
    tokenizer, never by text search;
  - every file the project loads: `u8g2gl.xml`, `globals.xml`, every screen, and every widget
    manifest wherever it lives (M1).
  - **Shadowing (M2):** on a screen that declares a local style of the same name, that screen's
    references are the local style's, not the global's. Composite templates see global styles
    only. Report shadowed references separately, so rename can list the screens it skips.
  E-2k2's `asset-usage.ts` font and image users should come from it too, with the same results plus
  `style_font` users (M3), so there's one implementation and the font removal guard counts them.
- [ ] **Unit tests** for each shape, M1's and M2's shadowing included, and `#margin` inside `#margin_top + 1` (must not
  match), a name that is a prefix of another, and a reference inside a widget template.
- [ ] **The subjects table** (`renderSection`, as `globals-editor.tsx` does for fonts):
  name, type, initial value, `max_len` (strings only) with its byte cost, and "Used by".
  - "Initial value" is headed as the value the firmware boots with; its ⓘ says it's compiled in.
  - Every field stays editable, with its inline problems, as in the generic form.
  - "Used by" lists bindings by screen and element; a click selects that element on its screen.
- [ ] **Remove is refused while a subject is used**, naming its users, through the existing
  `removeRefusal` hook.
- [ ] **e2e:** the table shows usage; a click on a user selects it; removing a used subject is
  refused; an edit in the table changes the XML and one undo restores it.

# WO2 — Rename across files (`u8g2gl-e2k3/wo2-rename`)

RESCOPE rulings 5–10 and L1–L2.

- [ ] **Rename planning** (pure, unit-tested): from the finder's references and the new name, the
  edits per document, and the generated symbols that change (old → new: `ui_set_<name>()` and the
  subject's other generated accessors, `ui_font_…`, `ui_image_…`; read the generator for the exact
  set rather than guessing it).
- [ ] **Refusals before any write** (ruling 8): an invalid name, a name already taken by the same
  kind, or a file that would be touched but doesn't parse, each naming the reason or the file.
- [ ] **The rename dialog.** "Rename…" on every subject, const, style, font and image. It shows the
  new name's field, then each file with its number of changes and the symbols that change, with a
  note that application code calling the old symbols isn't changed and won't compile until it's
  updated by hand (L2). It says each file is undone on its own. Renaming a global style lists the
  screens skipped because a local style of the same name shadows it (M2).
- [ ] **Applied as one edit per document**, each its own undo step in its own document, as E-2k2's
  "Browse fonts…" does across two documents.
- [ ] **The name field asks** (ruling 10, L1). When a name field commits a change and the old name
  has references, the same dialog opens, headed "You're renaming *old*. Rename it in the files that
  reference it too?", with three choices:
  - **Rename everywhere:** the declaration and every reference;
  - **Only here:** the one `globals.xml` edit, as today, leaving the validator to flag the rest;
  - **Cancel:** nothing is written, and the field shows the old name again.
  A name with no references commits straight away, with no dialog.
- [ ] **e2e:** rename a subject used on two screens; both screens and `globals.xml` change; undo in
  one screen restores only that screen. The name field's three choices. A refused rename writes
  nothing.

# WO3 — Styles and consts (`u8g2gl-e2k3/wo3-styles-consts`)

RESCOPE rulings 11–13.

- [ ] **Style cards.** One per style, keeping the §10 fields driven by `STYLE_PROPERTIES`, plus:
  - **a preview:** a sample label in that style, drawn by the real renderer through a one-screen
    project over the project's own `globals.xml`, as the Fonts view's ruler is
    (`designer/src/fonts/font-view-model.ts`). It redraws when the style changes;
  - **"Used by"**, by screen and element, from the finder;
  - **the radius bound** (§10): the largest radius the style's literal-sized users allow, naming
    the smallest of them. It explains the validator's existing check and adds no rule; with no
    literal-sized user it says so.
- [ ] **Consts:** name, type, value, and "Used by": every `#name` reference by file and attribute.
- [ ] **Remove is refused while a style or const is used**, naming its users. Every globals kind is
  then guarded.
- [ ] **Unit tests** for the radius bound. **e2e:** a style edit redraws its preview; removing a
  used style and a used const is refused; a const's "Used by" lists a reference inside an
  expression.

# WO4 — Docs and review (`u8g2gl-e2k3/wo4-docs-review`)

- [ ] **N1 first, on this branch, as corrected by N1′:** the style card's preview draws a label and a
  button side by side in the style, each captioned with what it really draws (RESCOPE N1′). The
  `border` field notes that no element draws it yet. e2e: an `invert` and a `radius` edit each show
  on the button.
- [ ] **N2, on this branch:** every removal guard (subjects, consts, styles, fonts, images) counts every
  reference the finder finds, widget templates and prop defaults included (RESCOPE N2). Unit and e2e:
  a font named only inside a widget template can't be removed.
- [ ] **ui_spec:** §6.4, the subjects table, the style cards, consts, Rename… and the name field's
  question; §14, rename as one undo step per document.
- [ ] **ChangeLog.** CLI **0.24.0 → 0.25.0**, everywhere `check-package` checks.
- [ ] **Readability review** of the branch against `u8g2gl-standards`, with the findings fixed.
- [ ] **All suites, one at a time.**
  - `refresh-goldens.mjs` gives an empty diff.
  - `check-package` passes at 0.25.0.
  - The home-path guard is clean.
- [ ] **Completion report,** appended to this file: per WO, the commits, the deviations and the open
  items, and the generated-symbol set WO2 found.

# Stop and report if

- Anything outside the boundary needs to change.
- A reference shape exists that finding 4 doesn't list, or one can't be located to an exact range.
- A rename can't be applied as one edit per document with per-document undo.
- Any approved ruling turns out to be wrong in the code.
