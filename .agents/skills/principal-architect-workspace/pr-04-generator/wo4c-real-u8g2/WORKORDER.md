---
work_order: WO4c
project: pr-04-generator
title: "The runtime compiles against real U8G2: submodule, real-header target, stub types, notices"
branch: u8g2gl-generator/wo4c-real-u8g2
base: u8g2gl-generator/wo8-realisation-capacities (PA review commit; stack tip after WO7)
complexity: standard
status: dispatched
---

# WO4c — The runtime compiles against real U8G2

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO4c as
approved** and **the owner's U8G2 dependency decision** under "Rulings on WO4c and WO7b";
and that this WORKORDER's `status` is `dispatched`. If any is missing, record it in the
Completion Report and stop.

**Network access is authorised for one thing only:** adding U8G2 as a git submodule from
`https://github.com/olikraus/u8g2.git`, pinned to tag `2.36.18`. The owner authorised it
(quoted in PROJECT.md). Fetch nothing else.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo4c-real-u8g2` (already created)

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be
answered, and your work will strand uncommitted. Do not push.

## Standards

`u8g2gl-standards` skill: `references/cpp.md`, `references/documentation.md`,
`references/typescript.md`. No heap, zero warnings in **our** code, Doxygen on public
declarations, why-comments where a decision is not obvious.

## Design authority

design_spec on `main` @ `5f2574f` (this branch is rebased onto it): §11.3, §13.2
(coordinates are `int16_t`), §21 (Q-11). **"Stop and report" means record it, do not
choose, continue with the remaining items.**

---

## Objective

Nothing in this programme has ever compiled the runtime against real U8G2 — only against
a test stub that offers an API real U8G2 does not have, with coordinate types real U8G2
does not use. Make the real library a pinned dependency, compile the runtime against its
real headers as an acceptance test, and fix what that exposes.

## Background — checked against real U8G2 2.36.18

- **`getFont()` does not exist** in real `U8g2lib.h`; the stub provides it, so
  `u8g2gl_state_saver` compiles only against the stub. Real U8G2 exposes the current font
  as `getU8g2()->font` (`U8g2lib.h:70` returns `u8g2_t*`; `u8g2_t` has
  `const uint8_t *font`).
- **The clip window's far corner is exclusive — settled.** `u8g2.h:352/354` document
  `clip_x1`/`clip_y1` as "(excluded)", and `u8g2_clip_intersection2` agrees. WO4b's
  `u8g2gl_apply_clip` already uses `(x, y, x+w, y+h)` but documents it as a
  pixel-unverified assumption.
- **The stub's coordinate types are wrong.** The stub takes `int`; real U8G2 takes
  `u8g2_uint_t`, which is `uint16_t` on every supported target (`U8G2_16BIT` is forced on
  32-bit environments). On hardware a negative origin **wraps** — `-5` becomes `65531` —
  so an element partly off the left edge jumps off the right edge. Every degenerate-input
  test passes against the `int` stub and therefore cannot catch this.

## Line-Item Instructions

- [x] **Submodule.** `git submodule add https://github.com/olikraus/u8g2.git extern/u8g2`,
      check out tag **`2.36.18`**, and commit the gitlink. `.gitmodules` already exists —
      add to it, do not replace it. Record the pinned commit SHA in the Completion Report.
- [x] **Real-header acceptance target.** A host CMake target that compiles the runtime
      (`src/*.cpp`) against **U8G2's real headers from `extern/u8g2`**, not the stub. It is
      compile-only if linking needs hardware. Real `U8g2lib.h` includes Arduino headers:
      supply the **minimum Arduino platform shim** (e.g. `Arduino.h`, `Print.h`) under
      `test/real_u8g2/`, and nothing that re-declares any U8G2 API — the point is that
      U8G2's own declarations are the ones compiled against. Mark U8G2's include path
      `SYSTEM` so third-party warnings do not count against zero-warnings; **our** code must
      still compile with zero warnings under `-Wall -Wextra -Wpedantic`. Register it so
      `ctest` (or the normal build) fails if it fails.
- [x] **Prove the target catches the defects.** In a throwaway worktree under `tmp/`,
      confirm the target **fails** on this branch's base code (`getFont`) before your fix,
      and say what it reported. Remove the worktree.
- [x] **Font via the real API.** `u8g2gl_state_saver` reads the font through
      `display.getU8g2()->font`. Remove `getFont()` from the stub; give the stub
      `getU8g2()` returning a struct with a `font` member, so the stub can no longer offer
      an API real U8G2 lacks.
- [ ] **Stub coordinates are `u8g2_uint_t`.** Retype every coordinate parameter in
      `test/stubs/U8G2lib.h` to `u8g2_uint_t` (`uint16_t`), matching real U8G2, so the stub
      records the value hardware would receive. Make **every** conversion from our
      `int16_t` coordinates to `u8g2_uint_t` explicit, through as few helpers as possible.
      No conversion may silently wrap: a negative origin is clamped, or the primitive's
      length/extent is shortened to the visible part, or the draw is skipped — choose per
      primitive, document the choice at the helper, and test it.
- [x] **Clip clamped at both corners.** `u8g2gl_apply_clip` clamps the near corner at 0
      (as today) and the far corner to the display, with explicit conversions.
- [x] **F1 comment.** In `u8g2gl_apply_clip`, replace the "not verified by a pixel test"
      note with the source citation: `u8g2.h:352/354` document `clip_x1`/`clip_y1` as
      "(excluded)", and `u8g2_clip_intersection2` agrees (U8G2 2.36.18, now pinned at
      `extern/u8g2`). Note that PR-06's container-edge pixel test now **guards** the
      convention rather than discovering it.
- [x] **Degenerate-input tests that can fail.** Element partly off the left edge (x = −5)
      and partly off the top: against the retyped stub, assert no recorded coordinate is a
      wrapped value (≥ 32768). At least one such test must fail against the base code, and
      the report says which.
- [x] **`THIRD-PARTY-NOTICES.md`** at the repository root with a U8G2 row: the code is
      **BSD-2-Clause**; the fonts are licensed **per font group** (U8G2 wiki page
      "fntgrp"). State both, the pinned version, and that the submodule is used for host
      tests and the catalogue build, while applications get U8G2 through their own
      dependency (PR-05).
- [x] **Catalogue builder uses the submodule and records its source (closes Q-11).**
      `cli/src/node/build-catalogue.ts` defaults `--u8g2-path` to `extern/u8g2`, and the
      build records the U8G2 commit (and tag) it was built from. Record it **without
      changing the `CATALOGUE` export's shape** (e.g. a sibling metadata file or a
      metadata field the loader ignores) — say which and why. Rebuild the catalogue from the
      submodule; if the regenerated data differs from what is committed, explain the
      difference rather than committing it silently.

## PA ruling after the first pass — draw positions wrap explicitly (resolves S1 and H1)

**Status was `partial`; this section re-dispatches WO4c to finish.**

The first pass stopped on S1 (text cannot follow "no conversion may silently wrap") and
reported H1 (the "skip" choice now hides outlines, rounded boxes, bitmaps and circles that
are partly off the left or top edge). The PA read the pinned U8G2 2.36.18 source in
`extern/u8g2/csrc/`, and it settles both:

- `u8g2_clip_intersection2` (`u8g2_hvline.c:87–99`) handles the `a > b` case explicitly,
  and its comment states that replacing that branch with `return 0` "will not handle the
  case with negative a" — U8G2 deliberately accepts a negative origin arriving as a
  wrapped `u8g2_uint_t` and clips it to the visible part.
- `u8g2_is_intersection_decision_tree` (`u8g2_intersection.c`) treats a wrapped span
  (`v0 > v1`) as intersecting.
- `u8g2_DrawFrame`/`u8g2_DrawBox`/rounded variants (`u8g2_box.c`), XBM drawing
  (`u8g2_bitmap.c`) and glyph decoding (`u8g2_font.c`) all go through `u8g2_IsIntersection`
  and then `u8g2_DrawHVLine` → `u8g2_clip_intersection2`. Circle outlines plot per pixel via
  `u8g2_DrawPixel`, where a wrapped negative coordinate fails `x >= user_x1` and is
  correctly not drawn; discs use `u8g2_DrawVLine`/`HVLine` and clip.

So on real U8G2 a shape partly off the left or top edge **draws its visible part** when
its origin arrives wrapped. The WORKORDER's "no conversion may silently wrap: clamp,
shorten or skip" was the PA's wording, not the Chief Architect's ruling (which required
explicit conversions and clip clamping at both corners) — and "skip" is what introduced
H1's visible regression. The ruling below corrects that; the discrepancy with the Chief
Architect's stated premise ("jumps off the right edge") is recorded in PROJECT.md.

- [x] **Draw positions convert through one explicit, documented wrap.** Replace the
      per-primitive clamp/shorten/skip choices for **draw origins and end points** with a
      single explicit conversion (generalise `u8g2gl_coord_text()` or rename it) that
      performs the two's-complement wrap on purpose. Its comment cites the source evidence
      above by file and function. "Explicit" is the requirement; wrapping is correct
      because U8G2 is designed for it.
- [x] **Sizes are not origins.** A width, height, radius or length `<= 0` is still skipped
      (nothing to draw), and a size that does not fit `u8g2_uint_t` is still refused — state
      the rule at the helper.
- [x] **The clip window keeps its clamping** at both corners (`u8g2gl_apply_clip`) —
      `setClipWindow` with a wrapped near corner would not clip correctly, and this was the
      Chief Architect's explicit instruction. Unchanged.
- [x] **Tests follow the rule.** The degenerate-input tests now assert the **explicitly
      wrapped** value reaches the stub for draw origins (e.g. a box at x = −5 records 65531)
      and that the draw is **not skipped**; clip tests still assert clamping. Remove or
      invert the assertions that required skipping. H1's affected widgets (switch, button
      border, progress-bar track, XBM) get a partly-off-edge test each.
- [x] **H3 — stub measurement getters.** `getUTF8Width`, `getAscent`/`getDescent` and
      similar return `u8g2_uint_t` or `int8_t` as real `U8g2lib.h` does, with explicit
      conversions at each call site.
- [x] **H6 — fresh clones.** If `extern/u8g2` is not initialised, CMake configure fails with
      a clear message naming `git submodule update --init extern/u8g2`, rather than an
      opaque missing-header error.
- [x] **H8 — no machine-local catalogue source.** Remove the optional test path that reads
      departures-board's U8G2 copy when present; the catalogue tests use `extern/u8g2` only,
      so the suite behaves the same on every machine.

## PA ruling after the second pass — lines clip before they convert (resolves N1)

**Status was `complete`; this section re-dispatches WO4c for one narrow item.**

The second pass reported N1, and the PA confirmed it in the pinned source.
`u8g2_DrawLine` (`extern/u8g2/csrc/u8g2_line.c`) states at line 49 "no intersection check
at the moment, should be added...", computes `dx`/`dy` from **unsigned** coordinates
(lines 51–52), and loops pixel by pixel from `x1` to `x2` (line 78). A line from (−2, 0)
to (10, 10) arrives with `x1 = 65534`, so `dx` becomes 65524: about 65,000 iterations and a
visible part drawn almost flat. The explicit-wrap ruling is right for every primitive that
reaches `u8g2_DrawHVLine` → `u8g2_clip_intersection2`; `u8g2_DrawLine` does not, so lines
need their own rule. Outline triangles, composed from `drawLine`, inherit it. Filled
triangles take signed `int16_t` vertices and are unaffected.

- [ ] **Clip the segment to the display in signed arithmetic before converting.** In
      `u8g2gl_draw_line` (and the outline-triangle path that composes lines), clip the
      segment against `[0, width-1] × [0, height-1]` using the display's own dimensions,
      computing in `int32_t` so nothing overflows. A segment wholly outside is not drawn;
      a clipped segment's endpoints are then non-negative and inside the display, and
      convert through the existing size-safe conversion — never `u8g2gl_coord_pos`'s wrap.
      Clipping to the display is enough: `u8g2_DrawPixel`'s own `user_x0/x1` checks still
      apply the clip window to each plotted pixel.
- [ ] **One implementation, documented.** The clipping lives in one function, with a
      comment citing `u8g2_line.c:49–52` and `:78` as the reason lines cannot take a wrapped
      endpoint, and stating that the slope is preserved (clipping must not re-quantise the
      line differently from U8G2 drawing the full segment where both are on-screen).
- [ ] **Tests.** A line from (−2, 0) to (10, 10) reaches the stub with both endpoints inside
      the display and no value ≥ 32768; a line wholly off-screen is not drawn; a line fully
      on-screen is passed through unchanged; an outline triangle with one vertex off the
      left edge draws three in-display lines. The first test must fail against `62dd06b`.
- [ ] **Confirm the stub's display-dimension getters** use real U8G2's types; if they do
      not, correct them with explicit conversions at the call site.

## Strict Boundary Box

**In scope:** `.gitmodules`; `extern/u8g2` (gitlink only); `CMakeLists.txt` and
`test/CMakeLists.txt`; `test/real_u8g2/` (new, Arduino platform shim only);
`test/stubs/U8G2lib.h`; `include/u8g2gl/*.h` and `src/*.cpp` **only** for coordinate
conversions, `u8g2gl_apply_clip` and the state saver's font read; `test/` tests;
`THIRD-PARTY-NOTICES.md` (new); `cli/src/node/build-catalogue.ts`,
`cli/src/node/catalogue-builder.ts`, `cli/src/data/` catalogue files and their tests;
this WORKORDER.

**Do NOT touch:** `docs/`; `PROGRAM*.md` (the PA does the record-keeping); manifests; the
validator, resolver or generator; widget behaviour beyond coordinate conversion. Do not
move `font`/`align`/text binding off `u8g2gl_obj` (Q-10). No version bump — runtime 0.4.0
is unreleased in this PR.

---

## Testing Requirement

- [x] The real-header target builds on the finished branch and demonstrably failed on the
      base.
- [x] No `getFont` anywhere in `include/`, `src/` or the stub.
- [ ] Negative-origin tests assert no wrapped coordinate reaches the stub; at least one
      fails at the base. *(True for every primitive except text origins, which reach the
      stub wrapped, explicitly — stop-and-report S1. 13 tests fail at the base.)*
- [x] Clip clamped at both corners, pinned by a test.
- [x] Catalogue build from `extern/u8g2` records its source commit.

## Verification Requirement

- [x] `git submodule status` shows `extern/u8g2` at the 2.36.18 commit
- [x] `cmake -S . -B build && cmake --build build` — zero warnings in our code
- [x] `ctest --test-dir build` — all pass (baseline 284, one known skip), including the
      real-header target
- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (baseline 596)
- [x] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file. Expect the
real-header target to expose more than `getFont`; anything outside the box is a finding.

---

## Completion Report

**Status: `partial`.** Every line item is delivered except one clause, which is recorded
rather than chosen (S1). The "no conversion may silently wrap" rule cannot be met for
**text origins** without changing marquee behaviour. Text origins are converted
explicitly, in one function, and pinned by a test, but they still wrap.

- Implementation commit: `7924d24`. This report is committed separately.
- The session was interrupted once by an API usage limit and resumed from the untouched
  working tree. Nothing was reset, stashed or discarded.

### Authorization verified (from committed artifacts)

- Front matter: `project: pr-04-generator`, `status: dispatched` at dispatch.
- `../PROJECT.md` "Human Approval" records the owner's words, *"Approved — proceed with
  the twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- `../PROJECT.md` "Rulings on WO4c and WO7b" records **"WO4c — APPROVED, extended"**.
- "U8G2 dependency — decided" quotes the owner's submodule authorisation, pinned at 2.36.18.
- The status log records WO4c as dispatched on this branch.

### Per line item

1. **Submodule.**
   - `extern/u8g2` was added from `https://github.com/olikraus/u8g2.git` and checked out
     at tag `2.36.18`.
   - **Pinned commit `d66b49af3e48cd0becf95f862353bf94a9c0c2be`.**
   - `.gitmodules` was appended to; the three `.agents/skills` entries are untouched.
   - That clone was the only network operation. googletest was reused from the existing
     `build/_deps` checkout via `FETCHCONTENT_SOURCE_DIR_GOOGLETEST` for the extra builds.
2. **Real-header acceptance target.**
   - **Build.** In `test/CMakeLists.txt`, `add_library(u8g2gl_real_u8g2 OBJECT
     ${U8G2GL_RUNTIME_SOURCES})`. It compiles the same source list as the library:
     root `CMakeLists.txt` now defines `U8G2GL_RUNTIME_SOURCES` once and both targets
     use it, so a new source cannot escape the check.
   - **Include paths.** `include/` and `test/real_u8g2/` are ordinary; `extern/u8g2/cppsrc`
     and `extern/u8g2/csrc` are `SYSTEM`. The stub directory is **not** on this
     target's path.
   - **Flags.** `-Wall -Wextra -Wpedantic`. `ARDUINO=10819` is defined because every
     firmware build defines it, and it changes the class: `U8G2` then derives from `Print`.
   - **Compile-only.** It is an OBJECT library, never linked; linking would need U8G2's C
     sources and a HAL.
   - **Registration, twice.** It is in the normal build, so a break fails
     `cmake --build`. It is also CTest `RealU8g2.RuntimeCompilesAgainstRealHeaders`
     (`cmake --build … --target u8g2gl_real_u8g2`), sharing the version guards'
     `RESOURCE_LOCK`.
   - **Missing submodule.** Configure stops with a `FATAL_ERROR` naming
     `git submodule update --init extern/u8g2`.
   - **Arduino shim (`test/real_u8g2/`).**
     - `Arduino.h` includes `<stddef.h>` and `<stdint.h>`, nothing else.
     - `Print.h` declares `class Print` with the pure `write(uint8_t)` and the buffer
       `write(const uint8_t*, size_t)` that U8G2's classes override.
     - It declares no U8G2 or U8X8 API, and nothing else was needed.
3. **Proven on the base code**, using a throwaway worktree `tmp/wo4c-base-proof` at
   `1316cd1`, since removed (`git worktree list` shows only the main tree).
   - **Setup.** The base `src/` and `include/` were kept. The new `CMakeLists.txt` and
     `test/` tree were copied in, plus `u8g2gl_coord.h`, which one test assertion includes
     and no base source does. `extern/u8g2` was symlinked.
   - **Stage A — base runtime.** The real-header target reported exactly one error:
     ```
     include/u8g2gl/u8g2gl_state_saver.h:69:31: error: no member named 'getFont' in 'U8G2'
     ```
     and `RealU8g2.RuntimeCompilesAgainstRealHeaders` **Failed**. No other U8G2 API or type
     mismatch stopped the compile. Implicit `int`→`u8g2_uint_t` conversions compile
     silently, which is exactly why the stub retype and tests are needed.
   - **Stage B — base runtime plus only the `getU8g2()->font` fix.** Everything built, and
     **13 of the new tests failed** (listed under item 8).
4. **Font via the real API.**
   - The state saver's initialiser is `saved_font_(display.getU8g2()->font)`, with a
     why-comment.
   - The stub has no `getFont()`. It declares `struct u8g2_t { const uint8_t* font; }`
     (private member `u8g2`); `getU8g2()` returns it and `setFont()` writes it.
   - `StateSaver.SavesAndRestores` reads `getU8g2()->font`.
   - `grep getFont include src test/stubs` finds no call or declaration. Its only matches
     are four why-comments explaining the removal (`u8g2gl_state_saver.h:69,71`,
     `test/stubs/U8G2lib.h:16,59`).
5. **Stub coordinates are `u8g2_uint_t`.** `typedef uint16_t u8g2_uint_t;` in the stub.
   - **Retyped to match `U8g2lib.h` 2.36.18:** every coordinate, extent and radius
     parameter of drawBox/Frame/RBox/RFrame, drawH/VLine, drawLine, drawPixel,
     drawCircle/Disc, drawEllipse/FilledEllipse, drawXBMP, drawGlyph, drawStr, drawUTF8,
     drawButtonUTF8, and setClipWindow.
   - **Also corrected to real U8G2:**
     - `drawTriangle` takes **`int16_t`**, as U8G2 declares it.
     - `updateDisplayArea` takes **`uint8_t`** tiles.
     - `drawUTF8`, `drawStr` and `drawGlyph` return `u8g2_uint_t`.
     - `drawButtonUTF8` has U8G2's 7 parameters (the stub had 6).
     - `getDisplayWidth/Height` return `u8g2_uint_t`.
   - Recording fields stay `int`, so tests compare directly and a wrapped value shows as
     ≥ 32768.
   - **New header `include/u8g2gl/u8g2gl_coord.h`.** It holds only the conversion helpers
     this item asks for, which is why it is inside the Boundary Box. Nothing in it
     allocates.

   | Helper | Rule | Behaviour |
   |---|---|---|
   | `U8G2GL_U8G2_COORD_MAX` | — | `numeric_limits<u8g2_uint_t>::max()`, so an 8-bit build clamps at 255 |
   | `u8g2gl_coord_exact(v, out)` | **skip** | false if `v < 0` or `> MAX`; caller draws nothing |
   | `u8g2gl_coord_span(origin, len, o, l)` | **shorten** | cuts the part before 0 (and past MAX); false if nothing is left |
   | `u8g2gl_coord_clamp(v)` | **clamp** | into `[0, MAX]`; used for clip corners and extents/radii already checked positive |
   | `u8g2gl_coord_text(v)` | **explicit modular (wraps)** | stop-and-report S1 |

   The per-primitive choice is tabulated in `u8g2gl_draw.h`'s file header. Widgets route
   through the `u8g2gl_draw_*` functions, or apply the same rule locally where the U8G2
   call differs.

   | Primitive / call site | Rule for a negative origin |
   |---|---|
   | filled square box (`drawBox`) — `u8g2gl_draw_box`, button focus fill, progress-bar fill, label dots/animation clears, clock clear | **shorten** both axes |
   | `drawHLine` | **shorten** x; skip if y < 0 |
   | `drawVLine` | **shorten** y; skip if x < 0 |
   | `drawFrame` (box outline, progress-bar track) | **skip** |
   | `drawRBox` / `drawRFrame` (rounded box, button borders, switch track and handle) | **skip** |
   | `drawCircle` / `drawDisc` / `drawEllipse` / `drawFilledEllipse` (centre) | **skip** |
   | `drawLine` (either endpoint), outline triangle (per edge) | **skip** |
   | `drawPixel` (incl. progress-bar stipple) | **skip** |
   | `drawXBMP` (`u8g2gl_xbm`) | **skip**: shortening would shift the image, not crop it |
   | filled `drawTriangle` | none — U8G2 takes `int16_t` |
   | `drawUTF8` / `drawGlyph` (label, button, clock, progress-bar text, glyph) | `u8g2gl_coord_text` — **S1** |
   | `setClipWindow` | clamp both corners to the display (item 6) |
   | `updateDisplayArea` (`u8g2gl_partial_refresh`) | **shorten** region, then clamp tiles at 255 |

   **Why these rules.** Shorten only where it is pixel-exact: a filled run lights the same
   on-screen pixels. Everything whose appearance depends on its exact origin is skipped, so
   no pixel is lit that the signed geometry would not light.

   Button and switch convert locally rather than through `u8g2gl_draw_box`, because they
   call `drawRFrame`/`drawRBox` even at radius 0, and the draw function would switch those
   to `drawFrame`/`drawBox`. That would be a widget behaviour change.
6. **Clip clamped at both corners.** `u8g2gl_apply_clip` works in `int32_t`:
   - Near corner clamped at 0.
   - Far corner clamped to `getDisplayWidth()` / `getDisplayHeight()`.
   - Rejects the rect when `x1 <= x0 || y1 <= y0`, so a rect wholly right of or below the
     display is now rejected too.
   - Passes each corner through `u8g2gl_coord_clamp`.
   - Pinned by `Core.ApplyClipClampsFarCornerToDisplay` (`{100,50,60,30}` → `(100,50,128,64)`;
     `{-10,-10,200,100}` → `(0,0,128,64)`) and
     `Core.ApplyClipRejectsRectsRightOfOrBelowDisplay`.
7. **F1 comment.** The declaration's Doxygen in `u8g2gl_core.h` now reads exactly:
   ```
   CLIP-CORNER CONVENTION — THE FAR CORNER IS EXCLUSIVE, SETTLED FROM SOURCE.
   A rect {x, y, w, h} becomes setClipWindow(x, y, x + w, y + h), so the rect's
   last column (x + w - 1) and last row (y + h - 1) remain drawable. design_spec
   §11.3's x+w-1, y+h-1 form would lose the last column and row.

   Source: U8G2 2.36.18, now pinned at extern/u8g2. u8g2.h:352/354 document
   clip_x1 and clip_y1 as "(excluded)", and u8g2_clip_intersection2()
   (u8g2_hvline.c), which clips every line U8G2 draws against the window,
   agrees: it clips "against c (included) to d (excluded)".

   PR-06's container-edge pixel test — an object whose clip is exactly its
   bounds, drawing its last column and row — now guards this convention rather
   than discovering it. If it ever fails, change this function and nothing
   else; Core.ApplyClipPinsExclusiveCornerConvention pins it on the host.

   Both corners are clamped to the display before they are converted to U8G2's
   unsigned coordinate type: the near corner at 0, because a negative origin
   would otherwise wrap to a huge value rather than clip, and the far corner at
   the display's width and height. A rect with no pixel on the display is
   rejected.
   ```
   I re-read both citations in `extern/u8g2/csrc` (`u8g2.h:352/354`, `u8g2_hvline.c:61–116`).
8. **Degenerate-input tests.** 15 new gtest cases:
   - **`test_core.cpp`**
     - `Core.RenderObjectPartlyOffLeftAndTopRecordsNoWrappedCoordinate` — a progress bar
       at (−5, −3) through `u8g2gl_render_object`. Clip is (0,0,37,9), the frame is
       skipped, and the fill is shortened to (0,0,16,8). Every recorded value is < 32768.
     - `Core.ApplyClipClampsFarCornerToDisplay`
     - `Core.ApplyClipRejectsRectsRightOfOrBelowDisplay`
   - **`test_draw.cpp`, `DrawNegativeOrigin.*`**
     - `FilledBoxShortensToVisiblePart`
     - `FilledBoxWhollyLeftOrAboveIsSkipped`
     - `OutlineAndRoundedBoxesAreSkipped`
     - `HLineShortensXAndSkipsNegativeY`
     - `VLineShortensYAndSkipsNegativeX`
     - `PointShapesAreSkipped`
     - `FilledTrianglePassesSignedVerticesThrough`
     - `OutlineTriangleSkipsOnlyEdgesWithNegativeEndpoints`
   - **`test_obj.cpp`:** `PartialRefresh.NegativeOriginRefreshesOnlyVisiblePart`,
     `PartialRefresh.WhollyOffDisplayRefreshesNothing`
   - **`test_xbm.cpp`:** `Xbm.NegativeOriginIsSkippedNotWrapped`
   - **`test_label.cpp`:** `LabelScroll.TextLeftOfOriginReachesU8g2Wrapped`, which pins S1.

   **Failed against the base (Stage B), 13 tests:**
   - The three `Core.*` above. Base values:
     - fill box x = **65531**, y = **65533** (the wrap);
     - far clip corner 160/80 and 190/90, not clamped;
     - a rect right of the display accepted.
   - All `DrawNegativeOrigin.*` except `FilledTrianglePassesSignedVerticesThrough`, whose
     behaviour is unchanged by design.
   - Both `PartialRefresh.*` tests (base tile x/y = **255**).
   - `Xbm.NegativeOriginIsSkippedNotWrapped` (drawn at a wrapped origin).

   `LabelScroll.TextLeftOfOriginReachesU8g2Wrapped` passes at the base too, because S1
   leaves text behaviour unchanged.
9. **`THIRD-PARTY-NOTICES.md`.** One U8G2 row:

   | Field | Content |
   |---|---|
   | Version | 2.36.18, pinned as submodule `extern/u8g2` |
   | Licence | **Code:** BSD-2-Clause ("new-bsd"). **Fonts:** licensed **per font group**, linked to the U8G2 wiki page **fntgrp**. |
   | Use | The submodule is used only for **host tests** and the **catalogue build**. Nothing is copied into U8G2GL sources or packages. **Applications get U8G2 through their own dependency** (PR-05), under U8G2's own terms. |

   It points to `extern/u8g2/LICENSE` as authoritative; that file's wording matches both
   statements.
10. **Catalogue builder records its source (Q-11).**
    - **Default path.** `build-catalogue.ts` defaults to `<repo>/extern/u8g2`, resolved from
      the script's location. `--u8g2-path` and `U8G2_PATH` still override it.
    - **Two layouts.** `catalogue-builder.ts` gains `resolveU8g2Layout()` because the git
      repository layout (`csrc`, `cppsrc/U8g2lib.h`) differs from the Arduino release
      (`src/clib`, `src/U8g2lib.h`). Without it the builder could not read the submodule.
    - **Reading the commit.** `readU8g2Source()` returns `{ tag, commit }` via
      `git rev-parse HEAD` and `git describe --tags --exact-match`. It returns nulls unless
      the path is **itself** the top of a checkout; otherwise `git -C` would report the
      enclosing project's commit.
    - **Where it is recorded — a sibling file**, `cli/src/data/catalogue-source.json`:
      `{"u8g2": {"tag": "2.36.18", "commit": "d66b49af3e48cd0becf95f862353bf94a9c0c2be"}}`.
      - **Why a sibling file:** `catalogue.json` *is* the `CATALOGUE` array (`catalogue.ts`
        casts the parsed JSON directly), so any field inside it would change the export's
        shape.
      - It holds no path and no timestamp, so the same commit rebuilds byte-identically.
      - The script warns when no commit can be recorded.
    - **Rebuilt from the submodule:** `catalogue.json` and `page-mode-map.json` are
      **byte-identical** to what was committed (1637 records, 3274 page-mode mappings), so
      no data file changed.
    - **One difference, in the struct count only:** 205 `u8x8_display_info_t` structs from
      the git tag against 206 from the Arduino release. The 2.36.18 release still ships
      `u8x8_d_st7301.c` beside its rename `u8x8_d_st7302.c` (U8G2 commit `9e58bc30`), and
      the duplicate maps to no additional record.
    - **Tests** (`cli/test/catalogue/builder.test.ts`):
      - It now runs against `extern/u8g2` by default.
      - The two struct-count assertions compute the expected count per layout (the previous
        test hard-coded 206 against the release copy).
      - Six new tests: both layouts resolve; a non-U8G2 directory is rejected; the submodule
        reads as tag 2.36.18 with a 40-hex commit; a nested non-checkout records nulls; the
        committed `catalogue-source.json` equals the submodule's actual commit.

### Test counts

| Suite | Before | After |
|---|---|---|
| C++ `ctest` | 284 (1 known skip) | **300** (same skip `SizeOfReport.ThirtyTwoBitTarget`): 15 gtest + `RealU8g2.RuntimeCompilesAgainstRealHeaders` |
| CLI `vitest` | 596 | **602** |

- **Build checks.** Zero warnings in the in-tree build and in a from-scratch configure and
  build (`tmp/wo4c-clean-build`), which also passed 300/300. `npx tsc --noEmit` and
  `npm run lint` are clean.
- **Stricter audit.** Every `src/*.cpp` compiled against the real headers with
  `-Wconversion -Wsign-conversion` added: no diagnostics.

**Existing tests changed deliberately** (also listed in the commit message):
- `LabelScroll.InitialDelayBeforeScroll`, `LabelScroll.ResetScroll` and
  `LabelScrollCircular.StillMarquees` expected `last_draw_utf8_x == -1`. The stub now
  records the `u8g2_uint_t` value hardware receives, so each expects
  `u8g2gl_coord_text(-1)` = 65535. The behaviour is unchanged.
- `StateSaver.SavesAndRestores` reads `getU8g2()->font`.
- The catalogue struct-count assertions, as described in item 10.

### Stop-and-report (recorded, not chosen)

- **S1 — Text origins cannot satisfy "no conversion may silently wrap" without changing
  widget behaviour.** `drawUTF8` and `drawGlyph` take `u8g2_uint_t`.
  - **Marquee.** It draws at `x_ − scroll_x_`, which is negative on every step once
    scrolling starts. Clamping freezes the text at x = 0, and skipping blanks it.
  - **Aligned text.** Centred or right-aligned text wider than its label (and a clock wider
    than its bounds) starts left of the element. Clamping shifts it and skipping hides it.
  - **No shorten option.** Text has no "visible part" to shorten to without copying the
    string, which is forbidden ([D-1]).
  - **Why the wrap works on hardware.** U8G2 2.36.18 is written to accept a wrapped text
    origin. The glyph renderer tests intersection with the wrap-aware
    `u8g2_IsIntersection()`, and runs go through `u8g2_clip_intersection2()`, whose comment
    says a simpler form "will not handle the case with negative a". So the wrap is what
    makes today's marquee work.

  **What I did:** kept behaviour, and made the conversion **explicit and confined to one
  function**, `u8g2gl_coord_text()`. Its Doxygen carries this analysis, every text call
  site routes through it, and `LabelScroll.TextLeftOfOriginReachesU8g2Wrapped` pins it.

  **Ruling needed (PA/CA):** accept the explicit wrap for text as the documented
  exception, or choose a rule. A ruling changes that one function body and that test.

- **Spec disagreement, carried from WO4b and unchanged:** design_spec §11.3 still says
  `x+w-1, y+h-1` and that the state saver saves the clip. `docs/` was not touched.
  → **Chief Architect**.

### Decisions I made

- **D1 — New header `u8g2gl_coord.h`.** It holds only the conversion helpers ("as few
  helpers as possible"), is shared by `src/` and `u8g2gl_helpers.h`, and is inside the box
  as coordinate conversion.
- **D2 — `ARDUINO` defined in the real-header target.** That is the firmware view of the
  class, and the reason the Print shim exists.
- **D3 — OBJECT library in the normal build, plus a CTest entry.** Both failure routes
  named by the WORKORDER are covered. A missing submodule is a configure-time
  `FATAL_ERROR` when tests are enabled, rather than a silently skipped check.
- **D4 — Per-primitive rules as tabulated in item 5.** Shorten only where pixel-exact, skip
  otherwise.
- **D5 — Local conversion in button and switch** instead of `u8g2gl_draw_box`, to keep
  their `drawRFrame`/`drawRBox` calls at radius 0.
- **D6 — `u8g2gl_partial_refresh` also converts explicitly** (shorten, then clamp tiles to
  `uint8_t`). Its tile arguments were `int` → `uint8_t` conversions, which wrap. Its
  "Exported Functions" header also listed `u8g2gl_min/max`, which live elsewhere; I
  corrected that while in the file.
- **D7 — Sibling `catalogue-source.json`** (item 10), plus support for both U8G2 layouts in
  the builder, which the submodule default required.

### Out-of-scope findings (not fixed, not filed)

- **H1 — The SKIP rule changes on-screen behaviour for shapes partly off the left or top
  edge.** Before WO4c such shapes reached U8G2 wrapped. U8G2's HV-line clipper
  (`u8g2_clip_intersection2`, "handle the a>b case correctly") and `u8g2_IsIntersection`
  are wrap-aware, so on hardware a frame, rounded box, bitmap or circle partly off the
  left/top edge **probably drew its visible part**. It is now skipped entirely, which the
  WORKORDER mandates.
  - Affected widgets: switch, button border, progress-bar track, `u8g2gl_xbm`.
  - `drawLine` is the exception. `u8g2_line.c` says "no intersection check at the moment",
    so skipping there is clearly safer.
  - → **PA / PR-06**: the real-U8G2 pixel test should decide whether wrap-aware
    pass-through is correct for these calls. If so, `u8g2gl_coord_exact` call sites become
    `u8g2gl_coord_text`-style.
- **H2 — The real headers exposed only `getFont`.** Stage A stopped on that single error.
  The other stub/real differences (listed in item 5) compiled anyway, because they were
  implicit conversions, and are now corrected in the stub. The real-header target cannot
  catch *implicit* narrowing by construction; the retyped stub and tests are what do.
- **H3 — Stub metric return types still differ from real U8G2.**
  - `getUTF8Width`/`getStrWidth` return `int` (real: `u8g2_uint_t`).
  - `getAscent`/`getDescent`/`getMaxChar*` return `int` (real: `int8_t`).
  - These are values, not coordinates passed to U8G2, and the widenings are harmless.
    Aligning them would change what tests can configure.
  - → **PA**: decide whether the stub mirrors return types too.
- **H4 — `u8g2.h` 2.36.18 defines `U8G2_16BIT` unconditionally (line 71)**, not only on
  32-bit targets. The 8-bit `u8g2_uint_t` case (WO4b G4) is unreachable with the pinned
  version unless a user edits the header. The clamps still cover it.
- **H5 — Only the Arduino view is compiled against the real headers.** ESP-IDF
  (non-Arduino) and the Wasm editor build (`ARDUINO` undefined, so no `Print` base) are
  unchecked. → **PA / WO11 / PR-05**.
- **H6 — Fresh clones now need `git submodule update --init extern/u8g2`** before a test
  configure. CI and contributor docs should say so. → **PA / PR-05**.
- **H7 — `u8g2gl_coord.h` has no `class U8G2;` fallback** like other headers, because it
  needs `u8g2_uint_t`. Only runtime sources include it, but any public header that includes
  it now requires U8G2 on the include path (`u8g2gl_helpers.h` already did in practice).
- **H8 — The previous default catalogue path** pointed at `~/Documents/Projects/departures-board/...`,
  and the test's release-layout case still uses that path when present (existing pattern).
  It is optional and skipped when absent.
- **H9 — Stale state-saver comments outside the box** (WO4b G3: `u8g2gl_obj.h:396`,
  `u8g2gl_button.cpp`/`u8g2gl_label.cpp` step comments) are still present.
  → **End-of-PR readability review**.

### Changed files (`git diff --name-only 1316cd1..7924d24`)

```
.gitmodules
CMakeLists.txt
THIRD-PARTY-NOTICES.md
cli/src/data/catalogue-source.json
cli/src/node/build-catalogue.ts
cli/src/node/catalogue-builder.ts
cli/test/catalogue/builder.test.ts
extern/u8g2
include/u8g2gl/u8g2gl_coord.h
include/u8g2gl/u8g2gl_core.h
include/u8g2gl/u8g2gl_draw.h
include/u8g2gl/u8g2gl_helpers.h
include/u8g2gl/u8g2gl_state_saver.h
src/u8g2gl_button.cpp
src/u8g2gl_clock.cpp
src/u8g2gl_core.cpp
src/u8g2gl_draw.cpp
src/u8g2gl_glyph.cpp
src/u8g2gl_label.cpp
src/u8g2gl_progress_bar.cpp
src/u8g2gl_switch.cpp
src/u8g2gl_xbm.cpp
test/CMakeLists.txt
test/real_u8g2/Arduino.h
test/real_u8g2/Print.h
test/stubs/U8G2lib.h
test/test_core.cpp
test/test_draw.cpp
test/test_label.cpp
test/test_obj.cpp
test/test_xbm.cpp
```

All are inside the Boundary Box. `docs/`, `PROGRAM*.md`, manifests, validator, resolver and
generator are untouched, and there is no version bump.

### Second pass — PA ruling after the first pass (resolves S1 and H1)

**Status: `complete`.** Implementation commit `62dd06b`, on top of PA commit `8a19acf`. I
re-read the ruling from the committed WORKORDER before starting. S1 is resolved by the
ruling, so the first pass's "partial" reason no longer applies.

The first pass's Testing Requirement box, "negative-origin tests assert no wrapped
coordinate reaches the stub", is **superseded** by this ruling and left unticked on
purpose: the tests now assert the opposite, that the wrapped value arrives and the draw
happens.

#### Per ruling item

1. **One explicit, documented wrap for draw positions.**
   - `u8g2gl_coord_text()` is generalised and renamed **`u8g2gl_coord_pos(int32_t)`** in
     `include/u8g2gl/u8g2gl_coord.h`. `u8g2gl_coord_exact()` (the skip rule) is removed,
     so no call site can still skip.
   - Every draw origin, end point and centre goes through it: all eight `u8g2gl_draw_*`
     functions (triangle outline edges via `u8g2gl_draw_line`), switch track and handle,
     button borders, the bitmap widget, and every text and glyph origin in label, button,
     clock, progress bar and glyph.
   - The filled box is no longer shortened.
   - The helper's rule comment, exactly:
     ```
     RULE: every draw position reaches U8G2 through this one conversion, and it
     wraps ON PURPOSE: -5 becomes 65531. A shape partly off the left or top edge is
     therefore drawn, and U8G2 draws only its visible part. Nothing is clamped,
     shortened or skipped here.

     Why wrapping is correct — U8G2 2.36.18 (extern/u8g2/csrc) is designed for it:
     - u8g2_hvline.c, u8g2_clip_intersection2(): handles the a > b case explicitly,
       and its comment warns that replacing that branch with "return 0" "will not
       handle the case with negative a" — a negative start arriving wrapped is a
       case it exists to clip.
     - u8g2_intersection.c, u8g2_is_intersection_decision_tree(): treats a wrapped
       span (v0 > v1) as intersecting, so u8g2_IsIntersection() does not reject it.
     - u8g2_box.c (u8g2_DrawBox, u8g2_DrawFrame, u8g2_DrawRBox, u8g2_DrawRFrame),
       u8g2_bitmap.c (u8g2_DrawXBMP) and u8g2_font.c (glyph decoding) test
       u8g2_IsIntersection() and then draw through u8g2_DrawHVLine(), which clips
       with u8g2_clip_intersection2(). Their internal arithmetic (x + w, x + r) is
       in u8g2_uint_t, so it wraps back consistently.
     - u8g2_circle.c plots outlines per pixel through u8g2_DrawPixel(), where a
       wrapped negative coordinate fails x >= user_x1 and is simply not drawn;
       discs and filled ellipses draw through u8g2_DrawVLine()/u8g2_DrawHVLine().

     The marquee depends on this: a scrolling label draws at x_ - scroll_x_, which
     is negative on every step once it starts.

     The clip window is the exception, and does NOT use this: setClipWindow() with
     a wrapped near corner would not clip, so u8g2gl_apply_clip() clamps both
     corners with u8g2gl_coord_clamp().
     ```
   - `u8g2gl_draw.h`'s rules table now has three rows: position → `u8g2gl_coord_pos()`;
     size → `u8g2gl_coord_size()`; filled triangle → none, because U8G2 takes `int16_t`.
2. **Sizes are not origins.**
   - New **`u8g2gl_coord_size(int32_t, u8g2_uint_t&)`**, with this rule at the helper:
     *"a size is not a position and never wraps. A size <= 0 has nothing to draw, and a
     size larger than U8G2GL_U8G2_COORD_MAX cannot be represented; both are refused, and
     the caller must draw nothing."*
   - It covers box width/height, h/v line length, circle radius, ellipse rx/ry,
     button-border and switch sizes, and bitmap size.
   - Corner radii of rounded boxes are the one exception. In the button and switch, which
     call `drawRFrame`/`drawRBox` at any radius, they go through `u8g2gl_coord_clamp()`,
     documented as *"the corner radius of a rounded box, where 0 is a valid value meaning
     square corners rather than an empty shape"*. In `u8g2gl_draw_box` a radius that fails
     `u8g2gl_coord_size` selects the square variant, as before.
3. **Clip window keeps its clamping.** `u8g2gl_apply_clip` is unchanged: both corners are
   clamped, and `Core.ApplyClip*` still assert clamping.
   - `u8g2gl_coord_span()` (shorten) is kept **only** for `u8g2gl_partial_refresh()`,
     because `updateDisplayArea()` tiles are not clipped by U8G2.
   - Both `PartialRefresh.*` tests are unchanged.
4. **Tests follow the rule.**
   - **Inverted from "skipped" to "drawn with the wrapped value":**
     - `DrawNegativeOrigin.FilledBoxOriginWrapsAndIsDrawn` — was `FilledBoxShortensToVisiblePart`. Now box (−5, −3) records (65531, 65533, 20, 10).
     - `DrawNegativeOrigin.OutlineAndRoundedBoxesWrapAndAreDrawn` — was `OutlineAndRoundedBoxesAreSkipped`.
     - `DrawNegativeOrigin.HVLineOriginsWrapAndLengthsDoNot` — merges the former `HLineShortensXAndSkipsNegativeY` and `VLineShortensYAndSkipsNegativeX`.
     - `DrawNegativeOrigin.PointPositionsWrapAndAreDrawn` — was `PointShapesAreSkipped`. Covers pixel, line, circle, disc and ellipse.
     - `DrawNegativeOrigin.OutlineTriangleDrawsEveryEdgeWithWrappedEndpoints` — was `OutlineTriangleSkipsOnlyEdgesWithNegativeEndpoints`.
     - `Xbm.PartlyOffEdgeDrawsWithWrappedOrigin` — was `NegativeOriginIsSkippedNotWrapped`. Also pins that a size of 0 draws nothing.
     - `Core.RenderObjectPartlyOffLeftAndTopWrapsOriginsAndClampsClip` — was `…RecordsNoWrappedCoordinate`. Clip is clamped to (0, 0, 37, 9); the track frame is drawn at (65531, 65533, 42, 12) and the fill at (65532, 65534, 20, 10).
   - **Removed:** `DrawNegativeOrigin.FilledBoxWhollyLeftOrAboveIsSkipped`, which only
     asserted a skip.
   - **Added, one per H1-affected widget:**
     - `Switch.PartlyOffEdgeDrawsWithWrappedOrigin`
     - `Button.BorderPartlyOffEdgeDrawsWithWrappedOrigin` (single and nested borders)
     - `ProgressBar.TrackPartlyOffEdgeDrawsWithWrappedOrigin`
     - The bitmap widget's test is the inverted one above.
   - **Label:** `LabelScroll.TextLeftOfOriginReachesU8g2Wrapped` and the three scroll
     assertions are kept; comments now cite the ruling and `u8g2gl_coord_pos()`.
5. **H3 — measurement getters.** The stub now matches `U8g2lib.h`:
   - `getUTF8Width` and `getStrWidth` return `u8g2_uint_t`.
   - `getAscent`, `getDescent`, `getMaxCharWidth` and `getMaxCharHeight` return `int8_t`.
   - Every call site in `src/` converts explicitly: 20 sites, `static_cast<int>(…)`, with
     the label's two existing `static_cast<int16_t>(…)` kept.
   - The test configuration fields (`utf8_width_val`, `ascent_val`, …) stay `int`, cast
     inside the stub.
   - Audit: every `src/*.cpp` compiled against the real headers with `-Wconversion
     -Wsign-conversion` added produces **no diagnostics**.
6. **H6 — fresh clones.**
   - The check moved from `test/CMakeLists.txt` to the root `CMakeLists.txt`, inside
     `if(U8G2GL_BUILD_TESTS)` and **before** the googletest `FetchContent`. A fresh clone
     now fails first, and without downloading anything.
   - `U8G2GL_U8G2_DIR` is set there and reused by the test target.
   - **Proven** in a throwaway worktree at HEAD with the submodule not initialised
     (removed afterwards). Configure reported:
     ```
     CMake Error at CMakeLists.txt:77 (message):
       The U8G2 submodule is not initialised
       (.../tmp/wo4c2-h6-proof/extern/u8g2 has no cppsrc/U8g2lib.h).  The host tests
       compile the runtime against it.  Run:

         git submodule update --init extern/u8g2

       or configure with -DU8G2GL_BUILD_TESTS=OFF to build the library only.
     ```
   - The library-only advice was checked too: `-DU8G2GL_BUILD_TESTS=OFF` configures
     cleanly.
7. **H8 — no machine-local catalogue source.** `cli/test/catalogue/builder.test.ts` reads
   `extern/u8g2` only.
   - `U8G2_PATH` and the departures-board path are gone from the tests. The struct count
     is the pinned constant 205.
   - The Arduino release layout is still tested, with a **synthetic tree** built by
     `mkdtempSync` and removed in `finally`, so it runs identically everywhere.
   - `build-catalogue.ts` still honours `--u8g2-path`/`U8G2_PATH` as script options
     (unchanged, not a test path).

#### Test counts

| Suite | After first pass | After second pass |
|---|---|---|
| C++ `ctest` | 300 (1 known skip) | **301** (same skip `SizeOfReport.ThirtyTwoBitTarget`), including `RealU8g2.RuntimeCompilesAgainstRealHeaders` |
| CLI `vitest` | 602 | **602**: one machine-path test replaced by one synthetic-layout test |

- **C++ net +1:** three widget tests added, one skip-only test removed, two h/v line
  tests merged into one.
- **Builds.** Zero warnings in the reconfigured in-tree build and in a from-scratch build
  (`tmp/wo4c2-clean-build`, googletest from the existing local checkout, nothing
  fetched); both pass 301/301.
- **CLI checks.** `npx tsc --noEmit` and `npm run lint` are clean.

#### Decisions

- **E1 — Corner radius is clamped, not refused.** For `drawRFrame`/`drawRBox` in button
  and switch, 0 is a meaningful corner radius (square corners), so "radius <= 0 is
  skipped" is read as applying to a radius that *is* the shape (circle, ellipse), not a
  corner radius.
- **E2 — `u8g2gl_coord_span()` kept for partial refresh only.** Tile arguments are not
  clipped by U8G2, so wrapping them would refresh the wrong region. The ruling addresses
  draw positions; refresh is not a draw.
- **E3 — The submodule check lives in the root file**, so it precedes the googletest
  download.

#### New findings (not fixed, not filed)

- **N1 — `drawLine` is NOT wrap-safe; the ruling's evidence does not cover it.** Read in
  `extern/u8g2/csrc/u8g2_line.c`, `u8g2_DrawLine()`:
  - It says "no intersection check at the moment, should be added…".
  - It computes `dx`/`dy` by comparing `u8g2_uint_t` end points
    (`if ( x1 > x2 ) dx = x1-x2; else dx = x2-x1;`), then steps Bresenham from `x1` to `x2`.
  - With a wrapped end point, e.g. (−2, 0)→(10, 10), arriving as (65534, 0)→(10, 10),
    `dx` becomes 65524 instead of 12.
  - **Result:** the loop runs about 65,000 iterations (each through `u8g2_DrawPixel`), and
    the on-screen pixels are plotted at slope ≈ 10/65524 instead of 10/12 — a wrong,
    nearly flat line, plus a frame-time cost.
  - `u8g2gl_draw_line` and outline triangles now pass wrapped end points per the ruling.
    The first pass skipped them.
  - Filled triangles are unaffected: `u8g2_DrawTriangle` takes `int16_t`.
  - → **PA**: lines probably need their own rule, such as clipping the segment to the
    display in `u8g2gl_draw_line` before converting, or skipping. PR-06's pixel test
    should include a line with a negative end point.
- **N2 — Positions beyond 255 on an 8-bit `u8g2_uint_t` build would wrap modulo 256**
  into the visible area. Unreachable with the pinned 2.36.18, which defines `U8G2_16BIT`
  unconditionally (first-pass H4); recorded because the wrap is now the rule.
- **Still open from the first pass, unchanged by the ruling:** H5 (only the Arduino view
  is compiled against the real headers), H7 (`u8g2gl_coord.h` has no `class U8G2;`
  fallback), H9 (stale state-saver comments outside the box), and the §11.3 spec
  disagreement for the Chief Architect. H2's stub corrections stand; H3, H6 and H8 are
  closed above; H1 and S1 are closed by the ruling.

#### Changed files (`git diff --name-only 8a19acf..62dd06b`)

```
CMakeLists.txt
cli/test/catalogue/builder.test.ts
include/u8g2gl/u8g2gl_coord.h
include/u8g2gl/u8g2gl_draw.h
src/u8g2gl_button.cpp
src/u8g2gl_clock.cpp
src/u8g2gl_draw.cpp
src/u8g2gl_glyph.cpp
src/u8g2gl_label.cpp
src/u8g2gl_progress_bar.cpp
src/u8g2gl_switch.cpp
src/u8g2gl_xbm.cpp
test/CMakeLists.txt
test/stubs/U8G2lib.h
test/test_button.cpp
test/test_core.cpp
test/test_draw.cpp
test/test_label.cpp
test/test_progress_bar.cpp
test/test_switch.cpp
test/test_xbm.cpp
```

All are inside the Boundary Box. No network access this pass, and `docs/`, `PROGRAM*.md`
and the manifests are untouched. There is no version bump.
