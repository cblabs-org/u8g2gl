# PR-09: focus, input dispatch and navigation (§12)

**Status: APPROVED by the owner 2026-11-26 ("Approve as recommended"), as refreshed against
PR-08's merge.** It was approved in principle on 2026-11-24.

**Plan:** [REFRESH-PR-08-09.md](../pr-08-collection-api/REFRESH-PR-08-09.md), findings 6–12 and
decisions Q5a, Q6a and Q7; refreshed in [RESCOPE-PR-09.md](RESCOPE-PR-09.md), findings 1–11,
decisions Q1a (as clarified), Q2a, Q3a and Q4a, and PA rulings 1–7, which bind this PR.
**Work orders:** [WORKORDERS-PR-09.md](WORKORDERS-PR-09.md).
**Base:** `origin/main` @ `834dcfa` (the #67 merge). Schema 0.7 (unreleased), runtime 0.16.0, CLI 0.27.0.

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
  - **In PR-09:** a ring-membership marker on each element (refined by Q1a: membership is
    opt-in); the focus ring as an ordered, reorderable
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
| 2026-11-25 | PA refreshed PR-09 against `main` @ `834dcfa`, after #67 merged ([RESCOPE-PR-09.md](RESCOPE-PR-09.md)). The owner asked whether ring membership is optional; PA clarified Q1a (opt-in and author-curated, with a warning for a ring member that has no events and isn't a switch). |
| 2026-11-26 | **Approved by the owner.** Asked "Approve PR-09 with Q1a (as clarified) and Q2a–Q4a?", the owner replied, in their own words: **"Approve as recommended"**. That approves Q1a, Q2a (press toggles a focused switch and writes its bound subject; `value_changed` fires on input only), Q3a (a button inverts when focused or styled `invert`) and Q4a (the three loose ends go into WO4). PA checked schema 0.7 is still unreleased: `u8g2gl` isn't on npm and there's no schema tag. PA branched `u8g2gl-09/wo1-runtime` from `origin/main` @ `834dcfa` in `../U8G2GL-e4`. |
