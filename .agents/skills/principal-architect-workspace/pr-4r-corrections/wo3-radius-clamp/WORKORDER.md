---
work_order: WO3
project: pr-4r-corrections
title: "Rounded-box radius: one bound, 2r <= min(w,h), at build time and at draw time"
branch: u8g2gl-4r/wo3-radius-clamp
base: u8g2gl-4r/wo2-style-overrides
complexity: standard
status: complete
---

# WO3 — the rounded-box radius bound, in both places

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR with a timestamp, and "Owner instruction — 2026-09-28 12:07
BST" quotes the owner setting the bound to `2r <= min(w,h)`. This WORKORDER's `status` must be
`dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in `.`.** **Branch**:
`u8g2gl-4r/wo3-radius-clamp` (already checked out) · **Base**: `u8g2gl-4r/wo2-style-overrides`.
Run `git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md` and
`references/documentation.md`. Zero warnings under `-Wall -Wextra -Wpedantic`. No heap. Every
runtime conversion goes through `u8g2gl_coord.h`, by what the value is. That is the house rule this
work order extends.

---

## Objective

A rounded box's corner radius obeys **one bound, `2r <= min(w, h)`**. The validator enforces it
where radius and size are literal, as a diagnostic the author can act on. The runtime clamps to it
at draw time, where the size is bound or the radius arrives through a style, so U8G2 never receives
a radius that wraps.

## The bound, and why it is this number

Measured by the PA against the pinned submodule (`extern/u8g2` @ `d66b49af`, 2.36.18). The harness
and full output are in `../evidence/rbox-bound/`. `u8g2_DrawRBox` and `u8g2_DrawRFrame` compute
the band between the corners as `ww = w - r - r` and `hh = h - r - r` in `u8g2_uint_t`
(`u8g2_box.c:121–123` and the lines after). Once `2r > w`, `ww` wraps, the following `ww >= 3`
passes, and U8G2 draws a box of the wrapped width, clipped only by the display. Across 5 sizes and
every radius:

- **every `r` with `2r <= min(w,h)` draws nothing outside the box;**
- **every `r` with `2r > min(w,h)` does**, from 70 to 1753 stray pixels.

The bound is exact in both directions. `2r = min` is a capsule (overlapping corner discs), which
is the intended look: **no warning** for it. The Chief Architect's ruling C proposed
`r <= min(w,h) - 1`. The owner replaced the number with this one on the measurement (PROJECT.md,
12:07). The rest of ruling C and all of ruling D stand.

## Line-Item Instructions

- [x] **Measure the baseline**, each suite alone. Record the counts WO2 left.
- [x] **One runtime helper** in `include/u8g2gl/u8g2gl_coord.h`, e.g.
      `u8g2gl_coord_corner_radius(int32_t r, int32_t w, int32_t h)`, returning the radius clamped to
      `[0, min(w,h)/2]` as `u8g2_uint_t`. Integer division makes `2r <= min` exact for odd sizes. Full
      Doxygen, citing the measured boundary, the `u8g2_box.c` lines, and the evidence folder. Add it
      to the header's conversion table and exports list.
- [x] **Use it at every rounded-box call site in the runtime**, each clamped against the size of
      the shape actually being drawn:
  - `u8g2gl_draw_box()` (`src/u8g2gl_draw.cpp`). Clamp **before** choosing rounded or square, so a
    radius that clamps to 0 selects `drawBox` / `drawFrame`, exactly as a literal 0 does;
  - the button: `draw_border_rframe()` and the focused-fill call in `src/u8g2gl_button.cpp`, and the
    concentric border loop (each layer against its own `bw`, `bh`);
  - the switch (`src/u8g2gl_switch.cpp`). It already clamps its track and handle radii privately to
    `w/2` and `h/2`, which is this bound. Replace the private clamps with the helper, so the bound is
    stated once. **This must not change a single call argument** (ruling D).
  Grep for `drawRBox` / `drawRFrame` across `src/` and `include/`, and list any site you find that
  is not above.
- [x] **Ruling D's pin:** a test recording the default switch's `drawRFrame` and `drawRBox`
      arguments, from the test double's call log, at several sizes including odd and even heights and
      a narrow switch (`w < h`), off and on. The expected values are **the base's**: capture them
      at `main` before your change and hard-code them. A later tightening of the bound fails this
      test at once. Say in the test's comment that this is what it is for.
- [x] **Runtime tests** through the test double's recorded arguments, extending the double in its
      established idiom if needed. Never weaken a test to fit.
  - `u8g2gl_draw_box` with a radius above half the size, filled and outline: records the clamped
    radius, and never a radius with `2r > min(w,h)`;
  - the same when the **size** is small at run time (the bound-size case), e.g. `w=6`, `r=5` → `r=3`;
  - a radius that clamps to 0 (`w=1`) issues `drawBox` / `drawFrame`;
  - a negative radius behaves as today;
  - the button with a style radius larger than its size, and with `border_width > 1`.
- [x] **Empirical confirmation, kept.** Add a C++ test that links the **pinned U8G2 C sources**
      (`extern/u8g2/csrc`), not the test double, draws `u8g2_DrawRBox` and `u8g2_DrawRFrame` into a
      full buffer (as `../evidence/rbox-bound/rbox.c` does), and asserts for a sweep of sizes (odd,
      even, non-square) that:
  - every radius the helper can return draws nothing outside the box;
  - `r = min(w,h)/2 + 1` **does** draw outside it.
  The second assertion is what makes the bound exact, so a U8G2 bump that moves the boundary fails
  here. Keep it a separate executable or target from the stub-based suite: the stub and real U8G2
  must not meet in one link. It must run under `ctest` and build with zero warnings. Compile the C
  sources with `SYSTEM` includes or per-source flags, as the existing `u8g2gl_real_u8g2` target does.
- [x] **Validator: relax WO11b's check** in `checkCornerRadius()`
      (`cli/src/core/validator/validate-geometry.ts`) from `2*(r+1) <= w` / `<= h` to
      **`2*r <= w` and `<= h`**. Rewrite its comment and the file header's step 3c to state the
      measured boundary, with the same citations as the runtime helper, so the two paths cite one
      number. The message states the new requirement.
- [x] **Tests for the validator:**
  - `r = min/2` (a capsule) is accepted, **with no diagnostic of any severity**;
  - `r = min/2 + 1` is refused;
  - an odd size, e.g. 11 → 5 accepted, 6 refused.
  **This is a deliberate behaviour change.** Existing tests that pinned the old boundary may change
  their expected verdict **only at the boundary itself**. List every such edit, before and after, in
  the Completion Report. Any other assertion change: stop and report.
- [x] **Runtime version 0.4.0 → 0.5.0**: `CMakeLists.txt` `project(... VERSION)` and
      `include/u8g2gl/u8g2gl_version.h`, which a configure-time check keeps in agreement. Update
      any test pinning the runtime version. **Schema stays 0.4. CLI version unchanged** (WO4 bumps
      it).
- [x] Goldens: the fixture's literal radii all satisfy the old, stricter check, so they should not
      move. If they do, stop and report.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_coord.h`, `u8g2gl_version.h`, `src/u8g2gl_draw.cpp`,
`src/u8g2gl_button.cpp`, `src/u8g2gl_switch.cpp`, `CMakeLists.txt` (version),
`test/CMakeLists.txt` (the real-U8G2 test target), `test/stubs/U8g2lib.h` (only if it cannot already
record what you need), `test/test_draw.cpp`, `test/test_button.cpp`, `test/test_switch.cpp`, a new
real-U8G2 test source under `test/`, `cli/src/core/validator/validate-geometry.ts`
(`checkCornerRadius` and the header only), `cli/test/` (validator radius tests), this WORKORDER.

**Do NOT touch:** `extern/u8g2`; any emission code (`cli/src/core/generator/`), which is WO4's;
`u8g2gl_obj` binding code; the circle, ellipse or any non-rounded-box path; `docs/` (the Chief
Architect writes the bound into the spec); `PROGRAM*.md`; `PROJECT.md`; the CLI version.

---

## Testing Requirement

- [x] Default-switch pin, with base-captured values
- [x] Runtime clamp tests; real-U8G2 boundary test, both directions
- [x] Validator boundary tests, capsule with zero diagnostics
- [x] New tests fail at the base (the real-U8G2 test is the exception: it tests U8G2, not us. Say so)

## Verification Requirement

- [x] CLI vitest, tsc, lint; C++ build zero warnings on a **clean configure**; ctest all pass. Each
      suite alone
- [x] `git diff --name-only u8g2gl-4r/wo2-style-overrides..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: complete.** Implementation commit `0c527f7`, on `u8g2gl-4r/wo3-radius-clamp`. Not pushed.
Authorization verified before any change: PROJECT.md "Human Approval" (owner, 08:48 BST, verbatim),
"Owner instruction — 2026-09-28 12:07 BST" (bound `2r <= min(w,h)`, verbatim), and this
WORKORDER's `status: dispatched` at `77c2b05`.

### Counts, each suite alone, C++ on a clean configure

| Suite | Base (`77c2b05`) | After `0c527f7` |
|---|---|---|
| CLI `npx vitest run` | **1079 / 64 files** | **1082 / 64 files** (+3) |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + `tsconfig.test.json`) | clean | clean |
| C++ `cmake --build` (fresh `build/` dir) | 0 warnings | 0 warnings |
| `ctest` | **362, one known skip** (`SizeOfReport.ThirtyTwoBitTarget`) | **374, one known skip** (+12) |

New C++ tests: 1 switch pin, 5 draw-box, 4 button, 2 real-U8G2. Goldens and the generated
fixture did not move (`compile-fixture` / `emit-golden` green, no fixture file touched).

### The helper

`u8g2gl_coord_corner_radius(int32_t radius, int32_t width, int32_t height) -> u8g2_uint_t` in
`include/u8g2gl/u8g2gl_coord.h`: `min(w,h) / 2` (0 if either side is `<= 0`), the radius capped to
it, then through `u8g2gl_coord_clamp()` (negative -> 0, and held to `U8G2GL_U8G2_COORD_MAX`).
Doxygen cites the measured boundary, `u8g2_box.c` lines 121–123 / 134–136 (RBox) and 183–188
(RFrame) at 2.36.18, the evidence folder, and `test/test_rbox_bound.cpp`. Added to the header's
Purpose conversion list and Exported Functions; `u8g2gl_coord_clamp()`'s doc no longer claims the
corner radius.

### Call sites (grep of `drawRBox` / `drawRFrame` over `src/` and `include/`: no others)

| Site | Clamped against |
|---|---|
| `u8g2gl_draw_box()` (`src/u8g2gl_draw.cpp`) | the box's `width`, `height` — **before** choosing square or rounded; `ur > 0` now selects the rounded primitive, so a radius clamping to 0 draws `drawBox` / `drawFrame` like a literal 0 |
| button focused fill (`src/u8g2gl_button.cpp` Step 4) | goes through `u8g2gl_draw_box()`, so the button's `w_`, `h_` |
| button `draw_border_rframe()` — single border and every concentric layer | the layer's own `w`, `h` (`bw`, `bh` in the loop); the loop's `br = radius - i` is the request |
| switch track `drawRFrame` (`src/u8g2gl_switch.cpp`) | `w_`, `h_`; replaces the private `w_/2`, `h_/2`, `< 0` clamps |
| switch handle `drawRBox` | `handle_w`, `handle_h`; request `r - 1` (0 if `r <= 1`); replaces the private clamps |

### Switch pin (ruling D) and proof its values are the base's

`Switch.DefaultCallArgumentsPinned` (`test/test_switch.cpp`) asserts, from the call log, exactly
one `drawRFrame` then one `drawRBox`, with all five arguments each, and no square fallback, for 12
sizes × off/on: 30×14, 30×15, 20×10, 21×11, 40×16, 16×9 (even and odd heights), 12×20, 9×17
(narrow, `w < h`), 4×4 (minimum), 5×5, 8×4, 6×7. Its comment says it exists to fail when the bound
is tightened.

Proof: **before any runtime edit**, `tmp/wo3/capture_switch.cpp` was linked against the base build's
`libu8g2gl.a` (`build/wo3-base`, configured from `77c2b05`, whose `src/` and `include/` are identical
to `main` @ `ca398ac` — `git diff main..HEAD -- src include test CMakeLists.txt` was empty) and
printed every rounded call; the table is that output, reformatted mechanically. The pin also passes
against the base runtime (below), and **fails** (24 assertion failures) when the helper is tightened
to `(min - 1) / 2` in a scratch copy — it does what it is for.

The helper cannot change a switch argument: `floor(min(w,h)/2) == min(floor(w/2), floor(h/2))`,
which is exactly the pair of private clamps it replaces, for the track and the handle alike.

### Real-U8G2 test

`test/test_rbox_bound.cpp`, executable `test_rbox_bound`, under `ctest`. Links a static library of
19 listed files from `extern/u8g2/csrc` (`u8g2gl_u8g2_csrc`, `-w`, `SYSTEM` include) and never
`u8g2gl` or `test/stubs`; uses only the header-only `u8g2gl_coord.h`. `u8g2_d_setup.c` is left out
(it would pull in every display driver), so the test inlines the body of
`u8g2_Setup_ssd1306_128x64_noname_f` (`u8g2_d_setup.c:294`). `enable_language(C)` is in
`test/CMakeLists.txt`; the root `project()` is untouched apart from the version.

Sweep: 14 sizes — 10×10, 11×11, 20×8, 8×20, 2×2 (the PA's five), 3×3, 7×12, 12×7, 16×16, 31×9,
9×31, 5×40, 40×5, 1×6 — drawn at (40, 20) in a 128×64 full buffer.

- `EveryRadiusTheHelperReturnsStaysInsideTheBox`: every request from −1 to `2·min + 2`, passed
  through the helper, for `u8g2_DrawRBox` and `u8g2_DrawRFrame`: **0 pixels outside** in every
  case, and a non-zero count inside (so the check is not vacuous).
- `OneMoreThanTheBoundDrawsOutsideTheBox`: asserts the helper's largest return is exactly
  `min / 2`, then draws `min / 2 + 1` with both primitives: **pixels outside in every case**.

Result: both pass. The bound is exact at every size in the sweep, including 1×6 (`r = 1` draws
outside) and 2×2. As the WORKORDER anticipates, this test tests U8G2, so it passes at the base too.

### Validator

`checkCornerRadius()` now requires `2*r <= w` and `2*r <= h`; its comment and header step 3c
state the measured boundary with the same citations as the helper. Message: "…a rounded box needs
2*radius = N <= width, or U8G2 draws outside the box (u8g2_box.c). Use radius <= floor(size/2)."
Code unchanged (`U8G2GL_OUT_OF_BOUNDS`).

New tests (`validator-hardening.test.ts`): capsules 10×10 r=5, 30×12 r=6, 8×40 r=4 produce **no
diagnostic of any severity** (`diagnostics` is `[]`); 30×12 r=7 is refused against height only;
11×11 accepts 5 (no diagnostics) and refuses 6 (both sides).

**Existing assertions changed — all at the boundary** (in the same describe block, whose title
changes from `2*(r+1)` to `2*r`):

| Test | Before | After |
|---|---|---|
| "one pixel too large for the width is refused…" | `10×20 radius="5"` refused; message contains `2*(radius+1) = 12 <= width` and `Use radius <= 4`; offending text `5` | `radius="6"`; `2*radius = 12 <= width`, `Use radius <= 5`; offending text `6` |
| "inside a template it is the template's defect…" | template box `8×8 radius="4"` (refused under the old bound) | `radius="5"` — `r = 4` is now a clean capsule, so the template needs one more to keep its defect; assertions unchanged |
| "the exact limit, radius 0, and a bound size are not refused (controls)" | `10×10 radius="4"` accepted | `radius="5"` accepted — the new exact limit. (`4` would still pass; changed so the "exact limit" control stays one) |

With only the validator change applied, exactly the first two failed and nothing else. No other
assertion was changed.

### Runtime version

`CMakeLists.txt` `project(u8g2gl VERSION 0.5.0)` and `U8G2GL_VERSION_MINOR 5`; the configure-time
agreement check and `test_version` pass. Nothing else pins the runtime version. Schema stays 0.4;
CLI version unchanged.

### New tests at the base

Built the base runtime (`77c2b05` `src/`) with the new tests (scratch copy under `tmp/wo3/`):

- **Fail at the base (7):** `DrawBoxRadiusBound.RadiusAboveHalfTheSizeIsClampedFilledAndOutline`,
  `.NoRadiusReachingU8g2ExceedsTheBound`, `.SmallRuntimeSizeClampsTheRadius`,
  `.RadiusClampingToZeroSelectsSquarePrimitive`; `ButtonRadiusBound.StyleRadiusLargerThanButtonIsClamped`,
  `.FocusedFillAndBorderAreBothClamped`, `.NestedBorderClampsEachLayerToItsOwnSize`.
- **Pass at the base, by design (5):** `Switch.DefaultCallArgumentsPinned` (its values *are* the
  base's), `DrawBoxRadiusBound.NegativeRadiusDrawsSquareCornersAsBefore` ("behaves as today"),
  `ButtonRadiusBound.RadiusInsideTheBoundIsUnchanged` (control), and both `RealU8g2RoundedBoxBound`
  tests (they test U8G2, not us).
- **Validator, with the base `validate-geometry.ts`:** 5 fail — the three new tests and the two
  boundary edits that moved (`radius="6"` message; the `radius="5"` control). The template test
  passes at both (r=5 on 8×8 is refused by either bound).

### Boundary

`git diff --name-only u8g2gl-4r/wo2-style-overrides..HEAD`: the 13 files of `0c527f7`, all in the
Boundary Box, plus `PROJECT.md` and this WORKORDER from the PA's dispatch commit `77c2b05`, plus this
report. No `extern/u8g2`, generator, `u8g2gl_obj`, circle/ellipse, `docs/`, or CLI-version change.

### Findings (not fixed, not filed)

1. **Stale public doc, `include/u8g2gl/u8g2gl_draw.h`** (outside the Boundary Box):
   `u8g2gl_draw_box()`'s `@param radius` says "`<= 0` draws square corners" and the `@brief` says
   "`radius > 0` selects the rounded variants"; both are now incomplete — the radius is clamped to
   `min(w,h)/2` first, and a radius clamping to 0 (a 1-pixel side) draws square. The header's
   Coordinates table also omits the corner-radius row. Suggest WO5.
2. **For the Chief Architect, on ruling D's wording:** "the default r = h/2 is inside the bound for
   any h >= 2" holds only when `h <= w`. A narrow switch (`w < h`) has always been clamped to `w/2`
   by the private clamps — the helper does the same, and the pin covers 12×20 and 9×17 — so nothing
   changed, but the spec text should not repeat the unconditional form.
3. **Style radii are only checked at draw time.** The validator judges only a literal `radius` on a
   manifest whose radius, width and height are all `draw=` props (the box). A `style_radius` /
   `<style radius>` on a button or switch is never checked at build time; the runtime clamp now
   makes it safe, but silently. Whether a build-time warning is wanted is a design question.
4. **Box manifest help** (`include/u8g2gl/manifests/u8g2gl_box.xml`, `radius`: "Corner radius in
   pixels") does not mention the bound; minor, for whoever writes the bound into the spec.
