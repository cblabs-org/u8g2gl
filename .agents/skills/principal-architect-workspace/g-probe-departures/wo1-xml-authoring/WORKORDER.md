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

- [x] **Read the v3 layout and v1 mock data.** Understand every widget and primitive. Map v1 data fields to the layout's expectations. Note shape mismatches (v1's `header.firstServiceFormation[]` vs v3's expected `services.main[0].formation`).

- [x] **Author `tmp/g-probe/departures_static.xml`.** Express every element that schema 0.4 can handle statically:
  - The `platformWidget` (LabelWidget) → `<u8g2gl_label>`
  - The `sysClock` (ClockWidget) → `<u8g2gl_clock>`
  - The `noDataLabel` (LabelWidget, `visible: false`) → `<u8g2gl_label hidden="true">` or equivalent
  - The three primitives: box (unfilled → `<u8g2gl_box filled="false">`), text ("Plat"), line
  - The `headerLine` equivalent (the primitives section's `box` at y=0, h=51)

- [x] **For each widget the schema CANNOT express, write a gap document** in `tmp/g-probe/gaps/`:
  - `gap-service-list.md` — ServiceListWidget (×2: `row0Widget` and `servicesWidget`)
  - `gap-formation.md` — TrainFormationWidget
  - `gap-scrolling-pool.md` — ScrollingMessagePoolWidget
  Each document: what the widget does, what the schema would need, which open question it maps to, and what a workaround XML would look like (if one exists).

- [x] **Author `tmp/g-probe/departures_workaround.xml`.** A hand-expanded version that includes workarounds for the gaps. This is the "twelve hand-written carriages" version. Label it clearly as a workaround. It should include:
  - The static elements from above
  - Hand-expanded service rows (service 1 only for `row0Widget`, services 2-4 for `servicesWidget`)
  - Hand-expanded 12 carriage formation (boxes only — the per-carriage indicators cannot be expressed without custom element C++)
  - A single `<u8g2gl_label long_mode="scroll_circular">` for the first message (not a pool)

- [x] **Create a rendering script `tmp/g-probe/render.mjs`.** This script should:
  1. Build a scene JSON from the XML (or hand-craft one) that includes:
     - The static elements
     - Subjects for the bound data
     - Sample data from `nationalRailBoard.json`
  2. Load the Wasm module via `createEditor()`
  3. Apply the scene, apply sample data, render at t=0
  4. Report: display dimensions, lit pixel count, SHA-256
  5. If possible, save a PBM or PNG image file. (PBM is trivial for 1-bit — write `P4` header + raw buffer.)

- [x] **Write `tmp/g-probe/MANIFEST.md`.** A brief inventory of what was produced, what rendered, what could not be expressed, and how the files relate to each other.

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

### Executive Summary

Work Order 1 (XML Authoring & Wasm Rendering Probe) was executed under a strict read-only boundary box relative to the core repository (`src/`, `cli/`, `wasm/`, `docs/`, `test/` remain unmodified). All probe artifacts were authored under `tmp/g-probe/`.

The v3 layout (`layoutSWR.json`) was evaluated against Schema 0.4 capabilities. Baseline static elements were authored in `departures_static.xml`, while missing expressiveness capabilities were bridged in `departures_workaround.xml` through explicit hand-expansions. Three comprehensive gap documents were produced mapping each missing capability to the project's open questions. A reproducible, zero-external-dependency Node.js Wasm render harness was built (`render.mjs`), which confirmed bit-level frame rendering, lit pixel metrics, and SHA-256 reproducibility across both layouts.

### Deliverables Inventory

1. **Static Baseline XML**: `tmp/g-probe/departures_static.xml`
   - Expresses all elements Schema 0.4 can handle statically: platform outline box, "Plat" label, platform number binding (`bind_text="platform"`), header separator line, system clock with seconds (`bind_time="system_time"`), and hidden "No services found." fallback label.
2. **Workaround XML**: `tmp/g-probe/departures_workaround.xml`
   - Statically hand-expands all 7 widgets:
     - Primitives and static elements from baseline.
     - Hand-expanded Service 1 columns (`row0_time`, `row0_dest`, `row0_status`) for `row0Widget`.
     - Single circular scrolling label for `msgWidget` bound to pre-sanitized disruption notice.
     - 12 hand-expanded carriage frame boxes (`<u8g2gl_box>`) and coach number labels (`<u8g2gl_label>`) for `formationWidget`.
     - Hand-expanded secondary departure rows for `servicesWidget` (Service 2 visible by default; Services 3 and 4 declared with `hidden="true"` as alternate carousel cards).
3. **Gap Analysis Documents** (`tmp/g-probe/gaps/`):
   - `gap-service-list.md`: Documents `ServiceListWidget` requirements; maps to **`[Q-8]` (Repeaters)** and **`[Q-13]` (`$prop` interpolation inside text)**.
   - `gap-formation.md`: Documents `TrainFormationWidget` requirements; maps to **`[Q-8]` (Repeaters)** and **`[Q-15]` (Cards / sub-assemblies)**.
   - `gap-scrolling-pool.md`: Documents `ScrollingMessagePoolWidget` requirements; maps to **`[Q-15]` (Cards / carousel mechanisms)**.
4. **Rendering Harness & Generated Scene**:
   - `tmp/g-probe/render.mjs`: Node.js Wasm execution harness using `wasm/u8g2gl_editor.mjs`.
   - `tmp/g-probe/ui_scene.json`: Scene JSON conforming to version 3 specification.
5. **Image Output Files**:
   - `tmp/g-probe/render.pbm`: 1-bit Netpbm P4 bitmap of the workaround layout.
   - `tmp/g-probe/render.png`: 8-bit RGB PNG preview with amber phosphor OLED pixels (#FFA000).
   - `tmp/g-probe/render_static.pbm` & `tmp/g-probe/render_static.png`: Outputs for static baseline.
6. **Inventory Manifest**: `tmp/g-probe/MANIFEST.md`

### Verification Evidence & Parity Metrics

Execution of `node tmp/g-probe/render.mjs`:

```
================================================================
   U8G2GL Expressiveness Probe — Wasm Render Harness (WO1)      
================================================================

1. Loading Wasm Editor Module...
   Module loaded successfully.

2. Generated scene JSON: tmp/g-probe/ui_scene.json (41036 bytes)

3. Applying Scene: departures_workaround...
   Configured Display: 256x64 (SSD1322 256x64)
4. Applying Sample Data from nationalRailBoard.json...
5. Rendering Frame at t=0 ms...
   Framebuffer size: 2048 bytes
   Lit pixels:       2196 / 16384 (13.40%)
   SHA-256:          8ae65c023005d2e04d951617848ae0c764ae505f71f36866d5eddba04bf48f8b

6. Artifacts Written:
   - PBM Bitmap: tmp/g-probe/render.pbm
   - Amber PNG:  tmp/g-probe/render.png

7. Rendering Static Baseline (departures_static)...
   Static Lit Pixels: 518
   Static SHA-256:    e1d37fd4307c82fde2c2576451f8fdf7ed206792499b496d6a81dd99f18f550b
   - Static PBM: tmp/g-probe/render_static.pbm
   - Static PNG: tmp/g-probe/render_static.png
```

### Upstream Defect Surfaced (For Principal Architect Triage)

- **Issue**: Mismatch in draw-call realisation discriminator between CLI generator and C++ Wasm bridge.
- **Location**: `wasm/bridge.cpp:708` vs `cli/src/core/generator/emit/scene.ts:277`
- **Details**:
  - `wasm/bridge.cpp:708` checks `else if (realisation == "draw")` to trigger `render_draw_call`.
  - The CLI code generator emits `"realisation": "draw_calls"`.
  - Unless scene JSON specifically uses `"realisation": "draw"`, drawing primitives are silently ignored by the Wasm bridge during rendering.
- **Recommendation**: Align discriminator strings in the generator and Wasm bridge under a future code maintenance PR.

