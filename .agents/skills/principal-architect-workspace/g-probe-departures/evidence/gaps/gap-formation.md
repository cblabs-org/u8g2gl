# Gap Analysis: TrainFormationWidget (`gap-formation`)

## 1. Widget Identity & Role

- **Widget Type**: `TrainFormationWidget`
- **Instance in `layoutSWR.json`**:
  - `formationWidget` (`geometry`: `{ x: 32, y: 32, w: 224, h: 17 }`, `visible`: true)
- **Source Data**: `nationalRailBoard.json` -> `header.firstServiceFormation[]` (array of 12 carriage objects: `{ number, classType, hasWheelchair, hasBike, loading }`).

## 2. What the Widget Does

`TrainFormationWidget` draws an embedded graphical train diagram showing carriage composition and occupancy:
1. **Dynamic Train Length**:
   - Renders 1 to N carriages dynamically (commonly 2, 4, 8, 10, or 12 coaches).
2. **Per-Carriage Attributes & Iconography**:
   - Carriage ordinal / number (`1`..`12`).
   - Class distinction (`classType`: "first" vs "standard", indicated by a top accent bar, inverted colors, or cross-hatching).
   - Facility icons: Wheelchair space (`hasWheelchair`), Bicycle storage (`hasBike`).
   - Occupancy / loading level (`loading`: e.g. "30%", "100%", rendered as a vertical or horizontal proportional fill bar).
3. **Train Direction / Nose Cone**:
   - Graphical front-of-train nose cone indicating direction of travel.

## 3. What Schema 0.4 Can and Cannot Express

- **Can Express**:
  - Static primitive boxes (`<u8g2gl_box>`) and text labels (`<u8g2gl_label>`) at fixed pixel coordinates.
- **Cannot Express**:
  - **Dynamic Repetition (`[Q-8]`)**: Cannot iterate over `firstServiceFormation[]`. The schema requires every box and label to be individually declared at compile time.
  - **Conditional Glyphs / Sub-assemblies (`[Q-15]`)**: Cannot conditionally display wheelchair or bicycle icons based on boolean carriage properties without declaring dedicated visibility subjects (`bind_flag_if`) for every single icon of every single carriage.
  - **Dynamic Bar Gauges**: Schema 0.4 lacks a dynamic progress / fill gauge primitive for displaying carriage occupancy.
  - **Class Inversion / Styling Switches**: Schema 0.4 does not support dynamic style switching (e.g. inverted colors for first class) based on data.

## 4. Open Question Mapping

- **Direct Mapping: `[Q-8]` (Repeaters)**
  - *Quote (`docs/research/widget_design_assessment.md §3`)*: "the nose-cone assembly and a single carriage cell *are* designable, and only the repetition and the mode machine need C++. See also [Q-8] on repeaters, which would shrink the C++ residue further."
  - A carriage cell template repeated N times against a collection would allow train diagrams to be designed rather than hardcoded in C++.
- **Direct Mapping: `[Q-15]` (Cards / Conditional Sub-assemblies)**
  - *Quote (`docs/design_spec.md §21`)*: "A container showing exactly one of its children, chosen by an integer subject... Today this takes `bind_flag_if` on every child, which is clumsy."
  - Carriage amenity icons (wheelchair, bike) require either conditional child visibility or mode switching within each carriage cell.

## 5. Workaround XML Pattern

Without custom runtime C++, the workaround requires statically hardcoding 12 distinct carriage boxes and labels into the XML. Per-carriage amenity icons and dynamic fill bars must be omitted:

```xml
<!-- Workaround for formationWidget: Hand-expanded 12 carriage boxes -->
<!-- Available width: 224px (x=32 to 256). Carriage width: 16px, gap: 2px (12 * 16 + 11 * 2 = 214px, starting at x=34) -->
<u8g2gl_box name="coach_1" x="34" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_1" x="35" y="35" width="14" height="10" style="coach_font" text="1" />

<u8g2gl_box name="coach_2" x="52" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_2" x="53" y="35" width="14" height="10" style="coach_font" text="2" />

<u8g2gl_box name="coach_3" x="70" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_3" x="71" y="35" width="14" height="10" style="coach_font" text="3" />

<u8g2gl_box name="coach_4" x="88" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_4" x="89" y="35" width="14" height="10" style="coach_font" text="4" />

<u8g2gl_box name="coach_5" x="106" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_5" x="107" y="35" width="14" height="10" style="coach_font" text="5" />

<u8g2gl_box name="coach_6" x="124" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_6" x="125" y="35" width="14" height="10" style="coach_font" text="6" />

<u8g2gl_box name="coach_7" x="142" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_7" x="143" y="35" width="14" height="10" style="coach_font" text="7" />

<u8g2gl_box name="coach_8" x="160" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_8" x="161" y="35" width="14" height="10" style="coach_font" text="8" />

<u8g2gl_box name="coach_9" x="178" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_9" x="179" y="35" width="14" height="10" style="coach_font" text="9" />

<u8g2gl_box name="coach_10" x="196" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_10" x="197" y="35" width="14" height="10" style="coach_font" text="10" />

<u8g2gl_box name="coach_11" x="214" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_11" x="215" y="35" width="14" height="10" style="coach_font" text="11" />

<u8g2gl_box name="coach_12" x="232" y="34" width="16" height="12" filled="false" />
<u8g2gl_label name="coach_lbl_12" x="233" y="35" width="14" height="10" style="coach_font" text="12" />
```
