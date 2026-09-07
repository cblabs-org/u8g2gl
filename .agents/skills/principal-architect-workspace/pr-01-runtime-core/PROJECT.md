# PROJECT — PR-01: Runtime Core (C++ Library, Host-Testable)

**Tier 2 · Principal Architect**
**Parent programme:** [PROGRAM.md](../PROGRAM.md) · [implementation_plan.md](../../../docs/implementation_plan.md)
**Normative spec:** [design_spec.md](../../../docs/design_spec.md) v0.3 — §13 is a binding contract
**Branch prefix:** `u8g2gl-runtime/`

## Mandate

Deliver the U8G2GL runtime core as a C++ library that builds and tests entirely
on the host (no ESP32 required). This is the foundation that PR-03 (widgets) and
PR-04 (generator) build against.

### In Scope

1. **C++ project skeleton**: CMake build, GoogleTest harness (matching
   esp32-app-foundation convention), CI-ready `ctest` invocation.
2. **`u8g2gl_obj` base class** per PD-3: vptr, `int16_t` coords (x, y, w, h),
   flags byte, parent index, ~16 B per object.
3. **Class system**: plain C++ inheritance and virtuals ([D-3], PD-3). No
   hand-rolled `lv_obj_class` machinery.
4. **Subject/observer system** per §8: `int`, `string`, `bool`, `time` types.
   Copy-on-set string storage with declared `max_len` (§8.2). No dynamic
   allocation — static/pool only ([D-1]).
5. **Reduced monochrome style set** per §10: font, draw_color, invert, padding,
   border, radius, align, truncate, font_mode, bitmap_mode.
6. **Frame gate and `ui_handler()` deadline aggregation** per [D-15] and §11:
   `tick()` returns ms-to-next-work, `ui_handler()` returns the minimum.
7. **Widget lifecycle** per §11.3: `tick(now_ms) → deadline`, `render(display)`,
   state saver RAII, clip window.

### Explicitly Out of Scope

- Concrete widgets (label, clock, etc.) — **PR-03**
- Any XML, schema, validator, code generation — **PR-02, PR-04**
- Anything in esp32-app-foundation — **PR-05**
- Wasm preview — **PR-06**
- Focus/input system — **PR-09**

### Constraints

- **§13 is a contract.** The API exposed here must match what §13 says generated
  code will emit against. If §13 is underspecified or wrong, STOP and surface it —
  do not unilaterally change the contract.
- **No dynamic allocation.** Static/pool only — [D-1].
- **Naming:** flat `u8g2gl_` / `U8G2GL_` prefixes, no namespaces — [D-12]/[D-13].
- **Default-constructible widgets configured via setters** — §13.7 binding requirement.
- **Target floor:** esp32dev, no PSRAM. Report measured `sizeof` where possible.

---

## Status

| Event | Date | Detail |
|---|---|---|
| Created | 2026-09-07 | Decomposition presented for human approval |
| **Human approval** | **2026-09-07T22:16:09Z** | **APPROVED — human explicitly approved the 5-WO decomposition** |

---

## Work Order Ledger

Five work orders, strictly serialised (each stacks on the previous).

### WO1 — Project Skeleton + CMake + GoogleTest

- **[x] [wo1-skeleton](wo1-skeleton/WORKORDER.md)** ✅ Complete — `f66c65c`
  Create the CMake build system, directory structure, GoogleTest integration,
  and a smoke test that proves the harness works. Establish the naming
  convention headers (`u8g2gl_types.h`, `u8g2gl_config.h`), the `U8G2GL_`
  macro namespace, and a U8G2 stub/mock header for host builds.
  **Branch:** `u8g2gl-runtime/wo1-skeleton` off `main`
  **Complexity:** standard

### WO2 — Base Object + Flat Array + Parent Index

- **[x] [wo2-base-object](wo2-base-object/WORKORDER.md)** ✅ Complete — `6da0afa`
  Implement `u8g2gl_obj` base class: vptr, `int16_t` x/y/w/h, flags byte
  (hidden, dirty, disabled), `uint8_t` parent index, `set_coords()`,
  `set_parent_index()`, visibility/clip walks. Implement the screen-level
  object array and parent table types (`u8g2gl_screen`). Virtual `tick()` and
  `render()`. `u8g2gl_state_saver` RAII guard. `u8g2gl_partial_refresh()`.
  Unit tests asserting ~16 B `sizeof`, visibility walks, clip intersection.
  **Branch:** `u8g2gl-runtime/wo2-base-object` off `wo1-skeleton`
  **Complexity:** standard

### WO3 — Subject / Observer System

- **[x] [wo3-subjects](wo3-subjects/WORKORDER.md)** ✅ Complete — `43d9957`
  Implement `u8g2gl_subject` with `int`, `string`, `bool`, `time` variants.
  Copy-on-set string with declared `max_len`, fixed buffer, no heap. Observer
  registration (static pool, declared capacity). `notify()` on value change.
  Conditional flag bindings (`bind_flag_if_eq`, `_if_not_eq`, `_if_gt`,
  `_if_lt`) — flags: `hidden`, `disabled`. The setter API shape must match
  §13.8: `obj.bind_text(&subject)`, `obj.bind_flag_if_eq(&subject, val, flag)`.
  Unit tests for all four types, string truncation, observer notification,
  conditional flags.
  **Branch:** `u8g2gl-runtime/wo3-subjects` off `wo2-base-object`
  **Complexity:** standard

### WO4 — Style System

- **[ ] [wo4-styles](wo4-styles/WORKORDER.md)**
  Implement the reduced monochrome style set (§10). A `u8g2gl_style` struct
  holding the 10 properties, with per-property "set" flags for cascade/merge.
  Style application: a named style block can be applied to an object, with
  inline `style_*` overrides taking precedence. Style resolution at
  `render()` time. Enum types: `U8G2GL_ALIGN_LEFT/CENTER/RIGHT`,
  `U8G2GL_COLOR_0/1/XOR`, `U8G2GL_FONT_MODE_SOLID/TRANSPARENT`,
  `U8G2GL_BITMAP_MODE_SOLID/TRANSPARENT`. Unit tests for cascade and override.
  **Branch:** `u8g2gl-runtime/wo4-styles` off `wo3-subjects`
  **Complexity:** standard

### WO5 — Frame Gate + ui_handler() + Tick Scheduling

- **[ ] [wo5-frame-gate](wo5-frame-gate/WORKORDER.md)**
  Implement the frame gate (§11.2): dirty flag gates the frame, not individual
  widgets. `ui_handler()` per [D-15]: ticks all widgets, renders if dirty,
  returns ms-to-next-work (minimum of all widget deadlines). `U8G2GL_IDLE`
  constant (`UINT32_MAX`). `u8g2gl_set_tick_cb()` — pull time source.
  `u8g2gl_min()` helper. `ui_handler_run_in_period()` convenience.
  Screen lifecycle stubs: `init()`, `activate()`, `deactivate()`, `tick()`,
  `render()`. Integration test: mock screen with two fake widgets returning
  different deadlines, asserting `ui_handler()` returns the minimum, only
  renders when dirty, and respects visibility. Measure and report final
  `sizeof(u8g2gl_obj)`.
  **Branch:** `u8g2gl-runtime/wo5-frame-gate` off `wo4-styles`
  **Complexity:** standard

---

## Modules & Components

| Module | Path | WOs |
|---|---|---|
| Build system | `CMakeLists.txt`, `cmake/` | WO1 |
| Core types/config | `include/u8g2gl/u8g2gl_types.h`, `u8g2gl_config.h` | WO1 |
| U8G2 stub | `test/stubs/` | WO1 |
| Base object | `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp` | WO2 |
| Screen | `include/u8g2gl/u8g2gl_screen.h` | WO2, WO5 |
| State saver | `include/u8g2gl/u8g2gl_state_saver.h` | WO2 |
| Subjects | `include/u8g2gl/u8g2gl_subject.h`, `src/u8g2gl_subject.cpp` | WO3 |
| Styles | `include/u8g2gl/u8g2gl_style.h` | WO4 |
| Frame gate | `include/u8g2gl/u8g2gl_core.h`, `src/u8g2gl_core.cpp` | WO5 |
| Tests | `test/` | WO1–WO5 |

---

## §13 Contract Surface — What PR-01 Must Expose

These are the API surfaces §13 says generated code will call. PR-01 must
implement them or stub them with the correct signature.

From §13.7 — **every widget class is default-constructible, configured via setters:**
```cpp
u8g2gl_label lbl;                         // default construct
lbl.set_coords(0, 0, 256, 12);           // int16_t x, y, w, h
lbl.set_font(ui_font_small_9);           // font pointer
lbl.set_align(U8G2GL_ALIGN_CENTER);      // enum
```

From §13.8 — **binding emission:**
```cpp
lbl.bind_text(&ui_subject_station_name);
lbl.bind_text(&ui_subject_temperature, "%d°C");
icon.bind_flag_if_eq(&ui_subject_wifi, 0, U8G2GL_FLAG_HIDDEN);
```

From §13.3 — **flat object array + parent table:**
```cpp
static u8g2gl_obj* const objs[] = { &a, &b, &c };
static const uint8_t parents[] = { U8G2GL_NO_PARENT, 0, 0 };
```

From §13.12 — **screen lifecycle + deadline aggregation:**
```cpp
uint32_t ui_screen_home_tick(uint32_t ms) {
    uint32_t next = U8G2GL_IDLE;
    next = u8g2gl_min(next, a.tick(ms));
    next = u8g2gl_min(next, b.tick(ms));
    return next;
}
void ui_screen_home_render(U8G2& d) {
    a.render(d);
    b.render(d);
}
```

From §11.1 — **top-level API:**
```cpp
u8g2gl_set_tick_cb(millis);
uint32_t idle_ms = ui_handler(u8g2);
```

---

## Architecture Notes for Workers

1. **No heap.** `u8g2gl_subject` string storage is a fixed `char[]` inside the
   subject, sized by a template parameter or a compile-time max. Observer
   registration uses a static pool.

2. **U8G2 stub for host tests.** The runtime references `U8G2` class for
   `render()` signatures and state-saver. WO1 provides a stub header that
   declares the necessary API surface (draw calls, state queries) without
   linking to real U8G2. This is how native tests run without hardware.

3. **The `u8g2gl_obj` layout target is ~16 bytes on a 32-bit platform:**
   - vptr: 4 bytes
   - x, y, w, h: 4 × `int16_t` = 8 bytes
   - flags: 1 byte (hidden, dirty, disabled, + reserved)
   - parent_index: 1 byte (widens to `uint16_t` above 255 objects)
   - padding: 2 bytes to align
   - Total: 16 bytes

4. **Clip and visibility walk upward** through parent indices. Depth is 2–4
   in practice; the walk is a handful of comparisons, no child lists stored.

5. **`mark_dirty()` sets a screen-level flag**, not a per-widget flag. This
   gates `sendBuffer()`, which is the expensive part ([D-4]).

---

## Session Log

### 2026-09-07T22:02:00Z — PR-01 PA session initiated
Tier-2 PA engaged for PR-01 runtime core. Read all programme context:
operating model, spec v0.3, implementation plan v1.6, PROGRAM.md session log,
MEMORY.md.

Decomposed into 5 serialised work orders:
- WO1: Skeleton (CMake + GoogleTest + U8G2 stub)
- WO2: Base object (`u8g2gl_obj` + flat array + state saver)
- WO3: Subjects (int/string/bool/time + observer + conditional flags)
- WO4: Styles (reduced monochrome set with cascade)
- WO5: Frame gate (`ui_handler()` + deadline aggregation + screen lifecycle)

Serialisation rationale: each WO builds on the types from the previous one
(WO2 needs WO1's build system; WO3 needs WO2's `u8g2gl_obj` for observer
targets; WO4 needs WO2+WO3 for style application to objects; WO5 integrates
everything). No parallelism possible within this PR.

§13 contract surfaces catalogued and included in the PROJECT.md so every
worker knows the API shapes they must hit.

### 2026-09-07T22:16:09Z — Human approved decomposition
Human explicitly approved the 5-WO decomposition. Proceeding to WO1 execution.

### 2026-09-07T22:22:00Z — WO1 complete
Worker delivered: CMake skeleton (C++17, FetchContent GoogleTest v1.14.0),
core types/config headers with all U8G2GL constants and enums, U8G2 stub with
tracking counters, 4 smoke tests — all passing, zero warnings under
`-Wall -Wextra -Wpedantic`. Commits `f66c65c` + `eb0192d`.
No issues surfaced. Proceeding to WO2.

### 2026-09-07T22:30:00Z — WO2 complete
Worker delivered: `u8g2gl_obj` base class (24 B on 64-bit / 16 B on 32-bit target),
`u8g2gl_tree.h` with visibility/clip walks, `u8g2gl_state_saver` RAII guard,
`u8g2gl_partial_refresh` with correct tile maths (§11.4). 14 new tests all passing.
U8G2 stub extended with `getDrawColor()`/`getFont()` getters for state saver.
Worker used `__has_include` cascade for U8G2 header resolution — portable across
real U8G2 and stub. Commits `6da0afa` + `7ebb6bd`.
No issues surfaced. Proceeding to WO3.

### 2026-09-07T22:37:00Z — WO3 complete
Worker delivered: four subject classes (int/string/bool/time), copy-on-set string
with max_len cap, static observer arrays per subject, conditional flag bindings
(eq/not_eq/gt/lt) and bind_text() on u8g2gl_obj matching §13.8 API exactly.
Binding descriptors in a global static pool (`U8G2GL_MAX_TOTAL_BINDINGS`) keeping
sizeof(u8g2gl_obj) unchanged at 24 B. 26 new tests, 44/44 total passing.
Commits `43d9957` + `746eeb3`. No issues surfaced. Proceeding to WO4.
