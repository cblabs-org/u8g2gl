---
work_order: WO1
project: pr-03-widgets
title: "Tier-1 Static Primitives + u8g2gl_label"
branch: u8g2gl-widgets/wo1-primitives-label
base: main
complexity: standard
status: pending
---

# WO1 — Tier-1 Static Primitives + u8g2gl_label

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was
approved by the human on 2026-09-10T07:10:37Z. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Objective

Build `u8g2gl_label` — the foundational text widget — and create the first widget
on the `u8g2gl_obj` base class. This WO establishes the pattern all subsequent
widget WOs follow.

## Branch

**Branch**: `u8g2gl-widgets/wo1-primitives-label`
**Base**: `main`

The branch has been created for you. Verify with `git branch --show-current`
before every commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval. Do NOT send a message asking to proceed. Build, test, commit, push.

## Checklist

### 1. Create `u8g2gl_label` header

File: `include/u8g2gl/u8g2gl_label.h`

Per the u8g2gl-standards skill (load it via `view_file` at
`.agents/skills/u8g2gl-standards/SKILL.md` before writing ANY code):

- SPDX-License-Identifier: MIT
- File header with Purpose, Description, Exported Classes
- Doxygen on every public method

The class:

```cpp
class u8g2gl_label : public u8g2gl_obj {
public:
    u8g2gl_label() = default;   // DEFAULT-CONSTRUCTIBLE — §13.7 contract

    // --- Content ---
    void set_text(const char* text);
    const char* get_text() const;

    // --- Lifecycle ---
    uint32_t tick(uint32_t now_ms) override;   // returns U8G2GL_IDLE (static)
    void render(U8G2& display) override;

private:
    const char* text_ = nullptr;  // Points to literal or bound string — no copy
};
```

Key design decisions:
- `text_` is a `const char*` pointer, NOT a buffer. No 128-byte textBuffer like
  the legacy LabelWidget. Text comes from either a string literal (set by
  generated code) or from a bound subject (which owns its own buffer). The label
  never copies.
- This means NO `strncpy`, NO `memset`, NO internal buffer. Just a pointer.
- Alignment, truncation, font come from the resolved style (`style_.align`,
  `style_.truncate`, `style_.font`) — not from label-specific members.

### 2. Create `u8g2gl_label` implementation

File: `src/u8g2gl_label.cpp`

**Port behaviour from LabelWidget.cpp** — specifically:

#### `set_text(const char* text)`
- Store the pointer. Mark dirty.

#### `tick(uint32_t now_ms)`
- Return `U8G2GL_IDLE`. Static text never animates.
- Suppress unused parameter warning: `(void)now_ms;`

#### `render(U8G2& display)`
Port the rendering logic from `LabelWidget::render()`:

1. **Early exit**: if `text_` is nullptr or empty, return.
2. **Apply font**: if `style_.font` is not nullptr, call `display.setFont(style_.font)`.
3. **Apply draw color**: `display.setDrawColor(static_cast<uint8_t>(style_.draw_color))`.
4. **Apply font mode**: `display.setFontMode(static_cast<uint8_t>(style_.font_mode))`.
5. **Vertical centering**: Calculate y offset from `display.getAscent()` and
   `display.getDescent()` against `h_`, matching LabelWidget's formula:
   `int fontHeight = display.getAscent() - display.getDescent();`
   `int yOffset = (h_ > 0) ? (h_ - fontHeight) / 2 : 0;`
6. **Alignment**: Based on `style_.align`:
   - LEFT: draw at `x_`
   - CENTER: measure text width with `display.getUTF8Width(text_)`, offset by
     `(w_ - textWidth) / 2`
   - RIGHT: offset by `w_ - textWidth`
7. **Truncation**: If `style_.truncate` is true and text is wider than `w_`,
   set clip window to bounds before drawing. The framework already sets clip
   in the render loop (§11.3), so this is handled. Draw with `display.drawUTF8()`.
8. **Draw**: `display.drawUTF8(drawX, y_ + yOffset, text_)` — use drawUTF8
   not drawStr for Unicode support.

**Do NOT port**: `isVisible` check (framework handles), `U8G2StateSaver`
construction (framework handles §11.3), `DrawingPrimitives.hpp` dependency.

### 3. Create test file

File: `test/test_label.cpp`

Tests (using the existing U8G2 stub):

```
TEST(Label, DefaultConstruction)
  - Default-constructed label has nullptr text
  - tick() returns U8G2GL_IDLE

TEST(Label, SetText)
  - set_text("Hello") stores the pointer
  - get_text() returns the same pointer
  - set_text(nullptr) clears to nullptr

TEST(Label, TickAlwaysIdle)
  - tick(0) == U8G2GL_IDLE
  - tick(999999) == U8G2GL_IDLE

TEST(Label, RenderWithNullText)
  - render() with nullptr text does not crash (no drawUTF8 call)

TEST(Label, RenderDrawsText)
  - Set text, font, coords
  - Call render() with stub display
  - Verify display.last_font is set

TEST(Label, SizeOf)
  - Print sizeof(u8g2gl_label)
  - RecordProperty for CI
  - EXPECT_LE(sizeof(u8g2gl_label), 72u) — base (64) + pointer (8 on 64-bit host)

TEST(Label, InheritsFromObj)
  - Verify u8g2gl_label* is convertible to u8g2gl_obj*
  - Verify virtual dispatch works (tick via base pointer)
```

### 4. Update build files

#### `CMakeLists.txt`
Add `src/u8g2gl_label.cpp` to the `add_library(u8g2gl STATIC ...)` list.

#### `test/CMakeLists.txt`
Add a new test executable `test_label` following the exact pattern of the
existing test targets (test_obj, test_subject, etc.):

```cmake
add_executable(test_label
    test_label.cpp
)
target_include_directories(test_label PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)
target_link_libraries(test_label PRIVATE
    u8g2gl
    GTest::gtest_main
)
target_compile_options(test_label PRIVATE
    -Wall -Wextra -Wpedantic
)
gtest_discover_tests(test_label)
```

### 5. Update U8G2 stub if needed

The existing `test/stubs/U8G2lib.h` already has `drawUTF8`, `getUTF8Width`,
`setFont`, `setDrawColor`, `setFontMode`, `getAscent`, `getDescent`.

Check if `getDisplayWidth()` and `getDisplayHeight()` are needed — add them
returning fixed values (128, 64) if so.

### 6. Build and test

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Debug -DU8G2GL_BUILD_TESTS=ON
cmake --build build 2>&1 | grep -c "warning:"   # Must be 0
cd build && ctest --output-on-failure
```

ALL existing tests must still pass. Zero warnings.

### 7. Commit and push

**VERIFY BRANCH FIRST:**
```bash
git branch --show-current   # Must show: u8g2gl-widgets/wo1-primitives-label
```

Then commit:
```bash
git add -A
git commit -m "feat(widgets): add u8g2gl_label — foundational text widget (PR-03 WO1)"
git push origin u8g2gl-widgets/wo1-primitives-label
```

## Strict Boundary Box

You may ONLY touch:
- `include/u8g2gl/u8g2gl_label.h` (NEW)
- `src/u8g2gl_label.cpp` (NEW)
- `test/test_label.cpp` (NEW)
- `CMakeLists.txt` (add source line)
- `test/CMakeLists.txt` (add test target)
- `test/stubs/U8G2lib.h` (add stub methods if needed)

You may NOT touch:
- Any existing `.h` or `.cpp` file in `include/u8g2gl/` or `src/` (except as listed above)
- Any CLI TypeScript code
- Any existing test files
- Any docs

## Constraints (REJECTION CRITERIA)

- No heap allocation. No `new`, no `malloc`, no `std::string`, no `std::vector`.
- No `std::function` stored as a member.
- Every new enum gets `explicit : uint8_t` base type.
- `u8g2gl_label` MUST be default-constructible. No constructor arguments.
- `tick()` returns `U8G2GL_IDLE`.
- Zero warnings under `-Wall -Wextra -Wpedantic`.
- All existing tests keep passing.
- Documentation: SPDX header, file purpose, Doxygen on public API. This is not
  optional — PR-01 shipped without docs and needed remediation.

## Completion Report Template

Append this to the bottom of this file when done:

```
## Completion Report
- **Date**: YYYY-MM-DDTHH:MM:SSZ
- **Status**: COMPLETE / PARTIAL / BLOCKED
- **Commit**: <sha>
- **Branch verified**: yes/no
- **Tests**: X passed, Y failed
- **Warnings**: N
- **sizeof(u8g2gl_label)**: N bytes (host: 64-bit)
- **Notes**: <any observations>
```
