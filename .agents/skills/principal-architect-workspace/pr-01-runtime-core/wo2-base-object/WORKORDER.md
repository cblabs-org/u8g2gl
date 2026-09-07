---
name: pr-01-runtime-core-wo2
description: Handoff instructions for Work Order 2 — Base Object + Flat Array + Parent Index
complexity: standard
---

# WO2 — Base Object + Flat Array + Parent Index

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create new branches, and do not plan beyond this checklist.
> Your task is strictly limited to executing the checklist below.

## Objective

Implement the `u8g2gl_obj` virtual base class (~16 bytes per object on 32-bit),
the flat object array with parent index, visibility/clip walks, the
`u8g2gl_state_saver` RAII guard, and the `u8g2gl_partial_refresh()` helper.
Unit tests for all of the above.

## Parent Project

This WORKORDER belongs to **PR-01: Runtime Core**.
- Project file: `.agents/skills/principal-architect-workspace/pr-01-runtime-core/PROJECT.md`
- Human approval of the decomposition is recorded there at `2026-09-07T22:16:09Z`.

## Strict Boundary Box

**DO NOT:**
- Implement subjects, styles, or the frame gate — those are WO3–WO5
- Implement concrete widgets (label, clock, etc.) — that is PR-03
- Write any XML, schema, or generator code — that is PR-02/PR-04
- Touch anything in esp32-app-foundation — that is PR-05
- Create additional branches — work only on `u8g2gl-runtime/wo2-base-object`
- Use namespaces — all symbols use flat `u8g2gl_` / `U8G2GL_` prefixes ([D-12]/[D-13])
- Use dynamic allocation (no `new`, `malloc`, `std::vector` in library code) — [D-1]
- Modify WO1 files unless strictly necessary for integration (if you do, explain why)

## Tooling Constraints

- Build: CMake (already set up by WO1). Add new source files to the existing `u8g2gl` library target.
- Test: GoogleTest (already set up). Add new test files in `test/`.
- The U8G2 stub in `test/stubs/U8G2lib.h` is available — extend it if needed for state-saver testing.

## Reference — Spec & Plan Context

Read these for context:
- [design_spec.md §11.3](../../../docs/design_spec.md) — Widget lifecycle: tick() and render()
- [design_spec.md §11.4](../../../docs/design_spec.md) — Escape hatch: partial_refresh tile maths
- [design_spec.md §13.3](../../../docs/design_spec.md) — Flat object array + parent table
- [design_spec.md §13.7](../../../docs/design_spec.md) — Default-constructible, setter-configured
- [implementation_plan.md §2 PD-3](../../../docs/implementation_plan.md) — Object model decision, ~16B target
- [u8g2gl_types.h](../../../include/u8g2gl/u8g2gl_types.h) — Constants and enums from WO1
- [u8g2gl_config.h](../../../include/u8g2gl/u8g2gl_config.h) — Max pool sizes from WO1

## Line-Item Instructions

### 1. `u8g2gl_obj` Base Class — `include/u8g2gl/u8g2gl_obj.h`

- [ ] Create the header with the base class. Target layout (~16 bytes on 32-bit):

```cpp
class u8g2gl_obj {
public:
    u8g2gl_obj() = default;
    virtual ~u8g2gl_obj() = default;

    // --- Coordinates (set by generated init code) ---
    void set_coords(int16_t x, int16_t y, int16_t w, int16_t h);
    int16_t get_x() const;
    int16_t get_y() const;
    int16_t get_w() const;
    int16_t get_h() const;

    // --- Flags ---
    void set_flag(uint8_t flag);       // e.g. set_flag(U8G2GL_FLAG_HIDDEN)
    void clear_flag(uint8_t flag);
    bool has_flag(uint8_t flag) const;

    // Convenience
    void set_hidden(bool h);
    bool is_hidden() const;
    void set_disabled(bool d);
    bool is_disabled() const;

    // --- Parent index (for flat-array hierarchy) ---
    void set_parent_index(uint8_t idx);
    uint8_t get_parent_index() const;

    // --- Dirty tracking ---
    // mark_dirty() is intended to set a screen-level flag (WO5),
    // but for now, sets the per-object DIRTY flag as a placeholder.
    void mark_dirty();
    bool is_dirty() const;
    void clear_dirty();

    // --- Virtual lifecycle (overridden by concrete widgets in PR-03) ---
    virtual uint32_t tick(uint32_t now_ms);    // returns next deadline, default U8G2GL_IDLE
    virtual void render(U8G2& display);         // default: no-op

    // --- Escape hatch (§11.4, [D-5]) ---
    virtual void render_animation_update(U8G2& display, uint32_t now_ms);  // default: no-op

protected:
    int16_t x_ = 0;
    int16_t y_ = 0;
    int16_t w_ = 0;
    int16_t h_ = 0;
    uint8_t flags_ = 0;
    uint8_t parent_index_ = U8G2GL_NO_PARENT;
};
```

**Key requirements:**
- Default-constructible — §13.7 binding requirement
- Virtual destructor — enables safe polymorphic deletion (even if we don't delete in practice)
- `tick()` default returns `U8G2GL_IDLE`
- `render()` default is no-op
- sizeof should be ~16 bytes on 32-bit (vptr:4 + coords:8 + flags:1 + parent:1 + pad:2)
- Include `u8g2gl_types.h` and forward-declare `U8G2` (or include the stub path will resolve)

### 2. `u8g2gl_obj` Implementation — `src/u8g2gl_obj.cpp`

- [ ] Implement all methods. Trivial — most are one-liners. The key ones:
  - `set_coords`: assign all four
  - `set_flag` / `clear_flag` / `has_flag`: bitwise ops on `flags_`
  - `set_hidden(true)` → `set_flag(U8G2GL_FLAG_HIDDEN)`, etc.
  - `mark_dirty()`: `set_flag(U8G2GL_FLAG_DIRTY)` (placeholder for WO5's screen-level dirty)
  - `tick()`: return `U8G2GL_IDLE`
  - `render()`: empty
  - `render_animation_update()`: empty

### 3. Visibility & Clip Helpers — in `u8g2gl_obj.h` or a separate `u8g2gl_tree.h`

- [ ] Implement free functions that operate on the flat array + parent table:

```cpp
// Check if an object is effectively visible (own flag AND all ancestors)
bool u8g2gl_is_effectively_visible(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

// Compute effective clip rect (intersection of all ancestor bounds)
struct u8g2gl_rect {
    int16_t x, y, w, h;
};
u8g2gl_rect u8g2gl_effective_clip(
    const u8g2gl_obj* const* objs,
    const uint8_t* parents,
    uint8_t index
);

// Intersect two rectangles (utility)
u8g2gl_rect u8g2gl_rect_intersect(const u8g2gl_rect& a, const u8g2gl_rect& b);
```

- Walk upward through parent indices until `U8G2GL_NO_PARENT`
- For visibility: if any ancestor has `U8G2GL_FLAG_HIDDEN`, return false
- For clip: start with the object's own bounds, intersect with each ancestor's bounds going up
- A rect with w <= 0 or h <= 0 means fully clipped (invisible)

### 4. `u8g2gl_state_saver` — `include/u8g2gl/u8g2gl_state_saver.h`

- [ ] RAII guard per §11.3. Saves and restores U8G2 state around widget render:

```cpp
class u8g2gl_state_saver {
public:
    explicit u8g2gl_state_saver(U8G2& display);
    ~u8g2gl_state_saver();

    // Non-copyable, non-movable
    u8g2gl_state_saver(const u8g2gl_state_saver&) = delete;
    u8g2gl_state_saver& operator=(const u8g2gl_state_saver&) = delete;

private:
    U8G2& display_;
    uint8_t saved_draw_color_;
    const uint8_t* saved_font_;
    // Save/restore clip window and font mode as needed
};
```

**Important:** The U8G2 stub may need getter methods added to support save/restore.
Add them to `test/stubs/U8G2lib.h`:
- `uint8_t getDrawColor() const` → returns `last_draw_color`
- `const uint8_t* getFont() const` → returns `last_font`

The constructor saves state, the destructor restores it. The framework applies
this around every widget's `render()` call — widgets never construct it themselves.

### 5. `u8g2gl_partial_refresh` — in `u8g2gl_obj.h` or `u8g2gl_helpers.h`

- [ ] Implement the tile-aligned partial refresh helper per §11.4:

```cpp
inline void u8g2gl_partial_refresh(U8G2& d, int x, int y, int w, int h) {
    int tx = x / 8, ty = y / 8;
    int tw = ((x % 8) + w + 7) / 8;   // NOT (w + 7) / 8 — spec §11.4
    int th = ((y % 8) + h + 7) / 8;
    d.updateDisplayArea(tx, ty, tw, th);
}
```

This is the escape hatch helper. Note the comment per spec: the naive formula
`(w + 7) / 8` is wrong when x is not tile-aligned.

### 6. Update CMakeLists.txt

- [ ] Add `src/u8g2gl_obj.cpp` to the `u8g2gl` library target's source list.
  If you create additional `.cpp` files (e.g. for tree helpers), add those too.

### 7. Tests — `test/test_obj.cpp`

- [ ] Create comprehensive unit tests:

```
TEST(Obj, DefaultConstruction)
  - Default-constructed u8g2gl_obj has x=0, y=0, w=0, h=0
  - flags_ = 0 (not hidden, not dirty, not disabled)
  - parent_index = U8G2GL_NO_PARENT

TEST(Obj, SetCoords)
  - set_coords(10, 20, 100, 50) → getters return those values

TEST(Obj, Flags)
  - set_flag(U8G2GL_FLAG_HIDDEN) → has_flag returns true
  - clear_flag → returns false
  - set_hidden(true) / is_hidden() equivalence
  - Multiple flags independent

TEST(Obj, DirtyTracking)
  - mark_dirty() sets dirty flag
  - clear_dirty() clears it
  - is_dirty() reflects state

TEST(Obj, TickReturnsIdle)
  - Default tick(0) returns U8G2GL_IDLE

TEST(Obj, SizeOf)
  - EXPECT_LE(sizeof(u8g2gl_obj), 24)  // 16 on 32-bit, up to 24 on 64-bit (8-byte vptr)
  - Print actual sizeof to test output for the PA report

TEST(Obj, ParentIndex)
  - Default is U8G2GL_NO_PARENT
  - set_parent_index(3) → get_parent_index() returns 3

TEST(Tree, EffectiveVisibility)
  - 3 objects: A (root), B (parent=A), C (parent=B)
  - All visible → u8g2gl_is_effectively_visible for C returns true
  - Hide A → C becomes effectively invisible
  - Hide B → C invisible, A still visible
  - Hide C only → C invisible, B and A visible

TEST(Tree, EffectiveClip)
  - Parent at (10,10,100,50), child at (20,20,80,30)
  - Effective clip of child = intersection = (20,20,80,30)
  - Parent at (10,10,50,30), child at (40,20,80,30)
  - Effective clip width shrinks to fit parent's right edge

TEST(Tree, RectIntersect)
  - Two overlapping rects → correct intersection
  - Non-overlapping rects → w or h <= 0

TEST(StateSaver, SavesAndRestores)
  - Create U8G2, set draw color to 1, set a font
  - Create state_saver
  - Change draw color to 2, change font
  - Destroy state_saver → verify draw color and font restored

TEST(PartialRefresh, TileAligned)
  - u8g2gl_partial_refresh at x=0,y=0,w=16,h=16 → updateDisplayArea(0,0,2,2)

TEST(PartialRefresh, NonAligned)
  - x=6, y=0, w=12, h=8 → tx=0, tw=((6%8)+12+7)/8 = 3  (covers tiles 0,1,2)
  - This is the case the naive formula gets wrong (spec §11.4)
```

### 8. Register test file

- [ ] Add `test/test_obj.cpp` to `test/CMakeLists.txt` as a new test executable
  (or add to the existing one — a separate executable `test_obj` is preferred for
  isolation). Link against `u8g2gl` and `GTest::gtest_main`, add stubs include path.

### 9. Build and Verify

- [ ] Build: `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build`
- [ ] Run: `cd build && ctest --output-on-failure`
- [ ] All previous smoke tests AND all new tests must pass
- [ ] Zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] Print `sizeof(u8g2gl_obj)` in the test output (use `RecordProperty` or `printf`)

### 10. Commit

- [ ] Stage all new and modified files and commit:
  ```
  feat(runtime): add u8g2gl_obj base class, tree helpers, state saver

  - u8g2gl_obj: virtual base with int16 coords, flags, parent index (~16B/32-bit)
  - Flat-array visibility and clip walks via parent indices
  - u8g2gl_state_saver RAII guard for U8G2 draw state
  - u8g2gl_partial_refresh with correct tile alignment (§11.4)
  - Unit tests for all of the above

  Part of PR-01: Runtime Core (WO2)
  ```

## Verification Requirement

Build must complete with zero warnings. All tests (smoke + obj) must pass.
**CRITICAL:** Before committing, ask the user if they are happy with the changes.

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly. The
Principal Architect will triage and file them under the correct author identity.

---

## Completion Report (written by the worker at task completion)

<!-- Template — worker fills this in -->
