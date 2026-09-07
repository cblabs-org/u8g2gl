---
name: pr-01-runtime-core-wo4
description: Handoff instructions for Work Order 4 — Style System
complexity: standard
---

# WO4 — Style System

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create new branches, and do not plan beyond this checklist.
> Your task is strictly limited to executing the checklist below.

## Objective

Implement the reduced monochrome style set per spec §10. A `u8g2gl_style` struct
holding 10 properties with per-property "set" flags for cascade/merge. Style
application to objects with inline `style_*` overrides taking precedence. This is
a data system — it defines what style properties exist and how they merge, but it
does NOT render anything (that's PR-03's job).

## Parent Project

This WORKORDER belongs to **PR-01: Runtime Core**.
- Project file: `.agents/skills/principal-architect-workspace/pr-01-runtime-core/PROJECT.md`
- Human approval of the decomposition is recorded there at `2026-09-07T22:16:09Z`.

## Strict Boundary Box

**DO NOT:**
- Implement concrete widgets or rendering — that is PR-03
- Implement the frame gate or `ui_handler()` — that is WO5
- Write any XML, schema, or generator code — that is PR-02/PR-04
- Create additional branches — work only on `u8g2gl-runtime/wo4-styles`
- Use namespaces — flat `u8g2gl_` / `U8G2GL_` prefixes only ([D-12]/[D-13])
- Use dynamic allocation — [D-1]
- Implement part+state selectors or `<bind_style>` — spec §10 explicitly omits these
- Modify WO1–WO3 files unless strictly necessary for integration (explain why)

## Tooling Constraints

- Build: CMake (already set up). Add new source files to the `u8g2gl` library target.
- Test: GoogleTest. Add new test files in `test/`.

## Reference — Spec Context

Read these for context:
- [design_spec.md §10](../../../docs/design_spec.md) — Styling: the 10 properties, omissions
- [design_spec.md §13.7](../../../docs/design_spec.md) — Generated init applies styles via setters
- [u8g2gl_types.h](../../../include/u8g2gl/u8g2gl_types.h) — Enums already defined (align, color, font_mode, bitmap_mode)

## Line-Item Instructions

### 1. Style Struct — `include/u8g2gl/u8g2gl_style.h`

- [x] Create the style header. The style struct holds 10 properties per §10,
  plus a bitmask indicating which properties have been explicitly set (for
  cascade/merge — an unset property does not override a previously applied one):

```cpp
#ifndef U8G2GL_STYLE_H
#define U8G2GL_STYLE_H

#include "u8g2gl_types.h"
#include <cstdint>

// Bitmask for which properties are set in a style
enum u8g2gl_style_prop_t : uint16_t {
    U8G2GL_STYLE_FONT         = (1 << 0),
    U8G2GL_STYLE_DRAW_COLOR   = (1 << 1),
    U8G2GL_STYLE_INVERT       = (1 << 2),
    U8G2GL_STYLE_PADDING      = (1 << 3),
    U8G2GL_STYLE_BORDER       = (1 << 4),
    U8G2GL_STYLE_RADIUS       = (1 << 5),
    U8G2GL_STYLE_ALIGN        = (1 << 6),
    U8G2GL_STYLE_TRUNCATE     = (1 << 7),
    U8G2GL_STYLE_FONT_MODE    = (1 << 8),
    U8G2GL_STYLE_BITMAP_MODE  = (1 << 9),
};

struct u8g2gl_style {
    // Properties
    const uint8_t* font = nullptr;        // U8G2 font pointer
    u8g2gl_color_t draw_color = U8G2GL_COLOR_1;
    bool invert = false;
    int16_t padding = 0;
    bool border = false;
    int16_t radius = 0;
    u8g2gl_align_t align = U8G2GL_ALIGN_LEFT;
    bool truncate = false;
    u8g2gl_font_mode_t font_mode = U8G2GL_FONT_MODE_SOLID;
    u8g2gl_bitmap_mode_t bitmap_mode = U8G2GL_BITMAP_MODE_SOLID;

    // Which properties are explicitly set
    uint16_t set_mask = 0;

    // --- Setters that also mark the property as set ---
    void set_font(const uint8_t* f);
    void set_draw_color(u8g2gl_color_t c);
    void set_invert(bool v);
    void set_padding(int16_t p);
    void set_border(bool b);
    void set_radius(int16_t r);
    void set_align(u8g2gl_align_t a);
    void set_truncate(bool t);
    void set_font_mode(u8g2gl_font_mode_t m);
    void set_bitmap_mode(u8g2gl_bitmap_mode_t m);

    // --- Query ---
    bool has(u8g2gl_style_prop_t prop) const;

    // --- Merge: apply all SET properties from `other` onto this style ---
    // Properties in `other` that are not set do not overwrite.
    // This is how cascade works: base style + inline overrides.
    void merge_from(const u8g2gl_style& other);

    // --- Reset ---
    void clear();
};

#endif // U8G2GL_STYLE_H
```

### 2. Style Implementation — `src/u8g2gl_style.cpp`

- [x] Implement all methods:
  - Each `set_*` method: assign the value AND set the corresponding bit in `set_mask`
  - `has(prop)`: `return (set_mask & prop) != 0;`
  - `merge_from(other)`: for each property, if `other.has(prop)`, copy the value and
    set the bit. Properties NOT set in `other` are left untouched in `this`.
  - `clear()`: zero everything, reset `set_mask = 0`

### 3. Style Application on u8g2gl_obj

- [x] Add style support to `u8g2gl_obj`. The generated code (§13.7) applies styles
  during `init()`. The base class needs:

  Add to `u8g2gl_obj.h`:
  ```cpp
  // Forward declaration
  struct u8g2gl_style;

  // In the public section of u8g2gl_obj:
  void apply_style(const u8g2gl_style& style);
  const u8g2gl_style& get_resolved_style() const;

  // Also add individual style setters that generated code calls as inline overrides:
  void set_font(const uint8_t* font);
  void set_draw_color(u8g2gl_color_t c);
  void set_invert(bool v);
  void set_padding(int16_t p);
  void set_border(bool b);
  void set_radius(int16_t r);
  void set_align(u8g2gl_align_t a);
  void set_truncate(bool t);
  void set_font_mode(u8g2gl_font_mode_t m);
  void set_bitmap_mode(u8g2gl_bitmap_mode_t m);
  ```

  Add to protected section:
  ```cpp
  u8g2gl_style style_;    // resolved style for this object
  ```

  **How style cascade works at init time (§13.7):**
  ```cpp
  // Generated code does this:
  label.apply_style(ui_style_header);       // named style first
  label.set_align(U8G2GL_ALIGN_CENTER);     // inline override wins
  ```

  `apply_style()` calls `style_.merge_from(style)`.
  Individual `set_*` methods on the object call the corresponding `style_.set_*`,
  so inline overrides always mark their bit and win the cascade.

### 4. Update CMakeLists.txt

- [x] Add `src/u8g2gl_style.cpp` to the `u8g2gl` library target.

### 5. Tests — `test/test_style.cpp`

- [x] Create unit tests:

```
--- Style Struct ---
TEST(Style, DefaultState)
  - Default-constructed: set_mask = 0
  - has(U8G2GL_STYLE_FONT) is false for all props

TEST(Style, SetMarksFlag)
  - set_font(ptr) → has(U8G2GL_STYLE_FONT) is true
  - font == ptr
  - Other properties still unset

TEST(Style, SetAllProperties)
  - Set all 10 properties
  - set_mask has all 10 bits set
  - Each getter returns the set value

TEST(Style, Clear)
  - Set some properties, then clear()
  - set_mask = 0, values reset to defaults

--- Merge / Cascade ---
TEST(Style, MergeOverwritesSetProps)
  - base: font=A, align=LEFT (both set)
  - overlay: align=CENTER (only align set)
  - merge_from(overlay) → font=A (kept), align=CENTER (overwritten)

TEST(Style, MergeDoesNotOverwriteUnsetProps)
  - base: font=A, draw_color=1 (both set)
  - overlay: font=B (only font set, draw_color NOT set)
  - merge_from(overlay) → font=B, draw_color=1 (kept from base)

TEST(Style, MergeOntoEmpty)
  - empty base (set_mask=0)
  - overlay with font=A
  - merge → font=A, only font bit set

TEST(Style, MultipleMerges)
  - base → merge(style1) → merge(style2)
  - Last merge wins for overlapping properties
  - Non-overlapping properties accumulate

--- Object Style Application ---
TEST(ObjStyle, ApplyStyle)
  - Create a u8g2gl_obj
  - apply_style(style with font and align set)
  - get_resolved_style() has font and align

TEST(ObjStyle, InlineOverrideWins)
  - apply_style(style with align=LEFT)
  - obj.set_align(U8G2GL_ALIGN_CENTER)
  - resolved style has align=CENTER

TEST(ObjStyle, MultipleStylesStack)
  - apply_style(base_style)
  - apply_style(override_style)
  - Result is the cascade

TEST(ObjStyle, SizeUnchanged)
  - sizeof(u8g2gl_obj) with style_ member — measure and report
  - (This will increase from 24B due to the style_ member — that's expected
    and correct; the 16B figure was the pre-style base)
```

### 6. Register test file

- [x] Add `test/test_style.cpp` to `test/CMakeLists.txt` as a new test
  executable `test_style`. Link against `u8g2gl` and `GTest::gtest_main`.

### 7. Build and Verify

- [x] Build: `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build`
- [x] Run: `cd build && ctest --output-on-failure`
- [x] All previous tests AND all new style tests must pass
- [x] Zero warnings under `-Wall -Wextra -Wpedantic`
- [x] Print `sizeof(u8g2gl_obj)` and `sizeof(u8g2gl_style)` in the test output

### 8. Commit

- [x] Stage all new and modified files and commit:
  ```
  feat(runtime): add reduced monochrome style system with cascade

  - u8g2gl_style: 10 properties per spec §10 with per-property set flags
  - Cascade/merge: named styles + inline overrides, last-set wins
  - Style setters on u8g2gl_obj matching generated code patterns (§13.7)
  - Enum types already established in WO1 (align, color, font/bitmap mode)
  - Unit tests for cascade, merge, and object application

  Part of PR-01: Runtime Core (WO4)
  ```

## Verification Requirement

Build must complete with zero warnings. All tests must pass.
**CRITICAL:** Before committing, ask the user if they are happy with the changes.

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly.

**Note:** Adding `u8g2gl_style` as a member of `u8g2gl_obj` will increase
sizeof beyond the original 16B/24B. This is expected — the 16B figure was
the pre-style base in PD-3. Report the new measured size so the PA can
document it accurately for PR-03/PR-04.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete

### Changes Made
- `include/u8g2gl/u8g2gl_style.h` — Defined property bitmask enum `u8g2gl_style_prop_t` and `u8g2gl_style` struct with the 10 reduced monochrome style properties per spec §10 (`font`, `draw_color`, `invert`, `padding`, `border`, `radius`, `align`, `truncate`, `font_mode`, `bitmap_mode`), tracking mask `set_mask`, setters marking set bits, query `has()`, cascade merge `merge_from()`, and `clear()`.
- `src/u8g2gl_style.cpp` — Implementation of `u8g2gl_style` methods: each setter assigns value and marks the property bit in `set_mask`; `has()` checks `set_mask & prop`; `merge_from()` cascades all set properties from source style onto destination style while leaving unset properties intact; `clear()` resets values to defaults and `set_mask = 0`.
- `include/u8g2gl/u8g2gl_obj.h` & `src/u8g2gl_obj.cpp` — Added `apply_style()`, `get_resolved_style()`, individual inline style override setters (`set_font`, `set_draw_color`, `set_invert`, `set_padding`, `set_border`, `set_radius`, `set_align`, `set_truncate`, `set_font_mode`, `set_bitmap_mode`), and protected member `u8g2gl_style style_` on `u8g2gl_obj`. `apply_style()` delegates to `style_.merge_from(style)` and inline setters delegate to `style_.set_*()`, establishing correct style cascade order per spec §13.7.
- `CMakeLists.txt` — Added `src/u8g2gl_style.cpp` to `u8g2gl` library target.
- `test/CMakeLists.txt` — Added `test_style` test executable linking against `u8g2gl` and `GTest::gtest_main`.
- `test/test_style.cpp` — 12 unit tests covering style struct default state, flag setting on `set_*`, all 10 properties, `clear()`, cascade merge overwrites set properties, cascade merge preserves unset properties, empty base merge, multi-merge accumulation and override, object style application, inline override precedence over named styles, multiple style stacking on objects, and sizeof measurement reporting.
- `test/test_obj.cpp` — Updated `Obj.SizeOf` test expectation to accommodate the embedded `u8g2gl_style` member (increased from 24B pre-style base to 64B on 64-bit platforms).

### Decisions Made
- Embedded `u8g2gl_style style_` as a direct member of `u8g2gl_obj` as specified in WO4 instructions. While this increases `sizeof(u8g2gl_obj)` from 24 bytes to 64 bytes on 64-bit systems (40 bytes style struct), it provides deterministic, zero-allocation storage for resolved object styles and direct inline override resolution.
- Style properties are public fields in `u8g2gl_style` for fast direct access by renderers (PR-03) while setter methods mutate values and atomically update `set_mask` for cascade correctness.
- Zero namespaces used, conforming strictly to `u8g2gl_` / `U8G2GL_` flat symbol prefixes per [D-12]/[D-13].

### Dead Ends & Warnings
- None. Build completed with zero warnings under `-Wall -Wextra -Wpedantic`. All 56 tests across all 4 test targets passed (100%).

### Out-of-Scope Findings
- Measured sizes on 64-bit host:
  - `sizeof(u8g2gl_style) = 40 bytes`
  - `sizeof(u8g2gl_obj) = 64 bytes`
  (The increase in `sizeof(u8g2gl_obj)` from 24B base was noted and expected in the workorder).

### Blockers
- None.
