# Gap Analysis: ServiceListWidget (`gap-service-list`)

## 1. Widget Identity & Role

- **Widget Type**: `ServiceListWidget`
- **Instances in `layoutSWR.json`**:
  - `row0Widget` (`geometry`: `{ x: 32, y: 0, w: 224, h: 16 }`, `skipRows`: 0, `maxRows`: 1, `font`: `RailTextLarge12`)
  - `servicesWidget` (`geometry`: `{ x: 0, y: 54, w: 190, h: 13 }`, `skipRows`: 1, `font`: `RailTextSmall9`)
- **Source Data**: `nationalRailBoard.json` -> `services[]` (array of service records: `[ordinal, time, destination, platform, status]`).

## 2. What the Widget Does

`ServiceListWidget` renders tabular rail departure information across multiple columns with distinct alignments:
1. **Column Formatting**:
   - `row0Widget` defines 5 columns: col 0 (w=0, ordinal hidden), col 1 (w=34, time, left-aligned), col 2 (w=126, destination, left-aligned), col 3 (w=0, platform hidden), col 4 (w=60, status e.g. "On time", right-aligned).
   - `servicesWidget` defines 5 columns: col 0 (w=32, ordinal e.g. "2nd", center-aligned), col 1 (w=30, time, left-aligned), col 2 (w=70, destination, left-aligned), col 3 (w=0, platform hidden), col 4 (w=50, status, right-aligned).
2. **Dynamic Row Slicing & Repetition**:
   - `skipRows` and `maxRows` parameters select slices from the departure services array.
   - Handles variable row counts up to display capacity.
3. **Data Handling & Null Suppression**:
   - Suppresses null entries (e.g. cancelled service or unassigned platform).
   - Automatically handles text truncation or scrolling for long destination names.

## 3. What Schema 0.4 Can and Cannot Express

- **Can Express**:
  - Individual `<u8g2gl_label>` elements at fixed absolute coordinates with individual text bindings (`bind_text`).
- **Cannot Express**:
  - **Repetition over collections**: Schema 0.4 `<view>` is strictly static; it cannot instantiate row sub-assemblies dynamically over an array.
  - **Tabular multi-column alignment**: Schema 0.4 has no flexbox, grid, or relative column positioning. Every element must have compile-time fixed coordinates.
  - **Collection slicing**: Schema 0.4 has no concept of `skipRows` or `maxRows`.

## 4. Open Question Mapping

- **Direct Mapping: `[Q-8]` (Repeaters)**
  - *Quote (`docs/design_spec.md §21`)*: "A `<view>` is a static structure, so it can express 'three carriages' but not 'N carriages' (§6.5). A composite instantiated N times against a declared-capacity collection (§9) would let list rows and similar repeating structures be *designed* rather than hand-written in C++ — it is the difference between the designer reaching `wd_service_list`-shaped problems and not."
- **Secondary Mapping: `[Q-13]` (`$prop` interpolation inside text)**:
  - If columns or status phrases need composite strings (e.g. "Exp 19:41" or "Plat 12").

## 5. Workaround XML Pattern

To express this without custom C++ runtime elements, the layout must be statically unrolled into individual `<u8g2gl_label>` elements with distinct bound subjects for each cell:

```xml
<!-- Workaround for row0Widget (Service 1) -->
<u8g2gl_label name="row0_time" x="32" y="0" width="34" height="16"
              style="row0_font" bind_text="row0_time" />
<u8g2gl_label name="row0_dest" x="66" y="0" width="126" height="16"
              style="row0_font" bind_text="row0_dest" />
<u8g2gl_label name="row0_status" x="192" y="0" width="60" height="16"
              style="row0_font_right" bind_text="row0_status" />

<!-- Workaround for servicesWidget (Service 2) -->
<u8g2gl_label name="row1_ordinal" x="0" y="54" width="32" height="10"
              style="sub_font_center" bind_text="row1_ordinal" />
<u8g2gl_label name="row1_time" x="32" y="54" width="30" height="10"
              style="sub_font" bind_text="row1_time" />
<u8g2gl_label name="row1_dest" x="62" y="54" width="70" height="10"
              style="sub_font" bind_text="row1_dest" />
<u8g2gl_label name="row1_status" x="132" y="54" width="50" height="10"
              style="sub_font_right" bind_text="row1_status" />
```
