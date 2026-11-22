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

# Completion report (worker, 2026-11-21)

WO1–WO4 are done, with three stops on the way, each settled by the owner and committed by the PA
before work went on: M1–M3 (`1e855da`, reference shapes finding 4 lacked), N1 and N2 (`b6d2e6d`,
a label can't draw border, padding, radius or invert), and N1′ (`1a1c399`, no element draws a
style's `border`). Authorization was checked each time in the committed status logs. Nothing was
pushed or tagged. No schema, runtime, generator-output or golden change.

## Commits

| WO | Branch | Commit | What |
|---|---|---|---|
| WO1 | `u8g2gl-e2k3/wo1-subjects` | `4a034a6` | The reference finder (`cli/src/core/references/find-references.ts`) and its tests; `constantTokens()` exported from `expression.ts`; `asset-usage.ts` on the finder, plus `style_font` users (M3); the subjects table; the subject removal guard |
| WO2 | `u8g2gl-e2k3/wo2-rename` | `4c3c64b` | Rename planning (`designer/src/forms/rename-plan.ts`), the rename dialog, Rename… on every kind, the name field's question, refusals before any write; `checkNameRule()` exported |
| WO3 | `u8g2gl-e2k3/wo3-styles-consts` | `19ae70f` | Style cards (preview, users, shadowing screens, radius bound), constants' references, the style and constant removal guards |
| WO4 | `u8g2gl-e2k3/wo4-docs-review` | `c900b4f` | N2: every guard counts every reference the finder finds |
| | | `9a37518` | N1′: the preview is a label and a button, each captioned with what it draws; the `border` field's note |
| | | `bdabf0b` | ui_spec §6.4 and §14, ChangeLog, CLI 0.24.0 → 0.25.0, readability fixes |
| | | (this) | This report |

## Suites, run one at a time

| Suite | Baseline (`60d6c4f`) | Final (`bdabf0b`) |
|---|---|---|
| Wasm tests (`node wasm/test/<name>.test.mjs`, 6, `asset-injection` included) | 6/6 | 6/6 |
| Host C++ (ctest) | 530/530 (1 skipped) | 530/530 (1 skipped) |
| CLI vitest | 3185 passed, 23 skipped | 3200 passed, 23 skipped |
| CLI lint (eslint and `tsconfig.test.json`) | — | clean |
| Designer unit (Playwright) | 302 | 316 |
| e2e (`build:e2e`) | 135 passed, 12 skipped | 148 passed, 12 skipped |
| Production e2e (`npm run build`) | 3 | 3 |
| `refresh-goldens.mjs` | — | empty diff |
| `check-package` | — | PASS, `u8g2gl-0.25.0.tgz` (packed as `0.25.0-dev.1` in its own clone; no tag here) |
| Home-path guard, and its self-test | — | clean; 11/11 |
| `scripts/release-version.test.mjs` | — | 37/37 |

No known flake failed on either run.

## The generated symbols a rename changes

Spelt by the generator's own `mangle.ts` functions, never restated:

| Kind | Symbols |
|---|---|
| subject | `ui_set_<name>()`, `ui_subject_<name>` |
| font | `ui_font_<name>`; a `<bdf>` also `ui_fontdata_<name>` |
| image | `ui_image_<name>` |
| style | `ui_style_<name>` |
| constant | none: it is resolved at build time |

## Deviations and decisions

Accepted by the PA: 1, 2 and 4–8. N2 replaced 3.

1. A typed prop's `default` in a widget's `<api>` (`type="subject" default="station"`) is a
   reference (`prop-default`), read as part of "manifest props typed …".
2. `checkNameRule()` is exported from `validate-identifiers.ts`, so rename refuses exactly the
   names the validator reports. Outside the finder module; an export, no behaviour change.
3. *(Replaced by N2.)* The font and image guards had kept E-2k2's scope plus `style_font`. They
   now count every reference, widget templates and prop defaults included.
4. The font picker's *Change font…* commits through the name field, so on a used font it asks
   the rename question. `font-picker.spec.ts` takes *Only here*.
5. Renaming a `<builtin>` swaps it to another U8G2 font: the new name must be one U8G2 bundles.
6. The radius bound counts users that apply the style by `<style>` child, `style=` or
   `focus_style=`, with literal `width` and `height`; a user with its own `radius` or
   `style_radius` is left out, since its own value wins (§10).
7. In `globals.xml`, `#name` tokens are read in every attribute except names and `<consts>`
   values.
8. `fonts-view.tsx` exports `drawProject`, `paint`, `Drawing` and `NO_ASSETS`, and
   `font-view-model.ts` gains `viewProjectTexts()`, so the style preview draws by the Fonts
   view's route.

Also, by design and within the rulings:

- The finder tells files apart by their root element (`globals`, `screen`, `widget`, anything
  else read for `#name` only), so a widget manifest is found wherever it lives (M1). A range is
  exact past an entity reference earlier in a value.
- Rename refuses a new style name that a screen's own style already has, naming the screen: it
  would shadow the renamed style there.
- A rename opens every file it touches before planning, then plans once, because opening a
  document can write the names [U-1] supplies.
- "Only here" writes the name as typed in the dialog's field.

## Open items

- **No element draws a style's `border`** (N1′): the button frames itself from its own
  `border_width`. The runtime gap waits for its own plan; the card's `border` field says so.
- A button's `padding` shows only beside a left or right alignment, as the runtime draws it.
- Sample values (E-3b) are not yet columns of the subjects table.
- e2e renames a subject; the other four kinds' renames are covered by unit tests.
- `u8g2gl.xml` holds no references today; it is read for `#name` only, in case.
