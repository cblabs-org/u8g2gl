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
**Base**: `u8g2gl-remediation/wo2-label-long-mode`

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

<!-- Written by the worker at task completion -->
