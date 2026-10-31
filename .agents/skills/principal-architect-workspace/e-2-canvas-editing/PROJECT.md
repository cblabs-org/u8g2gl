# E-2: Canvas Editing, the Property Panel and the Palette

**Parent:** the editor track, `implementation_plan.md` §5, row E-2 (depends on E-1b and E-1e,
both merged). **Design:** `e-d-editor-design/EDITOR-DESIGN.md` §3 (the edit loop), §7 (the
tagged-question rulings E-2 inherits), §8 (the schema features it ships without) and §10
(checkpoints); `e-d-editor-design/E1-DECOMPOSITION.md` §3 (what E-2 inherits); `docs/ui_spec.md`
§8 (canvas) and §9 (property panel). **Base:** `main` @ `fd717b1`.

## Owner approval

The PA proposed the decomposition below in chat on 2026-10-28. The owner answered:

> "Approved, proceed"

Given 2026-10-28. The owner's standing instruction of 2026-10-27 ("please proceed autonomously
from this point on until you run out of quota. Please spin up sub-agents as needed.") governs
how it runs. The decomposition fixes a stop: **the PA stops at checkpoint C4** (after E-2c) and
brings the panel to the owner.

## Decomposition

| PR | Scope | Acceptance | Depends | Project |
|---|---|---|---|---|
| **E-2a** | The scene's `source` gains a **range** (CLI patch bump). Selection both ways: canvas click, click-cycling through overlaps, marquee, Esc; XML caret selects; by `name`; XML revealed and decorated **without taking focus**. Handles and an `x, y, w, h` badge; selection geometry in the status bar. §3.8's states: invalid-but-buildable elements **hatched**; not well-formed shows the last good frame dimmed with a banner, and exposes "canvas editing off" | Selection survives edits and renames; a click in a stack of overlaps cycles to the right element; neither direction edits the text | — | `e-2a-selection` |
| **E-2b** | Drag, arrow nudge (1 px, Shift 8 px), resize, all through CST edit functions. §3.5's placement rules: literal rewritten; anchor rewritten inverted; expression or bound value **refuses** on that axis with a tooltip; a composite's child selects its instance. Integer snapping; edge and centre guides at 3 screen pixels. Overflow shown, not prevented. Canvas editing off while not well-formed. §3.6's undo grouping. E-1's allocation-spike follow-up (resolve, validate, scene) | **§3.4:** scripted 300-frame drag on the departures screen and on a new 20-element screen, full shell, 4× CPU throttle: p95 under 16 ms, no dropped frame at 60 Hz. Every gesture one undo stop and a minimal diff; a nudge is a one-line diff | E-2a | `e-2b-manipulation` |
| **E-2c** | The property panel, generated from `<api>` manifests ([UD-5]): ui_spec §9.1 editors; §9.2 inline help, live validation, defaults greyed with reset, `right` disables `x`, `bind_text` disables `text`; §9.4 multi-selection. Declaration order with geometry pinned first in pairs (§8); [Q-10]'s collapsed *From u8g2gl_obj* group; [Q-19]'s rule (cost only where §18 computes one). No `visible_when`, no per-widget rule. **Detach** | Every manifest prop of the departures project editable from the panel; each committed field one undo stop; the panel stays inside the 8 ms shell budget during a drag | E-2a (alongside E-2b) | `e-2c-panel` |
| **E-2d** | Palette: tag names grouped Framework / Project / Drawing; drag to insert. Delete; Alt-drag duplicate; align and distribute toolbar. Monaco code-split | Insert, delete, duplicate and align each one undo stop; inserted elements get valid generated names; bundle size recorded before and after | E-2b | `e-2d-palette` |

**Order:** E-2a, then E-2b and E-2c in parallel (two workers, two worktrees), then E-2d after
E-2b. **C4** follows E-2c: the panel on the departures project, shown to the owner, for the §8
schema decision (grouping, palette metadata, `<previews>`, `visible_when`, hiding inherited
props), decided together.

**Out of scope:** the §8 schema features; the test run (E-2T); sample data (E-3); the element
context's preview gallery (needs `<previews>`); the screen-flow view; packaging.

## Programme rulings

1. **The 16 ms gates are local, as C3's was.** CI runs the same tests and reports the numbers;
   the pass/fail is on the owner's machine (`process.env.CI === undefined`). Each such gate has a
   self-test that shows it can fail.
2. **No new dependencies expected.** A worker that needs one stops and reports; the owner decides.
3. **Versions:** one CLI patch bump in E-2a for the scene range, and any later bump only if
   generator output changes again (rule 03). No runtime or schema bump in E-2.
4. **One PR per row, stacked as each depends.** Workers commit locally and never push; the PA
   verifies, pushes and opens each PR.

## Status log

- **2026-10-28.** Decomposition approved. E-2a's worktree created from `main` @ `fd717b1`.
- **2026-10-28. Checkpoint C4.** The PA showed the panel on the departures project (screenshots
  of a framework element, a project widget with its inherited group closed and open, a drawing
  element, a multi-selection and nothing selected) and recommended: (1) **no schema feature
  now** — grouping, hiding inherited props and `visible_when` are not needed on this evidence;
  palette metadata and `<previews>` are judged at E-2d's end, when the palette exists; any later
  yes lands as one bump; (2) a **built-in font pixel-height table**, generated by
  `build-catalogue.ts` from U8G2's font data, in E-2d; (3) E-2b's ruling 10 (the drag gate
  measures the latest move each frame draws, and each move's first frame). The owner answered:

  > "Accept all three"

- **2026-10-29.** E-2c's drag gate: the owner chose "Count snapped moves" (e-2c ruling 11's
  amendment), which replaces E-2b ruling 10's measurement point.
- **2026-10-31.** E-2a (#36), E-2b (#37) and E-2c (#38) merged. E-2d issued from `main` @
  `ef49a1d` (`e-2d-palette`).
