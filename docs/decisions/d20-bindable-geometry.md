# [D-20] Geometry is bindable; runtime layout belongs to the application

**Status**: Decided
**Date**: 2026-09-11
**Decision**: `x`, `y`, `width` and `height` are bindable properties like any
other. Anchors resolve at build time against the containing element. There is
**no runtime layout pass** — an element that must move or resize at runtime is
moved by application code through a subject, or by a custom widget that owns it.

## Context

[D-7] resolves anchors and arithmetic to literal integers during generation, and
states that no layout code ships to the device. That is correct for a screen,
whose size is a compile-time constant.

[D-18] makes composites real containers, which raises two questions [D-7] never
had to answer: what does `right="0"` mean inside a resizable widget, and what
happens when something must change size while the firmware is running.

## Decision

### 1. Anchors resolve against the containing element, at build time

`right`, `bottom`, `hcenter` and `vcenter` measure against the container, which
[D-18] makes a real object with real bounds. Two new constants make the
container's size available inside a composite's `<view>`:

- `#parent_width`
- `#parent_height`

These are ordinary constants inside the existing arithmetic (§7.2), **not** a
new percentage syntax. `width="#parent_width / 2"` needs no new grammar and is
strictly more expressive than `50%` would be — `#parent_width - 52` has no
percentage equivalent. Per §1.5's deferral rule, percentages wait for
demonstrated need.

The geometry validator must bounds-check against the **container**, not the
display, which is what it does today.

### 2. Geometry is bindable

`x`, `y`, `width` and `height` accept `bind_*` forms like any other property.
For an element realised as draw calls this compiles to an expression in the
generated `render()`; for an object it is the existing observer calling a
setter. No new machinery either way.

### 3. There is no runtime layout pass

A generated per-container `layout()` function was considered and **rejected**.
It would have required amending [D-7], adding a third phase to §11.3's
lifecycle, a forward-reference-only rule to keep a single pass deterministic,
and the editor running the identical function to stay pixel-exact. That is a
large amount of contract surface bought for one convenience.

Instead, dynamic geometry is imperative and explicit:

```cpp
ui_set_wifi_visible(false);                        // subject; label re-binds
ui_set_title_width(container_w - (x * 2));         // subject; label re-binds
```

and inside a custom widget, which owns its children directly:

```cpp
void status_bar::on_resize() {
    title_.set_w(get_w() - (wifi_.is_hidden() ? 40 : 52));
}
```

*Trigger to revisit:* hand-written relayout appearing as friction across three
or more real screens — the same trigger [D-7] already sets for `<row>`/`<col>`.

### 4. Application code talks to subjects, never to objects

Generated objects are `static` and file-local (§13.12), so the application
cannot reach them, and that is deliberate. Exposing them would reopen the
coupling [D-8] closed and would make every generated object public API that can
never be renamed, demoted or optimised away.

The application sets **subjects**; elements bind to them. Where the arithmetic
is genuinely internal to a composite, it belongs in a custom widget, which has
direct typed access to its own children ([D-18]).

## Required runtime work

The base object supports `set_coords(x, y, w, h)` only — there are no individual
setters, so changing one dimension today means reading and re-passing the other
three, with four same-typed `int16_t` arguments and nothing to catch a
transposition.

Bindable geometry **requires** per-axis setters regardless of ergonomics: a
`bind_width` observer receives one value and has nothing sensible to pass for
the others.

1. Add `set_x` / `set_y` / `set_w` / `set_h`, keeping `set_coords` for the
   generator's `init()` path, where one call is smaller than four in committed
   generated code.
2. **`set_coords()` does not call `mark_dirty()`.** Harmless today, because
   coordinates are only set during `init()` before anything has rendered. Once
   geometry is dynamic, a move or resize will not mark the frame dirty, so
   §11.2's gate skips the redraw and the change does not appear until something
   unrelated forces a frame. It works whenever anything else on screen is
   animating and fails silently on a static screen.
3. Audit `set_hidden()` and `set_disabled()` for the same defect.

## Consequences

- **[D-7] is untouched.** No layout engine, no layout pass, no third lifecycle
  phase.
- A container whose geometry is bound cannot have anchor-positioned children —
  that would be reflow. Absolute coordinates only, enforced as a diagnostic.
- Schema 0.4, shared with [D-18] and [D-19].
