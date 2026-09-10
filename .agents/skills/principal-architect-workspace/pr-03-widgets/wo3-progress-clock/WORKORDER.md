---
work_order: WO3
project: pr-03-widgets
title: "u8g2gl_progress_bar + u8g2gl_clock"
branch: u8g2gl-widgets/wo3-progress-clock
base: u8g2gl-widgets/wo2-scroll-xbm-glyph
complexity: standard
status: pending
---

# WO3 — u8g2gl_progress_bar + u8g2gl_clock

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was
approved by the human on 2026-09-10T07:10:37Z. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Objective

Build the progress bar (animated interpolation + stipple fill) and clock
(dual-font + blink) widgets. Both port behaviour from legacy; both have
animation that makes `tick()` return real deadlines.

## Branch

**Branch**: `u8g2gl-widgets/wo3-progress-clock`
**Base**: `u8g2gl-widgets/wo2-scroll-xbm-glyph`

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

### Widget 1: `u8g2gl_progress_bar`

Port from `esp32-app-foundation/modules/U8G2Display/widgets/ProgressBarWidget`.

#### Header: `include/u8g2gl/u8g2gl_progress_bar.h`

```cpp
/// Fill pattern for the progress bar
enum u8g2gl_fill_style_t : uint8_t {
    U8G2GL_FILL_SOLID = 0,
    U8G2GL_FILL_STIPPLE = 1,
};

class u8g2gl_progress_bar : public u8g2gl_obj {
public:
    u8g2gl_progress_bar() = default;

    // --- Configuration ---
    void set_value(uint8_t percent);          // 0-100, clamped
    void set_animate_duration_ms(uint16_t ms); // 0 = instant
    void set_fill_style(u8g2gl_fill_style_t s);
    void set_show_percent_text(bool show);

    // --- Query ---
    uint8_t get_value() const;

    // --- Lifecycle ---
    uint32_t tick(uint32_t now_ms) override;
    void render(U8G2& display) override;
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    uint32_t anim_start_ms_ = 0;
    uint16_t anim_duration_ms_ = 0;
    uint8_t current_percent_ = 0;
    uint8_t target_percent_ = 0;
    uint8_t start_percent_ = 0;
    u8g2gl_fill_style_t fill_style_ = U8G2GL_FILL_STIPPLE;
    bool show_percent_text_ = false;
};
```

#### Implementation: `src/u8g2gl_progress_bar.cpp`

Port from ProgressBarWidget.cpp:

1. **`set_value(percent)`**: Clamp 0-100. If `anim_duration_ms_ > 0`:
   `start_percent_ = current_percent_`, `target_percent_ = percent`,
   `anim_start_ms_ = 0` (lazy init on next tick). Else instant:
   `current_percent_ = target_percent_ = percent`. Mark dirty.

2. **`tick(now_ms)`**: If animating (`current_percent_ != target_percent_`):
   - Lazy init: if `anim_start_ms_ == 0`, set it to `now_ms`.
   - `elapsed = now_ms - anim_start_ms_`
   - If `elapsed >= anim_duration_ms_`: snap to target.
   - Else: integer lerp: `current = start + range * elapsed / duration`
   - Mark dirty if changed.
   - Return `16` (≈60 FPS update) while animating.
   - Return `U8G2GL_IDLE` when at target.

3. **`render(display)`**:
   - Apply font from style (for percent text).
   - Draw the bar track: `display.drawFrame(x_, y_, w_, h_)`.
   - Calculate fill width: `fill = (current_percent_ * (w_ - 2)) / 100`.
   - **Stipple fill** (the signature visual from ProgressBarWidget):
     ```cpp
     if (fill_style_ == U8G2GL_FILL_STIPPLE) {
         for (int16_t i = 0; i < fill; i++) {
             bool toggle = (i % 2 == 0);
             for (int16_t row = 0; row < h_ - 2; row++) {
                 if ((row + (toggle ? 0 : 1)) % 2 == 0) {
                     display.drawPixel(x_ + 1 + i, y_ + 1 + row);
                 }
             }
         }
     } else {
         display.drawBox(x_ + 1, y_ + 1, fill, h_ - 2);
     }
     ```
   - If `show_percent_text_`: format "NN%" using `snprintf` into a small
     stack buffer (`char buf[5]`), draw centered in the bar.

4. **`render_animation_update(display, now_ms)`**: tick, if changed render and
   call `u8g2gl_partial_refresh()`.

#### Tests: `test/test_progress_bar.cpp`

```
TEST(ProgressBar, DefaultConstruction)
  - current_percent_ == 0

TEST(ProgressBar, SetValueClamped)
  - set_value(50) -> get_value() == 50
  - set_value(150) -> get_value() == 100
  - set_value(200) -> get_value() == 100  // unsigned, so clamp at 100

TEST(ProgressBar, InstantTransition)
  - set_animate_duration_ms(0)
  - set_value(75)
  - tick(0) returns U8G2GL_IDLE (already at target)

TEST(ProgressBar, AnimatedTransition)
  - set_animate_duration_ms(1000)
  - set_value(100)
  - tick(0) returns non-IDLE (animating)
  - tick(500) returns non-IDLE
  - tick(1000) returns U8G2GL_IDLE (animation complete)

TEST(ProgressBar, SizeOf)
  - EXPECT_LE(sizeof(u8g2gl_progress_bar), 80u)
```

---

### Widget 2: `u8g2gl_clock`

Port from `esp32-app-foundation/modules/U8G2Display/widgets/ClockWidget`.

#### Header: `include/u8g2gl/u8g2gl_clock.h`

```cpp
/// Clock display format
enum u8g2gl_clock_format_t : uint8_t {
    U8G2GL_CLOCK_HH_MM = 0,
    U8G2GL_CLOCK_HH_MM_SS = 1,
};

class u8g2gl_clock : public u8g2gl_obj {
public:
    u8g2gl_clock() = default;

    // --- Configuration ---
    void set_format(u8g2gl_clock_format_t fmt);
    void set_secondary_font(const uint8_t* font);
    void set_blink(bool enable);

    // --- Time input ---
    // Clock does NOT inject a TimeManager. It receives epoch seconds via
    // set_time() or a subject binding. The application or a binding adapter
    // calls set_time() from whatever time source it has.
    void set_time(uint32_t epoch_seconds);

    // --- Lifecycle ---
    uint32_t tick(uint32_t now_ms) override;
    void render(U8G2& display) override;
    void render_animation_update(U8G2& display, uint32_t now_ms) override;

private:
    const uint8_t* secondary_font_ = nullptr;
    uint32_t epoch_seconds_ = 0;
    uint32_t last_blink_ms_ = 0;
    u8g2gl_clock_format_t format_ = U8G2GL_CLOCK_HH_MM;
    bool show_colon_ = true;
    bool blink_enabled_ = true;
};
```

**Key design adaptation**: The legacy ClockWidget takes a `TimeManager*` pointer.
U8G2GL rejects dependency injection of framework services — the widget receives
time through `set_time()` or a subject binding to an `int` subject carrying epoch
seconds. The application calls `set_time()` from whatever time source it has.

#### Implementation: `src/u8g2gl_clock.cpp`

Port from ClockWidget.cpp:

1. **`set_time(epoch_seconds)`**: Store value, mark dirty.

2. **`tick(now_ms)`**: If `blink_enabled_`:
   - Check if 500ms have elapsed since `last_blink_ms_`.
   - If so: `show_colon_ = !show_colon_`, `last_blink_ms_ = now_ms`, mark dirty.
   - Return remainder to next blink toggle (500 - elapsed).
   - If blink disabled: return `U8G2GL_IDLE`.

3. **`render(display)`** — the dual-font alignment logic from ClockWidget:
   - Decompose `epoch_seconds_` to hours, minutes, seconds using integer math:
     ```cpp
     uint32_t day_seconds = epoch_seconds_ % 86400;
     uint8_t hours = day_seconds / 3600;
     uint8_t minutes = (day_seconds % 3600) / 60;
     uint8_t seconds = day_seconds % 60;
     ```
   - Format: `snprintf(hourStr, 3, "%02u", hours)` etc. Stack buffers only.
   - **Right-aligned digit columns** (the key visual from ClockWidget):
     - Measure max "00" width for each column.
     - Right-align each digit group within its max-width box.
     - This keeps digits from jumping when they change (e.g. "1" vs "11").
   - **Secondary font for seconds**: If `secondary_font_` set and format is
     HH_MM_SS, switch font for the seconds portion. Align baselines
     (bottom-align the two fonts' descenders).
   - **Colon blink**: Draw colon only if `show_colon_`.
   - **Alignment**: Use `style_.align` for overall positioning within bounds.

4. **`render_animation_update(display, now_ms)`**: tick, if visual state changed,
   re-render and partial refresh.

#### Tests: `test/test_clock.cpp`

```
TEST(Clock, DefaultConstruction)
  - blink_enabled_ is true
  - format is HH_MM

TEST(Clock, SetTime)
  - set_time(3661) -> 01:01:01

TEST(Clock, BlinkToggle)
  - tick(0) -> returns ~500
  - tick(500) -> show_colon toggles
  - tick(1000) -> show_colon toggles again

TEST(Clock, BlinkDisabled)
  - set_blink(false)
  - tick(anything) returns U8G2GL_IDLE

TEST(Clock, SetFormat)
  - set_format(U8G2GL_CLOCK_HH_MM_SS) accepted

TEST(Clock, SizeOf)
  - EXPECT_LE(sizeof(u8g2gl_clock), 88u)
```

---

### Build file updates

Add all new source files to `CMakeLists.txt` and test targets to `test/CMakeLists.txt`.

### Build and test

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Debug -DU8G2GL_BUILD_TESTS=ON
cmake --build build 2>&1 | grep -c "warning:"   # Must be 0
cd build && ctest --output-on-failure
```

### Commit and push

**VERIFY BRANCH FIRST:**
```bash
git branch --show-current   # Must show: u8g2gl-widgets/wo3-progress-clock
```

```bash
git add -A
git commit -m "feat(widgets): add u8g2gl_progress_bar, u8g2gl_clock (PR-03 WO3)"
git push origin u8g2gl-widgets/wo3-progress-clock
```

## Strict Boundary Box

New files only for the two widgets (header, source, test each). Build file
modifications to add them. U8G2 stub extensions if needed.
No changes to existing widget files, CLI code, or docs.

## Constraints (REJECTION CRITERIA)

Same as WO1 — no heap, no std::function members, explicit enum base types,
default-constructible, tick returns deadlines, zero warnings, full documentation.

## Completion Report Template

```
## Completion Report
- **Date**: YYYY-MM-DDTHH:MM:SSZ
- **Status**: COMPLETE / PARTIAL / BLOCKED
- **Commit**: <sha>
- **Branch verified**: yes/no
- **Tests**: X passed, Y failed
- **Warnings**: N
- **sizeof(u8g2gl_progress_bar)**: N bytes
- **sizeof(u8g2gl_clock)**: N bytes
- **Notes**: <any observations>
```

## Completion Report
- **Date**: 2026-09-10T07:31:20Z
- **Status**: COMPLETE
- **Commit**: 63c211757dc83e77fcfadc8b9adffed65e24610e
- **Branch verified**: yes (u8g2gl-widgets/wo3-progress-clock)
- **Tests**: 142 passed, 0 failed (14/14 ProgressBar, 10/10 Clock, 118/118 existing suite)
- **Warnings**: 0
- **sizeof(u8g2gl_progress_bar)**: 64 bytes (budget <= 80 bytes)
- **sizeof(u8g2gl_clock)**: 72 bytes (budget <= 88 bytes)
- **Notes**: Implemented u8g2gl_progress_bar and u8g2gl_clock conforming to zero-heap discipline, strict integer math for linear interpolation and epoch time decomposition, right-aligned digit columns to eliminate horizontal jitter, dual-font baseline alignment for seconds typography, and 1Hz colon blinking. Extended test stub U8G2lib.h for drawFrame/drawPixel tracking and UTF-8 verification.
