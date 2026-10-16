---
name: g-probe-wo1
description: Handoff instructions for Work Order 1 — XML authoring and Wasm rendering
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan. Your task is strictly limited to executing the checklist below.

# Objective

Author U8G2GL XML that expresses as much of `layoutSWR.json` as schema 0.4 allows, render it through the Wasm harness against the v1 mock data, and document every gap where the schema cannot express what the layout needs.

# Strict Boundary Box

- **DO NOT** modify any file in `src/`, `cli/`, `wasm/`, `docs/`, or `test/`. This is a read-only probe.
- **DO NOT** modify the schema, generator, or runtime. If you find something the schema cannot express, **document it** — do not fix it.
- **DO NOT** create hand-expanded workarounds to make the render "look right" without labelling them as workarounds. Every workaround must be in a separate XML file and explicitly named as such.
- **DO NOT** run `npm install`, `cmake`, or any build commands against the U8G2GL repository. The Wasm binary is pre-built.
- All probe artifacts go in `tmp/g-probe/`.

# Tooling Constraints

- The Wasm harness is at `wasm/u8g2gl_editor.mjs`. It consumes **scene JSON** (the generator's output format), not XML directly.
- To render XML, you must run the CLI generator: `npx u8g2gl generate` (from the `cli/` directory) to produce `ui_scene.json`.
- **However:** The CLI generator requires a full project structure (`u8g2gl.xml`, `globals.xml`, screen XML files, font declarations). You must create this project scaffolding.
- Alternatively, you may hand-craft the scene JSON directly — the Wasm bridge accepts it. This is likely faster for a probe. The format is documented in `test/generated_fixture/generated_editor/ui_scene.json` (935 lines — read its structure, don't copy all of it).
- The v1 mock data is archived at `tmp/g-probe-source/nationalRailBoard.json`. The v3 layout is at `tmp/g-probe-source/layoutSWR.json`.
- **Rendering script:** Write a Node.js script that: loads the Wasm module, applies the scene, applies sample data, renders a frame, and saves the pixel buffer as a PNG (or at minimum, counts lit pixels and reports a SHA-256 for reproducibility).

# Source Material

1. **`tmp/g-probe-source/layoutSWR.json`** — the v3 layout (174 lines). Seven widgets + three primitives.
2. **`tmp/g-probe-source/nationalRailBoard.json`** — v1 mock data (102 lines). 12-carriage formation, 10 services, 2 messages.
3. **`test/generated_fixture/generated_editor/ui_scene.json`** — reference for the scene JSON format the Wasm bridge accepts.
4. **`docs/design_spec.md`** — the spec. Key sections:
   - §6.2 Drawing set: `u8g2gl_hline`, `u8g2gl_vline`, `u8g2gl_box`, etc.
   - §6.3 Framework elements: `u8g2gl_label`, `u8g2gl_clock`, `u8g2gl_xbm`
   - §6.4 Composites (user elements with a `<view>`)
   - §6.5 Custom elements (user elements with C++) — `wd_service_list` is defined here
   - §9 Collection data — the `begin()/add_row()/commit()` API
   - §10 Styling — `font`, `draw_color`, `align`, `long_mode`
5. **`wasm/bridge.cpp`** — the Wasm bridge (759 lines). Read to understand what the bridge accepts.
6. **`wasm/u8g2gl_editor.mjs`** — the JS API wrapper.

# Line-Item Instructions

- [ ] **Read the v3 layout and v1 mock data.** Understand every widget and primitive. Map v1 data fields to the layout's expectations. Note shape mismatches (v1's `header.firstServiceFormation[]` vs v3's expected `services.main[0].formation`).

- [ ] **Author `tmp/g-probe/departures_static.xml`.** Express every element that schema 0.4 can handle statically:
  - The `platformWidget` (LabelWidget) → `<u8g2gl_label>`
  - The `sysClock` (ClockWidget) → `<u8g2gl_clock>`
  - The `noDataLabel` (LabelWidget, `visible: false`) → `<u8g2gl_label hidden="true">` or equivalent
  - The three primitives: box (unfilled → `<u8g2gl_box filled="false">`), text ("Plat"), line
  - The `headerLine` equivalent (the primitives section's `box` at y=0, h=51)

- [ ] **For each widget the schema CANNOT express, write a gap document** in `tmp/g-probe/gaps/`:
  - `gap-service-list.md` — ServiceListWidget (×2: `row0Widget` and `servicesWidget`)
  - `gap-formation.md` — TrainFormationWidget
  - `gap-scrolling-pool.md` — ScrollingMessagePoolWidget
  Each document: what the widget does, what the schema would need, which open question it maps to, and what a workaround XML would look like (if one exists).

- [ ] **Author `tmp/g-probe/departures_workaround.xml`.** A hand-expanded version that includes workarounds for the gaps. This is the "twelve hand-written carriages" version. Label it clearly as a workaround. It should include:
  - The static elements from above
  - Hand-expanded service rows (service 1 only for `row0Widget`, services 2-4 for `servicesWidget`)
  - Hand-expanded 12 carriage formation (boxes only — the per-carriage indicators cannot be expressed without custom element C++)
  - A single `<u8g2gl_label long_mode="scroll_circular">` for the first message (not a pool)

- [ ] **Create a rendering script `tmp/g-probe/render.mjs`.** This script should:
  1. Build a scene JSON from the XML (or hand-craft one) that includes:
     - The static elements
     - Subjects for the bound data
     - Sample data from `nationalRailBoard.json`
  2. Load the Wasm module via `createEditor()`
  3. Apply the scene, apply sample data, render at t=0
  4. Report: display dimensions, lit pixel count, SHA-256
  5. If possible, save a PBM or PNG image file. (PBM is trivial for 1-bit — write `P4` header + raw buffer.)

- [ ] **Write `tmp/g-probe/MANIFEST.md`.** A brief inventory of what was produced, what rendered, what could not be expressed, and how the files relate to each other.

# Data Mapping Notes

The v1 mock data has a different shape than what v3 expects. You'll need to map:

| v3 layout expects | v1 data provides |
|---|---|
| `services.main[0..3]` (objects with `time`, `destination`, `status`, `platform`) | `services[0..9]` (arrays: `[ordinal, time, destination, platform, status]`) |
| `services.main[0].formation` | `header.firstServiceFormation[]` |
| `messages` (array of strings) | `messages[]` (array of strings with HTML tags) |
| `station.name` | Not in v1; use `header.title` ("Manchester Piccadilly") |
| Platform number | `header.platform` ("9") |

Strip HTML tags from messages before rendering (the display is monochrome text).

# Fonts Available in the Wasm Harness

Read `wasm/bridge.cpp` lines 59-68. The pre-registered fonts are:
- `u8g2_font_6x10_mr`
- `u8g2_font_5x7_mr`
- `u8g2_font_helvR08_tr`
- `font_4x6`
- `font_arrow_mini`

The v3 layout uses custom fonts (`RailClockMega13`, `RailTextLarge12`, `RailTextSmall9`, `RailClockHuge11`). Substitute with the available fonts — this is a probe of structure, not typography.

# Verification Requirement

1. The rendering script runs without error: `node tmp/g-probe/render.mjs`
2. The gap documents exist and each names the specific open question ([Q-8], [Q-15], or new)
3. The static XML is valid against schema 0.4's vocabulary (element tags and attributes match §6.2/§6.3)
4. The workaround XML includes all seven v3 widgets' content, with gaps filled by hand-expansion

**Before committing, ask the user if they are happy with the changes.**

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*, surface it in your Completion Report below — do not file issues directly. The Principal Architect will triage and file them under the correct author identity.

---

## Completion Report
<!-- Written by the worker at task completion -->
