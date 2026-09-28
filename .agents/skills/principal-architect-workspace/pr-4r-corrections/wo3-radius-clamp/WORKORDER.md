---
work_order: WO3
project: pr-4r-corrections
title: "Rounded-box radius: one bound, 2r <= min(w,h), at build time and at draw time"
branch: u8g2gl-4r/wo3-radius-clamp
base: u8g2gl-4r/wo2-style-overrides
complexity: standard
status: dispatched
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

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r`.** **Branch**:
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

- [ ] **Measure the baseline**, each suite alone. Record the counts WO2 left.
- [ ] **One runtime helper** in `include/u8g2gl/u8g2gl_coord.h`, e.g.
      `u8g2gl_coord_corner_radius(int32_t r, int32_t w, int32_t h)`, returning the radius clamped to
      `[0, min(w,h)/2]` as `u8g2_uint_t`. Integer division makes `2r <= min` exact for odd sizes. Full
      Doxygen, citing the measured boundary, the `u8g2_box.c` lines, and the evidence folder. Add it
      to the header's conversion table and exports list.
- [ ] **Use it at every rounded-box call site in the runtime**, each clamped against the size of
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
- [ ] **Ruling D's pin:** a test recording the default switch's `drawRFrame` and `drawRBox`
      arguments, from the test double's call log, at several sizes including odd and even heights and
      a narrow switch (`w < h`), off and on. The expected values are **the base's**: capture them
      at `main` before your change and hard-code them. A later tightening of the bound fails this
      test at once. Say in the test's comment that this is what it is for.
- [ ] **Runtime tests** through the test double's recorded arguments, extending the double in its
      established idiom if needed. Never weaken a test to fit.
  - `u8g2gl_draw_box` with a radius above half the size, filled and outline: records the clamped
    radius, and never a radius with `2r > min(w,h)`;
  - the same when the **size** is small at run time (the bound-size case), e.g. `w=6`, `r=5` → `r=3`;
  - a radius that clamps to 0 (`w=1`) issues `drawBox` / `drawFrame`;
  - a negative radius behaves as today;
  - the button with a style radius larger than its size, and with `border_width > 1`.
- [ ] **Empirical confirmation, kept.** Add a C++ test that links the **pinned U8G2 C sources**
      (`extern/u8g2/csrc`), not the test double, draws `u8g2_DrawRBox` and `u8g2_DrawRFrame` into a
      full buffer (as `../evidence/rbox-bound/rbox.c` does), and asserts for a sweep of sizes (odd,
      even, non-square) that:
  - every radius the helper can return draws nothing outside the box;
  - `r = min(w,h)/2 + 1` **does** draw outside it.
  The second assertion is what makes the bound exact, so a U8G2 bump that moves the boundary fails
  here. Keep it a separate executable or target from the stub-based suite: the stub and real U8G2
  must not meet in one link. It must run under `ctest` and build with zero warnings. Compile the C
  sources with `SYSTEM` includes or per-source flags, as the existing `u8g2gl_real_u8g2` target does.
- [ ] **Validator: relax WO11b's check** in `checkCornerRadius()`
      (`cli/src/core/validator/validate-geometry.ts`) from `2*(r+1) <= w` / `<= h` to
      **`2*r <= w` and `<= h`**. Rewrite its comment and the file header's step 3c to state the
      measured boundary, with the same citations as the runtime helper, so the two paths cite one
      number. The message states the new requirement.
- [ ] **Tests for the validator:**
  - `r = min/2` (a capsule) is accepted, **with no diagnostic of any severity**;
  - `r = min/2 + 1` is refused;
  - an odd size, e.g. 11 → 5 accepted, 6 refused.
  **This is a deliberate behaviour change.** Existing tests that pinned the old boundary may change
  their expected verdict **only at the boundary itself**. List every such edit, before and after, in
  the Completion Report. Any other assertion change: stop and report.
- [ ] **Runtime version 0.4.0 → 0.5.0**: `CMakeLists.txt` `project(... VERSION)` and
      `include/u8g2gl/u8g2gl_version.h`, which a configure-time check keeps in agreement. Update
      any test pinning the runtime version. **Schema stays 0.4. CLI version unchanged** (WO4 bumps
      it).
- [ ] Goldens: the fixture's literal radii all satisfy the old, stricter check, so they should not
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

- [ ] Default-switch pin, with base-captured values
- [ ] Runtime clamp tests; real-U8G2 boundary test, both directions
- [ ] Validator boundary tests, capsule with zero diagnostics
- [ ] New tests fail at the base (the real-U8G2 test is the exception: it tests U8G2, not us. Say so)

## Verification Requirement

- [ ] CLI vitest, tsc, lint; C++ build zero warnings on a **clean configure**; ctest all pass. Each
      suite alone
- [ ] `git diff --name-only u8g2gl-4r/wo2-style-overrides..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*(Worker fills this in: status; counts; the helper; every call site and how each was clamped; the
switch pin and proof its values are the base's; the real-U8G2 test, its sweep, and its result;
validator edits at the boundary, before and after; base failures; boundary; findings.)*
