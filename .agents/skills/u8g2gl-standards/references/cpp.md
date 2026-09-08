# C++ Standards — Runtime Library

C++17. Targets ESP32 / RP2040 / STM32 **and** a Wasm editor build ([UD-4]), plus a
native host build for tests. Code must compile clean on all three.

## 1. Naming

See [SKILL.md §2](../SKILL.md) for the full table and the rationale for diverging
from `esp32-app-foundation`. Summary:

```cpp
class u8g2gl_label : public u8g2gl_obj {      // lowercase_snake, matches XML tag
public:
    void set_font(const uint8_t* font);        // snake_case methods
    int16_t get_x() const;
private:
    int16_t x_ = 0;                            // trailing underscore
};

enum u8g2gl_align_t : uint8_t {                // _t suffix, explicit base type
    U8G2GL_ALIGN_LEFT = 0,                     // U8G2GL_ prefixed values
};

#define U8G2GL_DEFAULT_OBSERVERS 4             // SCREAMING_SNAKE
```

**Always give enums an explicit base type.** `enum x_t : uint8_t`. An untyped enum
is `int` — four bytes where one will do. This cost 16 bytes per object before it
was caught in review (WO6, Finding C).

## 2. Memory discipline

The most important section. These rules exist because the target has no MMU, no
swap, and often no way to report an OOM other than a reboot loop.

**No heap allocation. Anywhere.**
No `new`, `malloc`, `std::vector`, `std::string`, or anything that allocates —
not merely inside `tick()`, but anywhere in the runtime. Capacities are declared
in XML and allocated statically (§9.2). This is stronger than foundation's rule,
which permits heap outside hot paths, and it is what makes the §18 budget
truthful.

**Sizes are declared, not assumed.**
If storage depends on a count — observers, rows, string length — the count is a
template parameter or a declared capacity, never a global maximum. A global
constant that over-allocates for everyone is the defect WO6 Finding A/B fixed.
The generator knows these counts at build time (§13); use that.

**No `std::function` as a stored member.**
Hidden Small Buffer Optimisation heap allocation. Use a function pointer plus a
context pointer:

```cpp
// ❌ WRONG — hidden allocation, unbounded
std::function<void()> callback_;

// ✅ CORRECT — zero-cost, deterministic
using u8g2gl_observer_cb = void(*)(void* user_data);
u8g2gl_observer_cb cb_ = nullptr;
void* user_data_ = nullptr;
```

Passing a `std::function` as a parameter and invoking it immediately is fine; the
prohibition is on *storing* one.

**Strings**

| Context | Use |
|---|---|
| Anywhere in the runtime | `const char*`, fixed `char[N]`, `snprintf` |
| Host-side tests only | `std::string` acceptable |
| Anywhere, ever | **Not** Arduino `String` |

**Pack structs deliberately.** Order members largest-alignment-first: pointers,
then 16/32-bit, then bytes and bools. Removing one redundant `bool` from
`u8g2gl_observer` saved 8 bytes per slot (WO6, Finding D).

**Report sizes.** `Core.SizeOfReport` prints every key `sizeof` so reviews can see
memory cost without reading code. Add to it when adding a type that is
instantiated per object or per subject.

## 3. Files and layout

```
include/u8g2gl/u8g2gl_obj.h     // public headers, one per concern
src/u8g2gl_obj.cpp              // implementation, same stem
test/test_obj.cpp               // tests, test_<stem>.cpp
test/stubs/U8G2lib.h            // the single authoritative U8G2 stub
```

- Header guards are `#ifndef U8G2GL_OBJ_H`, matching the filename. Not `#pragma once`
  — the runtime must build under toolchains we do not control.
- **One authoritative stub.** Native test stubs are defined in exactly one header
  and forward-declared elsewhere. Redefinition across stubs is a build failure
  that is tedious to diagnose.
- Include what you use. A header must compile standalone.

## 4. File headers

Every `.h` and `.cpp` begins with a header block. This is imported from
foundation's house style and adapted to MIT — the runtime currently lacks these
and they should be added as files are touched.

```cpp
/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_obj.h
 * Description: Base object — coordinates, flags, parent index, style, and the
 *              virtual tick/render lifecycle.
 *
 * Exported Classes:
 * - u8g2gl_obj: base class for every visual element
 *     Lifecycle:  tick(), render(), render_animation_update()
 *     Geometry:   set_coords(), get_x/y/w/h()
 *     Binding:    bind_text(), bind_flag_if_*()
 */
```

The **Exported Classes** list is the point — it lets a reader learn a header's API
without reading it. Group by concern.

## 5. Documentation

Doxygen `/** ... */` on public declarations. `@brief` always; `@param` and
`@return` where a signature is not self-evident. A single-line `@brief` is enough
for a simple accessor.

Document **why**, not what. `set_parent_index()` does not need explaining;
*why the hierarchy is a flat array with parent indices rather than a tree* does —
and that belongs in a comment pointing at [A-3].

## 6. Testing

GoogleTest, host build, no hardware. `cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON`.

- **Every behavioural change gets a test.** Sizing changes get a `sizeof`
  assertion, so a regression is caught rather than discovered in a budget report.
- **Do not weaken an existing test to make a change pass.** If one legitimately
  must change, say which and why in the commit message. WO6 changed two, both
  documented.
- Tests must pass on a **clean clone** of the branch, not merely in a working
  tree. A commit whose tests only pass with uncommitted changes present is
  broken — this happened once and was repaired by squashing.

## 7. Portability

The runtime builds for embedded, Wasm and host. Therefore:

- No platform headers outside a guard. U8G2 is reached through the stub on host
  builds.
- No assumption that `int` is 32-bit, or that a pointer is 4 or 8 bytes. Size
  reports state which host produced them.
- The editor build compiles extra machinery under `#ifdef U8G2GL_EDITOR`
  ([UD-4]) — a class registry and property thunks. **Firmware must pay nothing
  for it.** If a change makes editor support cost firmware bytes, it is wrong.
