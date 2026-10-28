# U8G2GL Widget Design Assessment

> [!WARNING]
> **Frozen research input — not current design.** Written before design spec v0.2. Where this conflicts with [design_spec.md](../design_spec.md), the spec wins. Notably superseded here: the `wd_*_xml_parser.c` bridge file (removed — there is no runtime XML path) and C-style APIs (generated code is C++).
>
> **The tier model in this document is withdrawn ([D-18], 2026-09-11).** There are no longer four tiers, no `<component>` vs `<widget>` distinction, and no "always inlined" primitive category — there is one element vocabulary, and whether an instance becomes an object is a generator outcome. The Tier Summary Table and the Layered Architecture diagram below are historical.
>
> **One specific argument in this document is wrong** and was repeated downstream before being caught — see the correction under `wd_train_formation`. The per-widget *complexity analysis* remains useful; its *stated reasons* for tier placement should not be trusted without checking against the source.

A widget-by-widget analysis of how the departures-board widgets translate into U8G2GL's emerging design, using LVGL Pro's `<component>` vs `<widget>` distinction.

---

## The Key Question: Component or Widget?

Following LVGL Pro's pattern, the decision is:

| | `<component>` (Pure XML) | `<widget>` (XML + C) |
|---|---|---|
| **Layout** | Composed from built-in widgets via XML | Custom `render()` with direct U8G2 primitives |
| **Logic** | None — static layout, bound via subjects | Custom `tick()` with state machines, animation math |
| **C code** | ❌ None required | ✅ `.h` + `.c` + `_xml_parser.c` |
| **When to use** | Layout composition only | Custom rendering, algorithms, animation, data structures |

> [!IMPORTANT]
> The critical insight from reading every widget implementation: **the dividing line is animation and custom draw logic.** If a widget just arranges sub-widgets and binds data, it's a component. If it has a `tick()` state machine, custom pixel math, or renders things that can't be expressed as sub-widget composition — it's a custom widget.

---

## Tier 1: Built-in Primitives (Framework-Provided)

These ship with U8G2GL. No user code required. The framework implements them.

### `u8g2_label` ← [labelWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/labelWidget.cpp)

**Current complexity**: ~85 lines of C++. Simple — just `drawText()` with alignment and optional truncation.

**Logic anatomy**:
```
tick()   → empty (no animation)
render() → StateSaver → setFont → drawText(align, truncate)
```

**U8G2GL design**: Built-in widget. No custom code needed.

```xml
<u8g2_label name="status" x="10" y="26" width="236" height="15"
    text="No services found."
    font="tall_12"
    align="center"
    truncate="true" />

<!-- Or with data binding -->
<u8g2_label name="station" x="0" y="0" width="192" height="11"
    bind_text="station_name"
    font="small_9" />
```

**XML properties**: `text`, `font`, `align` (left/center/right), `truncate` (bool), `bind_text`, `bind_text-fmt`

---

### `u8g2_xbm` ← [weatherWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/weatherWidget.cpp) (simplified)

**Current complexity**: ~82 lines. Fetches an icon character from app state and draws a glyph.

**U8G2GL design**: Built-in widget for XBM bitmaps. The glyph-from-icon-font case is a separate built-in `u8g2_glyph`.

```xml
<u8g2_xbm name="logo" x="0" y="0" width="32" height="32"
    src="icon_logo" />

<u8g2_glyph name="weather" x="192" y="0" width="12" height="11"
    bind_glyph="weather_icon_char"
    font="weather_icons_11" />
```

---

### Static primitives: `u8g2_line`, `u8g2_box`, `u8g2_circle`, `u8g2_triangle`

These compile to direct U8G2 API calls — no widget struct, no tick, no state.

```xml
<u8g2_line x1="0" y1="11" x2="256" y2="11" />
<u8g2_box x="0" y="0" width="256" height="12" filled="false" radius="3" />
```

---

## Tier 2: Built-in Widgets with Animation (Framework-Provided)

These have `tick()` state machines and animation logic. They're too complex to express as XML composition, but they're generic enough to ship with the framework.

### `u8g2_scrolling_label` ← [scrollingTextWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/scrollingTextWidget.cpp)

**Current complexity**: ~195 lines. Substantial — marquee scroll math, layout invalidation, initial delay, loop detection, partial HW refresh.

**Logic anatomy**:
```
tick():
  ├── Initial 3-second delay before scrolling starts
  ├── If !needsScroll → static dwell timer → scrollFinished after 5s
  └── If needsScroll → scrollX++ every 40ms (~25 FPS)
       └── When scrollX > messageWidth + 30 → wrap to -maxW

render():
  ├── needsLayout? → measure width, decide scroll vs static
  ├── blankArea() → clear bounding box
  ├── If scrolling → setClipWindow + drawUTF8(x - scrollX)
  └── If static → drawText(CENTER)

renderAnimationUpdate():
  ├── tick() → check if scrollX changed
  └── If changed → render() + updateDisplayArea() (partial HW refresh)
```

**Why it must be a built-in widget, not a component**: The scroll math, clip window management, layout invalidation on text change, and partial refresh coordination can't be expressed in XML.

**U8G2GL design**: Built-in widget with these XML properties:

```xml
<u8g2_scrolling_label name="messages"
    x="0" y="53" width="256" height="12"
    bind_text="service_message"
    font="small_9"
    scroll_speed="25"
    initial_delay="3000"
    static_dwell="5000" />
```

**XML properties**: All of `u8g2_label` plus `scroll_speed` (fps), `initial_delay` (ms), `static_dwell` (ms before `scrollFinished` fires for static text).

---

### `u8g2_progress_bar` ← [progressBarWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/progressBarWidget.cpp)

**Current complexity**: ~200 lines. Animation interpolation (lerp), stipple pattern rendering, deduplication, message+percentage text.

**Logic anatomy**:
```
tick():
  └── If animating → lerp(startPercent, targetPercent, elapsed/duration)

render():
  ├── blankArea()
  ├── drawText(message + optional "%d%%")  ← centered above bar
  └── Checkered stipple loop:
       for each pixel in fill width:
         draw alternating pixels in a checkerboard pattern (simulates greyscale)

renderAnimationUpdate():
  └── If percent changed OR text changed → render() + updateDisplayArea()
```

**Why it must be built-in**: The checkerboard stipple rendering is custom pixel-level drawing that can't be expressed as sub-widget composition. The animation lerp is also internal.

**U8G2GL design**:

```xml
<u8g2_progress_bar name="loading"
    x="10" y="30" width="236" height="20"
    bind_value="loading_percent"
    bind_text="loading_message"
    bind_text-fmt="%s %d%%"
    font="small_9"
    style="stipple"
    animate_duration="500" />
```

**XML properties**: `bind_value` (int subject, 0-100), `bind_text`, `bind_text-fmt`, `font`, `style` (solid/stipple), `animate_duration` (ms, 0 = snap).

---

### `u8g2_clock` ← [clockWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/clockWidget.cpp)

**Current complexity**: ~214 lines. The most complex rendering logic of any widget — dual fonts, per-segment width alignment, colon blink animation, partial HW refresh for the colon area.

**Logic anatomy**:
```
tick():
  └── Every 500ms → toggle showColon (blink state)

render():
  ├── StateSaver
  ├── Format time → "HH", "MM", "SS" strings
  ├── Measure max glyph widths ("00") for monospace alignment
  ├── Calculate total footprint and alignment offset
  ├── Vertical centering: (renderH - fontHeight) / 2
  ├── If HH_MM_SS + secondaryFont → align baselines of two different font sizes
  ├── blankArea()
  ├── Draw hours (right-aligned within max "00" width)
  ├── Draw colon (conditional on showColon)
  ├── Draw minutes (right-aligned within max "00" width)
  └── Draw seconds with secondary font (optional)

renderAnimationUpdate():
  └── If colon changed OR minute changed → render() + updateDisplayArea()
```

**Why it must be built-in**: The pixel-level alignment math for monospace digit spacing, dual-font baseline alignment, and blink animation are all custom rendering that XML can't express. This is exactly the kind of widget that justifies having a C implementation.

**U8G2GL design**:

```xml
<u8g2_clock name="sys_clock"
    x="216" y="0" width="40" height="11"
    format="HH:MM"
    font="clock_8"
    secondary_font="clock_small_7"
    blink="true"
    align="left"
    bind_time="system_time" />
```

**XML properties**: `format` (HH:MM / HH:MM:SS), `font`, `secondary_font`, `blink` (bool), `align`, `bind_time` (time subject).

> [!NOTE]
> The clock widget shows a pattern that applies to several built-in widgets: **the XML declares configuration, the C code handles all the pixel math.** The user never writes rendering code — they just set properties in XML.

---

## Tier 3: Pure-XML Components (User-Created)

These are compositions of built-in widgets. No C code. LVGL Pro's `<component>` pattern.

### `status_bar` ← [layoutDefault.cpp lines 13-25](file://~/Documents/Projects/departures-board/modules/displayManager/boards/nationalRailBoard/layouts/layoutDefault.cpp#L13-L25)

**Current implementation**: Not a widget at all — it's just 12 lines of coordinate setup in the layout constructor, placing `locationAndFilters`, `weather`, `wifiWarning`, and `sysClock` side by side.

**U8G2GL design**: A pure-XML component that composes built-in widgets:

```xml
<!-- components/status_bar/status_bar.xml -->
<component>
    <api>
        <prop name="title_subject" type="subject" default="" help="Subject for station name" />
        <prop name="weather_subject" type="subject" default="" help="Subject for weather icon" />
        <prop name="wifi_subject" type="subject" default="" help="Subject for wifi state" />
        <prop name="time_subject" type="subject" default="" help="Subject for system time" />
        <prop name="total_width" type="int" default="256" />
        <prop name="bar_height" type="int" default="11" />
        <prop name="font" type="font" default="small_9" />
    </api>

    <view width="$total_width" height="$bar_height">
        <u8g2_scrolling_label name="location"
            x="0" y="0" width="192" height="$bar_height"
            bind_text="$title_subject" font="$font" />

        <u8g2_glyph name="weather_icon"
            x="192" y="0" width="12" height="$bar_height"
            bind_glyph="$weather_subject" font="weather_icons_11" />

        <u8g2_xbm name="wifi_icon"
            x="204" y="0" width="12" height="$bar_height"
            src="icon_wifi">
            <bind_flag_if_eq subject="$wifi_subject" ref_value="0" flag="hidden" />
        </u8g2_xbm>

        <u8g2_clock name="clock"
            x="216" y="0" width="40" height="$bar_height"
            format="HH:MM" font="clock_small_7" blink="true"
            bind_time="$time_subject" />
    </view>
</component>
```

**Usage in a screen:**
```xml
<status_bar
    title_subject="station_name"
    weather_subject="weather_icon"
    wifi_subject="wifi_connected"
    time_subject="system_time"
    total_width="256" />
```

**Key insight**: The `locationAndFiltersWidget` (95 lines of C++ header, ~150 lines of C++ implementation) becomes **zero C code** — it's just a component composing a `u8g2_scrolling_label` and a `u8g2_label`. The hybrid fixed+scrolling logic in the original is actually two separate widgets placed side by side.

---

### `no_data_message` ← [labelWidget with conditional visibility](file://~/Documents/Projects/departures-board/modules/displayManager/boards/nationalRailBoard/layouts/layoutDefault.cpp#L39-L43)

**Current implementation**: A `labelWidget` that's hidden by default and shown by the controller when there's no data.

**U8G2GL design**: No component needed — just a `u8g2_label` with a flag binding:

```xml
<u8g2_label name="no_data" x="10" y="26" width="236" height="15"
    text="No services found." font="tall_12" align="center">
    <bind_flag_if_eq subject="has_data" ref_value="1" flag="hidden" />
</u8g2_label>
```

The entire concept of "show this when there's no data" becomes **one XML attribute** instead of controller code.

---

### `wifi_overlay` ← [wifiStatusWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/wifiStatusWidget.hpp)

**Current complexity**: ~68 lines header + implementation. Monitors WiFi state, shows a blinking disconnection icon, tracks RSSI categories for signal strength bars.

**Decision: Component or Widget?**

The blinking and RSSI-to-bars conversion involve tick logic. But if we have a `bind_flag_if_eq` and an `u8g2_xbm` with multiple source states, much of this can be declarative:

```xml
<!-- Simple case: just show/hide an icon based on wifi state -->
<u8g2_xbm name="wifi_warning" x="204" y="0" width="12" height="11"
    src="icon_wifi_off">
    <bind_flag_if_eq subject="wifi_connected" ref_value="1" flag="hidden" />
</u8g2_xbm>
```

For the full RSSI bars display with blinking, it would need a **custom widget** (Tier 4). But the simple connected/disconnected case is just a flag binding — **zero code**.

---

## Tier 4: Custom C-Backed Widgets (User-Created)

These have custom rendering algorithms, state machines, or data structures that XML composition cannot express. They follow LVGL Pro's `<widget>` pattern: XML definition + C implementation + XML parser bridge.

### `wd_service_list` ← [serviceListWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/serviceListWidget.cpp)

**Current complexity**: ~294 lines. The most substantial widget — columnar data rendering, paginated scrolling with dwell timers, page-reset sweep animation, row slicing (skip/max).

**Logic anatomy**:
```
State:
  ├── columns[6] — ColumnDef array
  ├── rowData[16][6] — string pointer matrix
  ├── topRowIndex, currentYOffset — pagination position
  ├── isAnimating, isPageResetAnimating — animation state machine
  └── scrollDwellMs, scrollDurationMs — timing configuration

tick():
  ├── If all rows fit on one page → no-op
  ├── Dwell timer → wait scrollDwellMs between pages
  ├── If at end of data → trigger page-reset sweep animation
  └── Animation lerp: currentYOffset = lerp(0, 13px, elapsed/duration)

render():
  ├── StateSaver + setClipWindow
  ├── Calculate rowsPerPage from height / 13
  ├── For each visible row + 1 extra during animation:
  │     drawRow() → iterate columns → drawText(align, truncate) per cell
  └── Render at y - currentYOffset (animated offset)

Data ingestion:
  ├── clearRows() — reset before new data
  ├── addRow(const char**) — append with skip/max filtering
  └── Row storage is pointer-only (no copies)
```

**Why it must be a custom widget**: Column layout math, paginated scroll animation, row-level rendering loop, and data ingestion API are all custom C logic.

**U8G2GL design** — three files following LVGL Pro convention:

**`widgets/wd_service_list/wd_service_list.xml`**:
```xml
<widget>
    <api>
        <prop name="font" type="font" default="" />
        <prop name="skip" type="int" default="0" help="Rows to skip from data source" />
        <prop name="max" type="int" default="-1" help="Max rows to ingest (-1 = unlimited)" />
        <prop name="scroll_dwell" type="int" default="5000" help="Dwell time between pages (ms)" />
        <prop name="scroll_duration" type="int" default="1000" help="Scroll animation duration (ms)" />
        <prop name="bind_data" type="subject" help="Data subject for row content" />

        <!-- Column definitions as child elements -->
        <element name="column" access="add" type="u8g2_obj" help="Column definition">
            <arg name="width" type="int" />
            <arg name="align" type="string" />
        </element>
    </api>

    <view extends="u8g2_obj" />
</widget>
```

**`widgets/wd_service_list/wd_service_list.h`**:
```c
// Public API — called by generated screen code and user controllers
typedef struct wd_service_list_t wd_service_list_t;

wd_service_list_t* wd_service_list_create(int x, int y, int w, int h);
void wd_service_list_set_font(wd_service_list_t* list, const uint8_t* font);
void wd_service_list_add_column(wd_service_list_t* list, int width, int align);
void wd_service_list_set_data_limits(wd_service_list_t* list, int skip, int max);
void wd_service_list_clear_rows(wd_service_list_t* list);
void wd_service_list_add_row(wd_service_list_t* list, const char** data);
void wd_service_list_tick(wd_service_list_t* list, uint32_t ms);
void wd_service_list_render(wd_service_list_t* list, U8G2* display);
```

**`widgets/wd_service_list/wd_service_list_xml_parser.c`** (bridge):
```c
void* wd_service_list_xml_create(u8g2gl_parser_state_t* state, const char** attrs) {
    int x = u8g2gl_attr_int(attrs, "x", 0);
    int y = u8g2gl_attr_int(attrs, "y", 0);
    int w = u8g2gl_attr_int(attrs, "width", -1);
    int h = u8g2gl_attr_int(attrs, "height", -1);
    return wd_service_list_create(x, y, w, h);
}

void wd_service_list_xml_apply(u8g2gl_parser_state_t* state, const char** attrs) {
    wd_service_list_t* list = u8g2gl_state_get_item(state);
    for (int i = 0; attrs[i]; i += 2) {
        if (streq("font", attrs[i]))
            wd_service_list_set_font(list, u8g2gl_resolve_font(attrs[i+1]));
        else if (streq("skip", attrs[i]))
            wd_service_list_set_data_limits(list, atoi(attrs[i+1]), -1);
        // ...
    }
}
```

**Screen XML usage** — identical to a built-in widget:
```xml
<wd_service_list name="departures"
    x="0" y="13" width="256" height="38"
    font="tall_12" skip="0" max="1"
    scroll_dwell="5000" scroll_duration="1000"
    bind_data="departures">
    <column width="24" align="left" />
    <column width="40" align="left" />
    <column width="120" align="left" />
    <column width="16" align="center" />
    <column width="55" align="right" />
</wd_service_list>
```

---

### `wd_train_formation` ← [trainFormationWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/trainFormationWidget.cpp)

**Current complexity**: ~173 lines. The most visually custom widget — draws train carriages as rounded rectangles with nose cones, dividers, and a tri-modal content display (number / facilities icons / loading bars).

**Logic anatomy**:
```
State:
  ├── Mode enum: NUMBER | FACILITIES | LOADING (cycles every 3s)
  ├── formations[] — NrCoachFormation struct array (external data)
  ├── scrollOffset — marquee X for long trains
  └── isMarquee — true if train wider than widget

tick():
  ├── Calculate carriageWidth = availableWidth / numCoaches
  ├── If carriageWidth < MIN → marquee mode, scroll every 50ms
  └── If static → cycle mode every 3 seconds

render():
  ├── Calculate carriage dimensions and positioning
  ├── drawRFrame() — continuous bounding frame for all carriages
  ├── drawTriangle() — nose cone (right-angled triangle)
  ├── drawLine() — bumper line
  ├── drawLine() × N — vertical dividers between carriages
  └── Per carriage, switch on mode:
       ├── NUMBER → drawText(coachNumber, CENTER)
       ├── FACILITIES → drawText(icon glyph, CENTER, iconFont)
       └── LOADING → drawBox(fillHeight proportional to loading %)
```

**Why it must be a custom widget**: This is pure custom rendering — drawing train shapes from primitives, state machine animation, variable-width carriage layout based on data count. There is no XML composition that could express "draw a nose cone triangle overlapping a rounded rectangle frame."

> [!CAUTION]
> **The sentence above is wrong, and was corrected on 2026-09-11.**
>
> Reading the actual implementation, `trainFormationWidget::render()` uses only `drawRFrame`, `drawTriangle`, `drawLine`, `drawBox` and `drawText` — every one of them already in the primitive set. "A nose cone triangle overlapping a rounded rectangle frame" is three tags. The drawing vocabulary was never the obstacle.
>
> **The real reason is that the structure depends on runtime data.** `numCoaches` arrives at run time and determines the divider count, the cell count and the total width; `carriageWidth = availableWidth / numCoaches` is clamped, and the clamp *changes mode* into marquee; mode cycles on a `tick()` state machine; and the facilities mode selects from a variable-length icon array built at render time. A `<view>` is resolved at build time, so it can express "three carriages" but never "N carriages".
>
> **The correct line is static structure versus data-driven structure** (design_spec §6.5), not primitive vocabulary versus custom pixel math. That line is sharper, testable, and concedes what this document did not: the nose-cone assembly and a single carriage cell *are* designable, and only the repetition and the mode machine need C++. See also [Q-8] on repeaters, which would shrink the C++ residue further.

**U8G2GL design**:

**`widgets/wd_train_formation/wd_train_formation.xml`**:
```xml
<widget>
    <api>
        <prop name="bind_data" type="subject" help="Formation data subject" />
        <prop name="mode_interval" type="int" default="3000"
              help="Milliseconds between display mode cycling" />
        <prop name="min_coach_width" type="int" default="15" />
        <prop name="max_coach_width" type="int" default="20" />
    </api>
    <view extends="u8g2_obj" />
</widget>
```

The C implementation (`wd_train_formation.c`) contains the entire train-drawing algorithm — it's inherently imperative, domain-specific code. The XML only declares configuration and the data binding subject.

**Screen usage**:
```xml
<wd_train_formation name="train"
    x="0" y="52" width="256" height="12"
    bind_data="coach_formation"
    mode_interval="3000" />
```

---

### `wd_scrolling_message_pool` ← [scrollingMessagePoolWidget](file://~/Documents/Projects/departures-board/modules/displayManager/widgets/scrollingMessagePoolWidget.hpp)

**Current complexity**: Extends `scrollingTextWidget` — adds multi-pool message rotation with interleaving.

**Logic anatomy**:
```
Inherits: scrollingTextWidget (all marquee rendering)
Adds:
  ├── pools[] — vector of MessagePool pointers
  ├── tick() override: when scrollFinished → loadNextMessage()
  └── loadNextMessage(): cycle through pools, interleave a static message between pool items
```

**U8G2GL design**: Custom widget that extends the built-in `u8g2_scrolling_label`:

```xml
<widget>
    <api>
        <prop name="bind_messages" type="subject" help="Message array subject" />
        <prop name="interleave_text" type="string" default=""
              help="Static text shown between messages" />
    </api>
    <view extends="u8g2_scrolling_label" />
</widget>
```

The `extends="u8g2_scrolling_label"` is important — the C code inherits all the scroll rendering and only adds the message rotation logic in `tick()`.

---

## Tier Summary Table

| Widget | Tier | Type | Lines of C (current) | Lines of C (U8G2GL) | Lines of XML |
|---|---|---|---|---|---|
| `labelWidget` | 1 - Built-in | `u8g2_label` | 85 | 0 (framework) | 3 |
| `weatherWidget` (icon) | 1 - Built-in | `u8g2_glyph` | 82 | 0 (framework) | 2 |
| Line/Box primitives | 1 - Primitive | `u8g2_line` etc. | N/A | 0 | 1 |
| `scrollingTextWidget` | 2 - Built-in | `u8g2_scrolling_label` | 195 | 0 (framework) | 4 |
| `progressBarWidget` | 2 - Built-in | `u8g2_progress_bar` | 200 | 0 (framework) | 4 |
| `clockWidget` | 2 - Built-in | `u8g2_clock` | 214 | 0 (framework) | 4 |
| Status bar | 3 - Component | `<component>` | ~130 (was C++) | 0 | ~25 |
| No-data message | 3 - Component | flag binding | ~10 (controller) | 0 | 3 |
| Wifi overlay (simple) | 3 - Component | flag binding | ~68 | 0 | 4 |
| `serviceListWidget` | 4 - Custom Widget | `<widget>` + C | 294 | ~200 | 12 |
| `trainFormationWidget` | 4 - Custom Widget | `<widget>` + C | 173 | ~150 | 6 |
| `scrollingMessagePoolWidget` | 4 - Custom Widget | `<widget>` + C | ~100 | ~60 | 5 |

---

## The Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Screen XML                                │
│  screen_home.xml — pixel-positioned widget tree              │
│  Uses: built-ins, components, custom widgets interchangeably │
├─────────────────────────────────────────────────────────────┤
│              Components (Pure XML)                           │
│  components/status_bar/status_bar.xml                        │
│  Compose built-in widgets via <api> props and pixel coords   │
│  NO C code — the code generator inlines them                 │
├─────────────────────────────────────────────────────────────┤
│          Custom Widgets (XML + C)                            │
│  widgets/wd_service_list/wd_service_list.xml + .h + .c       │
│  XML declares API, C implements tick/render                  │
│  Parser bridge connects XML attrs → C setters                │
├─────────────────────────────────────────────────────────────┤
│          Built-in Widgets (Framework C)                      │
│  u8g2_label, u8g2_scrolling_label, u8g2_clock,              │
│  u8g2_progress_bar, u8g2_xbm, u8g2_glyph, u8g2_switch      │
│  Ship with framework — user configures via XML only          │
├─────────────────────────────────────────────────────────────┤
│          Widget Base (iGfxWidget equivalent)                 │
│  tick(ms) / render(display) / renderAnimationUpdate(display) │
│  x, y, width, height, isVisible                             │
│  Subject binding infrastructure                              │
│  U8g2StateSaver RAII guard                                   │
├─────────────────────────────────────────────────────────────┤
│          U8G2 Drawing Primitives                             │
│  drawStr, drawBox, drawXBMP, drawLine, drawTriangle,        │
│  setFont, setClipWindow, setDrawColor, updateDisplayArea    │
├─────────────────────────────────────────────────────────────┤
│          Hardware (SPI/I2C → OLED/LCD)                       │
│  SSD1306, SSD1322, ST7920, etc.                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Patterns Emerging from the Assessment

### 1. The Deduplication Pattern
Every animating widget in the departures-board checks "did my state actually change?" before redrawing. The clock checks `oldColon != showColon`, the progress bar checks `currentPercent != oldPercent`, the service list tracks `wasAnimating`. This must be **framework infrastructure**, not per-widget boilerplate.

### 2. The Partial Refresh Pattern
Widgets that animate (`renderAnimationUpdate`) all follow the same sequence: `render()` to buffer → `updateDisplayArea(tileX, tileY, tileW, tileH)` to hardware. The framework should provide a helper: `u8g2gl_partial_refresh(widget)` that calculates the tile coordinates from the widget's bounding box.

### 3. The Clip-Render-Restore Pattern
Every widget does: `U8g2StateSaver` → `setClipWindow(x, y, x+w-1, y+h-1)` → draw → destructor restores. This should be automatic — the framework calls `setClipWindow` before invoking the widget's `render()`.

### 4. Data Binding Replaces Controller Push
Currently: `board.populateServices()` → `widget.clearRows()` → `widget.addRow()` × N. With subjects: the controller calls `u8g2gl_set_departures(data)` once, and the custom widget's observer callback handles the rest. The board controller shrinks dramatically.

### 5. XML Defines What, C Defines How
The service list's column definitions, scroll timing, and data limits are all pure configuration (XML). The actual row rendering loop, pagination math, and animation lerp are algorithms (C). The boundary between XML and C is clean: **configuration vs computation**.
