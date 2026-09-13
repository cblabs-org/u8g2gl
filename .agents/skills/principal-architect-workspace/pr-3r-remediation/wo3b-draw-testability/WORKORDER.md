---
work_order: WO3b
project: pr-3r-remediation
title: "Complete the draw layer — test double, ellipse body, triangle outline"
branch: u8g2gl-remediation/wo3b-draw-testability
base: u8g2gl-remediation/wo3-draw-functions
complexity: standard
status: complete
---

# WO3b — Complete the draw layer

## Authorization

Part of PR-3R, approved by the human on 2026-09-13 — verify the verbatim record
in `../PROJECT.md`. **WO3b was added by the Principal Architect during execution**
to close three defects WO3 surfaced and correctly declined to fix. If the
PROJECT.md record is absent or reads as a placeholder, **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> those specified here, do not branch beyond the one named below.

## Branch

**Branch**: `u8g2gl-remediation/wo3b-draw-testability`
**Base**: `u8g2gl-remediation/wo3-draw-functions`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code.

---

## Objective

WO3 delivered eight draw functions and surfaced three problems it could not fix
inside its boundary. All three are real. Close them.

## 1. The test double is a no-op for six of eight primitives — fix this first

`test/stubs/U8G2lib.h` records calls for `drawBox`, `drawFrame`, `drawRBox` and
`drawPixel`. `drawHLine`, `drawVLine`, `drawLine`, `drawCircle`, `drawDisc` and
`drawTriangle` are empty bodies (`{}`), so the tests covering those functions can
only assert *"does not crash"* — not that the right call was issued with the right
arguments.

That is a rendering framework whose draw path is largely unverified. It is the
root cause of the other two items, so it comes first.

- [ ] Extend the six no-op members to record their calls and arguments, following
      **exactly** the pattern the existing recording members already use. Do not
      invent a second mechanism; a test double with two idioms is worse than one
      with a gap.
- [ ] Add `drawEllipse` and `drawFilledEllipse`, mirroring `drawCircle` /
      `drawDisc` including the trailing option argument.
- [ ] Strengthen the WO3 tests that could previously only assert non-crashing, so
      each of the eight functions now asserts the **call and its arguments**. This
      is the point of the work order — extending the double without strengthening
      the tests banks none of the value.

## 2. `u8g2gl_draw_ellipse` has no body

WO3 declared it in `u8g2gl_draw.h` and deliberately left it undefined, because
the test double had nothing to call. That reasoning was sound and it was right to
surface rather than guess — but the result is a **declared symbol that cannot
link**. It is invisible today only because nothing calls it, and WO4 is about to
point the ellipse manifest at it.

- [ ] Define `u8g2gl_draw_ellipse` in `src/u8g2gl_draw.cpp`, dispatching to
      `drawEllipse` / `drawFilledEllipse` exactly as `u8g2gl_draw_circle`
      dispatches to `drawCircle` / `drawDisc`.
- [ ] Remove the "deliberately not defined" note from the header and the `.cpp`
      module comment. A stale explanation of an absence that no longer exists is
      worse than no comment — it will send the next reader looking for a
      constraint that has gone.
- [ ] Guard degenerate inputs as the other seven do.

## 3. `u8g2gl_draw_triangle`'s `filled` parameter does nothing

The manifest declares `filled` (`type="bool" default="true"`), and the function
accepts it and ignores it, because U8G2 has no unfilled-triangle primitive.

A declared property that silently does nothing is the same class of defect as
`long_mode="scroll"` silently wrapping — which this PR already had to correct
once. It is worse than a missing feature, because the author has no way to know.

- [ ] Implement `filled=false` as **three `drawLine` calls** between the three
      vertices. This is not an invented algorithm — three lines between three
      points is what a triangle outline *is*. WO3 was right not to invent
      unspecified behaviour on its own authority; this work order supplies the
      authority.
- [ ] A why-comment noting U8G2 has no outline-triangle primitive, so the outline
      is composed. Otherwise a future reader replaces it with a U8G2 call that
      does not exist.

## Strict Boundary Box

**In scope:** `test/stubs/U8G2lib.h`, `include/u8g2gl/u8g2gl_draw.h`,
`src/u8g2gl_draw.cpp`, the draw-function test file, this WORKORDER.

**Do NOT touch:** the manifests (WO4 owns them), any widget, the style system,
the CLI, `docs/`. **Do not weaken any existing test** to accommodate a
strengthened double — if an existing test fails once the double records calls,
that is a real finding: stop and surface it.

---

## Testing Requirement

- [ ] Each of the eight draw functions asserts the **specific U8G2 call and its
      arguments**, not merely that it did not crash.
- [ ] `u8g2gl_draw_ellipse` links and draws — the test that would have caught the
      missing body.
- [ ] `filled=true` issues `drawTriangle`; `filled=false` issues three
      `drawLine` calls with the three expected vertex pairs.
- [ ] Degenerate inputs still do not crash, for all eight.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass, none weakened or removed
- [ ] `cd cli && npx vitest run` — all pass
- [ ] Confirm explicitly that **no symbol in `u8g2gl_draw.h` is left without a
      definition**, and say how you verified it
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file an issue. The architect triages and files.

---

## Completion Report

**Status: complete.** Human approval verified verbatim in `../PROJECT.md`
("APPROVED by the human (Matt McNeill) on 2026-09-13", plus the Status Log
entry for the same date) before starting. Branch verified as
`u8g2gl-remediation/wo3b-draw-testability` immediately before the commit, as
its own separate command.

### Files touched (all within the Strict Boundary Box)

- `test/stubs/U8G2lib.h` — instrumented the six previously no-op members and
  added `drawEllipse`/`drawFilledEllipse`
- `include/u8g2gl/u8g2gl_draw.h` — removed the stale "declared, not defined"
  note on `u8g2gl_draw_ellipse`; rewrote the `u8g2gl_draw_triangle` doc to
  describe the three-line outline
- `src/u8g2gl_draw.cpp` — defined `u8g2gl_draw_ellipse`; implemented
  `filled=false` on `u8g2gl_draw_triangle`; removed the stale module-header
  clause about the ellipse's absent body
- `test/test_draw.cpp` — strengthened every test that could previously only
  assert non-crashing; added the ellipse test group
- This WORKORDER.md

`git diff --name-only` confirms exactly these four source/test files plus this
WORKORDER — no manifest, no widget, no CLI file.

### 1. Test double — extended, not reinvented

`test/stubs/U8G2lib.h`'s existing idiom is: one `int ..._count` plus one
`last_..._<param>` field per parameter, updated on every call. I followed it
exactly for `drawHLine`, `drawVLine`, `drawCircle`, `drawDisc`, `drawTriangle`,
and the two new members `drawEllipse`/`drawFilledEllipse` (mirroring
`drawCircle`/`drawDisc` including the trailing `option` byte, per the
WORKORDER).

**One deliberate, minimal extension, called out rather than slipped in:**
`drawLine` is the only U8G2 call issued more than once by a single
`u8g2gl_draw_*` function — the triangle outline issues three. A single
`last_*` set of fields can only ever prove the *last* of the three calls, which
does not meet the Testing Requirement's "three `drawLine` calls with the three
expected vertex pairs." So `drawLine` keeps its `last_*` fields (for every
existing/simple use) *and* a small fixed-size call history
(`draw_line_x1/y1/x2/y2[4]`, indexed by call order) so a test can inspect all
three edges individually. This is the same recording idiom — a plain counter
plus captured arguments — indexed rather than single-slot, because only this
one caller needed more than one slot. It is not a second mechanism.

### 2. `u8g2gl_draw_ellipse` — defined

`src/u8g2gl_draw.cpp` now dispatches exactly as `u8g2gl_draw_circle` does:
reject `rx <= 0 || ry <= 0`, then `drawFilledEllipse`/`drawEllipse` per
`filled`, forwarding `segments` as the raw option byte. The stale "declared,
not defined" `@note` is removed from `u8g2gl_draw.h`'s declaration and from
the Exported Functions list; the stale module-header sentence in
`u8g2gl_draw.cpp` naming "u8g2gl_draw_ellipse's deliberately absent body" is
removed. Nothing else in either header block referenced the absence, so
nothing else needed touching.

### 3. `u8g2gl_draw_triangle`'s `filled=false` — three lines

Implemented exactly as specified: `filled=false` issues
`drawLine(x0,y0,x1,y1)`, `drawLine(x1,y1,x2,y2)`, `drawLine(x2,y2,x0,y0)` — one
per edge, vertex order, closing back to the first vertex. A why-comment on the
function (and an `@note` on the declaration) states that U8G2 has no
unfilled-triangle primitive, so a future reader does not go looking for a
`drawTriangleFrame` that does not exist.

### Test counts

- C++: **233 → 238 tests** (5 net new in `test_draw`: the ellipse group added
  5 tests, while every existing "does not crash" test for circle/hline/vline/
  line/triangle was strengthened in place to assert real calls and arguments
  rather than added alongside). Zero warnings under `-Wall -Wextra
  -Wpedantic`. `ctest --test-dir build`: 238/238 pass (one pre-existing,
  unrelated `SizeOfReport.ThirtyTwoBitTarget` reports Skipped, as it did
  before this work order).
- CLI: **220 tests, unchanged** — no CLI file touched, confirmed by
  `git diff --name-only`.

No existing test was weakened or removed to accommodate the strengthened
double; every strengthened test gained assertions, none lost any.

### Verification of "no symbol in `u8g2gl_draw.h` left without a definition"

Two independent checks, not just a source-level grep:

1. **Source cross-check**: extracted every `u8g2gl_draw_*` declaration from
   `include/u8g2gl/u8g2gl_draw.h` and every `u8g2gl_draw_*` definition from
   `src/u8g2gl_draw.cpp` — the same eight names appear in both lists
   (`box`, `circle`, `ellipse`, `hline`, `line`, `pixel`, `triangle`, `vline`).
2. **Binary-level check**: `nm build/libu8g2gl.a | grep u8g2gl_draw_` after a
   clean `cmake --build build` — all eight mangled symbols appear with the
   `T` (defined, text section) flag, not `U` (undefined). This is the check
   that actually matters: a declaration can compile with no definition and
   only fail at final link, so confirming the symbol is `T` in the compiled
   static library is stronger evidence than reading the source.

### Verification commands run

- `cmake --build build` — clean, zero warnings
- `ctest --test-dir build --output-on-failure` — 238/238 (1 pre-existing skip)
- `cd cli && npx vitest run` — 220/220
- `git status --short` / `git diff --name-only` — exactly the four Boundary
  Box files plus this WORKORDER

### Issue Surfacing — nothing found outside the checklist

No defects encountered outside this WORKORDER's three items while doing this
work. The `drawLine` call-history extension above is disclosed as a judgement
call on the existing idiom, not a defect found elsewhere.
