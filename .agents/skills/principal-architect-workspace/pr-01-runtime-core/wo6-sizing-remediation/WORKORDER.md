---
name: pr-01-runtime-core-wo6
description: Handoff instructions for Work Order 6 — memory sizing remediation
complexity: standard
---

# WO6 — Sizing Remediation

**Parent PR:** `pr-01-runtime-core` (see `../PROJECT.md`)
**Branch:** `u8g2gl-runtime/wo6-sizing-remediation`, based on `u8g2gl-runtime/wo5-frame-gate`
**Human approval of this decomposition:** recorded in `../PROJECT.md` status log, 2026-09-08

---

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan. Your task is strictly limited to executing the checklist below.

---

## Objective

Fix four memory-sizing defects found in the PR-01 Chief Architect review. One (Finding A) is a **spec violation**; the other three are cheap wins that get harder to apply once PR-03 builds widgets on this base. Together they reduce a representative project from ~2480 B to ~870 B of static RAM.

**Do not attempt Finding E** (style-index table). It is deliberately deferred and out of scope.

---

## Background — why each change

Read these; the *reason* matters because it constrains the fix.

**Finding A — string subjects ignore declared `max_len`. This is a spec violation.**
`u8g2gl_subject_string` allocates `U8G2GL_MAX_STRING_LEN` (128 B) unconditionally, and `max_len_` only controls truncation. [design_spec.md §8.2](../../../../../docs/design_spec.md) requires the buffer be *"sized by `max_len`"* and that *"the RAM is declared, bounded, and reported (§18)"*. Neither currently holds, and §18's budget report would therefore be wrong — which §1.3 makes non-negotiable.

**Finding B — observer arrays are a fixed 16 slots per subject.**
At 24 B/slot that is 384 B of a scalar subject's 400 B. Per §13 the generator knows exactly how many objects bind to each subject at build time, so a global constant is the wrong mechanism. The runtime must *support* per-subject sizing now; PR-04's generator will use it later.

**Finding C — style enums are untyped, costing 16 B per object.**
`u8g2gl_align_t`, `u8g2gl_color_t`, `u8g2gl_font_mode_t` and `u8g2gl_bitmap_mode_t` have no explicit base type, so each is `int` (4 B). Note that `u8g2gl_binding_op_t : uint8_t` and `u8g2gl_style_prop_t : uint16_t` in the same codebase *are* typed — this is an inconsistency, not a decision.

**Finding D — `bool active` in `u8g2gl_observer` is redundant.**
`cb == nullptr` already conveys inactive, and the bool forces padding to pointer alignment: 24 B/slot instead of 16 on 64-bit.

---

## Strict Boundary Box

**Do NOT touch:**
- `docs/` — any file. Documentation is the Architect's.
- `.agents/` — except appending your Completion Report to *this* file.
- Any file outside `include/u8g2gl/`, `src/`, `test/`, `CMakeLists.txt`.
- `u8g2gl_obj`'s virtual dispatch, the flat-array/parent-index design, or the frame-gate logic. Those are ratified decisions (PD-3, [A-3], [D-15]).
- The **style-index table** idea (Finding E) — explicitly deferred.
- Public API *names*. `u8g2gl_subject_string` etc. must keep their names; only their storage strategy changes.

**Do NOT:** create branches, open PRs, rebase, or merge. You are already on the correct branch.

---

## Tooling Constraints

No project-specific MCP build tooling exists. Use raw CLI:

```bash
cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON
cmake --build build
ctest --test-dir build --output-on-failure
```

All 75 existing tests currently pass with zero warnings under `-Wall -Wextra -Wpedantic`. **Both properties must still hold when you finish.**

---

## Line-Item Instructions

### Finding C — pack the style enums (do this first; it is the simplest and shrinks the blast radius of later steps)

- [ ] `include/u8g2gl/u8g2gl_types.h` — give explicit `: uint8_t` base types to `u8g2gl_align_t`, `u8g2gl_color_t`, `u8g2gl_font_mode_t`, `u8g2gl_bitmap_mode_t`. Leave `u8g2gl_event_t` and `u8g2gl_subject_type_t` alone unless they are used in a size-critical struct.
- [ ] `include/u8g2gl/u8g2gl_style.h` — reorder `u8g2gl_style` members largest-alignment-first: pointer, then `int16_t` fields (`padding`, `radius`) and `set_mask`, then all `uint8_t`/`bool` fields. Behaviour must not change.
- [ ] Verify `sizeof(u8g2gl_style)` drops from 40 to ~24 on the 64-bit host.

### Finding D — remove the redundant observer flag

- [ ] `include/u8g2gl/u8g2gl_subject.h` — delete `bool active` from `u8g2gl_observer`. Treat `cb != nullptr` as the liveness test everywhere.
- [ ] `src/u8g2gl_subject.cpp` — update all uses accordingly.
- [ ] Verify `sizeof(u8g2gl_observer)` drops from 24 to 16 on the 64-bit host.

### Finding B — per-subject observer capacity

Use the **non-template base + templated storage** pattern, so logic is not duplicated per instantiation:

```cpp
class u8g2gl_subject_int_base {          // all logic; takes storage by pointer + capacity
protected:
    u8g2gl_subject_int_base(u8g2gl_observer* slots, uint8_t cap);
    // ...
};

template<uint8_t N = U8G2GL_DEFAULT_OBSERVERS>
class u8g2gl_subject_int_n : public u8g2gl_subject_int_base {
    u8g2gl_observer slots_[N];
    // ...
};

using u8g2gl_subject_int = u8g2gl_subject_int_n<>;   // source compatibility
```

- [ ] `include/u8g2gl/u8g2gl_config.h` — replace `U8G2GL_MAX_OBSERVERS 16` with `U8G2GL_DEFAULT_OBSERVERS 4`, still `#ifndef`-guarded so it can be overridden with `-D`.
- [ ] `include/u8g2gl/u8g2gl_subject.h` — apply the pattern above to all four subject types (`int`, `string`, `bool`, `time`).
- [ ] `src/u8g2gl_subject.cpp` — move logic into the `_base` classes. **No logic may live in the template**, so distinct capacities do not duplicate code.
- [ ] Keep `add_observer()` returning `bool`, and make overflow **fail loudly in debug**: `assert` on overflow while still returning `false` in release.

### Finding A — right-size string subject buffers (the spec fix)

- [ ] `include/u8g2gl/u8g2gl_subject.h` — apply the same base+template split so the character buffer is sized by a template parameter, not `U8G2GL_MAX_STRING_LEN`:

```cpp
template<uint16_t MaxLen = 32, uint8_t N = U8G2GL_DEFAULT_OBSERVERS>
class u8g2gl_subject_string_n : public u8g2gl_subject_string_base { char buffer_[MaxLen + 1]; ... };
using u8g2gl_subject_string = u8g2gl_subject_string_n<>;
```

- [ ] `MaxLen` is the declared `max_len` from §8.2. Allocate `MaxLen + 1` for the terminator and say so in a comment.
- [ ] `set()` must still truncate at `MaxLen` and always null-terminate. Truncation is silent at runtime per §8.2.
- [ ] Retire `U8G2GL_MAX_STRING_LEN` from `u8g2gl_config.h`, or keep it *only* as the default for `MaxLen` — but the default must be **32**, matching §8.2, not 128.
- [ ] Add `get_capacity()` so the §18 budget report can read the real allocation.

### Tests

- [ ] `test/test_subject.cpp` — add cases: a `u8g2gl_subject_string_n<16>` truncates at 16 and null-terminates; observer overflow past capacity returns `false`; distinct capacities coexist in one translation unit.
- [ ] `test/test_style.cpp` — add a static-assert-style check that `sizeof(u8g2gl_style)` is at or below the expected packed size on the host.
- [ ] Add a `sizeof` report test that prints the final sizes, so future reviews can see them without reading code.

---

## Verification Requirement

- [ ] `cmake --build build` completes with **zero warnings** under `-Wall -Wextra -Wpedantic`.
- [ ] `ctest` — **all** tests pass, including the 75 pre-existing ones. Existing tests must not be weakened to accommodate the change; if one legitimately must change, say which and why in your report.
- [ ] Report final `sizeof` for `u8g2gl_obj`, `u8g2gl_style`, `u8g2gl_observer`, and each subject type at default capacity.

**CRITICAL:** Before committing, ask the user whether they are happy with the changes.

---

## Issue Surfacing

If you find a defect, upstream bug, or concern *outside your boundary box*, surface it in your Completion Report — **do not file issues directly** and do not fix it. The Architect triages and files under the correct identity.

Of particular interest: anything suggesting the delivered API will not match the [design_spec.md §13](../../../../../docs/design_spec.md) generator contract, since PR-04 will generate against it and no test in PR-01 can catch a mismatch.

---

## Completion Report

<!-- Written by the worker at task completion -->
