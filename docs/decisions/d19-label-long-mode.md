# [D-19] Text overflow is a label property, not a widget type

**Status**: Decided
**Date**: 2026-09-11
**Decision**: `u8g2gl_label` gains `long_mode="clip|dots|scroll|scroll_circular"`,
default `clip`. `truncate` is deleted. `u8g2gl_scrolling_label` is removed as a
separate widget.

## Context

The design shipped two widgets whose manifests are identical except for three
properties and the `animated` attribute. `text`, `font`, `align`, `truncate`,
`bind_text` and `bind_text_int` are declared verbatim in both
`u8g2gl_label.xml` and `u8g2gl_scrolling_label.xml` — six declarations
maintained in two places.

Worse, overflow behaviour is already expressed *twice* and inconsistently: as a
boolean (`truncate`, clip-or-not) on one widget, and as a whole separate widget
for the third behaviour.

LVGL solves this with one `lv_label` carrying
`long_mode = wrap | scroll | scroll_circular | clip | dots`. §1.4 lists
familiarity with LVGL Pro as a design principle, and here that principle and the
engineering both point the same way.

## Decision

One class. `long_mode` is an enum property on `u8g2gl_label`:

| Value | Behaviour |
|---|---|
| `clip` | Hard clip at the widget bounds. **Default** |
| `dots` | Truncate with an ellipsis |
| `scroll` | Marquee, reversing at each end |
| `scroll_circular` | Marquee, wrapping continuously |

`wrap` is **not** offered — U8G2GL labels are single-line. This is a deliberate
omission from LVGL's set and must be documented, because a user arriving from
LVGL will try it.

`truncate` is deleted. Note it is declared on `u8g2gl_obj`, not on the label, so
its removal touches the base class and the style — see the remediation notes.

## Rejected: one tag, two classes

An earlier proposal kept both C++ classes and had the generator choose between
them from the `long_mode` value. Rejected for three reasons:

1. **It relocates the duplication rather than removing it** — the copy-paste
   moves from the manifests into C++.
2. **`extends` stops being determinate.** `wd_scrolling_message_pool extends
   u8g2gl_scrolling_label` works today because the class has a name. If one tag
   maps to two classes by prop value, `extends="u8g2gl_label"` means nothing
   specific.
3. **[D-17] cannot express it.** The manifest is *data*; a tag-to-class rule
   keyed on a property value is a special case inside the generator, which is
   exactly what [D-17] exists to prevent.

## Cost accepted

Every label carries the scroll state, whether it scrolls or not. Measured
against the shipped classes:

| Class | Instance members |
|---|---|
| `u8g2gl_label` | `text_` — 4 bytes on a 32-bit target |
| `u8g2gl_scrolling_label` | plus `last_scroll_ms_`, `scroll_x_`, `message_width_`, `initial_delay_ms_`, `static_dwell_ms_`, `scroll_px_per_sec_`, and three flags — approximately 20 bytes |

So roughly **16 bytes per label instance**, and less in practice: `dots` mode
needs text measurement too, so `message_width_` and `needs_layout_` are shared
rather than added. Twenty labels on a busy screen is about 320 bytes against a
floor of 16 KB usable RAM ([D-1]).

The one case that would change this answer — a large array of labels, where 96
cells would cost 1.5 KB — does not arise: that case is already a custom widget
with packed cell storage (`wd_service_list`), not 96 label objects.

## Consequences

- `u8g2gl_scrolling_label` is deleted: header, implementation, manifest, tests
  and its `CMakeLists.txt` entry.
- `wd_scrolling_message_pool` extends `u8g2gl_label` instead.
- `scroll_px_per_sec`, `initial_delay_ms` and `static_dwell_ms` are meaningless
  when `long_mode` is `clip` or `dots`. The property panel needs `visible_when`,
  which [ui_spec.md §9](../ui_spec.md) does not yet have. Additive schema.
- Schema 0.4, shared with [D-18].
