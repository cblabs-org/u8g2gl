# S-2: Schema 0.6 — `icon=` on `<api>`

**Base:** `main` @ `29f976a` (#44 merged). Runtime 0.11.1, CLI 0.15.2. **Runs after E-2e merges**, on a fresh worktree from that merge.

## Owner decisions and approval

The plan for both E-2e and S-2 was presented in chat on 2026-11-09 as one document; this file
holds its S-2 part. The owner's decisions leading to it (chat, 2026-11-08/09):

1. Explorer — "Should we not just have a right click on the widget file to 'show source' or
   something?"
2. Palette — "I think we would be better using an icon set."
3. Icons for project widgets — "option 2 with option 1 as fallback is good" (option 2: a
   per-widget `icon=` on `<api>`, schema 0.6; option 1: the category's icon as the fallback).
   Rule 03 makes the schema bump the owner's decision; this is that decision.

The owner then answered the plan, in their own words:

> "Approved, proceed"


### Work orders

| WO | Topic |
|---|---|
| WO1 | The parser, the manifest type and the validator: `icon=` accepted on 0.6, with 0.4 and 0.5 still accepted |
| WO2 | Versions: the runtime's schema minor, the runtime and CLI bumps, and the goldens regenerated |
| WO3 | `icon=` added to every framework manifest and the fixture's project widgets; the E-2e map deleted |
| WO4 | Docs, readability review, PA verification |

### PA rulings

1. **The attribute.** `icon` is optional on `<api>`.
   - **Its value** is a Lucide icon name from the vendored set: lowercase kebab-case, at most
     48 characters.
   - **Not inherited** through `extends`, the same rule as S-1's metadata.
2. **Diagnostics.**
   - **An unknown name** is a diagnostic. When the list has one close match, it suggests it
     ("did you mean `train-front`?"), in the same style the validator already uses.
   - **An empty value** is a diagnostic.
   - **A 0.4 or 0.5 project that uses `icon=`** gets one `NEWER_SCHEMA_REQUIRED` diagnostic,
     naming `schema="0.6"`.
   - **0.3** keeps its migration refusal.
3. **Versions** (rule 03, an additive change).
   - **The schema** goes 0.5 → 0.6, and the validator accepts 0.4, 0.5 and 0.6.
   - **The runtime** goes 0.11.1 → 0.12.0. Its only change is `U8G2GL_SCHEMA_VERSION_MINOR` = 6.
   - **The CLI** goes to 0.16.0.
   - **The goldens** move in their version-stamp lines **only**. The worker checks this by
     diffing; any other change stops the work.
   - **Fixtures** move to 0.6, except one 0.5 fixture that is kept.
   - **`ChangeLog`** gets a 0.12 entry, in the U8G2 format (VER-1).
4. **Generated output doesn't see `icon=`.** Like the S-1 metadata, the attribute reaches no
   generated file. A test proves it.
5. **Data (WO3).** The tag → icon map from E-2e moves into the 16 framework manifests as
   `icon=`, and the designer's map is deleted, which restores [D-17] with no exceptions. The
   fixture's widgets get icons too:
   - `wd_service_list` → `table`
   - `wd_train_formation` → `train-front`
   - `wd_probe_box` → `square-dashed-bottom`
6. **The boundary for S-2:**
   - `cli/` (the schema, the parser, the validator, the data, the version stamps);
   - `include/u8g2gl/u8g2gl_version.h` and `include/u8g2gl/manifests/`;
   - the version in `CMakeLists.txt`;
   - the fixtures and goldens;
   - `designer/src/palette/` and `designer/src/icons/`;
   - `ChangeLog`;
   - design_spec §15.4, the schema reference, ui_spec §15's status column and
     EDITOR-DESIGN §8.


## Status log

| Date | Entry |
|---|---|
| 2026-11-09 | Owner approved the E-2e + S-2 plan: "Approved, proceed", including this schema bump. Waits on E-2e. |
