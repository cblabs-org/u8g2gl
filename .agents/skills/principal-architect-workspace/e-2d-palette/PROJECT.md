# E-2d: Palette and Structure

**Parent:** E-2 ([e-2-canvas-editing/PROJECT.md](../e-2-canvas-editing/PROJECT.md)), whose
owner approval (2026-10-28) covers this PR's scope as its fourth row; C4's decision (2026-10-28,
"Accept all three") adds the built-in font height table. **Base:** `main` @ `ef49a1d` (E-2a, E-2b
and E-2c merged). **Worktree:** `../U8G2GL-e2d`. **E-2's last row:** at its end the PA brings
palette metadata and `<previews>` back to the owner (C4's item 1).

## Purpose

Structure edits from the canvas — insert, delete, duplicate, align — on the same CST edit path
and undo stack as E-2b's gestures; the font heights C4 found missing; and Monaco loaded only
when the shell needs it.

## Decomposition

| WO | Topic | Branch | Status |
|---|---|---|---|
| WO1 | The palette and drag-to-insert, with generated names | `u8g2gl-e2d/wo1-palette` | ⏳ |
| WO2 | Delete; Alt-drag duplicate | `u8g2gl-e2d/wo2-delete-duplicate` | ⏳ |
| WO3 | The align and distribute toolbar | `u8g2gl-e2d/wo3-align` | ⏳ |
| WO4 | The built-in font height table (C4) | `u8g2gl-e2d/wo4-font-heights` | ⏳ |
| WO5 | Monaco code-split; bundle size before and after; the drag gate re-measured | `u8g2gl-e2d/wo5-split-gates` | ⏳ |
| WO6 | Readability review, palette screenshots, PA verification | `u8g2gl-e2d/wo6-readability` | ⏳ |

## PA rulings

1. **The palette lists tag names, generated.** Three groups — *Framework* (framework manifests),
   *Project* (the project's `<widget>` manifests), *Drawing* (drawing elements) — from the
   manifest registry and the drawing catalogue, in registry order, nothing hand-listed. No icons,
   categories or descriptions beyond what manifests already carry: palette metadata is a §8
   schema feature, judged at this PR's end. A filter field narrows by name.
2. **Insert is one CST edit, one undo stop.** Dropping a tag on the canvas inserts an element
   into the screen (or the container under the drop point that accepts children) at the drop
   position, rounded to integers, with: `name` generated (rule 3), integer `x`/`y`, and **only**
   the props the manifest marks required, each at its manifest default or, with none, the
   simplest valid value of its type. The new element is selected, and its XML revealed without
   taking focus (E-2a). An insert that would not validate is not offered: the drop is refused
   with the reason.
3. **Generated names** are valid identifiers, unique in their scope across the whole project
   (the validator's rule), from the tag: `<tag>_<n>` with the lowest free `n` from 1. Unit-tested
   against the validator, including collisions with existing names and with constants.
4. **Delete** (Delete/Backspace while the canvas has focus) removes each selected element's
   whole element range, its leading indentation and line break included, as one undo stop. A
   referenced element (its `name` used elsewhere in the project) is still deleted; the resulting
   diagnostics show in Problems. A composite's child is never deletable from the canvas: its
   instance is the selection (E-2b ruling 3).
5. **Alt-drag duplicates:** the copy is the selected elements' source text, verbatim except
   `name` (rule 3) and the dragged axis attributes rewritten under E-2b ruling 3's placement
   rules; inserted after each original; one undo stop for the whole gesture. An axis the
   original cannot move on (expression, bound) refuses as a move does.
6. **Align and distribute** (ui_spec §8's toolbar): left, h-centre, right, top, v-centre, bottom
   to the selection's bounding box; distribute horizontally and vertically for three or more.
   Each element moves under E-2b ruling 3; an element that refuses on an axis stays and the
   toolbar says which and why. One undo stop per command. Disabled with fewer than two (three
   for distribute) movable elements.
7. **Font heights** (C4 item 2): `build-catalogue.ts` writes each built-in font's pixel height
   (from U8G2's font header in `extern/u8g2`, as E-2c reads `<bdf>` fonts) beside
   `u8g2-fonts.json`, regenerated and committed by the same script, with a test that a sample of
   fonts matches the header bytes. The panel's font dropdown shows heights for every font, and
   E-2c's "no heights for built-ins" header line goes. If any generator golden moves, stop and
   report; if only catalogue data moves, a CLI patch bump (rule 03).
8. **Monaco code-split:** the shell paints and the canvas runs before Monaco loads; only the XML
   language and the editor features the shell uses are bundled (no other language chunks).
   Record the production `dist` size and the initial-load JS, gzip, before and after, in the
   completion report. E-1e's keystroke gate, E-2b/E-2c's drag gate (both zooms, panel open) and
   ruling 9's panel gate all re-measured on the finished tree, thresholds unchanged.
9. **Gates:** insert, delete, duplicate and each align command each one undo stop with a minimal
   diff, tested by diffing the text; e2e for each from the canvas.
10. **Boundary:** `designer/` (palette, canvas, toolbar, pipeline, perf, e2e, tests);
    `cli/src/core/cst/` additive edit helpers; `cli/src/node/build-catalogue.ts` and its
    generated data for rule 7. No schema change, no new dependency (programme ruling 2), nothing
    in the runtime.

## Status log

- **2026-10-31.** #38 merged (`ef49a1d`, a merge commit). Worktree created from `main` @ `ef49a1d`,
  `extern/u8g2` checked out. WO1–WO6 issued to one worker in order.
