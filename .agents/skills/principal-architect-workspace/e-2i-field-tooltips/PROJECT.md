# E-2i: Property help in tooltips

**Base:** `u8g2gl-e2h/wo2-docs-review` @ `ae0a90f` (#50, open, CI green). CLI 0.16.3.
**Worktree:** `../U8G2GL-e2i`. The PR targets #50's branch and is retargeted to `main` once #50
merges.

## Owner decisions and approval

On 2026-11-12 the owner sent a screenshot of the property panel showing `long_mode`'s inline help
and wrote, in their own words:

> "on the properties selector bar, I think we should put the descriptions in tool tips like we
> did for the widgets rather than in line. WDYT?"

The PA agreed, recommended the Palette's tooltip for consistency, and noted that `long_mode`'s
help text is a design note rather than user help. The owner answered, in their own words:
"Yes, plan it". The PA presented the plan in chat. The owner answered, in their own words:

> "Approve"

## Findings (confirmed 2026-11-12 at `ae0a90f`)

| # | Topic | Today |
|---|---|---|
| 1 | Inline help | `designer/src/panel/property-panel.tsx` renders `spec.help` as `<p className="field-help">` under every control; styled in `panel.css` |
| 2 | Palette tooltip | `designer/src/palette/palette.tsx` `PaletteTile`: `role="tooltip"`, `aria-describedby`, shown on pointer-enter and focus, placed beside the tile (`TOOLTIP_GAP = 6`) |
| 3 | Field facts | `panel-layout.ts` `FieldSpec` carries `help`, `type`, `options`, `default`, `required`, `source` |
| 4 | Design note as help | `include/u8g2gl/manifests/u8g2gl_label.xml` `long_mode` cites `[D-19]` and LVGL Pro. Three props read "Meaningless unless long_mode is scroll or scroll_circular." |
| 5 | Where help flows | `cli/src/data/manifests.json` (via `npm run build:manifests`) and `cli/test/cst/tokeniser-trees.json`. Not into generated C++ |

## One PR: E-2i, designer plus manifest text

**Versions:** CLI 0.16.3 → **0.16.4** (patch, rule 03). No schema or runtime change. No C++
golden moves.

| WO | Branch | Topic |
|---|---|---|
| WO1 | `u8g2gl-e2i/wo1-field-tooltips` | Shared tooltip, panel ⓘ and tooltip |
| WO2 | `u8g2gl-e2i/wo2-help-text` | Manifest help wording, regenerated data |
| WO3 | `u8g2gl-e2i/wo3-docs-review` | ui_spec, ChangeLog, version, review, report |

### PA rulings

1. **Shared tooltip (WO1).**
   - Extract the Palette's tooltip into one shared component (e.g. `designer/src/ui/tooltip.tsx`).
     The Palette moves onto it with its look, placement, timing and accessibility unchanged; the
     existing Palette tooltip specs pass unedited.
   - `role="tooltip"`, linked by `aria-describedby` from its anchor. Opens on pointer-enter and
     focus; closes on pointer-leave, blur and Escape. Escape must not also clear the selection or
     reach other handlers.
2. **Panel trigger (WO1).**
   - A small ⓘ after the property's name, present only when the field has help text. It is a
     focusable button-like element with an accessible name (e.g. "About long_mode").
   - Hovering the property's name opens the same tooltip.
   - The control's own keyboard and pointer behaviour is unchanged; the ⓘ never takes a click
     that edits.
3. **Tooltip content (WO1).**
   - The help text, then one quiet facts line: the type; for an enum, the allowed values
     separated by ` | `; the default if one exists. Example:
     `enum · clip | dots | scroll | scroll_circular · default clip`.
   - A bound attribute shows its subject types in the facts line.
   - The facts line is built by a pure function with unit tests.
4. **What stays inline (WO1).** The disabled reason, the problems, and the computed / Detach /
   Edit in XML note. `.field-help` and its CSS are removed.
5. **Re-renders (WO1).** Opening a tooltip re-renders only that field. Existing render-count tests
   stay green.
6. **Help text (WO2).**
   - `u8g2gl_label` `long_mode` help becomes exactly: "Overflow behaviour when text exceeds the
     widget width: clip hard-clips at the bounds; dots truncates with an ellipsis; scroll and
     scroll_circular marquee the text. Labels are single-line, so there is no wrap."
   - The three "Meaningless unless long_mode is scroll or scroll_circular." strings become
     "Used only when long_mode is scroll or scroll_circular."
   - Edit `include/u8g2gl/manifests/u8g2gl_label.xml` only. **Never** edit
     `test/xtensa_control/pre_fix/` — it is a frozen control copy.
   - Regenerate `cli/src/data/manifests.json` with `npm run build:manifests` and
     `cli/test/cst/tokeniser-trees.json` with its own refresh path. No other golden may move;
     prove it with `git diff --stat`.
7. **Testing.**
   - **Unit:** the facts line (enum, plain, default, none, bound).
   - **e2e:** no inline help under any field; hover on the ⓘ and on the name, and keyboard focus,
     each show the tooltip with help and facts; Escape closes it and keeps the selection; a
     disabled reason and a problem still show inline; the Palette tooltip specs unchanged.
8. **Docs (WO3).** `ui_spec` property-panel section; `ChangeLog` entry for `cli v0.16.4`; CLI
   version in `cli/package.json` and its lock file.
9. **Boundary.** `designer/src/{ui,panel,palette,styles.css}` and their tests;
   `include/u8g2gl/manifests/u8g2gl_label.xml`; `cli/src/data/manifests.json`;
   `cli/test/cst/tokeniser-trees.json`; `docs/ui_spec.md`; `ChangeLog`; the CLI version.
   **No** other `cli/src`, `wasm/`, runtime or schema change.

## Status log

| Date | Entry |
|---|---|
| 2026-11-12 | Owner approved the plan: "Approve". PA created worktree `../U8G2GL-e2i` from `ae0a90f`, branch `u8g2gl-e2i/wo1-field-tooltips`. `extern/u8g2` is checked out at the pinned `d66b49a` from the main checkout's local module clone, with no network and no config written. Worker spawned on WO1, WO2 and WO3, in that order. |
