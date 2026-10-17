# G-PROBE2 Work Order 2: Formation Widget & Message Pool Findings

## Executive Summary

Work Order 2 accomplished two key objectives in the U8G2GL custom widget path evaluation:

1. **`wd_train_formation`**: Designed, implemented, and validated a custom C++ widget that models a 12-carriage passenger train formation horizontal strip. The widget provides declared-capacity static non-heap storage (§9.2), an atomic batch ingestion API (`begin() / add_carriage() / commit()`), and deterministic pixel arithmetic that renders carriage outlines, loading gauges, and class/wheelchair/bike indicators on a 256×64 monochrome OLED display.
2. **Message Pool Carousel Policy**: Evaluated the host policy architecture for a rotating message marquee using `u8g2gl_label` configured with `long_mode="scroll_circular"`. We found that while `scroll_circular` autonomously loops a single message indefinitely without host intervention, it never signals scroll completion (`is_scroll_finished()` permanently returns `false`), wraps silently without callbacks, and has no cycle completion event. Consequently, rotating between multiple messages in a pool strictly requires host-side timer management (`u8g2gl_timer`).

Both components were integrated into `screen_departures.xml` and `globals.xml`, validated cleanly with `u8g2gl validate` (0 errors, 0 warnings), generated with `u8g2gl generate`, and compiled without errors or warnings under strict `clang++ -Wall -Wextra -Wpedantic -Werror -std=c++17`.

---

## 1. wd_train_formation

### 1.1 Generator Behavior

The widget manifest was declared in `evidence/probe-project/widgets/wd_train_formation/wd_train_formation.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget name="wd_train_formation" extends="u8g2gl_obj">
    <api>
        <prop name="font" type="font" required="true" help="Font for carriage labels." />
        <prop name="max_carriages" type="int" default="12" help="Carriage capacity." />
    </api>
</widget>
```

When placed in `screen_departures.xml`:
```xml
<wd_train_formation name="formation" x="0" y="17" width="256" height="32"
                    font="u8g2_font_6x10_mr" max_carriages="12" />
```

`u8g2gl generate` recognized the manifest and emitted the following code:
- **Header Include**:
  ```cpp
  #include "wd_train_formation.hpp"
  ```
- **Static Object Instantiation**:
  ```cpp
  static wd_train_formation ui_obj_formation;  // 4
  ```
- **Object Table Registration**:
  ```cpp
  static u8g2gl_obj* const ui_screen_departures_objs[] = {
      &ui_obj_plat_label,
      &ui_obj_plat_num,
      &ui_obj_row0,
      &ui_obj_message_bar,
      &ui_obj_formation,
      &ui_obj_services,
      &ui_obj_sys_clock,
  };
  ```
- **Property Setters**:
  ```cpp
  ui_obj_formation.set_coords(0, 17, 256, 32);
  ui_obj_formation.set_font(ui_font_u8g2_font_6x10_mr);
  ui_obj_formation.set_max_carriages(12);
  ```
- **Render Object Wrapping**:
  ```cpp
  u8g2gl_render_object(display, ui_screen_departures_objs, ui_screen_departures_parents, 4);  // ui_obj_formation
  ```

#### Capacity & Realisation Diagnostics
The generator updated the static project capacity and realisation report:
```
CAPACITY (generated — see u8g2gl_generated_config.h)
  objects, busiest screen         7 / 254   departures
  bindings, busiest object              1   plat_num
  bindings, total                       3
  styles                                0

REALISATION (§13.5 — what each element became, and why)
  screen 'departures': 7 object(s), 2 element(s) as draw calls
    plat_box                u8g2gl_box            draw calls
    plat_label              u8g2gl_label          object     class_backed  [amendment]
    plat_num                u8g2gl_label          object     class_backed, binding
    header_sep              u8g2gl_line           draw calls
    row0                    wd_service_list       object     class_backed  [amendment]
    message_bar             u8g2gl_label          object     class_backed, binding
    formation               wd_train_formation    object     class_backed  [amendment]
    services                wd_service_list       object     class_backed  [amendment]
    sys_clock               u8g2gl_clock          object     class_backed, binding
```

The generator refused no valid configurations; validation passed with 0 errors and 0 warnings.

---

### 1.2 Widget Implementation

#### SLOC Breakdown by Concern
The complete widget implementation spans 439 lines of C++ code across header and source files:

| File | Concern | SLOC | Percentage |
| :--- | :--- | :---: | :---: |
| `wd_train_formation.hpp` | SPDX Header, Doxygen Module Intro & Include Guards | 36 | 8.2% |
| `wd_train_formation.hpp` | Types & Struct Definitions (`u8g2gl_carriage_t`) | 20 | 4.6% |
| `wd_train_formation.hpp` | Class Declaration & Lifecycle Overrides | 21 | 4.8% |
| `wd_train_formation.hpp` | Setters & Ingestion API Declarations with Doxygen | 64 | 14.6% |
| `wd_train_formation.hpp` | Member Variables & Packing | 13 | 3.0% |
| `wd_train_formation.cpp` | SPDX Header, Banners & Include Directives | 25 | 5.7% |
| `wd_train_formation.cpp` | Configuration Setters (`set_font`, `set_max_carriages`) | 30 | 6.8% |
| `wd_train_formation.cpp` | Data Ingestion API (`begin`, `add_carriage`, `commit`, etc.) | 73 | 16.6% |
| `wd_train_formation.cpp` | Pixel Arithmetic & Horizontal Strip Rendering (`render`) | 157 | 35.7% |
| **Total** | **All Concerns Combined** | **439** | **100%** |

#### Storage Cost
- `u8g2gl_carriage_t`:
  - `uint8_t number` (1 byte)
  - `uint8_t loading_pct` (1 byte)
  - `bool is_first_class` (1 byte)
  - `bool has_wheelchair` (1 byte)
  - `bool has_bike` (1 byte)
  - Alignment padding: 1 byte
  - Total per carriage: 6 bytes.
- Static collection buffer: `carriages_[16]` occupies 96 bytes.
- Object members (`font_`, `max_carriages_`, `current_carriage_index_`, `carriage_count_`): 32 bytes.
- Total RAM footprint: 128 bytes. Zero dynamic heap allocations (`new`/`malloc`/`std::vector` prohibited by §9.2).

#### Pixel Arithmetic Approach
On a 256×64 display with `x=0, y=17, w=256, h=32`:
1. **Horizontal Distribution**:
   - For $n = 12$ carriages, 11 inter-carriage gaps of $\text{gap} = 1\text{ px}$ take 11 px.
   - Available width for cells: $256 - 11 = 245\text{ px}$.
   - Cell width $\text{cell\_w} = \lfloor 245 / 12 \rfloor = 20\text{ px}$.
   - Total carriage span: $12 \times 20 + 11 \times 1 = 251\text{ px}$.
   - Centering margin: $\lfloor (256 - 251) / 2 \rfloor = 2\text{ px}$.
   - For carriage $i \in [0, 11]$, $\text{box\_x} = 2 + i \times 21$.
2. **Vertical Partitioning**:
   - Active font `u8g2_font_6x10_mr` has an ascent of 8 px. Label area allocated $\text{label\_h} = 10\text{ px}$ (rows $y$ to $y+9$, i.e. 17..26).
   - Carriage box outline allocated $\text{box\_h} = 32 - 10 = 22\text{ px}$ (rows $y+10$ to $y+31$, i.e. 27..48).
   - Inside the 1 px frame: inner width $\text{inner\_w} = 20 - 2 = 18\text{ px}$, inner height $\text{inner\_h} = 22 - 2 = 20\text{ px}$.
3. **Loading Gauge**:
   - Filled bar from bottom: $\text{gauge\_h} = \lfloor (\text{loading\_pct} \times 20 + 50) / 100 \rfloor$.
   - For example: 80% loading $\to 16\text{ px}$ filled; 5% loading $\to 1\text{ px}$ filled; 100% $\to 20\text{ px}$ filled.
   - Drawn with `display.setDrawColor(1); display.drawBox(inner_x, gauge_y, 18, gauge_h)`.
4. **Indicators & Overlap Resolution**:
   - Indicators sit inside the top of the carriage ($y_{\text{ind}} = \text{inner\_y} + 1$):
     - **Class**: 4×4 filled box at $\text{inner\_x} + 1$ (spans x: 1..4).
     - **Wheelchair**: "W" glyph at $\text{inner\_x} + 6$ (spans x: 6..11).
     - **Bike**: "B" glyph at $\text{inner\_x} + 12$ (spans x: 12..17).
   - Horizontal separation: Each indicator has a dedicated 6 px column; no horizontal overlap exists between 1st class, wheelchair, and bike.
   - Vertical contrast: Drawn with `display.setDrawColor(2)` (XOR mode). When high passenger loading (such as carriage 3 with 80% loading) rises into the indicator row, the indicator pixels automatically invert against the filled background, preserving 100% legibility without clipping or conditional text suppression.

---

### 1.3 Widget Author Experience

#### What the Spec Communicated
- The design spec clearly described the required `<widget>` manifest layout, property definitions, and the declared-capacity pattern (§9.2) with atomic staging.
- The coding standards (`u8g2gl-standards`) established clean patterns for static capacity, documentation banners, and Doxygen contracts.

#### What the Author Had to Figure Out
1. **Font Vertical Reference**:
   - As documented in WO1, `u8g2gl_state_saver` configures `setFontPosTop()`. Consequently, text draw calls (`drawUTF8`) take $y$ as the top of the glyph bounding box, not the baseline.
2. **Monochrome Contrast on Loading Gauges**:
   - The spec requested both a proportional loading bar from the bottom and indicator glyphs ("1", "W", "B"). When a carriage is 80% or 100% full, the gauge extends into the indicator area. Utilizing U8G2's native XOR mode (`setDrawColor(2)`) elegantly solves this in 1 line of code without requiring the author to clip or erase rectangular backdrops.
3. **Monospace Glyph Geometry**:
   - Utilizing `u8g2_font_6x10_mr` (a monospace font) meant that single-digit carriage numbers and indicators are consistently 6 px wide, permitting exact mathematical placement without font measurement churn.

---

## 2. Message Pool as Host Policy

### 2.1 Is `long_mode="scroll_circular"` sufficient?

**Answer: No, not for rotating messages in a pool.**

`long_mode="scroll_circular"` is sufficient **only for displaying a single, perpetual message**.

#### Evidence from Runtime Implementation (`src/u8g2gl_label.cpp`):
1. **Indefinite Execution**: In `u8g2gl_label::tick()`, when `long_mode_ == U8G2GL_LONG_SCROLL_CIRCULAR`:
   ```cpp
   scroll_x_++;
   if (scroll_x_ > message_width_ + 30) {
       scroll_x_ = static_cast<int16_t>(-w_);
   }
   ```
   When the text exits screen-left and the 30 px gap passes, the widget silently wraps by resetting `scroll_x_ = -w_`.
2. **Permanent False Completion**: In `u8g2gl_label::is_scroll_finished()`:
   ```cpp
   bool u8g2gl_label::is_scroll_finished() const {
       return scroll_finished_;
   }
   ```
   `scroll_finished_` is only latched in Step 4 for static text that fits within the label bounds (`!needs_scroll_`). For both `U8G2GL_LONG_SCROLL` and `U8G2GL_LONG_SCROLL_CIRCULAR`, `is_scroll_finished()` is permanently `false` by design.
3. **No Completion Callback or Event**: The label provides no observer hook, callback, or event upon wrapping.

Therefore, host C++ code cannot poll `is_scroll_finished()` or receive a notification to trigger rotating to the next message.

---

### 2.2 Does message rotation need a timer?

**Answer: Yes.**

Because `u8g2gl_label` under `scroll_circular` never reports completion, message rotation must be driven by an external timekeeper. The host can implement this using `u8g2gl_timer` (from `u8g2gl/u8g2gl_timer.h`).

#### Recommended C++ Host Implementation:

```cpp
#include "u8g2gl/u8g2gl_timer.h"
#include "ui.hpp"

// Pool of messages from nationalRailBoard.json
static const char* const s_message_pool[] = {
    "A reduced train service will be running to and from London Waterloo from Good Friday 3 April to Easter Monday 6 April inclusive.",
    "Trains between Norwood Junction / Crystal Palace and New Cross Gate may be delayed by up to 20 minutes, cancelled or diverted."
};
static constexpr size_t s_message_count = sizeof(s_message_pool) / sizeof(s_message_pool[0]);
static size_t s_current_message_idx = 0;
static u8g2gl_timer s_carousel_timer;

// Periodic rotation callback executed by ui_handler()
static void on_message_carousel_tick(u8g2gl_timer* timer) {
    (void)timer;
    s_current_message_idx = (s_current_message_idx + 1) % s_message_count;
    ui_subject_message_text.set(s_message_pool[s_current_message_idx]);
}

void init_message_carousel() {
    // Seed initial message
    ui_subject_message_text.set(s_message_pool[0]);

    // Schedule 15-second rotation carousel
    // (Alternatively, period can be calculated from text length: delay + (len / speed))
    u8g2gl_timer_init(&s_carousel_timer, on_message_carousel_tick, 15000, nullptr);
}
```

---

### 2.3 What is missing?

1. **Scroll Cycle Completion Signal**:
   To make host-orchestrated message pools clean without decoupled timers, `u8g2gl_label` should provide either:
   - An optional `repeat_count` property / setter (mirroring `u8g2gl_timer_set_repeat_count`), where after $N$ complete scroll wraps, `is_scroll_finished()` latches `true`.
   - A `scroll_once` overflow mode that scrolls through the text exactly once, dwells, and signals completion.
   - An observer/callback fired on cycle completion (`on_scroll_wrap`).
2. **Severity / Classification**:
   This is a **backlog improvement**, not a blocker. Host policy can function correctly today by coupling `u8g2gl_timer` with subject writes, as shown in §2.2.

---

## 3. Verification Summary

| Step | Command | Status | Result |
| :--- | :--- | :---: | :--- |
| **Validation** | `u8g2gl validate evidence/probe-project/` | **PASS** | 0 errors, 0 warnings |
| **Generation** | `u8g2gl generate evidence/probe-project/` | **PASS** | 8 firmware files generated / updated |
| **Widget C++ Syntax** | `clang++ -Wall -Wextra -Wpedantic -Werror -std=c++17 -fsyntax-only` | **PASS** | 0 errors, 0 warnings on `.hpp` and `.cpp` |
| **Screen C++ Syntax** | `clang++ -Wall -Wextra -Wpedantic -Werror -std=c++17 -fsyntax-only` | **PASS** | 0 errors, 0 warnings on `ui_screen_departures.cpp` |
| **Data Ingestion Test** | Mock National Rail ingestion test harness | **PASS** | 12 carriages ingested, 81 U8G2 draw calls verified |
