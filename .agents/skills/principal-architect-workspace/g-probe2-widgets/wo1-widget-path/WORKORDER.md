---
name: g-probe2-wo1
description: Handoff instructions for Work Order 1 — prove the end-to-end custom widget path and build wd_service_list
complexity: standard
---

# g-probe2-widgets / WO1 — Widget Path + wd_service_list

> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch beyond the one provided, and do not plan beyond this checklist. Your task is strictly limited to executing the checklist below.

## Objective

Prove the end-to-end custom widget path — from manifest XML through CLI validation and generation to compiled C++ and rendered pixels — for the first time in this project's history. Then build `wd_service_list` (the §9.2 example) for real, driving it with the departures mock data. All work is in the probe worktree at `../U8G2GL-probe2` on branch `u8g2gl-probe2/wo1-widget-path`.

## Context

**Read these first:**
1. The project plan: `.agents/skills/principal-architect-workspace/g-probe2-widgets/PROJECT.md` — especially the "Pre-decomposition intelligence" section
2. The first probe's report: `.agents/skills/principal-architect-workspace/g-probe-departures/EXPRESSIVENESS.md`
3. Design spec §6.5 (lines 753–828): custom elements and `<api>` manifests
4. Design spec §9 (lines 1039–1097): collection data, the v0.2 model
5. Design spec §13.1 (lines 1392–1436): how the generator knows what attributes mean

**Key intelligence from PA research (do not re-research these):**
- The generator DOES parse project-level manifests, resolve `extends`, and emit `#include`, `static`, setter calls
- `<element>` children (e.g. `<column>`) are `NOT_YET_SUPPORTED` — deferred to PR-08. **This is expected. Do not treat it as a failure.** Use `<prop>` instead, or implement columns as constructor logic in the C++ class.
- Classed composites (`<view>` + `extends`) are also `NOT_YET_SUPPORTED` — **do not attempt them**
- The Wasm harness (`bridge.cpp`) uses a class registry containing only framework widgets. Project widget classes are NOT in the registry. **You will likely need to hand-craft scene JSON** as the first probe did (see `g-probe-departures/evidence/render.mjs` for the pattern). This is a harness gap, not a framework gap — document it as such.
- Probe fixture `d/` (at `.agents/skills/principal-architect-workspace/pr-4r2-corrections/evidence/probes/d/`) validated and generated code for a C++ widget with `extends="u8g2gl_obj"` — use it as a reference

**Mock data location:** `.agents/skills/principal-architect-workspace/g-probe-departures/evidence/source/nationalRailBoard.json`
- Services: 10 rows, each `[ordinal, scheduledTime, destination, platform, status]`
- Service 3 has `null` time, `null` platform, `null` status — the widget must handle this

## Strict Boundary Box

**DO touch (all paths relative to the probe worktree `../U8G2GL-probe2`):**
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/` — all probe artifacts go here
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/` — the probe U8G2GL project fixture
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/widgets/wd_service_list/` — the widget under test

**DO NOT touch:**
- `src/`, `include/` — no runtime changes
- `cli/` — no generator changes
- `wasm/` — no harness changes
- `docs/` — no spec changes
- `test/` — no test changes
- Any file outside the `g-probe2-widgets/` workspace directory
- Do not bump any version number

## Tooling Constraints

- Run CLI commands from the project root: `npx u8g2gl validate <path>` and `npx u8g2gl generate <path>`
- For rendering: create a `render.mjs` script following G-PROBE-1's pattern (`g-probe-departures/evidence/render.mjs`), using `import { createEditor } from '../../wasm/u8g2gl_editor.mjs'`
- The probe project fixture must be a valid U8G2GL project with `u8g2gl.xml` (schema 0.4), `globals.xml`, `screens/`, and `widgets/`
- For the C++ widget class: follow `u8g2gl-standards` skill (§2 naming, §4 non-negotiables — no heap, trailing underscore on members, `u8g2gl_` prefixed enums)
- Build target: SSD1322 256×64 (same as G-PROBE-1) — setup `U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI`

## Line-Item Instructions

### Phase 1: Prove the path with a minimal widget

- [ ] **Create the probe project fixture** at `evidence/probe-project/`:
  - `u8g2gl.xml` — schema 0.4, name "probe", target SSD1322 256×64
  - `globals.xml` — declare string subjects for at least `row0_time`, `row0_dest`, `row0_status` and int subjects for widget configuration
  - `screens/screen_departures.xml` — a screen placing the custom widget

- [ ] **Create a minimal C++ custom widget** at `evidence/probe-project/widgets/wd_probe_box/`:
  - `wd_probe_box.xml` — manifest with `extends="u8g2gl_obj"`, one `<prop>` (e.g., `fill_height` of type `int`), to prove the path before building the full service list
  - `wd_probe_box.hpp` / `.cpp` — trivial widget that draws a filled box at `fill_height` pixels tall inside its bounds

- [ ] **Run `npx u8g2gl validate evidence/probe-project/`** — record the exact output (errors, warnings, or clean pass)

- [ ] **Run `npx u8g2gl generate evidence/probe-project/`** — record the exact output. Examine the generated code:
  - Does it emit `#include "wd_probe_box.hpp"`?
  - Does it emit `static wd_probe_box ui_obj_<name>;`?
  - Does it emit setter calls from the `<prop>` declaration?
  - Save the generated files as evidence

- [ ] **Document any gaps, refusals, or unexpected behavior** from the generator

### Phase 2: Build wd_service_list

- [ ] **Create `evidence/probe-project/widgets/wd_service_list/wd_service_list.xml`** — the manifest:
  - `extends="u8g2gl_obj"`
  - Props: `font` (type font), `max_rows` (type int, default 16), `max_cols` (type int, default 6), `max_cell_chars` (type int, default 24)
  - Props for scroll timing: `scroll_dwell_ms` (type int, default 5000), `scroll_duration_ms` (type int, default 1000)
  - **Do NOT use `<element>` children** — they are `NOT_YET_SUPPORTED`. Column definitions will be in C++.
  - Include `help` attributes on capacity props (for [UD-5] panel evaluation later)

- [ ] **Create `wd_service_list.hpp`** — the widget class declaration:
  - Extends `u8g2gl_obj`
  - Column definition struct: `{ int16_t width; u8g2gl_align_t align; }`
  - Collection storage: 2D char array sized by `max_rows × max_cols × max_cell_chars` — **static, no heap**
  - API: `void add_column(int16_t width, u8g2gl_align_t align)`, `void begin()`, `bool add_row(const char* const* cells, size_t n)`, `void commit()`, `size_t capacity() const`
  - Override: `void render(U8G2& d) override`
  - Private members: column defs array, row count, column count, current row index, the storage buffer

- [ ] **Create `wd_service_list.cpp`** — the implementation:
  - `begin()`: reset current row to 0
  - `add_row()`: copy each cell string into the storage buffer (bounded by `max_cell_chars`), return false if at capacity
  - `commit()`: store the final row count, call `mark_dirty()`
  - `render()`: for each committed row, draw each cell at its column position using the widget's font and the column's width/alignment. Handle `null` cells (draw empty or "—"). Use `u8g2.drawStr()` / `u8g2.drawUTF8()` for text within the widget's bounds.
  - **Write what a competent widget author would write.** Do not over-engineer. If it takes 200 lines, that is the finding.

- [ ] **Run validate and generate** on the updated project. Record results.

### Phase 3: Drive with mock data and render

- [ ] **Update `screens/screen_departures.xml`** to place `wd_service_list` with the geometry from `layoutSWR.json`:
  - `row0Widget`: x=32, y=0, w=224, h=16 (header row, 1 service)
  - `servicesWidget`: x=0, y=54, w=190, h=13 (subsequent rows)
  - Include the static elements: platform box, "Plat" label, separator line, clock

- [ ] **Update `globals.xml`** with subjects needed for binding (platform number, system time, etc.)

- [ ] **Create `evidence/render.mjs`** — a rendering script:
  - Import the Wasm editor: `import { createEditor } from '../../wasm/u8g2gl_editor.mjs'`
  - Read `nationalRailBoard.json` for the services data
  - Build scene JSON — either from the generator's output (if the harness can render it) or hand-crafted (following the G-PROBE-1 pattern if it can't)
  - **For the wd_service_list widget in the scene**: since the Wasm harness likely cannot instantiate the custom class, hand-craft the visual output as draw calls that replicate what `render()` would produce. **State clearly in the evidence that this is a harness limitation, not a framework limitation.**
  - Render at t=0, save `.pbm` and `.png` outputs
  - Compute SHA-256 and lit pixel count

- [ ] **Save all evidence artifacts** in `evidence/`:
  - Generated C++ files (copy from the generated output directory)
  - `render.mjs`, `render.pbm`, `render.png`
  - Generator command output logs
  - The widget source files themselves

### Phase 4: Document findings

- [ ] **Create `evidence/FINDINGS.md`** with:
  1. **Generator behavior**: What it emitted, what it refused, exact diagnostic messages
  2. **Widget author experience**: What the spec told the author, what it didn't, what they had to figure out
  3. **Wasm harness gap**: If the harness couldn't render the widget, document exactly what failed and why
  4. **Code statistics**: Total lines in the widget `.hpp` + `.cpp`, broken down by concern (storage, API, rendering, boilerplate)
  5. **`<element>` refusal**: The exact `NOT_YET_SUPPORTED` diagnostic for `<column>` (if tested — test it to capture the message)

## Verification Requirement

1. `npx u8g2gl validate evidence/probe-project/` must pass (0 errors) or produce only expected `NOT_YET_SUPPORTED` warnings
2. `npx u8g2gl generate evidence/probe-project/` must produce generated C++ that includes the widget and emits setter calls
3. The render script must produce a `.png` showing rendered departures data
4. All evidence files exist and are committed
5. Before committing, ask the user if they are happy with the changes

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*, surface it in your Completion Report below — do not file issues directly. The Principal Architect will triage and file them under the correct author identity.

Expected findings to document (not defects):
- `<element>` NOT_YET_SUPPORTED diagnostic
- Wasm harness class registry gap
- Any generator behavior that contradicts the design spec

---

## Completion Report (written by the worker at task completion)

```markdown
---
## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete | partial | blocked

### Changes Made
- `path/to/file` — what changed and why

### Decisions Made
<!-- Only non-obvious decisions. -->
- Decision description and rationale

### Dead Ends & Warnings
<!-- Things that didn't work. Critical for preventing future agents from repeating mistakes. -->
- What was attempted, why it failed, and what to avoid

### Out-of-Scope Findings
<!-- Defects, bugs, or concerns outside the boundary box. The PA will triage these. -->
- Finding description and suggested action

### Blockers
<!-- Empty if status is 'complete'. If partial/blocked, explain what prevents completion. -->
(none)
```
