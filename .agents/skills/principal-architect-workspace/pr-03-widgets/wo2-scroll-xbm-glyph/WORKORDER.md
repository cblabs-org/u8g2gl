---
work_order: WO2
project: pr-03-widgets
title: "u8g2gl_scrolling_label + u8g2gl_xbm + u8g2gl_glyph"
branch: u8g2gl-widgets/wo2-scroll-xbm-glyph
base: u8g2gl-widgets/wo1-primitives-label
complexity: standard
status: complete
---

# WO2 — u8g2gl_scrolling_label + u8g2gl_xbm + u8g2gl_glyph

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was
approved by the human on 2026-09-10T07:10:37Z. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Objective

Build three widgets: the animated scrolling label (most complex — port from
ScrollingTextWidget), the static XBM bitmap display (port from ImageWidget), and
the glyph widget (new, simple).

## Branch

**Branch**: `u8g2gl-widgets/wo2-scroll-xbm-glyph`
**Base**: `u8g2gl-widgets/wo1-primitives-label`

The branch has been created for you. Verify with `git branch --show-current`
before every commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval. Do NOT send a message asking to proceed. Build, test, commit, push.

## Standards

Read BEFORE writing any code:
- `.agents/skills/u8g2gl-standards/SKILL.md`
- `.agents/skills/u8g2gl-standards/references/documentation.md`
- `.agents/skills/u8g2gl-standards/references/cpp.md`

## Checklist

### Widget 1: `u8g2gl_scrolling_label`

The most complex widget in this WO. Port behaviour from
`esp32-app-foundation/modules/U8G2Display/widgets/ScrollingTextWidget`.

#### Header: `include/u8g2gl/u8g2gl_scrolling_label.h`

```cpp
class u8g2gl_scrolling_label : public u8g2gl_obj {
public:
    u8g2gl_scrolling_label() = default;

    // --- Content ---
    void set_text(const char* text);
    const char* get_text() const;

    // --- Scroll configuration ---
    void set_scroll_px_per_sec(uint8_t px);   // default 25
    void set_initial_delay_ms(uint16_t ms);   // default 3000
    void set_static_dwell_ms(uint16_t ms);    // default 5000

    // --- Query ---
    bool is_scroll_finished() const;
    void reset_scroll();

    // --- Lifecycle ---
    uint32_t tick(uint32_t now_ms) override;
    void render(U8G2& display) override;
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    const char* text_ = nullptr;
    int16_t scroll_x_ = 0;
    int16_t message_width_ = 0;
    uint32_t last_scroll_ms_ = 0;
    uint16_t initial_delay_ms_ = 3000;
    uint16_t static_dwell_ms_ = 5000;
    uint8_t scroll_px_per_sec_ = 25;
    bool needs_scroll_ = false;
    bool needs_layout_ = true;
    bool scroll_finished_ = false;
};
```

#### Implementation: `src/u8g2gl_scrolling_label.cpp`

**Port these behaviours from ScrollingTextWidget.cpp:**

1. **`set_text()`**: Store pointer. If text changed (compare pointers — text is
   either a literal or a subject buffer, both stable addresses), set
   `needs_layout_ = true`, `scroll_finished_ = false`. Mark dirty.

2. **`tick(now_ms)`** — the core scroll math:
   - If `needs_layout_`, cannot tick (needs render first for measurement). Return 1 (request immediate frame).
   - **Initial delay**: If `last_scroll_ms_ == 0`, set
     `last_scroll_ms_ = now_ms + initial_delay_ms_`. Return `initial_delay_ms_`.
   - **Static text (no scroll needed)**: If `!needs_scroll_`, check dwell timer.
     After `static_dwell_ms_` past `last_scroll_ms_`, set `scroll_finished_ = true`.
     Return remainder of dwell or `U8G2GL_IDLE` if finished.
   - **Scrolling**: If `now_ms > last_scroll_ms_`:
     - `scroll_x_++`
     - If `scroll_x_ > message_width_ + 30`: `scroll_finished_ = true`,
       wrap `scroll_x_ = -(int16_t)w_` (re-enter from right edge)
     - Calculate interval from `scroll_px_per_sec_`: `interval_ms = 1000 / scroll_px_per_sec_`
     - `last_scroll_ms_ = now_ms + interval_ms`
     - `mark_dirty()`
     - Return `interval_ms`

3. **`render(display)`**:
   - If text null/empty, return.
   - If `needs_layout_`: measure text width with `display.getUTF8Width(text_)`,
     compare against `w_`. Set `needs_scroll_`. Call `reset_scroll()`.
     Set `needs_layout_ = false`.
   - Apply font, draw color from style.
   - If scrolling: set clip window, draw at `x_ - scroll_x_`.
   - If static: center text (same as label).

4. **`render_animation_update(display, now_ms)`**:
   - If not scrolling, tick and return.
   - Save old `scroll_x_`, call `tick(now_ms)`. If changed: re-render own region,
     call `u8g2gl_partial_refresh()`.

5. **`reset_scroll()`**: `scroll_x_ = 0`, `last_scroll_ms_ = 0`,
   `scroll_finished_ = false`. Mark dirty.

#### Tests: `test/test_scrolling_label.cpp`

```
TEST(ScrollingLabel, DefaultConstruction)
TEST(ScrollingLabel, SetText)
TEST(ScrollingLabel, TickReturnsDeadlineNotIdle)  // when text set
TEST(ScrollingLabel, InitialDelayBeforeScroll)
TEST(ScrollingLabel, ResetScroll)
TEST(ScrollingLabel, ConfigurableScrollSpeed)
TEST(ScrollingLabel, SizeOf)
  - EXPECT_LE(sizeof(u8g2gl_scrolling_label), 88u)
```

---

### Widget 2: `u8g2gl_xbm`

Port from ImageWidget. Simple — just an XBM pointer and drawXBMP.

#### Header: `include/u8g2gl/u8g2gl_xbm.h`

```cpp
class u8g2gl_xbm : public u8g2gl_obj {
public:
    u8g2gl_xbm() = default;

    void set_src(const uint8_t* bits);
    const uint8_t* get_src() const;

    uint32_t tick(uint32_t now_ms) override;   // returns U8G2GL_IDLE
    void render(U8G2& display) override;

private:
    const uint8_t* bits_ = nullptr;
};
```

#### Implementation: `src/u8g2gl_xbm.cpp`

- `set_src()`: Store pointer, mark dirty.
- `tick()`: Return `U8G2GL_IDLE`.
- `render()`: If `bits_` is nullptr, return. Otherwise:
  `display.setDrawColor(static_cast<uint8_t>(style_.draw_color));`
  `display.setBitmapMode(static_cast<uint8_t>(style_.bitmap_mode));`
  `display.drawXBMP(x_, y_, w_, h_, bits_);`

#### Tests: `test/test_xbm.cpp`

```
TEST(Xbm, DefaultConstruction)    // bits_ is nullptr
TEST(Xbm, SetSrc)                 // stores pointer
TEST(Xbm, TickAlwaysIdle)
TEST(Xbm, RenderWithNullSrc)      // no crash
TEST(Xbm, SizeOf)                 // EXPECT_LE(sizeof(u8g2gl_xbm), 80u)
```

---

### Widget 3: `u8g2gl_glyph`

New widget (no legacy equivalent). Renders a single Unicode glyph from a font.

#### Header: `include/u8g2gl/u8g2gl_glyph.h`

```cpp
class u8g2gl_glyph : public u8g2gl_obj {
public:
    u8g2gl_glyph() = default;

    void set_glyph(uint16_t codepoint);
    uint16_t get_glyph() const;

    uint32_t tick(uint32_t now_ms) override;   // returns U8G2GL_IDLE
    void render(U8G2& display) override;

private:
    uint16_t glyph_ = 0;
};
```

#### Implementation: `src/u8g2gl_glyph.cpp`

- `set_glyph()`: Store codepoint, mark dirty.
- `tick()`: Return `U8G2GL_IDLE`.
- `render()`: If `glyph_ == 0`, return. Apply font and draw color from style.
  `display.drawGlyph(x_, y_, glyph_);`

#### Tests: `test/test_glyph.cpp`

```
TEST(Glyph, DefaultConstruction)    // glyph_ is 0
TEST(Glyph, SetGlyph)              // stores codepoint
TEST(Glyph, TickAlwaysIdle)
TEST(Glyph, RenderWithZeroGlyph)   // no crash
TEST(Glyph, SizeOf)                // EXPECT_LE(sizeof(u8g2gl_glyph), 72u)
```

---

### Build file updates

#### `CMakeLists.txt`
Add to `add_library(u8g2gl STATIC ...)`:
- `src/u8g2gl_scrolling_label.cpp`
- `src/u8g2gl_xbm.cpp`
- `src/u8g2gl_glyph.cpp`

#### `test/CMakeLists.txt`
Add three new test executables following the existing pattern:
`test_scrolling_label`, `test_xbm`, `test_glyph`

### Build and test

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Debug -DU8G2GL_BUILD_TESTS=ON
cmake --build build 2>&1 | grep -c "warning:"   # Must be 0
cd build && ctest --output-on-failure
```

ALL existing tests must pass. Zero warnings.

### Commit and push

**VERIFY BRANCH FIRST:**
```bash
git branch --show-current   # Must show: u8g2gl-widgets/wo2-scroll-xbm-glyph
```

Commit all three widgets together:
```bash
git add -A
git commit -m "feat(widgets): add u8g2gl_scrolling_label, u8g2gl_xbm, u8g2gl_glyph (PR-03 WO2)"
git push origin u8g2gl-widgets/wo2-scroll-xbm-glyph
```

## Strict Boundary Box

You may ONLY touch:
- `include/u8g2gl/u8g2gl_scrolling_label.h` (NEW)
- `include/u8g2gl/u8g2gl_xbm.h` (NEW)
- `include/u8g2gl/u8g2gl_glyph.h` (NEW)
- `src/u8g2gl_scrolling_label.cpp` (NEW)
- `src/u8g2gl_xbm.cpp` (NEW)
- `src/u8g2gl_glyph.cpp` (NEW)
- `test/test_scrolling_label.cpp` (NEW)
- `test/test_xbm.cpp` (NEW)
- `test/test_glyph.cpp` (NEW)
- `CMakeLists.txt` (add source lines)
- `test/CMakeLists.txt` (add test targets)
- `test/stubs/U8G2lib.h` (add stub methods if needed)

You may NOT touch existing widget files, CLI code, or docs.

## Constraints (REJECTION CRITERIA)

- No heap allocation. No `new`, no `malloc`, no `std::string`, no `std::vector`.
- No `std::function` stored as a member.
- Every new enum gets `explicit : uint8_t` base type.
- All widgets MUST be default-constructible. No constructor arguments.
- `tick()` returns its own next deadline; `U8G2GL_IDLE` if not animating.
- Zero warnings under `-Wall -Wextra -Wpedantic`.
- All existing tests keep passing.
- Full documentation: SPDX header, file purpose, Doxygen on public API.

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
- **sizeof(u8g2gl_scrolling_label)**: N bytes
- **sizeof(u8g2gl_xbm)**: N bytes
- **sizeof(u8g2gl_glyph)**: N bytes
- **Notes**: <any observations>
```

## Completion Report
- **Date**: 2026-09-10T07:25:00Z
- **Status**: COMPLETE
- **Commit**: 3675821
- **Branch verified**: yes (u8g2gl-widgets/wo2-scroll-xbm-glyph)
- **Tests**: 118 passed, 0 failed
- **Warnings**: 0
- **sizeof(u8g2gl_scrolling_label)**: 72 bytes (host: 64-bit, budget <= 88 bytes)
- **sizeof(u8g2gl_xbm)**: 56 bytes (host: 64-bit, budget <= 80 bytes)
- **sizeof(u8g2gl_glyph)**: 56 bytes (host: 64-bit, budget <= 72 bytes)
- **Notes**: All three widgets implemented with zero heap allocation, zero-copy pointer semantics, and full documentation compliance. Verified zero compiler warnings under -Wall -Wextra -Wpedantic, 118 passing tests across the entire suite.

