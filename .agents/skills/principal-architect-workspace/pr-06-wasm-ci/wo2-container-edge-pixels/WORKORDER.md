---
name: pr-06-wo2
description: Handoff instructions for Work Order 2 — container-edge pixel tests
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not branch, and do not plan. Your task is strictly limited to
> executing the checklist below.

# Objective

Add three real-U8G2 pixel tests proving container-edge clipping, and fix the
`test_rbox_bound` target to link `u8g2gl_u8g2_csrc_arduino` instead of the
plain `u8g2gl_u8g2_csrc` (struct layout mismatch under ARDUINO).

**Parent project:** `pr-06-wasm-ci` — owner approved decomposition 2026-10-15.

# Strict Boundary Box

- **Only** touch test files and `test/CMakeLists.txt`.
- Do **not** modify runtime source (`src/`, `include/u8g2gl/`).
- Do **not** modify CLI, generated fixtures, or `.github/`.
- The branch will be `u8g2gl-06/wo2-container-edge-pixels`, branched from the
  tip of `u8g2gl-06/wo1-runtime-debts` by the PA before you start.

# Tooling Constraints

- Build and test with CMake in `/Users/mcneillm/Documents/Projects/U8G2GL-06`.
- `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build -j`
- `cd build && ctest --output-on-failure`
- Zero warnings under `-Wall -Wextra -Wpedantic`.

# Line-Item Instructions

## 1. Fix `test_rbox_bound` to link `u8g2gl_u8g2_csrc_arduino`

In `test/CMakeLists.txt`, `test_rbox_bound` links `u8g2gl_u8g2_csrc` (line ~597).
Under ARDUINO, `u8x8.h` adds a `pins[]` array to `u8x8_t`, giving it a
different layout. `u8g2gl_u8g2_csrc` is compiled without ARDUINO;
`u8g2gl_u8g2_csrc_arduino` is compiled with `ARDUINO=10819`. The mismatch is
two struct layouts and a latent crash.

- [x] Change `test_rbox_bound`'s link from `u8g2gl_u8g2_csrc` to
  `u8g2gl_u8g2_csrc_arduino` (line ~597 in `test/CMakeLists.txt`).
- [x] Add `target_compile_definitions(test_rbox_bound PRIVATE ARDUINO=10819)` so
  the test's own code compiles with the same struct layout.
- [x] Verify `test_rbox_bound` still passes — it tests radius clamping against
  U8G2's real rbox rendering and should be unaffected.

## 2. Add container-edge pixel tests

Add three new test cases to `test/test_bound_child_clip.cpp` (or a new file
`test/test_container_edge_pixels.cpp` if the existing file would become too
large). Use the same `real_display` infrastructure from `test_bound_child_clip.cpp`.

### Test (a): Element whose clip is exactly its bounds

An element occupying the full width and height of its container, drawing to its
last column and last row. No pixel must land outside the container, and the
boundary pixels (last column, last row) must be set.

- [x] Container at `(20, 10, 40, 20)`.
- [x] A child filling the entire container: same coordinates.
- [x] Draw with a solid fill (e.g. a progress bar at 100%, or a box).
- [x] Assert zero pixels outside the container.
- [x] Assert that the boundary pixels at `(59, 29)` (last column, last row) are
  set — this confirms drawing reaches the edge, not off-by-one.

### Test (b): Frame at negative origin (wrapped origins)

A frame (outline box) whose container is partly off the left edge of the display,
confirming the visible part is drawn correctly.

- [x] Container at `(-10, 5, 30, 15)` — left edge off-screen by 10 pixels.
- [x] Draw an outlined box occupying the full container.
- [x] Assert that the visible part (columns 0..19, rows 5..19) has the expected
  pixels: the right vertical edge at column 19, top edge at row 5, bottom edge
  at row 19.
- [x] Assert zero pixels to the left of column 0 (they can't exist).
- [x] Allow ~1 px endpoint rounding at corners per the bridge spec.

### Test (c): Clipped line

A line drawn inside a container where the line extends beyond the container
boundary, confirming clipping.

- [x] Container at `(30, 20, 30, 20)`.
- [x] A diagonal line from `(30, 20)` to `(70, 50)` — extends beyond the
  container's right and bottom edges.
- [x] Use `u8g2gl_draw_line()` inside a clip scope.
- [x] Assert zero pixels outside the container.
- [x] Allow ~1 px endpoint rounding at the clipping bound (per the bridge:
  "a corner pixel at the clipping bound").

## 3. Register new tests

- [x] If tests are in a new file, add the executable target to
  `test/CMakeLists.txt` following the same pattern as `test_bound_child_clip`:
  link `u8g2gl_u8g2_csrc_arduino`, `GTest::gtest_main`, include real U8G2
  headers, etc.
- [x] Ensure `gtest_discover_tests()` registers them.

## 4. Verify

- [x] `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build -j`
  — zero warnings.
- [x] `cd build && ctest --output-on-failure` — all tests pass including new ones.
- [x] `git branch --show-current` — `u8g2gl-06/wo2-container-edge-pixels`.

# Verification Requirement

Before committing, verify the build is clean and all tests pass. Use
conventional commit messages: `fix(test): link test_rbox_bound to csrc_arduino`,
`test(runtime): container-edge pixel tests`.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

---

## Completion Report (written by the worker at task completion)

### Status
complete

### Changes Made
- `test/CMakeLists.txt`:
  - Updated `test_rbox_bound` to link `u8g2gl_u8g2_csrc_arduino` instead of `u8g2gl_u8g2_csrc` and added `target_compile_definitions(test_rbox_bound PRIVATE ARDUINO=10819)` to ensure struct layout compatibility for `u8x8_t` (`pins[]` array under Arduino).
  - Registered `test_container_edge_pixels` executable target with real U8G2 objects (`u8g2gl_real_u8g2`), real Arduino C sources (`u8g2gl_u8g2_csrc_arduino`), and `GTest::gtest_main`, registered via `gtest_discover_tests`.
- `test/test_container_edge_pixels.cpp`:
  - Added new test file with real U8G2 SSD1306 128x64 display buffer testing infrastructure (`real_display`).
  - Added Test (a) (`ElementWhoseClipIsExactlyItsBoundsBox` & `ElementWhoseClipIsExactlyItsBoundsObject`): Tested both solid box draw call and 100% solid progress bar object at (20, 10, 40, 20), asserting 0 pixels outside container and boundary pixel (59, 29) is set.
  - Added Test (b) (`FrameAtNegativeOrigin`): Tested container at negative origin (-10, 5, 30, 15) with outline box, asserting 0 pixels outside visible area [0..19]x[5..19], right vertical edge at col 19, top edge at row 5, bottom edge at row 19, and unpainted interior.
  - Added Test (c) (`ClippedLineStaysInsideContainer`): Tested diagonal line from (30, 20) to (70, 50) inside container (30, 20, 30, 20) under clip scope, asserting 0 pixels outside container, origin pixel (30, 20) set, and bottom edge reached at row 39 with ~1px rounding allowance.

### Decisions Made
- **Dedicated Test File**: Placed container-edge pixel tests in `test/test_container_edge_pixels.cpp` rather than extending `test_bound_child_clip.cpp`. This preserves modularity, keeps target purposes distinct, and avoids coupling container coordinates across test suites.
- **Dual Realisation Coverage for Test (a)**: Verified both direct draw calls inside `u8g2gl_clip_scope` and class-backed widgets (`u8g2gl_progress_bar`) rendered through `u8g2gl_render_object`, proving both realisation models stay within container bounds and hit the far-corner boundary.

### Dead Ends & Warnings
- None. Build completed with zero warnings under `-Wall -Wextra -Wpedantic`.

### Out-of-Scope Findings
- None.

### Blockers
- None. All 510 tests passed (4 new tests + 506 baseline, 1 known skip).
