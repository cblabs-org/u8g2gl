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

11. **Amending rules 2 and 3** (PA, 2026-10-31, on WO1's stop). The validator requires every
    rectangular element to end up fully sized, and no manifest marks `width`/`height` required,
    so rule 2 as written refused almost every tag.
    - **Size.** An insert also writes `width` and `height` wherever the element's manifest
      declares them: the manifest default if it has one, else a fixed **16 × 8** device pixels,
      a named designer constant. That keeps the new element visible and grabbable, and it can
      be resized at once. Not 0 × 0, which is invisible; not a size-by-dragging gesture, which
      is a new interaction outside this PR. Endpoint and radius props are seeded from the drop
      point by the resolver's own extras, as WO1 proposed.
    - **Required props without a default:** `font` takes the first global font, else the first
      built-in; `image`, `style` and `subject` take the first declared one of their kind. With
      none declared, the drop is refused with the validator's reason.
    - **Which container receives the drop.** The innermost element under the drop point that
      **already has element children** in the XML, else the screen's `<view>`. That is
      deterministic and needs no manifest flag. It is not "whatever validates": a label must not
      silently gain a child because the validator allows it. An empty group therefore receives
      no drop from the canvas, and its children go in through the XML. This is recorded for
      E-2d's end, beside palette metadata.
    - **Names (rule 3).** The stem is the parser's synthesis stem, with the reserved `u8g2gl_`
      and `ui_` prefixes stripped (§13.4), so `label_1` and `service_list_1`. "Free" means
      unused anywhere in the project: element names in every screen and composite, screen names,
      and globals. WO1's reading is accepted.

## Status log

- **2026-10-31.** #38 merged (`ef49a1d`, a merge commit). Worktree created from `main` @ `ef49a1d`,
  `extern/u8g2` checked out. WO1–WO6 issued to one worker in order.
- **2026-10-31.** WO1 stopped before insert (`4eccc32`: palette and names done): rule 2 conflicted
  with the validator's sizing rule. Ruling 11 issued; WO1 resumed.
- **2026-10-31. WO1–WO6 complete** (report at the end of WORKORDERS.md). Accepted: duplicate renames
  the copy's named descendants; insert extras seeded visible (line corner to corner, r = 4);
  "element children" means children the registry knows; `overlays.spec.ts` admits the align
  toolbar on a selection change; no document opens before Monaco loads. CLI 0.13.5 for the font
  height data. **PA verification** on `d2eacad`, suites one at a time, AC power, no sleep: guard
  clean; CLI 2527, lint and tsc clean; no golden moved, catalogue regeneration byte-identical; C++
  512/512; designer unit 126; e2e 67. Drag gate 300/300 at every screen and zoom, p95 8.0–9.1 ms;
  keystroke run→blit p95 4.2 / 3.3 ms; panel share p95 1.1 ms; every self-test fails its gate.
  Production 3/3, no hook. Initial JS gzip 1,340 → 347 KB. PR #39.
