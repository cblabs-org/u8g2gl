---
work_order: WO4b
project: pr-04-generator
title: "Clipping correctness and the pre-1.0 version guard"
branch: u8g2gl-generator/wo4b-clipping-version
base: u8g2gl-generator/wo4-runtime-support
complexity: standard
status: complete
---

# WO4b — Clipping correctness and the pre-1.0 version guard

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval" (owner's own words, timestamped), that
`../PROJECT.md` records **WO4b as approved at the owner checkpoint** ("Checkpoint
rulings"), and that this WORKORDER's `status` is `dispatched`. Otherwise **stop and
report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo4b-clipping-version`
**Base**: `u8g2gl-generator/wo4-runtime-support`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot
be answered, and your work will strand uncommitted.

## Standards

`u8g2gl-standards` skill, `references/cpp.md` and `references/documentation.md`. No
heap, zero warnings, Doxygen on public declarations, why-comments where a decision is
not obvious.

## Design authority

design_spec §11.3, §16 and `.agents/rules/03-versioning.md` **as they stand on `main`
@ `ef73776`** — your branch predates that commit, so read them with
`git show main:docs/design_spec.md` and `git show main:.agents/rules/03-versioning.md`.
Where this work order and the spec disagree, **stop and report** (record it, and
continue with the remaining items).

**Do not fetch U8G2 source** from the network (Chief Architect ruling).

---

## Objective

Make framework clipping trustworthy before generated code starts relying on it, and
make the version guard catch the pre-1.0 breaking change it currently lets through.

## Background

WO4 surfaced three clipping defects and one version-guard gap; the owner approved this
work order to close them.

- **F1 — the clip corner convention.** Both call sites use
  `setClipWindow(x, y, x+w-1, y+h-1)`, §11.3's form: `src/u8g2gl_core.cpp:160`
  (`u8g2gl_render_object`) and `src/u8g2gl_label.cpp:314` (scrolling label). The PA read
  the U8G2 **2.36.18** source already present on this machine, in
  departures-board-v3's PlatformIO cache
  (`departures-board-v3/framework/.pio/libdeps/esp32dev/U8g2/src/clib/`). It shows the
  second corner is **exclusive**:
  - `u8g2_apply_clip_window` (`u8g2_setup.c`) bounds `user_x1` by `clip_x1`, and
    `user_x1` defaults to `width`;
  - `u8g2_IsIntersection` (`u8g2_intersection.c`) says "upper limits are not included";
  - `u8g2_DrawHVLine` (`u8g2_hvline.c`) returns on `x >= user_x1`.

  So `x+w-1` loses the last column and row. **This is a source reading, not a pixel
  test** — nothing on this host renders through real U8G2.
- **F4 — the state saver.** `u8g2gl_state_saver` saves and restores draw colour and
  font only. Its header and §11.3 say it saves the clip window; U8G2 cannot read the
  clip back. It restores neither font mode nor bitmap mode.
- **F6 — the scrolling label replaces the framework clip.** It sets a clip to its own
  bounds and then calls `setMaxClipWindow()`. Its own bounds are not intersected with
  its ancestors', so inside a container it can paint outside the container. §11.3:
  "the clip window is set by the framework, not the widget".
- **Version guard.** `U8G2GL_REQUIRE_SCHEMA_VERSION` compares the major only, so a
  project generated for schema 0.3 compiles against a 0.4 runtime. §16 and rules/03
  on `main` now require major, **and minor while major is 0**.

## Line-Item Instructions

- [x] **One function owns the clip-corner convention.** Add a single runtime function
      (e.g. `u8g2gl_apply_clip(U8G2&, const u8g2gl_rect&)`) that converts a rect to a
      `setClipWindow` call, including WO4's clamping of negative origins. **Every**
      `setClipWindow` call in the runtime goes through it; no other file spells the
      corner arithmetic. Use the **exclusive** form, `(x, y, x + w, y + h)`.
- [x] **Document the convention at that one function**, exactly as the Chief
      Architect directed: state it as an **assumption not verified by a pixel test**,
      then cite the evidence it rests on — the U8G2 2.36.18 source reading above, with
      the three functions named — and state that PR-06's real-U8G2 build must add a
      pixel test at a container edge, which will show any one-pixel difference
      directly.
- [x] **Pin the convention with a test**: a rect of known `x, y, w, h` produces exactly
      `setClipWindow(x, y, x+w, y+h)` on the stub, and a negative origin clamps as
      before. The test's comment names the one function as the place to change if
      PR-06's pixel test disagrees.
- [x] **F4 — make the state saver's contract true.** Because U8G2 cannot read the clip
      back, the saver cannot restore it. Remove the claim from its header, and make
      clip lifetime the render wrapper's documented responsibility (set, render,
      reset). Also save and restore **font mode** and **bitmap mode** if the stub and
      the `U8G2` API used in `include/` support reading them; if either cannot be read
      back, say so in the header instead of implying it is saved.
- [x] **F6 — the label stops replacing the framework clip.** The scrolling label must
      not set its own clip window or reset to the full display when rendered through
      `u8g2gl_render_object`; the effective clip already bounds it (§11.3). If the
      label genuinely needs a clip narrower than its bounds, it must intersect with the
      effective clip and restore it, not the full display — and there is no way to read
      the clip back, so prefer removing the widget-side clip. A test: a scrolling label
      inside a narrower container never widens the clip beyond the container.
- [x] **Version guard — major, and minor while major is 0.** Change
      `U8G2GL_REQUIRE_SCHEMA_VERSION` so that at major 0 the minor must match too, with
      the refusal message naming both versions. Update its Doxygen to the §16 wording
      on `main`. Extend WO4's compile-failure tests: `(0, 3)` against schema 0.4 **must
      fail to compile**; `(0, 4)` compiles; a mismatched major still fails.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_tree.h`, `u8g2gl_core.h`, `u8g2gl_state_saver.h`,
`u8g2gl_version.h`, `u8g2gl_label.h`; `src/u8g2gl_tree.cpp`, `src/u8g2gl_core.cpp`,
`src/u8g2gl_label.cpp`; `test/` (tests, `test/version_guard/`, `test/CMakeLists.txt`,
`test/stubs/U8G2lib.h` read-back support only); this WORKORDER.

**Do NOT touch:** `docs/` (§11.3's `x+w-1` text is the Chief Architect's — report it);
manifests; the CLI; other widgets. Do **not** move `font`/`align`/text binding off
`u8g2gl_obj` (Q-10). Do **not** implement `bind_src` or `bind_glyph` (Q-12). Do **not**
fetch U8G2 source.

---

## Testing Requirement

- [x] Convention test pins `(x, y, x+w, y+h)` through the one function.
- [x] No `setClipWindow` call remains outside that function (`grep` in the report).
- [x] Scrolling label inside a narrower container does not widen the clip.
- [x] `U8G2GL_REQUIRE_SCHEMA_VERSION(0, 3)` fails to compile against 0.4, proven by a
      real failing compile; `(0, 4)` compiles; mismatched major still fails.

## Verification Requirement

- [x] `cmake --build build` — zero warnings (reconfigure if CMake files change)
- [x] `ctest --test-dir build` — all pass (baseline 277, one known skip)
- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (406)
- [x] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: complete.** Implementation commit `4094489`. This report is committed
separately.

### Authorization verified (from committed artifacts)

- The front matter names `project: pr-04-generator` and `status: dispatched`.
- `../PROJECT.md`, "Human Approval", records the owner's own words: *"Approved —
  proceed with the twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- `../PROJECT.md`, "Checkpoint rulings", records **"WO4b — APPROVED"** and
  **"Version guard — APPROVED, in WO4b"**. The status log records WO4b as dispatched
  on this branch.
- I read design_spec §11.3 and §16, and `rules/03-versioning.md`, from `main`
  (`git show main:…`).

### Per line item

1. **One function owns the clip-corner convention.**
   - `bool u8g2gl_apply_clip(U8G2& display, const u8g2gl_rect& clip);` is declared
     in `include/u8g2gl/u8g2gl_core.h` and implemented in `src/u8g2gl_core.cpp`.
   - It emits `setClipWindow(x, y, x + w, y + h)`, with the far corner exclusive.
   - It moved in WO4's clamping unchanged: a negative `x`/`y` clamps to 0. It
     returns `false` without touching the display for an empty rect, or for one
     with no pixel at non-negative coordinates (`x + w <= 0` or `y + h <= 0`).
   - `u8g2gl_render_object` now calls it. If it returns `false`, the wrapper skips
     `render()`.
   - `core.h` now includes `u8g2gl_tree.h` for `u8g2gl_rect`.

   `grep -rn setClipWindow include src` after the change:
   ```
   include/u8g2gl/u8g2gl_core.h:39: *     - u8g2gl_apply_clip():           The one place a rect becomes a setClipWindow() call
   include/u8g2gl/u8g2gl_core.h:134: *        setClipWindow().
   include/u8g2gl/u8g2gl_core.h:138: * setClipWindow(x, y, x + w, y + h), so the rect's last column (x + w - 1) and
   src/u8g2gl_core.cpp:159:// Converts a rect to setClipWindow() corners. The convention (exclusive second
   src/u8g2gl_core.cpp:191:    display.setClipWindow(x0, y0, x1, y1);
   ```
   There is one call, at `src/u8g2gl_core.cpp:191`. The other lines are comments.

2. **Convention documented at that function.** The Doxygen on the declaration in
   `u8g2gl_core.h` reads exactly:
   ```
   CLIP-CORNER CONVENTION — ASSUMPTION NOT VERIFIED BY A PIXEL TEST.
   The second corner is treated as exclusive: a rect {x, y, w, h} becomes
   setClipWindow(x, y, x + w, y + h), so the rect's last column (x + w - 1) and
   last row (y + h - 1) remain drawable. design_spec §11.3 writes x+w-1, y+h-1;
   that form would lose the last column and row if this assumption holds.

   Evidence: a reading of U8G2 2.36.18 source (not a render), in
   departures-board-v3's PlatformIO cache, src/clib/:
   - u8g2_apply_clip_window() (u8g2_setup.c) bounds user_x1 by clip_x1, and
     user_x1 defaults to the display width — an exclusive bound;
   - u8g2_IsIntersection() (u8g2_intersection.c) states "upper limits are not
     included";
   - u8g2_DrawHVLine() (u8g2_hvline.c) returns on x >= user_x1.

   Nothing on the host renders through real U8G2, so the stub cannot confirm
   this. PR-06's real-U8G2 build must add a pixel test at a container edge — an
   object whose clip is exactly its bounds, drawing its last column and row —
   which shows any one-pixel difference directly. If it disagrees, change this
   function and nothing else; Core.ApplyClipPinsExclusiveCornerConvention pins
   the current choice.
   ```
   The evidence is cited from this WORKORDER and was not re-derived.

3. **Pinning tests.** All three are in `test/test_core.cpp`.
   - `Core.ApplyClipPinsExclusiveCornerConvention`: `{12, 7, 30, 9}` produces
     exactly `setClipWindow(12, 7, 42, 16)`. Its comment names
     `u8g2gl_apply_clip()` as the one function to change if PR-06's pixel test
     disagrees.
   - `Core.ApplyClipClampsNegativeOrigin`: `{-3, -5, 10, 8}` produces
     `(0, 0, 7, 3)`.
   - `Core.ApplyClipRejectsEmptyAndOffDisplayRects` covers an empty rect, one wholly
     left of the display and one wholly above it, plus a one-pixel-on control.

4. **F4, the state saver's contract.**
   - **Saves:** draw colour and font, unchanged.
   - **Explicitly does not save, and says so in the file header and class doc:**
     - **The clip window.** U8G2 has no clip getter. Clip lifetime is now documented
       as `u8g2gl_render_object()`'s responsibility (set, render, reset), in both
       the saver's header and the wrapper's Doxygen.
     - **Font mode and bitmap mode.** Neither can be read back. The stub has only
       `setFontMode`/`setBitmapMode`. U8G2 2.36.18's `U8g2lib.h` (lines 250 and
       270) declares the same two setters and no getter. The header tells widgets
       to set the mode they need themselves.
   - Behaviour is unchanged. The old claim ("capturing font, draw colour and clip
     window") is gone.

5. **F6, the label stops replacing the framework clip.**
   - `u8g2gl_label::render_scroll()` no longer calls `setClipWindow()` or
     `setMaxClipWindow()`. In every `long_mode`, `render()` now draws inside
     whatever clip the wrapper set.
   - `render_animation_update()` runs outside the wrapper, while the main loop is
     blocked, so no framework clip exists there. It now clips its re-render to the
     label's own bounds through `u8g2gl_apply_clip()`, then resets to the full
     display. Before this change it got that clip from inside `render()`, so the
     blocked-loop behaviour is preserved rather than lost (D3).
   - The Doxygen for `render()` and `render_animation_update()` in
     `u8g2gl_label.h` states both facts.
   - Tests:
     - `LabelScroll.InsideNarrowerContainerNeverWidensClip` puts a 100-px marquee
       in a 40-px container through `u8g2gl_render_object`. After the label draws,
       exactly one clip has been set (x1 = 40), with no reset. The only reset is
       the wrapper's, afterwards.
     - `LabelScroll.RenderSetsNoClipWindow` checks that `render()` sets and resets
       no clip.
     - `LabelScroll.RenderAnimationUpdateClipsToOwnBounds` checks for
       `(10, 20, 70, 36)` and one reset.

6. **Version guard.**
   - `U8G2GL_REQUIRE_SCHEMA_VERSION(major, minor)` now expands to
     `static_assert((major) == U8G2GL_SCHEMA_VERSION_MAJOR && ((major) != 0 || (minor) == U8G2GL_SCHEMA_VERSION_MINOR), …)`.
   - The message is built with two-level stringification so it names both
     versions.
   - The Doxygen uses §16's wording from `main`. The file header's export list no
     longer says the minor is "recorded, not enforced".
   - Observed refusals:
     - `(0, 3)`: `error: static assertion failed due to requirement '(0) != 0 || (3) == 4': U8G2GL schema version mismatch: this code was generated for schema 0.3, but this runtime implements schema 0.4. Regenerate …`
     - Major + 1: `… requirement '(0 + 1) == 0': U8G2GL schema version mismatch: this code was generated for schema 0 + 1.4, but this runtime implements schema 0.4. …`
       The expression is spelled as the test file wrote it.

### How each guard case was proven

Each case is a real compile, driven by CTest through `cmake --build … --target`, and
all four share one `RESOURCE_LOCK`.

| CTest | Source | Expectation |
|---|---|---|
| `VersionGuard.MatchingSchemaMajorCompiles` | `match.cpp`: the runtime's own macros (unchanged) | builds |
| `VersionGuard.SchemaZeroFourCompiles` | new `schema_0_4.cpp`: literal `(0, 4)` | builds |
| `VersionGuard.MismatchedSchemaMajorFailsToCompile` | `mismatch.cpp`: major + 1 (unchanged) | fails; regex requires the new message with both version fields |
| `VersionGuard.StaleSchemaMinorFailsToCompile` | new `stale_minor.cpp`: literal `(0, 3)` | fails; regex requires `…generated for schema 0\.3, but this runtime implements schema 0\.4` |

**The new tests are not vacuous.** I checked this in a throwaway worktree at
`131eff0` (`tmp/`, removed afterwards). It had the new tests and the new
`u8g2gl_apply_clip`, but the old label and the old major-only macro.

- `stale_minor.cpp` **compiled** against the old macro, so the new test would have
  failed there.
- `LabelScroll.InsideNarrowerContainerNeverWidensClip` **failed** against the old
  label: 2 clip sets, 1 reset, and x1 = 99 (the label's own inclusive bound).
- `RenderSetsNoClipWindow` also failed there.

### Test counts

| Suite | Before | After |
|---|---|---|
| C++ `ctest` | 277 (1 known skip) | **284** (same skip: `SizeOfReport.ThirtyTwoBitTarget`) |
| CLI `vitest` | 406 | **406** |

- **The seven new tests:**
  - Three `Core.ApplyClip*`
  - `LabelScroll.InsideNarrowerContainerNeverWidensClip`
  - `LabelScroll.RenderAnimationUpdateClipsToOwnBounds`
  - `VersionGuard.SchemaZeroFourCompiles`
  - `VersionGuard.StaleSchemaMinorFailsToCompile`
- **Existing tests changed deliberately**, as listed in the commit message:
  - `Core.RenderObjectClipsChildToAncestorBounds`: 19,9 → 20,10.
  - `Core.RenderObjectClampsNegativeClipOrigin`: 5,5 → 6,6.
  - `LabelScroll.RenderSetsClipWindow` was replaced by `RenderSetsNoClipWindow`,
    because it asserted the F6 defect.
  - `VersionGuard.MismatchedSchemaMajorFailsToCompile`'s regex follows the new
    message.
- **Build and CLI checks:** `cmake --build build` showed zero warnings under
  `-Wall -Wextra -Wpedantic` after reconfiguring. `npx tsc --noEmit` and
  `npm run lint` are clean.

### Decisions I made

- **D1: the clip function lives in `u8g2gl_core`, not `u8g2gl_tree`.** The tree
  module has no U8G2 dependency, and core already owns the render wrapper. It
  returns `bool` so both callers skip drawing when nothing is drawable.
- **D2: font mode and bitmap mode are not saved.** Neither the stub nor
  `U8g2lib.h` has a getter. I did not read `u8g2_t` internals through `getU8g2()`,
  because that is not the U8G2 API `include/` uses. To check the getters, I read
  `U8g2lib.h` from the copy already on this machine (the WORKORDER's cache path).
  Nothing was fetched.
- **D3: `render_animation_update()` keeps a clip of its own bounds.** The WORKORDER
  forbids a widget clip "when rendered through `u8g2gl_render_object`", and this
  path is not. Removing its clip would have let the blocked-loop marquee draw
  across its whole row. It goes through the one function, so the convention stays
  in one place. Its limit is finding G2.
- **D4: the convention comment's wording.** It opens with the Chief Architect's
  "assumption not verified by a pixel test", then gives the source-reading evidence
  and the PR-06 obligation. That is the WORKORDER's instruction, which reconciles
  the ruling with the PA note on F1.
- **D5: a literal `(0, 4)` control beside the macro-based one.** The stale-minor
  refusal needs a control that would fail if the minor rule refused everything at
  major 0. The literal one breaks on a schema bump, deliberately. `match.cpp`
  remains the durable control.

### Spec ↔ WORKORDER disagreement (recorded, not resolved)

- **§11.3 on `main`** still says the framework calls
  `setClipWindow(x, y, x+w-1, y+h-1)`, and that the state saver saves the clip
  window. This WORKORDER directs the exclusive form, and a saver that does not save
  the clip. I followed the WORKORDER's approved ruling and did not edit `docs/`.
  → **Chief Architect**: §11.3's clip form and state-saver bullet.

### Out-of-scope findings (not fixed, not filed)

- **G1: `u8g2gl_state_saver` calls `display.getFont()`, which U8G2 2.36.18 does not
  declare.**
  - Grepping the local `U8g2lib.h` for `getFont` finds only `getFontAscent` and
    `getFontDescent` (lines 403–404).
  - As written, the state saver, and so `u8g2gl_core.cpp`, would not compile
    against real U8G2. Only the stub provides `getFont()`.
  - The stub's other names (e.g. `getAscent`) may differ from U8G2's too; I did not
    check them.
  - → **PA / PR-06.** The real-U8G2 build will hit this first. If the font cannot
    be read back either, the saver's contract shrinks to draw colour.
- **G2: `render_animation_update()` cannot intersect with ancestors.** A marquee
  inside a container, redrawn through the blocked-loop path, is bounded by its own
  bounds, not the container's. The escape is brief: the next full frame redraws
  correctly. But it is the same class of defect as F6. → **PA**: the escape-hatch
  path has no access to the screen's arrays.
- **G3: Stale "state saver" comments outside the Boundary Box.**
  - `u8g2gl_obj.h:396` says the framework has "saved the U8G2 state", so a widget
    may set state freely.
  - Widget comments (`u8g2gl_button.cpp:85`, `u8g2gl_label.cpp:276`) say the saver
    scopes their state.
  - Both are true for colour and font only. Font mode and bitmap mode leak to the
    next object. Every current widget sets its mode explicitly, so nothing
    misrenders today.
  - → **End-of-PR readability review.**
- **G4: The far corner is not clamped, and U8G2's `setClipWindow` takes
  `u8g2_uint_t`.** That is 8-bit unless `U8G2_16BIT`. An exclusive corner of
  `x + w` = 256, or a rect extending past a wide display, would wrap in an 8-bit
  build. This is rare, since 8-bit builds are for ≤ 240-px displays, but the one
  function is where a clamp to the display size would go. → **PA / PR-06**.
- **G5: The stub still records clip calls rather than modelling U8G2's exclusive
  bound.** The checkpoint suggested modelling it. The pinning tests cover the call
  boundary only, which is what the WORKORDER asked for. Pixel truth waits for
  PR-06. → **PA**, noted.
- **G6: A mismatched minor at major ≥ 1 is not exercised.** No runtime at major 1
  exists to test the "only major compared from 1.0" branch. It is covered by the
  macro's logic and Doxygen only. → **PA**, before the first 1.0 schema.
- **G7: This branch's `rules/03-versioning.md` predates `main` @ `ef73776`.** The
  branch copy still says "major version" only. The PROJECT's planned rebase onto
  `ef73776` resolves it. → **PA**, at rebase.
