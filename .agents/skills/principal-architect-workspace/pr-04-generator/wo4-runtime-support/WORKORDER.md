---
work_order: WO4
project: pr-04-generator
title: "Runtime support for generated code: render wrapper, version guard, frame-dirty observer"
branch: u8g2gl-generator/wo4-runtime-support
base: u8g2gl-generator/wo3-bindable-geometry
complexity: standard
status: complete
---

# WO4 — Runtime support for generated code

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo4-runtime-support`
**Base**: `u8g2gl-generator/wo3-bindable-geometry`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/cpp.md`. No heap, zero warnings, Doxygen
on public declarations.

## Design authority

design_spec §11.3, §13.3, §13.5, §13.7, §16. Runtime version **0.4.0 is
owner-approved** (PROJECT.md decision 5). Where this work order and the spec
disagree, **stop and report**.

---

## Objective

Give generated code the runtime calls §13 assumes but that do not exist, so the
emitters in WO9–WO10 generate calls rather than inline boilerplate.

## Background

- `ui_handler` calls `render_fn` and nothing else. §11.3 says the framework
  constructs `u8g2gl_state_saver` and sets the clip window around each object's
  render; nothing in `src/` does. `u8g2gl_effective_clip()` and
  `u8g2gl_is_effectively_visible()` exist in `u8g2gl_tree.h` but have no caller.
- §16: "the runtime refuses to compile against a mismatched major version". No
  version macro exists; `CMakeLists.txt` says `0.3.0`.
- §13.5 (corrected on `main`): draw-call elements with bindings need **one
  frame-dirty observer per subject**, calling `u8g2gl_mark_dirty()`. The observer
  signature is `void(*)(void*)`; there is no function of that shape to register.

## Line-Item Instructions

- [x] **`u8g2gl_render_object(U8G2&, u8g2gl_obj* const* objs, const uint8_t* parents, uint8_t index)`**
      (exact signature the worker's to settle against `u8g2gl_screen`): skip if
      not effectively visible; construct `u8g2gl_state_saver`; set the effective
      clip; call `render()`. One implementation serving firmware and the editor.
- [x] **`include/u8g2gl/u8g2gl_version.h`:** runtime major/minor/patch and the
      schema major the runtime supports, plus the macro or `static_assert` hook a
      generated header uses to refuse a mismatched major. Wire `CMakeLists.txt`
      `project(... VERSION 0.4.0)` so the two cannot disagree silently (a test or a
      configure-time check).
- [x] **Frame-dirty observer:** a free function matching `u8g2gl_observer_cb` that
      calls `u8g2gl_mark_dirty()`.
- [x] **Carried from WO2 — W3:** `u8g2gl_progress_bar::set_value()` marks dirty
      even when the value is unchanged. Apply the house change-guard; a test that a
      same-value set leaves the frame clean.
- [x] **Carried from WO2 — W8:** `test/test_subject.cpp` has a placeholder file
      header and a comment claiming binds discard their result, which WO2 made
      untrue (they return `bool`). Correct both.
- [x] Document the generated-config inclusion order ([D-21]) in
      `u8g2gl_config.h`'s header comment against the real generated file name.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_tree.h`, `u8g2gl_core.h`, `u8g2gl_config.h`
(comment only), new `u8g2gl_version.h`, matching `src/` files, `CMakeLists.txt`
(version), `src/u8g2gl_progress_bar.cpp` (W3 only), `test/`, this WORKORDER.

**Do NOT touch:** editor types (WO11); widgets; manifests; CLI.

---

## Testing Requirement

- [x] A hidden ancestor suppresses a child's render; a child is clipped to an
      ancestor's bounds; U8G2 state is restored after the call (stub history).
- [x] A translation unit asserting a mismatched major fails to compile — proven
      with a `try_compile` or equivalent, not by argument.
- [x] Setting a subject observed by the frame-dirty callback marks the active
      screen dirty.

## Verification Requirement

- [x] C++ build zero warnings; `ctest` all pass
- [x] CLI suite unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: complete.** Implementation commit `6a78247`; this report is committed separately.

### Authorization verified (from committed artifacts)

- Front matter named `project: pr-04-generator` and `status: dispatched`.
- `../PROJECT.md` "Human Approval" records the owner's own words: *"Approved — proceed with the
  twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- The status log records WO4 as dispatched on this branch. Decision 5 approves runtime 0.4.0.
- The spec was read from `main` (`git show main:docs/design_spec.md`, which includes `4e4b992`).

### Per line item

1. **Render wrapper.** Declared in `u8g2gl_core.h`, implemented in `src/u8g2gl_core.cpp`.
   - Returns without drawing if `u8g2gl_is_effectively_visible()` is false. That check also
     rejects a null array or a null entry on the ancestry chain.
   - Returns without drawing if `u8g2gl_effective_clip()` is empty.
   - Otherwise it constructs `u8g2gl_state_saver` and calls
     `setClipWindow(x, y, x+w-1, y+h-1)` (the §11.3 form). It then calls `render()` and resets
     with `setMaxClipWindow()`.
   - Clip corners are computed in `int`. A negative origin is clamped to 0, and a region wholly
     above or left of the display is skipped. U8G2 takes unsigned coordinates, so a negative
     corner would otherwise wrap rather than clip.
   - Nothing is allocated; there is one stack guard.
2. **Version header.** `include/u8g2gl/u8g2gl_version.h` defines:
   - `U8G2GL_VERSION_MAJOR/MINOR/PATCH` = 0.4.0
   - `U8G2GL_SCHEMA_VERSION_MAJOR/MINOR` = 0.4
   - `U8G2GL_REQUIRE_SCHEMA_VERSION(major, minor)`

   `CMakeLists.txt` is now `project(u8g2gl VERSION 0.4.0)`, with a configure-time check (details
   under "How the version guard works" below).
3. **Frame-dirty observer.** `void u8g2gl_frame_dirty_observer(void*)`, in core, calls
   `u8g2gl_mark_dirty()`. In `u8g2gl_core.cpp`, a `static_assert` with `std::is_same` pins it
   to `u8g2gl_observer_cb`. If the observer type drifts, the library fails to build, rather than
   a user's generated code.
4. **W3.** `set_value()` now returns early when the clamped value equals `target_percent_`.
   - It compares against the target, not the displayed value, so re-setting the current target
     mid-animation neither restarts the interpolation nor dirties the frame.
   - The duplicate guard in `on_value_changed()` is removed, and its comment now says the guard
     lives in `set_value()`.
   - The header doc for `set_value()` never claimed it always marks dirty, so it needed no change.
   - New test `ProgressBar.SameValueSetLeavesFrameClean` checks the object flag and the active
     screen's `dirty` flag in three cases: instant, clamped-equal, and animated re-set.
5. **W8.** `test_subject.cpp` now has a real Purpose/Description header. Beyond the comment, the
   comment's second false claim ("no bind_x/y/w/h entry point yet") was also untrue after WO3.
   - `Binding.FourGeometryBindingsPlusTextFitTheDefaultBudget` now uses the real
     `bind_x/y/width/height` plus `bind_text`, with `EXPECT_TRUE` on every `bool` return.
   - It also asserts the bound geometry values were applied.
   - This strengthens the test; no assertion was removed without a stronger replacement.
6. **Config comment.** The `u8g2gl_config.h` header now documents that
   `u8g2gl_generated_config.h` must be seen before `u8g2gl_config.h`, because the `#ifndef`
   defaults fill only the gaps. It also documents that the order must hold in the runtime
   library's own translation units, not only in generated ones (see finding F5). Comment only.

### Final signature of `u8g2gl_render_object`, and why

```cpp
void u8g2gl_render_object(U8G2& display, u8g2gl_obj* const* objs,
                          const uint8_t* parents, uint8_t index);
```

The signature is exactly as proposed. Checked against `u8g2gl_screen`, the arguments are the
screen's own fields, so a call is `u8g2gl_render_object(d, s.objs, s.parents, i)`.

I did not use `const u8g2gl_screen&` for three reasons:

- §13.12's generated render function has the file-local static arrays in scope, not necessarily
  a screen struct.
- The parameters match the existing `u8g2gl_tree.h` walks, so the wrapper passes them straight
  through. The `const` conversion is implicit.
- The editor build can call it with the same arrays.

It is `void` because a caller has no use for "skipped".

It lives in `u8g2gl_core` rather than `u8g2gl_tree`. The tree module has no U8G2 dependency, and
core owns the frame.

### How the version guard works, and how its failure was proven

- A generated header writes `U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);` at namespace scope. That
  expands to `static_assert((major) == U8G2GL_SCHEMA_VERSION_MAJOR, "U8G2GL schema major version mismatch: …")`.
- **Proof of refusal.** `test/CMakeLists.txt` adds two `EXCLUDE_FROM_ALL` targets, built through
  CTest with `cmake --build … --target …`:
  - `VersionGuard.MismatchedSchemaMajorFailsToCompile` builds `test/version_guard/mismatch.cpp`,
    which passes `U8G2GL_SCHEMA_VERSION_MAJOR + 1`. The test has
    `PASS_REGULAR_EXPRESSION "U8G2GL schema major version mismatch"`, so it passes only when the
    compile fails *with the guard's own message*. An unrelated build break fails the test.
  - Observed compiler output:
    `mismatch.cpp:22:1: error: static assertion failed due to requirement '(0 + 1) == 0': U8G2GL schema major version mismatch: …`
  - `VersionGuard.MatchingSchemaMajorCompiles` is the control. It is identical except for the
    major, and must build, which proves the harness can compile anything at all.
  - Both share a `RESOURCE_LOCK` so the two builds never run concurrently in one tree.
- **CMake ↔ header agreement.**
  - The root `CMakeLists.txt` parses the header's macros with `file(STRINGS)` and stops with
    `FATAL_ERROR` if they are not `VERSION_EQUAL PROJECT_VERSION`. The header is added to
    `CMAKE_CONFIGURE_DEPENDS`.
  - Proven by configuring a throwaway copy in `tmp/` with the header minor changed to 5: it
    stopped with `Runtime version mismatch: CMakeLists.txt says 0.4.0, include/u8g2gl/u8g2gl_version.h says 0.5.0`.
    The copy was deleted afterwards.
  - `Version.HeaderMatchesCMakeProjectVersion` also compares the header against compile
    definitions taken from `PROJECT_VERSION_*`. That catches the same drift in a build tree
    configured before the change.

### Test counts

| Suite | Before | After |
|---|---|---|
| C++ `ctest` | 266 (1 known skip) | **277** (same one skip: `SizeOfReport.ThirtyTwoBitTarget`) |
| CLI `vitest` | 406 | **406** |

The 11 new C++ tests:

- **Core, render wrapper (6):** HiddenAncestorSuppressesChild (through `ui_handler`, with an
  un-hide control), ClipsChildToAncestorBounds, WhollyClippedChildIsNotRendered,
  RestoresDisplayStateAfterRender, ClampsNegativeClipOrigin, NullArrayRendersNothing.
- **Core, observer (1):** FrameDirtyObserverMarksActiveScreenDirty.
- **ProgressBar (1):** SameValueSetLeavesFrameClean.
- **Version (1):** HeaderMatchesCMakeProjectVersion.
- **VersionGuard (2):** MatchingSchemaMajorCompiles, MismatchedSchemaMajorFailsToCompile.

Zero warnings under `-Wall -Wextra -Wpedantic`, including the guard targets. `npx tsc --noEmit`
and `npm run lint` are clean. No CLI file was touched.

### Decisions I had to make

- **D1 — Guard compares the schema major, not the generator or runtime major.**
  - §16 says the runtime refuses a "mismatched major version" and that generated files record
    the generator version.
  - But the CLI (0.6.0, going to 0.7.0) and the runtime (0.4.0) carry different numbers, so
    comparing generator major with runtime major would mean nothing.
  - The WORKORDER names "the schema major the runtime supports".
  - The macro takes the minor too, so generated code states its full schema version once and
    the policy can tighten without changing what the generator emits. See F2 and F3.
- **D2 — Clip reset.** The clip is reset with `setMaxClipWindow()` after `render()`, because
  `u8g2gl_state_saver` cannot save the clip (F4). The full display is correct between objects:
  effective clips are computed from ancestors, never nested inside an active clip.
- **D3 — Negative origins and empty clips.** A negative clip origin is clamped to 0, and an
  empty or entirely off-screen clip skips `render()`. Not specified in the spec. It is required
  because U8G2 takes unsigned coordinates, and it follows the `u8g2gl_effective_clip()` doc:
  "callers should skip drawing".
- **D4 — W3 compares against `target_percent_`** (reason in item 4).
- **D5 — W8 swaps the test body, not just the comment.** The old flag-binding stand-in was
  only there because geometry bindings did not exist. Keeping it would have left the corrected
  comment describing a test that no longer made sense.

### Out-of-scope findings (not fixed, not filed)

- **F1 — The `setClipWindow` corner convention may be off by one against U8G2.**
  - §11.3 specifies `setClipWindow(x, y, x+w-1, y+h-1)`, and `src/u8g2gl_label.cpp:314` uses the
    same form. I followed the spec.
  - From memory, U8G2's reference documents the range as x0 *included* to x1 *excluded*. If
    that is right, every framework clip, and the label's own, loses its last column and row.
  - **Not verified in this session:** no U8G2 source is in the repo or on this machine, and the
    stub cannot tell. → Chief Architect / spec, with a check against U8G2 source.
- **F2 — The spec's "lockstep" versioning is false today.** §16 says the runtime ships
  "versioned in lockstep with the CLI", but CLI 0.6.0/0.7.0 and runtime 0.4.0 are not. The
  wording also leaves open which major is compared (D1). → Chief Architect / spec.
- **F3 — A major-only guard catches nothing before 1.0.**
  - Schema 0.3 and 0.4 are both major 0, yet §15.4 calls 0.3 → 0.4 breaking.
  - As specified ("major"), the guard will not refuse code generated for 0.3.
  - Semver convention treats the minor as the breaking component before 1.0. The macro already
    takes the minor, so tightening is a one-line runtime change with no generator change.
  - → Owner decision (rules/03: schema policy).
- **F4 — The state saver does not save the clip window.**
  - `u8g2gl_state_saver` saves only font and draw colour.
  - Its own header comment and §11.3 say it also saves the clip window, and U8G2 has no getter
    for it. `u8g2gl_render_object` compensates (D2), but the header and spec text are stale.
  - It also does not restore font mode or bitmap mode, which widgets set (the progress bar sets
    font mode).
  - `u8g2gl_state_saver.h` is outside this Boundary Box.
- **F5 — The [D-21] generated config must reach the runtime library's own sources.**
  - `U8G2GL_MAX_TOTAL_BINDINGS` and `U8G2GL_MAX_BINDINGS_PER_OBJ` are read only in
    `src/u8g2gl_obj.cpp`, where they size the static binding pool.
  - Including `u8g2gl_generated_config.h` ahead of `u8g2gl_config.h` in generated files alone,
    as §13.7 describes, changes nothing: the library keeps the defaults.
  - WO9/WO10 need a mechanism that reaches every translation unit, such as a build flag or
    `-include`. Otherwise the §18 capacity report would be untrue. → PA (WO9/WO10), and a spec
    wording point for §13.7.
- **F6 — The label applies its own clip, replacing the framework's.**
  - `u8g2gl_label::render` calls `setClipWindow(x_, y_, x_+w_-1, y_+h_-1)` and then
    `setMaxClipWindow()` when scrolling.
  - Under the wrapper, that replaces the ancestor-intersected clip with the label's own bounds.
    A scrolling label inside a narrower container can therefore draw outside the container.
  - Widgets are outside this Boundary Box. → The label should rely on the framework clip, or
    intersect with it.
- **F7 — The §13.12 worked example predates the wrapper.**
  - It emits `bar.render(d)` etc. directly, and comments "hidden flag checked by the object".
  - `u8g2gl_obj::render` checks no flag. Visibility and clipping happen only in
    `u8g2gl_render_object`, so generated code that follows the example literally draws hidden
    objects unclipped.
  - → Chief Architect: the example should show `u8g2gl_render_object(d, ui_screen_home_objs, ui_screen_home_parents, i)`.
- **F8 — Placeholder file headers in test sources.** `test_core.cpp` also had a placeholder
  header; I replaced it because I was editing the file (in `test/`, in scope). Other test files
  outside this WO may still carry placeholders; I did not audit them.
