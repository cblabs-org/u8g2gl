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

- [ ] **Submodule.** `git submodule add https://github.com/olikraus/u8g2.git extern/u8g2`,
      check out tag **`2.36.18`**, and commit the gitlink. `.gitmodules` already exists —
      add to it, do not replace it. Record the pinned commit SHA in the Completion Report.
- [ ] **Real-header acceptance target.** A host CMake target that compiles the runtime
      (`src/*.cpp`) against **U8G2's real headers from `extern/u8g2`**, not the stub. It is
      compile-only if linking needs hardware. Real `U8g2lib.h` includes Arduino headers:
      supply the **minimum Arduino platform shim** (e.g. `Arduino.h`, `Print.h`) under
      `test/real_u8g2/`, and nothing that re-declares any U8G2 API — the point is that
      U8G2's own declarations are the ones compiled against. Mark U8G2's include path
      `SYSTEM` so third-party warnings do not count against zero-warnings; **our** code must
      still compile with zero warnings under `-Wall -Wextra -Wpedantic`. Register it so
      `ctest` (or the normal build) fails if it fails.
- [ ] **Prove the target catches the defects.** In a throwaway worktree under `tmp/`,
      confirm the target **fails** on this branch's base code (`getFont`) before your fix,
      and say what it reported. Remove the worktree.
- [ ] **Font via the real API.** `u8g2gl_state_saver` reads the font through
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
- [ ] **Clip clamped at both corners.** `u8g2gl_apply_clip` clamps the near corner at 0
      (as today) and the far corner to the display, with explicit conversions.
- [ ] **F1 comment.** In `u8g2gl_apply_clip`, replace the "not verified by a pixel test"
      note with the source citation: `u8g2.h:352/354` document `clip_x1`/`clip_y1` as
      "(excluded)", and `u8g2_clip_intersection2` agrees (U8G2 2.36.18, now pinned at
      `extern/u8g2`). Note that PR-06's container-edge pixel test now **guards** the
      convention rather than discovering it.
- [ ] **Degenerate-input tests that can fail.** Element partly off the left edge (x = −5)
      and partly off the top: against the retyped stub, assert no recorded coordinate is a
      wrapped value (≥ 32768). At least one such test must fail against the base code, and
      the report says which.
- [ ] **`THIRD-PARTY-NOTICES.md`** at the repository root with a U8G2 row: the code is
      **BSD-2-Clause**; the fonts are licensed **per font group** (U8G2 wiki page
      "fntgrp"). State both, the pinned version, and that the submodule is used for host
      tests and the catalogue build, while applications get U8G2 through their own
      dependency (PR-05).
- [ ] **Catalogue builder uses the submodule and records its source (closes Q-11).**
      `cli/src/node/build-catalogue.ts` defaults `--u8g2-path` to `extern/u8g2`, and the
      build records the U8G2 commit (and tag) it was built from. Record it **without
      changing the `CATALOGUE` export's shape** (e.g. a sibling metadata file or a
      metadata field the loader ignores) — say which and why. Rebuild the catalogue from the
      submodule; if the regenerated data differs from what is committed, explain the
      difference rather than committing it silently.

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

- [ ] The real-header target builds on the finished branch and demonstrably failed on the
      base.
- [ ] No `getFont` anywhere in `include/`, `src/` or the stub.
- [ ] Negative-origin tests assert no wrapped coordinate reaches the stub; at least one
      fails at the base.
- [ ] Clip clamped at both corners, pinned by a test.
- [ ] Catalogue build from `extern/u8g2` records its source commit.

## Verification Requirement

- [ ] `git submodule status` shows `extern/u8g2` at the 2.36.18 commit
- [ ] `cmake -S . -B build && cmake --build build` — zero warnings in our code
- [ ] `ctest --test-dir build` — all pass (baseline 284, one known skip), including the
      real-header target
- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (baseline 596)
- [ ] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file. Expect the
real-header target to expose more than `getFont`; anything outside the box is a finding.

---

## Completion Report

*To be filled in by the worker.*
