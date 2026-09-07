---
name: pr-01-runtime-core-wo3
description: Handoff instructions for Work Order 3 — Subject / Observer System
complexity: standard
---

# WO3 — Subject / Observer System

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create new branches, and do not plan beyond this checklist.
> Your task is strictly limited to executing the checklist below.

## Objective

Implement the subject/observer system per spec §8: four subject types (int,
string, bool, time), copy-on-set string storage with declared `max_len`, a
static observer pool (no heap), observer notification on value change, and
conditional flag bindings. The API surface must match what §13.8 says generated
code will emit.

## Parent Project

This WORKORDER belongs to **PR-01: Runtime Core**.
- Project file: `.agents/skills/principal-architect-workspace/pr-01-runtime-core/PROJECT.md`
- Human approval of the decomposition is recorded there at `2026-09-07T22:16:09Z`.

## Strict Boundary Box

**DO NOT:**
- Implement concrete widgets (label, clock, etc.) — that is PR-03
- Implement styles — that is WO4
- Implement the frame gate or `ui_handler()` — that is WO5
- Write any XML, schema, or generator code — that is PR-02/PR-04
- Create additional branches — work only on `u8g2gl-runtime/wo3-subjects`
- Use namespaces — flat `u8g2gl_` / `U8G2GL_` prefixes only ([D-12]/[D-13])
- Use dynamic allocation (`new`, `malloc`, `std::vector`) — [D-1]
- Modify WO1/WO2 files unless strictly necessary for integration (explain why)

## Tooling Constraints

- Build: CMake (already set up). Add new source files to the `u8g2gl` library target.
- Test: GoogleTest. Add new test files in `test/`.
- The `u8g2gl_obj` base class from WO2 is available in `include/u8g2gl/u8g2gl_obj.h`.

## Reference — Spec & Plan Context

Read these for context:
- [design_spec.md §8](../../../docs/design_spec.md) — Data Binding: subject types, string storage, sigils, binding forms
- [design_spec.md §13.8](../../../docs/design_spec.md) — Binding emission: the exact API generated code calls
- [design_spec.md §8.4](../../../docs/design_spec.md) — Binding forms: bind_text, bind_flag_if_*
- [u8g2gl_config.h](../../../include/u8g2gl/u8g2gl_config.h) — `U8G2GL_MAX_OBSERVERS` (default 16)
- [u8g2gl_obj.h](../../../include/u8g2gl/u8g2gl_obj.h) — Base class with flags

## Line-Item Instructions

### 1. Subject Types — `include/u8g2gl/u8g2gl_subject.h`

- [ ] Create the subject system header. Design approach: use a tagged union or
  a base class with typed subclasses. The critical requirement is **no dynamic
  allocation** — all storage is inline.

**Recommended approach — template for string capacity, enum for type tag:**

```cpp
// Subject type tag
enum u8g2gl_subject_type_t {
    U8G2GL_SUBJECT_INT = 0,
    U8G2GL_SUBJECT_STRING,
    U8G2GL_SUBJECT_BOOL,
    U8G2GL_SUBJECT_TIME,
};

// Observer callback signature
// Called when a subject's value changes. The observer receives the subject pointer.
using u8g2gl_observer_cb = void(*)(void* user_data);

// Observer registration entry (stored in a static pool)
struct u8g2gl_observer {
    void* user_data;          // typically a u8g2gl_obj pointer
    u8g2gl_observer_cb cb;    // callback
    bool active;              // slot in use
};

// Forward declare
class u8g2gl_subject_base;

// Int subject
class u8g2gl_subject_int {
public:
    u8g2gl_subject_int() = default;
    explicit u8g2gl_subject_int(int32_t initial);

    int32_t get() const;
    void set(int32_t value);     // notifies observers if value changed

    // Observer management
    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

private:
    int32_t value_ = 0;
    // Observer slots — inline, no heap
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

// String subject — fixed buffer, copy-on-set
class u8g2gl_subject_string {
public:
    u8g2gl_subject_string() = default;

    // max_len is set once at init time (from XML declaration)
    void init(uint16_t max_len);

    const char* get() const;
    void set(const char* value);   // copies into internal buffer, truncates at max_len

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

    uint16_t get_max_len() const;

private:
    // Fixed buffer — sized to U8G2GL_MAX_STRING_LEN at compile time.
    // The declared max_len from XML caps the usable portion.
    static constexpr uint16_t BUFFER_SIZE = 128;  // covers most uses
    char buffer_[BUFFER_SIZE] = {};
    uint16_t max_len_ = 32;   // default per §8, overridden by init()
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

// Bool subject
class u8g2gl_subject_bool {
public:
    u8g2gl_subject_bool() = default;
    explicit u8g2gl_subject_bool(bool initial);

    bool get() const;
    void set(bool value);

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

private:
    bool value_ = false;
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};

// Time subject (Unix seconds)
class u8g2gl_subject_time {
public:
    u8g2gl_subject_time() = default;

    uint32_t get() const;
    void set(uint32_t epoch_secs);

    bool add_observer(void* user_data, u8g2gl_observer_cb cb);
    void notify();

private:
    uint32_t value_ = 0;
    u8g2gl_observer observers_[U8G2GL_MAX_OBSERVERS] = {};
    uint8_t observer_count_ = 0;
};
```

**IMPORTANT design notes:**
- Each subject type is its own class — no virtual dispatch on subjects (they're
  not polymorphic in the generated code; §13.8 emits typed calls).
- Observer arrays are **inline in each subject instance**. This is a deliberate
  choice: `U8G2GL_MAX_OBSERVERS` defaults to 16 but is per-subject. For a typical
  project with 6 subjects each having 1–3 observers, a shared pool would save RAM
  but add complexity. Start with per-subject inline arrays and note the trade-off
  for the PA.
- `set()` notifies only if the value actually changed (for int/bool/time: `!=`,
  for string: `strcmp`). This prevents redundant redraws.
- The string buffer is a fixed compile-time size. The `max_len_` field caps
  the usable portion per the XML `max_len` attribute. If you prefer to use a
  template parameter for the buffer size, that is acceptable too — document
  the choice.
- Add `#include "u8g2gl_config.h"` for `U8G2GL_MAX_OBSERVERS`.

### 2. Subject Implementation — `src/u8g2gl_subject.cpp`

- [ ] Implement all methods:
  - `set()`: compare old vs new, if changed: update value, call `notify()`
  - `notify()`: iterate observers, call each active one's callback
  - `add_observer()`: find an unused slot (or append if `observer_count_ < MAX`),
    return false if pool is full
  - String `set()`: `strncpy` into `buffer_`, null-terminate at `max_len_ - 1`,
    compare via `strcmp` before copying (optimisation: skip copy if same)
  - String `init(max_len)`: clamp `max_len` to `BUFFER_SIZE`, store

### 3. Conditional Flag Bindings — add to `u8g2gl_obj` or a new header

- [ ] Implement the binding methods that §13.8 says generated code will call.
  These connect a subject to an object's flags:

```cpp
// On u8g2gl_obj (add to u8g2gl_obj.h or a new u8g2gl_binding.h):

// Bind text from an int subject with format string
void bind_text(u8g2gl_subject_int* subject, const char* fmt = nullptr);

// Bind text from a string subject
void bind_text(u8g2gl_subject_string* subject);

// Conditional flag bindings
void bind_flag_if_eq(u8g2gl_subject_int* subject, int32_t ref_value, uint8_t flag);
void bind_flag_if_not_eq(u8g2gl_subject_int* subject, int32_t ref_value, uint8_t flag);
void bind_flag_if_gt(u8g2gl_subject_int* subject, int32_t ref_value, uint8_t flag);
void bind_flag_if_lt(u8g2gl_subject_int* subject, int32_t ref_value, uint8_t flag);

// Also for bool subjects (bind_flag_if_eq with bool)
void bind_flag_if_eq(u8g2gl_subject_bool* subject, int32_t ref_value, uint8_t flag);
```

**How conditional flags work:**
- `bind_flag_if_eq(&subject, 0, U8G2GL_FLAG_HIDDEN)` means:
  when `subject.get() == 0`, set `U8G2GL_FLAG_HIDDEN` on this object;
  when `subject.get() != 0`, clear it.
- Implementation: register an observer on the subject. The observer callback
  evaluates the condition and sets/clears the flag on the object.
- Use a small internal struct to capture the binding parameters (ref_value,
  flag, comparison op). Store these in a static array on the object or use
  the observer's `user_data` to point to a static binding descriptor.

**§13.8 contract shapes to match:**
```cpp
// Generated code will emit:
temp.bind_text(&ui_subject_temperature, "%d°C");
wifi_icon.bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN);
```

**Approach for bind_text:** For PR-01 (no concrete widgets yet), `bind_text`
on the base class registers the observer but the actual text rendering is
PR-03's job. The base class should store the bound subject pointer and format
string so that derived widget classes (PR-03) can read them. Recommended:
add protected members to `u8g2gl_obj`:

```cpp
protected:
    // Text binding (used by label/scrolling_label in PR-03)
    void* bound_text_subject_ = nullptr;    // generic pointer to avoid coupling
    const char* bound_text_fmt_ = nullptr;
    u8g2gl_subject_type_t bound_text_type_ = U8G2GL_SUBJECT_INT;
```

Or simpler: just have `bind_text()` register an observer that calls
`mark_dirty()`, and store the subject pointer. The actual text formatting
is the derived class's concern.

### 4. Add config macro for string buffer

- [ ] Add to `u8g2gl_config.h`:
  ```cpp
  #ifndef U8G2GL_MAX_STRING_LEN
  #define U8G2GL_MAX_STRING_LEN 128
  #endif

  #ifndef U8G2GL_MAX_BINDINGS_PER_OBJ
  #define U8G2GL_MAX_BINDINGS_PER_OBJ 4
  #endif
  ```

### 5. Update CMakeLists.txt

- [ ] Add `src/u8g2gl_subject.cpp` to the `u8g2gl` library target.
  Add any other new `.cpp` files.

### 6. Tests — `test/test_subject.cpp`

- [ ] Create comprehensive unit tests:

```
--- Int Subject ---
TEST(SubjectInt, DefaultValue)
  - Default-constructed has value 0

TEST(SubjectInt, SetAndGet)
  - set(42) → get() returns 42

TEST(SubjectInt, NotifiesOnChange)
  - Add observer with a counter callback
  - set(1) → counter = 1
  - set(1) again → counter still 1 (no change, no notify)
  - set(2) → counter = 2

TEST(SubjectInt, MultipleObservers)
  - Add 2 observers, each with a separate counter
  - set(5) → both counters incremented

--- String Subject ---
TEST(SubjectString, DefaultEmpty)
  - get() returns ""

TEST(SubjectString, SetAndGet)
  - set("hello") → get() returns "hello"

TEST(SubjectString, CopySemantics)
  - Set from a local buffer, then modify the buffer
  - get() still returns the original value (copy was made)

TEST(SubjectString, Truncation)
  - init(8) → set("longstring123") → get() has length 7 (max_len-1 for null)

TEST(SubjectString, NotifiesOnChange)
  - set("a") → notified
  - set("a") → not notified (same value)
  - set("b") → notified

--- Bool Subject ---
TEST(SubjectBool, DefaultFalse)
  - Default is false

TEST(SubjectBool, SetAndGet)
  - set(true) → get() returns true

TEST(SubjectBool, NotifiesOnChange)
  - set(true) → notified
  - set(true) → not notified

--- Time Subject ---
TEST(SubjectTime, DefaultZero)
  - Default is 0

TEST(SubjectTime, SetAndGet)
  - set(1693000000) → get() returns that value

TEST(SubjectTime, NotifiesOnChange)
  - Same pattern as int

--- Conditional Flag Bindings ---
TEST(Binding, FlagIfEqSetsHidden)
  - Create an int subject and a u8g2gl_obj
  - obj.bind_flag_if_eq(&subject, 0, U8G2GL_FLAG_HIDDEN)
  - subject.set(0) → obj has U8G2GL_FLAG_HIDDEN
  - subject.set(1) → obj does NOT have U8G2GL_FLAG_HIDDEN

TEST(Binding, FlagIfNotEq)
  - bind_flag_if_not_eq(&subject, 0, U8G2GL_FLAG_DISABLED)
  - subject.set(5) → disabled
  - subject.set(0) → not disabled

TEST(Binding, FlagIfGt)
  - bind_flag_if_gt(&subject, 10, U8G2GL_FLAG_HIDDEN)
  - subject.set(15) → hidden
  - subject.set(5) → not hidden

TEST(Binding, FlagIfLt)
  - Similar pattern

TEST(Binding, BoolFlagIfEq)
  - bind_flag_if_eq on a bool subject with ref_value 0
  - subject.set(false) → flag set (false == 0)
  - subject.set(true) → flag cleared

--- Observer Pool ---
TEST(ObserverPool, FullPoolReturnsFalse)
  - Fill all U8G2GL_MAX_OBSERVERS slots
  - Next add_observer returns false
```

### 7. Register test file

- [ ] Add `test/test_subject.cpp` to `test/CMakeLists.txt` as a new test
  executable `test_subject`. Link against `u8g2gl` and `GTest::gtest_main`,
  add stubs include path.

### 8. Build and Verify

- [ ] Build: `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build`
- [ ] Run: `cd build && ctest --output-on-failure`
- [ ] All previous tests (smoke + obj) AND all new subject tests must pass
- [ ] Zero warnings under `-Wall -Wextra -Wpedantic`

### 9. Commit

- [ ] Stage all new and modified files and commit:
  ```
  feat(runtime): add subject/observer system with conditional flag bindings

  - Subject types: int, string, bool, time per spec §8
  - Copy-on-set string storage with declared max_len (§8.2)
  - Static observer pool, no heap allocation ([D-1])
  - Conditional flag bindings: bind_flag_if_eq/not_eq/gt/lt (§13.8)
  - bind_text() on u8g2gl_obj for subject→widget text binding
  - Comprehensive unit tests for all types and bindings

  Part of PR-01: Runtime Core (WO3)
  ```

## Verification Requirement

Build must complete with zero warnings. All tests must pass.
**CRITICAL:** Before committing, ask the user if they are happy with the changes.

## Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly. The
Principal Architect will triage and file them under the correct author identity.

**Particular attention:** If the §13.8 API shapes cannot be implemented as
specified (e.g. overload ambiguity, type-safety issues with the generic
`bind_text` across subject types), surface this — it may indicate a contract
gap the PA needs to escalate to the Chief Architect.

---

## Completion Report (written by the worker at task completion)

<!-- Template — worker fills this in -->
