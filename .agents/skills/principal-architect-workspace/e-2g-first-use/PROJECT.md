# E-2g: Designer first-use fixes

**Base:** `main` @ `60a4202` (#47, #48 and #16 merged). CLI 0.16.1. **Worktree:** `../U8G2GL-e2g`.

## Owner decisions and approval

On 2026-11-11 the owner opened the served demo and reported three problems in chat:

> "1) it would be good to have an icon for the left bar tool panel for the designer and the
> components. Currently they are some weird square with no meaning.
> 2) I can;t see how to save the display. I make some changes but not obvious what to do next.
> 3) I added a triangle, but could not resize it."

The PA confirmed each one in the code and the running demo, and presented the plan below in chat,
recommending explicit saving over autosave. The owner answered, in their own words:

> "Palette is fine. Approved to proceed autonomously."

So the view keeps the name **Palette**, and saving is **explicit**, not autosave.

## Findings (confirmed 2026-11-11 on `main`)

| # | Report | Cause |
|---|---|---|
| 1 | Left-bar icons are meaningless squares | `designer/src/ui/activity-bar.tsx` draws Unicode glyphs (▤ ▦ ▣ A ≡ ⇄ ⌕). The designer already ships Lucide through `<Icon>` (`designer/src/icons/`) |
| 2 | No obvious way to save | Saving is ⌘S only, and it saves the *active* file only. The single cue is a ● on an editor tab, and a canvas-only layout has no editor tab. The Explorer marks a dirty file only through a CSS class. ui_spec §4's diagram says "save (debounced)", but autosave was never built |
| 3 | A triangle can't be resized | `designer/src/editing/resize-rules.ts` writes `x`/`width`-style axes only, and refuses an element whose manifest declares no `width`/`height`. That refuses `u8g2gl_triangle` (`x0..y2`), `u8g2gl_line` (`x1..y2`), `u8g2gl_circle` (`radius`) and `u8g2gl_ellipse` (`rx`, `ry`), and `hline`/`vline` on their missing axis. The reason shows only as a tooltip during the drag |

## One PR: E-2g, designer only

**Versions:** CLI 0.16.1 → **0.16.2** (patch, rule 03: a fix, no output change). No schema or
runtime change, and no golden moves.

| WO | Topic |
|---|---|
| WO1 | The activity bar uses Lucide icons |
| WO2 | Visible saving |
| WO3 | Resizing shapes placed by points or radii |
| WO4 | Docs, version, readability review, evidence |

### PA rulings

**Amendment, 2026-11-11 (after WO4): WO5, selecting circles, ellipses and lines drawn by
`hline`/`vline`.**
- **The gap.** The worker found that `rectangleOf()` in `designer/src/pipeline/live-pipeline.ts`
  gives circles, ellipses, hlines and vlines no rectangle. So they can't be selected, and ruling
  3's resize for them is unreachable.
- **The ruling.** `rectangleOf()` gains one last fallback: the box from the resolver's
  `drawnExtent()`, where it returns `undefined` today. An hline or vline gets a one-pixel
  thickness.
- **The rule stays narrow:**
  - The two existing paths are unchanged, so no element that is selectable today changes its
    hit rectangle.
  - `pipeline/live-pipeline.ts` joins the boundary for this fallback only.
- **Why this is within the approval.** The owner approved circle and ellipse resize under ruling
  3, and this only makes it reachable.

1. **Icons (WO1).**
   - Each view draws an `<Icon>`: Explorer `files`, Palette `shapes`, Assets `image`, Fonts
     `type`, Sample data `database`, Flow `workflow`, Search `search`.
   - Tooltips, `aria-label`, `aria-pressed` and disabled states are unchanged. The label stays
     **Palette**.
   - Unit test: every view's icon name resolves (`resolveIcon`), so none falls back to `puzzle`.
2. **Visible saving (WO2).** Explicit, not autosave (owner decision).
   - **Status bar:** while anything is unsaved, a button "● N unsaved · Save". A click saves
     every dirty file. Its tooltip lists the files and the shortcuts. It is absent while nothing
     is dirty.
   - **Canvas toolbar:** a Save button, enabled only while the screen the canvas draws is dirty.
     It saves that file.
   - **Shortcuts:**
     - ⌘S / Ctrl-S saves the active file. When no editor tab is active, it saves the file the
       canvas draws.
     - ⌘⌥S / Ctrl-Alt-S saves all.
     - Neither ever opens the browser's own "Save page".
   - **Explorer:** a dirty file shows a visible ● after its name.
   - **Failures:** a failed or conflicted save behaves exactly as E-2f made it. Save-all reports
     each file's outcome through the same path.
   - **Re-renders:** none of these may make the Palette, the Explorer or the canvas re-render on
     a keystroke or a drag. The existing render-count tests stay green.
3. **Resize (WO3).**
   - **Box handles on a line or triangle** scale every vertex about the opposite edge (or edges)
     of the vertices' bounding box, which is the box the canvas already draws (`drawn-extent`).
     Results are rounded to whole pixels.
   - **Circle:** the handles change `radius`. A side handle uses its own axis, and a corner the
     larger of the two.
   - **Ellipse:** a side handle changes `rx` or `ry`, and a corner both.
   - **Anchoring:** for circle and ellipse, the worker derives from the resolver whether `x`/`y`
     is the centre or the corner. The box's opposite edge stays put, exactly as for a box,
     moving `x`/`y` too where the anchor demands it.
   - **Vertex handles:** a single selected line or triangle also shows a small handle on each
     vertex, and dragging one moves that vertex alone. With more than one element selected,
     vertex handles are not shown.
   - **Refusals (the same rule as move and resize today):** every attribute written must be an
     integer literal. A binding or an expression refuses that edit with its reason, and nothing
     is written.
   - **Clamping:** the bounding box, radius or radii stay at least one pixel. A degenerate
     triangle (collinear vertices) is allowed, because the validator allows it.
   - **The reason is visible when the element is selected:** when a selected element's resize is
     refused on an axis, the property panel says so in one line ("Can't resize: …"), not only the
     drag tooltip.
   - **One undo step:** a resize or a vertex drag lands through the existing edit path
     (`moveEdits()` or its equivalent), as one undo step.
4. **Testing:**
   - **Unit:** the plan for each shape: line and triangle on corner and side handles, circle,
     ellipse, `hline`/`vline`; a vertex drag; rounding; clamping; and refusal by expression and
     by binding.
   - **e2e:**
     - resize a triangle by a corner, and check the attributes written;
     - drag one triangle vertex;
     - resize a circle;
     - the status-bar Save appears after an edit, saves on click and disappears;
     - ⌘S with only the canvas active saves the screen;
     - the activity bar draws icons.
   - The existing resize, move, saving and session specs still pass.
5. **Docs (WO4):**
   - ui_spec: the save affordances, and §4's "save (debounced)" corrected to explicit save;
   - the resize behaviour for point and radius shapes, where the editor-design or ui_spec
     section on handles lives;
   - a `ChangeLog` line under `cli v0.16.xx`.
6. **Boundary:**
   - `designer/src/{ui,editing,selection,canvas,documents,panel,workspace.ts,styles.css}`, plus
     their unit and e2e tests;
   - `docs/ui_spec.md`, the CLI version and `ChangeLog`;
   - **no** `cli/src/core` change unless WO3 needs a resolver helper, which the worker reports.

## Status log

| Date | Entry |
|---|---|
| 2026-11-11 | Owner approved the E-2g plan: "Palette is fine. Approved to proceed autonomously." PA created worktree `../U8G2GL-e2g` from `60a4202`, branch `u8g2gl-e2g/wo1-activity-icons`, with `extern/u8g2` checked out at the pinned `d66b49a` from the main checkout's local module clone (no network, no config written). Worker spawned on WO1–WO4. |
| 2026-11-11 | Worker completed WO1–WO4 (tip `1d546de`). It reported that circles, ellipses, hlines and vlines cannot be selected (`rectangleOf()` gives them no rectangle), so their resize is unreachable. PA added WO5 under the amendment above, as a narrow fallback that changes no selectable element's rectangle, and resumed the worker on it. |
