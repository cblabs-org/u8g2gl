# R-border: make a style's `border` draw

**Status:** approved by the owner, 2026-11-22. **Worktree:** `../U8G2GL-e4`.
**Base:** `main` at `1915179`, the #64 merge (schema 0.7, runtime 0.14.0, CLI 0.25.0).

## The gap

The schema and every layer around it promise something the runtime never draws.

- **design_spec §10** lists `border` as a "1px outline".
- **The designer's own help text** (`project-vocabulary.ts:377`) tells authors it "Draws a one-pixel outline around the element".
- **`u8g2gl_obj.xml`** declares `border` on every element, as "Render outer border".
- **The runtime stores it and nothing reads it.**
  - `u8g2gl_obj::set_border()` and `u8g2gl_style::border` exist.
  - No `render()` and no framework path reads either of them.
  - The only frame drawn today is the button's own, from `border_width`.

**Who already writes it, believing it works:**
- the emit-project fixture's `header` style;
- the xtensa corpus `ui_styles`;
- a `<u8g2gl_obj … border="true">` panel in `palette.spec.ts`.

A panel is the case that hurts most. An author gives a container `border="true"`, sees nothing on the device, and has no diagnostic to explain why.

## Options

| | What | Cost |
|---|---|---|
| **A (recommended)** | **The framework draws it,** for every element, in `u8g2gl_render_object()` and `u8g2gl_repaint_object()`, after the element's own `render()`. | A runtime minor bump. No schema change. |
| B | Remove `border` from the schema. | A breaking schema change (§1.5, rule 03), which is yours to make. It also removes the one way to outline a panel. |
| C | Make only some widgets draw it. | The manifest declares `border` on every element, so this rule would depend on what each element happens to draw. §10 rejected exactly that for `radius`. |

**Why A:**
- It matches what the spec, the manifest and the help text already say, so no XML an author has written changes meaning.
- The framework already owns the containment around each element: the state guard and the clip. The outline fits in that same place, with no per-widget code.

## The design under A

1. **What is drawn.** A one-pixel frame on the element's own box `(x, y, w, h)`:
   - in the style's `draw_color`;
   - with corners from the style's `radius`, clamped by `u8g2gl_coord_corner_radius()`, the same rule §10 measured.
2. **When it is drawn.** After the element's `render()`, in its own slot in document order. Its children are drawn after it, so they draw over a container's outline. This matches how a container's children already draw over the container.
3. **Clipping.** The outline goes through the element's effective clip, like everything else it draws. An outline wholly clipped away draws nothing.
4. **The helper.** The button's static `draw_border_rframe()` becomes a public `u8g2gl_draw_frame()` in `u8g2gl_draw.h`, beside `u8g2gl_draw_box()`. The button and the framework then share one frame primitive. This addition to the API is why the runtime bump is a minor one.
5. **The button.** This is the one place the two frames can collide. See decision **B2**.
6. **Set by the element or by a style.** `border` goes through the existing precedence (attribute, then `style_border`, then the named style), so nothing new is needed. The framework reads the resolved `style_.border`.

**Out of scope:**
- A label's or button's padding growing to clear the outline. `padding` keeps its current meaning.
- Any border width other than 1.
- Any change to `focus_style`, beyond the fact that a focus style may now carry `border` and have it draw.

## Decisions for you

- **B1. The approach.** A, B or C. I recommend **A**.
- **B2. A button with both frames.** Its own frame, from `border_width` (default 1), sits on the same outer pixels as the style outline. Drawn twice, the two are identical, except under `draw_color="xor"`, where they cancel each other out and the frame disappears.
  - **B2a (recommended):** a button whose `border_width` is above 0 skips the framework outline. Its own frame already draws that outline. A button with `border_width="0"` and `border="true"` gets the framework's one-pixel outline. This needs one virtual hook on `u8g2gl_obj`, `draws_own_outline()`, which defaults to false.
  - **B2b:** always draw both, and document the xor cancellation.
- **B3. Versions.**
  - **The runtime goes to 0.15.0,** for the new behaviour and the new public helper.
  - **The CLI goes to 0.25.1.** The runtime floor that generated code records moves, so every golden moves. Rule 03 says that calls for a CLI patch bump.
  - **The schema stays 0.7.**

## What changes for existing projects

- **Any element with `border="true"` gains a one-pixel outline** on the device and in the designer preview. This is a visible change, and the ChangeLog must say so.
- **Generated code doesn't change, apart from the runtime floor stamp.** It already calls `set_border(true)`.
- **Pixel tests over scenes that set `border`** will move. The worker lists each one, and the PA checks each outline by eye.

## Work orders (one branch each, stacked from `main`)

**WO1: Runtime** (`u8g2gl-rborder/wo1-runtime`)
- **Code:**
  - add `u8g2gl_draw_frame()` and move the button onto it;
  - draw the outline in both render paths;
  - add the B2 hook.
- **Tests,** in `test/test_style_border.cpp`:
  - every element type, with and without `border`;
  - radius clamping at the §10 boundary;
  - a partly clipped outline;
  - a container whose child overlaps the outline;
  - the button under B2 with every `border_width`, under every draw colour, xor included;
  - the repaint path.
- **Version:** runtime 0.15.0.
- **Boundary:** `include/`, `src/`, `test/` and `CMakeLists.txt` only.

**WO2: Wasm and parity** (`u8g2gl-rborder/wo2-wasm`)
- **Rebuild** the framework Wasm with the managed Emscripten that is already installed. Nothing is downloaded.
- **Add** a bordered parity scene. Parity frames are computed when the tests run, so none are committed to refresh.
- **Show** that the editor and firmware frames still agree on every scene.
- **Stop condition:** a parity frame moves that sets no `border`.

**WO3: CLI, designer and docs** (`u8g2gl-rborder/wo3-cli-docs`)
- **Versions:**
  - CLI 0.25.1;
  - refreshed goldens, which should differ only in the runtime floor stamp.
- **Designer:**
  - the style card's `border` note becomes a fourth caption item;
  - the button caption gains the `border_width` rule from B2.
- **Docs:**
  - design_spec §10, describing the outline;
  - ui_spec §6.4;
  - the ChangeLog, including the visible change.
- **e2e:** the palette panel test, and one new pixel check that a bordered panel draws its outline.

## Verification (PA)

- Every suite, one at a time:
  - Wasm;
  - ctest;
  - the CLI;
  - lint and typecheck;
  - designer unit;
  - e2e;
  - production;
  - goldens;
  - check-package;
  - the home-path guard.
- **Built CLI:** generate the fixture and compare the diff. Only the floor stamp should change.
- **Browser:** a scratch project with a bordered panel, a bordered label, a rounded bordered label, and buttons at `border_width` 0, 1 and 2. Check each preview against the runtime's frame.
- **Device:** none planned. Flashing would need your approval each time, and the host pixel tests cover the drawing.

## Amendments

### P1 (approved by the owner, 2026-11-22: "Approve P1"): the progress bar and the switch also draw their own outline

**Found by the worker and confirmed by the PA in source.** Two more widgets frame their own box on every render, and B2a covers only the button:

- `u8g2gl_progress_bar::render()` always draws a square frame on its box (`u8g2gl_draw_box(…, false)`, Step 3).
- `u8g2gl_switch::render()` always draws its track as `drawRFrame` on its box, with radius `h / 2` when the style sets none (Step 4).

**With `border="true"`, as built:**
- **Under xor,** the edges that the two frames share cancel. The progress bar's frame vanishes, and so do the switch track's straight edges.
- **Under colours 0 and 1,** the progress bar looks unchanged at radius 0. A switch with no style radius gains a square box around its pill, because the outline uses the style's radius (0) while the track uses `h / 2`. A progress bar with a style radius gains rounded corner pixels inside its square frame.

**Proposed:** `u8g2gl_progress_bar` and `u8g2gl_switch` override `draws_own_outline()` to return `true` always, for B2a's reason. `border` then adds nothing to either. This is one override each, a test per widget under every draw colour, and a sentence in design_spec §10.

## Owner approval

The PA sent this plan on 2026-11-22. The owner answered B1:

> "Approach A"

The PA then asked whether B2a and B3 stood as proposed, and for approval of R-border. The owner answered:

> "Approve R-border"

Both answers were given on 2026-11-22. They approve the plan as drafted, with B1 = A, **B2 = B2a** (the plan's recommendation) and **B3** = runtime 0.15.0 and CLI 0.25.1, with the schema unchanged.

## Status log

| Date | Event |
|---|---|
| 2026-11-22 | PA drafted this plan after #64 merged (`main` at `1915179`). |
| 2026-11-22 | Owner on B1: "Approach A". |
| 2026-11-22 | Owner: "Approve R-border". Approved with B2a and B3 as proposed. Worktree `../U8G2GL-e4`, branch `u8g2gl-rborder/wo1-runtime` cut from `origin/main` at `1915179`. |
| 2026-11-22 | Worker completed WO1–WO3 (`c84f97e`, `2e1f4c2`, `4574405`, `5df8f74`, `2de795d`). PA confirmed in source that the progress bar and the switch also frame their own box. Amendment P1 proposed; PA verification paused for the owner. |
| 2026-11-22 | Owner: "Approve P1". The worker implements it on `u8g2gl-rborder/wo3-cli-docs`. |
