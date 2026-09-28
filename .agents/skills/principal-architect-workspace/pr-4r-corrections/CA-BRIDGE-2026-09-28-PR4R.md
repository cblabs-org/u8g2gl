# Bridge to the CHIEF ARCHITECT — PR-4R complete; the radius bound, measured

**From:** Principal Architect, PR-4R
**Date:** 2026-09-28
**Stack tip:** `u8g2gl-4r/wo5-readability` (WO2–WO5), based on `main` @ `ca398ac` (WO1, merged as #6)
**Ledger:** [PROJECT.md](PROJECT.md)

**All four corrections are delivered and independently verified.** Baselines at the tip:
**C++ 377 tests** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), **zero warnings** from a clean configure; **CLI 1087 tests / 64 files**; `tsc` and lint clean (main @ `92de668` was 362 / 1055). **Schema 0.4 (unchanged), CLI 0.8.0, runtime 0.5.0.**

The owner asked that the radius findings come to you. Item 1 is those findings, and it asks you to
write the bound into the spec. Items 2–8 are smaller spec edits and questions the work surfaced.
None of them blocks the PR.

---

## 1. The radius bound is `2r <= min(w,h)`, not ruling C's `r <= min(w,h) - 1`

**Your derivation was right about `xr = x + w - r - 1`, but something else wraps first.** Between
the corner discs, `u8g2_DrawRBox` and `u8g2_DrawRFrame` draw a band of width `ww = w - r - r` (and
height `hh = h - r - r`), computed in `u8g2_uint_t` (`u8g2_box.c:121–123` and `:134–136`,
DrawRFrame `:183–188`, at 2.36.18). Once `2r > w`, `ww` wraps to a huge value. The `ww >= 3` guard
that follows then *passes*, so U8G2 draws a box of the wrapped width, clipped only by the display.

**Measured, not reasoned.** I ran the measurement before WO3 was dispatched. It uses the pinned
submodule (`d66b49af`), a 128×64 full buffer, every radius at five sizes, both primitives, and
counts pixels set outside the box. Host: macOS arm64, `U8G2_16BIT`.

| Bound | Accepted radii that draw outside the box |
|---|---|
| `r <= min(w,h) - 1` (ruling C) | **30 of 68.** A 10×10 `drawRBox` at r=6 sets **1310** pixels outside itself |
| `2r <= min(w,h)` | **0**, and every radius it refuses does draw outside |
| `2(r+1) <= min(w,h)` (WO11b as it was) | 0, but it refused 10 radii that draw cleanly, capsules included |

**`2r <= min(w,h)` is exact in both directions.** It keeps every aim of ruling C: it relaxes
WO11b, admits every capsule, and warns on nothing. Only the number differs. The owner set it on the
measurement (PROJECT.md, "Owner instruction — 2026-09-28 12:07 BST", verbatim) and asked that you
be told.

**It is now held in the suite, not only in the evidence.** WO3 added
`RealU8g2RoundedBoxBound.*`. The test links the pinned U8G2 **C sources**, not the test double, and
sweeps 14 sizes (odd, even, non-square, 1×6 through 40×5) with both primitives. Every radius the
runtime helper can return draws nothing outside the box, and `min/2 + 1` draws outside at every
size. **A U8G2 bump that moves the boundary fails the build's tests.** The spec can cite the test
and the one-off harness at [evidence/rbox-bound/](evidence/rbox-bound/).

**Where the number lives now:**
- runtime: `u8g2gl_coord_corner_radius()` in `include/u8g2gl/u8g2gl_coord.h`, used by
  `u8g2gl_draw_box` and by the button and switch;
- validator: `checkCornerRadius()` in `cli/src/core/validator/validate-geometry.ts`.

Both cite the same lines and the same evidence.

**What you said you would do:** write the bound into the spec once WO3 confirmed it empirically. It
has. Proposed wording, for §6.2 or §10 `radius`: *"A rounded box's corner radius satisfies
`2·radius <= min(width, height)`. The validator refuses a literal radius beyond it, and the runtime
clamps a radius known only at run time (bound size, or radius from a style) to it. At equality the
corners form a capsule, which is intended."*

**Ruling D's wording needs one qualifier.** *"Default r = h/2 is inside the bound for any h >= 2"*
holds only when `h <= w`. A narrow switch (`w < h`) has always been clamped to `w/2`, and the helper
keeps that exactly. The default-switch pin covers 12 sizes, off and on, including two narrow ones,
with values captured from the base runtime, and it fails if the bound is ever tightened. So nothing
changed, but the spec should not repeat the unconditional form.

## 2. §13.5's example no longer matches what is emitted

A bound integer draw-call argument is now emitted through the object path's clamp:
`u8g2gl_draw_box(display, u8g2gl_coord_bound(40, ui_subject_knob_x.get()), 10, 4, 4, true, 0)`.
§13.5's "Bindings without an object" example shows the bare read. The normative paragraph at the end
of §13.5 is satisfied; the illustration is stale. Firmware, the editor host and the object path all
call the one helper, and the parity tests now agree on clamped values, where at the base they agreed
on *wrapped* ones: +40000 drew at x=40040, and −40000 at x=25576, on screen.

## 3. Realisation is still observable through clipping (new; not in PR-4R's mandate)

Objects are clipped to their container (§13.3); draw calls are not. So a draw-call child that
overhangs its container paints outside it, and the same element as an object would not. This is the
[D-18] argument again, through a different door. It wants a ruling: clip draw calls to their
container at emit time, or state that containers do not clip draw-call children. Found by WO4's
worker while building the two-realisation test.

## 4. The same-class two-realisation test cannot be written before PR-09

The two §13.5 conditions that would make one element an object without changing its drawing, an
`<event_cb>` and focus-ring membership, are both refused until PR-09. So WO4 compares a box (draw
calls) with a label (object) that share one binding. That is sufficient for the ruling, and a
same-class test belongs in PR-09.

## 5. A bound `time` subject reaches the clamp as `uint32_t`

Implicitly converted (no warning without `-Wconversion`). Epoch values above INT32_MAX go negative on
both targets before the clamp. Both targets agree, so it is not a realisation leak, but a time bound
to a coordinate is probably a validator refusal waiting to be written.

## 6. Style radii are only ever checked at run time

A `style_radius` or `<style radius>` on a button or switch is never checked at build time. The
runtime clamp now makes it safe, but silently. Is a build-time warning wanted where the element's
size is literal? A design question, not a defect.

## 7. `style_*` on a drawing element is refused with the setter message, not §13.5's

The outcome is right. The message talks about setters when the real reason is "no object to style".
Pre-existing, and left alone.

## 8. The box manifest's `radius` help text does not state the bound

For whoever writes item 1 into the spec.

---

## For the owner, not the Chief Architect

- WO1 shipped as #6 and is merged. **PR-04b can be released** if it has not been already.
  PR-4R's remaining changes touch `emit/draw-args.ts`, `emit/screen.ts` (one include line) and
  `emit/screen-model.ts`, and none of `fonts.ts`, `images.ts` or `xbm.ts`.
- `cli/package-lock.json` had been stale since 0.6.0. WO5 brought it to 0.8.0.
- One small open edge from WO5: when `style_text` is refused, the suggestion is now the plain
  attribute `text` (machine-applicable, [D-16]). If the element *already* writes `text=`, applying it
  would duplicate the attribute. Worth a follow-up issue; not filed from here.
