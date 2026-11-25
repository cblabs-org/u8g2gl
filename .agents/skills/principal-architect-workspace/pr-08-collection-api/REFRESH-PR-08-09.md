# PR-08 and PR-09, refreshed against today's main

**Status:** **approved by the owner on 2026-11-24**, with Q1a–Q7 as recommended. PR-08 runs first; PR-09 gets its work orders when PR-08 lands.

**Base:** `main` at `8012495`, the #66 merge (schema 0.7, runtime 0.15.0, CLI 0.26.0).

**Why now:** PR-10, which migrates the remaining boards and retires the legacy display module, needs both of these. The gate's condition 2 also binds PR-08: **[Q-19] must be resolved before any collection widget ships in foundation.**

## What's there today (checked at `8012495`)

### PR-08: custom C++ elements, and the collection API

| # | Topic | Today |
|---|---|---|
| 1 | Custom elements via `extends` (§6.5) | **Work.** G-PROBE-2 built two project widgets end to end. E-3a added static children (`<element>`), run-time data (`<data>`) and the editor fill path. |
| 2 | A composite with its own C++ class (`<view>` and `extends` together) | **Refused**, as "not yet supported, PR-08" (Pass 8, and `typed_child_pointer` in `realise.ts`). Nothing in the departures board or the foundation boards needs one. |
| 3 | Firmware access to a named element | **None.** Every object is `static` in its screen's `.cpp`, and `ui.hpp` exports only the screen functions. An application can't reach `services` to fill it. E-3b's test run had to go through `ui_screen_<s>.objs[i]`, with a guard. |
| 4 | §9.2's generated typed API (`ui_departures.begin()` / `add_row()` / `commit()`) | **Doesn't exist.** The spec shows it, and §9.4 and §9.6 both say it's still PR-08's. |
| 5 | Collection storage ([Q-19]) | **Fixed at the manifest's defaults.** A service list declaring `max_rows="1"` and one declaring `max_rows="10"` each carry 2,304 bytes. §18 can't report the cost, so the designer shows "RAM cost not reported for project widgets ([Q-19])". The manifest's `help="Determines allocated RAM"` is false. |

### PR-09: focus, input and navigation (§12)

| # | Topic | Today |
|---|---|---|
| 6 | Schema and parser | `<focus_ring>`, `<event_cb>`, `<screen_load_event>` and `<screen_back_event>` **parse**, and the reference finder knows them. |
| 7 | Validator and generator | **Refused**, as "not yet supported, PR-09": a warning in `validate` and the designer, an error in `generate`. |
| 8 | Runtime | **Nothing.** There's no `ui_dispatch()`, no event enum, no focus ring, no screen stack, and no `focus_style` at run time. The button's "focused" look is its `invert` style flag. |
| 9 | `focus_style` and §10 precedence | **The owed bug is live.** `apply_style()` lets a style applied later overwrite a property the element set itself, which §10 forbids. `focus_style` re-applies a style at run time, so PR-09 has to track which properties the element set (ruled 2026-09-19). |
| 10 | Which repo | The ledger says **foundation**, but nearly all the work is in U8G2GL: the runtime, the generator, the validator and the designer. Foundation's part is wiring `ButtonModule` and `EncoderModule` to `ui_dispatch()`, and under R10 that stays on the held draft stack. |
| 11 | The designer | **No surface** for focus rings or events. Your principle, that the designer shows every schema capability, means PR-09 can't land them as XML-only. ui_spec's flow view (`[UD-7]`, F7) is the navigation design, which hasn't been designed yet. |
| 12 | Order | `implementation_plan.md` flags PR-08 ∥ PR-09 as "conflict likely": both change the runtime and the generator's emit. |

## The decisions

**Q1. Order.**
- **Q1a (recommended): PR-08 first, then PR-09.**
  - PR-08 carries the gate's binding condition (Q-19).
  - It also adds the named element handles (finding 3), which PR-09's generated dispatch can use instead of growing its own way in.
  - Running them in sequence avoids the generator conflict.
- **Q1b:** PR-09 first. Input is the more visible feature, but Q-19 then waits longer.

**Q2. PR-08: what firmware gets to fill a collection** (findings 3 and 4).
- **Q2a (recommended): §9.2 as written, plus a handle for every named element.**
  - **Handles:** `ui.hpp` declares a typed reference for every named element, for example `extern wd_service_list& ui_departures_services;`. The screen name is part of the identifier, because element names are unique per screen, not across the project.
  - **Collections:** each `<data>` gets a small generated facade, for example `ui_departures_services_rows`. Its `begin()`, typed `add_row(…)` and `commit()` forward to the widget's own methods. The `add_row` parameters come from the `<field>`s, and `capacity()` is the declared value.
  - **Why:** it's what §9.2 promises, and the application stays out of the widget's private methods.
  - **Cost:** generated API is permanent surface, so the naming gets fixed here.
- **Q2b:** handles only. The application calls the widget's own `begin()`, `add_row()` and `commit()` through the handle, and §9.2 is rewritten to say so. It's smaller, but every widget's access method becomes the public API, with no check that the arguments match the `<field>`s.

**Q3. PR-08: who owns collection storage ([Q-19])** (finding 5).
- **Q3a (recommended): generated storage, sized per instance.**
  - **Declaring it:** a `<data>` declares its bytes per row from its fields (`repeat`, `max_len`), and the generator multiplies by the instance's capacity.
  - **Allocating it:** the generator allocates a static buffer per instance and hands it to the widget at init, through one new framework hook on the object.
  - **Reporting it:** §18 reports the figure. The designer's "RAM cost not reported" line becomes a real number, and the `help` text becomes true.
  - **Who changes:** widget authors stop allocating rows themselves. `wd_service_list` and `wd_train_formation` are migrated as the worked examples.
  - **Schema:** a manifest addition, so it needs 0.7 still unreleased, or a 0.8 bump. Both are your call (rule 03).
- **Q3b:** the widget keeps its own storage, sized by a C++ template parameter from the declared capacity. No new hook is needed, but the generated object type changes per instance, and widget authors have to write templates.
- **Q3c:** the widget keeps its storage, and the manifest declares a size formula only so §18 can report it. This makes the figure honest but doesn't remove the waste, so condition 2 is only half met.

**Q4. PR-08: composites with their own C++ class** (finding 2).
- **Q4a (recommended): defer.** The refusal stays, its message names a later PR instead of PR-08, and no current board needs one.
- **Q4b:** build it in PR-08. That means a typed member pointer to each direct child, per [D-6] as [D-18] amends it.

**Q5. PR-09: where it lives** (finding 10).
- **Q5a (recommended): PR-09 is a U8G2GL PR.**
  - **What it builds:**
    - in the runtime: `ui_dispatch()`, the event set, the focus ring (skipping hidden and disabled elements), `press` and `long_press`, `value_changed`, the screen stack (depth 4, configurable), and `focus_style` with the §10 precedence fix;
    - in the generator: emitting all of these;
    - in the validator: dropping the four refusals;
    - in the designer: the surfaces in Q6.
  - **Foundation:** the `ButtonModule` and `EncoderModule` wiring becomes a small foundation item on the held stack, for the cut-over.
- **Q5b:** keep it a foundation PR, as the ledger says. The U8G2GL half would then be an unplanned dependency.

**Q6. PR-09: the designer** (finding 11).
- **Q6a (recommended): authoring in PR-09, the flow view after it.**
  - **PR-09 gives:**
    - a focusable marker on each element;
    - the focus ring as an ordered, reorderable list, with `wrap`;
    - each element's events in the property panel: the trigger, the target screen and the callback name;
    - a way to preview focus moving on the canvas.
  - **After PR-09:** the flow view (F7) stays the navigation design, planned when PR-09 lands.
- **Q6b:** the flow view in PR-09 as well. That's the complete picture, but it's the largest option, and it has no design yet.
- **Q6c:** no designer work in PR-09. Ruled out by your principle, so it's listed only for completeness.

**Q7. Versions.**
- **PR-08:** runtime minor, for the storage hook (Q3a). CLI minor, because generated output changes and the goldens move for a reason. Schema as Q3 rules.
- **PR-09:** runtime minor and CLI minor. No schema change is expected, because the vocabulary already parses. That gets re-checked when its work orders are drafted.

## Shape (if approved as recommended)

**PR-08**, work orders stacked from `main`:
1. **WO1, named element handles:** generator and goldens.
2. **WO2, generated storage:** the manifest declaration, the runtime hook, the generator's allocation and §18's report. Both widgets are migrated, and the designer shows the real RAM figure.
3. **WO3, the generated collection facade:** E-3b's test-run firmware half moves onto it, and the `objs[i]` index guard retires.
4. **WO4, docs and review:** §6.5, §9.2, §18, Q-19 closed, the ChangeLog and the versions.

**PR-09**, its work orders drafted when PR-08 lands and refreshed against it. In outline:
- the runtime, covering dispatch, focus, events, the stack and `focus_style` precedence;
- the generator and validator;
- the designer surfaces (Q6a);
- docs.

**Boundary (PR-08):**
- **Code:** `include/`, `src/` (the object hook only), `cli/src/core/generator/**`, `cli/src/core/validator/**`, the manifest parser and schema (Q3), `designer/**` (the RAM line), `cli/src/node/design/test-run/**` and `wasm/harness.cpp` (WO3).
- **Fixtures:** the two project widgets and their fixtures.
- **Docs, versions and goldens.**
- **Not touched:** foundation.

**Verification (PA):**
- every suite, run one at a time;
- goldens diffed and each change explained;
- the built CLI generating the departures fixture;
- a host build that fills a collection through the generated API;
- §18's figure checked against `sizeof`;
- the designer showing a real RAM cost for both widgets.

## Status log

| Date | Event |
|---|---|
| 2026-11-24 | PA refreshed PR-08 and PR-09 against `main` at `8012495`, after #66 merged. Findings 1–12 are above. Q1–Q7 await the owner. Nothing is implemented. |
| 2026-11-24 | **Approved by the owner.** Asked "Approve the refresh with Q1a–Q7 as recommended?", the owner replied, in their own words: **"Approve as recommended"**. PA confirmed schema 0.7 is unreleased (no npm package, no schema tag), so Q3a needs no schema bump; and, settling Q3a's detail, each row's size follows from the `<field>`s the manifest already declares, so the manifest gains nothing. See [PROJECT.md](PROJECT.md). |
