# WO2 — Formation Widget & Message Pool

**Work Order:** wo2-formation-and-messages
**Programme:** G-PROBE-2 (Custom Widget Path)
**Branch:** `u8g2gl-probe2/wo2-formation-and-messages`
**Worktree:** `/Users/mcneillm/Documents/Projects/U8G2GL-probe2`
**Predecessor:** [WO1 — Widget Path](../wo1-widget-path/WORKORDER.md) (complete — widget path proven, `wd_service_list` working)
**Complexity:** standard

---

## Objective

Build two things in the existing WO1 probe project fixture:

1. **`wd_train_formation`** — A C++ custom widget that renders twelve carriages with per-carriage class, wheelchair, bike and loading indicators. Pixel arithmetic for loading gauges. This exercises: extending `u8g2gl_obj`, manual `render()`, the `u8g2gl_state_saver` pattern, container clipping of child content.

2. **Message pool as host policy** — Test whether a `u8g2gl_label` with `long_mode="scroll_circular"` and C++ host code writing the subject is sufficient to implement a scrolling message carousel. If a timer is needed to rotate messages, demonstrate using `u8g2gl_timer`.

---

## Boundary Box

### Files you MUST create

| File | Purpose |
|---|---|
| `evidence/probe-project/widgets/wd_train_formation/wd_train_formation.xml` | Widget manifest — `extends="u8g2gl_obj"`, `<api>` with `<prop>` declarations for capacity |
| `evidence/probe-project/widgets/wd_train_formation/wd_train_formation.hpp` | Widget C++ header |
| `evidence/probe-project/widgets/wd_train_formation/wd_train_formation.cpp` | Widget C++ implementation |

All paths relative to `/Users/mcneillm/Documents/Projects/U8G2GL-probe2/.agents/skills/principal-architect-workspace/g-probe2-widgets/`.

### Files you MUST update

| File | What to add |
|---|---|
| `evidence/probe-project/screens/screen_departures.xml` | Add `<wd_train_formation>` placement + `<u8g2gl_label>` for the message area |
| `evidence/probe-project/globals.xml` | Add subjects for message text and any formation bindings needed |
| `evidence/FINDINGS-WO2.md` | **Create new file** — WO2 findings |

### Files you MUST NOT touch

Everything outside `evidence/` — no files in `src/`, `include/`, `cli/`, `wasm/`, `docs/`, or `test/`.

---

## Part 1: `wd_train_formation`

### Mock data to render

From `nationalRailBoard.json` → `header.firstServiceFormation`:

```json
[
  { "number": 1,  "classType": "standard", "hasWheelchair": true,  "hasBike": false, "loading": "30%" },
  { "number": 2,  "classType": "standard", "hasWheelchair": false, "hasBike": true,  "loading": "50%" },
  { "number": 3,  "classType": "first",    "hasWheelchair": true,  "hasBike": true,  "loading": "80%" },
  { "number": 4,  "classType": "standard", "hasWheelchair": false, "hasBike": false, "loading": "100%" },
  { "number": 5,  "classType": "standard", "hasWheelchair": false, "hasBike": false, "loading": "40%" },
  { "number": 6,  "classType": "standard", "hasWheelchair": true,  "hasBike": false, "loading": "20%" },
  { "number": 7,  "classType": "standard", "hasWheelchair": false, "hasBike": false, "loading": "10%" },
  { "number": 8,  "classType": "standard", "hasWheelchair": false, "hasBike": true,  "loading": "60%" },
  { "number": 9,  "classType": "standard", "hasWheelchair": false, "hasBike": false, "loading": "90%" },
  { "number": 10, "classType": "standard", "hasWheelchair": false, "hasBike": false, "loading": "70%" },
  { "number": 11, "classType": "first",    "hasWheelchair": true,  "hasBike": false, "loading": "5%" },
  { "number": 12, "classType": "standard", "hasWheelchair": false, "hasBike": false, "loading": "55%" }
]
```

### Widget specification

The widget renders the train formation diagram as a horizontal strip showing carriage outlines with per-carriage indicators.

**Display geometry**: The widget occupies the region below the primary service row and above the services table. On a 256×64 display with the service header occupying rows 0–15 and the service list at 51–63, the formation strip goes approximately at `y=17, height=32` (rows 17–48), full width 256px.

**Per-carriage rendering** (pixel arithmetic — this is the point of the exercise):
- Each carriage is an outlined rectangle. With 12 carriages in 256px, each carriage cell is ~20px wide (12 × 20 = 240, leaving 16px for spacing/margins).
- **Carriage outline**: 1px border rectangle
- **Class indicator**: "1" glyph or filled rectangle at top-left corner of first-class carriages
- **Loading gauge**: A filled bar at the bottom of each carriage rectangle. Height proportional to loading percentage. E.g. if carriage is 20px tall inside the outline, 80% loading = 16px filled from the bottom.
- **Wheelchair indicator**: A small "W" glyph or distinct marker if `hasWheelchair` is true
- **Bike indicator**: A small "B" glyph or distinct marker if `hasBike` is true

**Important**: These are monochrome pixels on a 256×64 OLED. Keep the indicators simple and legible — single characters, filled rectangles, not icons. The point is proving pixel arithmetic in a widget, not graphic design.

### Manifest

Follow the same pattern as `wd_service_list.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget name="wd_train_formation" extends="u8g2gl_obj">
    <api>
        <prop name="font" type="font" required="true" help="Font for carriage labels." />
        <prop name="max_carriages" type="int" default="12" help="Carriage capacity." />
    </api>
</widget>
```

### C++ class

Follow the `wd_service_list` pattern:
- Extends `u8g2gl_obj`
- Static storage: `carriage_t carriages_[MAX_CARRIAGES]` where `carriage_t` holds number, class, wheelchair, bike, loading
- Data ingestion: `begin()`, `add_carriage(number, class_type, wheelchair, bike, loading_pct)`, `commit()`
- `set_font()` and `set_max_carriages()` setters matching the `<prop>` declarations
- `render(U8G2& display)` override with pixel arithmetic
- Zero heap, SPDX header, trailing underscore members, Doxygen on public API
- Compile under `-Wall -Wextra -Wpedantic -Werror -std=c++17`

### Validation & generation

After creating the widget:
1. Run `u8g2gl validate` on the probe project — must pass (0 errors, warnings OK if expected)
2. Run `u8g2gl generate` on the probe project — must succeed and emit includes, static instance, setter calls for `wd_train_formation`
3. **Do NOT re-run the Wasm render script** — rendering happens in WO3

---

## Part 2: Message Pool as Host Policy

### The question

ui_spec §7.3 assigns carousel policy to the host. The message pool is two long messages from `nationalRailBoard.json`:

> "A reduced train service will be running to and from London Waterloo from Good Friday 3 April..."
> "Trains between Norwood Junction / Crystal Palace and New Cross Gate may be delayed..."

**Is a `u8g2gl_label` with `long_mode="scroll_circular"` and C++ writing the subject sufficient?**

### What to build

Add to `screen_departures.xml`:

```xml
<u8g2gl_label name="message_bar" x="30" y="17" width="226" height="13"
              font="u8g2_font_6x10_mr" long_mode="scroll_circular"
              bind_text="message_text" />
```

Add to `globals.xml`:

```xml
<string name="message_text" value="" max_len="256" />
```

### What to document

In `FINDINGS-WO2.md`, answer:

1. **Is `long_mode="scroll_circular"` genuinely sufficient for a single message?** The label already handles the marquee — the question is whether binding the subject, and having C++ write the next message when the label signals scroll completion, gives the host enough control.

2. **Does message rotation need a timer?** If the label provides a scroll-complete callback or the host can poll `tick()` state, a timer may not be needed. If a timer is needed, show how `u8g2gl_timer` from PR-5R2 would be used (a few lines of C++ pseudocode is enough — this does not need to compile).

3. **What is missing?** If the label + subject + host-policy model is not enough, say what is missing and whether it is a backlog item or a blocker.

The expectation from the bridge prompt is: "If that is genuinely enough, say so; if it isn't, that is a finding."

---

## Findings document template

Create `evidence/FINDINGS-WO2.md`:

```markdown
# G-PROBE2 Work Order 2: Formation Widget & Message Pool Findings

## Executive Summary
[1-2 paragraphs]

## 1. wd_train_formation
### 1.1 Generator Behavior
[What it emitted, what it refused, exact diagnostics]

### 1.2 Widget Implementation
[SLOC breakdown by concern, storage cost, pixel arithmetic approach]

### 1.3 Widget Author Experience
[What the spec told them, what they had to figure out]

## 2. Message Pool as Host Policy
### 2.1 Is long_mode="scroll_circular" sufficient?
[Answer]

### 2.2 Does message rotation need a timer?
[Answer with evidence]

### 2.3 What is missing?
[Answer or "nothing"]

## 3. Verification Summary
[Validate pass/fail, generate pass/fail, compilation pass/fail]
```

---

## Verification Requirement

1. `u8g2gl validate evidence/probe-project/` must pass (0 errors; warnings OK if expected)
2. `u8g2gl generate evidence/probe-project/` must succeed and emit correct includes + setters for `wd_train_formation`
3. C++ syntax check: the new widget `.hpp` and `.cpp` must compile cleanly with `clang++ -Wall -Wextra -Wpedantic -Werror -std=c++17 -fsyntax-only` (include paths: `-I<project-root>/include`)
4. All evidence files exist and are committed

The CLI is available at `/Users/mcneillm/.local/bin/u8g2gl`. Use it with the full path or via `npx u8g2gl` from the project root.

**Include paths for clang++ syntax check**: The project root for includes is `/Users/mcneillm/Documents/Projects/U8G2GL`. Use `-I/Users/mcneillm/Documents/Projects/U8G2GL/include` and also `-I` the probe project's widgets directory.

---

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*, surface it in your Completion Report below — do not file issues directly. The Principal Architect will triage and file them under the correct author identity.

---

## Completion Report

### Status
pending

### Changes Made
[fill on completion]

### Decisions Made
[fill on completion]

### Dead Ends & Warnings
[fill on completion]

### Out-of-Scope Findings
[fill on completion]

### Blockers
[fill on completion]
