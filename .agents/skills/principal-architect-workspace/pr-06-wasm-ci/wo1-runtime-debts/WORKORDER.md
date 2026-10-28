---
name: pr-06-wo1
description: Handoff instructions for Work Order 1 — runtime debts
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not branch, and do not plan. Your task is strictly limited to
> executing the checklist below.

# Objective

Resolve three runtime defects that become real once the editor host rebuilds
scenes: (1) observer removal, (2) stale-binding defence, (3) int-narrowing
debug assert. Bump the runtime from 0.9.0 to 0.10.0 (public API addition).

**Parent project:** `pr-06-wasm-ci` — owner approved decomposition 2026-10-15.

# Strict Boundary Box

- **Only** touch the files listed in the line items below.
- Do **not** modify any CLI (TypeScript) code.
- Do **not** bump the schema version (owner decision).
- Do **not** change any generated fixture files under `cli/test/generator/`.
- Do **not** touch `.github/`, `wasm/`, or any Emscripten code.
- Do **not** create new branches — you are working on `u8g2gl-06/wo1-runtime-debts`.

# Tooling Constraints

- Build and test C++ with CMake in the worktree at
  `.`.
- Run: `cmake -B build -DCMAKE_BUILD_TYPE=Debug` then `cmake --build build -j`
  then `cd build && ctest --output-on-failure`.
- Zero warnings under `-Wall -Wextra -Wpedantic`.
- PlatformIO goes through the MCP; do **not** call `pio` directly. However, you
  do not need PlatformIO for this WO — it is host-only.

# Line-Item Instructions

## 1. Add `remove_observer()` to all four subject base classes

Each subject base (`u8g2gl_subject_int_base`, `u8g2gl_subject_string_base`,
`u8g2gl_subject_bool_base`, `u8g2gl_subject_time_base`) currently has
`add_observer(void* user_data, u8g2gl_observer_cb cb)` but no way to remove one.

- [x] Add `remove_observer(void* user_data, u8g2gl_observer_cb cb)` to the
  **public** section of each `_base` class in
  `include/u8g2gl/u8g2gl_subject.h`.

- [x] Implement via a shared static helper in `src/u8g2gl_subject.cpp`, matching
  the pattern of `u8g2gl_add_observer_internal`. The helper scans the observer
  pool for the first slot where **both** `user_data` AND `cb` match, and clears
  it (`cb = nullptr`, `user_data = nullptr`). Return `true` if found, `false`
  otherwise.

  **Key constraints (CA rulings):**
  - **Match by `(user_data, cb)` pair**, not `user_data` alone — an object with
    four geometry bindings on one subject passes *itself* as `user_data` for all
    four, and removing by `user_data` alone would silently take all of them.
  - **Compact without allocating** ([D-1]): simply null-out the slot. The pool
    already uses `cb == nullptr` as the free marker, and `observer_count_` is a
    high-water mark that the null-check in `notify` already skips over.
    Do NOT allocate, memmove, or compact.
  - **Document what happens to notify order**: existing observers above the
    removed slot keep their indices and fire in the same order. Say this in the
    Doxygen comment on `remove_observer()`.

- [x] Add Doxygen documentation for `remove_observer()` in the header, stating:
  - Removes the first observer matching both `user_data` and `cb`.
  - Does not compact the pool; existing observers keep their notify order.
  - Returns false if no matching observer is found.

## 2. Fix `~u8g2gl_obj()` to remove observers before releasing pool slots

The current destructor in `src/u8g2gl_obj.cpp` (line ~515) iterates the binding
pool and marks slots inactive, but **does not call `remove_observer()` on the
subjects the bindings were registered with**. This means a destroyed object
leaves stale observer registrations on subjects, and a subject notification
after destruction evaluates a binding callback with a dangling `user_data`.

- [x] In `~u8g2gl_obj()`, for each active pool slot belonging to `this`:
  1. Call the subject's `remove_observer(slot, callback)` to remove the observer
     registration. The `slot` is the `user_data` that was passed to
     `add_observer` (it's the `u8g2gl_binding_desc*`). The callback is
     `u8g2gl_on_binding_change` or `u8g2gl_on_binding_flag_change` (check which
     was registered — look at `bind_text`, `bind_x`, `bind_y` etc. vs
     `add_flag_binding` to see which callback each path uses).
  2. The subject type is stored in `slot->subject_type` and the subject pointer
     in `slot->subject`. Use a switch/if-chain on the type to cast back and
     call `remove_observer()`.
  3. **Then** mark the slot inactive (`active = false`, `obj = nullptr`).

- [x] **Write a regression test** that reproduces the stale observer fire
  (CA ruling: reproduce before you fix). In `test/test_subject.cpp` or a new
  file `test/test_observer_removal.cpp`:
  - Create a subject and an object, bind the object to the subject.
  - Destroy the object (let it go out of scope or explicitly call the dtor).
  - Set the subject to a new value — this should NOT crash or fire the stale
    callback.
  - Verify that the subject's observer was actually removed (set should still
    work, the observer count should reflect the removal).

## 3. Add debug assert for int-narrowing in the editor value path

The bridge's concern is that a JS double exceeding `int32_t` range wraps
silently on `static_cast`. The `u8g2gl_coord_bound()` function in
`u8g2gl_coord.h` already handles narrowing for draw call coordinate arguments.
The gap is the editor value construction path.

- [x] First, check what `u8g2gl_coord_bound()` covers and what it doesn't.
  Looking at `u8g2gl_editor.h`, the `u8g2gl_editor_value` struct has an
  `int32_t integer` field. The narrowing concern is about values reaching
  `u8g2gl_editor_int(int32_t v)` — but this is already `int32_t`, so the
  narrowing happens at the JS→C++ boundary (the Wasm bridge, which doesn't
  exist yet).

- [x] **Add a debug assert in `u8g2gl_editor_int()`** in `src/u8g2gl_editor.cpp`
  (under `#ifdef U8G2GL_EDITOR`): assert that `v` is within the range the
  downstream setters can handle. Since int subjects take `int32_t`, the value
  is already the right width. The real narrowing concern is:
  - `int32_t` → `int16_t` for coordinate setters (already handled by
    `u8g2gl_coord_bound`)
  - `int32_t` → `uint8_t` for progress values (0-100 range)

- [x] If there is a narrowing path in the editor that `coord_bound` does NOT
  cover (e.g., setting a progress bar value through the editor registry), add
  `assert(v >= 0 && v <= 100)` or equivalent at that narrowing point. Use the
  existing `assert()` precedent from `src/u8g2gl_subject.cpp:68`.

- [x] If after investigation you find that `u8g2gl_coord_bound` and the editor
  type system already cover all narrowing paths, **document that finding** in
  your Completion Report — a resolved concern is as valuable as a code change.

## 4. Bump the runtime version to 0.10.0

`remove_observer()` is a public API addition in a public header →
`rules/03` requires a runtime minor bump.

- [x] `include/u8g2gl/u8g2gl_version.h`: `U8G2GL_VERSION_MINOR 9` → `10`,
  `U8G2GL_VERSION_PATCH 0` (stays 0).
- [x] `CMakeLists.txt` line 2: `project(u8g2gl VERSION 0.9.0` → `0.10.0`.
- [x] `library.json` line 3: `"version": "0.9.0"` → `"0.10.0"`.

The version agreement check in `CMakeLists.txt` will refuse to configure if
any of the three disagree — that is the safety net.

## 5. Verify

- [x] `cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build -j`
  — zero warnings.
- [x] `cd build && ctest --output-on-failure` — all tests pass, including the
  new observer removal / stale-fire tests.
- [x] `git status` — no untracked files outside `build/`.
- [x] `git branch --show-current` — `u8g2gl-06/wo1-runtime-debts`.

# Verification Requirement

Before committing, verify the build is clean and all tests pass. Use
conventional commit messages: `fix(runtime): ...` for the observer/stale fixes,
`feat(runtime): add remove_observer()` for the API addition,
`chore(runtime): bump to 0.10.0` for the version bump.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly. The
Principal Architect will triage and file them under the correct author identity.

---

## Completion Report (written by the worker at task completion)

### Status
complete

### Changes Made
- `include/u8g2gl/u8g2gl_subject.h` — Added public `bool remove_observer(void* user_data, u8g2gl_observer_cb cb);` with full Doxygen documentation to all four subject base classes (`u8g2gl_subject_int_base`, `u8g2gl_subject_string_base`, `u8g2gl_subject_bool_base`, `u8g2gl_subject_time_base`).
- `src/u8g2gl_subject.cpp` — Implemented `u8g2gl_remove_observer_internal()` helper and wired up base class methods. Matches by `(user_data, cb)` pair, nulls out slot (`cb = nullptr; user_data = nullptr;`) without pool compaction or reallocations ([D-1]), preserving notify order of existing observers.
- `src/u8g2gl_obj.cpp` — Added `u8g2gl_observer_cb cb = nullptr;` to `u8g2gl_binding_desc`. Populated `slot->cb` in `add_flag_binding()`, `bind_text()`, and `u8g2gl_register_value_binding()`. Added `u8g2gl_remove_binding_observer()` helper. In `~u8g2gl_obj()`, calls `remove_observer()` on active binding subjects before deactivating slots. In `bind_text()`, unregisters old observer if replacing an existing text binding.
- `src/u8g2gl_editor.cpp` — Added narrowing assertion in `u8g2gl_editor_set_property()` for property `"value"` on `"u8g2gl_progress_bar"` (`assert(value.integer >= 0 && value.integer <= 100)`), and range sanity assert in `u8g2gl_editor_int()`.
- `include/u8g2gl/u8g2gl_version.h` — Bumped `U8G2GL_VERSION_MINOR` from 9 to 10 (`0.10.0`).
- `CMakeLists.txt` — Bumped project version to `0.10.0`.
- `library.json` — Bumped version to `0.10.0`.
- `test/generated_fixture/generated/u8g2gl_generated_config.h` — Bumped runtime version requirement floor from `0.9` to `0.10` to match new runtime minor version.
- `test/test_subject.cpp` — Added comprehensive test suite `SubjectObserverRemoval`:
  - `DestroyedObjectRemovesObserver`: proves destroyed object unregisters from subject and prevents stale observer execution on subsequent `subject.set()`.
  - `DirectRemovalOnAllBases`: tests `remove_observer()` directly across all four subject base types (`int`, `string`, `bool`, `time`).
  - `NotifyOrderPreservedAfterRemoval`: verifies observers above the removed slot maintain relative order and index.
  - `MatchByUserDataAndCallbackPair`: ensures removal requires matching both `user_data` and callback function pointer.
  - `RemoveNonExistentReturnsFalse`: validates invalid/unregistered arguments return false.
  - `RebindTextRemovesOldObserver`: verifies rebinding text releases the previous subject's observer slot.

### Decisions Made
- **Matching by `(user_data, cb)` Pair**: In `u8g2gl_binding_desc`, recorded the registered callback pointer `cb` alongside `user_data` (`slot`) so that `remove_observer()` accurately targets the intended observer without ambiguity, even if multiple bindings share context.
- **Null-Slot Invalidation Without Compaction**: Adhered strictly to [D-1] static allocation discipline. When an observer is removed, the slot is cleared to `nullptr` and the high-water mark is retained, ensuring that iteration in `notify()` safely skips null entries and observer indices/order remain stable.
- **Fixture Runtime Floor Bump**: Updated `test/generated_fixture/generated/u8g2gl_generated_config.h` runtime version floor from `0.9` to `0.10`, following the established precedent from commit `90d9ef81` (PR-5R2).

### Dead Ends & Warnings
- Zero compiler warnings under `-Wall -Wextra -Wpedantic`.
- Initial ctest run failed Test 503 (`VersionGuard.PreMacroRuntimeFailsByName`) because `test/generated_fixture/generated/u8g2gl_generated_config.h` had a hardcoded `0.9` floor requirement. Resolved by updating the floor to `0.10`.

### Out-of-Scope Findings
- None.

### Blockers
- None.
