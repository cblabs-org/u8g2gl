# U8G2GL — LVGL Pro Gap Analysis & Architectural Alignment

> [!WARNING]
> **Frozen research input — not current design.** Written before design spec v0.2. Where this conflicts with [design_spec.md](../design_spec.md), the spec wins. Notably superseded here: the recommendation to keep `renderAnimationUpdate()` as a co-equal third lifecycle phase, and the `<widget>` parser-bridge file. Retained for its dimension-by-dimension LVGL Pro comparison, which is still accurate.

A critical, dimension-by-dimension evaluation of the departures-board widget system against LVGL Pro's mature architecture, with concrete recommendations for U8G2GL.

> [!IMPORTANT]
> **Design principle**: U8G2GL should feel familiar to LVGL Pro users. Same paradigm, same XML conventions, simplified for monochrome. A developer who has used LVGL Pro should be able to pick up U8G2GL in minutes, not hours.

---

## 1. Project Structure

### LVGL Pro
```
project.xml          ← Display targets, LVGL version, memory regions
globals.xml          ← Subjects, constants, styles, images, fonts
screens/*.xml        ← One file per screen
components/*/*.xml   ← Reusable pure-XML blocks
widgets/*/*.xml + .c ← C-backed custom widgets
images/              ← Asset sources
fonts/               ← Font sources
```
Key traits: **modular**, **git-friendly** (one file per screen), **clear separation** of concerns.

### Departures-Board
```
boards/<type>/layouts/layoutDefault.json   ← Layout definition
boards/<type>/<type>Board.hpp/.cpp         ← Board controller
widgets/*.hpp/.cpp                         ← Widget implementations
tools/layoutsim/layout.schema.json         ← JSON Schema
```
Key traits: **tightly coupled** to board types, JSON not XML, schema validates widget types via hardcoded enums, no concept of components, widgets are project-specific C++ classes.

### Gap Assessment

| Dimension | LVGL Pro | Departures-Board | Gap Severity |
|---|---|---|---|
| Modular file-per-screen | ✅ | ❌ One JSON per layout variant | 🔴 High |
| Separation of globals from screens | ✅ globals.xml | ❌ Fonts/assets scattered in code | 🔴 High |
| Component reuse (pure XML) | ✅ `<component>` | ❌ No component concept | 🔴 High |
| Custom widget extensibility | ✅ `<widget>` + C bridge | ⚠️ C++ classes exist but not XML-declared | 🟡 Medium |
| Schema-driven validation | ✅ CLI validates | ⚠️ JSON Schema exists but limited | 🟡 Medium |

### Recommendation for U8G2GL

Adopt LVGL Pro's project structure **directly**. The only change: replace `<memory>` regions and color format (irrelevant for 1-bit) with U8G2-specific display configuration:

```xml
<!-- project.xml -->
<project name="weather-station" version="1.0">
    <targets>
        <target name="default">
            <display controller="SSD1306" width="128" height="64"
                     bus="i2c" address="0x3C" rotation="0" />
        </target>
        <target name="wide">
            <display controller="SSD1322" width="256" height="64"
                     bus="spi" />
        </target>
    </targets>
</project>
```

---

## 2. Widget Lifecycle & Rendering Model

### LVGL Pro
LVGL has a **retained-mode** rendering engine. The widget tree is a persistent object graph. LVGL only redraws dirty regions. Widgets have rich state (`checked`, `pressed`, `focused`, `disabled`, `hovered`). The display driver handles partial refresh.

### Departures-Board
U8G2 is **immediate-mode** — you redraw the entire buffer every frame via `sendBuffer()` or page-by-page via `nextPage()`. Your `iGfxWidget` adds structure on top with three lifecycle phases:

```
tick(currentMillis)              → Logic/animation state update
render(display)                  → Full buffer draw
renderAnimationUpdate(display)   → Partial hardware-accelerated update (escape hatch)
```

The `renderAnimationUpdate()` pattern is **genuinely innovative** — it's a hardware-level partial refresh using `updateDisplayArea()` for animations during blocking operations. LVGL Pro has nothing equivalent because LVGL's display driver handles dirty regions automatically.

### Gap Assessment

| Dimension | LVGL Pro | Departures-Board | Gap Severity |
|---|---|---|---|
| Rendering model | Retained-mode, automatic dirty tracking | Immediate-mode, full redraw | N/A — fundamental difference |
| Widget state machine | Rich (checked, pressed, focused, etc.) | Binary visibility only (`isVisible`) | 🔴 High |
| Tick/update loop | Timer-driven internal | External `tick()` call | 🟢 Fine — appropriate for U8G2 |
| Partial refresh | Automatic via display driver | Manual `updateDisplayArea()` | 🟡 Different but valid |

### Recommendation for U8G2GL

**Keep the three-phase lifecycle** — it's the right model for U8G2's immediate-mode rendering:

```
tick(currentMillis)         → Update animation state, check subject changes
render(display)             → Full redraw to buffer
renderAnimationUpdate()     → Optional partial HW update
```

**Add a simplified state model**. Not LVGL's full state machine, but enough for conditional rendering:

| State | U8G2GL | LVGL Pro equivalent |
|---|---|---|
| `visible` | Whether to render at all | `hidden` flag |
| `active` | Highlighted/selected (e.g., menu item) | `checked` state |
| `disabled` | Grayed out / non-interactive | `disabled` state |

This gives `bind_flag_if_*` something to target without over-engineering.

---

## 3. Data Binding

### LVGL Pro
The **Subject/Observer** system is the backbone of LVGL Pro's architecture:

- **Declaration**: `<subjects>` in globals.xml with typed variables (`int`, `string`, `float`)
- **Simple binding**: `bind_text="subject_name"`, `bind_value="subject_name"`
- **Formatted binding**: `bind_text-fmt="Battery: %d%%"`
- **Conditional flags**: `<bind_flag_if_lt subject="battery" ref_value="20" flag="hidden" />`
- **Conditional states**: `<bind_state_if_eq subject="mode" ref_value="1" state="checked" />`
- **Subject mutation events**: `<subject_set_int_event trigger="clicked" subject="volume" value="50" />`
- **C-side update**: `lv_subject_set_int(&subject_battery, 42);` → all bound widgets auto-update

### Departures-Board
**No binding system.** Widgets are updated imperatively by the board controller:

```cpp
// Board controller manually pushes data to widgets
locationAndFilters.setLocation("London Euston");
servicesWidget.clearRows();
servicesWidget.addRow(rowData);
sysClock.setBlink(true);
```

Data flows one direction: Controller → Widget. There's no observer pattern, no reactive updates, and no way to express "when X changes, update Y" declaratively.

### Gap Assessment: 🔴 Critical

This is the **single largest architectural gap**. The entire value proposition of a declarative framework is decoupling data from presentation. Without subjects, U8G2GL is just "JSON/XML with extra steps."

### Recommendation for U8G2GL

Adopt LVGL Pro's subject system with monochrome-appropriate simplifications:

```xml
<!-- globals.xml -->
<globals>
    <subjects>
        <int name="temperature" value="22" />
        <int name="humidity" value="45" />
        <string name="station_name" value="London Euston" />
        <bool name="wifi_connected" value="true" />
    </subjects>
</globals>
```

**Simple binding** (direct):
```xml
<u8g2_label name="temp_label" bind_text="temperature" bind_text-fmt="%d°C" />
```

**Conditional visibility** (flag binding):
```xml
<u8g2_xbm name="wifi_icon" src="icon_wifi">
    <bind_flag_if_eq subject="wifi_connected" ref_value="0" flag="hidden" />
</u8g2_xbm>
```

**C-side API** (generated):
```c
// Auto-generated from globals.xml subjects
void u8g2gl_set_temperature(int value);
void u8g2gl_set_station_name(const char* value);
void u8g2gl_set_wifi_connected(bool value);
```

**What to OMIT from LVGL Pro's system for v1:**
- `<subject_set_int_event>` / `<subject_toggle_event>` — U8G2 displays rarely have touch input; subject mutation is typically controller-driven, not UI-driven
- `<bind_state_if_*>` — only add if the simplified state model (visible/active/disabled) is adopted
- `<bind_style>` — limited value with 1-bit color; skip for v1
- `float` subjects — rarely needed on monochrome displays

---

## 4. Component System

### LVGL Pro
Components are **pure-XML reusable blocks** with:
- `<api>` — typed props (`string`, `int`, `bool`, `color`, `image`, `font`, `subject`, `enum`)
- `<slot>` — injection points for arbitrary child content
- `<consts>` — component-scoped constants
- `<styles>` — component-scoped styles
- `<view extends="...">` — the widget tree, referencing props via `$prop_name`
- **Inheritance** via `extends` (component B extends component A)
- **Hyphenated slot injection**: `<my_component-slot_name>...</my_component-slot_name>`

### Departures-Board
**No component system.** Each widget is a hand-coded C++ class. Reuse means copy-pasting code. The `locationAndFiltersWidget` is essentially a composite component (fixed label + scrolling text), but it's 200+ lines of C++ rather than 20 lines of XML.

### Gap Assessment: 🔴 Critical

Components are what make LVGL Pro's XML approach powerful. Without them, users can't build composite widgets declaratively — they're back to writing C++.

### Recommendation for U8G2GL

Adopt LVGL Pro's component model with the same syntax:

```xml
<!-- components/status_bar/status_bar.xml -->
<component>
    <api>
        <prop name="title" type="string" default="" />
        <prop name="show_wifi" type="bool" default="true" />
        <prop name="show_clock" type="bool" default="true" />
        <slot name="trailing" />
    </api>
    <view layout="row" height="11" width="100%">
        <u8g2_label text="$title" font="small_6" grow="1" />
        <u8g2_xbm src="icon_wifi" hidden="{!show_wifi}" width="12" />
        <container name="trailing" />
        <u8g2_clock format="HH:MM" font="small_6" hidden="{!show_clock}" />
    </view>
</component>

<!-- Usage in a screen -->
<status_bar title="$station_name">
    <status_bar-trailing>
        <u8g2_xbm src="icon_weather" />
    </status_bar-trailing>
</status_bar>
```

**What to simplify vs LVGL Pro:**
- **Skip `<previews>`** for v1 (needed for the visual editor, not the CLI)
- **Skip `<consts>` scoping** — globals are sufficient for monochrome projects
- **Keep inheritance** — `extends="..."` is essential for building widget libraries

---

## 5. Layout System

### LVGL Pro
Full CSS-like layout engine:
- **Flexbox**: `flex_flow`, `flex_main_place`, `flex_cross_place`, `flex_grow`
- **Grid**: `grid_column_dsc_array`, `grid_row_dsc_array`, `grid_cell_*`
- **Absolute positioning**: `x`, `y`, `align="center"`

### Departures-Board
**Explicit pixel positioning**. Every widget has `(x, y, w, h)`:
```json
{"id": "sysClock", "geometry": {"x": 216, "y": 0, "w": 40, "h": 11}}
```

### Gap Assessment: 🟢 Actually Correct for This Domain

This is one area where **the departures-board got it right and LVGL Pro's approach is wrong for monochrome**.

On a 480×320 color TFT, a 1px rounding error in flex layout is invisible. On a 128×64 monochrome dot-matrix:
- **Every pixel is deliberate.** There is no anti-aliasing, no sub-pixel rendering, no dithering to smooth out mistakes.
- **Padding/gap calculations introduce rounding artifacts.** A `gap: 3` on 5 items in 64px of height doesn't divide evenly. Flex engines round — and on these displays, you *see* that rounding.
- **Font metrics are coarse.** A U8G2 font might be 6px, 8px, or 10px tall. There's no "12.5px" — layout engines that interpolate between integer pixel positions create visual noise.
- **Screen real estate is precious.** On an 80px-tall display, 2px of unwanted padding is 2.5% of the entire screen height. That's the equivalent of wasting 8px on a 320px display.

Professional monochrome display design (Flipper Zero, railway departure boards, industrial HMIs) uses **absolute pixel positioning** precisely because accuracy is paramount.

### Recommendation for U8G2GL

> [!IMPORTANT]
> **Pixel positioning is the primary layout model.** Keep LVGL Pro's attribute syntax, but `x`, `y`, `width`, `height` are the primary positioning mechanism, not `layout="flex"`.

```xml
<!-- Explicit pixel placement — the correct model for monochrome -->
<u8g2_label name="location" x="0" y="0" width="192" height="11"
    bind_text="station_name" font="small_9" />

<u8g2_clock name="clock" x="216" y="0" width="40" height="11"
    format="HH:MM" font="clock_small_7" />

<u8g2_line x1="0" y1="11" x2="256" y2="11" />

<u8g2_list name="services" x="0" y="13" width="256" height="38"
    bind_data="departures" font="tall_12" />
```

**What this means in practice:**
- The **visual editor** (Phase 3) becomes the primary tool for layout — drag widgets to pixel positions, read coordinates off the canvas.
- The **XML schema** stores exact coordinates, not computed layouts.
- The **code generator** emits `setCoords(x, y, w, h)` directly — no layout engine needed on the MCU.
- **Resolution portability** between 128×64 and 256×64 is handled by having separate screen XML files per target (the `<target>` system from `project.xml`), not by auto-layout.

**Optional future addition** — a very simple `row` helper for status bars where items sit adjacent horizontally and the widths are all explicit:

```xml
<!-- Sugar for "place these items left-to-right at y=0" -->
<row y="0" height="11">
    <u8g2_label width="192" ... />
    <u8g2_xbm width="12" ... />
    <u8g2_clock width="40" ... />
</row>
<!-- Equivalent to: x=0, x=192, x=204 — computed from widths, no rounding -->
```

This is strictly additive — it computes `x` from summing preceding widths (integer arithmetic, no rounding). But it's optional syntactic sugar, not a layout engine.

---

## 6. Styling

### LVGL Pro
Rich CSS-like styling system:
- Named style classes: `<style name="card_bg" bg_color="0x2A2A2A" radius="8" />`
- Inline styles: `style_text_color="0xFF0000"`
- Part+state selectors: `style_bg_color-indicator-checked="0x00FF00"`
- Conditional styles via `<bind_style>`
- Design tokens via `<consts>`: `#spacing_md`, `#color_primary`

### Departures-Board
**No style system.** Visual properties are hardcoded in C++:
```cpp
display.setFont(NatRailSmall9);
display.setDrawColor(1);
display.drawBox(x, y, width, height);
```

### Gap Assessment: 🟡 Medium

With 1-bit color, the styling domain collapses dramatically. There's no `bg_color`, no gradients, no shadows, no opacity. The useful style properties for monochrome are:

| Property | Monochrome Meaning |
|---|---|
| `font` | Font selection |
| `draw_color` | 0 (black/off) or 1 (white/on) |
| `padding` | Spacing within widget |
| `gap` | Space between children in layout |
| `align` | Text alignment (left/center/right) |
| `border` | 1px drawn border (box outline) |
| `invert` | XOR / inverted region (for selection highlighting) |
| `radius` | Rounded corners (U8G2 supports rounded boxes) |

### Recommendation for U8G2GL

Keep LVGL Pro's named style syntax but with a **monochrome-appropriate property set**:

```xml
<styles>
    <style name="header" font="small_6" padding="2" draw_color="1" />
    <style name="selected" invert="true" padding="1" />
    <style name="separator" border_bottom="1" />
</styles>

<!-- Usage -->
<u8g2_label text="Title">
    <style name="header" />
</u8g2_label>
```

**Inline styles** using LVGL Pro's `style_` prefix:
```xml
<u8g2_label text="Warning" style_font="bold_8" style_invert="true" />
```

**Skip**: part+state selectors, `<bind_style>`, gradients, opacity, shadows — none of these exist in monochrome.

---

## 7. Screen Navigation & Lifecycle

### LVGL Pro
- `<screen_create_event>` — instantiate fresh (dynamic)
- `<screen_load_event>` — switch to persistent screen
- `permanent="true"` flag on `<screen>`
- Transition animations: `anim_type="move_left" duration="300"`

### Departures-Board
- `iDisplayBoard::onActivate()` / `onDeactivate()` — lifecycle hooks
- `DisplayManager` manages the active board and handles carousel rotation
- No declarative navigation — transitions are coded in the board controller

### Gap Assessment: 🟡 Medium

U8G2 displays don't typically animate screen transitions (no GPU, very slow SPI refresh for full redraws). But lifecycle hooks and declarative navigation are valuable.

### Recommendation for U8G2GL

```xml
<screen name="home">
    <view layout="column">
        <!-- widgets -->
        <u8g2_button>
            <screen_load_event screen="settings" trigger="button_press" />
        </u8g2_button>
    </view>
</screen>
```

**Simplifications vs LVGL Pro:**
- No transition animations (too slow for monochrome SPI displays)
- Keep `onActivate` / `onDeactivate` lifecycle in generated code
- Support button/encoder-driven triggers instead of touch events:
  - `trigger="button_press"`, `trigger="encoder_click"`, `trigger="long_press"`

---

## 8. Asset Management

### LVGL Pro
- `<images>`: PNG/JPG/SVG → C arrays, with `<convert>` for build-time SVG→PNG
- `<fonts>`: TTF/OTF → bitmap C arrays via `<bin>` with `bpp`, `range`, `as_file`
- Memory region assignment: `memory="int_flash"`

### Departures-Board
- Fonts: Custom BDF fonts compiled externally, referenced via C++ extern pointers
- Images: XBM bitmaps manually included as C arrays
- No declarative asset pipeline

### Gap Assessment: 🟡 Medium

### Recommendation for U8G2GL

```xml
<!-- globals.xml -->
<globals>
    <fonts>
        <!-- BDF fonts compiled to C arrays at build time -->
        <bdf name="small_6" src="fonts/custom_6px.bdf"
             range="0x20-0x7F" />
        <bdf name="bold_8" src="fonts/custom_8px_bold.bdf"
             range="0x20-0x7F" />
        <!-- Use built-in U8G2 font by reference -->
        <builtin name="u8g2_font_6x10_mr" />
    </fonts>

    <images>
        <!-- XBM bitmaps compiled to C arrays -->
        <xbm name="icon_wifi" src="assets/wifi.xbm" />
        <xbm name="icon_battery" src="assets/battery.xbm" />
        <!-- PNG → 1-bit XBM conversion at build time -->
        <convert name="logo" src="assets/logo.png"
                 width="32" height="32" dither="floyd_steinberg" />
    </images>
</globals>
```

The `<convert>` tag (borrowed from LVGL Pro) is particularly powerful — it means designers can work with normal PNGs and the build pipeline handles dithering to 1-bit.

---

## 9. Code Generation

### LVGL Pro
Generates C code that calls LVGL APIs directly. Zero runtime overhead. Every `name` attribute becomes a C identifier. Generated code is in a `DO NOT EDIT` directory.

### Departures-Board
JSON → C++ code generator exists. Output marked `Autogenerated from layoutDefault.json`. However, the generated code is **partially generated** — it sets up widget coordinates and properties, but the widget classes themselves are hand-written.

### Gap Assessment: 🟡 Medium

The code generator exists but generates only layout wiring, not the full screen lifecycle.

### Recommendation for U8G2GL

Generate **complete, standalone C files** following LVGL Pro's pattern:

```c
// GENERATED FILE — DO NOT EDIT
// Source: screens/home.xml

#include "ui.h"

// Forward declarations
static u8g2gl_label_t lbl_title;
static u8g2gl_xbm_t   icon_wifi;
static u8g2gl_clock_t  sys_clock;

void ui_screen_home_init(void) {
    u8g2gl_label_init(&lbl_title);
    u8g2gl_label_set_font(&lbl_title, &font_small_6);
    u8g2gl_label_bind_text(&lbl_title, &subject_station_name);

    u8g2gl_xbm_init(&icon_wifi, &img_icon_wifi);
    u8g2gl_xbm_bind_flag_if_eq(&icon_wifi, &subject_wifi_connected,
                                 0, U8G2GL_FLAG_HIDDEN);
    // ...
}

void ui_screen_home_tick(uint32_t ms) {
    u8g2gl_label_tick(&lbl_title, ms);
    u8g2gl_xbm_tick(&icon_wifi, ms);
    u8g2gl_clock_tick(&sys_clock, ms);
}

void ui_screen_home_render(U8G2* display) {
    u8g2gl_label_render(&lbl_title, display);
    u8g2gl_xbm_render(&icon_wifi, display);
    u8g2gl_clock_render(&sys_clock, display);
}
```

---

## 10. Naming Conventions

### LVGL Pro
| Convention | Example |
|---|---|
| Widget tags | `lv_label`, `lv_slider`, `lv_arc` |
| Custom widget prefix | `wd_` (`wd_meter`, `wd_dial`) |
| Subject names | `subject_battery`, `subject_mode` |
| Constants | `#color_primary`, `#spacing_md` |
| Props | `$title`, `$accent_color` |
| Screen files | `screen_home.xml`, `screen_settings.xml` |
| Component dirs | `components/card_item/card_item.xml` |

### Departures-Board
| Convention | Example |
|---|---|
| Widget classes | `clockWidget`, `labelWidget` (camelCase) |
| Board classes | `NationalRailBoard` (PascalCase) |
| JSON ids | `"sysClock"`, `"msgWidget"` (camelCase) |
| Widget types | `"serviceListWidget"` (camelCase) |

### Recommendation for U8G2GL

**Follow LVGL Pro's conventions exactly**, substituting the prefix:

| Convention | U8G2GL | LVGL Pro |
|---|---|---|
| Widget tags | `u8g2_label`, `u8g2_box`, `u8g2_xbm` | `lv_label`, `lv_obj`, `lv_image` |
| Custom widget prefix | `wd_` (same) | `wd_` |
| Subjects | `subject_*` (same) | `subject_*` |
| Constants | `#const_name` (same) | `#const_name` |
| Props | `$prop_name` (same) | `$prop_name` |
| Screen files | `screen_*.xml` (same) | `screen_*.xml` |
| Component dirs | `components/name/name.xml` (same) | `components/name/name.xml` |

---

## Summary: What to Adopt, Adapt, and Skip

### ✅ Adopt Directly (same as LVGL Pro)
- Project structure (`project.xml`, `globals.xml`, `screens/`, `components/`, `widgets/`)
- Naming conventions (`u8g2_*` prefix, `subject_*`, `#const`, `$prop`)
- Component system (`<component>`, `<api>`, `<prop>`, `<slot>`, `$` interpolation)
- Custom widget bridge (`<widget>` + C files + `wd_` prefix)
- Subject declaration syntax (`<subjects>`, `<int>`, `<string>`, `<bool>`)
- Simple binding (`bind_text`, `bind_value`, `bind_text-fmt`)
- Conditional flag binding (`<bind_flag_if_eq>`, `<bind_flag_if_lt>`)
- Constant system (`<consts>`, `#name` references)
- Code generation pattern (AOT, zero runtime overhead, `DO NOT EDIT`)
- One-file-per-screen, one-dir-per-component

### 🔄 Adapt (simplified for monochrome)
- **Layout**: Pixel positioning primary (not flex). Optional `<row>` sugar for adjacent horizontal placement with explicit widths.
- **Styling**: Monochrome property set only (font, padding, gap, invert, border, draw_color, radius)
- **Widget states**: Simplified to `visible`/`active`/`disabled` (not LVGL's full state machine)
- **Asset pipeline**: BDF fonts (not TTF), XBM images (not PNG/SVG), with `<convert>` for PNG→XBM dithering
- **Screen navigation**: Button/encoder triggers (not touch events). No transition animations.
- **Display config**: U8G2 constructor params instead of LVGL display/memory regions

### ❌ Skip for v1
- `<bind_style>` conditional styles (not useful with 1-bit color)
- `<bind_state_if_*>` conditional states (add later if state model adopted)
- `<subject_set_int_event>` / `<subject_toggle_event>` (UI-driven mutation — rare without touch)
- Grid layout
- Animation timelines (`<animations>`)
- Translations (`translations.xml`)
- Part+state style selectors (no widget parts in monochrome)
- `float` subjects
- `<previews>` (visual editor feature — Phase 3)

---

## Proposed U8G2GL Built-in Widget Set

Mapping the departures-board widgets and U8G2 primitives to LVGL Pro-style XML tags:

| U8G2GL Widget | Departures-Board Equivalent | LVGL Pro Equivalent | Description |
|---|---|---|---|
| `u8g2_label` | `labelWidget` | `lv_label` | Static or bound text with alignment and truncation |
| `u8g2_scrolling_label` | `scrollingTextWidget` | — (no equivalent) | Marquee horizontal scroll when text exceeds width |
| `u8g2_xbm` | `imageWidget` | `lv_image` | Monochrome bitmap display |
| `u8g2_box` | (via drawingPrimitives) | `lv_obj` | Rectangle (filled or outline) |
| `u8g2_line` | (via primitives JSON) | `lv_line` | Horizontal/vertical line (separator) |
| `u8g2_circle` | (via drawingPrimitives) | — | Circle (filled or outline) |
| `u8g2_progress_bar` | `progressBarWidget` | `lv_bar` | Horizontal progress indicator with animation |
| `u8g2_clock` | `clockWidget` | — (custom) | Time display with configurable format and blinking colon |
| `u8g2_list` | `serviceListWidget` | `lv_table` | Paginated multi-column table with column defs |
| `u8g2_switch` | — | `lv_switch` | Toggle on/off indicator (bound to bool subject) |
| `<view>` | — | `<view>` | Layout container (flex row/column) |
| `<container>` | — | `<container>` | Slot target for component injection |

### U8G2-Specific Widgets (No LVGL Equivalent)
| Widget | Description |
|---|---|
| `u8g2_scrolling_label` | Marquee text — essential for narrow monochrome displays |
| `u8g2_glyph` | Single character from an icon font (weather icons, symbols) |

---

## Example: Departures Board Reimagined in U8G2GL XML

The [layoutDefault.json](file://~/Documents/Projects/departures-board/modules/displayManager/boards/nationalRailBoard/layouts/layoutDefault.json) rewritten in LVGL Pro-aligned U8G2GL XML:

```xml
<!-- screens/screen_departures.xml -->
<screen name="departures">
    <styles>
        <style name="header_text" font="small_9" />
        <style name="row_text" font="tall_12" />
        <style name="footer_text" font="small_9" />
    </styles>

    <view width="256" height="64">
        <!-- Status bar (y=0, height=11) -->
        <u8g2_scrolling_label name="location"
            x="0" y="0" width="192" height="11"
            bind_text="station_name">
            <style name="header_text" />
        </u8g2_scrolling_label>

        <u8g2_glyph name="weather_icon"
            x="192" y="0" width="12" height="11"
            bind_glyph="weather_code" font="weather_icons_11" />

        <u8g2_xbm name="wifi_icon"
            x="204" y="0" width="12" height="11"
            src="icon_wifi">
            <bind_flag_if_eq subject="wifi_connected"
                ref_value="0" flag="hidden" />
        </u8g2_xbm>

        <u8g2_clock name="clock"
            x="216" y="0" width="40" height="11"
            format="HH:MM" font="clock_small_7" />

        <!-- Separator lines -->
        <u8g2_line x1="0" y1="11" x2="256" y2="11" />
        <u8g2_line x1="0" y1="51" x2="256" y2="51" />

        <!-- Next departure — pinned top row (y=13, height=14) -->
        <u8g2_list name="next_departure"
            x="0" y="13" width="256" height="14"
            bind_data="departures" skip="0" max="1">
            <style name="row_text" />
            <column width="24" align="left" />
            <column width="40" align="left" />
            <column width="120" align="left" />
            <column width="16" align="center" />
            <column width="55" align="right" />
        </u8g2_list>

        <!-- Remaining departures — scrolling (y=26, height=26) -->
        <u8g2_list name="other_departures"
            x="0" y="26" width="256" height="26"
            bind_data="departures" skip="1"
            scroll_dwell="5000" scroll_duration="1000">
            <style name="row_text" />
            <column width="24" align="left" />
            <column width="40" align="left" />
            <column width="120" align="left" />
            <column width="16" align="center" />
            <column width="55" align="right" />
        </u8g2_list>

        <!-- Message ticker (y=53, height=12) -->
        <u8g2_scrolling_label name="messages"
            x="0" y="53" width="256" height="12"
            bind_text="service_message">
            <style name="footer_text" />
        </u8g2_scrolling_label>
    </view>
</screen>
```

Compare this to the [original 184-line JSON](file://~/Documents/Projects/departures-board/modules/displayManager/boards/nationalRailBoard/layouts/layoutDefault.json) + [120-line generated C++](file://~/Documents/Projects/departures-board/modules/displayManager/boards/nationalRailBoard/layouts/layoutDefault.cpp) — the XML is **more expressive, more readable, and self-contained**.
