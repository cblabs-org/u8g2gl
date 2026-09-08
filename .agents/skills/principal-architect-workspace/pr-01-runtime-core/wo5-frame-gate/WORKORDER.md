---
name: pr-01-runtime-core-wo5
description: Handoff instructions for Work Order 5 — Frame Gate + ui_handler() + Tick Scheduling
complexity: standard
---

# WO5 — Frame Gate + ui_handler() + Tick Scheduling

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create new branches, and do not plan beyond this checklist.
> Your task is strictly limited to executing the checklist below.

## Objective

Implement the frame gate (§11.2), `ui_handler()` per [D-15], tick scheduling
with deadline aggregation, the pull-only time source, and screen lifecycle stubs.
This is the integration layer that ties WO1–WO4 together into a functional
runtime loop. Also measure and report final `sizeof(u8g2gl_obj)`.

## Parent Project

This WORKORDER belongs to **PR-01: Runtime Core**.
- Project file: `.agents/skills/principal-architect-workspace/pr-01-runtime-core/PROJECT.md`
- Human approval of the decomposition is recorded there at `2026-09-07T22:16:09Z`.

## Strict Boundary Box

**DO NOT:**
- Implement concrete widgets (label, clock, etc.) — that is PR-03
- Write any XML, schema, or generator code — that is PR-02/PR-04
- Implement the focus/input system — that is PR-09
- Create additional branches — work only on `u8g2gl-runtime/wo5-frame-gate`
- Use namespaces — flat `u8g2gl_` / `U8G2GL_` prefixes only ([D-12]/[D-13])
- Use dynamic allocation — [D-1]
- Modify WO1–WO4 files unless strictly necessary (explain why in Completion Report)

## Tooling Constraints

- Build: CMake (already set up). Add new source files to the `u8g2gl` library target.
- Test: GoogleTest. Add new test files in `test/`.
- U8G2 stub: extend `test/stubs/U8G2lib.h` as needed for frame gate testing.

## Reference — Spec Context

Read these for context:
- [design_spec.md §11](../../../docs/design_spec.md) — Rendering model, widget lifecycle,
  frame gate, ui_handler(), tick()/render() contract, state saver, escape hatch
- [design_spec.md §13.12](../../../docs/design_spec.md) — Screen lifecycle functions:
  _init(), _activate(), _deactivate(), _tick(), _render()
- [design_spec.md §13.3](../../../docs/design_spec.md) — Flat object array + parent table

## Existing Infrastructure (from WO1–WO4)

- `u8g2gl_obj` base class with virtual `tick()`, `render()`, `render_animation_update()`
- `u8g2gl_types.h` with `U8G2GL_IDLE`, `u8g2gl_min()`, flag constants
- `u8g2gl_tree.h` with `u8g2gl_is_effectively_visible()`, `u8g2gl_effective_clip()`
- `u8g2gl_state_saver` RAII guard
- `u8g2gl_helpers.h` with `u8g2gl_partial_refresh()`
- `u8g2gl_subject` types with observer notification and `mark_dirty()`
- `u8g2gl_style` with cascade/merge

## Line-Item Instructions

### 1. Core Runtime — `include/u8g2gl/u8g2gl_core.h`

- [x] Create the core runtime header with:

```cpp
#ifndef U8G2GL_CORE_H
#define U8G2GL_CORE_H

#include "u8g2gl_types.h"
#include "u8g2gl_obj.h"
#include <cstdint>

// Forward declare
class U8G2;

// --- Tick time source ---
// Pull-only: the framework calls this to get the current time.
// The user registers their millis() function once at startup.
using u8g2gl_tick_cb_t = uint32_t(*)();
void u8g2gl_set_tick_cb(u8g2gl_tick_cb_t cb);
uint32_t u8g2gl_tick_now();   // calls the registered callback

// --- Screen structure ---
// Represents a complete screen: its widget array, parent table, and lifecycle.
// Generated code creates one of these per screen (§13.12).
struct u8g2gl_screen {
    u8g2gl_obj* const* objs;          // flat array of widget pointers
    const uint8_t* parents;            // parent index array (parallel to objs)
    uint8_t obj_count;                 // number of objects in the arrays

    // Screen lifecycle function pointers (set by generated code)
    void (*init_fn)();
    void (*activate_fn)();
    void (*deactivate_fn)();
    uint32_t (*tick_fn)(uint32_t now_ms);
    void (*render_fn)(U8G2& display);

    // Screen-level dirty flag (gates sendBuffer)
    bool dirty;
};

// --- Screen management ---
void u8g2gl_set_active_screen(u8g2gl_screen* screen);
u8g2gl_screen* u8g2gl_get_active_screen();

// --- Mark the active screen dirty ---
// Called by subjects on value change, by widgets on state change.
// This replaces the per-object mark_dirty() placeholder from WO2.
void u8g2gl_mark_dirty();

// --- The main handler ---
// Per [D-15] and §11.1:
// 1. Get current time via tick callback
// 2. Tick all widgets in the active screen, collecting deadlines
// 3. If dirty: render all visible widgets (with state saver + clip), sendBuffer
// 4. Return ms until next work needed (minimum deadline - now)
//
// The caller puts this in their loop:
//   uint32_t idle_ms = ui_handler(u8g2);
//   delay(idle_ms);  // or feed to RTOS sleep
uint32_t ui_handler(U8G2& display);

// --- Convenience: run-in-period wrapper ---
// Calls ui_handler and returns immediately if nothing to do,
// or returns the sleep duration. Useful for simple loops.
// §11 says this is optional sugar.
uint32_t ui_handler_run_in_period(U8G2& display, uint32_t period_ms);

#endif // U8G2GL_CORE_H
```

### 2. Core Implementation — `src/u8g2gl_core.cpp`

- [x] Implement the core runtime:

```
Static globals:
  - u8g2gl_tick_cb_t s_tick_cb = nullptr;
  - u8g2gl_screen* s_active_screen = nullptr;

u8g2gl_set_tick_cb(cb):
  s_tick_cb = cb;

u8g2gl_tick_now():
  return s_tick_cb ? s_tick_cb() : 0;

u8g2gl_set_active_screen(screen):
  if (s_active_screen && s_active_screen->deactivate_fn)
    s_active_screen->deactivate_fn();
  s_active_screen = screen;
  if (screen) {
    screen->dirty = true;  // force first frame
    if (screen->activate_fn) screen->activate_fn();
  }

u8g2gl_get_active_screen():
  return s_active_screen;

u8g2gl_mark_dirty():
  if (s_active_screen) s_active_screen->dirty = true;

ui_handler(U8G2& display):
  if (!s_active_screen) return U8G2GL_IDLE;

  uint32_t now = u8g2gl_tick_now();
  uint32_t next_deadline = U8G2GL_IDLE;

  // Phase 1: tick all widgets, collect deadlines
  if (s_active_screen->tick_fn) {
    next_deadline = s_active_screen->tick_fn(now);
  }

  // Phase 2: render if dirty
  if (s_active_screen->dirty) {
    display.clearBuffer();
    if (s_active_screen->render_fn) {
      s_active_screen->render_fn(display);
    }
    display.sendBuffer();
    s_active_screen->dirty = false;
  }

  // Phase 3: compute sleep time
  if (next_deadline == U8G2GL_IDLE) return U8G2GL_IDLE;
  uint32_t elapsed = u8g2gl_tick_now() - now;
  if (next_deadline <= elapsed) return 0;
  return next_deadline - elapsed;
```

### 3. Wire mark_dirty() to the screen-level flag

- [x] Update `u8g2gl_obj::mark_dirty()` in `src/u8g2gl_obj.cpp`:
  Currently it sets the per-object `U8G2GL_FLAG_DIRTY`. Change it to also
  (or instead) call `u8g2gl_mark_dirty()` which sets the screen-level flag.
  Keep the per-object flag for widgets that need to know they changed (like
  label checking if text needs re-layout), but the frame gate is screen-level.

  ```cpp
  void u8g2gl_obj::mark_dirty() {
      flags_ |= U8G2GL_FLAG_DIRTY;
      u8g2gl_mark_dirty();   // gate the frame
  }
  ```

  This requires adding `#include "u8g2gl_core.h"` to `u8g2gl_obj.cpp`.

### 4. Update CMakeLists.txt
 
- [x] Add `src/u8g2gl_core.cpp` to the `u8g2gl` library target.
 
 ### 5. Integration Tests — `test/test_core.cpp`
 
- [x] Create comprehensive integration tests using mock screens:

```cpp
// --- Test helpers ---
// Create a mock widget subclass for testing:
class mock_widget : public u8g2gl_obj {
public:
    uint32_t next_deadline = U8G2GL_IDLE;
    int tick_count = 0;
    int render_count = 0;
    uint32_t last_tick_time = 0;

    uint32_t tick(uint32_t now_ms) override {
        tick_count++;
        last_tick_time = now_ms;
        return next_deadline;
    }

    void render(U8G2& display) override {
        render_count++;
    }
};

// Mock tick source
static uint32_t s_mock_time = 0;
uint32_t mock_millis() { return s_mock_time; }

// Helper: create a screen with mock widgets
// ...
```

```
--- Tick Callback ---
TEST(Core, TickCallbackDefault)
  - Before setting callback, u8g2gl_tick_now() returns 0

TEST(Core, TickCallbackRegistered)
  - Set mock callback, set s_mock_time = 1000
  - u8g2gl_tick_now() returns 1000

--- Screen Management ---
TEST(Core, NoActiveScreen)
  - ui_handler() with no active screen returns U8G2GL_IDLE
  - No crash

TEST(Core, SetActiveScreen)
  - Set a screen → get_active_screen() returns it

TEST(Core, ScreenActivateCalledOnSet)
  - Screen with activate_fn counting calls
  - set_active_screen → activate_fn called once

TEST(Core, ScreenDeactivateOnSwitch)
  - Set screen A, then set screen B
  - A's deactivate_fn called, B's activate_fn called

--- Frame Gate ---
TEST(Core, DirtyRendersAndClears)
  - Set active screen, screen is dirty (from activation)
  - Call ui_handler → clearBuffer and sendBuffer called
  - dirty is now false

TEST(Core, NotDirtyDoesNotRender)
  - After first ui_handler clears dirty
  - Call ui_handler again → no clearBuffer/sendBuffer
  - render_fn NOT called

TEST(Core, MarkDirtyCausesRender)
  - After clearing dirty, call u8g2gl_mark_dirty()
  - ui_handler → renders again

--- Deadline Aggregation ---
TEST(Core, SingleWidgetDeadline)
  - One mock widget with next_deadline = 500
  - Mock time = 0
  - ui_handler returns ~500 (minus elapsed)

TEST(Core, TwoWidgetMinimumDeadline)
  - Widget A deadline = 1000, Widget B deadline = 300
  - ui_handler returns ~300

TEST(Core, AllIdleReturnsIdle)
  - Both widgets return U8G2GL_IDLE
  - ui_handler returns U8G2GL_IDLE

TEST(Core, MixedIdleAndDeadline)
  - Widget A returns U8G2GL_IDLE, Widget B returns 200
  - ui_handler returns ~200

--- Visibility ---
TEST(Core, HiddenWidgetNotRendered)
  - Widget with U8G2GL_FLAG_HIDDEN
  - render_fn should skip it (note: this depends on whether render_fn
    checks visibility — in the generated code pattern, render_fn iterates
    all objects and calls render(). The visibility check is the widget's
    or the framework's concern.)
  - For PR-01, if the render_fn iterates and calls each obj's render(),
    test that a hidden widget's render() is still called but the
    ui_handler still works correctly. Visibility filtering is PR-03's
    concern for concrete widgets.

--- Object mark_dirty triggers screen dirty ---
TEST(Core, ObjMarkDirtyGatesFrame)
  - Clear screen dirty
  - Call mark_dirty() on a widget
  - ui_handler → renders (screen was dirty)

--- sizeof report ---
TEST(Core, SizeOfReport)
  - Print sizeof(u8g2gl_obj), sizeof(u8g2gl_style), sizeof(u8g2gl_screen)
  - Print sizeof(u8g2gl_subject_int), sizeof(u8g2gl_subject_string),
    sizeof(u8g2gl_subject_bool), sizeof(u8g2gl_subject_time)
  - Use RecordProperty or printf so it shows in test output
```

**IMPORTANT:** Each test must reset the global state (tick callback and
active screen) in a SetUp/TearDown fixture to avoid cross-test pollution.

### 6. Register test file

- [x] Add `test/test_core.cpp` to `test/CMakeLists.txt` as a new test
  executable `test_core`. Link against `u8g2gl` and `GTest::gtest_main`,
  add stubs include path.

### 7. Build and Verify

- [x] Build: `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build`
- [x] Run: `cd build && ctest --output-on-failure`
- [x] ALL tests across ALL suites must pass (smoke + obj + subject + style + core)
- [x] Zero warnings under `-Wall -Wextra -Wpedantic`
- [x] Capture the sizeof report from the test output for the Completion Report

### 8. Commit

- [x] Stage all new and modified files and commit:
  ```
  feat(runtime): add frame gate, ui_handler, and screen lifecycle

  - Frame gate: screen-level dirty flag gates sendBuffer ([D-15])
  - ui_handler(): tick all widgets, render if dirty, return ms-to-next-work
  - u8g2gl_set_tick_cb(): pull-only time source registration
  - u8g2gl_screen: flat array + parent table + lifecycle function pointers
  - Screen management: activate/deactivate on switch
  - mark_dirty() now gates the frame at screen level
  - Integration tests with mock widgets and deadline aggregation
  - Final sizeof report for all core types

  Part of PR-01: Runtime Core (WO5)
  ```

## Verification Requirement

Build must complete with zero warnings. All tests must pass.
**CRITICAL:** Before committing, ask the user if they are happy with the changes.

**ALSO CRITICAL:** Include the sizeof measurements in your Completion Report.
The PA needs these to document the runtime's memory budget for §18/Q-4.

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

---

## Completion Report (written by the worker at task completion)

### Status
Complete

### Changes Made
- `include/u8g2gl/u8g2gl_core.h` — Created core runtime header providing:
  - Pull-only tick time source registration (`u8g2gl_set_tick_cb`, `u8g2gl_tick_now`).
  - Screen descriptor struct (`u8g2gl_screen`) capturing flat widget pointer array, parent table, object count, lifecycle callbacks (`init_fn`, `activate_fn`, `deactivate_fn`, `tick_fn`, `render_fn`), and screen-level `dirty` flag.
  - Active screen management (`u8g2gl_set_active_screen`, `u8g2gl_get_active_screen`).
  - Screen-level dirty flag trigger (`u8g2gl_mark_dirty`).
  - Main driver loop (`ui_handler`) per [D-15] and spec §11.1.
  - Convenience wrapper (`ui_handler_run_in_period`).
- `src/u8g2gl_core.cpp` — Core runtime implementation with zero dynamic allocation:
  - Time callback management with 0 fallback if unassigned.
  - Screen switching with deactivate callback on previous screen, activate callback on new screen, and forced first frame dirty flag.
  - Frame gate gating `clearBuffer()` and `sendBuffer()` behind screen dirty flag.
  - Multi-widget deadline aggregation with elapsed time calculation and subtraction.
  - Run-in-period tracking.
- `include/u8g2gl/u8g2gl_obj.h` & `src/u8g2gl_obj.cpp` — Updated `u8g2gl_obj::mark_dirty()` to set `U8G2GL_FLAG_DIRTY` and call `u8g2gl_mark_dirty()`, propagating widget and data binding changes directly to the screen frame gate.
- `CMakeLists.txt` — Added `src/u8g2gl_core.cpp` to `u8g2gl` library target, and added `test/stubs` to include path when tests are enabled.
- `test/CMakeLists.txt` — Registered `test_core` executable linking `u8g2gl` and `GTest::gtest_main` with stub include path.
- `test/test_core.cpp` — 19 comprehensive tests covering tick callbacks, screen lifecycle and switching, frame gate rendering suppression, mark_dirty triggers from widgets, single and multiple widget deadline aggregation, visibility filtering, elapsed time subtraction, period runner, and final sizeof memory reporting.

### Decisions Made
- `u8g2gl_screen` is a standard C/C++ aggregate without virtual functions or hidden overhead, enabling straightforward static code emission by the generator (§13.12).
- `u8g2gl_set_active_screen(nullptr)` safely deactivates any active screen and cleans up active pointer.
- `u8g2gl_obj::mark_dirty()` sets both the per-object flag (for widget-level re-layout checks) and triggers the screen frame gate via `u8g2gl_mark_dirty()`.
- Zero dynamic allocation throughout the core runtime, conforming strictly to [D-1].
- Flat naming prefix `u8g2gl_` / `U8G2GL_` without namespaces per [D-12]/[D-13].

### Final Memory Measurements (`sizeof` report for §18/Q-4)
Measured on 64-bit host (x86_64/arm64):
- `sizeof(u8g2gl_obj)`: 64 bytes
- `sizeof(u8g2gl_style)`: 40 bytes
- `sizeof(u8g2gl_screen)`: 72 bytes
- `sizeof(u8g2gl_subject_int)`: 400 bytes
- `sizeof(u8g2gl_subject_string)`: 528 bytes
- `sizeof(u8g2gl_subject_bool)`: 400 bytes
- `sizeof(u8g2gl_subject_time)`: 400 bytes

*Note on subject sizes:* Subjects contain static observer pools (`U8G2GL_MAX_OBSERVERS = 16`). On 64-bit architectures, each observer is 24 bytes (16-byte pointers/callbacks + padding), totaling 384 bytes for the pool. On 32-bit embedded targets (ESP32, Cortex-M), pointers are 4 bytes, reducing the pool to 12 bytes * 16 = 192 bytes, with correspondingly lower subject sizes (~208 bytes).

### Dead Ends & Warnings
- None. Build completed with 0 warnings under `-Wall -Wextra -Wpedantic`. All 75 tests across all 5 test suites pass (100%).

### Out-of-Scope Findings
- None.

### Blockers
- None.

