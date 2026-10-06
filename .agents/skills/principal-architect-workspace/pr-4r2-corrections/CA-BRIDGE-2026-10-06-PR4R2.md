# Bridge to the Chief Architect — PR-4R2 complete

**From:** Principal Architect, PR-4R2 · **Date:** 2026-10-06
**Ledger:** [PROJECT.md](PROJECT.md) · **PR:** __PR_URL__

All four items are delivered and independently verified by the PA. Two of them could not be built
as the bridge specified, and the owner ruled on both before any work started (quoted verbatim in
PROJECT.md, "Human Approval").

**Baselines at the tip** (each suite alone, clean configure): **C++ 395** (one known skip,
`SizeOfReport.ThirtyTwoBitTarget`), **zero warnings**; **CLI 1319**; `tsc` and lint clean.
From 383 / 1281. **Schema 0.4 (unchanged), CLI 0.10.0, runtime 0.6.0, scene format 3.**

---

## Item 1 — bound container child: clipped, not made an object (owner ruling 1, option b)

**Reproduced** at `86d3f89`: a box with bound `x` in a composite and one with bound `width` in a
`u8g2gl_obj` were emitted as unclipped draw calls; object children are clipped by
`u8g2gl_render_object()`.

**Why not "gets an object", as §13.5 says.** Under [D-18]'s interim amendment every class-backed
element is already an object, so that condition reaches only drawing elements, which have no
class. Its only possible outcome is `DRAWING_ELEMENT_NEEDS_OBJECT`: a bound box inside a
composite (a level bar in a card) would become unwritable. The owner chose to clip instead, which
is what [D-18]'s non-observability actually requires.

**What ships.** One runtime RAII guard, `u8g2gl_clip_scope` (`u8g2gl_core.h`), used by
`u8g2gl_render_object()` itself and by generated code:

```cpp
if (!ui_obj_w.is_hidden()) {
    u8g2gl_clip_scope clip(display, ui_screen_home_objs, ui_screen_home_parents, 0);  // ui_obj_w's effective clip (§13.5)
    if (clip.drawable()) {
        u8g2gl_draw_box(display, u8g2gl_coord_bound(10, ui_subject_n.get()), 10, 10, 6, true, 0);  // w_b: no object (§13.5)
    }
}
```

Only a drawing element with an enclosing object **and** a bound argument is wrapped; literal
children (already refused if they overhang, §7.2) and screen-level elements are unchanged. One
function (`drawClipObject()`, `draw-args.ts`) decides it for firmware and the editor scene; the
scene gained a `clip` field (format 2 → 3) and the host draws through the same guard.
**Measured against real U8G2** (`test/test_bound_child_clip.cpp`): at the base a bound-`x` box set
30 pixels outside its container and a bound-`height` box 56; at the tip 0; an object control 0 at
both.

**Spec edit wanted (§13.5, last realisation bullet).** Proposed: *"A drawing element inside a
container whose geometry is bound is drawn inside its container's effective clip, exactly as an
object child is, so an overhang is clipped either way and realisation is not observable ([D-18]).
A child whose geometry is literal needs no clip: §7.2 already refuses one that overhangs."* The
bullet then moves out of the "an object is emitted when" list, since it no longer is one.

## Item 2 — `time` subject on a coordinate: the finding was stale; the real gap was elsewhere

You could not reproduce it, and you were right about the path you read. `bind_x`/`bind_y` to a
`time` subject, written directly or forwarded through a composite's `type="subject"` prop, was
already refused `TYPE_MISMATCH`. Those paths are now pinned by tests.

**The real gap** was close to your [Q-9] guess: a manifest's own `<bind>` declaration was never
checked against the setter it targets. A custom element (or a composite) declaring
`<bind name="bind_when" type="time" setter="bind_x"/>` validated clean and generated
`ui_obj_w.bind_x(&ui_subject_t);`. Even with `type="int"` the call did not compile, because
[D-20]'s origin, clamp and anchor rule are keyed by binding **name** (`geometry-bindings.ts`), so a
renamed geometry binding got none of them. Now refused at the `<bind>`, from both the widget and
composite manifest loops through one function (`checkBindDeclarations()`, `validate-schema.ts`):
a geometry setter reached under another name (**new code `U8G2GL_GEOMETRY_BINDING_ALIAS`**), and
a type the inherited setter (or, on a drawing manifest, the target prop) does not accept
(`TYPE_MISMATCH`). PR-4R's "time above INT32_MAX goes negative" was reachable only through this
path, and is closed with it.

**Spec debt:** §15 should list `U8G2GL_GEOMETRY_BINDING_ALIAS`.

## Item 3 — radius at build time: the "when" rule was widened (owner ruling 2)

The bridge's "keep the existing rule about when to check" (radius, width, height all `draw=`)
admitted **no** element a style can reach: the box refuses every style form, and button and
switch (the only classes that read `radius`) declare it with `setter=`. A literal `radius="10"` on
a 20×6 button also passed.

**Measured first** (`test/test_radius_honoured.cpp`, `RadiusHonoured.*`): over 18 sizes × every
radius to `min/2 + 2`, the button (border layer 0, focused fill) and the switch track pass the
requested radius to U8G2 unchanged **exactly when `2r <= min(w,h)`**, else `min/2`. One rule.
Inner border layers and the switch handle derive their radius from the outer one by design.

**What ships.** The check runs for any element whose manifest declares `radius` (`draw=` or
`setter=`), with the radius taken by the same precedence init applies it (attribute >
`style_radius` > last named style in scope; `validator/configured-radius.ts`, mirroring
`styleLines()`), against literal width and height. Equality accepted (capsule). The diagnostic
names the source ("radius=10 (from style 'round')") and, for every element, now says the runtime
clamps it, which is what `u8g2gl_coord_corner_radius()` does on every path. **Accepted
consequence (ruling 2):** a label, which inherits `radius` and draws no rounded shape, is refused
an oversized one too.

**Spec:** your §10 wording from PR-4R's bridge (item 1 there) can now say the validator refuses a
literal radius **however it is written**, not only as an attribute.

## Item 4 — help text

`radius` help in `u8g2gl_box.xml` **and** `u8g2gl_obj.xml` (it reaches button and switch):
*"Corner radius in pixels; 2 × radius may not exceed the smaller of width and height"*.

---

## For you to rule on

1. **Generated code checks the schema version, never the runtime's.** A CLI 0.10.0 project with a
   bound container child fails against runtime 0.5.0 as a plain compile error on
   `u8g2gl_clip_scope`; one without such a child compiles silently. Rules/03's guardrail covers
   schema only. PR-05 is the first time generated code meets firmware a user builds separately.
2. **§13.5 wording** (item 1) and **§15's new code** (item 2), above.

## For PR-05

- A custom element may `extends="u8g2gl_box"` (a drawing element). It is accepted, and then emits
  method calls on a class that has no such members.
- A custom `<bind>` may alias an inherited **non-geometry** setter under a new name when the type
  matches (`name="bind_foo" setter="bind_text"`). Harmless today; noted so it is a decision, not
  an accident.

## For PR-06

- WO1's pixel test is the first to link the runtime against real U8G2 and **run** it. Under
  `ARDUINO`, `u8x8.h` adds `pins[]` to `u8x8_t`, and the existing `u8g2gl_u8g2_csrc` target is
  built without `ARDUINO`: two struct layouts, and a crash. WO1 added
  `u8g2gl_u8g2_csrc_arduino`; PR-06's pixel tests should use it.

## For the owner

- The main checkout's copy of `u8g2gl-standards` lacks documentation.md §4.1; this PR's worktree
  has it. Sync the skill.

## How the work went

Four WOs, serial, one amendment. WO2's worker surfaced the composite path; the PA reproduced it
through the built CLI and sent the same agent back, rather than carrying it. Every WO was
re-verified by the PA from a clean configure with the headline behaviour shown through the built
CLI. The bridge's two lessons held: the radius claim was measured before it was enforced, and the
duplicated paths (object vs draw call, attribute vs style, widget vs composite manifest) are where
both item 1's design problem and item 2's real gap were.
