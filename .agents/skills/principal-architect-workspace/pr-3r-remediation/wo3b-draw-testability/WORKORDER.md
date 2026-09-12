---
work_order: WO3b
project: pr-3r-remediation
title: "Complete the draw layer — test double, ellipse body, triangle outline"
branch: u8g2gl-remediation/wo3b-draw-testability
base: u8g2gl-remediation/wo3-draw-functions
complexity: standard
status: pending
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

<!-- Written by the worker at task completion -->
