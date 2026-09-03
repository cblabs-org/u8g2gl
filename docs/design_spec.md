# U8G2GL Design Specification

**U8G2GL** — A declarative XML framework for monochrome U8G2 displays.

> *"Same paradigm as LVGL Pro, simplified for monochrome."*

**Version**: 0.1 Draft  
**Author**: Matt McNeill, CB Labs  
**Date**: September 2026

---

## 1. Vision & Positioning

### What U8G2GL Is

U8G2GL is a **build-time XML-to-C code generation framework** for designing, composing, and generating embedded UI code targeting monochrome displays driven by the [U8G2](https://github.com/olikraus/u8g2) library.

It brings the declarative, component-based workflow of [LVGL Pro](https://lvgl.io/tools/pro-editor) to the world of 128×64 OLEDs, 256×64 dot-matrix displays, and similar small monochrome screens.

### What U8G2GL Is Not

- **Not a runtime framework.** There is no XML parser on the MCU. XML is compiled to C at build time. Zero runtime overhead.
- **Not a replacement for U8G2.** U8G2GL generates code that calls U8G2's drawing API. U8G2 remains the hardware abstraction layer.
- **Not a general-purpose GUI toolkit.** It targets 1-bit monochrome displays where every pixel is deliberate.

### Why It Exists

| Problem | U8G2GL Solution |
|---|---|
| U8G2 screen layouts are hand-coded pixel coordinates in C/C++ | Declare layouts in XML; generate the C code |
| No way to preview a screen without flashing firmware | Web-based canvas preview (planned) |
| Reusable widgets require copy-pasting C++ classes | Components and widgets declared in XML, shared as folders |
| Data flows from controller to display via imperative push calls | Reactive subject binding — set a value, all bound widgets update |
| No ecosystem equivalent to LVGL Pro's design workflow | Aligned project structure, naming, and concepts |

### Design Principles

1. **Familiar to LVGL Pro users.** Same project structure, same naming conventions, same component/widget distinction. A developer who knows LVGL Pro should be productive in U8G2GL within minutes.
2. **Pixel-perfect positioning.** No flex layout, no auto-padding. On a 128×64 display, every pixel is deliberate. Coordinates are explicit integers.
3. **Build-time compilation.** XML → C code generation. No XML parsing on the MCU. No runtime memory overhead.
4. **Fractal architecture.** Screens and widgets use the same pattern: an XML layout of named elements driven by C controller logic.
5. **Monochrome-native.** The framework understands 1-bit constraints: no colour properties, no gradients, no opacity. XOR mode and inversion are first-class features.

---

## 2. Project Structure

Following LVGL Pro conventions with U8G2-specific adaptations:

```
my_project/
├── project.xml              ← Display targets, U8G2 config
├── globals.xml              ← Subjects, constants, styles, fonts, images
├── screens/                 ← One XML file per screen
│   ├── screen_home.xml
│   └── screen_settings.xml
├── components/              ← Reusable pure-XML compositions (optional)
│   └── status_bar/
│       └── status_bar.xml
├── widgets/                 ← Custom C-backed widgets (optional)
│   └── wd_service_list/
│       ├── wd_service_list.xml
│       ├── wd_service_list.h
│       ├── wd_service_list.c
│       └── wd_service_list_parser.c
├── fonts/                   ← BDF font sources
├── assets/                  ← XBM/PNG image sources
└── generated/               ← Auto-generated C code (DO NOT EDIT)
    ├── ui.h
    ├── ui_screen_home.c
    ├── ui_screen_settings.c
    ├── ui_subjects.h
    ├── ui_subjects.c
    ├── ui_fonts.h
    └── ui_images.h
```

---

## 3. Core XML Files

### 3.1 `project.xml`

Defines display hardware targets. Replaces LVGL Pro's colour format and memory regions with U8G2-specific display configuration.

```xml
<project name="departures-board" version="1.0">
    <targets>
        <target name="default">
            <display controller="SSD1322" width="256" height="64"
                     bus="spi" rotation="0" />
        </target>
        <target name="compact">
            <display controller="SSD1306" width="128" height="64"
                     bus="i2c" address="0x3C" />
        </target>
    </targets>
</project>
```

### 3.2 `globals.xml`

Central registry for all shared resources. Follows LVGL Pro's structure.

```xml
<globals>
    <!-- Named constants referenced with # prefix -->
    <consts>
        <int name="header_height" value="11" />
        <int name="row_height" value="13" />
        <string name="app_name" value="Departures Board" />
    </consts>

    <!-- Reactive data subjects -->
    <subjects>
        <int name="temperature" value="0" />
        <string name="station_name" value="" />
        <bool name="wifi_connected" value="true" />
        <data name="departures" type="wd_service_list_data" />
    </subjects>

    <!-- Reusable named styles -->
    <styles>
        <style name="header" font="small_9" draw_color="1" />
        <style name="body" font="tall_12" />
        <style name="selected" invert="true" />
    </styles>

    <!-- Font assets compiled to C arrays at build time -->
    <fonts>
        <bdf name="small_9" src="fonts/custom_9px.bdf" range="0x20-0x7F" />
        <bdf name="tall_12" src="fonts/custom_12px.bdf" range="0x20-0x7F" />
        <bdf name="clock_small_7" src="fonts/clock_7px.bdf" range="0x30-0x3A" />
        <bdf name="weather_icons_11" src="fonts/weather_11px.bdf" range="0xE000-0xE01F" />
        <builtin name="u8g2_font_6x10_mr" />
    </fonts>

    <!-- Image assets compiled to XBM C arrays -->
    <images>
        <xbm name="icon_wifi" src="assets/wifi.xbm" />
        <xbm name="icon_battery" src="assets/battery.xbm" />
        <!-- PNG to 1-bit XBM conversion at build time -->
        <convert name="logo" src="assets/logo.png"
                 width="32" height="32" dither="floyd_steinberg" />
    </images>
</globals>
```

### 3.3 Screen Files

One file per screen in `screens/`. Each screen is a flat list of pixel-positioned elements.

```xml
<!-- screens/screen_home.xml -->
<screen name="home">
    <!-- Optional screen-local styles -->
    <styles>
        <style name="footer" font="small_9" />
    </styles>

    <view width="256" height="64">
        <!-- Status bar -->
        <status_bar x="0" y="0"
            title_subject="station_name"
            wifi_subject="wifi_connected" />

        <u8g2_line x1="0" y1="11" x2="256" y2="11" />

        <!-- Main content -->
        <wd_service_list name="departures"
            x="0" y="13" width="256" height="38"
            bind_data="departures" font="tall_12"
            scroll_dwell="5000" scroll_duration="1000">
            <column width="24" align="left" />
            <column width="40" align="left" />
            <column width="120" align="left" />
            <column width="16" align="center" />
            <column width="55" align="right" />
        </wd_service_list>

        <u8g2_line x1="0" y1="51" x2="256" y2="51" />

        <!-- Message ticker -->
        <u8g2_scrolling_label name="messages"
            x="0" y="53" width="256" height="12"
            bind_text="service_message" font="small_9" />
    </view>
</screen>
```

---

## 4. The Four-Tier Widget Architecture

### Tier 1: Static Primitives

Direct U8G2 draw calls. No widget struct, no tick, no state. Compiled to inline function calls.

| XML Tag | U8G2 API | Description |
|---|---|---|
| `<u8g2_line>` | `drawHLine` / `drawVLine` / `drawLine` | Line (separator) |
| `<u8g2_box>` | `drawBox` / `drawFrame` / `drawRBox` / `drawRFrame` | Rectangle (filled/outline, optional radius) |
| `<u8g2_circle>` | `drawCircle` / `drawDisc` | Circle (filled/outline, optional segments) |
| `<u8g2_triangle>` | `drawTriangle` / `drawLine` ×3 | Triangle (filled/outline) |
| `<u8g2_pixel>` | `drawPixel` | Single pixel |
| `<u8g2_text>` | `drawStr` / `drawUTF8` | Static text (no binding, no state) |

### Tier 2: Built-in Widgets

Ship with the framework. User configures via XML properties. Framework implements the C code.

| XML Tag | Description | Key Properties |
|---|---|---|
| `<u8g2_label>` | Static/bound text with alignment, truncation | `text`, `bind_text`, `bind_text-fmt`, `font`, `align`, `truncate` |
| `<u8g2_scrolling_label>` | Marquee horizontal scroll | All of label + `scroll_speed`, `initial_delay`, `static_dwell` |
| `<u8g2_xbm>` | Monochrome bitmap display | `src`, `bind_src` |
| `<u8g2_glyph>` | Single glyph from icon font | `glyph`, `bind_glyph`, `font` |
| `<u8g2_progress_bar>` | Animated progress indicator | `bind_value`, `bind_text`, `style` (solid/stipple), `animate_duration` |
| `<u8g2_clock>` | Configurable time display with blinking colon | `format`, `font`, `secondary_font`, `blink`, `bind_time` |
| `<u8g2_switch>` | Toggle indicator | `bind_value` |

### Tier 3: Components (Pure XML)

User-created reusable compositions. No C code. Follow LVGL Pro's `<component>` pattern.

```xml
<!-- components/status_bar/status_bar.xml -->
<component>
    <api>
        <prop name="title_subject" type="subject" default="" />
        <prop name="wifi_subject" type="subject" default="" />
        <prop name="total_width" type="int" default="256" />
        <prop name="bar_height" type="int" default="11" />
        <prop name="font" type="font" default="small_9" />
    </api>

    <view width="$total_width" height="$bar_height">
        <u8g2_scrolling_label name="location"
            x="0" y="0" width="192" height="$bar_height"
            bind_text="$title_subject" font="$font" />

        <u8g2_xbm name="wifi_icon"
            x="204" y="0" width="12" height="$bar_height"
            src="icon_wifi">
            <bind_flag_if_eq subject="$wifi_subject"
                ref_value="0" flag="hidden" />
        </u8g2_xbm>

        <u8g2_clock name="clock"
            x="216" y="0" width="40" height="$bar_height"
            format="HH:MM" font="clock_small_7" blink="true" />
    </view>
</component>
```

Components are **inlined by the code generator** — they produce no runtime overhead.

### Tier 4: Custom Widgets (XML + C)

For widgets requiring custom rendering algorithms, state machines, or complex data handling. Follow LVGL Pro's `<widget>` pattern. All files co-located in a single folder.

```
widgets/wd_service_list/
├── wd_service_list.xml          ← API definition + internal layout
├── wd_service_list.h            ← Public C header + data struct
├── wd_service_list.c            ← tick/logic implementation
└── wd_service_list_parser.c     ← XML attr → C setter bridge
```

---

## 5. The Fractal Architecture

> A screen is a layout of widgets driven by controller code.  
> A widget is a layout of elements driven by widget code.  
> **Same pattern, different scale.**

### Screen Level

```
screen_home.xml          ← Layout: positions widgets on the display
    ↕ bound to
board_controller.c       ← Logic: fetches data, updates subjects
```

### Widget Level

```
wd_progress_bar.xml      ← Layout: positions internal elements (track, fill, label)
    ↕ manipulated by
wd_progress_bar.c        ← Logic: lerp animation, percentage math
```

A custom widget's `<view>` declares its internal visual structure using the same XML primitives and built-in widgets as a screen. The C code manipulates those named elements programmatically:

```xml
<!-- widgets/wd_progress_bar/wd_progress_bar.xml -->
<widget>
    <api>
        <prop name="bind_value" type="subject_int" />
        <prop name="bind_text" type="subject" />
        <prop name="style" type="string" default="solid" />
        <prop name="animate_duration" type="int" default="500" />
    </api>

    <view>
        <u8g2_label name="message" x="0" y="0" width="100%" height="12"
                    align="center" bind_text="$bind_text" />
        <u8g2_box name="track" x="0" y="14" width="100%" height="2"
                  filled="false" />
        <u8g2_box name="fill" x="0" y="14" width="0" height="2"
                  filled="true" />
    </view>
</widget>
```

```c
// wd_progress_bar.c — manipulates named elements, never calls drawBox()
void wd_progress_bar_on_value_changed(wd_progress_bar_t* self, int value) {
    u8g2gl_element_t* fill = u8g2gl_get_element(self, "fill");
    int fill_width = (value * self->base.width) / 100;
    u8g2gl_set_width(fill, fill_width);
}
```

The framework handles clipping, state saving, dirty tracking, and partial refresh for all elements — at both the screen and widget level.

---

## 6. Data Binding

### 6.1 Subject System

Follows LVGL Pro's observer pattern. Subjects are global typed variables declared in `globals.xml`. When a subject's value changes, all bound widgets update automatically.

#### Subject Types

| Type | Declaration | Setter (generated) | Usage |
|---|---|---|---|
| `int` | `<int name="temperature" value="0" />` | `u8g2gl_set_temperature(22)` | Numeric values, percentages, counters |
| `string` | `<string name="station" value="" />` | `u8g2gl_set_station("Euston")` | Text labels, messages |
| `bool` | `<bool name="wifi" value="true" />` | `u8g2gl_set_wifi(false)` | Visibility flags, toggle states |
| `data` | `<data name="deps" type="T" />` | `u8g2gl_set_deps(&data)` | Complex/collection data (see §6.3) |

#### Sigil Conventions (from LVGL Pro)

| Sigil | Meaning | Example |
|---|---|---|
| `#name` | Constant reference | `font="#header_font"` |
| `$name` | Component prop reference | `text="$title"` |
| (none) | Subject reference in `bind_*` | `bind_text="station_name"` |

### 6.2 Binding Types

**Simple binding** — direct property:
```xml
<u8g2_label bind_text="station_name" />
<u8g2_label bind_text="temperature" bind_text-fmt="%d°C" />
<u8g2_progress_bar bind_value="loading_percent" />
```

**Conditional flag binding** — show/hide based on subject value:
```xml
<u8g2_xbm src="icon_wifi">
    <bind_flag_if_eq subject="wifi_connected" ref_value="0" flag="hidden" />
</u8g2_xbm>
```

Flag binding variants: `bind_flag_if_eq`, `bind_flag_if_not_eq`, `bind_flag_if_gt`, `bind_flag_if_lt`.

**C callback** — escape hatch for complex logic:
```xml
<u8g2_label name="status">
    <event_cb trigger="value_changed" callback="on_status_changed" />
</u8g2_label>
```

### 6.3 Collection / Complex Data Binding

For widgets that need structured data (tables, lists, formations), the `data` subject type holds a typed pointer to a C struct defined by the widget.

The **widget** defines its data contract:
```c
// wd_service_list.h
#define WD_SERVICE_LIST_MAX_ROWS 16
#define WD_SERVICE_LIST_MAX_COLS 6

typedef struct {
    const char* cells[WD_SERVICE_LIST_MAX_COLS];
} wd_service_list_row_t;

typedef struct {
    wd_service_list_row_t rows[WD_SERVICE_LIST_MAX_ROWS];
    int row_count;
} wd_service_list_data_t;
```

The **globals.xml** declares the subject:
```xml
<subjects>
    <data name="departures" type="wd_service_list_data" />
</subjects>
```

The **controller** fills the struct and notifies:
```c
wd_service_list_data_t data;
data.row_count = 5;
data.rows[0].cells[0] = "1";
data.rows[0].cells[1] = "14:30";
data.rows[0].cells[2] = "Manchester Piccadilly";
// ...
u8g2gl_set_departures(&data);  // Triggers widget observer
```

The **widget's C code** reacts to the change:
```c
void wd_service_list_on_data_changed(wd_service_list_t* self,
                                      const wd_service_list_data_t* data) {
    self->row_data = data;
    self->total_rows = data->row_count;
    self->top_row_index = 0;
    // Framework will trigger re-render
}
```

---

## 7. Pixel Positioning

All positioning in U8G2GL is **explicit pixel coordinates**. There is no flex layout, no auto-padding, no grid system.

### Rationale

On a 480×320 colour TFT, a 1px rounding error in flex layout is invisible. On a 128×64 monochrome dot-matrix:

- **Every pixel is deliberate.** No anti-aliasing, no sub-pixel rendering, no dithering.
- **Padding/gap calculations introduce rounding artifacts.** `gap: 3` on 5 items in 64px doesn't divide evenly.
- **Font metrics are coarse.** U8G2 fonts are 6px, 8px, 10px tall. No fractional pixel sizes.
- **Screen real estate is precious.** 2px of unwanted padding = 2.5% of an 80px display.

Professional monochrome display design (Flipper Zero, railway departure boards, industrial HMIs) uses absolute pixel positioning precisely because accuracy is paramount.

### Widget Positioning Attributes

Every widget and element accepts:

| Attribute | Type | Description |
|---|---|---|
| `x` | int | X coordinate (left edge) |
| `y` | int | Y coordinate (top edge) |
| `width` | int | Width in pixels |
| `height` | int | Height in pixels |

Multi-target portability (128×64 vs 256×64) is handled via separate screen XML files per `<target>`, not auto-layout.

---

## 8. Styling

Monochrome displays collapse the styling domain to a minimal property set:

| Property | Values | Description |
|---|---|---|
| `font` | Font name | Typography |
| `draw_color` | `0` (off), `1` (on), `xor` | Pixel value |
| `invert` | `true` / `false` | XOR region (selection highlighting) |
| `padding` | int (px) | Internal spacing |
| `border` | `true` / `false` | 1px outline |
| `radius` | int (px) | Rounded corners |
| `align` | `left` / `center` / `right` | Text alignment |
| `truncate` | `true` / `false` | Ellipsis on overflow |
| `font_mode` | `solid` / `transparent` | Text background mode |
| `bitmap_mode` | `solid` / `transparent` | XBM background mode |

Named styles follow LVGL Pro syntax:

```xml
<styles>
    <style name="header" font="small_9" draw_color="1" />
    <style name="selected" invert="true" />
</styles>

<u8g2_label text="Title">
    <style name="header" />
</u8g2_label>
```

**Not applicable to monochrome** (omitted from LVGL Pro): `bg_color`, `bg_opa`, `bg_grad_*`, `shadow_*`, `transform_scale`, `text_color`, part+state selectors, `<bind_style>`.

---

## 9. Widget Lifecycle

Every widget (built-in and custom) follows a three-phase lifecycle:

```
tick(currentMillis)
├── Update animation state (scroll position, blink timer, lerp progress)
├── Check subject change notifications
└── Set dirty flag if visual state changed

render(display)
├── Framework calls setClipWindow(x, y, x+w-1, y+h-1)
├── Framework wraps in U8g2StateSaver (RAII font/color/clip guard)
├── Widget draws its elements to the buffer
└── Framework restores state

renderAnimationUpdate(display, currentMillis)
├── Optional: for non-blocking partial refresh during blocking operations
├── If dirty → render() → updateDisplayArea(tileX, tileY, tileW, tileH)
└── Used for clock blink, scroll animation, progress bar fill
```

### Framework-Managed Concerns

| Concern | Mechanism |
|---|---|
| **Clip window** | Automatically set to widget bounding box before `render()` |
| **State save/restore** | `U8g2StateSaver` RAII guard wraps every render call |
| **Dirty tracking** | Subject observers set dirty flags; framework skips unchanged widgets |
| **Partial refresh** | `u8g2gl_partial_refresh(widget)` calculates tile coords from bounding box |
| **Font position mode** | `setFontPosTop()` is the global default |

---

## 10. Code Generation

### Pipeline

```
XML files → u8g2gl CLI → generated/ C files → C compiler → firmware
```

The CLI:
1. **Validates** all XML against the schema
2. **Resolves** component references (inline expansion)
3. **Compiles** fonts (BDF → C arrays)
4. **Converts** images (PNG → XBM → C arrays)
5. **Generates** C source files for each screen, plus subject getters/setters

### Generated Code Pattern

```c
// generated/ui_screen_home.c — DO NOT EDIT

#include "ui.h"
#include "ui_subjects.h"
#include "ui_fonts.h"

static u8g2gl_label_t lbl_station;
static u8g2gl_scrolling_label_t scrl_messages;
static wd_service_list_t list_departures;

void ui_screen_home_init(void) {
    u8g2gl_label_init(&lbl_station, 0, 0, 192, 11);
    u8g2gl_label_set_font(&lbl_station, &font_small_9);
    u8g2gl_label_bind_text(&lbl_station, &subject_station_name);
    // ...
}

void ui_screen_home_tick(uint32_t ms) {
    u8g2gl_label_tick(&lbl_station, ms);
    u8g2gl_scrolling_label_tick(&scrl_messages, ms);
    wd_service_list_tick(&list_departures, ms);
}

void ui_screen_home_render(U8G2* display) {
    u8g2gl_label_render(&lbl_station, display);
    u8g2gl_scrolling_label_render(&scrl_messages, display);
    wd_service_list_render(&list_departures, display);
    // Static primitives inlined
    u8g2_DrawHLine(display, 0, 11, 256);
    u8g2_DrawHLine(display, 0, 51, 256);
}
```

---

## 11. Naming Conventions

Aligned with LVGL Pro, substituting the `u8g2_` prefix:

| Convention | U8G2GL | LVGL Pro |
|---|---|---|
| Built-in widget tags | `u8g2_label`, `u8g2_box` | `lv_label`, `lv_obj` |
| Custom widget prefix | `wd_` | `wd_` |
| Subject names | `subject_*` (by convention) | `subject_*` |
| Constants | `#const_name` | `#const_name` |
| Component props | `$prop_name` | `$prop_name` |
| Screen files | `screen_*.xml` | `screen_*.xml` |
| Component dirs | `components/name/name.xml` | `components/name/name.xml` |
| Widget dirs | `widgets/wd_name/wd_name.xml` | `widgets/wd_name/wd_name.xml` |
| Generated files | `ui_screen_*.c` | Similar |

---

## 12. U8G2 Primitives Foundation

Every visual element in U8G2GL ultimately compiles to calls from this API:

### Geometry
`drawBox`, `drawFrame`, `drawRBox`, `drawRFrame`, `drawLine`, `drawHLine`, `drawVLine`, `drawCircle`, `drawDisc`, `drawEllipse`, `drawFilledEllipse`, `drawTriangle`, `drawPixel`

### Text
`drawStr`, `drawUTF8`, `drawGlyph`, `drawButtonUTF8`

### Bitmaps
`drawXBMP` (PROGMEM — preferred), `drawXBM` (RAM)

### State Management
`setDrawColor`, `setFont`, `setFontMode`, `setBitmapMode`, `setClipWindow`, `setMaxClipWindow`, `setFontPosTop`

### Font Metrics
`getStrWidth`, `getUTF8Width`, `getMaxCharWidth`, `getMaxCharHeight`, `getAscent`, `getDescent`

### Display Control
`clearBuffer`, `sendBuffer`, `firstPage`/`nextPage`, `updateDisplayArea`

### Key Implementation Notes

- **`setFontPosTop()`** is the framework default — widget `y` coordinates are top-left, not baseline.
- **`setDrawColor(2)` (XOR mode)** enables selection highlighting and blink effects without separate render paths.
- **`drawXBMP`** (PROGMEM) is always preferred over `drawXBM` (RAM) — the code generator emits `PROGMEM` arrays.
- **`updateDisplayArea`** uses **8-pixel tile coordinates**, not pixel coordinates — the framework provides a helper.
- **`U8g2StateSaver`** (RAII guard saving font, draw colour, and clip window) wraps every widget render call.

---

## 13. Screen Navigation

```xml
<u8g2_label name="settings_btn" text="Settings">
    <screen_load_event screen="screen_settings" trigger="button_press" />
</u8g2_label>
```

### Lifecycle Hooks

Each screen has generated `init`, `activate`, `deactivate`, `tick`, and `render` functions:

```c
void ui_screen_home_init(void);        // Called once at boot
void ui_screen_home_activate(void);    // Called when screen becomes active
void ui_screen_home_deactivate(void);  // Called when switching away
void ui_screen_home_tick(uint32_t ms); // Called every loop iteration
void ui_screen_home_render(U8G2* d);   // Called to draw the frame
```

### Trigger Events

| Trigger | Description |
|---|---|
| `button_press` | Short press of navigation button |
| `button_long_press` | Long press (>1 second) |
| `encoder_click` | Rotary encoder button press |
| `encoder_cw` / `encoder_ccw` | Rotary encoder rotation |
| `value_changed` | Subject value changed |
| `timer` | Periodic timer expired |

No touch events — monochrome displays rarely have touch input.

---

## 14. Phased Delivery

### Phase 1: CLI + Schema + Code Generator
- XML schema definition (XSD)
- `u8g2gl` CLI tool: validate → generate C
- Built-in widgets: `u8g2_label`, `u8g2_box`, `u8g2_line`, `u8g2_xbm`
- Subject system: `int`, `string`, `bool`
- Simple binding: `bind_text`, `bind_value`
- Font management: BDF → C compilation

### Phase 2: Animation + Components + Custom Widgets
- Animated built-in widgets: `u8g2_scrolling_label`, `u8g2_clock`, `u8g2_progress_bar`
- Component system: `<component>`, `<api>`, `<prop>`, `<slot>`
- Custom widget system: `<widget>` + C bridge
- `data` subjects for collection binding
- Conditional flag binding: `bind_flag_if_*`
- Image management: XBM + PNG→XBM conversion

### Phase 3: Visual Editor + Preview
- Web-based canvas preview (JS renderer of monochrome primitives)
- Drag-and-drop widget placement
- Live property editing
- Font preview and glyph browser
- Export to XML

---

## Appendix A: Prior Art

### Own Projects
- **departures-board** — Working JSON→C++ layout system with widget hierarchy, `@designer_prop` annotations, and layout schema. Proof of concept for U8G2GL.
- **esp32-app-framework** — Migrated to LVGL Pro. First-hand experience with LVGL Pro's XML/binding/editor workflow.

### Ecosystem
- **Lopaka** (~1700 stars) — Visual editor for U8G2, generates flat procedural code. No framework, no components.
- **UiUiUi** — Zero-heap static widget system for U8G2. C++ runtime, no declarative layer.
- **PixelUI** — Modern C++20 widget system. Development paused, no visual tooling.
- **Flipper Zero** — Most mature monochrome navigation architecture. Canvas→Viewport→View model.
- **tcMenu Designer** — Java-based visual editor for embedded menus. Generates C++ code.

### Unique Position
No existing project combines declarative XML definition, AOT code generation, reactive data binding, and a component/widget system for U8G2 monochrome displays. U8G2GL occupies a genuinely empty niche.
