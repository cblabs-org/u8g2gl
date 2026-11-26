# PR-09: focus, input dispatch and navigation (refreshed)

**Status:** PR-09 was approved in principle on 2026-11-24 ("Approve as recommended": Q5a, Q6a, Q7 of [REFRESH-PR-08-09.md](../pr-08-collection-api/REFRESH-PR-08-09.md)). This is its refresh against today's `main`, with the questions §12 leaves open. **Approved by the owner 2026-11-26 ("Approve as recommended"): Q1a as clarified, Q2a, Q3a and Q4a.** Work orders: [WORKORDERS-PR-09.md](WORKORDERS-PR-09.md).

**Base:** `main` at `834dcfa`, the #67 merge (schema 0.7 unreleased, runtime 0.16.0, CLI 0.27.0).

## What's there today (checked at `834dcfa`)

| # | Topic | Today |
|---|---|---|
| 1 | Parser and types | `<focus_ring wrap>` with `<focus name>` entries, and the three event children with `trigger` (`press`, `long_press`, `value_changed`), `screen` and `callback`, all parse into typed structures. `focus_style` is checked against the named styles. |
| 2 | Refusals | Pass 8 refuses all four constructs: a warning in `validate` and the designer, an error in `generate`. Realisation already models "a focus-ring member needs an object". |
| 3 | What "focusable" means | **Undefined.** §12.2 says "only named, focusable elements", but no manifest or class declares focusability. Today the validator checks only that a `<focus>` has a name. |
| 4 | Runtime input | **None.** No event type, no `ui_dispatch()`, no focus state. The flags are HIDDEN, DIRTY and DISABLED. |
| 5 | Screens | `u8g2gl_set_active_screen()` exists, and each screen has `activate_fn` and `deactivate_fn`. There's no stack and no back. |
| 6 | The button's "focus" | `u8g2gl_button` draws its inverted, focused look whenever its style has `invert`, so `invert` is standing in for focus. |
| 7 | The switch | Display only. It has `set_value()` and `bind_value()` to a bool subject, but nothing toggles it from input. |
| 8 | Style precedence (§10) | `apply_style()` is a plain `merge_from`, so a style applied later overwrites a property the element set itself. At init that's harmless, because styles are applied before properties (§13.7). `focus_style` re-applies at run time, so it would break here. |
| 9 | `<event_cb>` | §12.3 names the callback but gives no C++ signature. |
| 10 | Designer | No surface for any of it. The flow view (`[UD-7]`, F7) is the later navigation design. |
| 11 | Loose ends from PR-08 and E-3b | The text §18 report omits each storage line's name and derivation; there's a stale "until PR-08" comment at `parse-widget-manifest.ts:293`; and a number cell typed out of range (9090 into a 0–100 field) shows the typed text with no mark. |

## The decisions

**Q1. What can take focus** (finding 3).
- **Q1a (recommended): any named element written in the screen *may* be put in the ring.**
  - **Membership is opt-in and author-curated:** the ring is exactly the `<focus name>` entries the author writes, in their order. Nothing joins automatically; an element left out never takes focus, and a screen with no ring ignores input.
  - **A stop that does nothing is flagged:** a ring member with no events that is not a switch gets a warning naming it (`validate` and the designer). It's a warning, not an error, because a highlight-only stop (stepping through labels with `focus_style`) can be deliberate.
  - **Why it works:** being in a ring already makes the element an object (finding 2).
  - **Navigation:** it skips hidden and disabled elements, as §12.2 says.
  - **Schema:** no change.
  - **What focus does:** for a button or a switch, focus has an obvious meaning. For any other element, focus only shows its `focus_style` and dispatches its events, which is still useful, for example on a menu of labels.
- **Q1b:** a manifest attribute `<api focusable="true">`, on the button and switch only by default. That's stricter, but it adds schema surface: 0.7 is unreleased, so the addition would go into it.

**Q2. The switch, and `value_changed`** (finding 7).
- **Q2a (recommended): press toggles a focused switch.**
  - **Bound switches:** if the switch is bound to a bool subject, it writes the subject. That's the one place a binding works both ways, and it's what a settings screen needs.
  - **`value_changed`:** it fires when input changes an element's value. In PR-09 the switch is the only element that can.
  - **Anywhere else:** `value_changed` on an element that can't produce one is a warning, naming the element.
- **Q2b:** `value_changed` also fires when a binding changes the value. That's broader, but it runs the application's callbacks from its own subject writes, which invites loops.

**Q3. The button's focused look** (finding 6).
- **Q3a (recommended): a button draws inverted when it has focus, or when its style sets `invert`.**
  - Existing buttons keep their pixels, so the goldens and the device evidence stand.
  - Focus now inverts any button.
- **Q3b:** only focus inverts. That's cleaner, but every button styled `invert` today changes its pixels.

**Q4. Loose ends** (finding 11).
- **Q4a (recommended): fold all three into PR-09's last work order.** They're small, and each touches a file the PR is already in, or is next to one.
- **Q4b:** leave them for a separate tidy-up.

## PA rulings (settling what §12 doesn't, inside the approved scope)

1. **Events.** `u8g2gl_event_t` has these values:
   - `ENCODER_CW`, `ENCODER_CCW`, `ENCODER_CLICK` and `ENCODER_LONG_CLICK`;
   - `BUTTON_NEXT`, `BUTTON_PREV`, `BUTTON_PRESS` and `BUTTON_LONG_PRESS`.

   `ui_dispatch(event)` is a runtime entry point, beside `ui_handler()`. What each event does:
   - **CW and NEXT** move focus forward; **CCW and PREV** move it back.
   - **CLICK and PRESS** fire the focused element's `press` events.
   - **The two long events** fire `long_press`.

   The application times long presses, as §12.1 says: the framework never times input.
2. **Focus.** It's a new flag, `U8G2GL_FLAG_FOCUSED`.
   - **On activate:** a screen gives focus to its first visible, enabled ring member.
   - **With no ring:** a screen ignores input.
   - **Wrapping:** with `wrap="false"`, moving past either end does nothing.
3. **`focus_style` and the §10 fix.**
   - **What the object stores:** a mask of the style properties its own setters set, and a pointer to its base named style.
   - **`apply_style()`:** merges only the properties not in that mask.
   - **Gaining focus:** the focus style is applied.
   - **Losing focus:** the non-own properties are cleared, and the base style is re-applied.
   - **Cost:** one pointer and one mask per object. It's measured and reported in the PR, because RAM is a gate criterion (C3).
4. **Navigation.**
   - **`<screen_load_event>`:** pushes the current screen and its focus position, then activates the target.
   - **`<screen_back_event>`:** pops the stack and restores both. With an empty stack, it does nothing.
   - **Depth:** 4 by default, set by `U8G2GL_SCREEN_STACK_DEPTH`. When the stack is full, the oldest entry is dropped.
5. **`<event_cb>`'s signature:** `void <callback>(u8g2gl_obj& target, u8g2gl_trigger_t trigger);`.
   - **Generated:** `ui.hpp` declares it, and the application defines it. A missing definition is a link error naming it.
   - **Shared:** one callback may serve many elements.
   - **Validator:** the name must be a valid C identifier, and the generated-name collision check covers it.
6. **Generated output.** Each screen gets:
   - its ring as a table of object indices, with `wrap`;
   - each object's events as a compact table;
   - each target screen as a pointer.

   Nothing allocates.
7. **The editor target.**
   - **Scene:** the ring and events travel in the scene.
   - **Bridge:** it gains a dispatch.
   - **Canvas:** focus moves on the designer canvas exactly as it does on the device, and the test run compares a frame after each step.
   - **Navigation in the designer:** `screen_load` switches the designer's screen, and a callback is shown, not run.

## Work orders (one branch each, stacked from `main`)

**WO1, the runtime** (`u8g2gl-09/wo1-runtime`)
- **Input and focus:** events and `ui_dispatch()`; focus and the flag.
- **Triggers:** `press`, `long_press`, and `value_changed` with the switch toggle (Q2).
- **Navigation:** the screen stack.
- **Styling:** the §10 precedence fix and `focus_style`.
- **Button:** its focused look (Q3).
- **Tests:** host C++ tests against real U8G2 pixels, including the restore after losing focus and a property the element set itself surviving a focus style.

**WO2, the generator and validator** (`u8g2gl-09/wo2-generator`)
- **Generator:** emits the ring, events, callbacks and targets (ruling 6).
- **Pass 8:** drops its four PR-09 refusals.
- **New checks:**
  - a ring entry names an element in the screen;
  - a target names a screen;
  - the callback identifiers;
  - `value_changed` where nothing can produce it;
  - Q1's rule, including the warning for a ring member with no events that isn't a switch.
- **Goldens:** each diff explained.
- **Editor target:** carries the ring and events in the scene, with the bridge dispatch.
- **Parity test:** a multi-screen fixture driven through a sequence of events, with lit-pixel checks.

**WO3, the designer** (`u8g2gl-09/wo3-designer`, Q6a)
- a ring-membership marker in the Explorer (in the ring, and its position);
- the focus ring as an ordered, reorderable list, with `wrap`: the author adds and removes members explicitly, and nothing is added for them;
- each element's events in the property panel: the trigger, the target screen from a picker, and the callback;
- `focus_style` in the panel, picked from the named styles;
- a focus preview on the canvas: toolbar buttons with keys for next, previous, press and long press, and back;
- unit and e2e tests.

**WO4, docs, review and loose ends** (`u8g2gl-09/wo4-docs-review`)
- **Docs:** design_spec §10 and §12, ui_spec, implementation_plan (PR-09's row moves to U8G2GL, and the foundation wiring is noted for the cut-over), and the ChangeLog.
- **Versions:** runtime 0.17.0 and CLI 0.28.0.
- **Loose ends:** Q4's three, if Q4a.

**Boundary:**
- **Code:** `include/`, `src/`, `cli/src/core/**`, `wasm/bridge.cpp` and the Wasm build files, `designer/**`, and `cli/src/node/design/test-run/**`.
- **Fixtures and tests.**
- **If Q4a:** `cli/src/node/format-budget.ts` and the comment in `parse-widget-manifest.ts`.
- **Docs and versions.**
- **Not touched:** the schema version, the flow view, and either foundation repository.

## Verification (PA)
- **Suites:** every suite, run one at a time.
- **Built CLI:** generates a settings-menu fixture with a ring, all three events and two screens.
- **Host build:** dispatches a scripted sequence of events, checking the frames and the callback calls.
- **Browser:**
  - author a ring and its events entirely from the designer;
  - step focus on the canvas, toggle a bound switch, and go to another screen and back;
  - run a test run;
  - check that the XML on disk is exactly what the forms wrote.

## Status log

| Date | Event |
|---|---|
| 2026-11-25 | PA refreshed PR-09 against `main` at `834dcfa`, after #67 merged. Findings 1–11 are above. Q1–Q4 await the owner. Nothing is implemented. |
| 2026-11-25 | The owner asked whether ring membership is optional, and whether every element would be added automatically. PA clarified Q1a: membership is opt-in and author-curated, and nothing joins automatically. A ring member with no events that isn't a switch gets a warning. WO2 and WO3 were updated to match. |
| 2026-11-26 | **Approved by the owner.** Asked "Approve PR-09 with Q1a (as clarified) and Q2a–Q4a?", the owner replied, in their own words: **"Approve as recommended"**. |
