# G-PROBE-2: Does the Custom Widget Path Work?

**Type:** Expressiveness probe (write project-level widgets — no runtime/schema/generator changes)
**Base:** `main` @ `fa475f4`
**Branch prefix:** `u8g2gl-probe2/`
**Worktree:** `../U8G2GL-probe2`
**Source material:** `layoutSWR.json` + `nationalRailBoard.json` (from G-PROBE-1's `evidence/source/`)
**Deliverable:** `WIDGET-PATH.md` — four-part report for the PR-07 gate
**Predecessor:** [G-PROBE-1](../g-probe-departures/PROJECT.md) — expressiveness probe that found 3 gaps (repeaters, cards, custom widgets). This probe tests whether the gap labelled "the correct use of custom elements" (§6.5) actually works.

---

## Context

G-PROBE-1 asked "can Schema 0.4 express a departures board?" and answered no — but that was the wrong question. The design spec (§6.5, §9.2) explicitly sends variable row counts, mode machines and pixel arithmetic to C++ via `<widget>` with `<api>` manifests, declared capacity, and a generated typed API (`begin()`, `add_row()`, `commit()`). The spec's own example is `wd_service_list`.

**The right question: does that path actually work?**

§9's typed API is specified, exemplified, and entirely unbuilt. No custom widget has ever been composed with bound geometry ([D-20]), clipping (§13.5), the state saver, or PR-5R2's timers. [UD-5] promises a property panel generated from a manifest, and no panel has been generated from a real one. This is a larger unknown than anything the PR-07 gate currently measures.

### What "works" means, concretely

1. The CLI generator parses a `widgets/wd_*/wd_*.xml` manifest and emits:
   - Setter calls from `<prop>` declarations
   - The typed collection API from capacity props (`max_rows`, `max_cols`, `max_cell_chars`)
   - Correct `#include` of the widget's `.hpp`
2. The C++ class extends `u8g2gl_obj`, receives its props via setters, and renders in `render(U8G2& d)`
3. The widget composes: bound geometry, container clipping, state saver, timers
4. The `<api>` manifest gives [UD-5] enough for a usable property panel (props, types, help text, defaults, grouping)

### What this probe is NOT

- Not a schema change, not a generator change, not a runtime change
- Not a migration of any other screen
- Not the editor, not foundation
- If the path is broken, the probe reports the break — it does not fix it

---

## Decomposition

Four work orders, serialised. The probe is structured to **fail correctly at any step** and to produce evidence whether or not each step succeeds.

### Pre-decomposition intelligence (from generator source inspection)

Research into the CLI generator source (`cli/src/core/`) revealed three facts that shape the decomposition:

1. **The generator DOES parse project-level widget manifests.** `read-project.ts` globs `widgets/[name]/[name].xml`, `parse-widget-manifest.ts` parses `<widget>`, `<api>`, `<prop>`, `<bind>` blocks, and `manifest-registry.ts` resolves `extends` chains across framework and project manifests. The generator emits `#include "<tag>.hpp"`, `static <tag> ui_obj_<name>;`, and direct setter calls from `<prop>` declarations.

2. **`<element>` children (collection items like `<column>`) are `NOT_YET_SUPPORTED`.** `validate-not-yet-supported.ts` lines 149–165 explicitly defer these to PR-08. This means the `<column>` child elements from §6.5's `wd_service_list` example will be refused. The §9.2 typed collection API (`begin()`/`add_row()`/`commit()`) is unbuilt — the generator does not emit those classes.

3. **Classed composites (`<view>` + `extends`) are also `NOT_YET_SUPPORTED`.** Lines 188–205 of the same file. A widget cannot yet declare both a C++ class and a designed `<view>`.

4. **No C++ custom widget has ever been built.** All existing widgets in `widgets/` directories are pure XML composites. The `d/` probe fixture validated and generated setter and binding calls for a C++ widget extending `u8g2gl_obj`, but the resulting C++ was never compiled or rendered.

**Consequence for the decomposition:** WO1 does not need to *discover* whether manifests parse — research already confirms they do. WO1's job is now to prove the full path *through to rendered pixels*: manifest → validate → generate → compile widget C++ → render in the Wasm harness. The `NOT_YET_SUPPORTED` gates on `<element>` and classed composites are **expected findings, not blockers** — the widgets own their collection storage in C++ (which is what §9.2 describes anyway).

### Work Order Ledger

- **[x] [wo1-widget-path](wo1-widget-path/WORKORDER.md):** **Prove the end-to-end path.** Build a minimal probe project fixture with a C++ custom widget extending `u8g2gl_obj`: manifest, `.hpp`, `.cpp`, a screen that places it, and a render through the Wasm harness to pixels. This is the first time this path has ever been walked. Then build `wd_service_list` for real — the §9.2 example, with declared capacity props (using `<prop>` not `<element>`), the C++ class with manual collection storage (`begin()`/`add_row()`/`commit()` as class methods), and column definitions. Drive it with the mock data's services array (10 services, including the `null` in the time column for service 3). Document: what the generator emits, what it refuses (`<element>` → `NOT_YET_SUPPORTED`), what the widget author had to write, what the spec told them and what it didn't.

- **[x] [wo2-formation-and-messages](wo2-formation-and-messages/WORKORDER.md):** **Build `wd_train_formation` and test the message pool.** Two items in one WO because the message pool test is expected to be small:
  - **`wd_train_formation`**: Twelve carriages with per-carriage class, wheelchair, bike and loading indicators. Pixel arithmetic for loading gauges. Exercises: extending `u8g2gl_obj`, manual `render()`, the state saver around widget draws, container clipping of child content. The first probe concluded this is a C++ widget; prove it can be one.
  - **Message pool as host policy**: A `u8g2gl_label` with `long_mode="scroll_circular"` and C++ host code writing the subject. Test whether `ui_spec §7.3`'s assignment of carousel policy to the host is genuinely sufficient. If a timer is needed to rotate messages, use `u8g2gl_timer` from PR-5R2. Document whether this is enough or what is missing.

- **[ ] [wo3-full-screen](wo3-full-screen/WORKORDER.md):** **Assemble and render the complete departures screen.** Compose all three widgets plus the static elements (platform box, "Plat" label, separator line, clock, no-data label) into one screen XML. Render in the Wasm harness against the same mock data. This is the visual proof that the widget path produces a working screen.

- **[ ] [wo4-report](wo4-report/WORKORDER.md):** **Write `WIDGET-PATH.md`.** The four-part report:
  1. Does §9's typed API generate, and is it usable?
  2. Where does the path strain? (manifest sufficiency for [UD-5], composition, undocumented author knowledge)
  3. What it costs — using C2-ANALYSIS methodology **including lines read** (the metric the first probe dropped)
  4. Is [Q-8] still wanted?
  Plus the gate paragraph: can a competent widget author build the screens this framework exists to serve, and what does it cost them?

### Dependencies

```
wo1 → wo2 → wo3 → wo4
```

Strictly serialised. WO1 proves the path exists; WO2 builds the remaining widgets; WO3 composes the screen; WO4 writes the report from all evidence. No file overlap between WOs (each builds in its own subdirectory except WO4 which reads all).

### Cancellation protocol

If WO1 finds the generator cannot process a C++ widget manifest at all (contradicting the `d/` probe fixture's result):
- WO2–WO3 are cancelled
- WO4 is replaced with a shortened report documenting the generator gap
- The finding is: "the generator's custom widget support is broken; this is the most significant pre-gate finding"

If WO1 finds the generator processes the manifest but the Wasm harness cannot render the resulting widget:
- Document the Wasm gap (likely: `bridge.cpp` does not register project widget classes)
- WO2–WO3 proceed using hand-crafted scene JSON as G-PROBE-1 did
- This is a harness gap, not a framework gap — the firmware path may still work

---

## Modules & Components

| Module | First Touched | Notes |
|---|---|---|
| `evidence/probe-project/` | WO1 | Probe project fixture — `u8g2gl.xml`, `globals.xml`, screens, widgets |
| CLI (`cli/`) | WO1 | Read-only — exercised via `u8g2gl validate` / `u8g2gl generate` |
| Wasm harness (`wasm/`) | WO1 | Read-only — used for rendering |
| Runtime (`include/`, `src/`) | WO1 | Read-only — widgets extend but do not modify |
| Spec (`docs/design_spec.md`) | WO4 | Read-only — referenced for gap analysis |
| G-PROBE-1 evidence | WO1 | Read-only — source data files reused |
| `WIDGET-PATH.md` | WO4 | Deliverable |

---

## Baselines (do not bump)

| Metric | Value |
|---|---|
| C++ test count | 512 (1 known skip) |
| CLI test count | 1353 |
| Warnings | 0 |
| Runtime version | 0.10.0 |
| CLI version | 0.13.1 |
| Schema version | 0.4 |

---

## Session Log

### 2026-10-17 — Initial decomposition

**Research conducted (6 subagents):**

1. **Generator source inspection** (`cli/src/core/`):
   - `parse-widget-manifest.ts` (lines 75–291): Full parsing of `<widget>`, `<api>`, `<prop>`, `<bind>`, `<element>` blocks
   - `read-project.ts` (lines 204–234): Discovery via `widgets/[name]/[name].xml` glob
   - `manifest-registry.ts` (lines 314–408): `extends` chain resolution, inheritance merging, cycle detection
   - `screen.ts` (lines 509–518): Emission of `#include "<tag>.hpp"`, `static <tag> ui_obj_<name>;`, setter calls
   - `validate-not-yet-supported.ts` (lines 149–205): `<element>` and `<view>+extends` both deferred to PR-08
   - **No integration test compiles or renders a C++ custom widget** — only composites and validation probes

2. **Runtime base class** (`include/u8g2gl/u8g2gl_obj.h`, 611 lines):
   - Virtual: `tick(uint32_t)`, `render(U8G2&)`, `render_animation_update(U8G2&, uint32_t)`
   - Geometry: `set_coords()`, per-axis setters, getters
   - Binding: `bind_text()`, `bind_x/y/width/height()`, `bind_flag_if_*()`, protected `add_value_binding()` for custom bindings
   - Style: `apply_style()`, inline style setters
   - Hierarchy: `set_parent_index()`, `mark_dirty()`

3. **Existing probe fixtures** (`pr-4r2-corrections/evidence/probes/`):
   - Probe `d/`: C++ widget with `extends="u8g2gl_obj"` and `<bind>` — validated and generated `ui_obj_w.bind_x(&ui_subject_t);` ✓
   - Probe `c/`: Composite with `<view>` and `<api>` props — subject forwarding, bound geometry ✓
   - All probes follow standard project layout: `u8g2gl.xml`, `globals.xml`, `screens/`, `widgets/`

4. **Wasm harness** (`wasm/bridge.cpp`):
   - `applyScene()`: Parses scene JSON, instantiates objects from class registry, applies properties/bindings
   - `renderFrame()`: Ticks, clears, renders objects with clip hierarchy, renders draw calls
   - **Uses class registry** — project widgets are NOT in the registry. This is the likely rendering gap.

5. **C2-ANALYSIS methodology** (388 lines):
   - 5 concern categories: Layout (L), Draw dispatch (D), Data fetch (F), Class scaffolding (B), Boilerplate (H)
   - **"Lines read" metric**: total lines an author reads (including comments, blanks) vs. code lines only
   - The first probe compared code lines (−42%) but the honest comparison was total lines read (−6%)
   - The testability refactor accounted for 40% of C++ cost — XML only replaces the Layout concern (24 of 101 legacy code lines)

6. **Mock data confirmed**: 10 services (service 3 has `null` time, `null` platform, `null` status), 12 carriages with class/wheelchair/bike/loading, 2 long messages

**Architectural decisions:**

- **Four WOs, not five.** Research eliminated the need for a separate "does it parse" gate test (WO1 in the earlier draft). The generator parses manifests — proven by the `d/` probe fixture. WO1 now proves the *full path* through to pixels and builds `wd_service_list`. WO2 combines formation + messages (the message pool test is expected to be 1–2 paragraphs). WO3 composes the screen. WO4 writes the report.

- **`<element>` refusal is an expected finding, not a blocker.** The widget owns its collection storage in C++ anyway — that is what §9.2 describes. Column definitions become constructor parameters or `add_column()` calls, not `<element>` children.

- **The Wasm harness is the likely gap.** `bridge.cpp`'s class registry contains only framework widgets. A project C++ widget class won't be in it, so `applyScene()` will fail to instantiate it. Workaround: hand-craft the scene JSON as G-PROBE-1 did, or extend the render script. This is a harness gap, not a framework gap, and should be reported as such.

- **Probe project as fixture.** All widget code lives in `evidence/probe-project/` under the workspace, following the `pr-4r2-corrections/evidence/probes/` pattern. Nothing enters `src/` or the runtime library.

- **"Do not make it work by writing a better widget than an author would."** Each widget is written as a competent author would write it, following the spec's guidance. If that takes 400 lines of C++, that is the finding.

### 2026-10-17 — WO1 Complete

**The custom widget path works.** First-ever end-to-end proof: manifest → validate → generate → C++ → rendered pixels.

**Key findings:**
1. **Generator behavior — fully functional for C++ widgets:**
   - Emits `#include "wd_service_list.hpp"`, `static wd_service_list ui_obj_row0;`
   - Emits setter calls from `<prop>` declarations: `ui_obj_row0.set_max_rows(1);`
   - Emits `u8g2gl_render_object()` wrapping — state saver and clip hierarchy handled
   - Capacity report: 5 objects, 2 bindings — correct
   - Out-of-bounds geometry caught: `y=54, height=13` → `extends to y=67, display is 64px`

2. **`<element>` refusal captured (expected):**
   - Validate: warning with source location and §9 reference
   - Generate: error refusing output — "Nothing was written"

3. **Widget author experience — 369 lines total:**
   - 71 SLOC for multi-column rendering (the core value)
   - 59 SLOC for setters (generator-emitted calls land on these)
   - 45 SLOC for data ingestion API (`begin`/`add_row`/`commit`)
   - Static storage: `cells_[16][6][24]` = 2,304 bytes, zero heap
   - Compiled with `clang++ -Wall -Wextra -Wpedantic -Werror` — 0 warnings

4. **Wasm harness gap confirmed:**
   - `bridge.cpp` class registry refuses `wd_service_list`: "no class in registry"
   - Version mismatch: CLI emits scene version 2, bridge expects 3
   - Realisation tag mismatch: CLI emits `"draw_calls"`, bridge expects `"draw"`
   - Workaround: hand-crafted scene JSON (same pattern as G-PROBE-1)

5. **Undocumented author knowledge:**
   - Font positioning: `u8g2gl_state_saver` calls `setFontPosTop()` — `y` is top of glyph box, not baseline
   - Column configuration must be done in C++ (not XML) due to `<element>` deferral
   - Editor registry: `generate --target-kind editor` emits reflection, but compiling it into Wasm requires rebuild

**Rendered output:** 256×64, 1,225 lit pixels (7.48% fill), SHA-256 `7e1e6c73...`

**Deliverables in `evidence/`:** `FINDINGS.md`, `render.mjs/pbm/png`, `probe-project/` with widget source and generated code, validation/generation logs

### 2026-10-17 — WO2 Complete

**`wd_train_formation` — second custom widget confirmed working.** Same path: manifest → validate → generate → compile → clean.

**Key findings:**
1. **Generator behavior — identical to WO1:**
   - Emits `#include "wd_train_formation.hpp"`, `static wd_train_formation ui_obj_formation;`
   - Emits setter calls: `set_coords(0, 17, 256, 32)`, `set_font(...)`, `set_max_carriages(12)`
   - Object table registration + `u8g2gl_render_object()` wrapping — state saver handles all

2. **Widget author experience — 439 lines total (vs. 369 for `wd_service_list`):**
   - 157 SLOC for pixel arithmetic rendering (the core — carriage outlines, loading gauges, indicators)
   - 73 SLOC for data ingestion API (`begin`/`add_carriage`/`commit`)
   - 30 SLOC for configuration setters
   - Static storage: `u8g2gl_carriage_t[16]` = 96 bytes + 32 bytes members = 128 bytes total, zero heap
   - XOR draw mode (`setDrawColor(2)`) elegantly handles indicator visibility over loading gauges

3. **Pixel arithmetic approach:**
   - 12 carriages × 20px cells + 11px gaps = 251px, centered with 2px margin
   - Vertical: 10px label band (carriage numbers) + 22px carriage boxes
   - Loading gauge: proportional filled bar from bottom, rounding `(pct * inner_h + 50) / 100`
   - Indicators: "W" (wheelchair), "B" (bike), 4×4 box (first class) — XOR'd for contrast

4. **Message pool evaluation (§7.3):**
   - **`scroll_circular` is sufficient for a single message** — loops indefinitely without host intervention
   - **NOT sufficient for message rotation** — `is_scroll_finished()` is permanently false under `scroll_circular`, no completion callback, no wrap notification
   - **Host timer required:** `u8g2gl_timer` with ~15s period rotates messages by writing the subject
   - **Backlog recommendation:** `scroll_once` mode or completion callback would make this cleaner. Not a blocker — the timer path works today.

5. **Screen now has 7 objects, 2 draw calls:**
   - `plat_box` (draw), `plat_label`, `plat_num`, `header_sep` (draw), `row0` (wd_service_list), `message_bar` (label), `formation` (wd_train_formation), `services` (wd_service_list), `sys_clock`
   - 3 bindings (platform, message_text, system_time)

**Compiled:** `clang++ -Wall -Wextra -Wpedantic -Werror -std=c++17` — 0 errors, 0 warnings on both widgets and generated screen code.

---

## Owner Approval

> **Approved** — 2026-10-17T21:48Z. Owner approved the four-WO decomposition as presented.
