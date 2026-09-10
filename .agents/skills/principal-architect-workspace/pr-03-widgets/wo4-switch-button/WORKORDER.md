---
work_order: WO4
project: pr-03-widgets
title: "u8g2gl_switch + u8g2gl_button"
branch: u8g2gl-widgets/wo4-switch-button
base: u8g2gl-widgets/wo3-progress-clock
complexity: standard
status: complete
---

# WO4 — u8g2gl_switch + u8g2gl_button

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was
approved by the human on 2026-09-10T07:10:37Z. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Objective

Build the switch (toggle indicator) and button (interactive text button) widgets.
These are simpler than WO2-WO3 widgets — both are non-animated.

## Branch

**Branch**: `u8g2gl-widgets/wo4-switch-button`
**Base**: `u8g2gl-widgets/wo3-progress-clock`

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

### Widget 1: `u8g2gl_switch`

New widget (no direct legacy equivalent). Binary toggle visual indicator.

#### Header: `include/u8g2gl/u8g2gl_switch.h`

```cpp
class u8g2gl_switch : public u8g2gl_obj {
public:
    u8g2gl_switch() = default;

    void set_value(bool on);
    bool get_value() const;

    uint32_t tick(uint32_t now_ms) override;   // returns U8G2GL_IDLE
    void render(U8G2& display) override;

private:
    bool value_ = false;
};
```

#### Implementation: `src/u8g2gl_switch.cpp`

- `set_value(on)`: Store value, mark dirty.
- `tick()`: Return `U8G2GL_IDLE`.
- `render(display)`:
  - Draw the switch track: a rounded rectangle `drawRFrame` covering the full
    widget bounds.
  - Draw the handle: a filled rounded rectangle `drawRBox` positioned left
    (off) or right (on):
    - Handle width = roughly `w_ / 2`
    - Off position: `x_ + 1`
    - On position: `x_ + w_ / 2`
  - When ON: optionally invert the handle or use XOR mode for visual distinction
    on a 1-bit display.

#### Tests: `test/test_switch.cpp`

```
TEST(Switch, DefaultConstruction)
  - value_ is false

TEST(Switch, SetValue)
  - set_value(true) -> get_value() == true
  - set_value(false) -> get_value() == false

TEST(Switch, TickAlwaysIdle)

TEST(Switch, SizeOf)
  - EXPECT_LE(sizeof(u8g2gl_switch), 72u)
```

---

### Widget 2: `u8g2gl_button`

Interactive button with text and focus awareness.

#### Header: `include/u8g2gl/u8g2gl_button.h`

```cpp
class u8g2gl_button : public u8g2gl_obj {
public:
    u8g2gl_button() = default;

    // --- Content ---
    void set_text(const char* text);
    const char* get_text() const;

    // --- Appearance ---
    void set_border_width(uint8_t w);

    uint32_t tick(uint32_t now_ms) override;   // returns U8G2GL_IDLE
    void render(U8G2& display) override;

private:
    const char* text_ = nullptr;
    uint8_t border_width_ = 1;
};
```

#### Implementation: `src/u8g2gl_button.cpp`

- `set_text()`: Store pointer, mark dirty.
- `set_border_width()`: Store value, mark dirty.
- `tick()`: Return `U8G2GL_IDLE`.
- `render(display)`:
  - Apply font from style.
  - **Border**: Draw frame around the widget bounds. If `border_width_ > 0`:
    - For border_width 1: `display.drawRFrame(x_, y_, w_, h_, style_.radius)`
    - For border_width > 1: draw nested frames.
  - **Invert on focus**: If the button has the DISABLED flag clear and the
    style indicates focus (`style_.invert`), draw with inverted colors
    (drawBox for background, then draw text with color 0). This provides
    the visual focus indicator that §12.2 requires.
  - **Text**: Center text within the button bounds (accounting for border and
    padding from style). Use `display.drawUTF8()`.

#### Tests: `test/test_button.cpp`

```
TEST(Button, DefaultConstruction)
  - text_ is nullptr
  - border_width_ is 1

TEST(Button, SetText)
  - set_text("OK") -> get_text() returns same pointer

TEST(Button, SetBorderWidth)
  - set_border_width(2) accepted

TEST(Button, TickAlwaysIdle)

TEST(Button, SizeOf)
  - EXPECT_LE(sizeof(u8g2gl_button), 80u)
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
git branch --show-current   # Must show: u8g2gl-widgets/wo4-switch-button
```

```bash
git add -A
git commit -m "feat(widgets): add u8g2gl_switch, u8g2gl_button (PR-03 WO4)"
git push origin u8g2gl-widgets/wo4-switch-button
```

## Strict Boundary Box

New files only for the two widgets. Build file modifications to add them.
No changes to existing widget files, CLI code, or docs.

## Constraints (REJECTION CRITERIA)

Same as WO1 — no heap, no std::function members, explicit enum base types,
default-constructible, tick returns U8G2GL_IDLE (both are non-animated),
zero warnings, full documentation.

## Completion Report Template

```
## Completion Report
- **Date**: YYYY-MM-DDTHH:MM:SSZ
- **Status**: COMPLETE / PARTIAL / BLOCKED
- **Commit**: <sha>
- **Branch verified**: yes/no
- **Tests**: X passed, Y failed
- **Warnings**: N
- **sizeof(u8g2gl_switch)**: N bytes
- **sizeof(u8g2gl_button)**: N bytes
- **Notes**: <any observations>
```

## Completion Report
- **Date**: 2026-09-10T06:36:30Z
- **Status**: COMPLETE
- **Commit**: edc01ae7be27c3f8115682855bfa076d5e1694f4
- **Branch verified**: yes (u8g2gl-widgets/wo4-switch-button)
- **Tests**: 164 passed, 0 failed (9/9 Switch, 13/13 Button, 142/142 existing suite)
- **Warnings**: 0
- **sizeof(u8g2gl_switch)**: 56 bytes (budget <= 72 bytes)
- **sizeof(u8g2gl_button)**: 64 bytes (budget <= 80 bytes)
- **Notes**: Implemented u8g2gl_switch and u8g2gl_button conforming to zero-heap discipline ([D-1]), zero std::function members, static U8G2GL_IDLE tick lifecycle ([D-15]), rounded track and handle rendering for switches, configurable nested border frames, focus state visual inversion (§12.2), and centered UTF-8 text layout for buttons. Extended test stub U8G2lib.h for drawRBox and drawRFrame call tracking.

