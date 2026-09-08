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

## Round 1 — Completion Report

<!-- Captured by the Architect: SendMessage was unavailable, so the round-1 worker
     could not be resumed to write this itself. Adapter graceful-degradation path. -->

### Status
partial — findings A–D implemented; one gap found on review (see Round 2).

### Changes Made
- `include/u8g2gl/u8g2gl_types.h` — explicit `: uint8_t` base types on the four style enums (Finding C).
- `include/u8g2gl/u8g2gl_style.h` — members reordered largest-alignment-first.
- `include/u8g2gl/u8g2gl_subject.h` — `bool active` removed from `u8g2gl_observer` (Finding D); non-template `_base` + templated `_n<>` storage split applied to all four subject types (Findings A/B); `using` aliases retain source compatibility.
- `include/u8g2gl/u8g2gl_config.h` — `U8G2GL_MAX_OBSERVERS 16` → `U8G2GL_DEFAULT_OBSERVERS 4`; `U8G2GL_MAX_STRING_LEN` 128 → 32, now the default `MaxLen` template argument.
- `src/u8g2gl_subject.cpp` — logic moved into `_base` classes so distinct capacities do not duplicate code.
- `test/test_subject.cpp`, `test/test_style.cpp`, `test/test_core.cpp` — 3 new tests; sizeof report test added.

### Measured Result (Architect-verified against a WO5 baseline build)

| Type | Before (WO5) | After (WO6) |
|---|---|---|
| `u8g2gl_obj` | **64 B** | **48 B** |
| `u8g2gl_style` | 40 B | 24 B |
| `u8g2gl_observer` | 24 B | 16 B |
| `u8g2gl_subject_int` / `_bool` / `_time` | 400 B | 80 B |
| `u8g2gl_subject_string` | 528 B | 120 B |

Build clean, zero warnings under `-Wall -Wextra -Wpedantic`. 78/78 tests pass.

> **Architect correction:** the worker reported `u8g2gl_obj` as "48 → 48, unchanged". It was in fact **64 → 48**, a 25% reduction — Finding C's style packing propagates into the object because `u8g2gl_style` is embedded. Independently verified by building both branches.

### Decisions Made
1. **`max_len` semantics corrected** — the old runtime treated it as total buffer bytes including the terminator; it now means *usable characters*, with `MaxLen + 1` allocated. This required changing `SubjectString.Truncation`'s assertions (`init(8)` now yields 8 usable chars, previously 7). **Accepted by the Architect** as the better reading of §8.2; the spec ambiguity is being closed separately.
2. **Overflow asserts in debug** — `add_observer()` now `assert()`s on overflow while still returning `false` in release, per the WORKORDER. Existing and new overflow tests branch on `#ifdef NDEBUG` (`EXPECT_DEATH` vs `EXPECT_FALSE`).
3. Members inside the new `_base` classes reordered pointer-first — additional ~8 B/subject, consistent with Finding C's rationale.

### Out-of-Scope Findings
- **Binding API cannot accept non-default-capacity subjects.** `u8g2gl_obj::bind_text` / `bind_flag_if_*` take the default-capacity aliases (`u8g2gl_subject_int*`), not the `_base` types. `_n<2>` and `_n<4>` are sibling types with no conversion between them, so per-subject sizing is unreachable through the public API. **Architect assessment: this is in scope, not out of it** — Finding B's objective ("the runtime must support per-subject sizing now") is unmet without it, and PR-03/PR-04 would hit it immediately. Promoted to Round 2.

---

## Round 2 — Follow-up (binding API)

**Objective:** make Findings A and B actually reachable. Without this, per-subject sizing is built but unusable.

The boundary box excluded `u8g2gl_obj`'s *virtual dispatch, flat-array/parent-index design and frame-gate logic* — **not** its binding signatures. `include/u8g2gl/` was in scope throughout.

- [ ] `include/u8g2gl/u8g2gl_obj.h` + `src/u8g2gl_obj.cpp` — widen binding parameters from the default-capacity aliases to the base types: `u8g2gl_subject_int_base*`, `u8g2gl_subject_string_base*`, `u8g2gl_subject_bool_base*`, and the time equivalent if it has bindings. Covers `bind_text` and all four `bind_flag_if_*` variants plus their bool overloads. Any `_n<N>` converts implicitly to its base, so existing call sites keep compiling unchanged.
- [ ] Confirm `get_bound_text_subject()` / `get_bound_text_type()` still behave correctly when the stored pointer is a base pointer.
- [ ] **Add the test that proves A and B work end to end**: bind a `u8g2gl_subject_string_n<16>` and a `u8g2gl_subject_int_n<2>` through the *public* binding API and confirm the observer fires and the value propagates.
- [ ] Re-verify: zero warnings, all tests pass, and re-report sizeofs in case anything shifts.

### Round 2 Completion Report

<!-- Written by the round-2 worker at task completion -->

#### Status
complete — the binding API now accepts base-typed pointers, so a right-sized
subject can be bound end to end. All Round 2 checklist items done.

#### Changes Made
- `include/u8g2gl/u8g2gl_obj.h` — widened every binding parameter from the
  default-capacity aliases to the `_base` types: `bind_text` (both overloads)
  now take `u8g2gl_subject_int_base*` / `u8g2gl_subject_string_base*`; all
  four `bind_flag_if_*` int overloads take `u8g2gl_subject_int_base*`; all
  four bool overloads (`bind_flag_if_eq`/`bind_flag_if_not_eq`, each with an
  `int32_t` and a `bool` ref-value overload) take `u8g2gl_subject_bool_base*`.
  `u8g2gl_subject_time` has no bindings in the public API, so there is no
  time-equivalent to widen.
- `src/u8g2gl_obj.cpp` — matching signature changes on all definitions, plus
  the two internal `static_cast`s in `u8g2gl_evaluate_binding()` and
  `add_flag_binding()` that previously cast the stored `void* subject` back
  to the default-capacity alias now cast to the `_base` type instead (the
  stored pointer is a `_base*` once a non-default-capacity subject is bound,
  and since none of the four subject classes use virtual inheritance, a
  base-class pointer and its most-derived pointer are the same address —
  the cast is safe either way).
- `test/test_subject.cpp` — added two new tests: `Binding.RightSizedIntSubjectBindsAndPropagates`
  (binds a `u8g2gl_subject_int_n<2>` via both `bind_text` and
  `bind_flag_if_eq` through the public API, confirms the observer fires via
  `is_dirty()`/flag state, and confirms the value propagates via `get()`)
  and `Binding.RightSizedStringSubjectBindsAndPropagates` (binds a
  `u8g2gl_subject_string_n<16>` via `bind_text`, confirms the observer fires,
  and confirms the propagated value via `get()`).

#### Decisions Made
1. **No `_base` cast needed at the call site.** `u8g2gl_subject_int_n<N>`
   derives (single, non-virtual) from `u8g2gl_subject_int_base`, so passing a
   `_n<N>*` where a `_base*` parameter is expected is an implicit
   standard conversion — existing call sites using the default aliases
   (`u8g2gl_subject_int` == `u8g2gl_subject_int_n<>`) needed no changes and
   still compile unchanged, confirmed by the untouched Round-1 binding tests
   passing without modification.
2. **`get_bound_text_subject()` left returning the stored `void*` unchanged.**
   It already stored whatever pointer type was passed to `bind_text`; now
   that's a `_base*` rather than the default alias, but since the object
   layout has no virtual base and no multiple inheritance, the numeric
   pointer value is identical in either case. Verified directly: both new
   tests assert `obj.get_bound_text_subject() == &subject` where `subject`
   is the non-default-capacity object, and it passes without a cast.
3. **Did not add a time-subject binding overload.** The WORKORDER said "the
   time equivalent if it has bindings" — `u8g2gl_subject_time` has none in
   `u8g2gl_obj`'s public API (checked: no `bind_*` overload takes it), so
   there was nothing to widen there.

#### Dead Ends & Warnings
None. The change was mechanical once the `_base`/`_n<>` split from Round 1
was confirmed to use ordinary single inheritance — no virtual dispatch, no
multiple inheritance, so no pointer-adjustment concerns at the `void*`
boundary inside the binding-descriptor pool.

#### Re-verified sizeofs (unchanged from Round 1 — binding signatures do not
affect any struct's layout)

| Type | Round 1 | Round 2 |
|---|---|---|
| `u8g2gl_obj` | 48 B | 48 B |
| `u8g2gl_style` | 24 B | 24 B |
| `u8g2gl_observer` | 16 B | 16 B |
| `u8g2gl_subject_int` / `_bool` / `_time` (default capacity) | 80 B | 80 B |
| `u8g2gl_subject_string` (default capacity) | 120 B | 120 B |

Build clean, zero warnings under `-Wall -Wextra -Wpedantic` (verified with a
full `rm -rf build` + reconfigure + rebuild, not an incremental build).
80/80 tests pass (78 pre-existing, unmodified, + 2 new). No existing test was
weakened or changed.

#### Out-of-Scope Findings
None new. Round 1's note about the style-index table (Finding E) remains
deliberately deferred and untouched.

#### Blockers
None.
