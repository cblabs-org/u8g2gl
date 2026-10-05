# PR-4R2 scoping probes — 2026-10-05

Run by the PA against `main` @ `86d3f89` (CLI 0.9.0, built from a `git archive` snapshot),
before the decomposition was approved. Each directory is a complete project; run
`u8g2gl validate <dir>` or `u8g2gl generate <dir>` with the built CLI.

| Probe | What it binds | Result at `86d3f89` |
|---|---|---|
| `a/` | `time` subject on a box's `bind_x` and a label's `bind_y` (attribute form) | Refused, `TYPE_MISMATCH`, both |
| `c/` | the same, forwarded through a composite's `type="subject"` prop | Refused, `TYPE_MISMATCH`, both, located in the template with the instance named |
| `d/` | a custom element (`extends="u8g2gl_obj"`) whose `<api>` declares `<bind name="bind_when" type="time" setter="bind_x"/>` | **Validates, 0 errors.** Generates `ui_obj_w.bind_x(&ui_subject_t);`. With `type="int"` and an int subject it still emits `bind_x(&ui_subject_n)`, which does not compile: "too few arguments, expected 2" (the origin argument is chosen by binding *name*, `resolver/geometry-bindings.ts`). `stub/wd_d.hpp` is the class used for the compile check. With `extends="u8g2gl_box"` and `setter="x"` it also validates and emits `ui_obj_w.x(&ui_subject_t)` |
| `one/` | a box with bound `x` inside a composite, and one with bound `width` inside a `u8g2gl_obj` | Both emitted as unclipped draw calls (`u8g2gl_draw_box(display, u8g2gl_coord_bound(10, ui_subject_n.get()), …)`), where an object child is clipped by `u8g2gl_render_object()` |
| `r/` | radius via style / `style_radius` / literal on box, button, switch, all 20×6 with radius 10 | Box refuses every style form. Button with `style_radius="10"` **or literal `radius="10"`** passes; switch with `style="round"` passes. `checkCornerRadius` requires `radius`, `width`, `height` all `draw=`, which only the box meets. The screen here is the last variant run (switch); the others are listed in PROJECT.md |
