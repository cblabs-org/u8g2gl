---
work_order: WO3
project: pr-3r-remediation
title: "u8g2gl_draw_* free functions"
branch: u8g2gl-remediation/wo3-draw-functions
base: wo2-label-long-mode
complexity: standard
status: pending
---

# WO3 — u8g2gl_draw_* free functions

## Authorization

Part of PR-3R (pr-3r-remediation). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — not a relayed claim, the
owner's own words with a timestamp. If it is absent or reads as a placeholder,
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-remediation/wo3-draw-functions`
**Base**: `u8g2gl-remediation/wo2b-scroll-semantics`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit. A check that
runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. Documentation carries
equal weight to the code rules: file headers with SPDX and a real `Purpose:`,
Doxygen on public declarations, `// --- Step N: ---` breakdowns, and why-comments
where a decision is not obvious from the code.

## Design authority

`docs/design_spec.md` is normative. The decisions driving this work order are
[D-18], [D-19], [D-20] and [D-21] — full records under `docs/decisions/`. Where
this work order and the spec disagree, **stop and report**; do not pick one.

---

## Objective

Add the eight `u8g2gl_draw_*` free functions that [D-18] makes primitives compile
to, so WO4's manifests have real symbols to name.

## Background

[D-18] removes the Tier 1 / Tier 2 split. A primitive that needs no object
compiles to draw calls, and those calls are **free functions in the runtime, not
classes** (design_spec §6). They are shared by the firmware and editor targets,
which is why they are functions rather than static methods on a class that no
longer exists.

This is new work rather than a correction, and it is in this PR only because WO4
points eight manifests at these symbols and `manifest-crosstest.test.ts` verifies
manifests against real C++ declarations. Excluding them would leave the
cross-test red for the length of the PR.

## Line-Item Instructions

- [ ] Add `u8g2gl_draw_box`, `_circle`, `_ellipse`, `_hline`, `_line`, `_pixel`,
      `_triangle`, `_vline` — one per existing primitive manifest.
- [ ] Signatures take the `U8G2` reference plus the primitive's own geometry and
      style inputs. Derive each from what the corresponding manifest currently
      declares; do not invent parameters no manifest asks for.
- [ ] Keep them in one header/source pair (`u8g2gl_draw.h` / `u8g2gl_draw.cpp`)
      with a module header explaining *why* these are free functions and not
      classes, citing [D-18]. A future reader will otherwise "tidy" them into a
      class and reintroduce the tier split.
- [ ] No heap allocation, no stored `std::function`, explicit enum base types.
      The non-negotiables in the standards apply here as everywhere.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_draw.h`, `src/u8g2gl_draw.cpp`, a new test
file, `CMakeLists.txt`, `test/CMakeLists.txt`, this WORKORDER.

**Do NOT touch:** the manifests — that is WO4. Any existing widget. The CLI.

---

## Testing Requirement

- [ ] A test per function, asserting it issues the expected U8G2 calls. If the
      test double for `U8G2` does not yet support this, say so in your Completion
      Report rather than weakening the test to fit.
- [ ] Degenerate inputs (zero width, zero height, inverted coordinates) do not
      crash — these run inside the render loop, where a bad value is a reboot.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass, none weakened or removed
- [ ] `cd cli && npx vitest run` — all pass
- [ ] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it, do not file an issue. The architect triages.

---

## Completion Report

**Status: 7 of 8 functions fully implemented and tested; `u8g2gl_draw_ellipse`
declared but deliberately not defined — see below. Human approval verified in
`../PROJECT.md` before starting. Branch verified as
`u8g2gl-remediation/wo3-draw-functions` immediately before the commit.**

### Files touched (all within the Strict Boundary Box)

- `include/u8g2gl/u8g2gl_draw.h` (new)
- `src/u8g2gl_draw.cpp` (new)
- `test/test_draw.cpp` (new)
- `CMakeLists.txt` — added `src/u8g2gl_draw.cpp` to the `u8g2gl` library sources
- `test/CMakeLists.txt` — added the `test_draw` executable
- This WORKORDER.md

`git diff --name-only` / `git status --short` confirm nothing else changed —
no manifest, no existing widget, no CLI file.

### The eight signatures, and what each was derived from

All geometry is `int16_t`, matching the convention already used throughout
`u8g2gl_obj.h` (`set_coords`, `get_x/y/w/h`, etc.) — the manifests type these
props as `int` with no width given, so I matched the house convention rather
than introducing a second integer width for geometry.

1. `void u8g2gl_draw_box(U8G2&, int16_t x, int16_t y, int16_t width, int16_t height, bool filled = true, int16_t radius = 0)`
   — from `u8g2gl_box.xml`'s `x/y/width/height/filled/radius` props. `filled`
   and `radius` together select among U8G2's `drawBox`/`drawFrame`/`drawRBox`/
   `drawRFrame` (all four are real, already-instrumented stub methods) even
   though the manifest's `setter=` attribute only names `drawBox`/`drawRBox` —
   the outline pair is the natural, non-invented reading of a `filled` prop
   that must do something observable.
2. `void u8g2gl_draw_circle(U8G2&, int16_t x, int16_t y, int16_t radius, bool filled = false, u8g2gl_draw_segment_t segments = U8G2GL_DRAW_SEGMENT_ALL)`
   — from `u8g2gl_circle.xml`. `filled` selects `drawCircle`/`drawDisc`;
   `segments` is a new local enum (`u8g2gl_draw_segment_t`) whose five values
   mirror the manifest's `all,upper_left,upper_right,lower_left,lower_right`
   and whose numeric values are U8G2's own `U8G2_DRAW_*` option bits
   (0x01/0x02/0x04/0x08/0x0F) — load-bearing, not arbitrary, since the value is
   forwarded byte-for-byte as U8G2's `option` parameter.
3. `void u8g2gl_draw_ellipse(U8G2&, int16_t x, int16_t y, int16_t rx, int16_t ry, bool filled = false, u8g2gl_draw_segment_t segments = U8G2GL_DRAW_SEGMENT_ALL)`
   — from `u8g2gl_ellipse.xml`. **Declared only, not defined** — see "Surfaced,
   not fixed" below.
4. `void u8g2gl_draw_hline(U8G2&, int16_t x, int16_t y, int16_t width)` — from
   `u8g2gl_hline.xml`'s `x/y/width`.
5. `void u8g2gl_draw_line(U8G2&, int16_t x1, int16_t y1, int16_t x2, int16_t y2)`
   — from `u8g2gl_line.xml`'s `x1/y1/x2/y2`.
6. `void u8g2gl_draw_pixel(U8G2&, int16_t x, int16_t y)` — from
   `u8g2gl_pixel.xml`'s `x/y`.
7. `void u8g2gl_draw_triangle(U8G2&, int16_t x0, int16_t y0, int16_t x1, int16_t y1, int16_t x2, int16_t y2, bool filled = true)`
   — from `u8g2gl_triangle.xml`'s six vertex coordinates plus `filled`. `filled`
   is accepted but currently has no effect — see "Surfaced, not fixed" below.
8. `void u8g2gl_draw_vline(U8G2&, int16_t x, int16_t y, int16_t height)` — from
   `u8g2gl_vline.xml`'s `x/y/height`.

Free functions throughout, per [D-18] — the module header on
`u8g2gl_draw.h` explains why in detail (a class here would reintroduce the
tier split the decision removed) and is written for the next reader who might
"tidy" them, as the WORKORDER anticipated.

Degenerate inputs: `box`/`hline`/`vline` reject `<= 0` width/height/radius
before touching U8G2 (guarded, tested); `circle` rejects `<= 0` radius;
`line`/`pixel`/`triangle` have no degenerate case to guard — a zero-length
line, a point, and a zero-area triangle are all normal input U8G2 handles
without special-casing (the triangle case is covered by
`DrawTriangle.DegenerateZeroAreaDoesNotCrash`). No heap allocation, no stored
`std::function`, explicit `uint8_t` base on the new enum.

### Test counts

- C++: **210 → 233 tests** (23 new, all in `test_draw`), zero warnings under
  `-Wall -Wextra -Wpedantic`, clean build.
- CLI: **220 tests**, unchanged — no CLI file touched.
- `npx tsc --noEmit` and `npm run lint`: zero errors (irrelevant to this WO's
  files, run anyway per the Verification Requirement).

### Test double insufficiency — surfaced per the WORKORDER's own instruction

`test/stubs/U8G2lib.h` — the single authoritative U8G2 test double — only
instruments `drawBox`/`drawFrame`/`drawRBox`/`drawRFrame`/`drawPixel` with call
counters and captured arguments. `drawHLine`, `drawVLine`, `drawLine`,
`drawCircle`, `drawDisc` and `drawTriangle` exist there as unconditional
no-ops. For those six, `test_draw.cpp` can only assert "does not crash" — not
that the correct U8G2 call, with the correct arguments, was actually issued.
I did not weaken any assertion to fake coverage; the tests say in their own
comments exactly what they can and cannot verify, and the file header explains
why. Extending the stub's instrumentation for these six is outside this WO's
boundary box (`test/stubs/U8G2lib.h` is not in the Strict Boundary Box's
in-scope list) — the architect should decide whether to fold that into WO4 or
give it its own order.

### Not implemented — `u8g2gl_draw_ellipse` — outside boundary to fix

`test/stubs/U8G2lib.h` has no `drawEllipse` or `drawFilledEllipse` member at
all — not even as a no-op, unlike every other primitive this WO needed. Since
`src/u8g2gl_draw.cpp` compiles into the shared `u8g2gl` static library target,
which is built against that same stub on host/CI builds, a definition that
calls either method would compile correctly for real firmware but break the
whole host test build — there is no way to define it correctly without either
extending the stub (outside the Strict Boundary Box: not in the "in scope"
list, and precedent in this PR — see PROJECT.md's "PA repair — the stack was
left red" — is that the PA applies out-of-boundary fixes, not the worker) or
shipping a silently-wrong implementation (which the WORKORDER explicitly told
me not to do: "say so ... rather than weakening the tests to fit").

I declared `u8g2gl_draw_ellipse` in `u8g2gl_draw.h` with full Doxygen
(including an `@note` explaining exactly this) so WO4 has a real symbol name
to point `u8g2gl_ellipse.xml` at, but left it undefined in the `.cpp`. Nothing
calls it yet, so there is no link error — only a reserved name. **This needs
architect action before WO4 (or a real firmware build) can use it**: add
`drawEllipse`/`drawFilledEllipse` to `test/stubs/U8G2lib.h`, mirroring the
existing `drawCircle`/`drawDisc` no-op entries exactly
(`void drawEllipse(int, int, int, int, uint8_t = 0x0F) {}` and the filled
equivalent), after which `u8g2gl_draw_ellipse`'s body is a two-line dispatch
identical in shape to `u8g2gl_draw_circle`'s. I did not make this change
myself, and did not file an issue — surfacing it here per the WORKORDER.

### Surfaced, not fixed — `u8g2gl_draw_triangle`'s `filled` has no effect

U8G2 has no unfilled-triangle primitive; `drawTriangle` is always filled. The
manifest declares `filled` (default `true`) with `setter="drawTriangle"`, but
there is no `drawFrame`-style outline counterpart to dispatch to. I accepted
the parameter (manifest parity, and the WORKORDER says derive signatures from
the manifest) but the implementation silently ignores it rather than inventing
an unspecified outline algorithm (e.g. three `drawLine` calls) that no manifest
or design_spec section asks for. This is a real behavioural gap: `filled=false`
today still draws a filled triangle. Architect should decide whether WO4 drops
the `filled` prop from `u8g2gl_triangle.xml`, or a future decision specifies an
outline algorithm.

### Nothing else found outside the checklist

No other defects encountered while reading the manifests or the existing
`u8g2gl_obj`/style code during this work.
