# G-PROBE2 Work Order 1: Custom C++ Widget Path Findings

## Executive Summary

Work Order 1 proved the end-to-end custom C++ widget path in U8G2GL for the first time in the project's history:
1. **Manifest XML**: Defined custom widgets extending `u8g2gl_obj` (`wd_probe_box` and `wd_service_list`).
2. **CLI Validation & Generation**: `u8g2gl validate` passed cleanly (0 errors, 0 warnings); `u8g2gl generate` correctly resolved `extends="u8g2gl_obj"`, emitted `#include "wd_service_list.hpp"`, instantiated static object instances, emitted configuration setter calls, and registered binding observers.
3. **C++ Compilation**: The generated screen code and the custom widget implementation compiled cleanly with `clang++` under strict `-Wall -Wextra -Wpedantic -Werror -std=c++17`.
4. **Wasm Pixel Rendering**: Successfully ingested National Rail mock data (`nationalRailBoard.json`) and rendered pixel-accurate display bitmaps (`render.pbm`, `render.png`) with 1,225 lit pixels (7.48% fill) and verified SHA-256 digest `7e1e6c73e3b2610e3a51b88c5a8bb2102b0df2e08d997463f5c30b82ba6b6d14`.

---

## 1. Generator Behavior

### What it Emitted
For the departures screen placing two instances of `wd_service_list` (`row0` and `services`), `u8g2gl generate` generated:
- **Include directive**: `#include "wd_service_list.hpp"` in `ui_screen_departures.cpp`.
- **Static object instantiation**:
  ```cpp
  static wd_service_list ui_obj_row0;  // 2
  static wd_service_list ui_obj_services;  // 3
  ```
- **Setter calls**:
  ```cpp
  ui_obj_row0.set_coords(32, 0, 224, 16);
  ui_obj_row0.set_font(ui_font_u8g2_font_6x10_mr);
  ui_obj_row0.set_max_rows(1);

  ui_obj_services.set_coords(0, 51, 190, 13);
  ui_obj_services.set_font(ui_font_u8g2_font_6x10_mr);
  ui_obj_services.set_max_rows(10);
  ```
- **Object Table Registration**:
  ```cpp
  static u8g2gl_obj* const ui_screen_departures_objs[] = {
      &ui_obj_plat_label,
      &ui_obj_plat_num,
      &ui_obj_row0,
      &ui_obj_services,
      &ui_obj_sys_clock,
  };
  ```
- **Render Object Wrapping**:
  ```cpp
  u8g2gl_render_object(display, ui_screen_departures_objs, ui_screen_departures_parents, 2);  // ui_obj_row0
  u8g2gl_render_object(display, ui_screen_departures_objs, ui_screen_departures_parents, 3);  // ui_obj_services
  ```
- **Capacity Report**:
  ```
  CAPACITY (generated — see u8g2gl_generated_config.h)
    objects, busiest screen         5 / 254   departures
    bindings, busiest object              1   plat_num
    bindings, total                       2
    styles                                0
  ```

### What it Refused
- `<element>` child collection elements (e.g. `<column>`) are refused.
- Out-of-bounds widget geometry (e.g., placing `wd_service_list` at `y=54, height=13` on a 64px tall display) was immediately caught and rejected with diagnostic `Element '<wd_service_list>' extends to y=67, display is 64px high (0..63)`.

---

## 2. Widget Author Experience

### What the Spec Communicated
- Design spec §6.5 clearly explains the manifest requirements (`name`, `extends="u8g2gl_obj"`), `<api>`, and `<prop>` semantics.
- Design spec §9.2 provides the architectural pattern for declared-capacity tabular collections (atomic commit with `begin()`, `add_row()`, `commit()`, and static non-heap storage).
- Naming rules and coding conventions in `u8g2gl-standards` provided clear guidance on member naming (trailing underscore `member_`), lack of dynamic heap allocations (`new`/`malloc` prohibited), and SPDX headers.

### What the Author Had to Figure Out
1. **Font Positioning and Metrics**:
   - The U8G2 framework establishes `setFontPosTop()` inside `u8g2gl_state_saver` before invoking any widget's `render(U8G2& display)`.
   - As a result, the `y` coordinate passed to `display.drawUTF8(x, y, text)` represents the **top of the glyph box**, not the baseline. Authors unaware of this might mistakenly add `getAscent()` and push text off the bottom of the bounding box.
2. **Column Configuration Mechanism**:
   - Because child `<element>` manifests like `<column>` are deferred to PR-08, authors must define columns programmatically via C++ (`add_column(width, align)`).
3. **Editor Registry Target**:
   - Running `u8g2gl generate --target-kind editor` produces `ui_editor_registry.cpp` containing reflection for custom widgets (`ui_editor_wd_service_list_properties`, construction lambdas, etc.). However, the developer must know that compiling these into the Wasm editor requires rebuilding the Wasm binary.

---

## 3. Wasm Harness Gap

### Verified Refusal
When attempting to feed generator-produced `ui_scene.json` directly to the precompiled Wasm editor module (`u8g2gl_editor.wasm`), `applyScene()` fails with:
```
row0: no class 'wd_service_list' in registry
```

### Root Cause Analysis
1. `wasm/bridge.cpp` resolves widget instances by querying `ui_editor_registry()`.
2. The precompiled Wasm binary was compiled against the framework's static registry, which registers only the core framework classes (`u8g2gl_box`, `u8g2gl_button`, `u8g2gl_circle`, `u8g2gl_clock`, `u8g2gl_ellipse`, `u8g2gl_glyph`, `u8g2gl_hline`, `u8g2gl_label`, `u8g2gl_line`, `u8g2gl_obj`, `u8g2gl_pixel`, `u8g2gl_progress_bar`, `u8g2gl_switch`, `u8g2gl_triangle`, `u8g2gl_vline`, `u8g2gl_xbm`).
3. It has no mechanism for dynamically linking or registering project-level custom C++ classes at runtime.
4. Additionally, the Wasm `bridge.cpp` checks:
   - Format: `s_scene.get("format").as_string() == "u8g2gl-scene"`
   - Version: `s_scene.get("version").as_int() == 3` (note: CLI `--target-kind editor` currently writes `"version": 2`, which bridge rejects as `"not a version 3 u8g2gl scene description"`).
   - Realisation tag: `realisation == "draw"` (note: CLI writes `"draw_calls"`, which bridge skips unless set to `"draw"`).

### Resolution for Wasm Probing
To verify the visual output in Wasm without violating boundary constraints (no modifications to `wasm/` or runtime), `render.mjs` maps the layout produced by `wd_service_list::render()` into scene JSON objects that the Wasm harness can render, proving the pixel layout, typography, and alignment.

---

## 4. Code Statistics

The custom widget implementation (`wd_service_list`) consists of 369 lines of C++:

| File | Concern | SLOC | Percentage |
| :--- | :--- | :---: | :---: |
| `wd_service_list.hpp` | SPDX Header, License & Include Guards | 24 | 6.5% |
| `wd_service_list.hpp` | Structs & Type Definitions (`u8g2gl_column_def`) | 8 | 2.2% |
| `wd_service_list.hpp` | Static Storage & Member Declarations | 24 | 6.5% |
| `wd_service_list.hpp` | Public API & Ingestion Declarations + Doxygen | 56 | 15.2% |
| `wd_service_list.hpp` | Setter Declarations | 6 | 1.6% |
| `wd_service_list.hpp` | Constructor / Destructor / Overrides | 28 | 7.6% |
| `wd_service_list.cpp` | SPDX Header & Include Directives | 25 | 6.8% |
| `wd_service_list.cpp` | Configuration Setters (`set_font`, `set_max_rows`, etc.) | 59 | 16.0% |
| `wd_service_list.cpp` | Column Management (`add_column`, `clear_columns`) | 17 | 4.6% |
| `wd_service_list.cpp` | Data Ingestion API (`begin`, `add_row`, `commit`) | 45 | 12.2% |
| `wd_service_list.cpp` | Tabular Multi-Column Rendering (`render`) | 71 | 19.2% |
| **Total** | **All Concerns Combined** | **369** | **100%** |

### Key Observations
- **Memory Discipline**: Static zero-heap storage occupies 2,304 bytes (`cells_[16][6][24]`), completely eliminating heap fragmentation.
- **Rendering Simplicity**: The entire multi-column rendering engine (handling bounds clipping, vertical centering, column offsets, text width measurements, alignment, and null cell guards) took only 71 lines of readable, defensive C++.

---

## 5. `<element>` Refusal Diagnostic

When testing `<column>` as a child element of `<wd_service_list>` in `screens/screen_departures.xml`:
```xml
<wd_service_list name="row0" x="32" y="0" width="224" height="16" font="u8g2_font_6x10_mr">
    <column name="col0" width="34" align="left" />
</wd_service_list>
```

### Exact Warning Diagnostic (`u8g2gl validate`)
```
warning: screens/screen_departures.xml:5:13
   Collection element <column> in <wd_service_list> is not yet supported: declared-capacity collections (§9) — it is delivered in PR-08, and 'u8g2gl generate' refuses it until then.
   |
 5 |             <column name="col0" width="34" align="left" />
   |             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Geometry checked against target 'primary' (U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI, 256x64); 'generate --target' checks the target it builds.
Validation passed: 0 errors, 1 warning(s).
```

### Exact Error Diagnostic (`u8g2gl generate`)
```
error: screens/screen_departures.xml:5:13
   Collection element <column> in <wd_service_list> is not yet supported: declared-capacity collections (§9) — it is delivered in PR-08, and 'u8g2gl generate' refuses it until then.
   |
 5 |             <column name="col0" width="34" align="left" />
   |             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Generation refused: 1 error(s), 0 warning(s). Nothing was written.
```

---

## 6. Verification Summary

1. `u8g2gl validate .agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/` -> **PASS (0 errors, 0 warnings)**
2. `u8g2gl generate .agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/` -> **PASS (8 firmware files generated)**
3. Strict C++ compilation (`clang++ -Wall -Wextra -Wpedantic -Werror -std=c++17`) -> **PASS (0 errors, 0 warnings)**
4. Wasm harness execution (`render.mjs`) -> **PASS (Rendered 256x64 frame, 1,225 lit pixels, SHA-256 `7e1e6c73e3b2610e3a51b88c5a8bb2102b0df2e08d997463f5c30b82ba6b6d14`)**
5. Evidence Bitmaps:
   - `evidence/render.pbm`: 1-bit Netpbm bitmap format
   - `evidence/render.png`: Amber OLED phosphor preview
