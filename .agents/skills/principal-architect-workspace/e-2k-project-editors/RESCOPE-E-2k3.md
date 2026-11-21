# E-2k3 (re-checked): subjects, styles, consts, and rename across files

*PA plan, drafted 2026-11-21 against main @ `8ec6da5` (#63 merged). **Approved by the owner 2026-11-21** (status log).*

E-2k was approved on 2026-11-14 ("Approve E-2k"); rulings 18–22 are E-2k3's.
This re-checks them against the code as E-2k1, E-2k2 and E-3a left it. Anything
below that differs from an approved ruling is marked **changed** and is listed
for decision.

## What the code says now

| # | Finding |
|---|---|
| 1 | **Subjects, styles and consts are already editable, generically.** E-2k1's vocabulary-driven form shows every subject type, every §10 style property (from `STYLE_PROPERTIES`) and both const types, with add, remove, reorder and inline problems. Nothing is XML-only today |
| 2 | **What's missing is everything beyond the attributes:** no table layout, no "where is this used", no removal guard (E-2k2 added both for fonts and images only, in `asset-usage.ts`), no style preview, no radius bound, no rename |
| 3 | **The subject value's help already says it's compiled in** ("The value the firmware boots with, compiled in"), so ruling 18's labelling is half there |
| 4 | **References come in five shapes**, all in screens and `widgets/*.xml`: `bind_*="subject"` attributes and `<bind_flag_if_*> subject=`; manifest props typed `subject`, `style`, `font` or `image`; `<style name>` children; a style's `font`; and `#name` inside any attribute value, including expressions such as `#margin + 4` (the resolver's tokenizer, `expression.ts`) |
| 5 | **Renaming changes generated API.** A subject's name is in `ui_set_<name>()`; a font's and image's in `ui_font_…`/`ui_image_…`. Application code calls those, and U8G2GL never edits or scans application code (K5) |
| 6 | **Cross-document edits already exist.** E-2k2's "Browse fonts…" makes one edit in `globals.xml` and one in a screen, each undone in its own document. A rename is the same thing across more documents |
| 7 | **Sample values have no home yet.** E-3a shipped the data shape; sample sets and their columns in the subjects table are E-3b, which waits for this PR |

## Rulings

### WO1: subjects (ruling 18, ruling 22 for subjects)

1. **A subjects table replaces the generic section** (through `renderSection`, as E-2k2 did for fonts). Columns: name, type, initial value, `max_len` (strings only) with its cost in bytes, and "Used by".
2. **"Initial value" is headed as the value the firmware boots with**, and its ⓘ says it's compiled in. E-3b adds one column per sample set beside it.
3. **"Used by"** lists each binding by screen and element, found through all of finding 4's subject shapes; a click selects that element on its screen.
4. **Remove is refused while a subject is used**, naming its users, as fonts and images already are.

### WO2: rename across files (ruling 19)

5. **"Rename…" on every subject, const, style, font and image.** The dialog takes the new name, then lists every file with its number of changes before anything is written.
6. **It's applied as one edit per document**, so each file is undone on its own, and the dialog says so (finding 10: cross-file undo stays out of scope).
7. **References are found structurally, never by text search.** Attribute values are matched whole; a `#name` is renamed only where the expression tokenizer reads a constant token, so `#margin` in `#margin_top + 1` is untouched.
8. **Refused before any write** when the new name is invalid or already taken by the same kind, or when a file it would touch doesn't parse (it can't be planned safely), naming the file.
9. **Changed (new): the dialog names the generated symbols that change** (finding 5), e.g. `ui_set_station()` → `ui_set_origin()`, and says application code that calls the old one won't compile until it's updated by hand. Decision L2.
10. **Changed (owner, L1): editing the name field asks.** Fields commit only on Enter or blur, never while typing, so the question comes once per change. When the old name has references, the commit opens the same rename dialog as Rename…, headed "You're renaming *station*. Rename it in the files that reference it too?", with the file list and the symbols that change. It offers three choices:
    - **Rename everywhere:** the declaration and every reference, one edit per document;
    - **Only here:** today's behaviour, one edit in `globals.xml`, with the dangling references flagged by the validator;
    - **Cancel:** nothing is written, and the field goes back to the old name.

    A name with no references commits straight away, with no question.

### WO3: styles and consts (rulings 20–22)

11. **One card per style**, holding the existing §10 fields (still driven by `STYLE_PROPERTIES`), plus:
    - **a tiny preview**: a sample label drawn in that style by the real renderer, as the Fonts view draws its ruler (a one-screen project over the project's own `globals.xml`). It shows padding, border, radius, invert and alignment as the device will;
    - **"Used by"**: elements with a `<style>` child or a style-typed prop, and styles' users are listed by screen;
    - **the radius bound** (§10): the largest radius the style's literal-sized users allow, `min(width, height) / 2` of the smallest, with that element named. It explains the validator's existing error; it adds no new rule.
12. **Consts:** name, type, value, and "Used by": every `#name` reference, by file and attribute.
13. **Remove is refused while a style or const is used**, naming its users. With WO1, every globals kind is then guarded.

### WO4: docs and review

14. **Docs:** ui_spec §6.4 (the subjects table, style cards, consts, Rename…) and §14 (rename's undo per document); the ChangeLog.
15. **Versions:** schema stays **0.7**, runtime **0.14.0**. CLI **0.24.0 → 0.25.0** (decision L3). No golden moves: nothing here changes generated output.

## Boundary

- `designer/src/**` and `designer/e2e/**`;
- `cli/src/core/**` for **pure, read-only reference finders only** (one module that, given a project model, lists each name's references with their source ranges), so the designer and any later CLI `rename` share one implementation. No parser, validator or generator behaviour change;
- `docs/ui_spec.md`, `ChangeLog`, the CLI version.

**No** schema, runtime, generator-output or golden change; no new diagnostic.

## Testing

- **Unit:** the reference finder for each of finding 4's shapes, including `#name` inside expressions and a near-miss name that must not match; rename planning (counts per file, the refusals of ruling 8); the radius bound.
- **e2e:** rename a subject used on two screens, see both files change, undo one file alone; removing a used subject, style and const is refused, naming users; a style edit redraws its preview; "Used by" selects the element.
- Render-count and performance tests stay green.

## Decomposition

Worktree `../U8G2GL-e4`, a new branch from `origin/main` @ `8ec6da5`. One branch per WO, stacked. The worker doesn't push. The PA verifies end to end, pushes and opens the PR.

**Changed:** four WOs, not three. Rename is its own WO, because it spans every kind and carries the shared reference finder that WO1 and WO3's "Used by" also read. So the order is finder and subjects, then rename, then the rest.

| WO | Branch | Done when |
|---|---|---|
| WO1 | `u8g2gl-e2k3/wo1-subjects` | The reference finder's unit tests pass for every shape. The subjects table shows usage, and removing a used subject is refused |
| WO2 | `u8g2gl-e2k3/wo2-rename` | Rename works for all five kinds, from Rename… and from the name field. e2e renames a subject across two screens with per-file undo, and covers the field's three choices. The refusals are tested |
| WO3 | `u8g2gl-e2k3/wo3-styles-consts` | Style cards draw previews, usage and the radius bound. Consts show usage. Every globals kind refuses removal while used |
| WO4 | `u8g2gl-e2k3/wo4-docs-review` | All suites pass, one at a time. Goldens have an empty diff. check-package passes at 0.25.0. The home-path guard is clean |

## For the owner to decide

Answered by the owner on 2026-11-21:

- **L1. Does editing a name field also rename references?** **The owner chose to ask** ("ask the user: you are renaming a variable... do you want to rename it in the files that reference it"). That's ruling 10.
- **L2. Name each changed generated symbol, old → new, and let the rename go ahead?** **Yes.**
- **L3. CLI 0.25.0?** **Yes.**

Still open: the **four-WO split** above, with rename separated out. It's approved together with the plan.

## Amendments (approved 2026-11-21, after the worker stopped at WO1)

The worker stopped before any code, as the work order requires, because the code has reference shapes finding 4 doesn't list. The PA confirmed each in source.

- **M1. Finding 4 is completed.** The finder also covers:
  - `style="<name>"` on any element, a common attribute (`validate-widget-props.ts` `COMMON_ATTRIBUTES`; checked as `U8G2GL_UNKNOWN_STYLE`), used inside widget templates too;
  - `focus_style="<name>"` on any element (also `U8G2GL_UNKNOWN_STYLE`);
  - the `style_font="<font>"` inline override (checked as `U8G2GL_UNKNOWN_FONT`);
  - the `font` of a screen-local `<style>` in a screen's own `<styles>`.

  Its file scope is **every file the project loads**: `u8g2gl.xml`, `globals.xml`, every screen, and every widget manifest wherever it lives (the fixture keeps them at `widgets/<name>/<name>.xml`), not `widgets/*.xml`.
- **M2. Screen-local styles shadow global ones, as the code already resolves them.** A screen that declares a local style of the same name refers to its own (`static-text.ts`: screen first, then globals; `validate-references.ts`'s `referenceScope`). So on that screen, references to that name are not the global style's: they are neither its users nor renamed with it. Composite templates see global styles only (`validate-references.ts`), so their references always are. The rename dialog lists the screens skipped for shadowing, so nothing is skipped silently. Renaming a screen-local style is out of scope.
- **M3. E-2k2's font removal guard is fixed.** `style_font` counts as a use of its font, so a font used that way can't be removed. This changes E-2k2's `fontUsers()` results on purpose; the work order's "the same results" is amended to "the same results, plus `style_font` users".

## Status log

| Date | Entry |
|---|---|
| 2026-11-21 | PA drafted this re-check against main @ `8ec6da5`, after #63 merged (merge commit, two parents). |
| 2026-11-21 | Owner on the decisions, in their own words: L1, "a 1/2 way house: ask the user: 'you are renaming a variable... do you want to rename it in the files that reference it....'"; L2, "yes"; L3, "ok". Ruling 10 was rewritten to match L1. This is not yet approval to implement. |
| 2026-11-21 | **Approved by the owner, in their own words: "Approve E-2k3"**, given in reply to the plan as updated with their L1–L3 answers. That approves rulings 1–15, L1 (ruling 10, ask on commit), L2, L3 (CLI 0.25.0) and the four-WO split. PA branched `u8g2gl-e2k3/wo1-subjects` from `origin/main` @ `8ec6da5` in `../U8G2GL-e4` (upstream unset). Work orders: [WORKORDERS-E-2k3.md](WORKORDERS-E-2k3.md). |
| 2026-11-21 | Worker stopped at WO1 before any code (stop condition: unlisted reference shapes). **Owner approved the PA's amendments, in their own words: "Approve M1–M3"** (M1 the missing shapes and file scope, M2 shadowing as the code resolves it, M3 the `style_font` guard fix). Recorded above under Amendments. |
