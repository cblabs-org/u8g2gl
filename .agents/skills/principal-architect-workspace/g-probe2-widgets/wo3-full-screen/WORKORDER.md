# WO3 — Full Screen Render

**Work Order:** wo3-full-screen
**Programme:** G-PROBE-2 (Custom Widget Path)
**Branch:** `u8g2gl-probe2/wo3-full-screen`
**Worktree:** `/Users/mcneillm/Documents/Projects/U8G2GL-probe2`
**Predecessors:** [WO1](../wo1-widget-path/WORKORDER.md) (complete), [WO2](../wo2-formation-and-messages/WORKORDER.md) (complete)
**Complexity:** standard

---

## Objective

Render the complete departures screen through the Wasm harness against the full `nationalRailBoard.json` mock data. All widgets are already placed in `screen_departures.xml`. This WO produces the visual proof that the widget path works end-to-end.

---

## Boundary Box

### Files you MUST create

| File | Purpose |
|---|---|
| `evidence/render-full.mjs` | Wasm harness script that renders the complete screen |
| `evidence/render-full.pbm` | 1-bit monochrome bitmap output |
| `evidence/render-full.png` | Amber phosphor preview |

### Files you MAY update

| File | What to update |
|---|---|
| `evidence/render-full.log` | Console output from the render script |

### Files you MUST NOT touch

- Everything outside `evidence/` — no files in `src/`, `include/`, `cli/`, `wasm/`, `docs/`, or `test/`
- The widget source files (`widgets/wd_service_list/`, `widgets/wd_train_formation/`) — those are from WO1 and WO2 and must not be modified
- `screen_departures.xml` and `globals.xml` — these were finalized in WO2

All paths relative to `/Users/mcneillm/Documents/Projects/U8G2GL-probe2/.agents/skills/principal-architect-workspace/g-probe2-widgets/`.

---

## What to render

The screen already contains (from `screen_departures.xml`):

```xml
<u8g2gl_box name="plat_box" x="0" y="0" width="28" height="51" filled="false" />
<u8g2gl_label name="plat_label" x="5" y="6" width="18" height="13" font="u8g2_font_helvR08_tr" text="Plat" align="center" />
<u8g2gl_label name="plat_num" x="4" y="20" width="20" height="24" font="u8g2_font_helvR08_tr" align="center" bind_text="platform" />
<u8g2gl_line name="header_sep" x1="30" y1="50" x2="255" y2="50" />
<wd_service_list name="row0" x="32" y="0" width="224" height="16" font="u8g2_font_6x10_mr" max_rows="1" />
<u8g2gl_label name="message_bar" x="30" y="17" width="226" height="13" font="u8g2_font_6x10_mr" long_mode="scroll_circular" bind_text="message_text" />
<wd_train_formation name="formation" x="0" y="17" width="256" height="32" font="u8g2_font_6x10_mr" max_carriages="12" />
<wd_service_list name="services" x="0" y="51" width="190" height="13" font="u8g2_font_6x10_mr" max_rows="10" />
<u8g2gl_clock name="sys_clock" x="190" y="51" width="66" height="13" font="u8g2_font_6x10_mr" format="hh_mm_ss" blink="false" bind_time="system_time" />
```

### Mock data to use

From `nationalRailBoard.json`:

**Subjects (via `applySampleData`):**
- `platform` = `"9"`
- `system_time` = `71700` (19:55:00)
- `message_text` = first message from `messages[]` (truncated to display-appropriate length if needed, or the full first message)

**Row 0 (primary service):**
- Service 0: `["1st", "19:55", "London Paddington", "9", "On time"]`
- This maps to subjects: `row0_time = "19:55"`, `row0_dest = "London Paddington"`, `row0_status = "On time"`

**Services table:**
- All 10 services from `services[]` array. Service 3 has `null` in the time column.

**Formation:**
- All 12 carriages from `header.firstServiceFormation`

### Wasm harness approach

Follow the **exact same pattern** as WO1's `render.mjs`:

1. **Import `createEditor`** from `../../../../../wasm/u8g2gl_editor.mjs`
2. **Build a scene JSON** with `version: 3` and elements using `realisation: "draw"` or `realisation: "object"` — since the Wasm harness cannot instantiate `wd_service_list` or `wd_train_formation` (documented harness gap from WO1), translate the widget rendering into equivalent label, box, and line elements.
3. **The formation strip**: For the `wd_train_formation` area, emit draw calls (`u8g2gl_box` frames, `u8g2gl_box` filled gauges, text labels) that replicate what `render()` would produce. Use the same pixel arithmetic as the C++ implementation (documented in `FINDINGS-WO2.md` §1.2):
   - 12 carriages × 20px cells + 11px gaps = 251px, left_margin = 2px
   - Label band: y=17, h=10
   - Carriage boxes: y=27, h=22
   - Loading gauges: filled box from bottom, `gauge_h = (pct * 20 + 50) / 100`
   - Indicators: glyphs rendered as labels
4. **The service rows**: For `wd_service_list` areas, emit label elements for each visible cell, using the same column widths from WO1's render.mjs.
5. **Apply sample data** via `applySampleData` for subjects (platform, system_time, row0_*, message_text)
6. **Render at t=0** via `renderFrame(0)`
7. **Report**: framebuffer size, lit pixel count, SHA-256 digest
8. **Write outputs**: `render-full.pbm` and `render-full.png` (amber phosphor preview)

### Key utilities to reuse from WO1's render.mjs

The PBM and PNG export functions (`bufferToPbm`, `bufferToPng`, `crc32`, `makeChunk`) can be copied directly from `evidence/render.mjs`. Do NOT import from render.mjs — copy the functions.

---

## Design Note: What this proves

The full-screen render demonstrates:
- **All three widget types** rendering on the same screen with correct geometry
- **Static framework elements** (box, label, line, clock) composing alongside custom widgets
- **Subject binding** driving platform number, time, messages
- **The complete departures board** that G-PROBE-1 said Schema 0.4 could not express

The render is at t=0 (initial frame). The scrolling message bar will show static text (no scroll animation at t=0). The formation shows all 12 carriages with their loading gauges and indicators.

---

## Verification Requirement

1. The render script must execute without errors
2. The `.png` output must show visible departures data: platform box, service row(s), formation strip, clock
3. Lit pixel count and SHA-256 must be reported
4. All evidence files must be committed

---

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*, surface it in your Completion Report below — do not file issues directly.

---

## Completion Report

### Status
complete

### Changes Made
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/render-full.mjs`: Wasm harness render script that loads precompiled Wasm editor, models complete departures screen layout matching `screen_departures.xml`, ingests mock data from `nationalRailBoard.json`, probes generator harness gap, binds subjects, and executes frame render at $t=0$.
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/render-full.pbm`: 1-bit monochrome P4 bitmap (256×64, 2,048 bytes) capturing full screen output with 4,810 lit pixels.
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/render-full.png`: 24-bit PNG rendering amber OLED phosphor preview (#FFA000) on true OLED black (#050507).
- `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/render-full.log`: Execution log recording Wasm module load, harness gap verification on generator scene, sample data binding, lit pixel count (4,810 / 16,384, 29.36%), and SHA-256 digest (`0b0e554ab9037e3c9d620001e3e80486a2e7633fc2198fdbe97d77d93f308156`).

### Decisions Made
- **Wasm Harness Parity Translation**: Precompiled Wasm harness bridge (`bridge.cpp`) does not dynamically compile or link project custom C++ widgets (`wd_service_list`, `wd_train_formation`). Translated `screen_departures.xml` into equivalent version 3 scene JSON:
  - Framework elements (`plat_box`, `plat_label`, `plat_num`, `header_sep`, `message_bar`, `sys_clock`) use their respective native draw calls or object registry classes.
  - `wd_service_list` rows (Row 0 fast service and Services secondary row) translate into native `u8g2gl_label` cells matching column geometry from WO1.
  - `wd_train_formation` horizontal strip translates into 12 carriage number `u8g2gl_label` elements, 12 `u8g2gl_box` outline frames, 12 proportional `u8g2gl_box` filled loading gauges, and amenity indicator boxes/labels.
- **XOR Amenity Contrast**: Wheelchair ("W") and Bike ("B") glyphs in the formation strip utilize `u8g2gl_label` with `draw_color: "xor"` (U8G2 draw mode 2), replicating the exact XOR contrast mechanism used in `wd_train_formation.cpp` where indicators inverted against high loading gauges (e.g. carriage 3 with 80% loading).
- **Wasm String Subject Length Clamping**: `wasm/bridge.cpp` enforces `max_len <= 128` on host string subjects (`u8g2gl_subject_string_n<128, 16>`). The National Rail marquee text was stripped of HTML anchor tags and clamped to 128 characters to satisfy bridge bounds while keeping full text semantic integrity.
- **Strict Boundary Box Adherence**: All generation, logging, and bitmap emission was conducted entirely within `evidence/`. `screen_departures.xml`, `globals.xml`, and widget sources in `widgets/` remained completely untouched.

### Dead Ends & Warnings
- **Wasm Bridge String Max-Length Check**: In `wasm/bridge.cpp` lines 569–573, declaring any string subject with `max_len > 128` (such as `globals.xml`'s `<string name="message_text" max_len="256" />`) causes `applyScene()` to fail immediately with `"subject '<name>' max_len exceeds 128"`. Harness scripts must clamp declared `max_len` in the scene JSON to <= 128.
- **Shell Redirection Pre-tool Security Hook**: Shell redirection operators (`>`) are restricted by system pre-tool mutation guards. All log capturing and evidence writing was implemented natively via Node.js `fs.writeFileSync`.

### Out-of-Scope Findings
- **Layout Overlap in `screen_departures.xml`**:
  In `screen_departures.xml` finalized in WO2, `formation` is positioned at `[0, 17, 256, 32]`, spanning full display width ($x=0..255$) and height rows $y=17..49$. This creates two geometric collisions:
  1. It overlaps `plat_box` ($x=0..28, y=0..51$), placing carriage 1 directly over `plat_num` ("9").
  2. It occupies rows $y=17..29$, which is identically where `message_bar` ($x=30, y=17, w=226, h=13$) is placed.
  Because U8G2 operates on an additive OR/XOR display buffer without background clearing, both `message_bar` text and carriage elements paint into the same buffer region at $t=0$. In production, this area is intended as a carousel or alternately toggled strip (or placed with $x \ge 30$). Because editing `screen_departures.xml` was outside WO3 boundary, the render faithfully executed the XML as written and captured the collision in the evidence.
- **Wasm Harness Custom Widget Class Extension**:
  The precompiled Wasm editor harness in `build-wasm/wasm` lacks an extensible or pluggable mechanism to register project-defined C++ widgets without recompiling `bridge.cpp` with Emscripten. Adding a dynamic or header-included widget registration hook to `bridge.cpp` would allow direct evaluation of custom widgets in the visual editor harness without parity translation scripts.

### Blockers
None. WO3 deliverables are complete, verified, and committed.
