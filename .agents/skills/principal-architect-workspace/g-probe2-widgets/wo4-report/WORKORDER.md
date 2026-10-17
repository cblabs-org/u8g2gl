# WO4 — Write WIDGET-PATH.md

**Work Order:** wo4-report
**Programme:** G-PROBE-2 (Custom Widget Path)
**Branch:** `u8g2gl-probe2/wo4-report`
**Worktree:** `/Users/mcneillm/Documents/Projects/U8G2GL-probe2`
**Predecessors:** [WO1](../wo1-widget-path/WORKORDER.md), [WO2](../wo2-formation-and-messages/WORKORDER.md), [WO3](../wo3-full-screen/WORKORDER.md) (all complete)
**Complexity:** architect

---

## Objective

Write `WIDGET-PATH.md` — the four-part report for the PR-07 gate. This is the deliverable of G-PROBE-2.

Place it at: `/Users/mcneillm/Documents/Projects/U8G2GL-probe2/.agents/skills/principal-architect-workspace/g-probe2-widgets/WIDGET-PATH.md`

---

## Boundary Box

### Files you MUST create

| File | Purpose |
|---|---|
| `WIDGET-PATH.md` | The deliverable report |

### Files you MUST NOT touch

Everything else. This is a report WO — it reads evidence and writes one file.

All paths relative to `/Users/mcneillm/Documents/Projects/U8G2GL-probe2/.agents/skills/principal-architect-workspace/g-probe2-widgets/`.

---

## The Four Parts

The bridge prompt specifies exactly what this report must contain:

### Part 1: Does §9's typed API generate, and is it usable?

**This is the headline.** Answer it directly.

Evidence sources:
- `evidence/FINDINGS.md` (WO1) — generator behavior, what it emitted, what it refused, the `<element>` NOT_YET_SUPPORTED diagnostic
- `evidence/FINDINGS-WO2.md` — same for `wd_train_formation`
- `evidence/probe-project/generated/ui_screen_departures.cpp` — the actual generated code

What the bridge wants to know:
- Does the generator parse project-level widget manifests? (Yes — proven)
- Does it emit correct `#include`, `static` instance, setter calls? (Yes — proven)
- Does the widget compile cleanly? (Yes — both widgets, zero warnings under -Werror)
- Does it render? (Yes — Wasm harness produced pixels)
- What is the **gap** between what §9 specifies and what works today? (The `<element>` deferral, the typed collection API `begin()/add_row()/commit()` is manual C++, not generated)

### Part 2: Where does the path strain?

Three sub-questions from the bridge:

**2a. Does the manifest give [UD-5] enough for a usable property panel?**

The `<api>` manifest includes `<prop>` declarations with `name`, `type`, `default`, `required`, and `help` attributes. The generator emits `ui_editor_registry.cpp` containing reflection entries. Evaluate:
- Can a property panel enumerate the props? (Yes — names, types, defaults, help text are all there)
- Can it group them? (No — no grouping mechanism; all props are flat)
- Can it show conditional visibility? (No — Q-7 defers this. `scroll_dwell_ms` is meaningless unless the widget scrolls, but the panel can't know that)
- **Verdict**: The manifest gives enough for a *functional* panel. A *polished* panel needs grouping and conditional visibility — both are Phase 2/3 items.

**2b. Does the widget compose?**
- Bound geometry: Yes — `set_coords()` is generated, widget respects it
- Clipping as a container child: `u8g2gl_render_object()` applies clip hierarchy via state saver
- State saver: Yes — the generator wraps each object render in state saver calls
- Timer: Not directly tested (timer is for message pool, not widget rendering), but `u8g2gl_timer` is host-owned and demonstrated in WO2's message pool evaluation

**2c. What does a widget author have to know that the spec does not tell them?**
- Font positioning: `u8g2gl_state_saver` calls `setFontPosTop()` — y is top of glyph box, not baseline. Undocumented.
- Column configuration in C++ (not XML) due to `<element>` deferral
- XOR draw color for indicator contrast on filled backgrounds
- Editor registry requires Wasm rebuild to pick up custom classes

### Part 3: What it costs

**Use C2-ANALYSIS.md's methodology including the part the first probe dropped.** The methodology is documented in `.agents/skills/principal-architect-workspace/pr-05-integration/C2-ANALYSIS.md`.

Key requirements:
1. **Report total lines read beside code lines, and state any asymmetry.** "Lines read" = total lines an author reads (blanks, comments, code). G-PROBE-1 dropped this metric and only reported code lines, making the comparison look much better than it was.
2. **Use the 5 concern categories**: Layout (L), Draw dispatch (D), Data fetch (F), Class scaffolding (B), Boilerplate (H)
3. **Count both ways**: XML cost to place and configure the widgets, AND C++ cost to implement them.
4. **Show the division honestly**: XML replaces Layout concern only. Data fetch, class scaffolding, and draw dispatch stay in C++.

Source data for the cost analysis:
- `wd_service_list`: 12 lines XML manifest, 369 lines C++ (145 hpp + 224 cpp). From FINDINGS.md §4.
- `wd_train_formation`: 8 lines XML manifest, 439 lines C++ (155 hpp + 284 cpp). From FINDINGS-WO2.md §1.2.
- `screen_departures.xml`: 15 lines total (13 code lines in `<view>`)
- `globals.xml`: 18 lines total
- XML total: count all XML files that the designer and widget author together wrote
- C++ total: count all widget C++ files that the widget author wrote

### Part 4: Is [Q-8] still wanted?

**Not needed — *wanted*.** Q-8 is the repeater question. The bridge says: "If the widget path works, repeaters stop being a blocker and become a product choice: whether a designer composes a list from labels, or places a widget someone wrote."

§21's Q-8 text: "A `<view>` is a static structure, so it can express 'three carriages' but not 'N carriages' (§6.5). A composite instantiated N times against a declared-capacity collection (§9) would let list rows and similar repeating structures be *designed* rather than hand-written in C++ — it is the difference between the designer reaching `wd_service_list`-shaped problems and not."

Evidence for your answer:
- `wd_service_list` took 369 lines of C++ (71 SLOC for rendering) — is that reasonable for a competent author?
- `wd_train_formation` took 439 lines of C++ (157 SLOC for rendering) — pixel arithmetic that a repeater could not express
- The formation widget is definitively C++ territory — no amount of repeaters would let a designer express loading gauges and XOR indicators
- The service list is the borderline case — could a repeater express row × column layout? Yes, but at the cost of significant schema machinery
- **Give the gate your view, with the evidence you now have**

### The Gate Paragraph

End the report with a paragraph a gate reader can act on:

> **Can a competent widget author build the screens this framework exists to serve, and what does it cost them?**

This is a yes/no with nuance. The evidence is now in your hands.

---

## Evidence Files to Read

All relative to `/Users/mcneillm/Documents/Projects/U8G2GL-probe2/.agents/skills/principal-architect-workspace/g-probe2-widgets/`:

| File | What it provides |
|---|---|
| `evidence/FINDINGS.md` | WO1 — generator behavior, widget author experience, code statistics, element refusal |
| `evidence/FINDINGS-WO2.md` | WO2 — formation widget, message pool evaluation |
| `evidence/probe-project/widgets/wd_service_list/wd_service_list.{xml,hpp,cpp}` | Widget 1 source code |
| `evidence/probe-project/widgets/wd_train_formation/wd_train_formation.{xml,hpp,cpp}` | Widget 2 source code |
| `evidence/probe-project/screens/screen_departures.xml` | Screen composition |
| `evidence/probe-project/globals.xml` | Subject declarations |
| `evidence/probe-project/generated/ui_screen_departures.cpp` | Generated code (what the generator emitted) |
| `evidence/render.mjs` and `evidence/render.png` | WO1 render harness and output |
| `evidence/render-full.mjs` and `evidence/render-full.png` | WO3 full-screen render |
| `evidence/validate.log`, `evidence/generate.log` | Generator output logs |

Also read for methodology:
| File | What it provides |
|---|---|
| `.agents/skills/principal-architect-workspace/pr-05-integration/C2-ANALYSIS.md` | Line attribution methodology (§1.1 rules, §1.2 counts). Read §1 and §2 only — don't need the full §3. |
| `.agents/skills/principal-architect-workspace/g-probe-departures/EXPRESSIVENESS.md` | G-PROBE-1 report — for contrast. Reference its conclusions but correct them where this probe disproves them. |

**Both of these are in the PRIMARY checkout** (`/Users/mcneillm/Documents/Projects/U8G2GL/`), not the probe worktree.

---

## Style and Length

- **Direct, evidence-backed.** Every claim cites a file and a measurement.
- **No speculation.** If something wasn't tested, say so.
- **Not an essay.** The gate reader wants to act, not to read. Part 1 is 2–3 paragraphs. Part 2 is structured sub-answers. Part 3 is tables with narrative. Part 4 is a recommendation. The gate paragraph is one paragraph.
- **Use markdown tables** for code counts, concern breakdowns, and cost comparisons.
- **Correct G-PROBE-1's wrong conclusion** — that probe said Schema 0.4 cannot express a departures board; this probe demonstrates it can, through the path the spec designed for it. Be precise about where G-PROBE-1 went wrong and why.

---

## Verification Requirement

1. `WIDGET-PATH.md` exists and contains all four parts plus the gate paragraph
2. All file references in the report point to real files in the evidence directory
3. Line counts and SLOC figures match the FINDINGS documents
4. The report is committed

---

## Issue Surfacing

None expected — this is a reporting WO.

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
