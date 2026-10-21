# U8G2GL Expressiveness Report: National Rail Departures Board (`layoutSWR.json`)

**Evaluation Target:** National Rail Departures Display (`layoutSWR.json` against `nationalRailBoard.json`)  
**Hardware Profile:** 256×64 monochrome OLED (`SSD1322`, 4-wire SPI)  
**Schema Version:** Schema 0.4 (`docs/design_spec.md`)  
**Execution Context:** PR-07 Gate Deliverable (G-PROBE Work Order 2)  
**Evidence Artifacts:** [`evidence/`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/)  

---

## Executive Overview

This report evaluates whether U8G2GL Schema 0.4 can express a production embedded departures display: the 173-line `layoutSWR.json` from `departures-board-v3`. The probe was executed under strict methodology: authoring declarative XML up to the schema boundary, documenting every expressiveness gap against the design specification, rendering the output through the WebAssembly display harness (`wasm/u8g2gl_editor.mjs`), and measuring line counts against the line attribution methodology established in [`C2-ANALYSIS.md`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/pr-05-integration/C2-ANALYSIS.md).

The evaluation is structured into three formal parts followed by an actionable gate summary:
1. **Part 1 — What Rendered:** The subset of widgets and primitives expressible in Schema 0.4, verification hashes, and rendered frame geometry.
2. **Part 2 — What Could Not Be Expressed:** Gap analysis for collections, dynamic train formations, and multi-message pools, evaluated under the §1.5 deferral rule.
3. **Part 3 — What It Cost:** Line attribution and metric comparison separating layout from scaffolding across legacy JSON, static XML, workaround XML, and repeater projections.

---

## Part 1 — What Rendered

### 1.1 Expressible Widgets & Element Mappings

`layoutSWR.json` defines seven widgets and three drawing primitives. In Schema 0.4, four widgets and all three primitives map cleanly to native U8G2GL elements without custom C++ or schema workarounds:

| `layoutSWR.json` Element | Type | U8G2GL Schema 0.4 Mapping | Realisation | Status |
|---|---|---|---|---|
| `primitives[0]` (Box) | `box` (`w=28, h=51`) | `<u8g2gl_box filled="false">` | Draw call | Native |
| `primitives[1]` (Text) | `text` (`"Plat"`) | `<u8g2gl_label text="Plat">` | Draw call | Native |
| `primitives[2]` (Line) | `line` (`y=50`) | `<u8g2gl_line x1="30" y1="50" x2="256" y2="50">` | Draw call | Native |
| `platformWidget` | `LabelWidget` | `<u8g2gl_label bind_text="platform" align="center">` | Object (`u8g2gl_label`) | Native |
| `sysClock` | `ClockWidget` | `<u8g2gl_clock format="hh_mm_ss" secondary_font="font_4x6">` | Object (`u8g2gl_clock`) | Native |
| `noDataLabel` | `LabelWidget` | `<u8g2gl_label text="No services found." hidden="true">` | Object (`u8g2gl_label`) | Native |
| `row0Widget` | `ServiceListWidget` | *Omitted from static baseline* (hand-expanded in workaround) | Object | Gap ([Q-8]) |
| `msgWidget` | `ScrollingMessagePoolWidget` | *Omitted from static baseline* (hand-expanded in workaround) | Object | Gap ([Q-15]) |
| `formationWidget` | `TrainFormationWidget` | *Omitted from static baseline* (hand-expanded in workaround) | Object | Gap ([Q-8]/[Q-15]) |
| `servicesWidget` | `ServiceListWidget` | *Omitted from static baseline* (hand-expanded in workaround) | Object | Gap ([Q-8]) |

### 1.2 Rendering Output & Framebuffer Verification

Both the static baseline layout ([`departures_static.xml`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_static.xml)) and the fully unrolled workaround layout ([`departures_workaround.xml`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_workaround.xml)) were executed through the Wasm harness at `t = 0 ms` against a virtual SSD1322 256×64 display buffer (`u8g2_ll_hvline_vertical_top_lsb`, 8 tile rows × 256 columns = 2,048 bytes).

```
================================================================================
Rendering Parity & Framebuffer Verification
================================================================================
Target Resolution:        256 × 64 pixels (16,384 total pixels)
Virtual Controller:       SSD1322 (full-buffer mode _F_, 2,048 bytes)
Execution Timestamp:      t = 0 ms

1. Static Baseline (departures_static.xml):
   - Framebuffer Size:    2,048 bytes
   - Lit Pixels:          518 / 16,384 (3.16% display fill)
   - Framebuffer SHA-256: e1d37fd4307c82fde2c2576451f8fdf7ed206792499b496d6a81dd99f18f550b
   - Output Artifacts:    evidence/render_static.pbm (1-bit Netpbm P4)
                          evidence/render_static.png (RGB Preview)

2. Workaround Layout (departures_workaround.xml):
   - Framebuffer Size:    2,048 bytes
   - Lit Pixels:          2,196 / 16,384 (13.40% display fill)
   - Framebuffer SHA-256: 8ae65c023005d2e04d951617848ae0c764ae505f71f36866d5eddba04bf48f8b
   - Output Artifacts:    evidence/render.pbm (1-bit Netpbm P4)
                          evidence/render.png (RGB Preview, Amber #FFA000)
================================================================================
```

### 1.3 Reference Rendering Comparison Note

Does `departures-board-v3` produce an exact reference rendering of `layoutSWR.json` against `nationalRailBoard.json`?

**No.** The test dataset provided (`nationalRailBoard.json`) originates from `departures-board` v1, not v3. The data schema between versions diverged significantly:
- v1 formats `services` as an untyped 2D array of strings (`[["1st", "19:55", "London Paddington", "9", "On time"], ...]`), whereas v3 expects structured service objects (`services.main[]`).
- v1 formats carriage formation as `header.firstServiceFormation[]` with properties `classType`, `hasWheelchair`, `hasBike`, and `loading`, whereas v3 structures formation data nested within `services.main[0].formation.carriages[]`.

Because `layoutSWR.json` was authored for the v3 data model, running v3's legacy firmware directly against the v1 mock file produces a runtime data-binding mismatch rather than a valid visual frame. The Wasm bridge execution in WO1 therefore ingested the raw v1 data via an explicit field mapping adapter ([`render.mjs:45–65`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/render.mjs#L45-L65)). We report the resulting 2,196 lit pixels and SHA-256 hash honestly as the empirical measurement of this layout under U8G2GL, rather than inventing an unverified legacy reference.

### 1.4 Baseline Rendered XML

The following complete XML document represents the maximum screen surface expressible in Schema 0.4 without unrolling workarounds ([`departures_static.xml`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_static.xml)):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<screen name="departures_static">
    <styles>
        <style name="plat_text" font="u8g2_font_6x10_mr" align="center" />
        <style name="plat_num" font="u8g2_font_helvR08_tr" align="center" />
        <style name="clock_style" font="u8g2_font_helvR08_tr" align="right" />
        <style name="msg_font" font="u8g2_font_6x10_mr" align="left" />
    </styles>

    <view>
        <!-- Primitives: Left platform header box (x=0, y=0, w=28, h=51, unfilled) -->
        <u8g2gl_box name="plat_box" x="0" y="0" width="28" height="51" filled="false" radius="0" />

        <!-- Primitives: Static text "Plat" (x=5, y=6, w=18, h=13) -->
        <u8g2gl_label name="plat_label" x="5" y="6" width="18" height="13"
                      style="plat_text" text="Plat" />

        <!-- platformWidget: Platform indicator (x=4, y=20, w=20, h=24) -->
        <u8g2gl_label name="plat_num" x="4" y="20" width="20" height="24"
                      style="plat_num" text="9" bind_text="platform" />

        <!-- Primitives: Horizontal separator line (x1=30, y1=50, x2=256, y2=50) -->
        <u8g2gl_line name="header_sep" x1="30" y1="50" x2="256" y2="50" />

        <!-- sysClock: System Clock (x=190, y=51, w=66, h=16) -->
        <u8g2gl_clock name="sys_clock" x="190" y="51" width="66" height="16"
                      style="clock_style" secondary_font="font_4x6"
                      format="hh_mm_ss" blink="false" bind_time="system_time" />

        <!-- noDataLabel: "No services found." fallback label (x=32, y=17, w=224, h=14, hidden by default) -->
        <u8g2gl_label name="no_data_label" x="32" y="17" width="224" height="14"
                      style="msg_font" text="No services found." hidden="true" />
    </view>
</screen>
```

---

## Part 2 — What Could Not Be Expressed

> [!WARNING]
> **Framing under review.** §9.2 already specifies `wd_service_list` as a custom widget with a declared-capacity API (`begin()` / `add_row()` / `commit()`), placed there by [D-8]. All three gaps below may be custom-widget problems, not schema problems. The [Q-8]/[Q-15] scoping in this section should not be acted on until the custom-widget path has been tried.

> [!NOTE]
> **Tone & Calibration:** A gap is not a verdict. The framework has not failed; it has adhered strictly to its design charter. Under [`docs/design_spec.md §1.5`](file:///Users/mcneillm/Documents/Projects/U8G2GL/docs/design_spec.md#L80-L95) (*"Lite by design — the deferral rule"*), omission is the default, and features earn inclusion by demonstrated need. Repeaters ([Q-8]) and cards ([Q-15]) were explicitly deferred to Phase 2 and Phase 3. The fact that a full departures board encounters these exact deferred capabilities confirms the roadmap's precision.

### Gap 1: Repeaters ([Q-8]) — Service Lists and Carriage Formation

#### 1. What the layout needs
`layoutSWR.json` defines two instances of `ServiceListWidget` and one `TrainFormationWidget` that depend on repeating data-driven sub-assemblies across collections:

```json
{
  "id": "row0Widget",
  "type": "ServiceListWidget",
  "geometry": { "x": 32, "y": 0, "w": 224, "h": 16 },
  "skipRows": 0,
  "maxRows": 1,
  "font": "RailTextLarge12",
  "columns": [
    { "width": 0, "align": "LEFT" },
    { "width": 34, "align": "LEFT" },
    { "width": 126, "align": "LEFT" },
    { "width": 0, "align": "RIGHT" },
    { "width": 60, "align": "RIGHT" }
  ]
},
{
  "id": "servicesWidget",
  "type": "ServiceListWidget",
  "geometry": { "x": 0, "y": 54, "w": 190, "h": 13 },
  "skipRows": 1,
  "font": "RailTextSmall9",
  "columns": [
    { "width": 32, "align": "CENTER" },
    { "width": 30, "align": "LEFT" },
    { "width": 70, "align": "LEFT" },
    { "width": 0, "align": "RIGHT" },
    { "width": 50, "align": "RIGHT" }
  ]
}
```

#### 2. Why the schema cannot say it
Under [`design_spec.md §6.5`](file:///Users/mcneillm/Documents/Projects/U8G2GL/docs/design_spec.md#L785-L796), a `<view>` is strictly a *static structure* resolved at compile time:
> *"A `<view>` is a static structure: the generator resolves it at build time, so it can express 'three carriages' but not 'N carriages'. Reach for C++ when the structure itself depends on runtime data — a variable row count, a mode machine, content-dependent sizing..."*

Furthermore, per [D-8] and [`design_spec.md §9`](file:///Users/mcneillm/Documents/Projects/U8G2GL/docs/design_spec.md#L1039-L1092), collections are not subjects. Schema 0.4 provides no syntax to iterate over an array in XML, no row slicing concepts (`skipRows`, `maxRows`), and no declarative flexbox/grid layout to align multi-column table cells.

#### 3. Open Question Mapping
- **Primary:** `[Q-8]` (*Repeaters*, `design_spec.md §21`). *"A composite instantiated N times against a declared-capacity collection (§9) would let list rows and similar repeating structures be designed rather than hand-written in C++ — it is the difference between the designer reaching `wd_service_list`-shaped problems and not."*
- **Secondary:** `[Q-13]` (*`$prop` interpolation inside text*), required when composing formatted table cell strings (e.g. `"Exp $time"` or `"Plat $platform"`).

#### 4. Cost to close in Schema Surface
Under the §1.5 deferral rule, generator complexity is cheap but schema surface is permanent. Closing [Q-8] requires:
- **1 new container element:** `<repeater>` (or `<list>`).
- **5 new attributes:** `collection=""`, `max_items=""`, `direction="horizontal|vertical"`, `gap=""`, `skip=""`.
- **1 new template scope concept:** Scoped variable bindings (`$item.prop`) inside the repeater's child elements.

This expands the schema grammar significantly and introduces scoped variable resolution into an engine that currently only resolves global subjects. Deferring this to Phase 2 was the correct architectural choice.

#### 5. Workaround Evaluation
In [`departures_workaround.xml`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_workaround.xml#L60-L69), the first departure row was unrolled into three distinct `<u8g2gl_label>` elements:

```xml
<!-- Workaround: row0Widget (Service 1 Columns Hand-Expanded) -->
<u8g2gl_label name="row0_time" x="32" y="0" width="34" height="16"
              style="row0_font" text="19:55" bind_text="row0_time" />
<u8g2gl_label name="row0_dest" x="66" y="0" width="126" height="16"
              style="row0_font" text="London Paddington" bind_text="row0_dest" />
<u8g2gl_label name="row0_status" x="194" y="0" width="60" height="16"
              style="row0_font_right" text="On time" bind_text="row0_status" />
```

For subsequent services (`servicesWidget`), Services 2, 3, and 4 were unrolled into 12 separate labels (4 per row), manually positioning Service 2 at `y=54` and setting `hidden="true"` on Services 3 and 4 ([`departures_workaround.xml:130–161`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_workaround.xml#L130-L161)).

**Honest Assessment:** No human engineer would write or maintain this in production. It couples the XML to fixed row counts, requires individual subject publications for every single cell (`row1_time`, `row2_time`, `row3_time`), and forces the host controller to manage visibility flags manually. In a visual designer, having to position 15 discrete labels to simulate a 3-row table defeats the primary purpose of direct manipulation.

---

### Gap 2: Message Pool Carousel ([Q-15]) — Sequential Message Cycling

#### 1. What the layout needs
`layoutSWR.json` defines a message ticker displaying alternating disruption alerts and calling points:

```json
{
  "id": "msgWidget",
  "type": "ScrollingMessagePoolWidget",
  "geometry": { "x": 32, "y": 17, "w": 224, "h": 14 },
  "visible": true,
  "font": "RailTextLarge12"
}
```

The underlying widget cycles sequentially through an array of messages (`nationalRailBoard.json:94–97`). If a message fits within 224 pixels, it dwells statically; if it overflows, it scrolls horizontally, pauses, and rotates to the next message in the pool.

#### 2. Why the schema cannot say it
Schema 0.4 provides `<u8g2gl_label long_mode="scroll_circular">` to scroll a single string. However:
1. **No Temporal Cycling:** A bound subject connects an element to a single value, not a list of values over time. Schema 0.4 has no concept of carousels, playlists, or automatic message rotation.
2. **No Text Sanitization:** Real-world rail feeds include HTML markup (`<a href="...">`). Schema 0.4 treats string subjects as raw character streams; it has no string transformation or tag-stripping pipeline.

#### 3. Open Question Mapping
- **Primary:** `[Q-15]` (*A "cards" element*, `design_spec.md §21`). *"A 'cards' element — one container showing exactly one of its children, chosen by an integer subject, equivalent to UiUiUi's `UICards`... It would switch between modes or pages within one region of a screen — the mechanism a carousel would drive... Carousel policy stays in `modules/U8G2GLDisplay`, as ui_spec §7.3 already rules."*

#### 4. Cost to close in Schema Surface
Under §1.5, policy belongs in C++ (`modules/U8G2GLDisplay`), but the schema requires the switching *mechanism*. Closing [Q-15] costs:
- **1 new container element:** `<cards>` (or `<deck>`).
- **1 new attribute:** `bind_active=""` (bound to an integer subject selecting the visible child).

This is a clean, minimal addition (1 element, 1 attribute) that preserves the declarative boundary without embedding timers or carousel logic in the XML schema.

#### 5. Workaround Evaluation
The probe expressed this via a single scrolling label bound to a sanitized string subject ([`departures_workaround.xml:70–77`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_workaround.xml#L70-L77)):

```xml
<!-- Workaround: msgWidget (Single Circular Scrolling Label) -->
<u8g2gl_label name="msg_scroller" x="32" y="17" width="224" height="14"
              style="msg_font" long_mode="scroll_circular"
              text="A reduced train service will be running to and from London Waterloo..."
              bind_text="msg_text" />
```

**Honest Assessment:** The XML itself is readable, but it is incomplete. It shifts the entire carousel responsibility, timer scheduling, and HTML stripping onto the C++ host code, which must overwrite `msg_text` periodically. If an author wanted to declare multiple distinct message cards purely in XML today, they would have to declare overlapping labels with mutually exclusive `bind_flag_if_eq` visibility attributes.

---

### Gap 3: Per-Carriage Indicators & Heterogeneous Sub-assemblies

#### 1. What the layout needs
`formationWidget` renders a dynamic 12-carriage train formation diagram ([`layoutSWR.json:130–139`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/source/layoutSWR.json#L130-L139)) driven by structured data ([`nationalRailBoard.json:7–20`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/source/nationalRailBoard.json#L7-L20)):

```json
{ "number": 1, "classType": "standard", "hasWheelchair": true, "hasBike": false, "loading": "30%" },
{ "number": 3, "classType": "first", "hasWheelchair": true, "hasBike": true, "loading": "80%" }
```

Each carriage cell in the diagram requires:
1. A bounding box and carriage number label.
2. First-class indicator (inverted background or accent bar).
3. Wheelchair space icon (`hasWheelchair`).
4. Bicycle storage icon (`hasBike`).
5. Proportional occupancy fill gauge (`loading`).

#### 2. Why the schema cannot say it
Even if basic list repetition ([Q-8]) existed, Schema 0.4 cannot express the internal contents of a carriage cell:
- **No Dynamic Fill Gauges:** Schema 0.4 has no bar or progress gauge primitive. As noted in [`design_spec.md §3 [D-6]`](file:///Users/mcneillm/Documents/Projects/U8G2GL/docs/design_spec.md#L202-L211), progress rendering on monochrome displays requires stipple pixel arithmetic that belongs in a C++ widget class.
- **No Conditional Styling:** Schema 0.4 styles are static compile-time assignments; an element cannot switch to an inverted style (`style_invert="true"`) dynamically based on a boolean data property like `classType == "first"`.
- **No Icon Glyph Binding:** `[Q-12]` (*`bind_src` / `bind_glyph`*) was deferred; icons cannot currently be bound to boolean subject states without individual visibility toggles on discrete bitmap elements.

#### 3. Open Question Mapping
- **Primary:** `[Q-8]` (*Repeaters*) and `[Q-15]` (*Cards / Conditional Visibility*).
- **Secondary:** `[Q-12]` (*`bind_glyph` for icon fonts*) and `design_spec.md §6.5` (*Custom C++ Elements*).

#### 4. Cost to close in Schema Surface
Attempting to make Schema 0.4 express train formations declaratively would require:
- A `<progress_bar>` or `<gauge>` drawing primitive with min/max and fill modes.
- Conditional attribute syntax (`style_if="is_first_class"`).
- Per-cell sub-element layout templates.

Under §1.5, this would dramatically inflate the schema surface for a highly domain-specific use case. [`design_spec.md §6.5`](file:///Users/mcneillm/Documents/Projects/U8G2GL/docs/design_spec.md#L785-L796) gives the exact architectural rule:
> *"Reach for C++ when the structure itself depends on runtime data — a variable row count, a mode machine, content-dependent sizing — or when the drawing is pixel arithmetic rather than composition."*

A train formation diagram is fundamentally a **custom C++ widget** (`extends u8g2gl_obj`) declaring an `<api>` manifest. The nose cone and static carriage cell boundary could be designed, but the repetition and cell drawing belong in C++.

#### 5. Workaround Evaluation
The probe hand-expanded 12 static carriage boxes and 12 text labels across the available 224-pixel width ([`departures_workaround.xml:81–128`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_workaround.xml#L81-L128)):

```xml
<!-- Workaround for formationWidget: Hand-expanded 12 carriage boxes -->
<u8g2gl_box name="coach_box_1" x="34" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_1" x="35" y="35" width="14" height="10" style="coach_font" text="1" />
...
<u8g2gl_box name="coach_box_12" x="232" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_12" x="233" y="35" width="14" height="10" style="coach_font" text="12" />
```

**Honest Assessment:** The workaround consumes 24 lines of XML just to draw empty numbered rectangles. All passenger load bars, bicycle icons, wheelchair icons, and first-class indicators had to be omitted. If a train has 4 or 8 coaches instead of 12, the layout renders incorrectly. This proves unequivocally that graphical train formations cannot be approximated by hand-unrolled static primitives; they require a dedicated custom widget class.

---

## Part 3 — What It Cost

### 3.1 Line Attribution Methodology

Line counting follows the rigorous methodology established in [`C2-ANALYSIS.md`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/pr-05-integration/C2-ANALYSIS.md):
1. **Kind Classification:** Lines are classified by kind into `Total`, `Blank`, `Comment`, and `Code`. A line containing code and a trailing comment is counted as `Code`. An empty line inside a comment block is counted as `Blank`.
2. **Concern Separation:** Lines are attributed to two distinct concerns:
   - **Layout Concern (L):** Positioning, coordinates, dimensions, fonts, alignments, styles, and widget declarations.
   - **Scaffolding / Envelope Concern (B):** File-level envelope and syntax container boilerplate (`<?xml>`, `<screen>`, `<view>`, `<styles>`, and closing tags). Project-level files (`u8g2gl.xml`, `globals.xml`) are separated as once-per-project costs.

### 3.2 Quantitative Line Counts

The physical files measured in this probe:
- **`layoutSWR.json`:** Original legacy layout from `departures-board-v3` ([`evidence/source/layoutSWR.json`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/source/layoutSWR.json)).
- **`departures_static.xml`:** Statically expressible Schema 0.4 baseline ([`evidence/departures_static.xml`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_static.xml)).
- **`departures_workaround.xml`:** Full hand-unrolled workaround layout ([`evidence/departures_workaround.xml`](file:///Users/mcneillm/Documents/Projects/U8G2GL/.agents/skills/principal-architect-workspace/g-probe-departures/evidence/departures_workaround.xml)).

| Metric | Legacy `layoutSWR.json` | Static XML (`departures_static`) | Workaround XML (`departures_workaround`) | *Projected XML (with [Q-8])* |
|---|---:|---:|---:|---:|
| **Total Lines (read by an author)** | **173** | **49** | **162** | *~70 (projection)* |
| Blank Lines | 0 | 7 | 25 | *~10* |
| Comment Lines | 0 | 20 | 37 | *~19* |
| **Code Lines** | **173** | **22** | **~100** | *~41 (projection)* |
| *— Scaffolding / Envelope Code* | 7 | 7 | 7 | *7* |
| *— Layout / Content Code* | 166 | 15 | ~93 | *~34* |

> [!IMPORTANT]
> **Asymmetry in the comparison.** `layoutSWR.json` is machine-formatted JSON: zero blanks, zero comments, 173 total lines = 173 code lines by construction. The XML files carry blanks and comments that the JSON has no occasion to carry. The like-for-like figure an author reads is **total lines: 162 against 173 (−6%)**. The code-line figure (−42%) measures a real property — XML elements are denser than JSON key-value pairs — but it compares apples to oranges because only one side has non-code lines to discard.

*The "Projected XML" column is a projection, not a measurement.* It estimates line counts if [Q-8] repeaters and [Q-15] cards replaced the hand-unrolled workaround sections, following the same attribution approach `C2-ANALYSIS.md` used for its own counterfactual (which it labelled approximate).

*Note on Project-Level Scaffolding:* In a full standalone U8G2GL application, `u8g2gl.xml` adds 7 code lines (28 total lines) of target display scaffolding, and `globals.xml` adds 8–12 code lines of subject definitions. These costs are paid once per project, not per screen.

### 3.3 Comparative Ratios & Analysis

Comparing total lines read by an author, and code lines separately:

```
Total Lines (what an author reads):
  Legacy v3 JSON:              173 total lines  [========================================]
  Workaround XML (Complete):   162 total lines  [=====================================]   (-6% vs JSON)
  Static XML (Incomplete):      49 total lines  [===========]                             (-72% vs JSON)

Code Lines (excluding blanks & comments):
  Legacy v3 JSON:              173 code lines   [========================================]
  Workaround XML (Complete):  ~100 code lines   [=======================]                 (-42% vs JSON)
  Projected XML (with [Q-8]): ~41 code lines    [==========]                              (projection)
  Static XML (Incomplete):      22 code lines   [=====]                                   (-87% vs JSON)
```

1. **Total Lines — Workaround vs Legacy:**
   - **Total:** 162 / 173 = **−6%**. On the lines an author actually reads, the workaround XML is about the same size as the legacy JSON.
2. **Code Lines — Workaround vs Legacy:**
   - **Code:** ~100 / 173 ≈ **−42%**. The XML is denser per element, but this comparison is asymmetric: the JSON is machine-formatted with zero blanks and zero comments by construction, so 173 total = 173 code. The XML's blanks and comments are a readability choice the JSON never had occasion to make.
3. **Code Lines — Static Baseline:**
   - **Code:** 22 / 173 = **−87%**. Highly concise, but incomplete — it only renders the platform box, headers, clock, and fallback label. Where Schema 0.4 has native primitives, XML is exceptionally compact.
4. **Projected Code Lines with Repeaters ([Q-8]) — *projection, not measurement*:**
   - **Code:** ~41 / 173 ≈ **−76%** *(approximate, following `C2-ANALYSIS.md`'s precedent for labelling counterfactuals)*.
   - **Attribution Breakdown of the ~41 Projected Code Lines:**
     - Screen & Styles Envelope: 7 scaffolding lines + 6 style lines = 13 lines
     - Platform Header & Primitives: 11 lines
     - Service 1 Header Row Template: ~4 lines
     - Scrolling Message Ticker: ~3 lines
     - Carriage Formation Repeater (`<repeater collection="formation">`): ~5 lines
     - Secondary Departures Repeater (`<repeater collection="services" skip="1" max="3">`): ~5 lines

This projection estimates the value of Phase 2's composition roadmap: with `<repeater>` ([Q-8]) and `<cards>` ([Q-15]), an author would describe the full, dynamic screen in approximately 41 lines of declarative XML — if those features are needed at all (see Part 2 framing note).

---

## Gate Summary

**Can U8G2GL describe the screens it exists to describe?**
**Not yet — but the path is shorter than it looks.** Schema 0.4 describes the static framework of a departures board with remarkable brevity — the platform box, status indicators, and system clock require just 15 lines of layout code against legacy's 173. However, a production departures display is inherently dynamic: it requires tabular collection iteration across service rows, sequential cycling through a pool of disruption messages, and structured carriage diagrams. None of these three can be expressed in Schema 0.4 without abusive hand-unrolling (and hand-unrolling produces a file about the same size as the legacy JSON: 162 vs 173 total lines). Whether the path forward is schema features ([Q-8] repeaters, [Q-15] cards) or custom widgets (§9.2's `wd_service_list` pattern) is under review — the spec already provides for the latter, and it may be sufficient. For the PR-07 gate, this probe confirms that the core architecture holds, the expressiveness gaps are known, and no redesign is needed.
