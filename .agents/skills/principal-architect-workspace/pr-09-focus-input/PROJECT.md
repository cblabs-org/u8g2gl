# PR-09: focus, input dispatch and navigation (§12)

**Status: APPROVED in principle by the owner 2026-11-24 ("Approve as recommended"). It runs after
PR-08 (Q1a), and gets its work orders, refreshed against PR-08's merge, when PR-08 lands.**

**Plan:** [REFRESH-PR-08-09.md](../pr-08-collection-api/REFRESH-PR-08-09.md), findings 6–12 and
decisions Q5a, Q6a and Q7.

## Approved scope

- **Q5a: a U8G2GL PR.**
  - **Runtime:** `ui_dispatch()` and the event set; the focus ring, skipping hidden and disabled
    elements, with `wrap`; the `press` and `long_press` triggers on focusable elements, and
    `value_changed` on any element; `<screen_load_event>`, `<screen_back_event>` (a fixed-depth
    stack, 4 by default, configurable) and `<event_cb>`; and `focus_style` applied at run time.
  - **The owed precedence fix:** `apply_style()` must stop a later style overwriting a property the
    element set itself (§10, ruled 2026-09-19).
  - **Generator and validator:** emitting all of the above, and dropping Pass 8's four PR-09
    refusals.
  - **Foundation:** the `ButtonModule` and `EncoderModule` wiring to `ui_dispatch()` is a small item
    on the held stack, for the cut-over (R10). It isn't part of this PR.
- **Q6a: the designer.**
  - **In PR-09:** a focusable marker on each element; the focus ring as an ordered, reorderable
    list, with `wrap`; each element's events in the property panel (the trigger, the target screen
    and the callback name); and a canvas preview of focus moving.
  - **After PR-09:** the flow view (`[UD-7]`, F7) stays the navigation design, planned when PR-09
    lands.
- **Q7:** runtime minor and CLI minor. No schema change is expected, because the vocabulary already
  parses; that gets re-checked when the work orders are drafted.

## Status log

| Date | Event |
|---|---|
| 2026-11-24 | **Approved in principle by the owner**, with PR-08 (see `../pr-08-collection-api/PROJECT.md`). Asked "Approve the refresh with Q1a–Q7 as recommended?", the owner replied, in their own words: **"Approve as recommended"**. No work orders yet, and no branch. |
