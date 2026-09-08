---
name: pr-01-runtime-core-wo1
description: Handoff instructions for Work Order 1 — Project Skeleton + CMake + GoogleTest
complexity: standard
---

# WO1 — Project Skeleton + CMake + GoogleTest

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create new branches, and do not plan beyond this checklist.
> Your task is strictly limited to executing the checklist below.

## Objective

Create the C++ project skeleton for the U8G2GL runtime library: CMake build
system, GoogleTest integration, directory layout, core type/config headers, and
a U8G2 stub header for host-only testing. Everything must compile and a trivial
smoke test must pass via `ctest`.

## Parent Project

This WORKORDER belongs to **PR-01: Runtime Core**.
- Project file: `.agents/skills/principal-architect-workspace/pr-01-runtime-core/PROJECT.md`
- Human approval of the decomposition is recorded there at `2026-09-07T22:16:09Z`.

## Strict Boundary Box

**DO NOT:**
- Implement `u8g2gl_obj`, subjects, styles, or the frame gate — those are WO2–WO5
- Write any XML, schema, or generator code — that is PR-02/PR-04
- Touch anything in esp32-app-foundation — that is PR-05
- Create additional branches — work only on `u8g2gl-runtime/wo1-skeleton`
- Use namespaces — all symbols use flat `u8g2gl_` / `U8G2GL_` prefixes ([D-12]/[D-13])
- Use dynamic allocation (no `new`, `malloc`, `std::vector` in library code) — [D-1]

## Tooling Constraints

- **Build:** Use CMake (minimum 3.16). Use `FetchContent` or a submodule for GoogleTest.
- **Test:** GoogleTest. Run via `ctest` after building.
- **C++ standard:** C++17 (minimum for embedded toolchains, matches PlatformIO defaults).
- **Compiler:** Must compile cleanly with both GCC and Clang on macOS/Linux.

## Reference — Spec & Plan Context

Read these for context if needed:
- [design_spec.md §13](../../../docs/design_spec.md) — the generator↔runtime contract
- [design_spec.md §19](../../../docs/design_spec.md) — naming conventions
- [design_spec.md §11](../../../docs/design_spec.md) — rendering model (for U8G2 API surface)
- [implementation_plan.md §2 PD-3](../../../docs/implementation_plan.md) — object model decision

## Line-Item Instructions

### 1. Directory Structure

- [x] Create the following directory layout at the repo root:

```
include/
  u8g2gl/
    u8g2gl_types.h        ← Core typedefs and constants
    u8g2gl_config.h       ← Compile-time configuration macros
src/
    (empty — ready for WO2+)
test/
    stubs/
        U8G2lib.h         ← U8G2 stub for host builds
    test_smoke.cpp        ← Trivial smoke test
CMakeLists.txt            ← Top-level CMake
```

### 2. Top-Level CMakeLists.txt

- [x] Create `CMakeLists.txt` at the repo root:
  - `cmake_minimum_required(VERSION 3.16)`
  - `project(u8g2gl VERSION 0.3.0 LANGUAGES CXX)`
  - C++17 standard, enforced (`CMAKE_CXX_STANDARD 17`, `CMAKE_CXX_STANDARD_REQUIRED ON`)
  - Define a `u8g2gl` library target (STATIC). Sources initially empty or with a
    placeholder. Include directory: `include/`
  - Use `FetchContent` to pull GoogleTest (tag `v1.14.0` or later)
  - `enable_testing()`
  - Add a `test/` subdirectory for tests
  - Compile with `-Wall -Wextra -Wpedantic` for the library target
  - Add an option `U8G2GL_BUILD_TESTS` (default ON) to gate test building

### 3. Test CMakeLists.txt

- [x] Create `test/CMakeLists.txt`:
  - Link against `u8g2gl` and `GTest::gtest_main`
  - Add `test/stubs/` to the include path (so `#include "U8G2lib.h"` resolves
    to the stub, not a real U8G2)
  - Register tests with `gtest_discover_tests()`

### 4. Core Types Header — `include/u8g2gl/u8g2gl_types.h`

- [x] Create with:
  - Include guard: `#ifndef U8G2GL_TYPES_H` / `#define U8G2GL_TYPES_H`
  - `#include <cstdint>`
  - `#include <cstddef>`
  - `#include <climits>`
  - Constant: `static constexpr uint32_t U8G2GL_IDLE = UINT32_MAX;`
  - Constant: `static constexpr uint8_t U8G2GL_NO_PARENT = UINT8_MAX;`
  - Flag constants (as `uint8_t`):
    - `U8G2GL_FLAG_HIDDEN   = 0x01`
    - `U8G2GL_FLAG_DIRTY    = 0x02`
    - `U8G2GL_FLAG_DISABLED = 0x04`
  - Alignment enum: `enum u8g2gl_align_t { U8G2GL_ALIGN_LEFT = 0, U8G2GL_ALIGN_CENTER, U8G2GL_ALIGN_RIGHT };`
  - Color enum: `enum u8g2gl_color_t { U8G2GL_COLOR_0 = 0, U8G2GL_COLOR_1 = 1, U8G2GL_COLOR_XOR = 2 };`
  - Font mode enum: `enum u8g2gl_font_mode_t { U8G2GL_FONT_MODE_SOLID = 0, U8G2GL_FONT_MODE_TRANSPARENT = 1 };`
  - Bitmap mode enum: `enum u8g2gl_bitmap_mode_t { U8G2GL_BITMAP_MODE_SOLID = 0, U8G2GL_BITMAP_MODE_TRANSPARENT = 1 };`
  - Inline helper: `inline uint32_t u8g2gl_min(uint32_t a, uint32_t b) { return a < b ? a : b; }`
  - Event enum stub (for §12, don't implement dispatch):
    ```cpp
    enum u8g2gl_event_t {
        U8G2GL_EVENT_NONE = 0,
        U8G2GL_EVENT_ENCODER_CW,
        U8G2GL_EVENT_ENCODER_CCW,
        U8G2GL_EVENT_ENCODER_CLICK,
        U8G2GL_EVENT_BUTTON_PRESS,
        U8G2GL_EVENT_BUTTON_LONG_PRESS,
    };
    ```

### 5. Config Header — `include/u8g2gl/u8g2gl_config.h`

- [x] Create with:
  - Include guard
  - `#ifndef U8G2GL_MAX_OBSERVERS` / `#define U8G2GL_MAX_OBSERVERS 16` — configurable
    pool size for observer registrations, overridable by the user's build
  - `#ifndef U8G2GL_MAX_OBJECTS_PER_SCREEN` / `#define U8G2GL_MAX_OBJECTS_PER_SCREEN 32`
  - `#ifndef U8G2GL_MAX_STYLES` / `#define U8G2GL_MAX_STYLES 8`
  - Comment each: "Override at compile time via -D flag"

### 6. U8G2 Stub Header — `test/stubs/U8G2lib.h`

- [x] Create a minimal stub of the `U8G2` class sufficient for the runtime to
  compile on the host. It does NOT need to actually draw. It needs:
  - `class U8G2` with public methods (all no-op or returning 0):
    - `void clearBuffer()`
    - `void sendBuffer()`
    - `void drawHLine(int x, int y, int w)`
    - `void drawVLine(int x, int y, int h)`
    - `void drawLine(int x1, int y1, int x2, int y2)`
    - `void drawBox(int x, int y, int w, int h)`
    - `void drawFrame(int x, int y, int w, int h)`
    - `void drawStr(int x, int y, const char* s)`
    - `void drawUTF8(int x, int y, const char* s)`
    - `void drawGlyph(int x, int y, uint16_t encoding)`
    - `void drawXBMP(int x, int y, int w, int h, const uint8_t* bitmap)`
    - `void drawPixel(int x, int y)`
    - `void drawCircle(int x, int y, int r, uint8_t opt = 0x0F)`
    - `void drawDisc(int x, int y, int r, uint8_t opt = 0x0F)`
    - `void drawTriangle(int x0, int y0, int x1, int y1, int x2, int y2)`
    - `void drawRBox(int x, int y, int w, int h, int r)`
    - `void drawRFrame(int x, int y, int w, int h, int r)`
    - `void drawButtonUTF8(int x, int y, uint8_t flags, int w, int p, const char* s)`
    - `void setDrawColor(uint8_t c)`
    - `void setFont(const uint8_t* font)`
    - `void setFontMode(uint8_t m)`
    - `void setBitmapMode(uint8_t m)`
    - `void setClipWindow(int x0, int y0, int x1, int y1)`
    - `void setMaxClipWindow()`
    - `void setFontPosTop()`
    - `int getStrWidth(const char* s)` → returns 0
    - `int getUTF8Width(const char* s)` → returns 0
    - `int getMaxCharWidth()` → returns 0
    - `int getMaxCharHeight()` → returns 0
    - `int getAscent()` → returns 0
    - `int getDescent()` → returns 0
    - `void updateDisplayArea(int tx, int ty, int tw, int th)`
  - Also declare `uint8_t` typedef if not already available via `<cstdint>`
  - Add tracking members to allow test assertions:
    - `int clear_count = 0;` (incremented by `clearBuffer()`)
    - `int send_count = 0;` (incremented by `sendBuffer()`)
    - `uint8_t last_draw_color = 1;` (set by `setDrawColor()`)
    - `const uint8_t* last_font = nullptr;` (set by `setFont()`)

### 7. Smoke Test — `test/test_smoke.cpp`

- [x] Create a GoogleTest file:
  ```cpp
  #include <gtest/gtest.h>
  #include "u8g2gl/u8g2gl_types.h"
  #include "u8g2gl/u8g2gl_config.h"
  #include "U8G2lib.h"

  TEST(Smoke, TypeConstants) {
      EXPECT_EQ(U8G2GL_IDLE, UINT32_MAX);
      EXPECT_EQ(U8G2GL_NO_PARENT, UINT8_MAX);
      EXPECT_EQ(U8G2GL_FLAG_HIDDEN, 0x01);
      EXPECT_EQ(U8G2GL_FLAG_DIRTY, 0x02);
      EXPECT_EQ(U8G2GL_FLAG_DISABLED, 0x04);
  }

  TEST(Smoke, Enums) {
      EXPECT_EQ(U8G2GL_ALIGN_LEFT, 0);
      EXPECT_EQ(U8G2GL_ALIGN_CENTER, 1);
      EXPECT_EQ(U8G2GL_ALIGN_RIGHT, 2);
      EXPECT_EQ(U8G2GL_COLOR_0, 0);
      EXPECT_EQ(U8G2GL_COLOR_1, 1);
      EXPECT_EQ(U8G2GL_COLOR_XOR, 2);
  }

  TEST(Smoke, MinHelper) {
      EXPECT_EQ(u8g2gl_min(100, 200), 100u);
      EXPECT_EQ(u8g2gl_min(U8G2GL_IDLE, 500), 500u);
      EXPECT_EQ(u8g2gl_min(U8G2GL_IDLE, U8G2GL_IDLE), U8G2GL_IDLE);
  }

  TEST(Smoke, U8G2StubCompiles) {
      U8G2 display;
      display.clearBuffer();
      display.sendBuffer();
      EXPECT_EQ(display.clear_count, 1);
      EXPECT_EQ(display.send_count, 1);
  }
  ```

### 8. Build and Verify

- [x] Build the project:
  ```bash
  cmake -B build -DCMAKE_BUILD_TYPE=Debug
  cmake --build build
  ```
- [x] Run tests:
  ```bash
  cd build && ctest --output-on-failure
  ```
- [x] All 4 tests must pass.

### 9. Commit

- [x] Stage all new files and commit:
  ```
  feat(runtime): add project skeleton with CMake, GoogleTest, and U8G2 stub

  - CMake build system with C++17, GoogleTest via FetchContent
  - Core type/config headers with U8G2GL constants and enums
  - U8G2 stub header for host-only test builds
  - Smoke tests proving the build harness works

  Part of PR-01: Runtime Core (WO1)
  ```

## Verification Requirement

The build must complete without warnings (`-Wall -Wextra -Wpedantic`) and all
tests must pass via `ctest --output-on-failure`. **CRITICAL:** Before committing,
ask the user if they are happy with the changes.

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly. The
Principal Architect will triage and file them under the correct author identity.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete

### Changes Made
- `CMakeLists.txt` — top-level CMake configuration with C++17, static library target `u8g2gl`, GoogleTest via FetchContent (v1.14.0), compiler warning flags (`-Wall -Wextra -Wpedantic`), and test gating option (`U8G2GL_BUILD_TESTS`).
- `include/u8g2gl/u8g2gl_types.h` — core type definitions, constants (`U8G2GL_IDLE`, `U8G2GL_NO_PARENT`, flag bitmasks), enums (`u8g2gl_align_t`, `u8g2gl_color_t`, `u8g2gl_font_mode_t`, `u8g2gl_bitmap_mode_t`, `u8g2gl_event_t`), and `u8g2gl_min` helper.
- `include/u8g2gl/u8g2gl_config.h` — compile-time configuration macros (`U8G2GL_MAX_OBSERVERS`, `U8G2GL_MAX_OBJECTS_PER_SCREEN`, `U8G2GL_MAX_STYLES`) with overridable `#ifndef` guards.
- `src/u8g2gl.cpp` — placeholder translation unit for static library archiving on host platforms.
- `test/stubs/U8G2lib.h` — mock host stub for U8G2 display driver with call tracking counters (`clear_count`, `send_count`, `last_draw_color`, `last_font`).
- `test/test_smoke.cpp` — GoogleTest suite covering type constants, enum values, min helper, and U8G2 stub compilation.
- `test/CMakeLists.txt` — test target configuration linking against `u8g2gl` and `GTest::gtest_main`, stub include directories, and test discovery.
- `.gitignore` — ignores `build/` artifact directory and local editor settings.

### Decisions Made
- Added a placeholder translation unit `src/u8g2gl.cpp` for the static library `u8g2gl`: on macOS/BSD platforms, `ar` fails to create a static archive with zero object members. The placeholder includes the core headers and compiles cleanly under `-Wall -Wextra -Wpedantic`.
- Omitted parameter names in no-op methods of `test/stubs/U8G2lib.h` to prevent `-Wunused-parameter` warnings under `-Wextra`.

### Dead Ends & Warnings
- Attempting to declare `add_library(u8g2gl STATIC)` with only header files causes `ar: no archive members specified` on macOS. Ensure that library targets contain at least one translation unit.

### Out-of-Scope Findings
(none)

### Blockers
(none)
